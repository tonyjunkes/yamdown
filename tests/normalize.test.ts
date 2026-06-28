import { describe, expect, test } from 'vitest';
import { YamdownValidationError, normalizeDocument } from '../src/index.js';
import { resolveOrigin } from '../src/normalize.js';

describe('normalizeDocument', () => {
  test('resolves source origins by nearest parent and falls back to the canonical path', () => {
    const origins = new Map([[JSON.stringify(['blocks', 0]), ['blocks', 0, 'quote']]]);

    expect(resolveOrigin(origins, ['blocks', 0, 'blocks', 1, 'text'])).toEqual([
      'blocks',
      0,
      'quote',
      'blocks',
      1,
      'text'
    ]);
    expect(resolveOrigin(new Map(), ['blocks', 2, 'identifier'])).toEqual(['blocks', 2, 'identifier']);
  });
  test('normalizes shorthand blocks and nested list items', () => {
    expect(
      normalizeDocument({
        blocks: [
          { h1: 'Title' },
          { p: 'Body' },
          { markdown: '**Raw block**' },
          {
            table: {
              columns: [{ key: 'name', label: 'Name', align: 'left' }],
              rows: [{ name: 'YAML' }]
            }
          },
          { ul: ['One', { checked: true, blocks: [{ quote: [{ p: 'Nested quote' }] }] }] },
          { hr: true },
          { html: '<br>' }
        ]
      })
    ).toEqual({
      blocks: [
        { type: 'heading', depth: 1, text: 'Title' },
        { type: 'paragraph', text: 'Body' },
        { type: 'markdown', value: '**Raw block**' },
        {
          type: 'table',
          columns: [{ key: 'name', label: 'Name', align: 'left' }],
          rows: [{ name: 'YAML' }]
        },
        {
          type: 'list',
          ordered: false,
          items: [
            { blocks: [{ type: 'paragraph', text: 'One' }] },
            {
              checked: true,
              blocks: [
                {
                  type: 'blockquote',
                  blocks: [{ type: 'paragraph', text: 'Nested quote' }]
                }
              ]
            }
          ]
        },
        { type: 'thematicBreak' },
        { type: 'html', value: '<br>' }
      ]
    });
  });

  test('does not mutate the input object', () => {
    const input = {
      blocks: [{ ul: ['One'] }]
    };

    normalizeDocument(input);

    expect(input).toEqual({
      blocks: [{ ul: ['One'] }]
    });
  });

  test('normalizes array list items, code shorthand, and nested inline children', () => {
    expect(
      normalizeDocument({
        blocks: [
          { ol: [[{ p: 'Nested item' }]] },
          { code: { lang: 'ts', meta: 'title="hello.ts"', value: 'console.log("hello")' } },
          {
            type: 'paragraph',
            children: [
              {
                type: 'strong',
                children: [{ type: 'emphasis', children: [{ type: 'text', value: 'Nested inline' }] }]
              }
            ]
          }
        ]
      })
    ).toEqual({
      blocks: [
        {
          type: 'list',
          ordered: true,
          items: [
            {
              blocks: [{ type: 'paragraph', text: 'Nested item' }]
            }
          ]
        },
        { type: 'code', lang: 'ts', meta: 'title="hello.ts"', value: 'console.log("hello")' },
        {
          type: 'paragraph',
          children: [
            {
              type: 'strong',
              children: [{ type: 'emphasis', children: [{ type: 'text', value: 'Nested inline' }] }]
            }
          ]
        }
      ]
    });
  });

  test('normalizes scalar code shorthand', () => {
    expect(
      normalizeDocument({
        blocks: [{ code: 'console.log("hello")' }]
      })
    ).toEqual({
      blocks: [{ type: 'code', value: 'console.log("hello")' }]
    });
  });

  test('accepts structured inline children in headings', () => {
    expect(
      normalizeDocument({
        blocks: [
          {
            type: 'heading',
            depth: 2,
            children: [{ type: 'strong', children: [{ type: 'text', value: 'Safe heading' }] }]
          }
        ]
      })
    ).toEqual({
      blocks: [
        {
          type: 'heading',
          depth: 2,
          children: [{ type: 'strong', children: [{ type: 'text', value: 'Safe heading' }] }]
        }
      ]
    });
  });

  test('normalizes definitions, footnotes, references, and rich table cells', () => {
    expect(
      normalizeDocument({
        blocks: [
          {
            type: 'paragraph',
            children: [
              { type: 'linkReference', identifier: 'Docs', children: [{ type: 'text', value: 'documentation' }] },
              { type: 'text', value: ' ' },
              { type: 'imageReference', identifier: 'Logo', alt: 'Logo' },
              { type: 'footnoteReference', identifier: 'note-1' }
            ]
          },
          {
            type: 'table',
            columns: [{ key: 'value', label: 'Value' }],
            rows: [
              { value: { type: 'inline', children: [{ type: 'strong', children: [{ type: 'text', value: 'Safe' }] }] } }
            ]
          },
          { type: 'definition', identifier: 'docs', url: 'https://example.com/docs' },
          { type: 'definition', identifier: 'logo', url: '/logo.png' },
          { type: 'footnoteDefinition', identifier: 'NOTE-1', blocks: [{ p: 'Footnote body' }] }
        ]
      })
    ).toEqual({
      blocks: [
        {
          type: 'paragraph',
          children: [
            { type: 'linkReference', identifier: 'Docs', children: [{ type: 'text', value: 'documentation' }] },
            { type: 'text', value: ' ' },
            { type: 'imageReference', identifier: 'Logo', alt: 'Logo' },
            { type: 'footnoteReference', identifier: 'note-1' }
          ]
        },
        {
          type: 'table',
          columns: [{ key: 'value', label: 'Value' }],
          rows: [
            { value: { type: 'inline', children: [{ type: 'strong', children: [{ type: 'text', value: 'Safe' }] }] } }
          ]
        },
        { type: 'definition', identifier: 'docs', url: 'https://example.com/docs' },
        { type: 'definition', identifier: 'logo', url: '/logo.png' },
        {
          type: 'footnoteDefinition',
          identifier: 'NOTE-1',
          blocks: [{ type: 'paragraph', text: 'Footnote body' }]
        }
      ]
    });
  });

  test.each([
    ['invalid identifiers', { blocks: [{ type: 'definition', identifier: 'not valid', url: 'https://example.com' }] }],
    [
      'duplicate definitions',
      {
        blocks: [
          { type: 'definition', identifier: 'Docs', url: 'https://example.com/a' },
          { type: 'definition', identifier: 'docs', url: 'https://example.com/b' }
        ]
      }
    ],
    [
      'unresolved references',
      {
        blocks: [
          {
            type: 'paragraph',
            children: [{ type: 'linkReference', identifier: 'missing', children: [{ type: 'text', value: 'Missing' }] }]
          }
        ]
      }
    ],
    [
      'nested definitions',
      {
        blocks: [
          {
            type: 'blockquote',
            blocks: [{ type: 'definition', identifier: 'nested', url: 'https://example.com' }]
          }
        ]
      }
    ],
    [
      'malformed inline table cells',
      {
        blocks: [
          {
            type: 'table',
            columns: [{ key: 'value', label: 'Value' }],
            rows: [{ value: { type: 'inline', children: [{ type: 'unknown' }] } }]
          }
        ]
      }
    ]
  ])('rejects %s', (_label, input) => {
    expect(() => normalizeDocument(input)).toThrow(YamdownValidationError);
  });

  test.each([
    ['heading', { h1: 'Title', typo: true }],
    ['paragraph', { p: 'Body', typo: true }],
    ['Markdown', { markdown: '**Body**', typo: true }],
    ['unordered list', { ul: [], typo: true }],
    ['ordered list', { ol: [], typo: true }],
    ['code', { code: 'value', typo: true }],
    ['blockquote', { quote: [], typo: true }],
    ['thematic break', { hr: true, typo: true }],
    ['HTML', { html: '<br>', typo: true }],
    ['table', { table: { columns: [], rows: [] }, typo: true }]
  ])('rejects extra keys on %s shorthand blocks', (_label, block) => {
    expect(() => normalizeDocument({ blocks: [block] })).toThrow(YamdownValidationError);
  });

  test('rejects conflicting shorthand keys', () => {
    expect(() => normalizeDocument({ blocks: [{ h1: 'Title', p: 'Body' }] })).toThrow(YamdownValidationError);
  });

  test('keeps structured inline nodes explicit', () => {
    expect(() =>
      normalizeDocument({
        blocks: [{ type: 'paragraph', children: [{ text: 'Not canonical' }] }]
      })
    ).toThrow(YamdownValidationError);
  });

  test('rejects malformed 0.5 GFM fields', () => {
    expect(() =>
      normalizeDocument({
        blocks: [
          {
            type: 'list',
            ordered: false,
            items: [{ checked: 'yes', blocks: [] }]
          }
        ]
      })
    ).toThrow(YamdownValidationError);

    expect(() =>
      normalizeDocument({
        blocks: [
          {
            type: 'table',
            columns: [{ key: 'name', label: 'Name', align: 'justify' }],
            rows: []
          }
        ]
      })
    ).toThrow(YamdownValidationError);

    expect(() =>
      normalizeDocument({
        blocks: [{ type: 'code', meta: 'title="hello.ts"', value: 'content' }]
      })
    ).toThrow(YamdownValidationError);

    expect(() =>
      normalizeDocument({
        blocks: [{ type: 'code', lang: 'ts title="old.ts"', meta: 'title="hello.ts"', value: 'content' }]
      })
    ).toThrow(YamdownValidationError);
  });
});
