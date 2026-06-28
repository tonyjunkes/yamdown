import { normalizeDocument } from './normalize.js';
import { renderDocument } from './render.js';
import type { RenderOptions, YamdownDocument } from './types.js';
import { renderYamlMarkdown } from './yaml.js';

export function renderMarkdown(
  input: string | Readonly<YamdownDocument>,
  options: Readonly<RenderOptions> = {}
): string {
  return typeof input === 'string'
    ? renderYamlMarkdown(input, options)
    : renderDocument(normalizeDocument(input), options);
}
