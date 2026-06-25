<!-- FOR AI AGENTS | Last updated: 2026-06-21 | Verify commands against package.json and CI. -->

# AGENTS.md

**Precedence:** explicit user instructions override this file; a closer `AGENTS.md` overrides it for files in that subtree.
**Guidance:** if necessary, refer to plans, specs, designs, etc. found in `/docs` (if present in the project), for more context around features, design decisions, and implementation details. This directory is purposefully ignored from the repository.

## Project

`yamdown` is a strict TypeScript ESM package and CLI that converts structured YAML into deterministic Markdown. The data path is:

`YAML string -> parse.ts -> normalize.ts -> schema.ts -> render.ts -> Markdown`

`src/mdast.ts` deliberately renders first, then parses that exact Markdown with the official mdast/GFM/frontmatter stack. Keep library exports (`src/index.ts`), the CLI (`src/cli.ts`), and packaged output compatible.

## Commands

Use `pnpm`; Node.js 22.12+ is required. CI uses Node.js 24.

| Task               | Command                                 |
| ------------------ | --------------------------------------- |
| Targeted test      | `pnpm run test -- tests/render.test.ts` |
| Tests              | `pnpm run test`                         |
| Coverage (CI)      | `pnpm run test:coverage`                |
| Typecheck          | `pnpm run typecheck`                    |
| Lint               | `pnpm run lint`                         |
| Check formatting   | `pnpm run fmt:check`                    |
| Apply formatting   | `pnpm run fmt`                          |
| Build              | `pnpm run build`                        |
| Package smoke test | `pnpm run test:package`                 |
| Full validation    | `pnpm run check`                        |

Run the narrowest useful test while iterating. Before handoff, run `pnpm run check` when feasible; it covers typecheck, lint, formatting, tests, build, and the installed-package smoke test.

## File Map

| Area                             | Responsibility                                                     |
| -------------------------------- | ------------------------------------------------------------------ |
| `src/types.ts` + `src/schema.ts` | Compile-time model and matching strict runtime schemas             |
| `src/normalize.ts`               | Shorthand expansion, canonicalization, and source-aware validation |
| `src/render.ts`                  | Deterministic Markdown serialization and escaping                  |
| `src/parse.ts` + `src/errors.ts` | YAML parsing, source ranges, and public diagnostics                |
| `src/mdast.ts`                   | Exact rendered-Markdown-to-mdast conversion                        |
| `src/index.ts` + `src/cli.ts`    | Public library surface and CLI boundary                            |
| `tests/fixtures/`                | Exact YAML/input/output expectations                               |
| `scripts/smoke-package.mjs`      | Tarball install, exports, rendering, mdast, and CLI smoke coverage |

Generated `dist/` and `coverage/` are disposable outputs; never edit them by hand.

## Change Heuristics

| When changing                  | Keep in sync / verify                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Block or inline node support   | Types, schemas, normalization (if shorthand exists), rendering, mdast behavior, exports, README examples, and tests |
| Markdown output                | Exact fixtures/assertions, final newline, blank lines, escaping, nesting, and code-fence growth                     |
| Raw vs structured content      | Raw Markdown/HTML remains trusted; structured inline text remains contextually escaped                              |
| Validation or normalization    | Canonical issue paths and YAML source locations; add validation tests                                               |
| Public exports or build config | `src/index.ts`, declarations, `package.json` exports/bin, build, and package smoke test                             |
| CLI options, output, or errors | stdout/stderr separation, exit status, filesystem behavior, and CLI tests                                           |

Golden references: use `tests/render.test.ts` plus `tests/fixtures/` for serialization, `tests/normalize.test.ts` for input shapes, and `tests/cli.test.ts` for process behavior.

## Project Conventions

- Use strict TypeScript and preserve readonly public types where practical.
- Local TypeScript imports use `.js` extensions (ESM/NodeNext).
- Prefer small pure helpers in parsing, normalization, and rendering paths.
- Preserve deterministic output byte-for-byte, including line endings and the final newline.
- Exact string assertions are intentional; update fixture pairs when output changes.
- Do not add dependencies for small transformations without user approval.
- Avoid unrelated formatting and lockfile churn.

## Workflow and Boundaries

1. Inspect relevant implementation, public types/schema, and tests before editing.
2. Check `git status --short`; preserve all user changes and avoid unrelated files.
3. Make the smallest coherent change and state any public API or output impact.
4. Run targeted checks, then broader validation proportional to risk.
5. Report changed files, commands run, and checks not completed.

Never edit generated output, revert user work, expose secrets, or use destructive Git commands unless explicitly requested. Ask first before adding dependencies, changing public API contracts, or modifying CI/release behavior.
