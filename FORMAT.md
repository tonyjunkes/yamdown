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
