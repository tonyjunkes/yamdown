import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { AnySchema } from 'ajv/dist/2020.js';
import { describe, expect, test } from 'vitest';
import { normalizeDocument, yamdownSourceDocumentSchema } from '../src/index.js';
import { createYamdownJsonSchema } from '../src/json-schema.js';

const schemaPath = join(import.meta.dirname, '..', 'schema', 'yamdown.schema.json');

async function readCommittedSchema(): Promise<unknown> {
  return JSON.parse(await readFile(schemaPath, 'utf8')) as unknown;
}

function createValidator(schema: unknown): (input: unknown) => boolean {
  if (!isJsonSchema(schema)) {
    throw new TypeError('Expected a JSON Schema object.');
  }

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  return ajv.compile(schema);
}

describe('Yamdown authoring JSON Schema', () => {
  test('keeps the committed schema in sync with the source Zod schema', async () => {
    expect(await readCommittedSchema()).toEqual(createYamdownJsonSchema());
  });

  test('validates representative accepted authoring shapes', async () => {
    const validate = createValidator(await readCommittedSchema());
    const input = {
      frontmatter: { title: 'Schema coverage', draft: false },
      blocks: [
        { h1: 'Shorthand heading' },
        { h2: 'Second heading' },
        { h3: 'Third heading' },
        { h4: 'Fourth heading' },
        { h5: 'Fifth heading' },
        { h6: 'Sixth heading' },
        { p: 'Paragraph shorthand' },
        { markdown: '**Raw Markdown**' },
        {
          ul: [
            'String item',
            [{ p: 'Nested shorthand block' }],
            { checked: true, blocks: [{ p: 'Done' }] },
            { checked: false, blocks: [{ p: 'Pending' }] }
          ]
        },
        { ol: ['Ordered item'] },
        { code: 'console.log("scalar shorthand")' },
        { code: { lang: 'ts', meta: 'title="example.ts"', value: 'console.log("object shorthand")' } },
        { quote: [{ p: 'Quoted' }] },
        { hr: true },
        {
          table: {
            columns: [
              { key: 'left', label: 'Left', align: 'left' },
              { key: 'center', label: 'Center', align: 'center' },
              { key: 'right', label: 'Right', align: 'right' },
              { key: 'plain', label: 'Plain', align: null }
            ],
            rows: [{ left: 'L', center: 'C', right: 'R', plain: 'P' }]
          }
        },
        { html: '<br>' },
        { type: 'heading', depth: 2, text: 'Verbose heading' },
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: 'A ' },
            { type: 'emphasis', children: [{ type: 'text', value: 'soft' }] },
            { type: 'strong', children: [{ type: 'text', value: 'strong' }] },
            { type: 'delete', children: [{ type: 'text', value: 'deleted' }] },
            { type: 'inlineCode', value: 'code' },
            {
              type: 'link',
              url: 'https://example.com',
              title: 'Example',
              children: [{ type: 'text', value: 'link' }]
            },
            {
              type: 'linkReference',
              identifier: 'docs',
              children: [{ type: 'text', value: 'Docs' }]
            },
            { type: 'image', url: '/logo.png', alt: 'Logo', title: 'Image title' },
            { type: 'imageReference', identifier: 'logo', alt: 'Logo' },
            { type: 'footnoteReference', identifier: 'note-1' },
            { type: 'break' }
          ]
        },
        {
          type: 'table',
          columns: [{ key: 'rich', label: 'Rich' }],
          rows: [
            { rich: { type: 'inline', children: [{ type: 'strong', children: [{ type: 'text', value: 'Cell' }] }] } }
          ]
        },
        { type: 'code', lang: 'js', meta: 'title="verbose.js"', value: 'console.log("verbose")' },
        { type: 'definition', identifier: 'docs', url: 'https://example.com/docs' },
        { type: 'definition', identifier: 'logo', url: '/logo.png' },
        { type: 'footnoteDefinition', identifier: 'note-1', blocks: [{ p: 'Footnote body' }] }
      ]
    };

    expect(validate(input)).toBe(true);
    expect(yamdownSourceDocumentSchema.safeParse(input).success).toBe(true);
    expect(() => normalizeDocument(input)).not.toThrow();
  });

  test.each([
    ['missing blocks', {}],
    ['extra top-level keys', { title: 'Legacy', blocks: [] }],
    ['conflicting shorthand keys', { blocks: [{ h1: 'Title', p: 'Body' }] }],
    [
      'invalid table alignment',
      { blocks: [{ table: { columns: [{ key: 'name', label: 'Name', align: 'justify' }], rows: [] } }] }
    ],
    ['invalid inline node', { blocks: [{ type: 'paragraph', children: [{ text: 'Missing type' }] }] }],
    ['invalid thematic break shorthand', { blocks: [{ hr: false }] }],
    ['invalid task-list state', { blocks: [{ ul: [{ checked: 'yes', blocks: [] }] }] }],
    ['code metadata without language', { blocks: [{ code: { meta: 'title="example.ts"', value: 'content' } }] }],
    [
      'code metadata with whitespace language',
      { blocks: [{ type: 'code', lang: 'ts title', meta: 'title="example.ts"', value: 'content' }] }
    ],
    [
      'code metadata with surrounding whitespace',
      { blocks: [{ code: { lang: 'ts', meta: ' title="example.ts"', value: 'content' } }] }
    ],
    ['invalid definition identifier', { blocks: [{ type: 'definition', identifier: 'not valid', url: '/docs' }] }],
    [
      'nested definition',
      {
        blocks: [
          { type: 'blockquote', blocks: [{ type: 'definition', identifier: 'nested', url: 'https://example.com' }] }
        ]
      }
    ],
    [
      'malformed tagged table cell',
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
  ])('rejects %s through schema and runtime validation', async (_label, input) => {
    const validate = createValidator(await readCommittedSchema());

    expect(validate(input)).toBe(false);
    expect(yamdownSourceDocumentSchema.safeParse(input).success).toBe(false);
    expect(() => normalizeDocument(input)).toThrow(/Invalid Yamdown document/u);
  });

  test('leaves document-wide reference integrity authoritative at runtime', async () => {
    const validate = createValidator(await readCommittedSchema());
    const unresolved = {
      blocks: [
        {
          type: 'paragraph',
          children: [{ type: 'footnoteReference', identifier: 'missing' }]
        }
      ]
    };

    expect(validate(unresolved)).toBe(true);
    expect(() => normalizeDocument(unresolved)).toThrow(/Unresolved footnote reference/u);
  });
});

function isJsonSchema(value: unknown): value is AnySchema {
  return typeof value === 'boolean' || (typeof value === 'object' && value !== null && !Array.isArray(value));
}
