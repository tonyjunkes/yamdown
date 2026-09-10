import { z } from 'zod';
import type {
  AnnotatedBlockNode,
  AnnotatedRegionNode,
  AnnotatedSpanInline,
  AnnotationData,
  AnnotationMetadata,
  BlockNode,
  CodeNode,
  DocumentNode,
  InlineNode,
  ListItemNode,
  ParagraphNode,
  RenderableBlockNode,
  TableInlineCell,
  YamdownDescriptor,
  YamdownDocument
} from './types.js';

const maximumOrderedListMarker = 999_999_999;

const frontmatterSchema = z.record(z.string(), z.unknown());
export const yamdownDescriptorSchema: z.ZodType<YamdownDescriptor> = z
  .object({
    v: z.literal(1),
    profile: z.literal('base')
  })
  .strict();
const elementFields = {
  name: z
    .string()
    .regex(
      /^[A-Za-z][A-Za-z0-9-]*$/u,
      'Element names must start with an ASCII letter and contain only letters, digits, and hyphens'
    ),
  attrs: z
    .unknown()
    .superRefine((value, context) => {
      // Zod strips this key before record key/value validation can see it.
      if (typeof value === 'object' && value !== null && Object.hasOwn(value, '__proto__')) {
        context.addIssue({ code: 'custom', message: 'Reserved element attribute name', path: ['__proto__'] });
      }
    })
    .pipe(
      z.record(
        z.string().regex(/^(?!__proto__$)[A-Za-z_][A-Za-z0-9_.-]*$/u, 'Invalid element attribute name'),
        z.union([z.string(), z.number(), z.boolean()])
      )
    )
    .optional()
};
const depthSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]);
const tableAlignmentSchema = z.union([z.literal('left'), z.literal('center'), z.literal('right')]);
const identifierSchema = z
  .string()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/u,
    'Identifier must contain only ASCII letters, digits, underscores, and hyphens'
  );
const annotationIdentifierSchema = z
  .string()
  .refine((value) => value.trim().length > 0, 'Annotation identifier must not be empty or whitespace-only');
const annotationKindSchema = z
  .string()
  .refine((value) => value.trim().length > 0, 'Annotation kind must not be empty or whitespace-only');
const annotationDataSchema: z.ZodType<AnnotationData> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().refine(Number.isFinite, 'Annotation data numbers must be finite'),
    z.boolean(),
    z.null(),
    z.array(annotationDataSchema),
    z.record(z.string(), annotationDataSchema)
  ])
);
const annotationMetadataShape = {
  id: annotationIdentifierSchema,
  kind: annotationKindSchema.optional(),
  data: annotationDataSchema.optional()
};
export const annotationMetadataSchema: z.ZodType<AnnotationMetadata> = z.object(annotationMetadataShape).strict();
const codeLanguageSchema = z
  .string()
  .min(1, 'Code language must not be empty')
  .regex(/^\S+$/u, 'Code language must not contain whitespace');
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

export const annotatedSpanInlineSchema: z.ZodType<AnnotatedSpanInline> = z.lazy(() =>
  z
    .object({
      type: z.literal('annotatedSpan'),
      ...annotationMetadataShape,
      children: z.array(inlineNodeSchema).min(1, 'Annotated spans must contain at least one inline node')
    })
    .strict()
);

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
      .strict(),
    annotatedSpanInlineSchema
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
    return;
  }

  if ((Array.isArray(value) || isRecord(value)) && !isJsonTableValue(value)) {
    context.addIssue({
      code: 'custom',
      message: 'Table array and object cells must contain only finite JSON-serializable values'
    });
    return;
  }

  if (typeof value === 'number' && !Number.isFinite(value)) {
    context.addIssue({
      code: 'custom',
      message: 'Table number cells must be finite'
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
    .superRefine(addTaskItemIssues)
);

const renderableBlockNodeSchema: z.ZodType<RenderableBlockNode> = z.lazy(() =>
  z.union([
    z.object({ type: z.literal('element'), ...elementFields, blocks: z.array(blockNodeSchema) }).strict(),
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
      .strict()
      .superRefine(addListIssues),
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

export const annotatedBlockNodeSchema: z.ZodType<AnnotatedBlockNode> = z.lazy(() =>
  z
    .object({
      type: z.literal('annotatedBlock'),
      ...annotationMetadataShape,
      block: renderableBlockNodeSchema
    })
    .strict()
);

export const annotatedRegionNodeSchema: z.ZodType<AnnotatedRegionNode> = z.lazy(() =>
  z
    .object({
      type: z.literal('annotatedRegion'),
      ...annotationMetadataShape,
      blocks: z.array(blockNodeSchema).min(1, 'Annotated regions must contain at least one block')
    })
    .strict()
);

export const blockNodeSchema: z.ZodType<BlockNode> = z.lazy(() =>
  z.union([renderableBlockNodeSchema, annotatedBlockNodeSchema, annotatedRegionNodeSchema])
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
    yamdown: yamdownDescriptorSchema.optional(),
    frontmatter: frontmatterSchema.optional(),
    blocks: z.array(documentNodeSchema)
  })
  .strict()
  .superRefine(addDocumentIntegrityIssues);

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
      .superRefine(addSourceTaskItemIssues)
  ])
);

const sourceRenderableBlockNodeSchema: z.ZodType = z.lazy(() =>
  z.union([
    z.object({ type: z.literal('element'), ...elementFields, blocks: z.array(sourceBlockNodeSchema) }).strict(),
    z.object({ element: z.object({ ...elementFields, blocks: z.array(sourceBlockNodeSchema) }).strict() }).strict(),
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
      .strict()
      .superRefine(addListIssues),
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

const sourceBlockNodeSchema: z.ZodType = z.lazy(() =>
  z.union([
    sourceRenderableBlockNodeSchema,
    z
      .object({
        type: z.literal('annotatedBlock'),
        ...annotationMetadataShape,
        block: sourceRenderableBlockNodeSchema
      })
      .strict(),
    z
      .object({
        type: z.literal('annotatedRegion'),
        ...annotationMetadataShape,
        blocks: z.array(sourceBlockNodeSchema).min(1, 'Annotated regions must contain at least one block')
      })
      .strict()
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
    yamdown: yamdownDescriptorSchema.optional(),
    frontmatter: frontmatterSchema.optional(),
    blocks: z.array(sourceDocumentNodeSchema)
  })
  .strict();

interface ReferenceUse {
  readonly identifier: string;
  readonly kind: 'definition' | 'footnote';
  readonly path: readonly (string | number)[];
}

function addDocumentIntegrityIssues(document: YamdownDocument, context: z.RefinementCtx): void {
  addReferenceIntegrityIssues(document, context);
  addAnnotationIntegrityIssues(document, context);
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

function addAnnotationIntegrityIssues(document: YamdownDocument, context: z.RefinementCtx): void {
  const annotations = new Map<string, readonly (string | number)[]>();

  const register = (annotation: AnnotationMetadata, path: readonly (string | number)[]): void => {
    const previous = annotations.get(annotation.id);
    if (previous !== undefined) {
      context.addIssue({
        code: 'custom',
        message: `Duplicate annotation identifier: ${annotation.id}`,
        path: [...path, 'id']
      });
      return;
    }

    annotations.set(annotation.id, path);
  };

  for (const [index, node] of document.blocks.entries()) {
    const path = ['blocks', index] as const;
    if (node.type === 'footnoteDefinition') {
      walkBlocksForAnnotations(node.blocks, [...path, 'blocks'], register);
    } else if (node.type !== 'definition') {
      walkBlockForAnnotations(node, path, register);
    }
  }

  if (annotations.size > 0 && document.yamdown === undefined) {
    context.addIssue({
      code: 'custom',
      message: 'Yamdown annotations require a yamdown descriptor',
      path: ['yamdown']
    });
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
    case 'annotatedBlock':
      walkBlockForReferences(block.block, [...path, 'block'], references);
      return;
    case 'annotatedRegion':
      walkBlocksForReferences(block.blocks, [...path, 'blocks'], references);
      return;
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
    case 'element':
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

function walkBlocksForAnnotations(
  blocks: readonly BlockNode[],
  path: readonly (string | number)[],
  register: (annotation: AnnotationMetadata, path: readonly (string | number)[]) => void
): void {
  for (const [index, block] of blocks.entries()) {
    walkBlockForAnnotations(block, [...path, index], register);
  }
}

function walkBlockForAnnotations(
  block: BlockNode,
  path: readonly (string | number)[],
  register: (annotation: AnnotationMetadata, path: readonly (string | number)[]) => void
): void {
  switch (block.type) {
    case 'annotatedBlock':
      register(block, path);
      walkBlockForAnnotations(block.block, [...path, 'block'], register);
      return;
    case 'annotatedRegion':
      register(block, path);
      walkBlocksForAnnotations(block.blocks, [...path, 'blocks'], register);
      return;
    case 'heading':
    case 'paragraph':
      if ('children' in block) {
        walkInlineForAnnotations(block.children, [...path, 'children'], register);
      }
      return;
    case 'list':
      for (const [index, item] of block.items.entries()) {
        walkBlocksForAnnotations(item.blocks, [...path, 'items', index, 'blocks'], register);
      }
      return;
    case 'blockquote':
    case 'element':
      walkBlocksForAnnotations(block.blocks, [...path, 'blocks'], register);
      return;
    case 'table':
      for (const [rowIndex, row] of block.rows.entries()) {
        for (const [key, value] of Object.entries(row)) {
          if (isTableInlineCell(value)) {
            walkInlineForAnnotations(value.children, [...path, 'rows', rowIndex, key, 'children'], register);
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

function walkInlineForAnnotations(
  nodes: readonly InlineNode[],
  path: readonly (string | number)[],
  register: (annotation: AnnotationMetadata, path: readonly (string | number)[]) => void
): void {
  for (const [index, node] of nodes.entries()) {
    const nodePath = [...path, index];
    if (node.type === 'annotatedSpan') {
      register(node, nodePath);
    }

    if ('children' in node) {
      walkInlineForAnnotations(node.children, [...nodePath, 'children'], register);
    }
  }
}

function addTaskItemIssues(item: ListItemNode, context: z.RefinementCtx): void {
  if (item.checked === undefined || isRenderableTaskParagraph(item.blocks[0])) {
    return;
  }

  context.addIssue({
    code: 'custom',
    message: 'Checked list items must begin with a renderable paragraph block',
    path: ['blocks', 0]
  });
}

function addSourceTaskItemIssues(item: unknown, context: z.RefinementCtx): void {
  if (!isRecord(item) || item.checked === undefined || isSourceRenderableTaskParagraph(item.blocks)) {
    return;
  }

  context.addIssue({
    code: 'custom',
    message: 'Checked list items must begin with a renderable paragraph block',
    path: ['blocks', 0]
  });
}

function addListIssues(
  list: { readonly ordered: boolean; readonly start?: number; readonly items: readonly unknown[] },
  context: z.RefinementCtx
): void {
  if (!list.ordered && list.start !== undefined) {
    context.addIssue({
      code: 'custom',
      message: 'Unordered lists must not define a start value',
      path: ['start']
    });
  }

  if (!list.ordered) {
    return;
  }

  const start = list.start ?? 1;
  if (start + Math.max(0, list.items.length - 1) > maximumOrderedListMarker) {
    context.addIssue({
      code: 'custom',
      message: `Ordered list markers must not exceed ${maximumOrderedListMarker}`,
      path: list.start === undefined ? ['items'] : ['start']
    });
  }
}

function isRenderableTaskParagraph(block: BlockNode | undefined): boolean {
  if (block?.type !== 'paragraph') {
    return false;
  }

  return 'text' in block ? block.text.length > 0 : block.children.length > 0;
}

function isSourceRenderableTaskParagraph(blocks: unknown): boolean {
  if (!isUnknownArray(blocks)) {
    return false;
  }

  const first = blocks[0];
  if (!isRecord(first)) {
    return false;
  }

  if (typeof first.p === 'string') {
    return first.p.length > 0;
  }

  if (first.type !== 'paragraph') {
    return false;
  }

  return typeof first.text === 'string'
    ? first.text.length > 0
    : Array.isArray(first.children) && first.children.length > 0;
}

function isTableInlineCell(value: unknown): value is TableInlineCell {
  return isRecord(value) && value.type === 'inline' && Array.isArray(value.children);
}

function isJsonTableValue(value: unknown, ancestors = new WeakSet()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      return false;
    }

    ancestors.add(value);
    const valid = value.every((entry) => isJsonTableValue(entry, ancestors));
    ancestors.delete(value);
    return valid;
  }

  if (!isRecord(value)) {
    return false;
  }

  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return false;
  }

  if (ancestors.has(value)) {
    return false;
  }

  ancestors.add(value);
  const valid = Object.keys(value).every((key) => isJsonTableValue(value[key], ancestors));
  ancestors.delete(value);
  return valid;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
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
  }
}
