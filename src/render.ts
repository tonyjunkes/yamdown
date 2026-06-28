import { stringify } from 'yaml';
import type {
  BlockNode,
  BlockquoteNode,
  CodeNode,
  DefinitionNode,
  DocumentNode,
  FootnoteDefinitionNode,
  InlineNode,
  ListNode,
  ParagraphNode,
  RenderOptions,
  TableInlineCell,
  TableNode,
  YamdownDocument
} from './types.js';

const defaultOptions = {
  blankLines: 1,
  bullet: '-',
  codeFence: '`',
  frontmatter: true,
  headingStyle: 'atx',
  orderedDelimiter: '.'
} satisfies Required<RenderOptions>;

export function renderDocument(document: YamdownDocument, options: RenderOptions = {}): string {
  const renderOptions = { ...defaultOptions, ...options };
  const parts: string[] = [];

  if (renderOptions.frontmatter && document.frontmatter !== undefined && Object.keys(document.frontmatter).length > 0) {
    parts.push(renderFrontmatter(document.frontmatter));
  }

  parts.push(...document.blocks.map((block) => renderBlock(block, renderOptions)));

  const separator = '\n'.repeat(Math.max(1, renderOptions.blankLines) + 1);
  return `${trimTrailingLineEndings(parts.filter((part) => part.length > 0).join(separator))}\n`;
}

export function renderBlock(block: DocumentNode, options: Required<RenderOptions> = defaultOptions): string {
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
    case 'definition':
      return renderDefinition(block);
    case 'footnoteDefinition':
      return renderFootnoteDefinition(block, options);
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
    case 'delete':
      return `~~${renderInlineChildren(node.children, false)}~~`;
    case 'inlineCode':
      return renderInlineCode(node.value);
    case 'link':
      return `[${renderInlineChildren(node.children, false)}](${renderDestination(node.url)}${renderTitle(node.title)})`;
    case 'linkReference':
      return `[${renderInlineChildren(node.children, false)}][${node.identifier}]`;
    case 'image':
      return `![${escapeAltText(node.alt ?? '')}](${renderDestination(node.url)}${renderTitle(node.title)})`;
    case 'imageReference':
      return `![${escapeAltText(node.alt ?? '')}][${node.identifier}]`;
    case 'footnoteReference':
      return `[^${node.identifier}]`;
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
      const taskMarker = item.checked === undefined ? '' : item.checked ? '[x] ' : '[ ] ';
      const continuation = ' '.repeat(marker.length + 1);
      const renderedLines = [`${marker} ${taskMarker}${lines[0] ?? ''}`];

      for (const line of lines.slice(1)) {
        renderedLines.push(line.length > 0 ? `${continuation}${line}` : '');
      }

      return renderedLines.join('\n');
    })
    .join('\n');
}

function renderCode(node: CodeNode, options: Required<RenderOptions>): string {
  const info = renderCodeInfo(node);
  const fenceCharacter = options.codeFence === '`' && info.includes('`') ? '~' : options.codeFence;
  const fence = createFence(node.value, fenceCharacter);
  const value = node.value.replaceAll(/\r\n?/gu, '\n');
  const needsFinalLine = value.length === 0 || !value.endsWith('\n');

  return `${fence}${info}\n${value}${needsFinalLine ? '\n' : ''}${fence}`;
}

function renderCodeInfo(node: CodeNode): string {
  if (node.meta === undefined) {
    return node.lang ?? '';
  }

  return `${node.lang ?? ''} ${node.meta}`;
}

function renderBlockquote(node: BlockquoteNode, options: Required<RenderOptions>): string {
  return trimTrailingLineEndings(renderBlocks(node.blocks, options))
    .split('\n')
    .map((line) => (line.length > 0 ? `> ${line}` : '>'))
    .join('\n');
}

function renderDefinition(node: DefinitionNode): string {
  const destination = node.url.length === 0 ? '<>' : renderDestination(node.url);
  return `[${node.identifier}]: ${destination}${renderTitle(node.title)}`;
}

function renderFootnoteDefinition(node: FootnoteDefinitionNode, options: Required<RenderOptions>): string {
  const body = trimTrailingLineEndings(renderBlocks(node.blocks, options));
  const lines = body.split('\n');
  const rendered = [`[^${node.identifier}]: ${lines[0] ?? ''}`];

  for (const line of lines.slice(1)) {
    rendered.push(line.length > 0 ? `    ${line}` : '');
  }

  return rendered.join('\n');
}

function renderBlocks(blocks: readonly BlockNode[], options: Required<RenderOptions>): string {
  const separator = '\n'.repeat(Math.max(1, options.blankLines) + 1);
  return blocks.map((block) => renderBlock(block, options)).join(separator);
}

function renderTable(node: TableNode): string {
  const header = `| ${node.columns.map((column) => escapeTableCell(column.label)).join(' | ')} |`;
  const separator = `| ${node.columns.map((column) => renderTableDelimiter(column.align)).join(' | ')} |`;
  const rows = node.rows.map(
    (row) => `| ${node.columns.map((column) => escapeTableCell(renderCellValue(row[column.key]))).join(' | ')} |`
  );

  return [header, separator, ...rows].join('\n');
}

function renderTableDelimiter(align: TableNode['columns'][number]['align']): string {
  if (align === 'left') {
    return ':---';
  }

  if (align === 'center') {
    return ':---:';
  }

  if (align === 'right') {
    return '---:';
  }

  return '---';
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
    : ` "${title
        .replaceAll('\\', '\\\\')
        .replaceAll('"', '\\"')
        .replaceAll(/\r\n?|\n/gu, ' ')}"`;
}

function escapeAltText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]')
    .replaceAll(/\r\n?|\n/gu, ' ');
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
      const escapedLine = line.replaceAll(/\\|`|\*|_|~|\[|\]|<|>|&/gu, '\\$&');
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
  if (isTableInlineCell(value)) {
    return renderInlineChildren(value.children);
  }

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

function isTableInlineCell(value: unknown): value is TableInlineCell {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'type' in value &&
    value.type === 'inline' &&
    'children' in value &&
    Array.isArray(value.children)
  );
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
