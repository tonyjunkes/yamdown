export {
  YamdownError,
  YamdownRenderError,
  YamdownValidationError,
  YamdownYamlParseError,
  type SourcePosition,
  type SourceRange,
  type ValidationIssue
} from './errors.js';
export { documentToMdast } from './document-mdast.js';
export {
  parseMarkdownDocument,
  parseMarkdownRoot,
  renderMarkdownDocument,
  serializeMarkdownDocument
} from './markdown-document.js';
// oxlint-disable-next-line typescript/no-deprecated -- Retain the documented 0.x compatibility export.
export { toMdast } from './mdast.js';
export { normalizeDocument } from './normalize.js';
// oxlint-disable-next-line typescript/no-deprecated -- Retain the documented 0.x compatibility export.
export { renderMarkdown } from './facade.js';
export { renderBlock, renderDocument, renderInline } from './render.js';
export { parseYamlDocument, renderYamlMarkdown } from './yaml.js';
export {
  annotatedBlockNodeSchema,
  annotatedRegionNodeSchema,
  annotatedSpanInlineSchema,
  annotationMetadataSchema,
  blockNodeSchema,
  documentNodeSchema,
  inlineNodeSchema,
  listItemSchema,
  sourceDocumentSchema as yamdownSourceDocumentSchema,
  tableInlineCellSchema,
  yamdownDescriptorSchema,
  yamdownDocumentSchema
} from './schema.js';
export type {
  AnnotatedBlockNode,
  AnnotatedRegionNode,
  AnnotatedSpanInline,
  AnnotationData,
  AnnotationDataArray,
  AnnotationDataObject,
  AnnotationMetadata,
  BlockNode,
  BlockquoteNode,
  BreakInline,
  CodeNode,
  DefinitionNode,
  DeleteInline,
  DocumentNode,
  ElementNode,
  EmphasisInline,
  FootnoteDefinitionNode,
  FootnoteReferenceInline,
  HeadingNode,
  HtmlNode,
  ImageInline,
  ImageReferenceInline,
  InlineCodeInline,
  InlineNode,
  LinkInline,
  LinkReferenceInline,
  ListItemNode,
  ListNode,
  MarkdownNode,
  ParagraphNode,
  RenderOptions,
  RenderableBlockNode,
  StrongInline,
  TableAlignment,
  TableColumn,
  TableInlineCell,
  TableNode,
  TextInline,
  ThematicBreakNode,
  YamdownDescriptor,
  YamdownDocument
} from './types.js';
export type {
  YamdownJsonValue,
  YamdownMarkdownAnnotation,
  YamdownMarkdownAnnotationMarker,
  YamdownMarkdownAnnotationMetadata,
  YamdownMarkdownAnnotationScope,
  YamdownMarkdownDocument,
  YamdownMarkdownDocumentAnnotation,
  YamdownMarkdownNodeAnnotation,
  YamdownMarkdownRegionAnnotation,
  YamdownMarkdownSpanAnnotation
} from './markdown-document.js';
