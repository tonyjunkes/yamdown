import { stringify } from 'yaml';
import { YamdownRenderError } from './errors.js';
import type {
  AnnotationData,
  AnnotationMetadata,
  BlockNode,
  BlockquoteNode,
  CodeNode,
  DefinitionNode,
  DocumentNode,
  FootnoteDefinitionNode,
  InlineNode,
  ListItemNode,
  ListNode,
  ParagraphNode,
  RenderOptions,
  TableInlineCell,
  TableNode,
  YamdownDescriptor,
  YamdownDocument
} from './types.js';

interface ResolvedRenderOptions {
  frontmatter: boolean;
  bullet: '-' | '*' | '+';
  orderedDelimiter: '.' | ')';
  codeFence: '`' | '~';
  blankLines: number;
}
type InlineDelimiter = '*' | '_' | '**' | '__' | '~~';

const maximumOrderedListMarker = 999_999_999;
const defaultOptions: ResolvedRenderOptions = {
  blankLines: 1,
  bullet: '-',
  codeFence: '`',
  frontmatter: true,
  orderedDelimiter: '.'
};

export function renderDocument(document: YamdownDocument, options: Readonly<RenderOptions> = {}): string {
  const renderOptions = resolveRenderOptions(options);
  const parts: string[] = [];

  // YAML frontmatter must remain the first Markdown root child so standard
  // frontmatter parsers continue to recognize it before the Yamdown header.
  if (renderOptions.frontmatter && document.frontmatter !== undefined && Object.keys(document.frontmatter).length > 0) {
    parts.push(renderFrontmatter(document.frontmatter));
  }

  if (document.yamdown !== undefined) {
    parts.push(renderDocumentAnnotation(document.yamdown));
  }

  parts.push(...document.blocks.map((block) => renderBlockWithOptions(block, renderOptions)));

  const separator = createBlockSeparator(renderOptions);
  return `${trimTrailingLineEndings(parts.filter((part) => part.length > 0).join(separator))}\n`;
}

/** Render one normalized block with the same partial options accepted by renderDocument. */
export function renderBlock(block: DocumentNode, options: Readonly<RenderOptions> = {}): string {
  return renderBlockWithOptions(block, resolveRenderOptions(options));
}

function renderBlockWithOptions(block: DocumentNode, options: ResolvedRenderOptions): string {
  switch (block.type) {
    case 'annotatedBlock':
      return joinAnnotationParts(renderNodeAnnotation(block), renderBlockWithOptions(block.block, options));
    case 'annotatedRegion':
      return joinAnnotationParts(
        renderRegionAnnotation(block),
        renderBlocks(block.blocks, options),
        renderAnnotationClose('region', block.id)
      );
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

function renderInlineWithContext(
  node: InlineNode,
  atLineStart: boolean,
  parentDelimiter?: InlineDelimiter,
  delimiterOverride?: InlineDelimiter
): string {
  switch (node.type) {
    case 'text':
      return escapeStructuredText(node.value, atLineStart);
    case 'emphasis':
      return renderDelimitedInline(node.children, atLineStart, '*', '_', parentDelimiter, delimiterOverride);
    case 'strong':
      return renderDelimitedInline(node.children, atLineStart, '**', '__', parentDelimiter, delimiterOverride);
    case 'delete':
      if (parentDelimiter === '~~') {
        // Consecutive strike-through delimiters are parsed as a code fence;
        // nested identical delete spans have no additional Markdown meaning.
        return renderInlineChildren(node.children, false, parentDelimiter);
      }
      return renderDelimitedInline(node.children, atLineStart, '~~', undefined, parentDelimiter, delimiterOverride);
    case 'inlineCode':
      return node.value.length === 0 ? '' : renderInlineCode(node.value);
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
    case 'annotatedSpan':
      return `${renderSpanAnnotation(node)}${renderInlineChildren(node.children, false)}${renderAnnotationClose('span', node.id)}`;
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

function renderInlineChildren(
  children: readonly InlineNode[],
  initialAtLineStart = true,
  parentDelimiter?: InlineDelimiter
): string {
  let atLineStart = initialAtLineStart;
  const output: string[] = [];

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (child === undefined) {
      continue;
    }

    if (child.type === 'delete') {
      const deleteChildren: InlineNode[] = [];
      let end = index;
      while (true) {
        const sibling = children[end];
        if (sibling?.type !== 'delete') {
          break;
        }

        deleteChildren.push(...sibling.children);
        end += 1;
      }

      const rendered = renderInlineWithContext(
        { type: 'delete', children: deleteChildren },
        atLineStart,
        parentDelimiter
      );
      output.push(rendered);
      atLineStart = rendered.endsWith('\n');
      index = end - 1;
      continue;
    }

    if (child.type === 'emphasis' || child.type === 'strong') {
      const sameType = child.type;
      let end = index;
      while (children[end]?.type === sameType) {
        end += 1;
      }

      const primary = sameType === 'emphasis' ? '*' : '**';
      const alternate = sameType === 'emphasis' ? '_' : '__';
      const firstDelimiter = sharesDelimiterCharacter(parentDelimiter, primary) ? alternate : primary;

      for (let siblingIndex = index; siblingIndex < end; siblingIndex += 1) {
        const sibling = children[siblingIndex];
        if (sibling === undefined) {
          continue;
        }

        const delimiter =
          (siblingIndex - index) % 2 === 0 ? firstDelimiter : firstDelimiter === primary ? alternate : primary;
        const rendered = renderInlineWithContext(sibling, atLineStart, parentDelimiter, delimiter);
        output.push(rendered);
        atLineStart = rendered.endsWith('\n');
      }

      index = end - 1;
      continue;
    }

    const rendered = renderInlineWithContext(child, atLineStart, parentDelimiter);
    output.push(rendered);
    atLineStart = rendered.endsWith('\n');
  }

  return output.join('');
}

function renderDelimitedInline(
  children: readonly InlineNode[],
  atLineStart: boolean,
  primaryDelimiter: InlineDelimiter,
  alternateDelimiter: InlineDelimiter | undefined,
  parentDelimiter: InlineDelimiter | undefined,
  delimiterOverride: InlineDelimiter | undefined
): string {
  const delimiter =
    delimiterOverride ??
    (sharesDelimiterCharacter(parentDelimiter, primaryDelimiter) && alternateDelimiter !== undefined
      ? alternateDelimiter
      : primaryDelimiter);
  const content = renderInlineChildren(children, false, delimiter);
  const leadingWhitespace = content.match(/^\s+/u)?.[0] ?? '';
  const withoutLeadingWhitespace = content.slice(leadingWhitespace.length);
  const trailingWhitespace = withoutLeadingWhitespace.match(/\s+$/u)?.[0] ?? '';
  const core = withoutLeadingWhitespace.slice(0, withoutLeadingWhitespace.length - trailingWhitespace.length);

  // Markdown cannot form an emphasis/strong/delete span with whitespace right
  // inside either delimiter. Preserve visible content while canonicalizing that
  // unrepresentable wrapper away.
  if (core.length === 0) {
    return content;
  }

  return `${leadingWhitespace}${delimiter}${core}${delimiter}${trailingWhitespace}`;
}

function sharesDelimiterCharacter(parentDelimiter: InlineDelimiter | undefined, delimiter: InlineDelimiter): boolean {
  return parentDelimiter !== undefined && parentDelimiter[0] === delimiter[0];
}

function renderList(node: ListNode, options: ResolvedRenderOptions): string {
  assertRenderableList(node);
  const start = node.start ?? 1;

  return node.items
    .map((item, index) => {
      const marker = node.ordered ? `${start + index}${options.orderedDelimiter}` : options.bullet;
      return renderListItem(item, marker, options);
    })
    .join('\n');
}

function renderListItem(item: ListItemNode, marker: string, options: ResolvedRenderOptions): string {
  if (item.checked !== undefined && !isRenderableTaskParagraph(item.blocks[0])) {
    throw new YamdownRenderError('Checked list items must begin with a renderable paragraph block.');
  }

  const first = item.blocks[0];
  if (first === undefined) {
    return marker;
  }

  const continuation = ' '.repeat(marker.length + 1);
  const taskMarker = item.checked === undefined ? '' : item.checked ? '[x] ' : '[ ] ';
  const firstNeedsOwnLine = !canRenderAfterListMarker(first);
  const parts: string[] = [];

  if (firstNeedsOwnLine) {
    parts.push(marker);
    const firstBody = indentListItemContent(renderBlockWithOptions(first, options), continuation);
    if (firstBody.length > 0) {
      parts.push(firstBody);
    }
  } else {
    const firstBody = trimTrailingLineEndings(renderBlockWithOptions(first, options));
    const lines = firstBody.length > 0 ? firstBody.split('\n') : [''];
    parts.push(`${marker} ${taskMarker}${lines[0] ?? ''}`);
    for (const line of lines.slice(1)) {
      parts.push(line.length > 0 ? `${continuation}${line}` : '');
    }
  }

  let rendered = parts.join('\n');
  for (const block of item.blocks.slice(1)) {
    const body = indentListItemContent(renderBlockWithOptions(block, options), continuation);
    if (body.length === 0) {
      continue;
    }

    rendered += `${createBlockSeparator(options)}${body}`;
  }

  return rendered;
}

function canRenderAfterListMarker(block: BlockNode): boolean {
  if (block.type === 'thematicBreak') {
    return false;
  }

  // An annotation comment is a legal first child of a list item when it
  // follows the list marker on the same line. Keeping it there ensures the
  // following indented block remains in the same list item after comments are
  // removed for the clean Markdown projection.
  if (block.type === 'annotatedBlock' || block.type === 'annotatedRegion') {
    return true;
  }

  if (block.type === 'markdown') {
    const firstLine = renderRawMarkdown(block.value).split('\n')[0] ?? '';
    return !isThematicBreakLine(firstLine);
  }

  if (block.type !== 'paragraph') {
    return true;
  }

  // Raw paragraph text intentionally remains opaque. Keep thematic-break-like
  // source on its own indented line so `- ---` cannot escape its list item.
  return !('text' in block) || !isThematicBreakLine(block.text.split(/\r\n?|\n/u)[0] ?? '');
}

function indentListItemContent(value: string, continuation: string): string {
  const body = trimTrailingLineEndings(value);
  if (body.length === 0) {
    return '';
  }

  return body
    .split('\n')
    .map((line) => (line.length > 0 ? `${continuation}${line}` : ''))
    .join('\n');
}

function renderCode(node: CodeNode, options: ResolvedRenderOptions): string {
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

function renderBlockquote(node: BlockquoteNode, options: ResolvedRenderOptions): string {
  return trimTrailingLineEndings(renderBlocks(node.blocks, options))
    .split('\n')
    .map((line) => (line.length > 0 ? `> ${line}` : '>'))
    .join('\n');
}

function renderDefinition(node: DefinitionNode): string {
  const destination = node.url.length === 0 ? '<>' : renderDestination(node.url);
  return `[${node.identifier}]: ${destination}${renderTitle(node.title)}`;
}

function renderFootnoteDefinition(node: FootnoteDefinitionNode, options: ResolvedRenderOptions): string {
  const body = trimTrailingLineEndings(renderBlocks(node.blocks, options));
  const lines = body.split('\n');
  const rendered = [`[^${node.identifier}]: ${lines[0] ?? ''}`];

  for (const line of lines.slice(1)) {
    rendered.push(line.length > 0 ? `    ${line}` : '');
  }

  return rendered.join('\n');
}

function renderBlocks(blocks: readonly BlockNode[], options: ResolvedRenderOptions): string {
  return blocks.map((block) => renderBlockWithOptions(block, options)).join(createBlockSeparator(options));
}

function renderTable(node: TableNode): string {
  const header = `| ${node.columns.map((column) => escapeTableCell(column.label)).join(' | ')} |`;
  const separator = `| ${node.columns.map((column) => renderTableDelimiter(column.align)).join(' | ')} |`;
  const rows = node.rows.map(
    (row) =>
      `| ${node.columns
        .map((column) => escapeTableCell(renderCellValue(Object.hasOwn(row, column.key) ? row[column.key] : undefined)))
        .join(' | ')} |`
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

function renderDocumentAnnotation(descriptor: YamdownDescriptor): string {
  return `<!-- yamdown:document ${JSON.stringify({ v: descriptor.v, profile: descriptor.profile })} -->`;
}

function renderNodeAnnotation(annotation: AnnotationMetadata): string {
  return renderAnnotationComment('node', annotationPayload(annotation));
}

function renderSpanAnnotation(annotation: AnnotationMetadata): string {
  return renderAnnotationComment('span', annotationPayload(annotation));
}

function renderRegionAnnotation(annotation: AnnotationMetadata): string {
  return renderAnnotationComment('region', annotationPayload(annotation));
}

function renderAnnotationClose(name: 'region' | 'span', id: string): string {
  return renderAnnotationComment(`/${name}`, { id });
}

function annotationPayload(annotation: AnnotationMetadata): Record<string, AnnotationData | string> {
  const payload: Record<string, AnnotationData | string> = { id: annotation.id };
  if (annotation.kind !== undefined) {
    payload.kind = annotation.kind;
  }
  if (annotation.data !== undefined) {
    payload.data = annotation.data;
  }
  return payload;
}

function renderAnnotationComment(name: string, payload: AnnotationData): string {
  return `<!-- yamdown:${name} ${serializeAnnotationJson(payload)} -->`;
}

function serializeAnnotationJson(value: AnnotationData): string {
  return serializeJson(value, new WeakSet(), false)
    .replaceAll('&', '\\u0026')
    .replaceAll('<', '\\u003C')
    .replaceAll('>', '\\u003E');
}

function serializeJson(value: unknown, ancestors = new WeakSet(), sortObjectKeys = true): string {
  if (value === null) {
    return 'null';
  }

  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new YamdownRenderError('Annotation data numbers must be finite JSON values.');
    }
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throw new YamdownRenderError('Annotation data must not contain cyclic values.');
    }
    ancestors.add(value);
    const serialized = `[${value.map((entry) => serializeJson(entry, ancestors)).join(',')}]`;
    ancestors.delete(value);
    return serialized;
  }

  if (typeof value !== 'object' || value === null) {
    throw new YamdownRenderError('Annotation data must be JSON-serializable.');
  }

  if (!isRecord(value)) {
    throw new YamdownRenderError('Annotation data must be JSON-serializable.');
  }

  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new YamdownRenderError('Annotation data objects must be plain JSON objects.');
  }

  if (ancestors.has(value)) {
    throw new YamdownRenderError('Annotation data must not contain cyclic values.');
  }

  ancestors.add(value);
  const keys = Object.keys(value);
  if (sortObjectKeys) {
    keys.sort();
  }
  const serialized = `{${keys
    .map((key) => `${JSON.stringify(key)}:${serializeJson(value[key], ancestors)}`)
    .join(',')}}`;
  ancestors.delete(value);
  return serialized;
}

function joinAnnotationParts(...parts: readonly string[]): string {
  return parts.filter((part) => part.length > 0).join('\n');
}

function createFence(value: string, fenceCharacter: '`' | '~'): string {
  return fenceCharacter.repeat(Math.max(3, longestCharacterRun(value, fenceCharacter) + 1));
}

function renderInlineCode(value: string): string {
  const fence = '`'.repeat(longestCharacterRun(value, '`') + 1);
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
        .replaceAll('&', '\\&')
        .replaceAll(/\r\n?|\n/gu, ' ')}"`;
}

function escapeAltText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]')
    .replaceAll('&', '\\&')
    .replaceAll(/\r\n?|\n/gu, ' ');
}

function renderDestination(value: string): string {
  const characters = Array.from(value);
  if (characters.some((character) => isUnsafeDestinationCharacter(character))) {
    const encoded = characters
      .map((character) => (isUnsafeDestinationCharacter(character) ? percentEncodeCharacter(character) : character))
      .join('');
    return `<${encoded.replaceAll('\\', '%5C').replaceAll('&', '\\&')}>`;
  }

  return value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)').replaceAll('&', '\\&');
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

  if (isThematicBreakLine(line)) {
    return line.replace(/[-*_]/u, '\\$&');
  }

  const indentationEscape = escapeCodeIndentation(line);
  if (indentationEscape !== undefined) {
    return indentationEscape;
  }

  if (/^ {0,3}#{1,6}(?:[\t ]|$)/u.test(line)) {
    return line.replace('#', '\\#');
  }

  if (/^ {0,3}[-+](?:[\t ]|$)/u.test(line)) {
    return line.replace(/^([ ]*)([-+])/u, '$1\\$2');
  }

  if (/^ {0,3}\d{1,9}[.)](?:[\t ]|$)/u.test(line)) {
    return line.replace(/^([ ]*\d{1,9})([.)])/u, '$1\\$2');
  }

  return line;
}

function escapeCodeIndentation(line: string): string | undefined {
  if (/^[\t ]*$/u.test(line)) {
    return undefined;
  }

  if (line.startsWith('\t')) {
    return `&#9;${line.slice(1)}`;
  }

  if (line.startsWith('    ')) {
    return `&#32;${line.slice(1)}`;
  }

  let columns = 0;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character !== ' ' && character !== '\t') {
      return undefined;
    }

    const nextColumns = character === '\t' ? columns + (4 - (columns % 4)) : columns + 1;
    if (nextColumns >= 4) {
      const entity = character === '\t' ? '&#9;' : '&#32;';
      return `${line.slice(0, index)}${entity}${line.slice(index + 1)}`;
    }
    columns = nextColumns;
  }

  return undefined;
}

function isThematicBreakLine(line: string): boolean {
  return /^(?: {0,3}(?:\*[\t ]*){3,}| {0,3}(?:_[\t ]*){3,}| {0,3}(?:-[\t ]*){3,})$/u.test(line);
}

function escapeTableCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll(/\r\n?|\n/gu, ' ');
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

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new YamdownRenderError('Table number cells must be finite.');
    }
    return String(value);
  }

  if (typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }

  if (Array.isArray(value) || isRecord(value)) {
    return stringifyTableJson(value);
  }

  throw new YamdownRenderError('Table cell values must be scalar, inline, or JSON-serializable arrays and objects.');
}

function stringifyTableJson(value: readonly unknown[] | Record<string, unknown>): string {
  if (!isJsonTableValue(value)) {
    throw new YamdownRenderError('Table array and object cells must contain only finite JSON-serializable values.');
  }

  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new YamdownRenderError('Table array and object cells must be JSON-serializable.');
    }
    return serialized;
  } catch (error) {
    if (error instanceof YamdownRenderError) {
      throw error;
    }
    throw new YamdownRenderError('Table array and object cells must be JSON-serializable.');
  }
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

function isTableInlineCell(value: unknown): value is TableInlineCell {
  return (
    isRecord(value) &&
    Object.hasOwn(value, 'type') &&
    value.type === 'inline' &&
    Object.hasOwn(value, 'children') &&
    Array.isArray(value.children)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertRenderableList(node: ListNode): void {
  if (!node.ordered && node.start !== undefined) {
    throw new YamdownRenderError('Unordered lists must not define a start value.');
  }

  if (!node.ordered) {
    return;
  }

  const start = node.start ?? 1;
  if (
    !Number.isSafeInteger(start) ||
    start < 1 ||
    start + Math.max(0, node.items.length - 1) > maximumOrderedListMarker
  ) {
    throw new YamdownRenderError(`Ordered list markers must not exceed ${maximumOrderedListMarker}.`);
  }
}

function isRenderableTaskParagraph(block: BlockNode | undefined): boolean {
  if (block?.type !== 'paragraph') {
    return false;
  }
  return 'text' in block ? block.text.length > 0 : block.children.length > 0;
}

function resolveRenderOptions(options: Readonly<RenderOptions> | undefined): ResolvedRenderOptions {
  if (options === undefined) {
    return { ...defaultOptions };
  }

  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    throw new YamdownRenderError('Render options must be an object.');
  }

  const candidate = options as Record<string, unknown>;
  const allowed = new Set(['frontmatter', 'bullet', 'orderedDelimiter', 'codeFence', 'blankLines']);
  for (const key of Object.keys(candidate)) {
    if (!allowed.has(key)) {
      throw new YamdownRenderError(`Unknown render option: ${key}.`);
    }
  }

  const resolved: ResolvedRenderOptions = { ...defaultOptions };
  if (Object.hasOwn(candidate, 'frontmatter')) {
    if (typeof candidate.frontmatter !== 'boolean') {
      throw new YamdownRenderError('Render option frontmatter must be a boolean.');
    }
    resolved.frontmatter = candidate.frontmatter;
  }
  if (Object.hasOwn(candidate, 'bullet')) {
    if (candidate.bullet !== '-' && candidate.bullet !== '*' && candidate.bullet !== '+') {
      throw new YamdownRenderError('Render option bullet must be one of "-", "*", or "+".');
    }
    resolved.bullet = candidate.bullet;
  }
  if (Object.hasOwn(candidate, 'orderedDelimiter')) {
    if (candidate.orderedDelimiter !== '.' && candidate.orderedDelimiter !== ')') {
      throw new YamdownRenderError('Render option orderedDelimiter must be "." or ")".');
    }
    resolved.orderedDelimiter = candidate.orderedDelimiter;
  }
  if (Object.hasOwn(candidate, 'codeFence')) {
    if (candidate.codeFence !== '`' && candidate.codeFence !== '~') {
      throw new YamdownRenderError('Render option codeFence must be "`" or "~".');
    }
    resolved.codeFence = candidate.codeFence;
  }
  if (Object.hasOwn(candidate, 'blankLines')) {
    const blankLines = candidate.blankLines;
    if (typeof blankLines !== 'number' || !Number.isSafeInteger(blankLines) || blankLines < 1) {
      throw new YamdownRenderError('Render option blankLines must be a positive safe integer.');
    }
    resolved.blankLines = blankLines;
  }

  return resolved;
}

function createBlockSeparator(options: ResolvedRenderOptions): string {
  return '\n'.repeat(options.blankLines + 1);
}

function longestCharacterRun(value: string, character: string): number {
  let longest = 0;
  let current = 0;

  for (const candidate of value) {
    if (candidate === character) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }

  return longest;
}

function trimTrailingLineEndings(value: string): string {
  return value.replace(/\n+$/u, '');
}

function unreachable(_value: never): never {
  throw new YamdownRenderError('Unexpected renderer branch.');
}
