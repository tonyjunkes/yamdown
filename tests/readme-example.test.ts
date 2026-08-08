import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { renderYamlMarkdown } from '../src/index.js';

const examplesDirectory = join(import.meta.dirname, '..', 'examples');

describe('README example', () => {
  test('renders the tracked Markdown output byte-for-byte', async () => {
    const [source, expected] = await Promise.all([
      readFile(join(examplesDirectory, 'readme.yaml'), 'utf8'),
      readFile(join(examplesDirectory, 'readme.md'), 'utf8')
    ]);

    expect(renderYamlMarkdown(source)).toBe(expected);
  });
});
