import type { Root } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { frontmatterFromMarkdown } from 'mdast-util-frontmatter';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { frontmatter } from 'micromark-extension-frontmatter';
import { gfm } from 'micromark-extension-gfm';
import { describe, expect, test } from 'vitest';
import { renderMarkdown, toMdast } from '../src/index.js';

describe('toMdast', () => {
  test('returns an official mdast root and parses raw Markdown semantically', () => {
    const tree: Root = toMdast({
      blocks: [
        { type: 'heading', depth: 2, text: 'Hello, *world*!' },
        { type: 'paragraph', text: 'Visit [the site](https://example.com) and ~~ignore this~~.' }
      ]
    });

    expect(tree).toMatchObject({
      type: 'root',
      children: [
        {
          type: 'heading',
          depth: 2,
          children: [
            { type: 'text', value: 'Hello, ' },
            { type: 'emphasis', children: [{ type: 'text', value: 'world' }] },
            { type: 'text', value: '!' }
          ]
        },
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: 'Visit ' },
            { type: 'link', url: 'https://example.com', children: [{ type: 'text', value: 'the site' }] },
            { type: 'text', value: ' and ' },
            { type: 'delete', children: [{ type: 'text', value: 'ignore this' }] },
            { type: 'text', value: '.' }
          ]
        }
      ]
    });
    expect(tree.position?.start).toEqual({ line: 1, column: 1, offset: 0 });
  });

  test('keeps structured text literal while preserving explicit formatting', () => {
    const tree = toMdast({
      blocks: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: '**literal** <tag> &copy; ' },
            { type: 'strong', children: [{ type: 'text', value: 'formatted' }] }
          ]
        }
      ]
    });

    expect(tree.children[0]).toMatchObject({
      type: 'paragraph',
      children: [
        { type: 'text', value: '**literal** <tag> &copy; ' },
        { type: 'strong', children: [{ type: 'text', value: 'formatted' }] }
      ]
    });
  });

  test('includes YAML frontmatter and respects render options', () => {
    const document = {
      frontmatter: { title: 'Example', draft: false },
      blocks: [{ type: 'heading' as const, depth: 1 as const, text: 'Document' }]
    };

    expect(toMdast(document).children).toMatchObject([
      { type: 'yaml', value: 'title: Example\ndraft: false' },
      { type: 'heading', depth: 1 }
    ]);
    expect(toMdast(document, { frontmatter: false }).children).toMatchObject([{ type: 'heading', depth: 1 }]);
  });

  test('produces standard GFM tables and task-list fields', () => {
    const tree = toMdast({
      blocks: [
        {
          type: 'list',
          ordered: false,
          items: [
            { blocks: [{ type: 'paragraph', text: '[x] Complete' }] },
            { blocks: [{ type: 'paragraph', text: '[ ] Pending' }] }
          ]
        },
        {
          type: 'table',
          columns: [
            { key: 'name', label: 'Name' },
            { key: 'value', label: 'Value' }
          ],
          rows: [{ name: 'Object', value: { nested: true } }]
        },
        { type: 'code', lang: 'ts', value: 'console.log("hello")' },
        { type: 'html', value: '<details>Raw HTML</details>' }
      ]
    });

    expect(tree.children[0]).toMatchObject({
      type: 'list',
      ordered: false,
      children: [
        { type: 'listItem', checked: true },
        { type: 'listItem', checked: false }
      ]
    });
    expect(tree.children[1]).toMatchObject({
      type: 'table',
      align: [null, null],
      children: [
        {
          type: 'tableRow',
          children: [
            { type: 'tableCell', children: [{ type: 'text', value: 'Name' }] },
            { type: 'tableCell', children: [{ type: 'text', value: 'Value' }] }
          ]
        },
        {
          type: 'tableRow',
          children: [
            { type: 'tableCell', children: [{ type: 'text', value: 'Object' }] },
            { type: 'tableCell', children: [{ type: 'text', value: '{"nested":true}' }] }
          ]
        }
      ]
    });
    expect(tree.children[2]).toMatchObject({
      type: 'code',
      lang: 'ts',
      value: 'console.log("hello")'
    });
    expect(tree.children[3]).toMatchObject({ type: 'html', value: '<details>Raw HTML</details>' });
  });

  test('accepts YAML source and matches parsing the rendered Markdown', () => {
    const source = `
frontmatter:
  title: Equivalence
blocks:
  - h1: Hello *world*
  - p: Visit https://example.com
`;
    const options = { bullet: '+' as const, codeFence: '~' as const };
    const markdown = renderMarkdown(source, options);
    const expected = fromMarkdown(markdown, {
      extensions: [gfm(), frontmatter()],
      mdastExtensions: [gfmFromMarkdown(), frontmatterFromMarkdown()]
    });

    expect(toMdast(source, options)).toEqual(expected);
    expect(toMdast(source, options).position?.end.offset).toBe(markdown.length);
  });
});
