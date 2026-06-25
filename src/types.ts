export interface YamlMarkdownDocument {
  readonly frontmatter?: Readonly<Record<string, unknown>>;
  readonly blocks: readonly BlockNode[];
}

export type BlockNode =
  | HeadingNode
  | ParagraphNode
  | MarkdownNode
  | ListNode
  | CodeNode
  | BlockquoteNode
  | ThematicBreakNode
  | TableNode
  | HtmlNode;

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
  | ImageInline
  | BreakInline;

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

export interface ImageInline {
  readonly type: 'image';
  readonly url: string;
  readonly alt?: string;
  readonly title?: string;
}

export interface BreakInline {
  readonly type: 'break';
}

export interface RenderOptions {
  readonly frontmatter?: boolean;
  readonly headingStyle?: 'atx';
  readonly bullet?: '-' | '*' | '+';
  readonly orderedDelimiter?: '.' | ')';
  readonly codeFence?: '`' | '~';
  readonly blankLines?: number;
}
