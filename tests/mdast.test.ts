import type { Root } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { frontmatterFromMarkdown } from 'mdast-util-frontmatter';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { frontmatter } from 'micromark-extension-frontmatter';
import { gfm } from 'micromark-extension-gfm';
import { describe, expect, test } from 'vitest';
import { documentToMdast, parseYamlDocument, renderYamlMarkdown, toMdast } from '../src/index.js';

describe('toMdast', () => {
  test.each([
    ['', '# heading'],
    ['1', '. item'],
    [' ', '   indented']
  ])('keeps adjacent structured text literal: %j', (...values) => {
    expect(
      toMdast({ blocks: [{ type: 'paragraph', children: values.map((value) => ({ type: 'text' as const, value })) }] })
        .children
    ).toMatchObject([{ type: 'paragraph', children: [{ type: 'text', value: values.join('') }] }]);
  });

  test('keeps punctuation from changing adjacent links or closing headings', () => {
    expect(
      toMdast({
        blocks: [
          {
            type: 'paragraph',
            children: [
              { type: 'text', value: '!' },
              { type: 'link', url: '/docs', children: [{ type: 'text', value: 'Docs' }] }
            ]
          },
          { type: 'heading', depth: 1, children: [{ type: 'text', value: 'Title #' }] }
        ]
      }).children
    ).toMatchObject([
      {
        type: 'paragraph',
        children: [
          { type: 'text', value: '!' },
          { type: 'link', url: '/docs' }
        ]
      },
      { type: 'heading', depth: 1, children: [{ type: 'text', value: 'Title #' }] }
    ]);
  });

  test('preserves literal entities and formatting characters in link and image fields', () => {
    const url = '/search?q=&copy;';
    const title = 'A &copy; title';
    const alt = '*logo* `code` ~~old~~ &copy; <tag>';
    expect(
      toMdast({
        blocks: [
          {
            type: 'paragraph',
            children: [
              { type: 'link', url, title, children: [{ type: 'text', value: 'Link' }] },
              { type: 'image', url, title, alt },
              { type: 'imageReference', identifier: 'logo', alt }
            ]
          },
          { type: 'definition', identifier: 'logo', url, title }
        ]
      }).children
    ).toMatchObject([
      {
        type: 'paragraph',
        children: [
          { type: 'link', url, title },
          { type: 'image', url, title, alt },
          { type: 'imageReference', alt }
        ]
      },
      { type: 'definition', url, title }
    ]);
  });

  test('keeps the document-only and high-level mdast APIs equivalent', () => {
    const document = { blocks: [{ type: 'paragraph' as const, text: 'Hello' }] };
    expect(documentToMdast(document)).toEqual(toMdast(document));
  });
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

  test('parses raw Markdown blocks semantically', () => {
    expect(
      toMdast({
        blocks: [{ type: 'markdown', value: '## Existing section\n\n- **One**\n- Two' }]
      }).children
    ).toMatchObject([
      { type: 'heading', depth: 2, children: [{ type: 'text', value: 'Existing section' }] },
      {
        type: 'list',
        children: [
          { children: [{ children: [{ type: 'strong', children: [{ type: 'text', value: 'One' }] }] }] },
          { children: [{ children: [{ type: 'text', value: 'Two' }] }] }
        ]
      }
    ]);
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

  test('produces mdast delete nodes from structured strikethrough', () => {
    const tree = toMdast({
      blocks: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: 'Keep ' },
            { type: 'delete', children: [{ type: 'text', value: 'old wording' }] }
          ]
        }
      ]
    });

    expect(tree.children[0]).toMatchObject({
      type: 'paragraph',
      children: [
        { type: 'text', value: 'Keep ' },
        { type: 'delete', children: [{ type: 'text', value: 'old wording' }] }
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

  test('produces standard GFM tables, task-list fields, and code metadata', () => {
    const tree = toMdast({
      blocks: [
        {
          type: 'list',
          ordered: false,
          items: [
            { checked: true, blocks: [{ type: 'paragraph', text: 'Complete' }] },
            { checked: false, blocks: [{ type: 'paragraph', text: 'Pending' }] },
            { blocks: [{ type: 'paragraph', text: 'Ordinary' }] }
          ]
        },
        {
          type: 'table',
          columns: [
            { key: 'name', label: 'Name', align: 'left' },
            { key: 'value', label: 'Value', align: 'right' }
          ],
          rows: [{ name: 'Object', value: { nested: true } }]
        },
        { type: 'code', lang: 'ts', meta: 'title="hello.ts"', value: 'console.log("hello")' },
        { type: 'html', value: '<details>Raw HTML</details>' }
      ]
    });

    expect(tree.children[0]).toMatchObject({
      type: 'list',
      ordered: false,
      children: [
        { type: 'listItem', checked: true },
        { type: 'listItem', checked: false },
        { type: 'listItem', checked: null }
      ]
    });
    expect(tree.children[1]).toMatchObject({
      type: 'table',
      align: ['left', 'right'],
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
      meta: 'title="hello.ts"',
      value: 'console.log("hello")'
    });
    expect(tree.children[3]).toMatchObject({ type: 'html', value: '<details>Raw HTML</details>' });
  });

  test('produces official reference, definition, footnote, and rich table cell nodes', () => {
    const tree = toMdast({
      blocks: [
        {
          type: 'paragraph',
          children: [
            { type: 'linkReference', identifier: 'docs', children: [{ type: 'text', value: 'Docs' }] },
            { type: 'imageReference', identifier: 'logo', alt: 'Logo' },
            { type: 'footnoteReference', identifier: 'note' }
          ]
        },
        {
          type: 'table',
          columns: [{ key: 'value', label: 'Value' }],
          rows: [
            {
              value: {
                type: 'inline',
                children: [{ type: 'strong', children: [{ type: 'text', value: 'Structured' }] }]
              }
            }
          ]
        },
        { type: 'definition', identifier: 'docs', url: 'https://example.com/docs' },
        { type: 'definition', identifier: 'logo', url: '/logo.png' },
        { type: 'footnoteDefinition', identifier: 'note', blocks: [{ type: 'paragraph', text: 'Footnote.' }] }
      ]
    });

    expect(tree.children).toMatchObject([
      {
        type: 'paragraph',
        children: [
          { type: 'linkReference', identifier: 'docs', referenceType: 'full' },
          { type: 'imageReference', identifier: 'logo', referenceType: 'full' },
          { type: 'footnoteReference', identifier: 'note' }
        ]
      },
      {
        type: 'table',
        children: [
          { type: 'tableRow' },
          {
            type: 'tableRow',
            children: [
              { type: 'tableCell', children: [{ type: 'strong', children: [{ type: 'text', value: 'Structured' }] }] }
            ]
          }
        ]
      },
      { type: 'definition', identifier: 'docs', url: 'https://example.com/docs' },
      { type: 'definition', identifier: 'logo', url: '/logo.png' },
      {
        type: 'footnoteDefinition',
        identifier: 'note',
        children: [{ type: 'paragraph', children: [{ type: 'text', value: 'Footnote.' }] }]
      }
    ]);
  });

  test('preserves empty reference destinations as definitions', () => {
    const tree = toMdast({
      blocks: [
        {
          type: 'paragraph',
          children: [{ type: 'linkReference', identifier: 'docs', children: [{ type: 'text', value: 'Docs' }] }]
        },
        { type: 'definition', identifier: 'docs', url: '' }
      ]
    });

    expect(tree.children).toMatchObject([
      { type: 'paragraph', children: [{ type: 'linkReference', identifier: 'docs' }] },
      { type: 'definition', identifier: 'docs', url: '' }
    ]);
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
    const markdown = renderYamlMarkdown(source, options);
    const expected = fromMarkdown(markdown, {
      extensions: [gfm(), frontmatter()],
      mdastExtensions: [gfmFromMarkdown(), frontmatterFromMarkdown()]
    });

    const root = documentToMdast(parseYamlDocument(source), options);
    expect(root).toEqual(expected);
    expect(root.position?.end.offset).toBe(markdown.length);
  });
});
