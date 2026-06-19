import { normalizeDocument } from './normalize.js';
import type { BlockNode, InlineNode, YamlMarkdownDocument } from './types.js';

export interface MdastRoot {
  type: 'root';
  children: MdastBlock[];
}

export type MdastBlock =
  | MdastHeading
  | MdastParagraph
  | MdastList
  | MdastCode
  | MdastBlockquote
  | MdastThematicBreak
  | MdastTable
  | MdastHtml;

export type MdastInline =
  | MdastText
  | MdastEmphasis
  | MdastStrong
  | MdastInlineCode
  | MdastLink
  | MdastImage
  | MdastBreak;

export interface MdastText {
  type: 'text';
  value: string;
}

export interface MdastHeading {
  type: 'heading';
  depth: 1 | 2 | 3 | 4 | 5 | 6;
  children: MdastInline[];
}

export interface MdastParagraph {
  type: 'paragraph';
  children: MdastInline[];
}

export interface MdastList {
  type: 'list';
  ordered: boolean;
  start?: number;
  children: MdastListItem[];
}

export interface MdastListItem {
  type: 'listItem';
  children: MdastBlock[];
}

export interface MdastCode {
  type: 'code';
  lang?: string;
  value: string;
}

export interface MdastBlockquote {
  type: 'blockquote';
  children: MdastBlock[];
}

export interface MdastThematicBreak {
  type: 'thematicBreak';
}

export interface MdastTable {
  type: 'table';
  align: Array<null>;
  children: MdastTableRow[];
}

export interface MdastTableRow {
  type: 'tableRow';
  children: MdastTableCell[];
}

export interface MdastTableCell {
  type: 'tableCell';
  children: MdastText[];
}

export interface MdastHtml {
  type: 'html';
  value: string;
}

export interface MdastEmphasis {
  type: 'emphasis';
  children: MdastInline[];
}

export interface MdastStrong {
  type: 'strong';
  children: MdastInline[];
}

export interface MdastInlineCode {
  type: 'inlineCode';
  value: string;
}

export interface MdastLink {
  type: 'link';
  url: string;
  title?: string;
  children: MdastInline[];
}

export interface MdastImage {
  type: 'image';
  url: string;
  alt?: string;
  title?: string;
}

export interface MdastBreak {
  type: 'break';
}

export function toMdast(input: YamlMarkdownDocument): MdastRoot {
  const document = normalizeDocument(input);
  return {
    type: 'root',
    children: document.blocks.map((block) => blockToMdast(block))
  };
}

function blockToMdast(block: BlockNode): MdastBlock {
  switch (block.type) {
    case 'heading':
      return {
        type: 'heading',
        depth: block.depth,
        children: 'text' in block ? [{ type: 'text', value: block.text }] : block.children.map(inlineToMdast)
      };
    case 'paragraph':
      return {
        type: 'paragraph',
        children: 'text' in block ? [{ type: 'text', value: block.text }] : block.children.map(inlineToMdast)
      };
    case 'list':
      return {
        type: 'list',
        ordered: block.ordered,
        start: block.start,
        children: block.items.map((item) => ({
          type: 'listItem',
          children: item.blocks.map((child) => blockToMdast(child))
        }))
      };
    case 'code':
      return {
        type: 'code',
        lang: block.lang,
        value: block.value
      };
    case 'blockquote':
      return {
        type: 'blockquote',
        children: block.blocks.map((child) => blockToMdast(child))
      };
    case 'thematicBreak':
      return { type: 'thematicBreak' };
    case 'table':
      return {
        type: 'table',
        align: block.columns.map(() => null),
        children: [
          {
            type: 'tableRow',
            children: block.columns.map((column) => ({
              type: 'tableCell',
              children: [{ type: 'text', value: column.label }]
            }))
          },
          ...block.rows.map((row) => ({
            type: 'tableRow' as const,
            children: block.columns.map((column) => ({
              type: 'tableCell' as const,
              children: [{ type: 'text' as const, value: stringifyCellValue(row[column.key]) }]
            }))
          }))
        ]
      };
    case 'html':
      return {
        type: 'html',
        value: block.value
      };
  }

  return assertNever(block);
}

function inlineToMdast(inline: InlineNode): MdastInline {
  switch (inline.type) {
    case 'text':
      return { type: 'text', value: inline.value };
    case 'emphasis':
      return { type: 'emphasis', children: inline.children.map(inlineToMdast) };
    case 'strong':
      return { type: 'strong', children: inline.children.map(inlineToMdast) };
    case 'inlineCode':
      return { type: 'inlineCode', value: inline.value };
    case 'link':
      return {
        type: 'link',
        url: inline.url,
        title: inline.title,
        children: inline.children.map(inlineToMdast)
      };
    case 'image':
      return {
        type: 'image',
        url: inline.url,
        alt: inline.alt,
        title: inline.title
      };
    case 'break':
      return { type: 'break' };
  }

  return assertNever(inline);
}

function assertNever(_value: never): never {
  throw new Error('Unexpected code branch reached');
}

function stringifyCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  return typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
}
