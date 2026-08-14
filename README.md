<p align="center">
  <img src="https://raw.githubusercontent.com/tonyjunkes/yamdown/main/images/yamdown.png" alt="Yamdown" />
</p>
<h1 align="center">Yamdown</h1>

[![CI Build](https://github.com/tonyjunkes/yamdown/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/tonyjunkes/yamdown/actions/workflows/ci.yml)

Yamdown 0.10 is a Markdown-native structured authoring preview. It adds strict,
invisible HTML-comment annotations to normal GFM, so a `.yamdown.md` file still
renders correctly in Markdown tools that do not know Yamdown.

Use Markdown when Markdown is the best source format. Use Yamdown annotations
when a tool needs stable IDs, validated scopes, or structured metadata. YAML
remains a first-class authoring and interchange format for teams that prefer a
fully structured document model.

**Markdown in. Clean Markdown out. Structured YAML remains supported.**

```md
---
title: Welcome
---

<!-- yamdown:document {"v":1,"profile":"base"} -->

<!-- yamdown:node {"id":"welcome","kind":"hero"} -->

# Welcome

Read the <!-- yamdown:span {"id":"product","kind":"product"} -->Yamdown<!-- yamdown:/span {"id":"product"} --> guide.
```

The normal Markdown projection contains no Yamdown comments:

```md
---
title: Welcome
---

# Welcome

Read the Yamdown guide.
```

## Why Yamdown?

- **Portable Markdown source:** ordinary GFM remains ordinary GFM. Yamdown
  annotations are comments, not a required Markdown extension or executable
  syntax.
- **Stable structure:** authored IDs attach metadata to blocks, inline spans,
  and nested block regions without making visible Markdown less readable.
- **Strict when requested:** a document profile validates annotation JSON,
  placement, unique identities, nesting, and source ranges.
- **Two authoring paths:** author `.yamdown.md` directly, or generate the same
  portable annotations from typed YAML wrappers.
- **Deterministic YAML rendering:** structured YAML still provides predictable
  Markdown, tables, task lists, frontmatter, code fences, and mdast output.
- **Useful diagnostics:** Yamdown reports typed validation errors with source
  locations and CLI code frames.

## Getting started

Yamdown requires Node.js 24 or later. The repository pins its pnpm version;
Corepack is the supported bootstrap path when pnpm is not already installed:

```bash
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm run build
node dist/cli.mjs examples/readme.yaml
```

The package is intentionally private. Consume it from a checked-out workspace
or a local tarball rather than from the public npm registry:

```bash
# In the Yamdown checkout
pnpm pack

# In a consumer project; use the tarball name pnpm printed above
pnpm add /absolute/path/to/yamdown-0.10.0.tgz
```

## Markdown-native documents

Use `.yamdown.md` for an annotated Markdown document. Plain `.md` is also valid
when a distinct extension is unnecessary. A document without the document
annotation is unprofiled GFM. When a document has YAML frontmatter, keep that
frontmatter at the literal start of the file and put the following annotation
immediately after it. Without frontmatter, it is the first line. It opts the
document into the strict built-in profile:

```md
<!-- yamdown:document {"v":1,"profile":"base"} -->
```

The base profile has three annotation forms:

| Form                                 | Purpose                                                 |
| ------------------------------------ | ------------------------------------------------------- |
| `yamdown:node`                       | Attach metadata to the immediately following block.     |
| `yamdown:span` / `yamdown:/span`     | Attach metadata to a contiguous inline range.           |
| `yamdown:region` / `yamdown:/region` | Attach metadata to a nested sequence of sibling blocks. |

Every opening annotation has a document-unique `id` and may include a string
`kind` and JSON `data`. Yamdown validates matching pairs, legal placement, and
proper nesting. Unrelated HTML comments, raw HTML, and comments inside code are
preserved as normal Markdown rather than interpreted as annotations.

Read the complete grammar, projection rule, YAML mapping, and compatibility
rules in [FORMAT.md](FORMAT.md).

### Markdown API

Use the explicit Markdown APIs for Markdown input. Parsing retains the original
source, official GFM/frontmatter `mdast`, annotation index, stable IDs, and
source ranges. Clean rendering removes only recognized Yamdown annotations.

```ts
import { readFile } from 'node:fs/promises';
import {
  parseMarkdownDocument,
  renderMarkdownDocument,
  serializeMarkdownDocument,
  type YamdownMarkdownDocument
} from 'yamdown';

const source = await readFile('page.yamdown.md', 'utf8');
const document: YamdownMarkdownDocument = parseMarkdownDocument(source);

const cleanMarkdown = renderMarkdownDocument(document);
const annotatedSource = serializeMarkdownDocument(document);

document.root; // official mdast.Root
document.annotations; // resolved annotations and source ranges
```

`document.source` retains the original input byte-for-byte for source-aware
tooling. `serializeMarkdownDocument` produces canonical annotated Markdown;
the preview does not yet expose a source-preserving editor API.

The legacy string overloads of `renderMarkdown` and `toMdast` continue to mean
YAML input through 0.x and are deprecated for new code. Yamdown never
auto-detects a library string; use the explicit Markdown API instead.

## YAML authoring

YAML remains useful for generated documents, schema-driven content, and tools
that want a complete data model. Existing YAML documents work unchanged. Add a
top-level `yamdown` descriptor and wrappers to emit the portable Markdown
annotations:

```yaml
yamdown:
  v: 1
  profile: base
frontmatter:
  title: Welcome
blocks:
  - type: annotatedBlock
    id: welcome
    kind: hero
    block:
      h1: Welcome
  - type: paragraph
    children:
      - type: text
        value: 'Read the '
      - type: annotatedSpan
        id: product
        kind: product
        children:
          - type: text
            value: Yamdown
      - type: text
        value: guide.
  - type: annotatedRegion
    id: next-steps
    kind: section
    blocks:
      - h2: Next steps
      - p: Keep authoring in familiar Markdown.
```

`annotatedBlock` renders one node comment before `block`; `annotatedSpan` and
`annotatedRegion` render matching opening and closing comments around their
children or blocks. Raw `markdown` values remain trusted, opaque content—use
the wrappers instead of embedding annotation comments in raw strings.

For ordinary YAML content, compact shorthand remains available:

```yaml
frontmatter:
  title: Yamdown Example
blocks:
  - h1: Yamdown Example
  - p: Structured YAML in. **Clean Markdown out.**
  - ul:
      - Validate predictable document shapes
      - Update structured content safely
  - markdown: |
      ## Existing content

      Raw blocks preserve **normal Markdown** without parsing it.
```

This checked-in source renders byte-for-byte to
[examples/readme.md](examples/readme.md). Raw Markdown and HTML are intentionally
trusted and are not sanitized. Structured inline text is contextually escaped,
but applications must enforce their own URL and HTML trust boundaries.

### YAML API and mdast

```ts
import { documentToMdast, parseYamlDocument, renderYamlMarkdown, type YamdownDocument } from 'yamdown';

const yaml = `
blocks:
  - h2: API example
`;

const document: YamdownDocument = parseYamlDocument(yaml);
const markdown = renderYamlMarkdown(yaml);
const tree = documentToMdast(document);
```

`documentToMdast` renders Yamdown and parses that exact Markdown using the
official mdast parser with GFM and YAML-frontmatter support. Its positions refer
to generated Markdown, not the YAML input.

Yamdown supports structured headings, paragraphs, lists, blockquotes, tables,
code, HTML, references, footnotes, and structured inline content. See
[FORMAT.md](FORMAT.md) for annotations and the source types exported by the
package for the full YAML model.

### Editor schema

Yamdown ships a Draft 2020-12 JSON Schema for YAML-aware editors. It validates
the pre-normalization authoring shape, including YAML shorthand and annotation
wrappers. Document-wide reference integrity and some rendering constraints are
runtime checks, so editor validation is an early signal rather than a complete
substitute for `yamdown --check`.

When installed from a workspace or tarball, the stable schema path is:

```text
node_modules/yamdown/schema/yamdown.schema.json
```

Tools that resolve package exports can import the same JSON with an import
attribute:

```ts
import schema from 'yamdown/schema.json' with { type: 'json' };
```

For the VS Code YAML language server:

```json
{
  "yaml.schemas": {
    "./node_modules/yamdown/schema/yamdown.schema.json": ["yamdown*.yaml", "*.yamdown.yaml"]
  }
}
```

The CLI can also print the committed schema:

```bash
yamdown --schema > yamdown.schema.json
```

## CLI

```text
yamdown [input] [options]

--input-format <yaml|markdown>  Select source format when the path is ambiguous
-o, --output <file>             Write Markdown to a file
--check                          Validate without rendering Markdown
--schema                         Print the Yamdown YAML authoring JSON Schema
--version                        Print the installed package version
--debug                          Include stack traces for unexpected errors
```

The CLI recognizes `.yaml`, `.yml`, and `.yamdown.md` paths. Use
`--input-format` for stdin (`-`) and ambiguous extensions; it never
content-sniffs input.

```bash
yamdown document.yaml
yamdown document.yamdown.md -o README.md
yamdown --check document.yamdown.md
yamdown --input-format markdown - < document.md
yamdown --schema
```

Without `--output`, rendered Markdown goes to stdout. Errors go to stderr and
return a non-zero exit status. `--schema` does not read an input file and cannot
be combined with an input path, `--check`, or `--output`.

## Development

```bash
pnpm run typecheck       # TypeScript validation
pnpm run lint            # oxlint checks
pnpm run fmt:check       # formatting check
pnpm run test            # Vitest suite
pnpm run build           # package build
pnpm run schema:generate # rebuild the committed editor schema
pnpm run schema:check    # verify the committed schema matches the build
pnpm run test:package    # install and exercise a local tarball
pnpm run pack:check      # inspect package contents without publishing
pnpm run check           # complete validation pipeline
```

The package `prepack` hook builds and checks the schema before a tarball is
created. CI runs source tests and installed-tarball/package checks on the
Node 24 minimum and the latest Node release; coverage is collected once
on the latest Node 24 release.

## Preview boundaries

0.10 is a format preview. Yamdown does not sanitize Markdown or HTML, support
MDX, execute plugins, load remote files, or include a watch mode. It preserves
the original source on parsed Markdown documents, but source-preserving editing
and arbitrary custom profiles are future work. `:::directive` syntax is also
not a source format; a future controlled toolchain may compile directives into
portable Yamdown comments.
