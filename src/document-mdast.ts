import type { Root } from 'mdast';
import { parseMarkdownRoot } from './markdown-document.js';
import { normalizeDocument } from './normalize.js';
import { renderDocument } from './render.js';
import type { RenderOptions, YamdownDocument } from './types.js';

export function documentToMdast(input: Readonly<YamdownDocument>, options: Readonly<RenderOptions> = {}): Root {
  const document = normalizeDocument(input);
  return parseMarkdownRoot(renderDocument(document, options));
}
