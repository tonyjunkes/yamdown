import { stringify } from 'yaml';
import { parseYamlMarkdown } from './parse.js';
import type {
  BlockNode,
  BlockquoteNode,
  CodeNode,
  InlineNode,
  ListNode,
  ParagraphNode,
  RenderOptions,
  TableNode,
  YamlMarkdownDocument
} from './types.js';
import { normalizeDocument } from './normalize.js';

const defaultOptions = {
  blankLines: 1,
  bullet: '-',
  codeFence: '`',
  frontmatter: true,
  headingStyle: 'atx',
  orderedDelimiter: '.'
} satisfies Required<RenderOptions>;

export function renderMarkdown(
  input: string | Readonly<YamlMarkdownDocument>,
  options: Readonly<RenderOptions> = {}
): string {
  const document = typeof input === 'string' ? parseYamlMarkdown(input) : normalizeDocument(input);
  return renderDocument(document, options);
}

export function renderDocument(document: YamlMarkdownDocument, options: RenderOptions = {}): string {
  const renderOptions = { ...defaultOptions, ...options };
  const parts: string[] = [];

  if (renderOptions.frontmatter && document.frontmatter !== undefined && Object.keys(document.frontmatter).length > 0) {
    parts.push(renderFrontmatter(document.frontmatter));
  }

  parts.push(...document.blocks.map((block) => renderBlock(block, renderOptions)));

  const separator = '\n'.repeat(Math.max(1, renderOptions.blankLines) + 1);
  return `${trimTrailingLineEndings(parts.filter((part) => part.length > 0).join(separator))}\n`;
}

export function renderBlock(block: BlockNode, options: Required<RenderOptions> = defaultOptions): string {
  switch (block.type) {
    case 'heading':
      return `${'#'.repeat(block.depth)} ${'text' in block ? block.text : renderInlineChildren(block.children, false)}`;
    case 'paragraph':
      return renderParagraph(block);
    case 'markdown':
      return renderRawMarkdown(block.value);
    case 'list':
      return renderList(block, options);
    case 'code':
      return renderCode(block, options);
    case 'blockquote':
      return renderBlockquote(block, options);
    case 'thematicBreak':
      return '---';
    case 'table':
      return renderTable(block);
    case 'html':
      return block.value.trimEnd();
  }

  return unreachable(block);
}

export function renderInline(node: InlineNode): string {
  return renderInlineWithContext(node, true);
}

function renderInlineWithContext(node: InlineNode, atLineStart: boolean): string {
  switch (node.type) {
    case 'text':
      return escapeStructuredText(node.value, atLineStart);
    case 'emphasis':
      return `*${renderInlineChildren(node.children, false)}*`;
    case 'strong':
      return `**${renderInlineChildren(node.children, false)}**`;
    case 'inlineCode':
      return renderInlineCode(node.value);
    case 'link':
      return `[${renderInlineChildren(node.children, false)}](${renderDestination(node.url)}${renderTitle(node.title)})`;
    case 'image':
      return `![${escapeAltText(node.alt ?? '')}](${renderDestination(node.url)}${renderTitle(node.title)})`;
    case 'break':
      return '  \n';
  }

  return unreachable(node);
}

function renderParagraph(node: ParagraphNode): string {
  return 'text' in node ? node.text : renderInlineChildren(node.children);
}

function renderRawMarkdown(value: string): string {
  const normalized = value.replaceAll(/\r\n?/gu, '\n');
  if (/^[\t ]*$/u.test(normalized)) {
    return '';
  }

  return normalized.replace(/^(?:[\t ]*\n)+/u, '').replace(/(?:\n[\t ]*)+$/u, '');
}

function renderInlineChildren(children: readonly InlineNode[], initialAtLineStart = true): string {
  let atLineStart = initialAtLineStart;
  let output = '';

  for (const child of children) {
    const rendered = renderInlineWithContext(child, atLineStart);
    output += rendered;
    atLineStart = rendered.endsWith('\n');
  }

  return output;
}

function renderList(node: ListNode, options: Required<RenderOptions>): string {
  const start = node.start ?? 1;

  return node.items
    .map((item, index) => {
      const marker = node.ordered ? `${start + index}${options.orderedDelimiter}` : options.bullet;
      const body = trimTrailingLineEndings(renderBlocks(item.blocks, options));
      const lines = body.length > 0 ? body.split('\n') : [''];
      const continuation = ' '.repeat(marker.length + 1);
      const renderedLines = [`${marker} ${lines[0] ?? ''}`];

      for (const line of lines.slice(1)) {
        renderedLines.push(line.length > 0 ? `${continuation}${line}` : '');
      }

      return renderedLines.join('\n');
    })
    .join('\n');
}

function renderCode(node: CodeNode, options: Required<RenderOptions>): string {
  const fenceCharacter = options.codeFence === '`' && node.lang?.includes('`') === true ? '~' : options.codeFence;
  const fence = createFence(node.value, fenceCharacter);
  const info = node.lang ?? '';
  const value = node.value.replaceAll(/\r\n?/gu, '\n');
  const needsFinalLine = value.length === 0 || !value.endsWith('\n');

  return `${fence}${info}\n${value}${needsFinalLine ? '\n' : ''}${fence}`;
}

function renderBlockquote(node: BlockquoteNode, options: Required<RenderOptions>): string {
  return trimTrailingLineEndings(renderBlocks(node.blocks, options))
    .split('\n')
    .map((line) => (line.length > 0 ? `> ${line}` : '>'))
    .join('\n');
}

function renderBlocks(blocks: readonly BlockNode[], options: Required<RenderOptions>): string {
  const separator = '\n'.repeat(Math.max(1, options.blankLines) + 1);
  return blocks.map((block) => renderBlock(block, options)).join(separator);
}

function renderTable(node: TableNode): string {
  const header = `| ${node.columns.map((column) => escapeTableCell(column.label)).join(' | ')} |`;
  const separator = `| ${node.columns.map(() => '---').join(' | ')} |`;
  const rows = node.rows.map(
    (row) => `| ${node.columns.map((column) => escapeTableCell(renderCellValue(row[column.key]))).join(' | ')} |`
  );

  return [header, separator, ...rows].join('\n');
}

function renderFrontmatter(frontmatter: Record<string, unknown>): string {
  return `---\n${stringify(frontmatter).trimEnd()}\n---`;
}

function createFence(value: string, fenceCharacter: '`' | '~'): string {
  const escaped = escapeRegExp(fenceCharacter);
  const runs = value.match(new RegExp(`${escaped}{3,}`, 'gu')) ?? [];
  const longestRun = runs.reduce((longest, run) => Math.max(longest, run.length), 2);
  return fenceCharacter.repeat(longestRun + 1);
}

function renderInlineCode(value: string): string {
  const runs = value.match(/`+/gu) ?? [];
  const longestRun = runs.reduce((longest, run) => Math.max(longest, run.length), 0);
  const fence = '`'.repeat(longestRun + 1);
  const needsPadding = value.length > 0 && !/^ +$/u.test(value) && (/^[ `]/u.test(value) || /[ `]$/u.test(value));
  const paddedValue = needsPadding ? ` ${value} ` : value;

  return `${fence}${paddedValue}${fence}`;
}

function renderTitle(title: string | undefined): string {
  return title === undefined
    ? ''
    : ` "${title.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll(/\r?\n/gu, ' ')}"`;
}

function escapeAltText(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('[', '\\[').replaceAll(']', '\\]').replaceAll(/\r?\n/gu, ' ');
}

function renderDestination(value: string): string {
  const characters = Array.from(value);
  if (characters.some((character) => isUnsafeDestinationCharacter(character))) {
    const encoded = characters
      .map((character) => (isUnsafeDestinationCharacter(character) ? percentEncodeCharacter(character) : character))
      .join('');
    return `<${encoded.replaceAll('\\', '%5C')}>`;
  }

  return value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

function escapeStructuredText(value: string, initiallyAtLineStart: boolean): string {
  const normalized = value.replaceAll(/\r\n?/gu, '\n');
  const lines = normalized.split('\n');

  return lines
    .map((line, index) => {
      const atLineStart = index > 0 || initiallyAtLineStart;
      const escapedLine = line.replaceAll(/\\|`|\*|_|\[|\]|<|>|&/gu, '\\$&');
      return atLineStart ? escapeBlockMarker(escapedLine) : escapedLine;
    })
    .join('\n');
}

function isUnsafeDestinationCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint <= 0x20 || character === '<' || character === '>';
}

function percentEncodeCharacter(character: string): string {
  return `%${(character.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(2, '0')}`;
}

function escapeBlockMarker(line: string): string {
  if (/^ {0,3}[=-]+[\t ]*$/u.test(line)) {
    return line.replace(/[=-]/u, '\\$&');
  }

  if (/^(?: {4}|\t)/u.test(line)) {
    return line.startsWith('\t') ? `&#9;${line.slice(1)}` : `&#32;${line.slice(1)}`;
  }

  if (/^ {0,3}#{1,6}(?:[\t ]|$)/u.test(line)) {
    return line.replace('#', '\\#');
  }

  if (/^ {0,3}[-+](?:[\t ]|$)/u.test(line)) {
    return line.replace(/^([ ]*)([-+])/u, '$1\\$2');
  }

  if (/^ {0,3}(?:-\s*){3,}$/u.test(line)) {
    return line.replace('-', '\\-');
  }

  if (/^ {0,3}\d{1,9}[.)](?:[\t ]|$)/u.test(line)) {
    return line.replace(/^([ ]*\d{1,9})([.)])/u, '$1\\$2');
  }

  return line;
}

function escapeTableCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll(/\r?\n/gu, ' ');
}

function renderCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }

  return JSON.stringify(value) ?? '';
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function trimTrailingLineEndings(value: string): string {
  return value.replace(/\n+$/u, '');
}

function unreachable(_value: never): never {
  throw new Error('Unexpected code branch reached');
}
