import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import * as publicApi from '../src/index.js';

const sourceDirectory = join(import.meta.dirname, '..', 'src');

describe('source-format boundaries', () => {
  test('exports only the canonical 0.8 API names', () => {
    expect(typeof publicApi.parseYamlDocument).toBe('function');
    expect(typeof publicApi.YamdownError).toBe('function');
    expect(typeof publicApi.YamdownValidationError).toBe('function');
    expect(typeof publicApi.YamdownYamlParseError).toBe('function');
    expect(typeof publicApi.yamdownDocumentSchema).toBe('object');
    expect(typeof publicApi.yamdownSourceDocumentSchema).toBe('object');
    expect(publicApi).not.toHaveProperty('parseYamlMarkdown');
    expect(publicApi).not.toHaveProperty('YamlMarkdownError');
    expect(publicApi).not.toHaveProperty('YamlMarkdownParseError');
    expect(publicApi).not.toHaveProperty('YamlMarkdownRenderError');
    expect(publicApi).not.toHaveProperty('YamlMarkdownValidationError');
    expect(publicApi).not.toHaveProperty('yamlMarkdownDocumentSchema');
    expect(publicApi).not.toHaveProperty('yamlMarkdownSourceDocumentSchema');
  });

  test.each(['render.ts', 'document-mdast.ts', 'normalize.ts', 'types.ts'])(
    'keeps %s independent from YAML input adapters',
    async (filename) => {
      const source = await readFile(join(sourceDirectory, filename), 'utf8');

      expect(source).not.toMatch(/from ['"]\.\/(?:parse|yaml|facade)\.js['"]/u);
    }
  );

  test('routes CLI parsing and rendering through the YAML adapter', async () => {
    const source = await readFile(join(sourceDirectory, 'cli.ts'), 'utf8');

    expect(source).toContain("from './yaml.js'");
    expect(source).not.toContain("from './parse.js'");
    expect(source).not.toContain("from './facade.js'");
  });
});
