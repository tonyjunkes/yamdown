import { z } from 'zod';
import type {
  BlockNode,
  CodeNode,
  DocumentNode,
  InlineNode,
  ListItemNode,
  ParagraphNode,
  TableInlineCell,
  YamdownDocument
} from './types.js';

const frontmatterSchema = z.record(z.string(), z.unknown());
const depthSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]);
const tableAlignmentSchema = z.union([z.literal('left'), z.literal('center'), z.literal('right')]);
const identifierSchema = z
  .string()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/u,
    'Identifier must contain only ASCII letters, digits, underscores, and hyphens'
  );
const codeLanguageSchema = z.string().regex(/^[^\r\n]*$/u, 'Code language must be a single line');
const codeInfoPartSchema = z.string().regex(/^[^\r\n]*$/u, 'Code metadata must be a single-line string');
const codeMetaSchema = codeInfoPartSchema
  .refine((value) => value.trim() === value, 'Code metadata must not have leading or trailing whitespace')
  .refine((value) => value.length > 0, 'Code metadata must not be empty');

const tableColumnSchema = z
  .object({
    key: z.string(),
    label: z.string(),
    align: tableAlignmentSchema.nullable().optional()
  })
  .strict();

const codeSchema: z.ZodType<CodeNode> = z
  .object({
    type: z.literal('code'),
    lang: codeLanguageSchema.optional(),
    meta: codeMetaSchema.optional(),
    value: z.string()
  })
  .strict()
  .superRefine(addCodeMetadataIssues);

export const inlineNodeSchema: z.ZodType<InlineNode> = z.lazy(() =>
  z.union([
    z
      .object({
        type: z.literal('text'),
        value: z.string()
      })
      .strict(),
    z
      .object({
        type: z.literal('emphasis'),
        children: z.array(inlineNodeSchema)
      })
      .strict(),
    z
      .object({
        type: z.literal('strong'),
        children: z.array(inlineNodeSchema)
      })
      .strict(),
    z
      .object({
        type: z.literal('delete'),
        children: z.array(inlineNodeSchema)
      })
      .strict(),
    z
      .object({
        type: z.literal('inlineCode'),
        value: z.string()
      })
      .strict(),
    z
      .object({
        type: z.literal('link'),
        url: z.string(),
        title: z.string().optional(),
        children: z.array(inlineNodeSchema)
      })
      .strict(),
    z
      .object({
        type: z.literal('linkReference'),
        identifier: identifierSchema,
        children: z.array(inlineNodeSchema)
      })
      .strict(),
    z
      .object({
        type: z.literal('image'),
        url: z.string(),
        alt: z.string().optional(),
        title: z.string().optional()
      })
      .strict(),
    z
      .object({
        type: z.literal('imageReference'),
        identifier: identifierSchema,
        alt: z.string().optional()
      })
      .strict(),
    z
      .object({
        type: z.literal('footnoteReference'),
        identifier: identifierSchema
      })
      .strict(),
    z
      .object({
        type: z.literal('break')
      })
      .strict()
  ])
);

export const tableInlineCellSchema: z.ZodType<TableInlineCell> = z
  .object({
    type: z.literal('inline'),
    children: z.array(inlineNodeSchema)
  })
  .strict();

const legacyTableCellValueSchema = z.unknown().superRefine((value, context) => {
  if (isRecord(value) && value.type === 'inline') {
    context.addIssue({
      code: 'custom',
      message: 'Inline table cells must contain only type and valid inline children'
    });
  }
});

const tableCellValueSchema = z.union([tableInlineCellSchema, legacyTableCellValueSchema]);
const tableRowsSchema = z.array(z.record(z.string(), tableCellValueSchema));
const tableBodySchema = z
  .object({
    columns: z.array(tableColumnSchema).min(1, 'Tables must define at least one column'),
    rows: tableRowsSchema
  })
  .strict();

const paragraphSchema: z.ZodType<ParagraphNode> = z.union([
  z
    .object({
      type: z.literal('paragraph'),
      text: z.string()
    })
    .strict(),
  z
    .object({
      type: z.literal('paragraph'),
      children: z.array(inlineNodeSchema)
    })
    .strict()
]);

const markdownSchema = z
  .object({
    type: z.literal('markdown'),
    value: z.string()
  })
  .strict();

const headingSchema = z.union([
  z
    .object({
      type: z.literal('heading'),
      depth: depthSchema,
      text: z.string()
    })
    .strict(),
  z
    .object({
      type: z.literal('heading'),
      depth: depthSchema,
      children: z.array(inlineNodeSchema)
    })
    .strict()
]);

const thematicBreakSchema = z
  .object({
    type: z.literal('thematicBreak')
  })
  .strict();

const tableSchema = tableBodySchema.extend({ type: z.literal('table') }).strict();

const htmlSchema = z
  .object({
    type: z.literal('html'),
    value: z.string()
  })
  .strict();

export const listItemSchema: z.ZodType<ListItemNode> = z.lazy(() =>
  z
    .object({
      checked: z.boolean().optional(),
      blocks: z.array(blockNodeSchema)
    })
    .strict()
);

export const blockNodeSchema: z.ZodType<BlockNode> = z.lazy(() =>
  z.union([
    headingSchema,
    paragraphSchema,
    markdownSchema,
    z
      .object({
        type: z.literal('list'),
        ordered: z.boolean(),
        start: z.number().int().positive().optional(),
        items: z.array(listItemSchema)
      })
      .strict(),
    codeSchema,
    z
      .object({
        type: z.literal('blockquote'),
        blocks: z.array(blockNodeSchema)
      })
      .strict(),
    thematicBreakSchema,
    tableSchema,
    htmlSchema
  ])
);

export const documentNodeSchema: z.ZodType<DocumentNode> = z.lazy(() =>
  z.union([
    blockNodeSchema,
    z
      .object({
        type: z.literal('definition'),
        identifier: identifierSchema,
        url: z.string(),
        title: z.string().optional()
      })
      .strict(),
    z
      .object({
        type: z.literal('footnoteDefinition'),
        identifier: identifierSchema,
        blocks: z.array(blockNodeSchema).min(1, 'Footnote definitions must contain at least one block')
      })
      .strict()
  ])
);

export const yamdownDocumentSchema: z.ZodType<YamdownDocument> = z
  .object({
    frontmatter: frontmatterSchema.optional(),
    blocks: z.array(documentNodeSchema)
  })
  .strict()
  .superRefine(addReferenceIntegrityIssues);

const sourceListItemSchema: z.ZodType = z.lazy(() =>
  z.union([
    z.string(),
    z.array(sourceBlockNodeSchema),
    z
      .object({
        checked: z.boolean().optional(),
        blocks: z.array(sourceBlockNodeSchema)
      })
      .strict()
  ])
);

const sourceBlockNodeSchema: z.ZodType = z.lazy(() =>
  z.union([
    headingSchema,
    paragraphSchema,
    markdownSchema,
    z
      .object({
        type: z.literal('list'),
        ordered: z.boolean(),
        start: z.number().int().positive().optional(),
        items: z.array(sourceListItemSchema)
      })
      .strict(),
    codeSchema,
    z
      .object({
        type: z.literal('blockquote'),
        blocks: z.array(sourceBlockNodeSchema)
      })
      .strict(),
    thematicBreakSchema,
    tableSchema,
    htmlSchema,
    ...shorthandHeadings.map((key) => z.object({ [key]: z.string() }).strict()),
    z.object({ p: z.string() }).strict(),
    z.object({ markdown: z.string() }).strict(),
    z.object({ ul: z.array(sourceListItemSchema) }).strict(),
    z.object({ ol: z.array(sourceListItemSchema) }).strict(),
    z
      .object({
        code: z.union([
          z.string(),
          z
            .object({
              lang: codeLanguageSchema.optional(),
              meta: codeMetaSchema.optional(),
              value: z.string()
            })
            .strict()
            .superRefine(addCodeMetadataIssues)
        ])
      })
      .strict(),
    z.object({ quote: z.array(sourceBlockNodeSchema) }).strict(),
    z.object({ hr: z.literal(true) }).strict(),
    z.object({ table: tableBodySchema }).strict(),
    z.object({ html: z.string() }).strict()
  ])
);

const sourceDocumentNodeSchema: z.ZodType = z.lazy(() =>
  z.union([
    sourceBlockNodeSchema,
    z
      .object({
        type: z.literal('definition'),
        identifier: identifierSchema,
        url: z.string(),
        title: z.string().optional()
      })
      .strict(),
    z
      .object({
        type: z.literal('footnoteDefinition'),
        identifier: identifierSchema,
        blocks: z.array(sourceBlockNodeSchema).min(1, 'Footnote definitions must contain at least one block')
      })
      .strict()
  ])
);

const shorthandHeadings = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;

export const sourceDocumentSchema: z.ZodType = z
  .object({
    frontmatter: frontmatterSchema.optional(),
    blocks: z.array(sourceDocumentNodeSchema)
  })
  .strict();

interface ReferenceUse {
  readonly identifier: string;
  readonly kind: 'definition' | 'footnote';
  readonly path: readonly (string | number)[];
}

function addReferenceIntegrityIssues(document: YamdownDocument, context: z.RefinementCtx): void {
  const definitions = new Map<string, number>();
  const footnotes = new Map<string, number>();
  const references: ReferenceUse[] = [];

  for (const [index, node] of document.blocks.entries()) {
    const path = ['blocks', index] as const;
    if (node.type === 'definition' || node.type === 'footnoteDefinition') {
      const collection = node.type === 'definition' ? definitions : footnotes;
      const normalizedIdentifier = node.identifier.toLowerCase();
      if (collection.has(normalizedIdentifier)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate ${node.type === 'definition' ? 'definition' : 'footnote'} identifier: ${node.identifier}`,
          path: [...path, 'identifier']
        });
      } else {
        collection.set(normalizedIdentifier, index);
      }

      if (node.type === 'footnoteDefinition') {
        walkBlocksForReferences(node.blocks, [...path, 'blocks'], references);
      }
      continue;
    }

    walkBlockForReferences(node, path, references);
  }

  for (const reference of references) {
    const collection = reference.kind === 'definition' ? definitions : footnotes;
    if (!collection.has(reference.identifier.toLowerCase())) {
      context.addIssue({
        code: 'custom',
        message: `Unresolved ${reference.kind === 'definition' ? 'definition' : 'footnote'} reference: ${reference.identifier}`,
        path: [...reference.path, 'identifier']
      });
    }
  }
}

function walkBlocksForReferences(
  blocks: readonly BlockNode[],
  path: readonly (string | number)[],
  references: ReferenceUse[]
): void {
  for (const [index, block] of blocks.entries()) {
    walkBlockForReferences(block, [...path, index], references);
  }
}

function walkBlockForReferences(
  block: BlockNode,
  path: readonly (string | number)[],
  references: ReferenceUse[]
): void {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
      if ('children' in block) {
        walkInlineForReferences(block.children, [...path, 'children'], references);
      }
      return;
    case 'list':
      for (const [index, item] of block.items.entries()) {
        walkBlocksForReferences(item.blocks, [...path, 'items', index, 'blocks'], references);
      }
      return;
    case 'blockquote':
      walkBlocksForReferences(block.blocks, [...path, 'blocks'], references);
      return;
    case 'table':
      for (const [rowIndex, row] of block.rows.entries()) {
        for (const [key, value] of Object.entries(row)) {
          if (isTableInlineCell(value)) {
            walkInlineForReferences(value.children, [...path, 'rows', rowIndex, key, 'children'], references);
          }
        }
      }
      return;
    case 'code':
    case 'html':
    case 'markdown':
    case 'thematicBreak':
      return;
  }

  return unreachable(block);
}

function walkInlineForReferences(
  nodes: readonly InlineNode[],
  path: readonly (string | number)[],
  references: ReferenceUse[]
): void {
  for (const [index, node] of nodes.entries()) {
    const nodePath = [...path, index];
    if (node.type === 'linkReference' || node.type === 'imageReference') {
      references.push({ identifier: node.identifier, kind: 'definition', path: nodePath });
    } else if (node.type === 'footnoteReference') {
      references.push({ identifier: node.identifier, kind: 'footnote', path: nodePath });
    }

    if ('children' in node) {
      walkInlineForReferences(node.children, [...nodePath, 'children'], references);
    }
  }
}

function isTableInlineCell(value: unknown): value is TableInlineCell {
  return isRecord(value) && value.type === 'inline' && Array.isArray(value.children);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unreachable(value: never): never {
  throw new TypeError(`Unexpected block type: ${String(value)}`);
}

function addCodeMetadataIssues(
  node: { readonly lang?: string; readonly meta?: string },
  context: z.RefinementCtx
): void {
  if (node.meta === undefined) {
    return;
  }

  if (node.lang === undefined || node.lang.length === 0) {
    context.addIssue({
      code: 'custom',
      message: 'Code metadata requires a language identifier',
      path: ['meta']
    });
    return;
  }

  if (/\s/u.test(node.lang)) {
    context.addIssue({
      code: 'custom',
      message: 'Code language must not contain whitespace when metadata is set',
      path: ['lang']
    });
  }
}
