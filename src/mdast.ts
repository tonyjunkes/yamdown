import type { Root } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { frontmatterFromMarkdown } from 'mdast-util-frontmatter';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { frontmatter } from 'micromark-extension-frontmatter';
import { gfm } from 'micromark-extension-gfm';
import { renderMarkdown } from './render.js';
import type { RenderOptions, YamlMarkdownDocument } from './types.js';

const extensions = [gfm(), frontmatter()];
const mdastExtensions = [gfmFromMarkdown(), frontmatterFromMarkdown()];

export function toMdast(input: string | Readonly<YamlMarkdownDocument>, options: Readonly<RenderOptions> = {}): Root {
  return fromMarkdown(renderMarkdown(input, options), { extensions, mdastExtensions });
}
