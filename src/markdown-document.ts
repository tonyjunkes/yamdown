import type { Html, Node, Parent, Root } from 'mdast';
import { frontmatterFromMarkdown, frontmatterToMarkdown } from 'mdast-util-frontmatter';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown, gfmToMarkdown } from 'mdast-util-gfm';
import { toMarkdown } from 'mdast-util-to-markdown';
import { frontmatter } from 'micromark-extension-frontmatter';
import { gfm } from 'micromark-extension-gfm';
import { YamdownValidationError, type SourceRange, type ValidationIssue } from './errors.js';

const markdownExtensions = [gfm(), frontmatter()];
const markdownMdastExtensions = [gfmFromMarkdown(), frontmatterFromMarkdown()];
const markdownSerializationExtensions = [gfmToMarkdown(), frontmatterToMarkdown(['yaml'])];

type AnnotationType = 'document' | 'node' | 'span' | 'region' | '/span' | '/region';

const knownAnnotationTypes = new Set<string>(['document', 'node', 'span', 'region', '/span', '/region']);
const blockContainerTypes = new Set(['root', 'blockquote', 'listItem', 'footnoteDefinition']);
const inlineContainerTypes = new Set([
  'paragraph',
  'heading',
  'emphasis',
  'strong',
  'delete',
  'link',
  'linkReference',
  'tableCell'
]);

/** A JSON value that can be carried by an annotation's `data` field. */
export type YamdownJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly YamdownJsonValue[]
  | { readonly [key: string]: YamdownJsonValue };

/** The parsed HTML comment that introduced a Yamdown annotation. */
export interface YamdownMarkdownAnnotationMarker {
  readonly node: Html;
  readonly position: SourceRange;
}

/** Common metadata carried by block, inline-span, and region annotations. */
export interface YamdownMarkdownAnnotationMetadata {
  readonly id: string;
  readonly kind?: string;
  readonly data?: YamdownJsonValue;
}

/** A contiguous set of direct mdast children covered by a paired annotation. */
export interface YamdownMarkdownAnnotationScope {
  readonly parent: Parent;
  readonly nodes: readonly Node[];
  readonly position: SourceRange;
}

/** The optional document-wide descriptor that enables the strict base profile. */
export interface YamdownMarkdownDocumentAnnotation {
  readonly type: 'document';
  readonly version: 1;
  readonly profile: 'base';
  readonly marker: YamdownMarkdownAnnotationMarker;
  readonly position: SourceRange;
}

/** Metadata attached to the immediately following direct block sibling. */
export interface YamdownMarkdownNodeAnnotation extends YamdownMarkdownAnnotationMetadata {
  readonly type: 'node';
  readonly marker: YamdownMarkdownAnnotationMarker;
  readonly target: Node;
  readonly position: SourceRange;
}

/** Metadata around a contiguous inline range in one phrasing container. */
export interface YamdownMarkdownSpanAnnotation extends YamdownMarkdownAnnotationMetadata {
  readonly type: 'span';
  readonly opening: YamdownMarkdownAnnotationMarker;
  readonly closing: YamdownMarkdownAnnotationMarker;
  readonly scope: YamdownMarkdownAnnotationScope;
  readonly position: SourceRange;
}

/** Metadata around a contiguous sequence of block siblings in one block container. */
export interface YamdownMarkdownRegionAnnotation extends YamdownMarkdownAnnotationMetadata {
  readonly type: 'region';
  readonly opening: YamdownMarkdownAnnotationMarker;
  readonly closing: YamdownMarkdownAnnotationMarker;
  readonly scope: YamdownMarkdownAnnotationScope;
  readonly position: SourceRange;
}

/** An entry in a parsed document's annotation index. */
export type YamdownMarkdownAnnotation =
  | YamdownMarkdownNodeAnnotation
  | YamdownMarkdownSpanAnnotation
  | YamdownMarkdownRegionAnnotation;

/**
 * Markdown-native Yamdown input. `source` stays byte-exact while `root` and
 * `annotations` provide the parsed manipulation surface.
 */
export interface YamdownMarkdownDocument {
  readonly source: string;
  readonly root: Root;
  readonly document?: YamdownMarkdownDocumentAnnotation;
  readonly annotations: readonly YamdownMarkdownAnnotation[];
}

interface NodeContext {
  readonly node: Node;
  readonly parent?: Parent;
  readonly index?: number;
}

interface AnnotationComment {
  readonly type: AnnotationType;
  readonly payload: unknown;
  readonly context: NodeContext;
}

interface OpeningMetadata extends YamdownMarkdownAnnotationMetadata {
  readonly marker: YamdownMarkdownAnnotationMarker;
  readonly context: NodeContext;
}

interface ClosingMetadata {
  readonly id: string;
  readonly marker: YamdownMarkdownAnnotationMarker;
  readonly context: NodeContext;
}

interface OpenRange {
  readonly type: 'span' | 'region';
  readonly metadata: OpeningMetadata;
}

/** Parse ordinary CommonMark/GFM plus YAML frontmatter into the official mdast shape. */
export function parseMarkdownRoot(source: string): Root {
  return fromMarkdown(source, {
    extensions: markdownExtensions,
    mdastExtensions: markdownMdastExtensions
  });
}

/**
 * Parse Markdown-native Yamdown source. Plain GFM is accepted without a
 * descriptor; a document descriptor enables strict Yamdown annotations.
 */
export function parseMarkdownDocument(source: string): YamdownMarkdownDocument {
  const root = parseMarkdownRoot(source);
  const contexts = collectNodeContexts(root);
  const issues: ValidationIssue[] = [];
  const candidates = contexts.flatMap((context) => parseAnnotationComment(context, issues));

  const documentCandidate = resolveDocumentAnnotation(root, candidates, issues);
  const knownNonDocumentCandidates = candidates.filter((candidate) => candidate.type !== 'document');

  if (documentCandidate === undefined) {
    if (knownNonDocumentCandidates.length > 0) {
      for (const candidate of knownNonDocumentCandidates) {
        addIssue(
          issues,
          'Yamdown node, span, and region annotations require a yamdown:document descriptor.',
          candidate.context.node
        );
      }
    }

    throwIfIssues(issues);
    return { annotations: [], root, source };
  }

  const document = parseDocumentDescriptor(documentCandidate, issues);
  const openingIds = new Map<string, OpeningMetadata>();
  const nodeAnnotations: YamdownMarkdownNodeAnnotation[] = [];
  const spanAnnotations: YamdownMarkdownSpanAnnotation[] = [];
  const regionAnnotations: YamdownMarkdownRegionAnnotation[] = [];
  const markerNodes = new Set<Node>();

  if (document !== undefined) {
    markerNodes.add(document.marker.node);
  }

  const openingCandidates = new Map<AnnotationComment, OpeningMetadata>();
  const closingCandidates = new Map<AnnotationComment, ClosingMetadata>();

  for (const candidate of knownNonDocumentCandidates) {
    if (candidate.type === 'node' || candidate.type === 'span' || candidate.type === 'region') {
      const metadata = parseOpeningMetadata(candidate, issues);
      if (metadata !== undefined) {
        openingCandidates.set(candidate, metadata);
        markerNodes.add(metadata.marker.node);

        const previous = openingIds.get(metadata.id);
        if (previous === undefined) {
          openingIds.set(metadata.id, metadata);
        } else {
          addIssue(issues, `Duplicate Yamdown annotation id: ${JSON.stringify(metadata.id)}.`, candidate.context.node);
        }
      }
      continue;
    }

    const metadata = parseClosingMetadata(candidate, issues);
    if (metadata !== undefined) {
      closingCandidates.set(candidate, metadata);
      markerNodes.add(metadata.marker.node);
    }
  }

  for (const candidate of knownNonDocumentCandidates) {
    if (candidate.type !== 'node') {
      continue;
    }

    const metadata = openingCandidates.get(candidate);
    if (metadata === undefined) {
      continue;
    }

    const target = resolveNodeTarget(candidate.context, markerNodes, issues);
    if (target !== undefined) {
      nodeAnnotations.push({
        ...metadata,
        marker: metadata.marker,
        position: metadata.marker.position,
        target,
        type: 'node'
      });
    }
  }

  for (const annotation of resolvePairedAnnotations(
    'span',
    knownNonDocumentCandidates,
    openingCandidates,
    closingCandidates,
    markerNodes,
    issues
  )) {
    if (annotation.type === 'span') {
      spanAnnotations.push(annotation);
    }
  }
  for (const annotation of resolvePairedAnnotations(
    'region',
    knownNonDocumentCandidates,
    openingCandidates,
    closingCandidates,
    markerNodes,
    issues
  )) {
    if (annotation.type === 'region') {
      regionAnnotations.push(annotation);
    }
  }

  throwIfIssues(issues);

  const annotations = sortAnnotationsBySource([...nodeAnnotations, ...spanAnnotations, ...regionAnnotations]);
  const parsed: YamdownMarkdownDocument = {
    annotations,
    document,
    root,
    source
  };

  validateProjectionParity(parsed, markerNodes);
  return parsed;
}

/** Render the clean Markdown projection, omitting only recognized Yamdown annotations. */
export function renderMarkdownDocument(document: Readonly<YamdownMarkdownDocument>): string {
  return serializeRoot(createSerializedRoot(document, true));
}

/** Canonically serialize Markdown while retaining Yamdown annotations. */
export function serializeMarkdownDocument(document: Readonly<YamdownMarkdownDocument>): string {
  return serializeRoot(createSerializedRoot(document, false));
}

function resolveDocumentAnnotation(
  root: Root,
  candidates: readonly AnnotationComment[],
  issues: ValidationIssue[]
): AnnotationComment | undefined {
  const documentCandidates = candidates.filter((candidate) => candidate.type === 'document');

  if (documentCandidates.length === 0) {
    return undefined;
  }

  const first = documentCandidates[0];
  if (first === undefined) {
    return undefined;
  }

  if (documentCandidates.length > 1) {
    for (const candidate of documentCandidates.slice(1)) {
      addIssue(
        issues,
        'A Yamdown Markdown document may contain only one yamdown:document descriptor.',
        candidate.context.node
      );
    }
  }

  const position = positionOf(first.context.node);
  const firstRootChild = root.children[0];
  const secondRootChild = root.children[1];
  const appearsFirst = first.context.parent === root && first.context.index === 0 && position?.start.offset === 0;
  const appearsAfterFrontmatter =
    first.context.parent === root &&
    first.context.index === 1 &&
    firstRootChild?.type === 'yaml' &&
    position?.start.offset !== undefined;

  if (!appearsFirst && !appearsAfterFrontmatter) {
    addIssue(
      issues,
      'The yamdown:document descriptor must be first, or immediately follow leading YAML frontmatter.',
      first.context.node
    );
  }

  if (appearsAfterFrontmatter && secondRootChild !== first.context.node) {
    addIssue(
      issues,
      'The yamdown:document descriptor must immediately follow leading YAML frontmatter.',
      first.context.node
    );
  }

  return first;
}

function parseDocumentDescriptor(
  candidate: AnnotationComment,
  issues: ValidationIssue[]
): YamdownMarkdownDocumentAnnotation | undefined {
  const payload = asPlainObject(candidate.payload);
  if (payload === undefined) {
    addIssue(issues, 'The yamdown:document payload must be a JSON object.', candidate.context.node);
    return undefined;
  }

  validateExactKeys(payload, ['v', 'profile'], candidate.context.node, issues, 'yamdown:document');
  if (payload.v !== 1) {
    addIssue(issues, 'The yamdown:document payload must contain "v": 1.', candidate.context.node);
  }
  if (payload.profile !== 'base') {
    addIssue(issues, 'The yamdown:document payload must contain "profile": "base".', candidate.context.node);
  }

  if (payload.v !== 1 || payload.profile !== 'base') {
    return undefined;
  }

  const marker = markerFromNode(candidate.context.node);
  if (marker === undefined) {
    return undefined;
  }

  return {
    marker,
    position: marker.position,
    profile: 'base',
    type: 'document',
    version: 1
  };
}

function parseOpeningMetadata(candidate: AnnotationComment, issues: ValidationIssue[]): OpeningMetadata | undefined {
  const payload = asPlainObject(candidate.payload);
  if (payload === undefined) {
    addIssue(issues, `The yamdown:${candidate.type} payload must be a JSON object.`, candidate.context.node);
    return undefined;
  }

  validateExactKeys(payload, ['id', 'kind', 'data'], candidate.context.node, issues, `yamdown:${candidate.type}`);
  const id = parseIdentifier(payload.id, 'id', candidate.context.node, issues);
  const kind = parseOptionalKind(payload.kind, candidate.context.node, issues);

  if (id === undefined) {
    return undefined;
  }

  const marker = markerFromNode(candidate.context.node);
  if (marker === undefined) {
    return undefined;
  }

  const data = Object.hasOwn(payload, 'data') ? asJsonValue(payload.data) : undefined;
  if (Object.hasOwn(payload, 'data') && data === undefined) {
    addIssue(issues, 'The Yamdown annotation data field must be a JSON value.', candidate.context.node);
    return undefined;
  }

  return {
    context: candidate.context,
    ...(data === undefined ? {} : { data }),
    id,
    ...(kind === undefined ? {} : { kind }),
    marker
  };
}

function parseClosingMetadata(candidate: AnnotationComment, issues: ValidationIssue[]): ClosingMetadata | undefined {
  const payload = asPlainObject(candidate.payload);
  if (payload === undefined) {
    addIssue(issues, `The yamdown:${candidate.type} payload must be a JSON object.`, candidate.context.node);
    return undefined;
  }

  validateExactKeys(payload, ['id'], candidate.context.node, issues, `yamdown:${candidate.type}`);
  const id = parseIdentifier(payload.id, 'id', candidate.context.node, issues);
  const marker = markerFromNode(candidate.context.node);
  if (id === undefined || marker === undefined) {
    return undefined;
  }

  return { context: candidate.context, id, marker };
}

function resolveNodeTarget(
  context: NodeContext,
  markerNodes: ReadonlySet<Node>,
  issues: ValidationIssue[]
): Node | undefined {
  if (context.parent === undefined || context.index === undefined || !isBlockContainer(context.parent)) {
    addIssue(issues, 'A yamdown:node annotation must be a standalone child of a block container.', context.node);
    return undefined;
  }

  const target = childrenOf(context.parent)[context.index + 1];
  if (target === undefined || markerNodes.has(target)) {
    addIssue(issues, 'A yamdown:node annotation must be immediately followed by a block.', context.node);
    return undefined;
  }

  if (target.type === 'yaml') {
    addIssue(issues, 'A yamdown:node annotation cannot target YAML frontmatter.', context.node);
    return undefined;
  }

  return target;
}

function resolvePairedAnnotations(
  type: 'span' | 'region',
  candidates: readonly AnnotationComment[],
  openingCandidates: ReadonlyMap<AnnotationComment, OpeningMetadata>,
  closingCandidates: ReadonlyMap<AnnotationComment, ClosingMetadata>,
  markerNodes: ReadonlySet<Node>,
  issues: ValidationIssue[]
): YamdownMarkdownSpanAnnotation[] | YamdownMarkdownRegionAnnotation[] {
  const relevant = candidates.filter((candidate) => candidate.type === type || candidate.type === `/${type}`);
  const openStack: OpenRange[] = [];
  const resolved: (YamdownMarkdownSpanAnnotation | YamdownMarkdownRegionAnnotation)[] = [];

  for (const candidate of relevant) {
    if (candidate.type === type) {
      const metadata = openingCandidates.get(candidate);
      if (metadata === undefined) {
        continue;
      }

      if (!isLegalRangeContainer(type, candidate.context.parent)) {
        addIssue(
          issues,
          `A yamdown:${type} annotation must be a direct child of a ${type === 'span' ? 'phrasing' : 'block'} container.`,
          candidate.context.node
        );
        continue;
      }

      openStack.push({ metadata, type });
      continue;
    }

    const closing = closingCandidates.get(candidate);
    if (closing === undefined) {
      continue;
    }

    if (!isLegalRangeContainer(type, candidate.context.parent)) {
      addIssue(
        issues,
        `A yamdown:/${type} annotation must be a direct child of a ${type === 'span' ? 'phrasing' : 'block'} container.`,
        candidate.context.node
      );
      continue;
    }

    const opening = openStack.at(-1);
    if (opening === undefined) {
      addIssue(
        issues,
        `Unmatched yamdown:/${type} annotation for id ${JSON.stringify(closing.id)}.`,
        candidate.context.node
      );
      continue;
    }

    if (opening.metadata.id !== closing.id) {
      addIssue(
        issues,
        `Yamdown ${type} annotations must close in nesting order; expected ${JSON.stringify(opening.metadata.id)}.`,
        candidate.context.node
      );
      continue;
    }

    openStack.pop();
    if (opening.metadata.context.parent !== closing.context.parent) {
      addIssue(
        issues,
        `A yamdown:${type} annotation must close in the same container where it opened.`,
        candidate.context.node
      );
      continue;
    }

    const scope = resolveScope(opening.metadata.context, closing.context, markerNodes, issues, type);
    if (scope === undefined) {
      continue;
    }

    const position = enclosingPosition(opening.metadata.marker.position, closing.marker.position);
    if (type === 'span') {
      resolved.push({
        ...opening.metadata,
        closing: closing.marker,
        opening: opening.metadata.marker,
        position,
        scope,
        type: 'span'
      });
    } else {
      resolved.push({
        ...opening.metadata,
        closing: closing.marker,
        opening: opening.metadata.marker,
        position,
        scope,
        type: 'region'
      });
    }
  }

  for (const opening of openStack) {
    addIssue(
      issues,
      `Unclosed yamdown:${type} annotation for id ${JSON.stringify(opening.metadata.id)}.`,
      opening.metadata.context.node
    );
  }

  return type === 'span'
    ? resolved.filter((annotation): annotation is YamdownMarkdownSpanAnnotation => annotation.type === 'span')
    : resolved.filter((annotation): annotation is YamdownMarkdownRegionAnnotation => annotation.type === 'region');
}

function resolveScope(
  opening: NodeContext,
  closing: NodeContext,
  markerNodes: ReadonlySet<Node>,
  issues: ValidationIssue[],
  type: 'span' | 'region'
): YamdownMarkdownAnnotationScope | undefined {
  const parent = opening.parent;
  if (parent === undefined || opening.index === undefined || closing.index === undefined) {
    return undefined;
  }

  if (closing.index <= opening.index) {
    addIssue(issues, `A yamdown:${type} annotation must surround a forward contiguous range.`, opening.node);
    return undefined;
  }

  const nodes = childrenOf(parent)
    .slice(opening.index + 1, closing.index)
    .filter((node) => !markerNodes.has(node));
  const first = nodes[0];
  const last = nodes.at(-1);
  const firstPosition = first === undefined ? undefined : positionOf(first);
  const lastPosition = last === undefined ? undefined : positionOf(last);
  if (firstPosition === undefined || lastPosition === undefined) {
    addIssue(issues, `A yamdown:${type} annotation must surround at least one Markdown node.`, opening.node);
    return undefined;
  }

  return {
    nodes,
    parent,
    position: enclosingPosition(firstPosition, lastPosition)
  };
}

function validateProjectionParity(document: YamdownMarkdownDocument, markerNodes: ReadonlySet<Node>): void {
  const projectedSource = stripMarkerRanges(document.source, markerNodes);
  const projectedRoot = parseMarkdownRoot(projectedSource);
  const expectedRoot = createSerializedRoot(document, true);

  if (semanticMdast(expectedRoot) === semanticMdast(projectedRoot)) {
    return;
  }

  const firstMarker = [...markerNodes][0];
  const issue: ValidationIssue = {
    code: 'projection_parity',
    location: firstMarker === undefined ? undefined : positionOf(firstMarker),
    message: 'Removing Yamdown annotations changes the Markdown document meaning.'
  };
  throw new YamdownValidationError(`Invalid Yamdown Markdown document: ${issue.message}`, [issue]);
}

function createSerializedRoot(document: Readonly<YamdownMarkdownDocument>, stripAnnotations: boolean): Root {
  const root = structuredClone(document.root);
  const canonicalMarkers = markerSerializationMap(document);
  transformMutableNode(root, canonicalMarkers, stripAnnotations);
  return root;
}

function markerSerializationMap(document: Readonly<YamdownMarkdownDocument>): ReadonlyMap<number, string> {
  const markers = new Map<number, string>();
  const add = (marker: YamdownMarkdownAnnotationMarker, value: string): void => {
    const offset = marker.node.position?.start.offset;
    if (offset !== undefined) {
      markers.set(offset, value);
    }
  };

  if (document.document !== undefined) {
    add(document.document.marker, `<!-- yamdown:document ${JSON.stringify({ v: 1, profile: 'base' })} -->`);
  }

  for (const annotation of document.annotations) {
    if (annotation.type === 'node') {
      add(annotation.marker, openingComment('node', annotation));
      continue;
    }

    add(annotation.opening, openingComment(annotation.type, annotation));
    add(annotation.closing, closingComment(annotation.type, annotation.id));
  }

  return markers;
}

function openingComment(type: 'node' | 'span' | 'region', metadata: YamdownMarkdownAnnotationMetadata): string {
  const fields = [`"id":${JSON.stringify(metadata.id)}`];
  if (metadata.kind !== undefined) {
    fields.push(`"kind":${JSON.stringify(metadata.kind)}`);
  }
  if (metadata.data !== undefined) {
    fields.push(`"data":${serializeCanonicalJson(metadata.data)}`);
  }
  return `<!-- yamdown:${type} {${fields.join(',')}} -->`;
}

function closingComment(type: 'span' | 'region', id: string): string {
  return `<!-- yamdown:/${type} ${JSON.stringify({ id })} -->`;
}

function serializeCanonicalJson(value: YamdownJsonValue): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (isJsonArray(value)) {
    return `[${value.map((item) => serializeCanonicalJson(item)).join(',')}]`;
  }

  const record = value;
  return `{${Object.keys(record)
    .toSorted()
    .map((key) => `${JSON.stringify(key)}:${serializeCanonicalJson(record[key] ?? null)}`)
    .join(',')}}`;
}

function stripMarkerRanges(source: string, markerNodes: ReadonlySet<Node>): string {
  const ranges = [...markerNodes]
    .flatMap((node) => {
      const position = positionOf(node);
      return position === undefined ? [] : [position];
    })
    .toSorted((left, right) => right.start.offset - left.start.offset);

  return ranges.reduce((result, range) => result.slice(0, range.start.offset) + result.slice(range.end.offset), source);
}

function semanticMdast(root: Root): string {
  return JSON.stringify(normalizeSemanticNode(root));
}

function normalizeSemanticNode(node: Node): unknown {
  const { data: _data, position: _position, ...copy } = node;
  if (!isParentNode(node)) {
    return copy;
  }

  return {
    ...copy,
    children: coalesceTextNodes(node.children.map((child) => normalizeSemanticNode(child)))
  };
}

function coalesceTextNodes(nodes: readonly unknown[]): unknown[] {
  const result: unknown[] = [];
  for (const node of nodes) {
    const previous = result.at(-1);
    if (isTextNode(previous) && isTextNode(node)) {
      previous.value += node.value;
    } else {
      result.push(node);
    }
  }
  return result;
}

function isTextNode(value: unknown): value is { type: 'text'; value: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'text' &&
    typeof (value as { value?: unknown }).value === 'string'
  );
}

function serializeRoot(root: Root): string {
  return toMarkdown(root, { extensions: markdownSerializationExtensions });
}

function parseAnnotationComment(context: NodeContext, issues: ValidationIssue[]): AnnotationComment[] {
  if (!isHtmlNode(context.node)) {
    return [];
  }

  const { value } = context.node;
  const knownPrefix = /^<!--\s*yamdown:(?:document|node|span|region|\/span|\/region)(?=\s|-->|$)/u;
  if (!knownPrefix.test(value)) {
    return [];
  }

  const match = /^<!--\s*yamdown:([A-Za-z/]+)(?:\s+([\s\S]*?))?\s*-->$/u.exec(value);
  if (match === null) {
    addIssue(issues, 'Malformed Yamdown annotation comment.', context.node);
    return [];
  }

  const type = match[1];
  const payloadText = match[2];
  if (type === undefined || !isAnnotationType(type)) {
    return [];
  }
  if (payloadText === undefined) {
    addIssue(issues, `The yamdown:${type} annotation requires a JSON payload.`, context.node);
    return [];
  }

  try {
    return [{ context, payload: JSON.parse(payloadText), type }];
  } catch {
    addIssue(issues, `The yamdown:${type} annotation payload must be valid JSON.`, context.node);
    return [];
  }
}

function collectNodeContexts(root: Root): NodeContext[] {
  const contexts: NodeContext[] = [];
  const visit = (node: Node, parent?: Parent, index?: number): void => {
    const context = { index, node, parent };
    contexts.push(context);
    if (isParentNode(node)) {
      for (const [childIndex, child] of node.children.entries()) {
        visit(child, node, childIndex);
      }
    }
  };
  visit(root);
  return contexts;
}

function transformMutableNode(
  node: Node,
  canonicalMarkers: ReadonlyMap<number, string>,
  stripAnnotations: boolean
): void {
  if (isHtmlNode(node)) {
    const offset = node.position?.start.offset;
    if (offset !== undefined && canonicalMarkers.has(offset) && !stripAnnotations) {
      node.value = canonicalMarkers.get(offset) ?? node.value;
    }
  }

  if (!isParentNode(node)) {
    return;
  }

  const children = node.children;
  const transformed = stripAnnotations
    ? children.filter((child) => {
        const offset = child.position?.start.offset;
        return offset === undefined || !canonicalMarkers.has(offset);
      })
    : children;
  if (stripAnnotations) {
    node.children = transformed;
  }
  for (const child of transformed) {
    transformMutableNode(child, canonicalMarkers, stripAnnotations);
  }
}

function childrenOf(node: Node): readonly Node[] {
  return isParentNode(node) ? node.children : [];
}

function isBlockContainer(node: Parent): boolean {
  return blockContainerTypes.has(node.type);
}

function isLegalRangeContainer(type: 'span' | 'region', parent: Parent | undefined): parent is Parent {
  if (parent === undefined) {
    return false;
  }
  return type === 'span' ? inlineContainerTypes.has(parent.type) : isBlockContainer(parent);
}

function markerFromNode(node: Node): YamdownMarkdownAnnotationMarker | undefined {
  if (!isHtmlNode(node)) {
    return undefined;
  }
  const position = positionOf(node);
  return position === undefined ? undefined : { node, position };
}

function positionOf(node: Node): SourceRange | undefined {
  const position = node.position;
  if (position === undefined || position.start.offset === undefined || position.end.offset === undefined) {
    return undefined;
  }
  return {
    end: {
      column: position.end.column,
      line: position.end.line,
      offset: position.end.offset
    },
    start: {
      column: position.start.column,
      line: position.start.line,
      offset: position.start.offset
    }
  };
}

function enclosingPosition(start: SourceRange, end: SourceRange): SourceRange {
  return { end: end.end, start: start.start };
}

function parseIdentifier(value: unknown, field: string, node: Node, issues: ValidationIssue[]): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) {
    addIssue(issues, `The Yamdown annotation ${field} must be a nonempty string.`, node);
    return undefined;
  }
  return value;
}

function parseOptionalKind(value: unknown, node: Node, issues: ValidationIssue[]): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    addIssue(issues, 'The Yamdown annotation kind must be a nonempty string when supplied.', node);
    return undefined;
  }
  return value;
}

function asPlainObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  return Object.fromEntries(Object.entries(value));
}

function asJsonValue(value: unknown): YamdownJsonValue | undefined {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (Array.isArray(value)) {
    const values: YamdownJsonValue[] = [];
    for (const item of value) {
      const jsonValue = asJsonValue(item);
      if (jsonValue === undefined) {
        return undefined;
      }
      values.push(jsonValue);
    }
    return values;
  }
  const record = asPlainObject(value);
  if (record === undefined) {
    return undefined;
  }
  const values: [string, YamdownJsonValue][] = [];
  for (const [key, item] of Object.entries(record)) {
    const jsonValue = asJsonValue(item);
    if (jsonValue === undefined) {
      return undefined;
    }
    values.push([key, jsonValue]);
  }
  return Object.fromEntries(values);
}

function isAnnotationType(value: string): value is AnnotationType {
  return knownAnnotationTypes.has(value);
}

function isHtmlNode(node: Node): node is Html {
  return node.type === 'html' && 'value' in node && typeof node.value === 'string';
}

function isJsonArray(value: YamdownJsonValue): value is readonly YamdownJsonValue[] {
  return Array.isArray(value);
}

function isParentNode(node: Node): node is Parent {
  return 'children' in node && Array.isArray(node.children);
}

function validateExactKeys(
  payload: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  node: Node,
  issues: ValidationIssue[],
  name: string
): void {
  for (const key of Object.keys(payload)) {
    if (!allowed.includes(key)) {
      addIssue(issues, `The ${name} payload does not allow the key ${JSON.stringify(key)}.`, node);
    }
  }
  for (const key of allowed) {
    if (!Object.hasOwn(payload, key) && (name === 'yamdown:document' || key === 'id')) {
      addIssue(issues, `The ${name} payload requires the key ${JSON.stringify(key)}.`, node);
    }
  }
}

function sortAnnotationsBySource(annotations: readonly YamdownMarkdownAnnotation[]): YamdownMarkdownAnnotation[] {
  return [...annotations].toSorted((left, right) => left.position.start.offset - right.position.start.offset);
}

function addIssue(issues: ValidationIssue[], message: string, node: Node): void {
  issues.push({ code: 'markdown_annotation', location: positionOf(node), message });
}

function throwIfIssues(issues: readonly ValidationIssue[]): void {
  if (issues.length === 0) {
    return;
  }
  const first = issues[0];
  const suffix = first === undefined ? '' : `: ${first.message}`;
  throw new YamdownValidationError(`Invalid Yamdown Markdown document${suffix}`, issues);
}
