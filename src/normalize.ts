import { validationErrorFromZodIssues } from './errors.js';
import { sourceDocumentSchema, yamlMarkdownDocumentSchema } from './schema.js';
import type { BlockNode, InlineNode, ListItemNode, YamlMarkdownDocument } from './types.js';
import type { SourceRange } from './errors.js';

type MutableRecord = Record<string, unknown>;

const shorthandHeadings = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;
type DocumentPath = readonly (string | number)[];

interface NormalizationContext {
  readonly origins: Map<string, DocumentPath>;
}

export function normalizeDocument(input: unknown): YamlMarkdownDocument {
  return normalizeDocumentWithSourceLocations(input);
}

export function normalizeDocumentWithSourceLocations(
  input: unknown,
  locate?: (path: DocumentPath) => SourceRange | undefined
): YamlMarkdownDocument {
  const sourceResult = sourceDocumentSchema.safeParse(input);
  if (!sourceResult.success) {
    throw validationErrorFromZodIssues(sourceResult.error.issues, locate);
  }

  const context: NormalizationContext = { origins: new Map() };
  const normalized = normalizeDocumentShape(sourceResult.data, context);
  const result = yamlMarkdownDocumentSchema.safeParse(normalized);

  if (!result.success) {
    throw validationErrorFromZodIssues(result.error.issues, (path) => locate?.(resolveOrigin(context, path)));
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
    if (!hasOnlyKey(input, headingKey)) {
      return input;
    }

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
    if (!hasOnlyKey(input, 'p')) {
      return input;
    }

    recordOrigin(context, [...normalizedPath, 'type'], [...sourcePath, 'p']);
    recordOrigin(context, [...normalizedPath, 'text'], [...sourcePath, 'p']);
    return {
      type: 'paragraph',
      text: input.p
    };
  }

  if (Object.hasOwn(input, 'markdown')) {
    if (!hasOnlyKey(input, 'markdown')) {
      return input;
    }

    recordOrigin(context, [...normalizedPath, 'type'], [...sourcePath, 'markdown']);
    recordOrigin(context, [...normalizedPath, 'value'], [...sourcePath, 'markdown']);
    return {
      type: 'markdown',
      value: input.markdown
    };
  }

  if (Object.hasOwn(input, 'ul')) {
    if (!hasOnlyKey(input, 'ul')) {
      return input;
    }

    recordOrigin(context, [...normalizedPath, 'items'], [...sourcePath, 'ul']);
    return {
      type: 'list',
      ordered: false,
      items: normalizeListItems(input.ul, context, [...normalizedPath, 'items'], [...sourcePath, 'ul'])
    };
  }

  if (Object.hasOwn(input, 'ol')) {
    if (!hasOnlyKey(input, 'ol')) {
      return input;
    }

    recordOrigin(context, [...normalizedPath, 'items'], [...sourcePath, 'ol']);
    return {
      type: 'list',
      ordered: true,
      items: normalizeListItems(input.ol, context, [...normalizedPath, 'items'], [...sourcePath, 'ol'])
    };
  }

  if (Object.hasOwn(input, 'code')) {
    if (!hasOnlyKey(input, 'code')) {
      return input;
    }

    return normalizeCodeShorthand(input.code, context, normalizedPath, [...sourcePath, 'code']);
  }

  if (Object.hasOwn(input, 'quote')) {
    if (!hasOnlyKey(input, 'quote')) {
      return input;
    }

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
    if (!hasOnlyKey(input, 'hr')) {
      return input;
    }

    return {
      type: 'thematicBreak'
    };
  }

  if (Object.hasOwn(input, 'html')) {
    if (!hasOnlyKey(input, 'html')) {
      return input;
    }

    recordOrigin(context, [...normalizedPath, 'type'], [...sourcePath, 'html']);
    recordOrigin(context, [...normalizedPath, 'value'], [...sourcePath, 'html']);
    return {
      type: 'html',
      value: input.html
    };
  }

  if (Object.hasOwn(input, 'table')) {
    if (!hasOnlyKey(input, 'table')) {
      return input;
    }

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
    case 'heading':
    case 'paragraph':
      if (Array.isArray(input.children)) {
        return {
          ...input,
          children: input.children.map((child) => normalizeInline(child))
        };
      }
      return input;
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

function normalizeInline(input: unknown): unknown {
  if (!isRecord(input)) {
    return input;
  }

  if (Array.isArray(input.children)) {
    return {
      ...input,
      children: input.children.map((child) => normalizeInline(child))
    } satisfies InlineNode | MutableRecord;
  }

  return input;
}

function isRecord(input: unknown): input is MutableRecord {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function hasOnlyKey(input: MutableRecord, key: string): boolean {
  const keys = Object.keys(input);
  return keys.length === 1 && keys[0] === key;
}

function recordOrigin(context: NormalizationContext, normalizedPath: DocumentPath, sourcePath: DocumentPath): void {
  context.origins.set(JSON.stringify(normalizedPath), sourcePath);
}

function resolveOrigin(context: NormalizationContext, path: DocumentPath): DocumentPath {
  for (let length = path.length; length >= 0; length -= 1) {
    const candidate = path.slice(0, length);
    const origin = context.origins.get(JSON.stringify(candidate));
    if (origin !== undefined) {
      return [...origin, ...path.slice(length)];
    }
  }

  return path;
}
