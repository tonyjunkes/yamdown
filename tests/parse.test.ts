import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { YamlMarkdownParseError, YamlMarkdownValidationError, parseYamlMarkdown } from '../src/index.js';

const fixtureDir = join(import.meta.dirname, 'fixtures');

describe('parseYamlMarkdown', () => {
  test('parses valid YAML into a normalized document', () => {
    expect(
      parseYamlMarkdown(`
blocks:
  - h2: Hello
`)
    ).toEqual({
      blocks: [{ type: 'heading', depth: 2, text: 'Hello' }]
    });
  });

  test('throws a parse error for invalid YAML', () => {
    let caught: unknown;
    try {
      parseYamlMarkdown('blocks: [');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(YamlMarkdownParseError);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const parseError = caught as YamlMarkdownParseError;
    expect(parseError.location?.start.line).toBe(1);
    expect(parseError.location?.start.column).toBeGreaterThan(0);
  });

  test('throws a validation error with useful issue data', async () => {
    const invalid = await readFile(join(fixtureDir, 'invalid.yaml'), 'utf8');

    let caught: unknown;
    try {
      parseYamlMarkdown(invalid);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(YamlMarkdownValidationError);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const { issues, message } = caught as YamlMarkdownValidationError;
    expect(issues[0]?.path).toContain('blocks');
    expect(message).toMatch(/Invalid YAML Markdown document/u);
  });

  test('maps shorthand validation errors to exact YAML ranges with CRLF input', () => {
    let caught: unknown;
    try {
      parseYamlMarkdown('blocks:\r\n  - h2: 42\r\n');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(YamlMarkdownValidationError);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const validationError = caught as YamlMarkdownValidationError;
    expect(validationError.issues[0]).toMatchObject({
      path: ['blocks', 0, 'h2'],
      location: {
        start: { line: 2, column: 9, offset: 17 },
        end: { line: 2, column: 11, offset: 19 }
      }
    });
  });

  test('maps scalar shorthand fields introduced by normalization', () => {
    let caught: unknown;
    try {
      parseYamlMarkdown('blocks:\n  - html: 42\n');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(YamlMarkdownValidationError);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const validationError = caught as YamlMarkdownValidationError;
    expect(validationError.issues[0]).toMatchObject({
      path: ['blocks', 0, 'html'],
      location: { start: { line: 2, column: 11 } }
    });
  });

  test('rejects the removed document title at its source location', () => {
    let caught: unknown;
    try {
      parseYamlMarkdown('title: Legacy\nblocks: []\n');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(YamlMarkdownValidationError);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const validationError = caught as YamlMarkdownValidationError;
    expect(validationError.issues[0]).toMatchObject({
      path: ['title'],
      location: { start: { line: 1, column: 8 } }
    });
  });

  test('falls back to the nearest YAML parent for a missing property', () => {
    let caught: unknown;
    try {
      parseYamlMarkdown('blocks:\n  - type: heading\n    depth: 2\n');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(YamlMarkdownValidationError);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const validationError = caught as YamlMarkdownValidationError;
    expect(validationError.issues[0]?.path).toEqual(['blocks', 0, 'text']);
    expect(validationError.issues[0]?.location?.start.line).toBe(2);
  });

  test('reports malformed Markdown shorthand at its source value', () => {
    let caught: unknown;
    try {
      parseYamlMarkdown('blocks:\n  - markdown:\n      nested: invalid\n');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(YamlMarkdownValidationError);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const validationError = caught as YamlMarkdownValidationError;
    expect(validationError.issues[0]).toMatchObject({
      path: ['blocks', 0, 'markdown'],
      location: { start: { line: 3, column: 7 } }
    });
  });

  test('reports malformed table shorthand at its source field', () => {
    let caught: unknown;
    try {
      parseYamlMarkdown('blocks:\n  - table:\n      columns: invalid\n      rows: []\n');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(YamlMarkdownValidationError);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const validationError = caught as YamlMarkdownValidationError;
    expect(validationError.issues[0]).toMatchObject({
      path: ['blocks', 0, 'table', 'columns'],
      location: { start: { line: 3, column: 16 } }
    });
  });
});
