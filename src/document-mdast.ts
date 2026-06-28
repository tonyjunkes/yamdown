import type { Root } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { frontmatterFromMarkdown } from 'mdast-util-frontmatter';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { frontmatter } from 'micromark-extension-frontmatter';
import { gfm } from 'micromark-extension-gfm';
import { normalizeDocument } from './normalize.js';
import { renderDocument } from './render.js';
import type { RenderOptions, YamdownDocument } from './types.js';

const extensions = [gfm(), frontmatter()];
const mdastExtensions = [gfmFromMarkdown(), frontmatterFromMarkdown()];

export function documentToMdast(input: Readonly<YamdownDocument>, options: Readonly<RenderOptions> = {}): Root {
  const document = normalizeDocument(input);
  return fromMarkdown(renderDocument(document, options), { extensions, mdastExtensions });
}
