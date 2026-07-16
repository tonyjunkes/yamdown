import { describe, expect, test } from 'vitest';
import { formatPath } from '../src/errors.js';

describe('formatPath', () => {
  test('formats ordinary document paths compactly', () => {
    expect(formatPath(['blocks', 0, 'children', 1])).toBe('blocks[0].children[1]');
    expect(formatPath([])).toBe('document');
  });

  test('quotes arbitrary object keys without making the path ambiguous', () => {
    expect(formatPath(['blocks', 0, 'rows', 1, 'release.notes', 'children'])).toBe(
      'blocks[0].rows[1]["release.notes"].children'
    );
    expect(formatPath(['not valid', 'quote"key'])).toBe('["not valid"]["quote\\"key"]');
  });
});
