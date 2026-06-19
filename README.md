# yamdown

Convert structured YAML into deterministic, human-readable Markdown.

Yamdown gives tools and people a document format that is easier to validate,
transform, and regenerate than raw Markdown while keeping the resulting files
pleasant to read and edit.

```yaml
frontmatter:
  title: Example
blocks:
  - h1: Getting Started
  - p: Write **Markdown** with structured YAML.
  - ul:
      - Validate the document
      - Render stable output
```

```md
---
title: Example
---

# Getting Started

Write **Markdown** with structured YAML.

- Validate the document
- Render stable output
```

## Why yamdown?

- **Deterministic output:** the same normalized document and options produce the
  same Markdown, including whitespace and final newlines.
- **Strict validation:** TypeScript types and Zod schemas share one document
  model.
- **Two authoring modes:** use raw Markdown for trusted content or structured
  inline nodes for safely escaped generated content.
- **Useful diagnostics:** YAML validation failures include document paths,
  source ranges, and CLI code frames.
- **Library and CLI:** parse, normalize, render, validate, or convert documents
  to a small mdast-compatible tree.

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
| Unordered list | `list`          | `ul`              |
| Ordered list   | `list`          | `ol`              |
| Fenced code    | `code`          | `code`            |
| Blockquote     | `blockquote`    | `quote`           |
| Thematic break | `thematicBreak` | `hr`              |
| Raw HTML       | `html`          | `html`            |
| Table          | `table`         | —                 |

Lists may contain strings for simple items or nested block arrays for richer
content. Code fences automatically grow when their contents include the chosen
fence character. Code language identifiers must be single-line strings; when an
identifier contains a backtick, the renderer uses a tilde fence.

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

Supported inline nodes are `text`, `emphasis`, `strong`, `inlineCode`, `link`,
`image`, and `break`.

> [!WARNING]
> Raw Markdown and `html` blocks are intentionally trusted and are not
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

| Export                        | Purpose                                                |
| ----------------------------- | ------------------------------------------------------ |
| `parseYamlMarkdown`           | Parse YAML and return a validated normalized document  |
| `normalizeDocument`           | Expand shorthand and validate an unknown input value   |
| `renderMarkdown`              | Parse or normalize input and render complete Markdown  |
| `renderDocument`              | Render an already validated document                   |
| `renderBlock`, `renderInline` | Render individual document nodes                       |
| `toMdast`                     | Convert a document to Yamdown's mdast-compatible shape |
| `yamlMarkdownDocumentSchema`  | Validate with the public Zod document schema           |

Public node types, schemas, source-range types, and error classes are also
exported from the package root.

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
yamdown <input> [options]

-o, --output <file>  Write Markdown to a file
--check               Validate without rendering Markdown
--debug               Include stack traces for unexpected errors
```

Without `--output`, rendered Markdown is written to stdout. Validation and file
errors are written to stderr and return a non-zero exit code.

```bash
yamdown document.yaml
yamdown document.yaml -o README.md
yamdown --check document.yaml
```

## Diagnostics

Validation issues retain their normalized document path. When the input comes
from YAML, they also include one-based line and column positions plus
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
pnpm run build && pnpm run test:package # install and exercise a local tarball
pnpm run check         # run the complete validation pipeline
```

`pnpm run pack:check` displays the files that would be included in a package
without writing a tarball or contacting a registry. Publishing is currently
blocked by the package's `private` flag.

## Current limitations

Yamdown does not parse Markdown back into YAML, provide full CommonMark
compliance, sanitize HTML, support MDX or plugins, load remote files, or provide
watch mode. The current mdast bridge uses a small local compatibility model
rather than the official unified ecosystem types.

Planned areas include official mdast interoperability, broader GFM node
coverage, generated editor schemas, and richer CLI workflows.
