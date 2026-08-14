import { describe, expect, test } from 'vitest';
import { parseMarkdownDocument, renderMarkdownDocument, serializeMarkdownDocument } from '../src/markdown-document.js';
import { YamdownValidationError, type ValidationIssue } from '../src/errors.js';

function parseValidationFailure(action: () => void): YamdownValidationError {
  try {
    action();
  } catch (error) {
    if (error instanceof YamdownValidationError) {
      return error;
    }
    throw error;
  }

  throw new Error('Expected Markdown document parsing to fail.');
}

function hasIssueAtLine(issues: readonly ValidationIssue[], line: number): boolean {
  return issues.some((issue) => issue.location?.start.line === line);
}

function hasIssueMessage(issues: readonly ValidationIssue[], message: string): boolean {
  return issues.some((issue) => issue.message.includes(message));
}

function hasIssueAtLineWithMessage(issues: readonly ValidationIssue[], line: number, message: string): boolean {
  return issues.some((issue) => issue.location?.start.line === line && issue.message.includes(message));
}

describe('Markdown-native documents', () => {
  test('accepts unprofiled GFM without interpreting ordinary comments', () => {
    const source = '# Hello\n\n- [x] Task\n\n<!-- yamdown:future {"id":"kept"} -->\n';
    const document = parseMarkdownDocument(source);

    expect(document.document).toBeUndefined();
    expect(document.annotations).toEqual([]);
    expect(document.root.children).toMatchObject([
      { type: 'heading', depth: 1 },
      { type: 'list', children: [{ checked: true }] },
      { type: 'html', value: '<!-- yamdown:future {"id":"kept"} -->' }
    ]);
  });

  test('indexes document, node, span, and region annotations and emits clean Markdown', () => {
    const source = [
      '---',
      'title: Yamdown',
      '---',
      '',
      '<!-- yamdown:document {"profile":"base","v":1} -->',
      '',
      '<!-- yamdown:node {"data":{"tone":"warm"},"id":"intro","kind":"hero"} -->',
      '# Welcome',
      '',
      '<!-- yamdown:region {"id":"guide","kind":"section"} -->',
      'Read the <!-- yamdown:span {"id":"product","kind":"name"} -->Yamdown<!-- yamdown:/span {"id":"product"} --> guide.',
      '<!-- yamdown:/region {"id":"guide"} -->',
      ''
    ].join('\n');
    const document = parseMarkdownDocument(source);

    expect(document.document).toMatchObject({ profile: 'base', version: 1 });
    expect(document.annotations.map((annotation) => annotation.type)).toEqual(['node', 'region', 'span']);
    expect(document.annotations[0]).toMatchObject({ id: 'intro', target: { type: 'heading' }, type: 'node' });
    expect(document.annotations[1]).toMatchObject({
      id: 'guide',
      scope: { nodes: [{ type: 'paragraph' }] },
      type: 'region'
    });
    expect(document.annotations[2]).toMatchObject({
      id: 'product',
      scope: { nodes: [{ type: 'text', value: 'Yamdown' }] },
      type: 'span'
    });

    expect(renderMarkdownDocument(document)).toBe('---\ntitle: Yamdown\n---\n\n# Welcome\n\nRead the Yamdown guide.\n');
    expect(serializeMarkdownDocument(document)).toBe(
      [
        '---',
        'title: Yamdown',
        '---',
        '',
        '<!-- yamdown:document {"v":1,"profile":"base"} -->',
        '',
        '<!-- yamdown:node {"id":"intro","kind":"hero","data":{"tone":"warm"}} -->',
        '',
        '# Welcome',
        '',
        '<!-- yamdown:region {"id":"guide","kind":"section"} -->',
        '',
        'Read the <!-- yamdown:span {"id":"product","kind":"name"} -->Yamdown<!-- yamdown:/span {"id":"product"} --> guide.',
        '',
        '<!-- yamdown:/region {"id":"guide"} -->',
        ''
      ].join('\n')
    );
  });

  test('supports properly nested spans and regions while retaining the original source', () => {
    const source = [
      '<!-- yamdown:document {"v":1,"profile":"base"} -->',
      '',
      '<!-- yamdown:region {"id":"outer"} -->',
      '# Outer',
      '',
      '<!-- yamdown:region {"id":"inner"} -->',
      'A <!-- yamdown:span {"id":"phrase","data":{"z":1,"a":2}} -->nested <!-- yamdown:span {"id":"word"} -->span<!-- yamdown:/span {"id":"word"} --><!-- yamdown:/span {"id":"phrase"} -->.',
      '<!-- yamdown:/region {"id":"inner"} -->',
      '<!-- yamdown:/region {"id":"outer"} -->',
      ''
    ].join('\n');
    const document = parseMarkdownDocument(source);

    expect(document.source).toBe(source);
    expect(document.annotations.map((annotation) => annotation.id)).toEqual(['outer', 'inner', 'phrase', 'word']);
    expect(renderMarkdownDocument(document)).toBe('# Outer\n\nA nested span.\n');
    expect(serializeMarkdownDocument(document)).toContain('<!-- yamdown:span {"id":"phrase","data":{"a":2,"z":1}} -->');
  });

  test('preserves text that only looks like an annotation inside code or raw HTML', () => {
    const document = parseMarkdownDocument(
      [
        '<!-- yamdown:document {"v":1,"profile":"base"} -->',
        '',
        '```md',
        '<!-- yamdown:node {"id":"literal"} -->',
        '```',
        '',
        '<div><!-- yamdown:node {"id":"raw"} --></div>',
        ''
      ].join('\n')
    );

    expect(document.annotations).toEqual([]);
    expect(renderMarkdownDocument(document)).toContain('<!-- yamdown:node {"id":"literal"} -->');
    expect(renderMarkdownDocument(document)).toContain('<div><!-- yamdown:node {"id":"raw"} --></div>');
  });

  test('preserves unknown namespaced comments in a profiled document', () => {
    const document = parseMarkdownDocument(
      [
        '<!-- yamdown:document {"v":1,"profile":"base"} -->',
        '',
        '<!-- yamdown:future {"id":"still-raw"} -->',
        '',
        '# Heading',
        ''
      ].join('\n')
    );

    expect(document.annotations).toEqual([]);
    expect(renderMarkdownDocument(document)).toBe('<!-- yamdown:future {"id":"still-raw"} -->\n\n# Heading\n');
  });

  test('supports properly nested spans and regions while indexing each direct scope', () => {
    const document = parseMarkdownDocument(
      [
        '<!-- yamdown:document {"v":1,"profile":"base"} -->',
        '',
        '<!-- yamdown:region {"id":"outer-region"} -->',
        '# Outer',
        '',
        '<!-- yamdown:region {"id":"inner-region"} -->',
        'Text <!-- yamdown:span {"id":"outer-span"} -->outer <!-- yamdown:span {"id":"inner-span"} -->inner<!-- yamdown:/span {"id":"inner-span"} --> end<!-- yamdown:/span {"id":"outer-span"} -->.',
        '<!-- yamdown:/region {"id":"inner-region"} -->',
        '',
        '<!-- yamdown:/region {"id":"outer-region"} -->',
        ''
      ].join('\n')
    );

    expect(document.annotations.map((annotation) => annotation.id)).toEqual([
      'outer-region',
      'inner-region',
      'outer-span',
      'inner-span'
    ]);
    expect(document.annotations.find((annotation) => annotation.id === 'outer-region')).toMatchObject({
      scope: { nodes: [{ type: 'heading' }, { type: 'paragraph' }] }
    });
    expect(document.annotations.find((annotation) => annotation.id === 'outer-span')).toMatchObject({
      scope: {
        nodes: [
          { type: 'text', value: 'outer ' },
          { type: 'text', value: 'inner' },
          { type: 'text', value: ' end' }
        ]
      }
    });
  });

  test('rejects malformed annotations, duplicate ids, invalid placement, and crossing scopes with locations', () => {
    const source = [
      '<!-- yamdown:document {"v":1,"profile":"base"} -->',
      '',
      '<!-- yamdown:node {"id":"same"} -->',
      '# One',
      '',
      '<!-- yamdown:node {"id":"same"} -->',
      '# Two',
      '',
      'Text <!-- yamdown:node {"id":"inline"} --> here.',
      '',
      '<!-- yamdown:region {"id":"outside"} -->',
      '<!-- yamdown:region {"id":"inside"} -->',
      'Paragraph',
      '<!-- yamdown:/region {"id":"outside"} -->',
      '<!-- yamdown:/region {"id":"inside"} -->',
      ''
    ].join('\n');

    const validationError = parseValidationFailure(() => {
      parseMarkdownDocument(source);
    });

    expect(hasIssueAtLine(validationError.issues, 9)).toBe(true);
    expect(hasIssueMessage(validationError.issues, 'Duplicate')).toBe(true);
    expect(hasIssueMessage(validationError.issues, 'nesting order')).toBe(true);
  });

  test('rejects known annotations without the strict document descriptor', () => {
    expect(() => parseMarkdownDocument('<!-- yamdown:node {"id":"intro"} -->\n\n# Intro\n')).toThrow(
      YamdownValidationError
    );
  });

  test('rejects invalid document descriptor placement and malformed known payloads', () => {
    expect(() => parseMarkdownDocument('# Heading\n\n<!-- yamdown:document {"v":1,"profile":"base"} -->\n')).toThrow(
      YamdownValidationError
    );
    expect(() =>
      parseMarkdownDocument(
        '<!-- yamdown:document {"v":1,"profile":"base"} -->\n\n<!-- yamdown:node nope -->\n# Heading\n'
      )
    ).toThrow(/valid JSON/u);
  });

  test('reports malformed JSON from parsed annotation comments with a source range', () => {
    const source = [
      '<!-- yamdown:document {"v":1,"profile":"base"} -->',
      '',
      '<!-- yamdown:node {"id": } -->',
      '# Heading',
      ''
    ].join('\n');

    const validationError = parseValidationFailure(() => {
      parseMarkdownDocument(source);
    });

    expect(hasIssueAtLineWithMessage(validationError.issues, 3, 'valid JSON')).toBe(true);
  });

  test('rejects annotations whose physical removal would change Markdown meaning', () => {
    const source = [
      '<!-- yamdown:document {"v":1,"profile":"base"} -->',
      '',
      'foo*<!-- yamdown:span {"id":"word"} -->word<!-- yamdown:/span {"id":"word"} -->*',
      ''
    ].join('\n');

    expect(() => parseMarkdownDocument(source)).toThrow(/changes the Markdown document meaning/u);
  });
});
