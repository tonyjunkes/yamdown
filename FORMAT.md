# Yamdown Markdown format (0.10 preview)

Yamdown Markdown is ordinary CommonMark/GFM with optional, invisible HTML-comment
annotations. A `.yamdown.md` file remains useful in every Markdown renderer: a
renderer that does not know Yamdown sees the same visible document after it
ignores HTML comments.

This document specifies the `base` profile shipped in the 0.10 preview. The
grammar is intentionally small and portable. It is not a directive language,
does not execute code, and does not require a Markdown extension.

## Documents and profiles

Plain GFM is valid Yamdown input in **unprofiled** mode. It has no document
annotation and no Yamdown-specific validation beyond normal Markdown parsing.

To opt into the strict base profile, use this exact document annotation as the
first non-frontmatter root child. YAML frontmatter, when present, must remain at
the literal start of the source; put the annotation immediately after its
closing delimiter. Without frontmatter, the annotation starts the source:

```md
<!-- yamdown:document {"v":1,"profile":"base"} -->
```

The payload is a JSON object with exactly `v: 1` and `profile: "base"`. A
profiled document validates every recognized Yamdown annotation, including its
JSON payload, IDs, placement, and scopes. Future profiles will be additive;
the preview does not support user-defined profile names.

## Portable annotations

Recognized annotations are HTML comments whose JSON payload is strict JSON.
Unrecognized comments and HTML are ordinary Markdown content and are never
interpreted as Yamdown metadata.

Opening annotations have this metadata shape:

```json
{ "id": "unique-id", "kind": "optional-profile-kind", "data": { "optional": "JSON value" } }
```

`id` is an authored, nonempty string and must be globally unique across all
node, span, and region annotations in the document. `kind` is an optional
string. `data` is optional JSON data (a scalar, array, or object). The base
profile validates the envelope and treats `kind` and `data` as profile metadata;
it does not assign application behavior to them.

Opening comments are emitted with the property order `id`, `kind`, `data` when
all fields are present. Closing comments contain only the matching `id`.

### Block node

Place a node annotation immediately before the block it describes, in the same
block container:

```md
<!-- yamdown:node {"id":"intro","kind":"hero","data":{"tone":"warm"}} -->

# Welcome
```

The next item must be a visible Markdown block, not another annotation. The
annotation attaches to that block and does not change its rendered appearance.

### Inline span

Span comments surround one contiguous inline range in a single inline
container:

Keep them within paragraph or other inline content. A comment at the start of a
paragraph can become a Markdown HTML block instead of an inline span; use a
node annotation to annotate a whole paragraph.

```md
Read the <!-- yamdown:span {"id":"product-name","kind":"product"} -->Yamdown<!-- yamdown:/span {"id":"product-name"} --> guide.
```

### Block region

Region comments surround a nested sequence of sibling blocks in one block
container:

```md
<!-- yamdown:region {"id":"getting-started","kind":"section"} -->

## Getting started

Install the package, then render a document.
<!-- yamdown:/region {"id":"getting-started"} -->
```

Spans and regions must be properly nested, must close with the same annotation
kind and ID that opened them, and cannot cross each other. A closing comment
cannot appear without its matching opening comment. Comments in fenced code,
inline code, or raw HTML remain literal content rather than annotations.

## Rendering and serialization

`parseMarkdownDocument` retains the original source, the official GFM and
frontmatter `mdast.Root`, and an annotation index with source ranges and target
or scope context. It validates profiled documents and reports Yamdown
diagnostics for malformed annotations.

`renderMarkdownDocument` produces the **clean Markdown projection**: it removes
recognized Yamdown document, node, span, and region comments while preserving
the visible GFM meaning. Other comments remain untouched. This projection rule
is what makes Yamdown Markdown usable by tools that do not install Yamdown.

`serializeMarkdownDocument` is the canonical annotated-source serialization
API. It serializes the parsed Markdown and resolved annotations into canonical
Markdown with canonical annotation metadata ordering. The document's `source`
field separately retains the original input byte-for-byte for source-aware
tooling; applications should not use formatting changes as an annotation
identity signal.

## YAML representation

YAML remains a first-class authoring format. Set the top-level descriptor to
emit a profiled Markdown document:

```yaml
yamdown:
  v: 1
  profile: base
frontmatter:
  title: Welcome
blocks:
  - type: annotatedBlock
    id: intro
    kind: hero
    data:
      tone: warm
    block:
      h1: Welcome
  - type: paragraph
    children:
      - type: text
        value: 'Read the '
      - type: annotatedSpan
        id: product-name
        kind: product
        children:
          - type: text
            value: Yamdown
      - type: text
        value: guide.
  - type: annotatedRegion
    id: getting-started
    kind: section
    blocks:
      - h2: Getting started
      - p: Install the package, then render a document.
```

The wrappers map directly to portable comments:

| YAML wrapper      | Markdown form                                                            |
| ----------------- | ------------------------------------------------------------------------ |
| `annotatedBlock`  | one `yamdown:node` comment before its `block`                            |
| `annotatedSpan`   | matching `yamdown:span` and `yamdown:/span` comments around `children`   |
| `annotatedRegion` | matching `yamdown:region` and `yamdown:/region` comments around `blocks` |

Raw YAML `markdown` blocks stay opaque. Use the typed wrappers above instead of
putting annotation comments inside raw Markdown strings; that keeps metadata
validated and source locations useful.

## YAML elements and annotations

YAML `element` blocks emit named tags with escaped scalar attributes around
their child blocks. They do not require a `yamdown` descriptor and do not change
the base annotation profile. Element attributes, including `id`, are ordinary
data and do not participate in annotation ID uniqueness checks.

Annotation wrappers inside elements still require the document descriptor and
document-wide unique annotation IDs. The clean Markdown projection removes
recognized Yamdown comments while preserving element tags. Standard Markdown
HTML parsing applies: an `annotatedBlock` around an element targets its opening
HTML block, not the entire element hierarchy. Use an `annotatedRegion` around
the element for a scope spanning its opening tag, content, and closing tag.
Raw-text HTML names such as `script` can hide their content from Markdown
parsing, including annotations; use ordinary custom names for annotated content.

See [Elements with attributes](#elements-with-attributes) for syntax
and the distinction between the YAML hierarchy and the rendered mdast tree.

## CLI input selection

The CLI accepts explicit `yaml` and `markdown` inputs. It recognizes `.yaml`,
`.yml`, and `.yamdown.md` paths for convenience; stdin (`-`) and ambiguous
extensions require `--input-format yaml` or `--input-format markdown`.

For Markdown input, `--check` validates the document/profile and normal output
is the clean Markdown projection. For YAML input, normal output remains
deterministic Markdown. The CLI never content-sniffs a file to choose a format.

```bash
yamdown page.yamdown.md
yamdown --check page.yamdown.md
yamdown --input-format markdown - < page.md
yamdown --input-format yaml document.txt
```

## Compatibility

- `.yamdown.md` is recommended for annotated Markdown; plain `.md` is valid
  when a team does not need to distinguish it by filename.
- Existing YAML input and its deterministic renderer remain supported.
- The legacy string overloads of `renderMarkdown` and `toMdast` continue to
  mean YAML source during 0.x. Use the explicit Markdown APIs for Markdown
  input; Yamdown never auto-detects library input strings.
- `:::directive` syntax is intentionally out of scope. A future controlled
  toolchain may compile directives to these portable comments, but directives
  are not the canonical format.

## YAML authoring reference

A YAML document has a required `blocks` array and optional `frontmatter` mapping.
Add the `yamdown` descriptor when using annotation wrappers.

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
[examples/readme.md](https://github.com/tonyjunkes/yamdown/blob/main/examples/readme.md). Raw Markdown and HTML are intentionally
trusted and are not sanitized. Structured inline text is contextually escaped,
but applications must enforce their own URL and HTML trust boundaries.

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
| Named element  | `element`       | `element`         |
| Table          | `table`         | `table`           |

Reference definitions and footnote definitions use verbose top-level nodes.
They are intentionally unavailable inside lists, blockquotes, and elements.

Lists may contain strings for simple items or nested block arrays for richer
content. Add `checked: true` or `checked: false` to a list item when you want a
GFM task-list marker; omit it for ordinary list items.

Table shorthand wraps the same `columns` and `rows` fields as the verbose node.
Columns may set `align` to `left`, `center`, `right`, or `null`/omitted for no
alignment.

### Elements with attributes

Use elements to group instructions, context, or source material with explicit
boundaries and properties. Children can use any block type, including nested
elements and raw Markdown.

```yaml
blocks:
  - element:
      name: document
      attrs:
        source: harbor-garden-notes.txt
      blocks:
        - h1: Harbor Garden Plan
        - p: Plant the rosemary beside the east fence.
```

```md
<document source="harbor-garden-notes.txt">

# Harbor Garden Plan

Plant the rosemary beside the east fence.

</document>
```

The verbose form uses `type: element`, `name`, optional `attrs`, and required
`blocks` on the same object. An empty `blocks: []` still emits opening and closing
tags. The library exports the readonly `ElementNode` type.

Element names start with an ASCII letter and contain only ASCII letters, digits,
and hyphens. Attribute names start with an ASCII letter or underscore and may
also contain digits, dots, and hyphens. The reserved attribute name `__proto__`
is rejected. Attribute values are strings, finite
numbers, or booleans; quote YAML values when they should remain strings.
Attributes are sorted by name, always double-quoted, and escaped for ampersands,
quotes, angle brackets, tabs, and line breaks. Boolean `false` is emitted as
`"false"`, and empty strings are preserved.

Tags are always retained in Markdown output. YAML comments remain author notes
omitted from output. The 0.10 annotation wrappers remain available for portable
metadata comments. Element attributes do not share annotation ID uniqueness rules. Elements do not
assign model message roles or enforce instruction priority.

Output is Markdown with XML-style tags, not an XML document or sanitized HTML.
Raw Markdown and HTML children retain their existing trusted-content behavior.
Markdown viewers may hide or interpret tags according to their HTML rules;
names such as `script` and `pre` can also change how their contents are parsed.
`toMdast` parses the exact generated Markdown using the standard parser, so it
does not retain elements as custom container nodes. Use `parseYamlDocument` or
`normalizeDocument` when you need the original element hierarchy and attributes.

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
`link`, `linkReference`, `image`, `imageReference`, `footnoteReference`, and
`break`, plus `annotatedSpan` for profiled metadata.

Full reference links, reference images, and footnotes use machine-safe
identifiers containing ASCII letters, digits, underscores, and hyphens.
The first character must be a letter or digit. Identifiers are matched
case-insensitively; definitions must be unique and
every structured reference must resolve.

```yaml
blocks:
  - type: paragraph
    children:
      - type: linkReference
        identifier: docs
        children:
          - type: text
            value: Read the docs
      - type: footnoteReference
        identifier: note-1
  - type: definition
    identifier: docs
    url: https://example.com/docs
  - type: footnoteDefinition
    identifier: note-1
    blocks:
      - p: Additional context.
```

Collapsed and shortcut references remain available through trusted raw
Markdown.

> [!WARNING]
> Raw Markdown—including paragraph and heading `text`—and `html` blocks are intentionally trusted and are not
> sanitized. Structured text prevents Markdown syntax injection, but Yamdown
> does not validate URL schemes or sanitize rendered output; validate links and
> HTML according to your application’s trust boundary.

### Tables

Tables require at least one column. Columns define the output order independently
of object key order.

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

Scalar cells are converted to text; missing and null cells are empty. For
structured inline formatting, use the tagged cell form below. Other arrays and
objects are JSON-stringified.

```yaml
blocks:
  - table:
      columns:
        - key: name
          label: Name
      rows:
        - name:
            type: inline
            children:
              - type: strong
                children:
                  - type: text
                    value: Structured cell
```

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
pnpm exec yamdown --schema > yamdown.schema.json
```
