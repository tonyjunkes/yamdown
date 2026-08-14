export interface YamdownDocument {
  /**
   * Opts the document into the Yamdown Markdown annotation profile when it is
   * rendered from YAML. Documents without this descriptor remain ordinary
   * YAML-to-Markdown documents.
   */
  readonly yamdown?: YamdownDescriptor;
  readonly frontmatter?: Readonly<Record<string, unknown>>;
  readonly blocks: readonly DocumentNode[];
}

export interface YamdownDescriptor {
  readonly v: 1;
  readonly profile: 'base';
}

/** JSON values accepted as portable annotation metadata. */
export type AnnotationData = null | boolean | number | string | AnnotationDataArray | AnnotationDataObject;

export interface AnnotationDataArray extends ReadonlyArray<AnnotationData> {}

export interface AnnotationDataObject {
  readonly [key: string]: AnnotationData;
}

export interface AnnotationMetadata {
  /** A document-wide unique, author-provided annotation identifier. */
  readonly id: string;
  /** Optional profile-defined semantic kind. */
  readonly kind?: string;
  /** Optional profile-defined JSON metadata. */
  readonly data?: AnnotationData;
}

export type DocumentNode = BlockNode | DefinitionNode | FootnoteDefinitionNode;

export type BlockNode = RenderableBlockNode | AnnotatedBlockNode | AnnotatedRegionNode;

export type RenderableBlockNode =
  | HeadingNode
  | ParagraphNode
  | MarkdownNode
  | ListNode
  | CodeNode
  | BlockquoteNode
  | ThematicBreakNode
  | TableNode
  | HtmlNode;

/**
 * Emits a `yamdown:node` comment immediately before a visible block.
 * Annotation wrappers deliberately cannot wrap raw `markdown` differently:
 * raw content stays opaque and is simply the visible target.
 */
export interface AnnotatedBlockNode extends AnnotationMetadata {
  readonly type: 'annotatedBlock';
  readonly block: RenderableBlockNode;
}

/** Emits a paired `yamdown:region` comment around sibling block content. */
export interface AnnotatedRegionNode extends AnnotationMetadata {
  readonly type: 'annotatedRegion';
  readonly blocks: readonly BlockNode[];
}

export type HeadingNode =
  | {
      readonly type: 'heading';
      readonly depth: 1 | 2 | 3 | 4 | 5 | 6;
      readonly text: string;
    }
  | {
      readonly type: 'heading';
      readonly depth: 1 | 2 | 3 | 4 | 5 | 6;
      readonly children: readonly InlineNode[];
    };

export type ParagraphNode =
  | {
      readonly type: 'paragraph';
      readonly text: string;
    }
  | {
      readonly type: 'paragraph';
      readonly children: readonly InlineNode[];
    };

export interface MarkdownNode {
  readonly type: 'markdown';
  readonly value: string;
}

export interface ListNode {
  readonly type: 'list';
  readonly ordered: boolean;
  readonly start?: number;
  readonly items: readonly ListItemNode[];
}

export interface ListItemNode {
  readonly checked?: boolean;
  readonly blocks: readonly BlockNode[];
}

export interface CodeNode {
  readonly type: 'code';
  readonly lang?: string;
  readonly meta?: string;
  readonly value: string;
}

export interface BlockquoteNode {
  readonly type: 'blockquote';
  readonly blocks: readonly BlockNode[];
}

export interface ThematicBreakNode {
  readonly type: 'thematicBreak';
}

export interface TableColumn {
  readonly key: string;
  readonly label: string;
  readonly align?: TableAlignment | null;
}

export type TableAlignment = 'left' | 'center' | 'right';

export interface TableNode {
  readonly type: 'table';
  readonly columns: readonly TableColumn[];
  readonly rows: readonly Record<string, unknown>[];
}

export interface TableInlineCell {
  readonly type: 'inline';
  readonly children: readonly InlineNode[];
}

export interface DefinitionNode {
  readonly type: 'definition';
  readonly identifier: string;
  readonly url: string;
  readonly title?: string;
}

export interface FootnoteDefinitionNode {
  readonly type: 'footnoteDefinition';
  readonly identifier: string;
  readonly blocks: readonly BlockNode[];
}

export interface HtmlNode {
  readonly type: 'html';
  readonly value: string;
}

export type InlineNode =
  | TextInline
  | EmphasisInline
  | StrongInline
  | DeleteInline
  | InlineCodeInline
  | LinkInline
  | LinkReferenceInline
  | ImageInline
  | ImageReferenceInline
  | FootnoteReferenceInline
  | BreakInline
  | AnnotatedSpanInline;

/** Emits paired `yamdown:span` comments around a contiguous inline range. */
export interface AnnotatedSpanInline extends AnnotationMetadata {
  readonly type: 'annotatedSpan';
  readonly children: readonly InlineNode[];
}

export interface TextInline {
  readonly type: 'text';
  readonly value: string;
}

export interface EmphasisInline {
  readonly type: 'emphasis';
  readonly children: readonly InlineNode[];
}

export interface StrongInline {
  readonly type: 'strong';
  readonly children: readonly InlineNode[];
}

export interface DeleteInline {
  readonly type: 'delete';
  readonly children: readonly InlineNode[];
}

export interface InlineCodeInline {
  readonly type: 'inlineCode';
  readonly value: string;
}

export interface LinkInline {
  readonly type: 'link';
  readonly url: string;
  readonly title?: string;
  readonly children: readonly InlineNode[];
}

export interface LinkReferenceInline {
  readonly type: 'linkReference';
  readonly identifier: string;
  readonly children: readonly InlineNode[];
}

export interface ImageInline {
  readonly type: 'image';
  readonly url: string;
  readonly alt?: string;
  readonly title?: string;
}

export interface ImageReferenceInline {
  readonly type: 'imageReference';
  readonly identifier: string;
  readonly alt?: string;
}

export interface FootnoteReferenceInline {
  readonly type: 'footnoteReference';
  readonly identifier: string;
}

export interface BreakInline {
  readonly type: 'break';
}

export interface RenderOptions {
  readonly frontmatter?: boolean;
  readonly bullet?: '-' | '*' | '+';
  readonly orderedDelimiter?: '.' | ')';
  readonly codeFence?: '`' | '~';
  readonly blankLines?: number;
}
