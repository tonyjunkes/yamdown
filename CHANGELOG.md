# Changelog

All notable changes to Yamdown are recorded here. This project follows
[Semantic Versioning](https://semver.org/).

## 0.9.0 - 2026-07-15

### Changed

- Tables now require at least one column in runtime validation and the packaged
  JSON Schema, preventing table nodes from degrading into paragraphs in mdast.
- Simplified normalization and shared block schemas while reducing allocations
  in inline rendering and code-fence detection.
- Updated the development toolchain and aligned the Vitest and V8 coverage
  package versions.

### Fixed

- Normalized lone carriage returns in table labels and cells.
- Quoted arbitrary object keys in validation paths to keep diagnostics
  unambiguous.

### Tests

- Added regression coverage for zero-column tables, every table-cell line-ending
  form, and diagnostic paths containing punctuation or whitespace.

## 0.8.1 - 2026-07-11

### Changed

- Bumped dependencies to their latest versions.
- Verified release of TypeScript 7 compatibility.

## 0.8.0 - 2026-06-27

### Added

- Structured full-reference links and images with top-level definitions.
- Structured footnote references and multi-block footnote definitions.
- Tagged structured-inline table cells while preserving existing cell rendering.
- Case-insensitive document-wide validation for duplicate and unresolved
  references.

### Changed

- Made the `YamdownDocument`, `Yamdown*Error`, `parseYamlDocument`, and
  `yamdown*Schema` names canonical throughout the public API and diagnostics.

### Removed

- Transitional `YamlMarkdownDocument`, `YamlMarkdown*Error`,
  `parseYamlMarkdown`, and `yamlMarkdown*Schema` exports introduced before the
  Yamdown API boundary was finalized.

## 0.7.0 - 2026-06-27

### Added

- Preferred `parseYamlDocument`, `renderYamlMarkdown`, `documentToMdast`, and
  `YamdownDocument` APIs.
- Additive Yamdown-named error aliases.

### Changed

- Separated format-neutral document rendering and mdast conversion from the
  explicit YAML adapter while preserving all legacy exports.
- The CLI now calls the YAML adapter directly.

## 0.6.3 - 2026-06-27

### Added

- Independent CLI schema-conflict tests, exact schema-output verification, and
  expanded malformed-input and source-origin normalization coverage.

## 0.6.2 - 2026-06-25

### Changed

- Updated pinned GitHub Actions used by CI.

## 0.6.1 - 2026-06-25

### Fixed

- Schema generation now passes strict project typechecking.

## 0.6.0 - 2026-06-25

### Added

- Draft 2020-12 JSON Schema for Yamdown authoring input, covering verbose nodes,
  shorthand forms, and structured GFM additions.
- Stable packaged schema access through `schema/yamdown.schema.json` and the
  `yamdown/schema.json` package export.
- `yamdown --schema` for printing the authoring schema to stdout.
- Editor integration docs and schema conformance coverage against runtime
  validation.

## 0.5.0 - 2026-06-24

### Added

- Structured GFM authoring for strikethrough inline nodes, task-list item state,
  table column alignment, and fenced-code metadata.
- Package smoke coverage for the installed 0.5 structured GFM surface.

## 0.4.0 - 2026-06-21

### Added

- Canonical and shorthand raw Markdown blocks for gradual structured-authoring
  adoption.
- Table shorthand and strict source-shape validation before canonical
  normalization.
- Mixed raw and structured examples across the README and shipped example.

### Changed

- Project and CLI language now position Yamdown as a structured authoring
  format for Markdown output.
- Validation errors for malformed shorthand report paths in the source shape.

## 0.3.0 - 2026-06-19

### Added

- Official mdast parsing through `mdast-util-from-markdown`.
- GFM support for tables, task lists, autolinks, strikethrough, and footnotes in
  generated mdast trees.
- YAML frontmatter nodes and generated-Markdown source positions in mdast
  output.
- Package smoke coverage for the installed `toMdast` API.

### Changed

- `toMdast` now accepts YAML source or a document object plus optional render
  options and returns an official `mdast.Root`.
- Raw Markdown fields are interpreted semantically in mdast output, while
  structured text remains literal.

### Removed

- The local `MdastRoot`, `MdastBlock`, and `MdastInline` compatibility types.
  Import official types from `mdast` instead.

## 0.2.0 - 2026-06-18

### Added

- Deterministic YAML-to-Markdown rendering for headings, paragraphs, lists,
  code, blockquotes, thematic breaks, tables, HTML, and frontmatter.
- Raw Markdown and safely escaped structured inline authoring modes.
- Context-aware structured text, URL, title, image, and inline-code escaping.
- YAML source ranges, validation paths, and CLI code-frame diagnostics.
- Structured heading children and the initial mdast-compatible conversion API.
- Library, CLI, package, fixture, and installed-tarball test coverage.

### Changed

- Package entrypoints now match the generated ESM `.mjs` and `.d.mts` files.
- Package metadata and private, dry-run-only packaging safeguards were added.

### Removed

- The unused top-level document `title` property. Use frontmatter for metadata
  or an explicit heading block for rendered titles.
