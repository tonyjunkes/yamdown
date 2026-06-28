import { parseYamlDocument } from './parse.js';
import { renderDocument } from './render.js';
import type { RenderOptions } from './types.js';

export { parseYamlDocument } from './parse.js';

export function renderYamlMarkdown(input: string, options: Readonly<RenderOptions> = {}): string {
  return renderDocument(parseYamlDocument(input), options);
}
