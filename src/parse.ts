import { isNode, LineCounter, parseDocument } from 'yaml';
import { YamlMarkdownParseError } from './errors.js';
import type { SourceRange } from './errors.js';
import { normalizeDocumentWithSourceLocations } from './normalize.js';
import type { YamlMarkdownDocument } from './types.js';

export function parseYamlMarkdown(input: string): YamlMarkdownDocument {
  const lineCounter = new LineCounter();
  const document = parseDocument(input, { lineCounter, prettyErrors: false });

  if (document.errors.length > 0) {
    const firstError = document.errors[0];
    if (firstError === undefined) {
      throw new YamlMarkdownParseError('Invalid YAML input.');
    }

    throw new YamlMarkdownParseError(
      firstError.message,
      rangeFromOffsets(firstError.pos[0], firstError.pos[1], lineCounter)
    );
  }

  return normalizeDocumentWithSourceLocations(document.toJS(), (path) => {
    for (let length = path.length; length >= 0; length -= 1) {
      const node = document.getIn(path.slice(0, length), true);
      if (isNode(node) && node.range !== undefined && node.range !== null) {
        return rangeFromOffsets(node.range[0], node.range[1], lineCounter);
      }
    }

    return void 0;
  });
}

function rangeFromOffsets(start: number, end: number, lineCounter: LineCounter): SourceRange {
  const startPosition = lineCounter.linePos(start);
  const endPosition = lineCounter.linePos(end);

  return {
    start: { line: startPosition.line, column: startPosition.col, offset: start },
    end: { line: endPosition.line, column: endPosition.col, offset: end }
  };
}
