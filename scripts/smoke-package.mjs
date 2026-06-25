// @ts-check
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

// oxlint-disable-next-line typescript/strict-void-return -- Node provides an official promisified execFile overload.
const execFileAsync = promisify(execFile);
const root = dirname(import.meta.dirname);
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'yamdown-package-'));
const consumerDirectory = join(temporaryDirectory, 'consumer');
const pnpmCli = process.env.npm_execpath;

if (pnpmCli === undefined) {
  throw new Error('The package smoke test must be run through pnpm.');
}
const pnpmExecutable = pnpmCli;

try {
  await runPnpm(['pack', '--pack-destination', temporaryDirectory], root);

  const tarballs = (await readdir(temporaryDirectory)).filter((entry) => entry.endsWith('.tgz'));
  const tarballName = tarballs[0];
  if (tarballs.length !== 1 || tarballName === undefined) {
    throw new Error(`Expected one package tarball, found ${tarballs.length}.`);
  }

  const tarball = join(temporaryDirectory, tarballName);
  await mkdir(consumerDirectory);
  await writeFile(
    join(consumerDirectory, 'package.json'),
    `${JSON.stringify({ name: 'yamdown-package-smoke-test', private: true, type: 'module' }, null, 2)}\n`,
    'utf8'
  );

  await runPnpm(['add', '--ignore-scripts', tarball], consumerDirectory);

  await runNode(
    [
      '--input-type=module',
      '--eval',
      [
        "import { renderMarkdown, toMdast } from 'yamdown';",
        "const rendered = renderMarkdown({ blocks: [{ type: 'paragraph', children: [{ type: 'text', value: '**literal**' }] }] });",
        "if (rendered !== '\\\\*\\\\*literal\\\\*\\\\*\\n') throw new Error(`Unexpected library output: ${JSON.stringify(rendered)}`);",
        "const raw = renderMarkdown('blocks:\\n  - markdown: |\\n      **raw block**\\n');",
        "if (raw !== '**raw block**\\n') throw new Error(`Unexpected raw Markdown output: ${JSON.stringify(raw)}`);",
        "const gfm = renderMarkdown({ blocks: [{ type: 'list', ordered: false, items: [{ checked: true, blocks: [{ type: 'paragraph', text: 'Done' }] }] }, { type: 'table', columns: [{ key: 'name', label: 'Name', align: 'center' }], rows: [{ name: 'Yamdown' }] }, { type: 'code', lang: 'ts', meta: 'title=\"demo.ts\"', value: 'console.log(\"hello\")' }] });",
        "if (!gfm.includes('- [x] Done') || !gfm.includes('| :---: |') || !gfm.includes('```ts title=\"demo.ts\"')) throw new Error(`Unexpected GFM output: ${JSON.stringify(gfm)}`);",
        "const tree = toMdast({ blocks: [{ type: 'paragraph', text: '**semantic**' }] });",
        "if (tree.children[0]?.type !== 'paragraph' || tree.children[0].children[0]?.type !== 'strong') throw new Error('Official mdast conversion failed');"
      ].join('\n')
    ],
    consumerDirectory
  );

  const inputPath = join(consumerDirectory, 'input.yaml');
  await writeFile(inputPath, 'blocks:\n  - h1: Installed\n', 'utf8');
  const { stdout } = await runPnpm(['exec', 'yamdown', inputPath], consumerDirectory);

  if (stdout !== '# Installed\n') {
    throw new Error(`Unexpected CLI output: ${JSON.stringify(stdout)}`);
  }

  const schemaPath = join(consumerDirectory, 'node_modules', 'yamdown', 'schema', 'yamdown.schema.json');
  /** @type {unknown} */
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
  if (!isYamdownSchemaSummary(schema)) {
    throw new Error(`Unexpected packaged schema: ${JSON.stringify(schema)}`);
  }

  const { stdout: schemaStdout } = await runPnpm(['exec', 'yamdown', '--schema'], consumerDirectory);
  if (JSON.stringify(JSON.parse(schemaStdout)) !== JSON.stringify(schema)) {
    throw new Error('CLI schema output did not match the packaged schema file.');
  }

  const { stdout: schemaExportStdout } = await runNode(
    [
      '--input-type=module',
      '--eval',
      [
        "const schemaUrl = import.meta.resolve('yamdown/schema.json');",
        'const schema = await import(schemaUrl, { with: { type: "json" } });',
        "if (schema.default?.title !== 'Yamdown authoring document') throw new Error('Schema export failed');"
      ].join('\n')
    ],
    consumerDirectory
  );

  if (schemaExportStdout !== '') {
    throw new Error(`Unexpected schema export stdout: ${JSON.stringify(schemaExportStdout)}`);
  }
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true });
}

/**
 * @param {string[]} arguments_ pnpm arguments
 * @param {string} cwd working directory
 */
function runPnpm(arguments_, cwd) {
  return runNode([pnpmExecutable, ...arguments_], cwd);
}

/**
 * @param {string[]} arguments_ Node.js arguments
 * @param {string} cwd working directory
 */
function runNode(arguments_, cwd) {
  return execFileAsync(process.execPath, arguments_, {
    cwd,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 10 * 1024 * 1024
  });
}

/**
 * @param {unknown} value parsed JSON
 * @returns {value is { $schema: string, required: string[] }} true when the value has the expected schema summary
 */
function isYamdownSchemaSummary(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    '$schema' in value &&
    value.$schema === 'https://json-schema.org/draft/2020-12/schema' &&
    'required' in value &&
    Array.isArray(value.required) &&
    value.required.includes('blocks')
  );
}
