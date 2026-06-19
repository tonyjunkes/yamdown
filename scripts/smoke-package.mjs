// @ts-check
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
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
        "import { renderMarkdown } from 'yamdown';",
        "const rendered = renderMarkdown({ blocks: [{ type: 'paragraph', children: [{ type: 'text', value: '**literal**' }] }] });",
        "if (rendered !== '\\\\*\\\\*literal\\\\*\\\\*\\n') throw new Error(`Unexpected library output: ${JSON.stringify(rendered)}`);"
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
