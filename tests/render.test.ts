import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  parseMarkdownDocument,
  renderBlock,
  renderDocument,
  renderInline,
  renderMarkdown,
  renderMarkdownDocument,
  renderYamlMarkdown,
  toMdast,
  YamdownRenderError,
  YamdownValidationError
} from '../src/index.js';

const fixtureDir = join(import.meta.dirname, 'fixtures');

function fixture(name: string): Promise<string> {
  return readFile(join(fixtureDir, name), 'utf8');
}

function renderDocumentWithInvalidOptions(options: unknown): void {
  Reflect.apply(renderDocument, undefined, [{ blocks: [] }, options]);
}

describe('renderMarkdown', () => {
  test('renders nested elements exactly', async () => {
    expect(renderYamlMarkdown(await fixture('elements.yaml'))).toBe(await fixture('elements.md'));
  });
  test('renders block arrays larger than the JavaScript argument-count limit', () => {
    const blocks = Array.from({ length: 150_000 }, () => ({ type: 'paragraph' as const, text: 'x' }));
    expect(renderDocument({ blocks })).toBe(`${'x\n\n'.repeat(blocks.length - 1)}x\n`);
  });

  test('escapes text across node boundaries and preserves closing heading hashes', () => {
    expect(
      renderMarkdown({
        blocks: [
          {
            type: 'paragraph',
            children: [
              { type: 'text', value: '1' },
              { type: 'text', value: '. item' }
            ]
          },
          { type: 'heading', depth: 1, children: [{ type: 'text', value: 'Title #' }] }
        ]
      })
    ).toBe('1\\. item\n\n# Title \\#\n');
  });

  test('escapes literal entities in both bare and enclosed destinations', () => {
    expect(renderInline({ type: 'image', url: '/a?x=&copy;', alt: '*logo* &copy;', title: '&copy;' })).toBe(
      '![\\*logo\\* \\&copy;](/a?x=\\&copy; "\\&copy;")'
    );
    expect(renderInline({ type: 'link', url: '/a b?x=&copy;', children: [{ type: 'text', value: 'Link' }] })).toBe(
      '[Link](</a%20b?x=\\&copy;>)'
    );
  });

  test('escapes long trailing hash runs while preserving interior hashes', () => {
    const hashes = '#'.repeat(150_000);
    expect(renderInline({ type: 'text', value: `A # B ${hashes}\t # ` })).toBe(`A # B ${'\\#'.repeat(150_000)}\t \\# `);
    expect(renderInline({ type: 'text', value: `${hashes} end` })).toBe(`${hashes} end`);
  });

  test('keeps the explicit YAML renderer and high-level facade equivalent', async () => {
    const source = await fixture('basic.yaml');
    // oxlint-disable-next-line typescript/no-deprecated -- Verify the retained YAML string overload.
    expect(renderYamlMarkdown(source)).toBe(renderMarkdown(source));
  });
  test('renders a basic fixture exactly', async () => {
    expect(renderYamlMarkdown(await fixture('basic.yaml'))).toBe(await fixture('basic.md'));
  });

  test('preserves raw inline Markdown', async () => {
    expect(renderYamlMarkdown(await fixture('inline-raw.yaml'))).toBe(
      'This is **bold** and [linked](https://example.com).\n'
    );
  });

  test('renders a raw Markdown block fixture exactly', async () => {
    expect(renderYamlMarkdown(await fixture('raw-markdown.yaml'))).toBe(await fixture('raw-markdown.md'));
  });

  test('renders structured references, footnotes, and rich table cells exactly', async () => {
    expect(renderYamlMarkdown(await fixture('references.yaml'))).toBe(await fixture('references.txt'));
  });

  test('mixes structured and raw blocks with table shorthand', async () => {
    expect(renderYamlMarkdown(await fixture('mixed.yaml'))).toBe(await fixture('mixed.txt'));
  });

  test('normalizes raw Markdown boundaries without changing significant whitespace', () => {
    expect(
      renderMarkdown({
        blocks: [{ type: 'markdown', value: '\r\n  indented  \r\n\r\nNext  \r\n\t\r\n' }]
      })
    ).toBe('  indented  \n\nNext  \n');
  });

  test('renders whitespace-only raw Markdown blocks as empty output', () => {
    expect(
      renderMarkdown({
        blocks: [{ type: 'markdown', value: ' \t\r\n  \n' }]
      })
    ).toBe('\n');
  });

  test('supports raw Markdown recursively in lists and blockquotes', () => {
    expect(
      renderMarkdown({
        blocks: [
          {
            type: 'list',
            ordered: false,
            items: [{ blocks: [{ type: 'markdown', value: '**List item**  ' }] }]
          },
          {
            type: 'blockquote',
            blocks: [{ type: 'markdown', value: '- quoted\n- Markdown' }]
          }
        ]
      })
    ).toBe('- **List item**  \n\n> - quoted\n> - Markdown\n');
  });

  test('renders structured inline nodes', async () => {
    expect(renderYamlMarkdown(await fixture('inline-structured.yaml'))).toBe(
      'This is **bold** and [linked](https://example.com "Example").\n'
    );
  });

  test('renders structured strikethrough and escapes literal tildes', () => {
    expect(
      renderMarkdown({
        blocks: [
          {
            type: 'paragraph',
            children: [
              { type: 'text', value: 'Keep ~~literal~~, remove ' },
              { type: 'delete', children: [{ type: 'text', value: 'old' }] },
              { type: 'text', value: '.' }
            ]
          }
        ]
      })
    ).toBe('Keep \\~\\~literal\\~\\~, remove ~~old~~.\n');
  });

  test('renders full references and multiline footnotes', () => {
    expect(
      renderMarkdown({
        blocks: [
          {
            type: 'paragraph',
            children: [
              { type: 'linkReference', identifier: 'Docs', children: [{ type: 'text', value: 'Read the docs' }] },
              { type: 'text', value: ' ' },
              { type: 'imageReference', identifier: 'Logo', alt: 'Project logo' },
              { type: 'footnoteReference', identifier: 'note-1' }
            ]
          },
          { type: 'definition', identifier: 'docs', url: 'https://example.com/a b', title: 'Documentation' },
          { type: 'definition', identifier: 'logo', url: '/logo.png' },
          {
            type: 'footnoteDefinition',
            identifier: 'NOTE-1',
            blocks: [
              { type: 'paragraph', text: 'First paragraph.' },
              { type: 'list', ordered: false, items: [{ blocks: [{ type: 'paragraph', text: 'Nested item' }] }] }
            ]
          }
        ]
      })
    ).toBe(
      [
        '[Read the docs][Docs] ![Project logo][Logo][^note-1]',
        '',
        '[docs]: <https://example.com/a%20b> "Documentation"',
        '',
        '[logo]: /logo.png',
        '',
        '[^NOTE-1]: First paragraph.',
        '',
        '    - Nested item',
        ''
      ].join('\n')
    );
  });

  test('renders empty definition destinations explicitly', () => {
    expect(
      renderMarkdown({
        blocks: [
          {
            type: 'paragraph',
            children: [{ type: 'linkReference', identifier: 'docs', children: [{ type: 'text', value: 'Docs' }] }]
          },
          { type: 'definition', identifier: 'docs', url: '' }
        ]
      })
    ).toBe('[Docs][docs]\n\n[docs]: <>\n');
  });

  test('normalizes lone carriage returns in structured titles and alt text', () => {
    expect(
      renderMarkdown({
        blocks: [{ type: 'definition', identifier: 'docs', url: '/docs', title: 'Docs\r# not a heading' }]
      })
    ).toBe('[docs]: /docs "Docs # not a heading"\n');

    expect(renderInline({ type: 'imageReference', identifier: 'logo', alt: 'Logo\r# not a heading' })).toBe(
      '![Logo # not a heading][logo]'
    );
  });

  test('escapes structured text without changing ordinary punctuation', async () => {
    expect(renderYamlMarkdown(await fixture('structured-safe.yaml'))).toBe(await fixture('structured-safe.md'));
  });

  test('preserves raw Markdown in paragraph and heading text fields', () => {
    expect(
      renderMarkdown({
        blocks: [
          { type: 'heading', depth: 1, text: '*Raw* heading' },
          { type: 'paragraph', text: '[Raw link](https://example.com)' }
        ]
      })
    ).toBe('# *Raw* heading\n\n[Raw link](https://example.com)\n');
  });

  test('renders ordered lists and nested list item blocks', async () => {
    expect(renderYamlMarkdown(await fixture('lists.yaml'))).toBe(
      [
        '1. First',
        '2. Second',
        '',
        '- First paragraph inside item',
        '',
        '  ```ts',
        '  console.log("hello")',
        '  ```',
        ''
      ].join('\n')
    );
  });

  test('renders structured task-list item state', () => {
    expect(
      renderMarkdown({
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
            type: 'list',
            ordered: true,
            items: [{ checked: true, blocks: [{ type: 'paragraph', text: 'Ordered task' }] }]
          }
        ]
      })
    ).toBe('- [x] Complete\n- [ ] Pending\n- Ordinary\n\n1. [x] Ordered task\n');
  });

  test('uses a longer code fence when content contains triple backticks', async () => {
    expect(renderYamlMarkdown(await fixture('code.yaml'))).toBe(
      ['````md', '```ts', 'console.log("hello")', '```', '````', ''].join('\n')
    );
  });

  test('uses a tilde fence when a code language contains a backtick', () => {
    expect(
      renderMarkdown({
        blocks: [{ type: 'code', lang: 'template`literal', value: '# remains code' }]
      })
    ).toBe(['~~~template`literal', '# remains code', '~~~', ''].join('\n'));
  });

  test('renders fenced code metadata and avoids backticks in info strings', () => {
    expect(
      renderMarkdown({
        blocks: [{ type: 'code', lang: 'ts', meta: 'title="a`b.ts"', value: 'console.log("hello")' }]
      })
    ).toBe(['~~~ts title="a`b.ts"', 'console.log("hello")', '~~~', ''].join('\n'));
  });

  test('rejects multiline code languages', () => {
    expect(() =>
      renderMarkdown({
        blocks: [{ type: 'code', lang: 'ts\ninvalid', value: 'content' }]
      })
    ).toThrow(/Code language must not contain whitespace/u);
  });

  test('escapes pipes in table cells', async () => {
    expect(renderYamlMarkdown(await fixture('tables.yaml'))).toBe(
      [
        '| Name | Description |',
        '| --- | --- |',
        '| YAML | Source \\| format |',
        '| Markdown | Output format |',
        ''
      ].join('\n')
    );
  });

  test('normalizes every line-ending form in table labels and cells', () => {
    expect(
      renderMarkdown({
        blocks: [
          {
            type: 'table',
            columns: [{ key: 'value', label: 'First\rSecond' }],
            rows: [{ value: 'A\rB\r\nC\nD' }]
          }
        ]
      })
    ).toBe(['| First Second |', '| --- |', '| A B C D |', ''].join('\n'));
  });

  test('renders table column alignment', () => {
    expect(
      renderMarkdown({
        blocks: [
          {
            type: 'table',
            columns: [
              { key: 'left', label: 'Left', align: 'left' },
              { key: 'center', label: 'Center', align: 'center' },
              { key: 'right', label: 'Right', align: 'right' },
              { key: 'plain', label: 'Plain', align: null }
            ],
            rows: [{ left: 'L', center: 'C', right: 'R', plain: 'P' }]
          }
        ]
      })
    ).toBe(['| Left | Center | Right | Plain |', '| :--- | :---: | ---: | --- |', '| L | C | R | P |', ''].join('\n'));
  });

  test('renders table cells with deterministic scalar and structured values', () => {
    expect(
      renderMarkdown({
        blocks: [
          {
            type: 'table',
            columns: [
              { key: 'empty', label: 'Empty' },
              { key: 'scalar', label: 'Scalar' },
              { key: 'structured', label: 'Structured' }
            ],
            rows: [
              { empty: null, scalar: true, structured: { count: 2 } },
              { scalar: 4, structured: ['a', 'b'] }
            ]
          }
        ]
      })
    ).toBe(
      [
        '| Empty | Scalar | Structured |',
        '| --- | --- | --- |',
        '|  | true | {"count":2} |',
        '|  | 4 | ["a","b"] |',
        ''
      ].join('\n')
    );
  });

  test('renders tagged structured table cells without changing legacy arrays or objects', () => {
    expect(
      renderMarkdown({
        blocks: [
          {
            type: 'table',
            columns: [
              { key: 'rich', label: 'Rich' },
              { key: 'array', label: 'Array' },
              { key: 'object', label: 'Object' }
            ],
            rows: [
              {
                rich: {
                  type: 'inline',
                  children: [{ type: 'strong', children: [{ type: 'text', value: 'A | B' }] }]
                },
                array: ['a', 'b'],
                object: { count: 2 }
              }
            ]
          }
        ]
      })
    ).toBe(
      ['| Rich | Array | Object |', '| --- | --- | --- |', '| **A \\| B** | ["a","b"] | {"count":2} |', ''].join('\n')
    );
  });

  test('renders blockquotes, thematic breaks, html, and options', () => {
    const markdown = renderMarkdown(
      {
        blocks: [
          { type: 'blockquote', blocks: [{ type: 'paragraph', text: 'Quoted.' }] },
          { type: 'thematicBreak' },
          { type: 'html', value: '<br>' }
        ]
      },
      { blankLines: 2 }
    );

    expect(markdown).toBe(['> Quoted.', '', '', '---', '', '', '<br>', ''].join('\n'));
  });

  test('renders YAML annotation wrappers to portable Markdown with parser parity', () => {
    const source = renderMarkdown({
      yamdown: { v: 1, profile: 'base' },
      frontmatter: { title: 'Portable' },
      blocks: [
        {
          type: 'annotatedBlock',
          id: 'title',
          kind: 'hero',
          data: { z: 1, a: 2 },
          block: { type: 'heading', depth: 1, text: 'Portable' }
        },
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: 'Read ' },
            {
              type: 'annotatedSpan',
              id: 'product',
              kind: 'name',
              children: [{ type: 'text', value: 'Yamdown' }]
            },
            { type: 'text', value: '.' }
          ]
        },
        {
          type: 'annotatedRegion',
          id: 'next',
          kind: 'section',
          blocks: [{ type: 'paragraph', text: 'Continue.' }]
        }
      ]
    });
    const parsed = parseMarkdownDocument(source);

    expect(source).toContain('<!-- yamdown:document {"v":1,"profile":"base"} -->');
    expect(source).toContain('<!-- yamdown:node {"id":"title","kind":"hero","data":{"a":2,"z":1}} -->');
    expect(parsed.annotations.map((annotation) => [annotation.type, annotation.id])).toEqual([
      ['node', 'title'],
      ['span', 'product'],
      ['region', 'next']
    ]);
    expect(renderMarkdownDocument(parsed)).toBe(
      ['---', 'title: Portable', '---', '', '# Portable', '', 'Read Yamdown.', '', 'Continue.', ''].join('\n')
    );
  });

  test('keeps list-leading YAML block and region annotations parser-equivalent', () => {
    const source = renderMarkdown({
      yamdown: { v: 1, profile: 'base' },
      blocks: [
        {
          type: 'list',
          ordered: false,
          items: [
            {
              blocks: [
                {
                  type: 'annotatedBlock',
                  id: 'list-title',
                  block: { type: 'paragraph', text: 'Annotated block.' }
                }
              ]
            },
            {
              blocks: [
                {
                  type: 'annotatedRegion',
                  id: 'list-region',
                  blocks: [
                    { type: 'paragraph', text: 'First region paragraph.' },
                    { type: 'paragraph', text: 'Second region paragraph.' }
                  ]
                }
              ]
            }
          ]
        }
      ]
    });
    const parsed = parseMarkdownDocument(source);

    expect(source).toBe(
      [
        '<!-- yamdown:document {"v":1,"profile":"base"} -->',
        '',
        '- <!-- yamdown:node {"id":"list-title"} -->',
        '  Annotated block.',
        '- <!-- yamdown:region {"id":"list-region"} -->',
        '  First region paragraph.',
        '',
        '  Second region paragraph.',
        '  <!-- yamdown:/region {"id":"list-region"} -->',
        ''
      ].join('\n')
    );
    expect(parsed.annotations.map((annotation) => [annotation.type, annotation.id])).toEqual([
      ['node', 'list-title'],
      ['region', 'list-region']
    ]);
    expect(renderMarkdownDocument(parsed)).toBe(
      '* Annotated block.\n* First region paragraph.\n\n  Second region paragraph.\n'
    );
  });

  test('retains nested structured emphasis and strong semantics in mdast', () => {
    const tree = toMdast({
      blocks: [
        {
          type: 'paragraph',
          children: [
            { type: 'emphasis', children: [{ type: 'strong', children: [{ type: 'text', value: 'inside' }] }] },
            { type: 'text', value: ' ' },
            { type: 'strong', children: [{ type: 'emphasis', children: [{ type: 'text', value: 'outside' }] }] }
          ]
        }
      ]
    });

    expect(tree.children[0]).toMatchObject({
      type: 'paragraph',
      children: [
        { type: 'emphasis', children: [{ type: 'strong', children: [{ type: 'text', value: 'inside' }] }] },
        { type: 'text', value: ' ' },
        { type: 'strong', children: [{ type: 'emphasis', children: [{ type: 'text', value: 'outside' }] }] }
      ]
    });
  });

  test('rejects invalid render options and list forms with typed render errors', () => {
    for (const options of [
      { blankLines: Infinity },
      { blankLines: 0 },
      { blankLines: 1.5 },
      { headingStyle: 'atx' },
      { bullet: '?' }
    ]) {
      expect(() => {
        renderDocumentWithInvalidOptions(options);
      }).toThrow(YamdownRenderError);
    }

    expect(
      renderBlock(
        {
          type: 'list',
          ordered: false,
          items: [{ blocks: [{ type: 'paragraph', text: 'Partial option' }] }]
        },
        { bullet: '+' }
      )
    ).toBe('+ Partial option');
    expect(() => renderBlock({ type: 'list', ordered: false, start: 1, items: [] })).toThrow(YamdownRenderError);
  });

  test('keeps tab-indented structured text as text and rejects unsafe table values', () => {
    const tree = toMdast({
      blocks: [{ type: 'paragraph', children: [{ type: 'text', value: '\tstill text' }] }]
    });
    expect(tree.children[0]).toMatchObject({
      type: 'paragraph',
      children: [{ type: 'text', value: '\tstill text' }]
    });

    const inheritedRow: Record<string, unknown> = {};
    Object.setPrototypeOf(inheritedRow, { value: 'inherited' });
    expect(
      renderMarkdown({
        blocks: [{ type: 'table', columns: [{ key: 'value', label: 'Value' }], rows: [inheritedRow] }]
      })
    ).toBe(['| Value |', '| --- |', '|  |', ''].join('\n'));

    expect(() =>
      renderMarkdown({
        blocks: [{ type: 'table', columns: [{ key: 'value', label: 'Value' }], rows: [{ value: Number.NaN }] }]
      })
    ).toThrow(YamdownValidationError);
  });
});

describe('renderInline', () => {
  test('renders common structured inline nodes', () => {
    expect(renderInline({ type: 'emphasis', children: [{ type: 'text', value: 'soft' }] })).toBe('*soft*');
    expect(renderInline({ type: 'inlineCode', value: 'a`b' })).toBe('``a`b``');
    expect(renderInline({ type: 'inlineCode', value: ' edge ' })).toBe('`  edge  `');
    expect(renderInline({ type: 'image', url: '/logo.png', alt: 'A [logo]' })).toBe('![A \\[logo\\]](/logo.png)');
    expect(renderInline({ type: 'break' })).toBe('  \n');
    expect(
      renderInline({ type: 'linkReference', identifier: 'docs', children: [{ type: 'text', value: 'Docs' }] })
    ).toBe('[Docs][docs]');
    expect(renderInline({ type: 'imageReference', identifier: 'logo', alt: 'Logo' })).toBe('![Logo][logo]');
    expect(renderInline({ type: 'footnoteReference', identifier: 'note' })).toBe('[^note]');
  });

  test('protects link destinations, titles, labels, and image alt text', () => {
    expect(
      renderInline({
        type: 'link',
        url: 'https://example.com/a b>c',
        title: 'say "hi" \\ now',
        children: [{ type: 'text', value: '[literal]' }]
      })
    ).toBe('[\\[literal\\]](<https://example.com/a%20b%3Ec> "say \\"hi\\" \\\\ now")');

    expect(renderInline({ type: 'image', url: '/a(b).png', alt: 'A \\ [logo]\nnext' })).toBe(
      '![A \\\\ \\[logo\\] next](/a\\(b\\).png)'
    );
  });

  test('protects multiline structured text from block Markdown syntax', () => {
    expect(renderInline({ type: 'text', value: 'Title\n===\n    indented' })).toBe('Title\n\\===\n&#32;   indented');
  });

  test('protects structured text from thematic break syntax', () => {
    expect(renderInline({ type: 'text', value: '---' })).toBe('\\---');
    expect(renderInline({ type: 'text', value: '-- -' })).toBe('\\-- -');
  });
});
