import { describe, expect, test } from 'vitest';
import { toMdast } from '../src/index.js';

describe('toMdast', () => {
  test('converts block nodes', () => {
    expect(
      toMdast({
        blocks: [
          { type: 'heading', depth: 2, text: 'Title' },
          { type: 'paragraph', text: 'Body' },
          { type: 'blockquote', blocks: [{ type: 'paragraph', text: 'Nested quote' }] },
          { type: 'thematicBreak' },
          { type: 'html', value: '<br>' }
        ]
      })
    ).toEqual({
      type: 'root',
      children: [
        { type: 'heading', depth: 2, children: [{ type: 'text', value: 'Title' }] },
        { type: 'paragraph', children: [{ type: 'text', value: 'Body' }] },
        {
          type: 'blockquote',
          children: [{ type: 'paragraph', children: [{ type: 'text', value: 'Nested quote' }] }]
        },
        { type: 'thematicBreak' },
        { type: 'html', value: '<br>' }
      ]
    });
  });

  test('converts structured inline nodes', () => {
    expect(
      toMdast({
        blocks: [
          {
            type: 'paragraph',
            children: [
              { type: 'text', value: 'A ' },
              { type: 'emphasis', children: [{ type: 'text', value: 'little' }] },
              { type: 'text', value: ' ' },
              { type: 'strong', children: [{ type: 'text', value: 'bold' }] },
              { type: 'text', value: ' ' },
              { type: 'inlineCode', value: 'code' },
              { type: 'text', value: ' ' },
              {
                type: 'link',
                url: 'https://example.com',
                title: 'Example',
                children: [{ type: 'text', value: 'link' }]
              },
              { type: 'text', value: ' ' },
              { type: 'image', url: '/logo.png', alt: 'Logo', title: 'Brand' },
              { type: 'break' }
            ]
          }
        ]
      })
    ).toEqual({
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: 'A ' },
            { type: 'emphasis', children: [{ type: 'text', value: 'little' }] },
            { type: 'text', value: ' ' },
            { type: 'strong', children: [{ type: 'text', value: 'bold' }] },
            { type: 'text', value: ' ' },
            { type: 'inlineCode', value: 'code' },
            { type: 'text', value: ' ' },
            { type: 'link', url: 'https://example.com', title: 'Example', children: [{ type: 'text', value: 'link' }] },
            { type: 'text', value: ' ' },
            { type: 'image', url: '/logo.png', alt: 'Logo', title: 'Brand' },
            { type: 'break' }
          ]
        }
      ]
    });
  });

  test('converts structured heading children', () => {
    expect(
      toMdast({
        blocks: [
          {
            type: 'heading',
            depth: 3,
            children: [{ type: 'emphasis', children: [{ type: 'text', value: 'Heading' }] }]
          }
        ]
      })
    ).toEqual({
      type: 'root',
      children: [
        {
          type: 'heading',
          depth: 3,
          children: [{ type: 'emphasis', children: [{ type: 'text', value: 'Heading' }] }]
        }
      ]
    });
  });

  test('converts lists, code, and table cells', () => {
    expect(
      toMdast({
        blocks: [
          {
            type: 'list',
            ordered: true,
            start: 3,
            items: [
              { blocks: [{ type: 'paragraph', text: 'First' }] },
              { blocks: [{ type: 'code', lang: 'ts', value: 'console.log("hello")' }] }
            ]
          },
          {
            type: 'table',
            columns: [
              { key: 'name', label: 'Name' },
              { key: 'value', label: 'Value' }
            ],
            rows: [
              { name: 'Missing', value: null },
              { name: 'Object', value: { nested: true } }
            ]
          }
        ]
      })
    ).toEqual({
      type: 'root',
      children: [
        {
          type: 'list',
          ordered: true,
          start: 3,
          children: [
            { type: 'listItem', children: [{ type: 'paragraph', children: [{ type: 'text', value: 'First' }] }] },
            { type: 'listItem', children: [{ type: 'code', lang: 'ts', value: 'console.log("hello")' }] }
          ]
        },
        {
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
                { type: 'tableCell', children: [{ type: 'text', value: 'Missing' }] },
                { type: 'tableCell', children: [{ type: 'text', value: '' }] }
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
        }
      ]
    });
  });
});
