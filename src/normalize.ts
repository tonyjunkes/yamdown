import { formatPath, YamdownValidationError, validationErrorFromZodIssues } from './errors.js';
import { sourceDocumentSchema, yamdownDocumentSchema } from './schema.js';
import type { BlockNode, ListItemNode, YamdownDocument } from './types.js';
import type { SourceRange } from './errors.js';

type MutableRecord = Record<string, unknown>;

const shorthandHeadings = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;
type DocumentPath = readonly (string | number)[];

interface NormalizationContext {
  readonly origins: Map<string, DocumentPath>;
}

export function normalizeDocument(input: unknown): YamdownDocument {
  return normalizeDocumentWithSourceLocations(input);
}

export function normalizeDocumentWithSourceLocations(
  input: unknown,
  locate?: (path: DocumentPath) => SourceRange | undefined
): YamdownDocument {
  assertAcyclic(input, locate);

  const sourceResult = sourceDocumentSchema.safeParse(input);
  if (!sourceResult.success) {
    throw validationErrorFromZodIssues(sourceResult.error.issues, locate);
  }

  const context: NormalizationContext = { origins: new Map() };
  const normalized = normalizeDocumentShape(sourceResult.data, context);
  const result = yamdownDocumentSchema.safeParse(normalized);

  if (!result.success) {
    throw validationErrorFromZodIssues(result.error.issues, (path) => locate?.(resolveOrigin(context.origins, path)));
  }

  return result.data;
}

function normalizeDocumentShape(input: unknown, context: NormalizationContext): unknown {
  if (!isRecord(input)) {
    return input;
  }

  const blocks = Array.isArray(input.blocks)
    ? input.blocks.map((block, index) => normalizeBlock(block, context, ['blocks', index], ['blocks', index]))
    : input.blocks;

  return {
    ...input,
    blocks
  };
}

function normalizeBlock(
  input: unknown,
  context: NormalizationContext,
  normalizedPath: DocumentPath,
  sourcePath: DocumentPath
): unknown {
  if (!isRecord(input)) {
    return input;
  }

  recordOrigin(context, normalizedPath, sourcePath);

  const headingKey = shorthandHeadings.find((key) => Object.hasOwn(input, key));
  if (headingKey !== undefined) {
    recordOrigin(context, [...normalizedPath, 'type'], [...sourcePath, headingKey]);
    recordOrigin(context, [...normalizedPath, 'depth'], [...sourcePath, headingKey]);
    recordOrigin(context, [...normalizedPath, 'text'], [...sourcePath, headingKey]);
    return {
      type: 'heading',
      depth: Number(headingKey.slice(1)),
      text: input[headingKey]
    };
  }

  if (Object.hasOwn(input, 'p')) {
    recordOrigin(context, [...normalizedPath, 'type'], [...sourcePath, 'p']);
    recordOrigin(context, [...normalizedPath, 'text'], [...sourcePath, 'p']);
    return {
      type: 'paragraph',
      text: input.p
    };
  }

  if (Object.hasOwn(input, 'markdown')) {
    recordOrigin(context, [...normalizedPath, 'type'], [...sourcePath, 'markdown']);
    recordOrigin(context, [...normalizedPath, 'value'], [...sourcePath, 'markdown']);
    return {
      type: 'markdown',
      value: input.markdown
    };
  }

  if (Object.hasOwn(input, 'ul')) {
    recordOrigin(context, [...normalizedPath, 'items'], [...sourcePath, 'ul']);
    return {
      type: 'list',
      ordered: false,
      items: normalizeListItems(input.ul, context, [...normalizedPath, 'items'], [...sourcePath, 'ul'])
    };
  }

  if (Object.hasOwn(input, 'ol')) {
    recordOrigin(context, [...normalizedPath, 'items'], [...sourcePath, 'ol']);
    return {
      type: 'list',
      ordered: true,
      items: normalizeListItems(input.ol, context, [...normalizedPath, 'items'], [...sourcePath, 'ol'])
    };
  }

  if (Object.hasOwn(input, 'code')) {
    return normalizeCodeShorthand(input.code, context, normalizedPath, [...sourcePath, 'code']);
  }

  if (Object.hasOwn(input, 'quote')) {
    recordOrigin(context, [...normalizedPath, 'blocks'], [...sourcePath, 'quote']);
    return {
      type: 'blockquote',
      blocks: Array.isArray(input.quote)
        ? input.quote.map((block, index) =>
            normalizeBlock(block, context, [...normalizedPath, 'blocks', index], [...sourcePath, 'quote', index])
          )
        : input.quote
    };
  }

  if (Object.hasOwn(input, 'hr')) {
    return {
      type: 'thematicBreak'
    };
  }

  if (Object.hasOwn(input, 'html')) {
    recordOrigin(context, [...normalizedPath, 'type'], [...sourcePath, 'html']);
    recordOrigin(context, [...normalizedPath, 'value'], [...sourcePath, 'html']);
    return {
      type: 'html',
      value: input.html
    };
  }

  if (Object.hasOwn(input, 'table')) {
    recordOrigin(context, [...normalizedPath, 'type'], [...sourcePath, 'table']);
    recordOrigin(context, [...normalizedPath, 'columns'], [...sourcePath, 'table', 'columns']);
    recordOrigin(context, [...normalizedPath, 'rows'], [...sourcePath, 'table', 'rows']);
    return isRecord(input.table)
      ? {
          type: 'table',
          ...input.table
        }
      : input;
  }

  if (typeof input.type !== 'string') {
    return input;
  }

  return normalizeVerboseBlock(input, context, normalizedPath, sourcePath);
}

function normalizeVerboseBlock(
  input: MutableRecord,
  context: NormalizationContext,
  normalizedPath: DocumentPath,
  sourcePath: DocumentPath
): unknown {
  switch (input.type) {
    case 'annotatedBlock':
      recordOrigin(context, [...normalizedPath, 'block'], [...sourcePath, 'block']);
      return {
        ...input,
        block: normalizeBlock(input.block, context, [...normalizedPath, 'block'], [...sourcePath, 'block'])
      };
    case 'annotatedRegion':
      recordOrigin(context, [...normalizedPath, 'blocks'], [...sourcePath, 'blocks']);
      return {
        ...input,
        blocks: Array.isArray(input.blocks)
          ? input.blocks.map((block, index) =>
              normalizeBlock(block, context, [...normalizedPath, 'blocks', index], [...sourcePath, 'blocks', index])
            )
          : input.blocks
      };
    case 'list':
      return {
        ...input,
        items: normalizeListItems(input.items, context, [...normalizedPath, 'items'], [...sourcePath, 'items'])
      };
    case 'blockquote':
      return {
        ...input,
        blocks: Array.isArray(input.blocks)
          ? input.blocks.map((block, index) =>
              normalizeBlock(block, context, [...normalizedPath, 'blocks', index], [...sourcePath, 'blocks', index])
            )
          : input.blocks
      };
    case 'footnoteDefinition':
      return {
        ...input,
        blocks: Array.isArray(input.blocks)
          ? input.blocks.map((block, index) =>
              normalizeBlock(block, context, [...normalizedPath, 'blocks', index], [...sourcePath, 'blocks', index])
            )
          : input.blocks
      };
    default:
      return input;
  }
}

function normalizeCodeShorthand(
  input: unknown,
  context: NormalizationContext,
  normalizedPath: DocumentPath,
  sourcePath: DocumentPath
): unknown {
  if (isRecord(input)) {
    recordOrigin(context, [...normalizedPath, 'value'], [...sourcePath, 'value']);
    recordOrigin(context, [...normalizedPath, 'lang'], [...sourcePath, 'lang']);
    recordOrigin(context, [...normalizedPath, 'meta'], [...sourcePath, 'meta']);
    return {
      type: 'code',
      ...input
    };
  }

  recordOrigin(context, [...normalizedPath, 'value'], sourcePath);
  return {
    type: 'code',
    value: input
  };
}

function normalizeListItems(
  input: unknown,
  context: NormalizationContext,
  normalizedPath: DocumentPath,
  sourcePath: DocumentPath
): unknown {
  if (!Array.isArray(input)) {
    return input;
  }

  return input.map((item, index) =>
    normalizeListItem(item, context, [...normalizedPath, index], [...sourcePath, index])
  );
}

function normalizeListItem(
  item: unknown,
  context: NormalizationContext,
  normalizedPath: DocumentPath,
  sourcePath: DocumentPath
): unknown {
  recordOrigin(context, normalizedPath, sourcePath);
  if (typeof item === 'string') {
    recordOrigin(context, [...normalizedPath, 'blocks', 0, 'text'], sourcePath);
    return {
      blocks: [
        {
          type: 'paragraph',
          text: item
        } satisfies BlockNode
      ]
    } satisfies ListItemNode;
  }

  if (Array.isArray(item)) {
    return {
      blocks: item.map((block, index) =>
        normalizeBlock(block, context, [...normalizedPath, 'blocks', index], [...sourcePath, index])
      )
    };
  }

  if (isRecord(item) && Array.isArray(item.blocks)) {
    return {
      ...item,
      blocks: item.blocks.map((block, index) =>
        normalizeBlock(block, context, [...normalizedPath, 'blocks', index], [...sourcePath, 'blocks', index])
      )
    };
  }

  return item;
}

function isRecord(input: unknown): input is MutableRecord {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function recordOrigin(context: NormalizationContext, normalizedPath: DocumentPath, sourcePath: DocumentPath): void {
  context.origins.set(JSON.stringify(normalizedPath), sourcePath);
}

export function resolveOrigin(origins: ReadonlyMap<string, DocumentPath>, path: DocumentPath): DocumentPath {
  for (let length = path.length; length >= 0; length -= 1) {
    const candidate = path.slice(0, length);
    const origin = origins.get(JSON.stringify(candidate));
    if (origin !== undefined) {
      return [...origin, ...path.slice(length)];
    }
  }

  return path;
}

function assertAcyclic(input: unknown, locate?: (path: DocumentPath) => SourceRange | undefined): void {
  const ancestors = new WeakSet();

  const visit = (value: unknown, path: DocumentPath): void => {
    if (typeof value !== 'object' || value === null) {
      return;
    }

    if (ancestors.has(value)) {
      const location = locate?.(path);
      throw new YamdownValidationError(
        `Invalid Yamdown document at ${formatPath(path)}: Cyclic input is not supported`,
        [
          {
            code: 'custom',
            location,
            message: 'Cyclic input is not supported',
            path
          }
        ]
      );
    }

    ancestors.add(value);
    if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) {
        visit(item, [...path, index]);
      }
    } else if (isRecord(value)) {
      for (const key of Object.keys(value)) {
        visit(value[key], [...path, key]);
      }
    }
    ancestors.delete(value);
  };

  visit(input, []);
}
