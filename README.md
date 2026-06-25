<p align="center">
  <img src="images/yamdown.png" alt="Yamdown" />
</p>
<h1 align="center">Yamdown</h1>

[![CI Build](https://github.com/tonyjunkes/yamdown/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/tonyjunkes/yamdown/actions/workflows/ci.yml)

Yamdown is a structured YAML authoring format for generating deterministic,
human-readable Markdown.

Markdown is excellent for humans, GitHub, documentation sites, and LLM-readable
output. It is less reliable as source data for validation, transformation, and
automated edits. Yamdown keeps Markdown as the output format and uses YAML as
the structured source of truth.

**Structured YAML in. Clean Markdown out.**

```yaml
frontmatter:
  title: Example
blocks:
  - h1: Getting Started
  - p: Use structured nodes where tools need predictable data.
  - markdown: |
      Use **normal Markdown** where flexibility is more useful.

      - Adopt Yamdown gradually
      - Keep familiar Markdown syntax
```

```md
---
title: Example
---

# Getting Started

Use structured nodes where tools need predictable data.

Use **normal Markdown** where flexibility is more useful.

- Adopt Yamdown gradually
- Keep familiar Markdown syntax
```

## Why yamdown?

- **Structured source of truth:** reorder sections, update table rows, and
  validate required document shapes without reparsing Markdown.
- **Deterministic output:** the same normalized document and options produce the
  same Markdown, including whitespace and final newlines.
- **Strict validation:** TypeScript types and Zod schemas share one document
  model.
- **Two authoring modes:** use raw Markdown for trusted content or structured
  nodes for safer generated and automated content.
- **Useful diagnostics:** YAML validation failures include document paths,
  source ranges, and CLI code frames.
- **Library and CLI:** parse, normalize, render, validate, or convert documents
  to an official mdast tree for remark and unified workflows.

## Getting started

Yamdown requires Node.js 22.12 or later and uses pnpm.

```bash
pnpm install
pnpm run build
node dist/cli.mjs examples/readme.yaml
```

Write the generated Markdown to a file:

```bash
node dist/cli.mjs examples/readme.yaml -o output.md
```

When Yamdown is installed into another project from a local workspace or
tarball, use the package normally:

```ts
import { renderMarkdown } from 'yamdown';

const markdown = renderMarkdown(`
blocks:
  - h1: Hello
  - p: This is **Markdown** from YAML.
`);
```

## Document format

A document contains optional YAML frontmatter and a required array of blocks.
Normalized document and verbose node shapes are strictly validated.

```yaml
frontmatter:
  title: Example Document
  draft: false
blocks:
  - type: heading
    depth: 1
    text: Getting Started
  - type: paragraph
    text: This is **raw Markdown**.
```

Most common blocks also have a compact shorthand:

| Block          | Verbose type    | Shorthand         |
| -------------- | --------------- | ----------------- |
| Heading        | `heading`       | `h1` through `h6` |
| Paragraph      | `paragraph`     | `p`               |
| Raw Markdown   | `markdown`      | `markdown`        |
| Unordered list | `list`          | `ul`              |
| Ordered list   | `list`          | `ol`              |
| Fenced code    | `code`          | `code`            |
| Blockquote     | `blockquote`    | `quote`           |
| Thematic break | `thematicBreak` | `hr`              |
| Raw HTML       | `html`          | `html`            |
| Table          | `table`         | `table`           |

Lists may contain strings for simple items or nested block arrays for richer
content. Add `checked: true` or `checked: false` to a list item when you want a
GFM task-list marker; omit it for ordinary list items.

Table shorthand wraps the same `columns` and `rows` fields as the verbose node.
Columns may set `align` to `left`, `center`, `right`, or `null`/omitted for no
alignment.

### Editor schema

Yamdown ships a Draft 2020-12 JSON Schema for YAML-aware editors. The schema
validates the authoring shape before normalization, so it covers both verbose
nodes and shorthand forms.

When installed from a workspace or tarball, the stable schema path is:

```text
node_modules/yamdown/schema/yamdown.schema.json
```

Tools that understand package exports can also resolve:

```text
yamdown/schema.json
```

For the VS Code YAML language server, map the packaged schema file to the YAML
files that should use Yamdown validation:

```json
{
  "yaml.schemas": {
    "./node_modules/yamdown/schema/yamdown.schema.json": ["yamdown*.yaml", "*.yamdown.yaml"]
  }
}
```

For integrations that cannot resolve package files directly, the CLI can print
the same schema to stdout:

```bash
yamdown --schema > yamdown.schema.json
```

Code fences automatically grow when their contents include the chosen fence
character. Code language identifiers must be single-line strings. Use `meta` to
preserve the text after the language identifier in the fenced-code info string:

```yaml
blocks:
  - code:
      lang: ts
      meta: title="example.ts"
      value: |
        console.log("hello")
```

When an info string contains a backtick, the renderer uses a tilde fence.

### Raw Markdown escape hatch

Yamdown does not require every part of a document to become structured at once.
Use a raw Markdown block for trusted existing content or syntax that does not
have a dedicated Yamdown node:

```yaml
blocks:
  - markdown: |
      This is **normal Markdown**.

      - It remains familiar
      - It can be migrated gradually
```

Raw blocks can be mixed with structured blocks and nested in lists or
blockquotes. Yamdown normalizes their outer blank lines and line endings for
deterministic composition but does not parse, validate, escape, or sanitize the
Markdown inside them. Internal indentation, blank lines, and significant spaces
are preserved.

Use structured nodes when a tool or LLM must reliably validate or manipulate a
specific part of the document. Use raw blocks when preserving normal Markdown
authoring is more valuable than field-level structure.

### Raw and structured inline content

Paragraph and heading `text` fields—including `p` and `h1`–`h6` shorthand—are
trusted raw Markdown. Use them when Markdown syntax is intentional.

```yaml
blocks:
  - p: This is **bold** and [linked](https://example.com).
```

Use `children` for generated or tool-edited content. Structured text is escaped
contextually, while formatting is expressed with explicit nodes.

```yaml
blocks:
  - type: paragraph
    children:
      - type: text
        value: 'This is '
      - type: strong
        children:
          - type: text
            value: structured
      - type: text
        value: ' and '
      - type: link
        url: https://example.com
        title: Example
        children:
          - type: text
            value: safe
      - type: text
        value: '.'
```

Supported inline nodes are `text`, `emphasis`, `strong`, `delete`, `inlineCode`,
`link`, `image`, and `break`.

> [!WARNING]
> Raw Markdown—including paragraph and heading `text`—and `html` blocks are intentionally trusted and are not
> sanitized. Structured text prevents Markdown syntax injection, but Yamdown
> does not validate URL schemes or sanitize rendered output; validate links and
> HTML according to your application’s trust boundary.

### Tables

Table columns define the output order independently of object key order.

```yaml
blocks:
  - type: table
    columns:
      - key: name
        label: Name
      - key: description
        label: Description
    rows:
      - name: YAML
        description: Source format
      - name: Markdown
        description: Output format
```

## Library API

The high-level renderer accepts either YAML source or a document object:

```ts
import { normalizeDocument, parseYamlMarkdown, renderMarkdown, toMdast } from 'yamdown';

const document = parseYamlMarkdown(`
blocks:
  - h2: API example
`);

const normalized = normalizeDocument(document);
const markdown = renderMarkdown(normalized);
const tree = toMdast(normalized);
```

Key exports:

| Export                             | Purpose                                                |
| ---------------------------------- | ------------------------------------------------------ |
| `parseYamlMarkdown`                | Parse YAML and return a validated normalized document  |
| `normalizeDocument`                | Expand shorthand and validate an unknown input value   |
| `renderMarkdown`                   | Parse or normalize input and render complete Markdown  |
| `renderDocument`                   | Render an already validated document                   |
| `renderBlock`, `renderInline`      | Render individual document nodes                       |
| `toMdast`                          | Convert YAML or a document to an official `mdast.Root` |
| `yamlMarkdownDocumentSchema`       | Validate with the public Zod document schema           |
| `yamlMarkdownSourceDocumentSchema` | Validate the pre-normalization authoring shape         |

Public node types, schemas, source-range types, and error classes are also
exported from the package root.

### mdast interoperability

`toMdast` renders Yamdown with the supplied options and parses that exact
Markdown with the official mdast parser plus GFM and YAML-frontmatter
extensions:

```ts
import type { Root } from 'mdast';
import { toMdast } from 'yamdown';

const tree: Root = toMdast(
  `
frontmatter:
  title: Example
blocks:
  - h1: Hello, *world*!
  - p: Visit https://example.com
`,
  { frontmatter: true }
);
```

Raw Markdown is represented semantically—`*world*` becomes an `emphasis`
node—while escaped structured text remains literal. The returned tree includes
standard source positions, GFM tables, task-list fields, autolinks,
strikethrough, footnotes, and YAML nodes. Its positions refer to the generated
Markdown, not the original YAML source.

### Render options

```ts
const markdown = renderMarkdown(document, {
  frontmatter: true,
  bullet: '-',
  orderedDelimiter: '.',
  codeFence: '`',
  blankLines: 1
});
```

| Option             | Values        | Default |
| ------------------ | ------------- | ------- |
| `frontmatter`      | `boolean`     | `true`  |
| `headingStyle`     | `atx`         | `atx`   |
| `bullet`           | `-`, `*`, `+` | `-`     |
| `orderedDelimiter` | `.`, `)`      | `.`     |
| `codeFence`        | `` ` ``, `~`  | `` ` `` |
| `blankLines`       | number        | `1`     |

## CLI

```text
yamdown [input] [options]

-o, --output <file>  Write Markdown to a file
--check               Validate without rendering Markdown
--debug               Include stack traces for unexpected errors
--schema              Print the Yamdown authoring JSON Schema
```

Without `--output`, rendered Markdown is written to stdout. Validation and file
errors are written to stderr and return a non-zero exit code. `--schema` does
not read an input file and cannot be combined with an input file, `--check`, or
`--output`.

```bash
yamdown document.yaml
yamdown document.yaml -o README.md
yamdown --check document.yaml
yamdown --schema
```

## Diagnostics

Source-shape validation issues retain the original YAML path; canonical
validation issues use the normalized document path. When the input comes from
YAML, issues also include one-based line and column positions plus
zero-based character offsets; range ends are exclusive.

```text
document.yaml:2:9 error: Invalid YAML Markdown document at blocks[0].text: Invalid input: expected string, received number
2 |   - h2: 42
  |         ^^
```

Library consumers can inspect `YamlMarkdownParseError`,
`YamlMarkdownValidationError`, `ValidationIssue`, `SourcePosition`, and
`SourceRange` directly.

## Development

```bash
pnpm run typecheck     # TypeScript validation
pnpm run lint          # oxlint checks
pnpm run fmt:check     # formatting check
pnpm run test          # Vitest suite
pnpm run build         # package build
pnpm run schema:generate # rebuild the committed editor schema
pnpm run build && pnpm run test:package # install and exercise a local tarball
pnpm run check         # run the complete validation pipeline
```

`pnpm run pack:check` displays the files that would be included in a package
without writing a tarball or contacting a registry. Publishing is currently
blocked by the package's `private` flag.

## Current limitations

Yamdown v1 is not a Markdown superset and does not parse Markdown back into
YAML. It does not provide Markdown AST round-tripping, sanitize Markdown or
HTML, support MDX or execute plugins, load remote files, or provide watch mode.

Planned areas include broader Yamdown node coverage and richer CLI workflows.
