import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { YamdownValidationError, YamdownYamlParseError, parseYamlDocument } from '../src/index.js';

const fixtureDir = join(import.meta.dirname, 'fixtures');

function expectParseError(error: unknown): YamdownYamlParseError {
  expect(error).toBeInstanceOf(YamdownYamlParseError);
  if (!(error instanceof YamdownYamlParseError)) {
    throw new Error('Expected YamdownYamlParseError');
  }

  return error;
}

function expectValidationError(error: unknown): YamdownValidationError {
  expect(error).toBeInstanceOf(YamdownValidationError);
  if (!(error instanceof YamdownValidationError)) {
    throw new Error('Expected YamdownValidationError');
  }

  return error;
}

describe('parseYamlDocument', () => {
  test('reports unresolved aliases as YAML parse errors', () => {
    expect(() => parseYamlDocument('blocks: *missing')).toThrow(YamdownYamlParseError);
    expect(() => parseYamlDocument('blocks: *missing')).toThrow(/Unresolved alias/u);
  });

  test('retains the YAML alias expansion limit and public error type', () => {
    const source = `frontmatter:\n  value: &value [a, b]\n  copies: [${Array.from({ length: 101 }, () => '*value').join(', ')}]\nblocks: []`;
    expect(() => parseYamlDocument(source)).toThrow(YamdownYamlParseError);
    expect(() => parseYamlDocument(source)).toThrow(/Excessive alias count/u);
  });

  test('rejects circular block aliases with a source-aware validation error', () => {
    let caught: unknown;
    try {
      parseYamlDocument('blocks: &loop\n  - quote: *loop\n');
    } catch (error) {
      caught = error;
    }
    expect(expectValidationError(caught).issues[0]).toMatchObject({
      path: ['blocks', 0, 'quote'],
      message: 'Cyclic input is not supported',
      location: { start: { line: 2, column: 12 } }
    });
  });

  test('accepts shared aliases without mistaking them for cycles', () => {
    expect(parseYamlDocument('blocks:\n  - &item {p: Shared}\n  - *item\n')).toEqual({
      blocks: [
        { type: 'paragraph', text: 'Shared' },
        { type: 'paragraph', text: 'Shared' }
      ]
    });
  });

  test('parses valid YAML into a normalized document', () => {
    expect(
      parseYamlDocument(`
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
      parseYamlDocument('blocks: [');
    } catch (error) {
      caught = error;
    }

    const parseError = expectParseError(caught);
    expect(parseError.name).toBe('YamdownYamlParseError');
    expect(parseError.location?.start.line).toBe(1);
    expect(parseError.location?.start.column).toBeGreaterThan(0);
  });

  test('throws a validation error with useful issue data', async () => {
    const invalid = await readFile(join(fixtureDir, 'invalid.yaml'), 'utf8');

    let caught: unknown;
    try {
      parseYamlDocument(invalid);
    } catch (error) {
      caught = error;
    }

    const validationError = expectValidationError(caught);
    const { issues, message } = validationError;
    expect(validationError.name).toBe('YamdownValidationError');
    expect(issues[0]?.path).toContain('blocks');
    expect(message).toMatch(/Invalid Yamdown document/u);
  });

  test('maps shorthand validation errors to exact YAML ranges with CRLF input', () => {
    let caught: unknown;
    try {
      parseYamlDocument('blocks:\r\n  - h2: 42\r\n');
    } catch (error) {
      caught = error;
    }

    const validationError = expectValidationError(caught);
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
      parseYamlDocument('blocks:\n  - html: 42\n');
    } catch (error) {
      caught = error;
    }

    const validationError = expectValidationError(caught);
    expect(validationError.issues[0]).toMatchObject({
      path: ['blocks', 0, 'html'],
      location: { start: { line: 2, column: 11 } }
    });
  });

  test('rejects the removed document title at its source location', () => {
    let caught: unknown;
    try {
      parseYamlDocument('title: Legacy\nblocks: []\n');
    } catch (error) {
      caught = error;
    }

    const validationError = expectValidationError(caught);
    expect(validationError.issues[0]).toMatchObject({
      path: ['title'],
      location: { start: { line: 1, column: 8 } }
    });
  });

  test('falls back to the nearest YAML parent for a missing property', () => {
    let caught: unknown;
    try {
      parseYamlDocument('blocks:\n  - type: heading\n    depth: 2\n');
    } catch (error) {
      caught = error;
    }

    const validationError = expectValidationError(caught);
    expect(validationError.issues[0]?.path).toEqual(['blocks', 0, 'text']);
    expect(validationError.issues[0]?.location?.start.line).toBe(2);
  });

  test('reports malformed Markdown shorthand at its source value', () => {
    let caught: unknown;
    try {
      parseYamlDocument('blocks:\n  - markdown:\n      nested: invalid\n');
    } catch (error) {
      caught = error;
    }

    const validationError = expectValidationError(caught);
    expect(validationError.issues[0]).toMatchObject({
      path: ['blocks', 0, 'markdown'],
      location: { start: { line: 3, column: 7 } }
    });
  });

  test('reports malformed table shorthand at its source field', () => {
    let caught: unknown;
    try {
      parseYamlDocument('blocks:\n  - table:\n      columns: invalid\n      rows: []\n');
    } catch (error) {
      caught = error;
    }

    const validationError = expectValidationError(caught);
    expect(validationError.issues[0]).toMatchObject({
      path: ['blocks', 0, 'table', 'columns'],
      location: { start: { line: 3, column: 16 } }
    });
  });

  test('reports malformed code metadata at its source field', () => {
    let caught: unknown;
    try {
      parseYamlDocument('blocks:\n  - code:\n      meta: title="example.ts"\n      value: content\n');
    } catch (error) {
      caught = error;
    }

    const validationError = expectValidationError(caught);
    expect(validationError.issues[0]).toMatchObject({
      path: ['blocks', 0, 'code', 'meta'],
      location: { start: { line: 3, column: 13 } }
    });
  });

  test('reports malformed task-list state at its source field', () => {
    let caught: unknown;
    try {
      parseYamlDocument('blocks:\n  - ul:\n      - checked: yes\n        blocks: []\n');
    } catch (error) {
      caught = error;
    }

    const validationError = expectValidationError(caught);
    expect(validationError.issues[0]).toMatchObject({
      path: ['blocks', 0, 'ul', 0, 'checked'],
      location: { start: { line: 3, column: 18 } }
    });
  });

  test('reports unresolved references at their YAML identifier', () => {
    let caught: unknown;
    try {
      parseYamlDocument(
        'blocks:\n  - type: paragraph\n    children:\n      - type: footnoteReference\n        identifier: missing\n'
      );
    } catch (error) {
      caught = error;
    }

    const validationError = expectValidationError(caught);
    expect(validationError.issues[0]).toMatchObject({
      path: ['blocks', 0, 'children', 0, 'identifier'],
      location: { start: { line: 5, column: 21 } }
    });
  });
});
