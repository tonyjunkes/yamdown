<!-- FOR AI AGENTS | Last updated: 2026-09-09 | Verify commands against package.json and CI. -->

# AGENTS.md

`yamdown` is a strict TypeScript ESM library and CLI for deterministic YAML-to-Markdown conversion and profiled Markdown annotations.
Local plans and specs may be in gitignored `docs/`.

## Commands

Use pnpm (version pinned in `package.json`) and Node.js 24.11.0 or later.
CI runs tests, coverage, and package checks on Node.js 24.

| Task                   | Command                              |
| ---------------------- | ------------------------------------ |
| Targeted test          | `pnpm run test tests/render.test.ts` |
| Full validation        | `pnpm run check`                     |
| Regenerate JSON Schema | `pnpm run schema:generate`           |

Run targeted tests while iterating and `pnpm run check` before handing off code changes. It runs typecheck, lint,
formatting checks, tests, build, and the installed-package smoke test. Other scripts are in `package.json`.
For documentation-only changes, check formatting and verify referenced commands and paths. Report any checks not run.

## Architecture

- `src/parse.ts` parses YAML and attaches source locations; `src/normalize.ts` expands shorthand and validates against
  `src/schema.ts`. `src/types.ts` defines the matching public types; `src/render.ts` serializes normalized documents.
- `src/yaml.ts` is the YAML adapter used by the CLI. `src/facade.ts` and `src/mdast.ts` accept YAML or objects.
  Keep the core independent of YAML adapters; `tests/architecture.test.ts` enforces these boundaries.
- `src/document-mdast.ts` renders Markdown, then parses that exact output with GFM/frontmatter support.
  Preserve this equivalence rather than building mdast directly.
- `src/markdown-document.ts` parses, validates, projects, and serializes Markdown annotations; `FORMAT.md` defines the profile.
- `src/index.ts` defines library exports. `scripts/smoke-package.mjs` checks the installed tarball's exports, types,
  rendering, mdast, and CLI.

## Change rules

- Use `.js` extensions for local TypeScript imports and preserve readonly public types.
- For node or input-shape changes, update types, runtime schemas, normalization, rendering, README examples, and tests
  together. Regenerate `schema/yamdown.schema.json` with `pnpm run schema:generate`; do not edit it by hand.
- Markdown output is a byte-for-byte contract: preserve escaping, whitespace, nesting, fence growth, and the final newline.
  Use `tests/render.test.ts` and `tests/fixtures/`; update fixture pairs for intentional output changes.
- Raw Markdown/HTML is trusted. Structured inline text must remain contextually escaped.
- Validation changes must preserve canonical issue paths and YAML source locations; cover them in normalization/parsing tests.
- CLI changes must preserve stdout/stderr separation, exit status, and filesystem behavior; check `tests/cli.test.ts`.
- Do not edit generated `dist/` or `coverage/`. Preserve existing user changes and avoid unrelated formatting or lockfile churn.
- Ask before adding dependencies, changing public API contracts, or modifying CI/release behavior unless the user already
  authorized that work.
