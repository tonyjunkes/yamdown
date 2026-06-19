import { z } from 'zod';
import type { BlockNode, InlineNode, ListItemNode, ParagraphNode, YamlMarkdownDocument } from './types.js';

const frontmatterSchema = z.record(z.string(), z.unknown());
const depthSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]);

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
      blocks: z.array(blockNodeSchema)
    })
    .strict()
);

export const blockNodeSchema: z.ZodType<BlockNode> = z.lazy(() =>
  z.union([
    headingSchema,
    paragraphSchema,
    z
      .object({
        type: z.literal('list'),
        ordered: z.boolean(),
        start: z.number().int().positive().optional(),
        items: z.array(listItemSchema)
      })
      .strict(),
    z
      .object({
        type: z.literal('code'),
        lang: z
          .string()
          .regex(/^[^\r\n]*$/u, 'Code language must be a single line')
          .optional(),
        value: z.string()
      })
      .strict(),
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
        columns: z.array(
          z
            .object({
              key: z.string(),
              label: z.string()
            })
            .strict()
        ),
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
