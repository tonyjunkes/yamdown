import { describe, expect, test } from 'vitest';
import { YamlMarkdownValidationError, normalizeDocument } from '../src/index.js';

describe('normalizeDocument', () => {
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
    expect(() => normalizeDocument({ blocks: [block] })).toThrow(YamlMarkdownValidationError);
  });

  test('rejects conflicting shorthand keys', () => {
    expect(() => normalizeDocument({ blocks: [{ h1: 'Title', p: 'Body' }] })).toThrow(YamlMarkdownValidationError);
  });

  test('keeps structured inline nodes explicit', () => {
    expect(() =>
      normalizeDocument({
        blocks: [{ type: 'paragraph', children: [{ text: 'Not canonical' }] }]
      })
    ).toThrow(YamlMarkdownValidationError);
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
    ).toThrow(YamlMarkdownValidationError);

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
    ).toThrow(YamlMarkdownValidationError);

    expect(() =>
      normalizeDocument({
        blocks: [{ type: 'code', meta: 'title="hello.ts"', value: 'content' }]
      })
    ).toThrow(YamlMarkdownValidationError);

    expect(() =>
      normalizeDocument({
        blocks: [{ type: 'code', lang: 'ts title="old.ts"', meta: 'title="hello.ts"', value: 'content' }]
      })
    ).toThrow(YamlMarkdownValidationError);
  });
});
