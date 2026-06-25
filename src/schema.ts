import { z } from 'zod';
import type { BlockNode, CodeNode, InlineNode, ListItemNode, ParagraphNode, YamlMarkdownDocument } from './types.js';

const frontmatterSchema = z.record(z.string(), z.unknown());
const depthSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]);
const tableAlignmentSchema = z.union([z.literal('left'), z.literal('center'), z.literal('right')]);
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
        type: z.literal('image'),
        url: z.string(),
        alt: z.string().optional(),
        title: z.string().optional()
      })
      .strict(),
    z
      .object({
        type: z.literal('break')
      })
      .strict()
  ])
);

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
    z
      .object({
        type: z.literal('thematicBreak')
      })
      .strict(),
    z
      .object({
        type: z.literal('table'),
        columns: z.array(tableColumnSchema),
        rows: z.array(z.record(z.string(), z.unknown()))
      })
      .strict(),
    z
      .object({
        type: z.literal('html'),
        value: z.string()
      })
      .strict()
  ])
);

export const yamlMarkdownDocumentSchema: z.ZodType<YamlMarkdownDocument> = z
  .object({
    frontmatter: frontmatterSchema.optional(),
    blocks: z.array(blockNodeSchema)
  })
  .strict();

const tableBodySchema = z
  .object({
    columns: z.array(tableColumnSchema),
    rows: z.array(z.record(z.string(), z.unknown()))
  })
  .strict();

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
    z
      .object({
        type: z.literal('thematicBreak')
      })
      .strict(),
    tableBodySchema.extend({ type: z.literal('table') }).strict(),
    z
      .object({
        type: z.literal('html'),
        value: z.string()
      })
      .strict(),
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

const shorthandHeadings = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;

export const sourceDocumentSchema: z.ZodType = z
  .object({
    frontmatter: frontmatterSchema.optional(),
    blocks: z.array(sourceBlockNodeSchema)
  })
  .strict();

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
