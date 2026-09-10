import { fromMarkdown } from 'mdast-util-from-markdown';
import { describe, expect, test } from 'vitest';
import {
  normalizeDocument,
  parseYamlDocument,
  renderMarkdown,
  toMdast,
  YamdownValidationError,
  renderYamlMarkdown,
  parseMarkdownDocument,
  renderMarkdownDocument,
  renderDocument
} from '../src/index.js';
import type { ElementNode } from '../src/index.js';

function validationError(source: string): YamdownValidationError {
  try {
    parseYamlDocument(source);
  } catch (error) {
    if (error instanceof YamdownValidationError) return error;
    throw error;
  }
  throw new Error('Expected validation failure');
}

describe('elements', () => {
  test('preserves element tags when projecting profiled annotations to clean Markdown', () => {
    const document = normalizeDocument({
      yamdown: { v: 1, profile: 'base' },
      blocks: [
        {
          type: 'annotatedRegion',
          id: 'outer',
          blocks: [
            {
              element: {
                name: 'context',
                attrs: { id: 'outer' },
                blocks: [
                  { type: 'annotatedBlock', id: 'heading', block: { h2: 'Context' } },
                  {
                    type: 'paragraph',
                    children: [
                      { type: 'text', value: 'Read ' },
                      { type: 'annotatedSpan', id: 'text', children: [{ type: 'text', value: 'Literal *text*' }] }
                    ]
                  }
                ]
              }
            }
          ]
        }
      ]
    });
    const parsed = parseMarkdownDocument(renderDocument(document));
    expect(parsed.annotations.map(({ id }) => id)).toEqual(['outer', 'heading', 'text']);
    expect(renderMarkdownDocument(parsed)).toBe(
      '<context id="outer">\n\n## Context\n\nRead Literal \\*text\\*\n\n</context>\n'
    );
  });

  test('checks annotation descriptors and duplicate IDs inside elements', () => {
    const block = {
      element: { name: 'context', blocks: [{ type: 'annotatedBlock', id: 'same', block: { p: 'Body' } }] }
    };
    expect(() => normalizeDocument({ blocks: [block] })).toThrow(/require a yamdown descriptor/u);
    expect(() => normalizeDocument({ yamdown: { v: 1, profile: 'base' }, blocks: [block, block] })).toThrow(
      /Duplicate annotation identifier: same/u
    );
  });

  test('keeps region closing markers separate from annotated element tags', () => {
    const document = normalizeDocument({
      yamdown: { v: 1, profile: 'base' },
      blocks: [
        {
          type: 'annotatedRegion',
          id: 'region',
          blocks: [
            { type: 'annotatedBlock', id: 'node', block: { element: { name: 'context', blocks: [{ p: 'Body' }] } } }
          ]
        }
      ]
    });
    const parsed = parseMarkdownDocument(renderDocument(document));
    expect(parsed.annotations.map(({ id }) => id)).toEqual(['region', 'node']);
    expect(renderMarkdownDocument(parsed)).toBe('<context>\n\nBody\n\n</context>\n');
  });

  test('uses validated render options throughout element children', () => {
    const document = normalizeDocument({
      blocks: [{ element: { name: 'context', blocks: [{ ul: ['One'] }, { code: 'value' }] } }]
    });
    expect(renderDocument(document, { bullet: '+', codeFence: '~', blankLines: 2 })).toBe(
      '<context>\n\n\n+ One\n\n\n~~~\nvalue\n~~~\n\n\n</context>\n'
    );
  });
  test('normalizes mixed shorthand and verbose children without mutating input', () => {
    const input = {
      blocks: [
        {
          element: {
            name: 'task',
            attrs: { id: 'a' },
            blocks: [{ type: 'element', name: 'context', blocks: [{ p: 'Hello' }] }]
          }
        }
      ]
    };
    const original = structuredClone(input);
    expect(normalizeDocument(input)).toEqual({
      blocks: [
        {
          type: 'element',
          name: 'task',
          attrs: { id: 'a' },
          blocks: [{ type: 'element', name: 'context', blocks: [{ type: 'paragraph', text: 'Hello' }] }]
        }
      ]
    });
    expect(input).toEqual(original);
  });

  test('sorts attributes and escapes values without losing scalar types', () => {
    const node = {
      type: 'element',
      name: 'source-doc',
      attrs: {
        z: '"<&>\t\n\r',
        enabled: false,
        count: 0,
        empty: ''
      },
      blocks: []
    } satisfies ElementNode;
    expect(renderMarkdown({ blocks: [node] })).toBe(
      '<source-doc count="0" empty="" enabled="false" z="&quot;&lt;&amp;&gt;&#9;&#10;&#13;">\n\n</source-doc>\n'
    );
    expect(
      renderMarkdown({
        blocks: [{ ...node, attrs: { empty: '', count: 0, enabled: false, z: '"<&>\t\n\r' } }]
      })
    ).toBe(renderMarkdown({ blocks: [node] }));
  });

  test('supports empty elements and custom spacing', () => {
    expect(renderMarkdown({ blocks: [{ type: 'element', name: 'context', blocks: [] }] }, { blankLines: 2 })).toBe(
      '<context>\n\n\n</context>\n'
    );
  });

  test('renders elements inside lists and blockquotes', () => {
    expect(
      renderYamlMarkdown(
        'blocks:\n  - quote:\n      - ul:\n          - blocks:\n              - element:\n                  name: context\n                  blocks:\n                    - p: Hello\n'
      )
    ).toBe('> - <context>\n>\n>   Hello\n>\n>   </context>\n');
  });

  test.each([
    { name: '', blocks: [] },
    { name: 'bad name', blocks: [] },
    { name: 'task><injected', blocks: [] },
    { name: '1task', blocks: [] },
    { name: 'task', attrs: { 'bad key': 'value' }, blocks: [] },
    { name: 'task', attrs: { id: null }, blocks: [] },
    { name: 'task', attrs: { id: ['a'] }, blocks: [] },
    { name: 'task', attrs: { id: {} }, blocks: [] },
    { name: 'task', attrs: { id: Infinity }, blocks: [] },
    { name: 'task' },
    { name: 'task', blocks: [], extra: true },
    { name: 'task', blocks: [{ type: 'definition', identifier: 'a', url: '/' }] }
  ])('rejects malformed element bodies: %j', (element) => {
    expect(() => normalizeDocument({ blocks: [{ element }] })).toThrow(YamdownValidationError);
    expect(() => normalizeDocument({ blocks: [{ type: 'element', ...element }] })).toThrow(YamdownValidationError);
  });

  test('reports invalid names at their YAML source field', () => {
    const error = validationError('blocks:\n  - element:\n      name: bad name\n      blocks: []\n');
    expect(error.issues[0]).toMatchObject({
      path: ['blocks', 0, 'element', 'name'],
      location: { start: { line: 3, column: 13 } }
    });
  });

  test('rejects reserved attributes instead of silently discarding them', () => {
    const attrs: unknown = JSON.parse('{"__proto__":"keep me"}');
    expect(() => normalizeDocument({ blocks: [{ element: { name: 'context', attrs, blocks: [] } }] })).toThrow(
      /Reserved element attribute name/u
    );
    const error = validationError(
      'blocks:\n  - element:\n      name: context\n      attrs:\n        __proto__: keep me\n      blocks: []\n'
    );
    expect(error.issues[0]).toMatchObject({
      path: ['blocks', 0, 'element', 'attrs', '__proto__'],
      location: { start: { line: 5, column: 20 } }
    });
  });

  test('validates nested references and maps canonical paths back to YAML', () => {
    const source =
      'blocks:\n  - element:\n      name: context\n      blocks:\n        - type: paragraph\n          children:\n            - type: footnoteReference\n              identifier: missing\n';
    const error = validationError(source);
    expect(error.issues[0]).toMatchObject({
      path: ['blocks', 0, 'blocks', 0, 'children', 0, 'identifier'],
      location: { start: { line: 8, column: 27 } }
    });
    expect(
      renderYamlMarkdown(
        source + '  - type: footnoteDefinition\n    identifier: missing\n    blocks:\n      - p: Note\n'
      )
    ).toContain('[^missing]');
  });

  test.each(['context', 'div', 'script'])('keeps official Markdown parsing behavior for %s', (name) => {
    const input = {
      blocks: [
        { type: 'element' as const, name, blocks: [{ type: 'heading' as const, depth: 1 as const, text: 'Title' }] }
      ]
    };
    expect(toMdast(input)).toEqual(fromMarkdown(renderMarkdown(input)));
  });

  test('represents custom tags as HTML around Markdown children', () => {
    expect(
      toMdast({
        blocks: [{ type: 'element', name: 'context', blocks: [{ type: 'heading', depth: 1, text: 'Title' }] }]
      }).children
    ).toMatchObject([
      { type: 'html', value: '<context>' },
      { type: 'heading', depth: 1 },
      { type: 'html', value: '</context>' }
    ]);
  });
});
