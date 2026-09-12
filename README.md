<p align="center">
  <img src="./images/yamdown.png" alt="Yamdown" />
</p>
<h1 align="center">Yamdown</h1>

Author Markdown with structured metadata, or generate it from YAML and JavaScript objects.

Yamdown is a TypeScript library and CLI for documents that people read and tools
need to validate or manipulate. Add stable IDs and metadata to ordinary Markdown
using HTML comments, or author a complete document as structured YAML. Both paths
produce Markdown for documentation, READMEs, and other Markdown-based workflows.

The Markdown annotation format is a preview. YAML authoring remains supported.

## Contents

- [Contents](#contents)
- [Requirements](#requirements)
- [Supported features](#supported-features)
- [Installation](#installation)
- [Usage](#usage)
  - [Read annotated Markdown](#read-annotated-markdown)
  - [Generate Markdown from YAML](#generate-markdown-from-yaml)
  - [Render JavaScript or TypeScript objects](#render-javascript-or-typescript-objects)
- [Examples](#examples)
  - [Group content with named elements](#group-content-with-named-elements)
  - [Generate a release checklist](#generate-a-release-checklist)
  - [Turn data into a table](#turn-data-into-a-table)
  - [Mix structure with familiar Markdown](#mix-structure-with-familiar-markdown)
  - [Keep generated text literal](#keep-generated-text-literal)
  - [Attach metadata without changing the prose](#attach-metadata-without-changing-the-prose)
- [API and render options](#api-and-render-options)
- [CLI](#cli)
- [Validation and limitations](#validation-and-limitations)
- [Contributing and testing](#contributing-and-testing)

## Requirements

- **Node.js 24.11.0 or later** for the library and CLI.
- **ES modules** for library imports: use an `.mjs` file or set `"type": "module"`
  in your project. There is no CommonJS `require` entry point.
- **pnpm 12.3.4** to build and test the checkout, as pinned in `package.json`.
  TypeScript is optional for consumers; the package includes type declarations.

## Supported features

| Feature                   | What you can do                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Markdown annotations      | Give blocks, inline spans, and nested regions stable IDs and JSON metadata using invisible HTML comments.                               |
| Profile validation        | Check annotation payloads, unique IDs, placement, and nesting with the built-in `base` profile.                                         |
| YAML and object authoring | Build documents with headings, paragraphs, nested lists, task lists, blockquotes, tables, code, references, footnotes, and frontmatter. |
| Inline formatting         | Use explicit text, emphasis, strong, strikethrough, code, link, image, and break nodes.                                                 |
| Mixed content             | Combine structured nodes with trusted raw Markdown, HTML, and named elements with attributes.                                           |
| Deterministic rendering   | Generate consistent Markdown with contextual text escaping and configurable list markers, code fences, and spacing.                     |
| Tool integration          | Use readonly TypeScript types, Zod schemas, a YAML editor schema, source diagnostics, and standard GFM/frontmatter mdast trees.         |

## Installation

Install the library and CLI in your project with npm:

```bash
npm install yamdown
```

Run the installed CLI with `npx`:

```bash
npx yamdown --help
```

For a global CLI installation:

```bash
npm install --global yamdown
yamdown --help
```

The following library examples run in the project where you installed `yamdown`.

## Usage

### Read annotated Markdown

Choose Markdown input when you want to keep normal Markdown as your source and
attach metadata to selected content. Save this as `markdown.mjs`:

```js
import { parseMarkdownDocument, renderMarkdownDocument } from 'yamdown';

const source = `<!-- yamdown:document {"v":1,"profile":"base"} -->

<!-- yamdown:node {"id":"welcome","kind":"intro"} -->

# Welcome

Read the guide.
`;

const document = parseMarkdownDocument(source);
process.stdout.write(renderMarkdownDocument(document));
```

Run `node markdown.mjs`. The output omits the recognized Yamdown annotations:

```md
# Welcome

Read the guide.
```

`document.annotations` contains resolved metadata and source ranges;
`document.root` is a standard `mdast.Root`. Use `serializeMarkdownDocument(document)`
to produce canonical Markdown that retains annotations, or `document.source` to
retrieve the exact original source.

The document comment opts into strict `base` profile validation. Without it,
Markdown is unprofiled GFM. Put the comment at the start of the source, immediately
after YAML frontmatter if present. See the [format reference](FORMAT.md) for
inline spans, regions, and placement rules.

### Generate Markdown from YAML

Choose YAML when your source is structured data. Save this as `yaml.mjs`:

```js
import { renderYamlMarkdown } from 'yamdown';

const source = `
blocks:
  - h1: Hello
  - p: This is **Markdown** from YAML.
  - ul:
      - Validate document data
      - Generate consistent output
`;

process.stdout.write(renderYamlMarkdown(source));
```

Run `node yaml.mjs` to print:

```md
# Hello

This is **Markdown** from YAML.

- Validate document data
- Generate consistent output
```

A YAML document requires a `blocks` array and can include `frontmatter`. Shorthand
such as `h1`, `p`, and `ul` expands to validated nodes. The `p` and heading text
fields accept trusted Markdown; use structured inline `children` for literal text.

YAML can also emit annotations using a `yamdown` descriptor and the
`annotatedBlock`, `annotatedSpan`, and `annotatedRegion` wrappers. See the
[YAML annotation mapping](FORMAT.md#yaml-representation) and
[YAML authoring reference](FORMAT.md#yaml-authoring-reference).

### Render JavaScript or TypeScript objects

Use `normalizeDocument` to validate unknown data and expand shorthand, then render
the result. This example runs in an `.mjs` file:

```js
import { normalizeDocument, renderDocument } from 'yamdown';

const document = normalizeDocument({
  blocks: [
    { h2: 'Generated report' },
    {
      type: 'paragraph',
      children: [{ type: 'text', value: 'A literal *asterisk* stays literal.' }]
    }
  ]
});

process.stdout.write(renderDocument(document));
```

For typed canonical objects, use the exported `YamdownDocument` type with explicit
`type` fields. `YamdownMarkdownDocument` is the separate parsed Markdown type.

## Examples

Each example shows the source followed by the Markdown Yamdown produces. Pass
YAML to `renderYamlMarkdown(source)`, or Markdown to
`renderMarkdownDocument(parseMarkdownDocument(source))`.

### Group content with named elements

Use elements to wrap source material in named tags with attributes. Elements can
nest and contain structured blocks or trusted raw Markdown.

```yaml
blocks:
  - element:
      name: context
      attrs:
        id: release-brief
      blocks:
        - h2: Release context
        - element:
            name: document
            attrs:
              source: notes.md
            blocks:
              - p: Added **table support** and improved validation.
```

```md
<context id="release-brief">

## Release context

<document source="notes.md">

Added **table support** and improved validation.

</document>

</context>
```

Attributes accept strings, finite numbers, and booleans; their names are sorted
and values are escaped and quoted. Tags remain in the output, and Markdown
viewers interpret them according to HTML rules. See
[Elements with attributes](FORMAT.md#elements-with-attributes) for the full syntax
and parsing behavior.

### Generate a release checklist

Combine document metadata with task-list state. Set `checked` to `true` or `false`
for a checkbox, or omit it for an ordinary list item.

```yaml
frontmatter:
  title: Release checklist
blocks:
  - h2: Before publishing
  - type: list
    ordered: false
    items:
      - checked: true
        blocks:
          - p: Update the changelog
      - checked: false
        blocks:
          - p: Publish the package
```

```md
---
title: Release checklist
---

## Before publishing

- [x] Update the changelog
- [ ] Publish the package
```

### Turn data into a table

Define columns once, then supply rows as ordinary records. Column order controls
the output, regardless of the order of keys in each row.

```yaml
blocks:
  - table:
      columns:
        - { key: name, label: Package }
        - { key: status, label: Status }
      rows:
        - { name: Yamdown, status: Ready }
        - { name: Website, status: Draft }
```

```text
| Package | Status |
| --- | --- |
| Yamdown | Ready |
| Website | Draft |
```

### Mix structure with familiar Markdown

Use shorthand for headings and lists, and keep existing prose as raw Markdown.

```yaml
blocks:
  - h2: Release notes
  - ul:
      - Added table support
      - Improved validation
  - markdown: |
      **Next up:** read the [migration guide](https://example.com/migration).
```

```md
## Release notes

- Added table support
- Improved validation

**Next up:** read the [migration guide](https://example.com/migration).
```

### Keep generated text literal

Structured `text` nodes escape Markdown punctuation. A value from a form or data
source stays literal instead of accidentally becoming formatting.

```yaml
blocks:
  - type: paragraph
    children:
      - type: text
        value: 'Use *stars* to mark a favorite.'
```

```md
Use \*stars\* to mark a favorite.
```

The reader sees `Use *stars* to mark a favorite.` with literal asterisks.

### Attach metadata without changing the prose

An inline span gives a phrase an ID and metadata that tools can inspect through
`document.annotations`. Clean rendering removes the annotation comments.

```md
<!-- yamdown:document {"v":1,"profile":"base"} -->

Try the <!-- yamdown:span {"id":"plan","data":{"tier":"pro"}} -->Pro plan<!-- yamdown:/span {"id":"plan"} --> today.
```

```md
Try the Pro plan today.
```

## API and render options

Use explicit APIs for each input format. Library strings are never auto-detected.

| Input or task                                                       | API                                    |
| ------------------------------------------------------------------- | -------------------------------------- |
| Parse and validate Markdown annotations                             | `parseMarkdownDocument(source)`        |
| Parse Markdown to a GFM/frontmatter tree without profile validation | `parseMarkdownRoot(source)`            |
| Render clean Markdown from a parsed Markdown document               | `renderMarkdownDocument(document)`     |
| Serialize canonical Markdown with annotations retained              | `serializeMarkdownDocument(document)`  |
| Parse, normalize, and validate YAML                                 | `parseYamlDocument(source)`            |
| Render YAML directly                                                | `renderYamlMarkdown(source, options?)` |
| Validate an unknown object and expand shorthand                     | `normalizeDocument(value)`             |
| Render a validated YAML/object document                             | `renderDocument(document, options?)`   |
| Convert a YAML/object document to mdast                             | `documentToMdast(document, options?)`  |

`parseYamlDocument` already normalizes and validates; it does not need another
`normalizeDocument` call. `renderDocument` expects validated input. Lower-level
`renderBlock` and `renderInline` exports render individual nodes.

The legacy string overloads of `renderMarkdown` and `toMdast` mean **YAML input**
through 0.x and are deprecated for new code. Use the explicit APIs above.

YAML/object renderers accept these options; Markdown parsing and serialization
use their own canonical formatting:

| Option             | Values                | Default  |
| ------------------ | --------------------- | -------- |
| `frontmatter`      | `boolean`             | `true`   |
| `bullet`           | `-`, `*`, `+`         | `-`      |
| `orderedDelimiter` | `.`, `)`              | `.`      |
| `codeFence`        | Backtick or tilde     | Backtick |
| `blankLines`       | Positive safe integer | `1`      |

`documentToMdast` parses the exact generated Markdown with GFM and frontmatter
support. Its source positions refer to that Markdown, not the original YAML.
Markdown-input trees refer to the Markdown source. GFM parsing can turn URL-like
text into links, including text authored with structured nodes.

## CLI

Use `npx yamdown` in a project where the package is installed, or `yamdown` after
a global installation. Replace the input filenames below with your own files.

```bash
npx yamdown input.yaml -o output.md
npx yamdown input.yaml --check
npx yamdown input.md --input-format markdown
npx yamdown --help
```

| Option                                             | Purpose                                               |
| -------------------------------------------------- | ----------------------------------------------------- |
| `--input-format yaml` or `--input-format markdown` | Select the input format explicitly.                   |
| `-o, --output <file>`                              | Write Markdown to a file, replacing an existing file. |
| `--check`                                          | Validate without producing Markdown.                  |
| `--schema`                                         | Print the YAML authoring JSON Schema.                 |
| `--version`                                        | Print the installed version.                          |
| `--debug`                                          | Include stack traces for unexpected errors.           |
| `-h, --help`                                       | Display usage and options.                            |

The CLI recognizes `.yaml`, `.yml`, and `.yamdown.md` filenames. Plain `.md`, other
extensions, and stdin (`-`) require `--input-format`; it never inspects file
contents to guess a format. To read stdin, pipe text to
`npx yamdown --input-format markdown -`.

Markdown input produces clean Markdown with recognized annotations removed. YAML
input produces deterministic Markdown, including annotations when wrappers are
present. Output goes to stdout unless `--output` is set; output directories must
already exist. Errors go to stderr and return a nonzero exit status. Successful
conversion or validation exits with `0`.

`--schema` cannot be combined with an input, `--input-format`, `--check`, or
`--output`. See [Editor schema](FORMAT.md#editor-schema) for YAML editor setup.

## Validation and limitations

The library exports `YamdownYamlParseError`, `YamdownValidationError`, and
`YamdownRenderError`, all derived from `YamdownError`. Validation issues include
paths and, where available, source ranges. Lines and columns are one-based;
character offsets are zero-based and range ends are exclusive. The CLI displays
source locations and code frames for parse and validation failures.

For direct Zod validation, `yamdownSourceDocumentSchema` checks authoring shapes
and `yamdownDocumentSchema` checks canonical documents. The editor JSON Schema
covers authoring shapes; runtime validation also checks document-wide constraints.

Raw Markdown, heading and paragraph `text`, and HTML are trusted and are not
sanitized. Structured text is escaped for Markdown, but Yamdown does not validate
URL schemes or sanitize rendered HTML. Applications must apply their own trust
rules. Named elements retain their tags; Markdown viewers may interpret them
according to HTML parsing rules.
The reserved element attribute name `__proto__` is rejected during validation.

The annotation format remains a preview. There is no source-preserving editing
API, custom profile support, MDX, plugin execution, remote-file loading, or CLI
watch mode. Canonical serialization can change source formatting; use
`document.source` when you need the original Markdown.

## Contributing and testing

With the required Node.js and pnpm installed, set up a checkout and validate it:

```bash
git clone https://github.com/tonyjunkes/yamdown.git
cd yamdown
pnpm install --frozen-lockfile
pnpm run check
```

This runs typechecking, linting, formatting checks, tests, the build/schema check,
and the installed-package smoke test. For individual tasks:

| Command                              | Purpose                                          |
| ------------------------------------ | ------------------------------------------------ |
| `pnpm run test tests/render.test.ts` | Run targeted rendering tests.                    |
| `pnpm run test:watch`                | Re-run tests while editing.                      |
| `pnpm run test:coverage`             | Run tests with coverage.                         |
| `pnpm run fmt:check`                 | Check formatting.                                |
| `pnpm run schema:generate`           | Regenerate the schema after input-shape changes. |
| `pnpm run schema:check`              | Build and verify the committed schema.           |
| `pnpm run test:package`              | Install and exercise a local tarball.            |
| `pnpm run pack:check`                | Inspect package contents without publishing.     |

Include tests for behavior changes. Markdown output is a byte-for-byte contract;
update fixture pairs for intentional output changes and keep types, schemas,
normalization, rendering, and examples in sync. For documentation changes, check
formatting and verify commands, links, and examples. CI also runs coverage on Node 24.

See the [changelog](CHANGELOG.md) for version history. Report bugs or propose
features through [GitHub issues](https://github.com/tonyjunkes/yamdown/issues),
including a minimal input and expected output when reporting a bug.
