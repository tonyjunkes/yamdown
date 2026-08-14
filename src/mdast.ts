import type { Root } from 'mdast';
import { documentToMdast } from './document-mdast.js';
import type { RenderOptions, YamdownDocument } from './types.js';
import { parseYamlDocument } from './yaml.js';

/**
 * @deprecated A string passed here is YAML source through 0.x. Prefer
 * `parseMarkdownDocument` for Markdown source or `documentToMdast` for a YAML
 * document object.
 */
export function toMdast(input: string, options?: Readonly<RenderOptions>): Root;
export function toMdast(input: Readonly<YamdownDocument>, options?: Readonly<RenderOptions>): Root;
export function toMdast(input: string | Readonly<YamdownDocument>, options: Readonly<RenderOptions> = {}): Root {
  return documentToMdast(typeof input === 'string' ? parseYamlDocument(input) : input, options);
}
