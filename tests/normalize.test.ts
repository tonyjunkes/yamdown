import { describe, expect, test } from 'vitest';
import { YamlMarkdownValidationError, normalizeDocument } from '../src/index.js';

describe('normalizeDocument', () => {
  test('normalizes shorthand blocks and nested list items', () => {
    expect(
      normalizeDocument({
        blocks: [
          { h1: 'Title' },
          { p: 'Body' },
          { ul: ['One', { blocks: [{ quote: [{ p: 'Nested quote' }] }] }] },
          { hr: true },
          { html: '<br>' }
        ]
      })
    ).toEqual({
      blocks: [
        { type: 'heading', depth: 1, text: 'Title' },
        { type: 'paragraph', text: 'Body' },
        {
          type: 'list',
          ordered: false,
          items: [
            { blocks: [{ type: 'paragraph', text: 'One' }] },
            {
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
          { code: 'console.log("hello")' },
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
        { type: 'code', value: 'console.log("hello")' },
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
    ['unordered list', { ul: [], typo: true }],
    ['ordered list', { ol: [], typo: true }],
    ['code', { code: 'value', typo: true }],
    ['blockquote', { quote: [], typo: true }],
    ['thematic break', { hr: true, typo: true }],
    ['HTML', { html: '<br>', typo: true }]
  ])('rejects extra keys on %s shorthand blocks', (_label, block) => {
    expect(() => normalizeDocument({ blocks: [block] })).toThrow(YamlMarkdownValidationError);
  });

  test('rejects conflicting shorthand keys', () => {
    expect(() => normalizeDocument({ blocks: [{ h1: 'Title', p: 'Body' }] })).toThrow(YamlMarkdownValidationError);
  });
});
