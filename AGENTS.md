# AGENTS.md

## Project Overview

`yamdown` is a TypeScript ESM package that converts structured YAML documents into deterministic Markdown. The core flow is:

1. Parse YAML in `src/parse.ts`.
2. Normalize shorthand and verbose document shapes in `src/normalize.ts`.
3. Validate the normalized shape with Zod schemas in `src/schema.ts`.
4. Render deterministic Markdown in `src/render.ts`.

Public exports live in `src/index.ts`. Keep changes compatible with both the library API and the CLI in `src/cli.ts`.

## Commands

Use `pnpm` for all Node package work.

- `pnpm run typecheck` - TypeScript validation.
- `pnpm run lint` - oxlint checks.
- `pnpm run fmt` - oxfmt check.
- `pnpm run test` - Vitest test suite.
- `pnpm run build` - Build package output with tsdown.
- `pnpm run check` - Full validation: typecheck, lint, fmt, test, and build.

When changing behavior, run the narrowest useful test first, then `pnpm run check` before handing off if time allows.

## Repository Map

- `src/types.ts` - Canonical TypeScript document model.
- `src/schema.ts` - Runtime validation. Keep this aligned with `types.ts`.
- `src/normalize.ts` - YAML shorthand expansion and input shape normalization.
- `src/render.ts` - Markdown serialization. Output must stay deterministic and fixture-backed.
- `src/mdast.ts` - Conversion from yamdown documents to a small mdast-compatible shape.
- `src/errors.ts` - Public error classes and validation issue formatting.
- `src/cli.ts` - Commander-based CLI entrypoint.
- `tests/` - Vitest coverage for parsing, normalization, rendering, mdast, and CLI behavior.
- `tests/fixtures/` - YAML and Markdown fixtures for exact output expectations.
- `examples/` - Small user-facing examples.
- `dist/` and `coverage/` - Generated output; do not edit by hand.

## Coding Guidelines

- Use strict TypeScript. Preserve readonly public types where practical.
- This is an ESM/NodeNext project; local TypeScript imports should use `.js` extensions.
- Keep schema, types, normalization, rendering, mdast conversion, README examples, and fixtures in sync when adding or changing document features.
- Prefer small pure helpers for parsing, normalization, and rendering logic.
- Preserve deterministic Markdown output, including trailing newlines, blank line behavior, escaping, and code fence length.
- Do not add broad dependencies for small transformations. Existing dependencies are `commander`, `yaml`, and `zod`.
- Keep generated directories, lockfile churn, and unrelated formatting out of focused changes.

## Testing Guidance

- Add or update fixture tests when Markdown output changes.
- Add validation tests when changing schemas or error behavior.
- Add CLI tests when changing options, process output, or filesystem behavior.
- For new block or inline node support, cover all relevant layers: `types.ts`, `schema.ts`, `normalize.ts` if shorthand is supported, `render.ts`, `mdast.ts`, exports in `index.ts`, and tests.
- Exact string assertions are intentional in this project. Be careful with whitespace, line endings, and final newlines.

## Agent Workflow

1. Inspect the relevant files before editing; this package is small enough that local context matters.
2. Check `git status --short` before and after changes. Do not revert user changes.
3. Make the minimal coherent change and keep public API impact explicit.
4. Run targeted tests for touched behavior, then broader checks when feasible.
5. In the final response, summarize changed files and commands run, and mention any checks that could not be completed.
