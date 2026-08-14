import { normalizeDocument } from './normalize.js';
import { renderDocument } from './render.js';
import type { RenderOptions, YamdownDocument } from './types.js';
import { renderYamlMarkdown } from './yaml.js';

/**
 * @deprecated A string passed here is YAML source through 0.x. Prefer the
 * explicit `renderYamlMarkdown` or Markdown-native APIs so input format is
 * never inferred.
 */
export function renderMarkdown(input: string, options?: Readonly<RenderOptions>): string;
export function renderMarkdown(input: Readonly<YamdownDocument>, options?: Readonly<RenderOptions>): string;
export function renderMarkdown(
  input: string | Readonly<YamdownDocument>,
  options: Readonly<RenderOptions> = {}
): string {
  return typeof input === 'string'
    ? renderYamlMarkdown(input, options)
    : renderDocument(normalizeDocument(input), options);
}
