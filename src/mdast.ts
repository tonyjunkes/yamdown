import type { Root } from 'mdast';
import { documentToMdast } from './document-mdast.js';
import type { RenderOptions, YamdownDocument } from './types.js';
import { parseYamlDocument } from './yaml.js';

export function toMdast(input: string | Readonly<YamdownDocument>, options: Readonly<RenderOptions> = {}): Root {
  return documentToMdast(typeof input === 'string' ? parseYamlDocument(input) : input, options);
}
