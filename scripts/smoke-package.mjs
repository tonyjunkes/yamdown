// @ts-check
import { execFile } from 'node:child_process';
import { access, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { promisify } from 'node:util';

// oxlint-disable-next-line typescript/strict-void-return -- Node provides an official promisified execFile overload.
const execFileAsync = promisify(execFile);
const root = dirname(import.meta.dirname);
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'yamdown-package-'));
const consumerDirectory = join(temporaryDirectory, 'consumer');
/** @type {unknown} */
const sourcePackageManifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

if (!isPackageManifest(sourcePackageManifest)) {
  throw new TypeError('Source package manifest has no name or version.');
}

const packageName = sourcePackageManifest.name;
const packageNameLiteral = JSON.stringify(packageName);
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

  const installedPackageDirectory = join(consumerDirectory, 'node_modules', ...packageName.split('/'));
  const expectedPackageEntries = [
    'dist/index.mjs',
    'dist/cli.mjs',
    'schema/yamdown.schema.json',
    'README.md',
    'FORMAT.md'
  ];
  await Promise.all(expectedPackageEntries.map((entry) => access(join(installedPackageDirectory, entry))));

  await writeFile(
    join(consumerDirectory, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          noEmit: true,
          strict: true,
          target: 'ES2022',
          verbatimModuleSyntax: true
        }
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  await writeFile(
    join(consumerDirectory, 'consumer.ts'),
    [
      'import {',
      '  parseMarkdownDocument,',
      '  parseYamlDocument,',
      '  renderMarkdownDocument,',
      '  serializeMarkdownDocument,',
      '  type YamdownMarkdownDocument',
      `} from ${packageNameLiteral};`,
      '',
      "const markdownDocument: YamdownMarkdownDocument = parseMarkdownDocument('# Type consumer\\n');",
      'const cleanMarkdown: string = renderMarkdownDocument(markdownDocument);',
      'const annotatedMarkdown: string = serializeMarkdownDocument(markdownDocument);',
      'const yamlDocument = parseYamlDocument("blocks:\\n  - h1: YAML consumer\\n");',
      'const annotationCount: number = markdownDocument.annotations.length;',
      'const rootType: string = markdownDocument.root.type;',
      'void [cleanMarkdown, annotatedMarkdown, yamlDocument, annotationCount, rootType];',
      ''
    ].join('\n'),
    'utf8'
  );
  await runTypeScriptCheck(consumerDirectory);

  const declarations = await readFile(join(installedPackageDirectory, 'dist', 'index.d.mts'), 'utf8');
  if (declarations.includes('YamlMarkdownDocument')) {
    throw new Error('Installed declarations still expose YamlMarkdownDocument.');
  }
  if (!declarations.includes('ElementNode')) {
    throw new Error('Installed declarations do not expose ElementNode.');
  }

  const formatSpecification = await readFile(join(installedPackageDirectory, 'FORMAT.md'), 'utf8');
  if (!formatSpecification.includes('Yamdown Markdown format')) {
    throw new Error('Installed package is missing the Yamdown Markdown format specification.');
  }

  await runNode(
    [
      '--input-type=module',
      '--eval',
      [
        `import { documentToMdast, parseMarkdownDocument, parseYamlDocument, renderMarkdown, renderMarkdownDocument, renderYamlMarkdown, serializeMarkdownDocument, toMdast } from ${packageNameLiteral};`,
        `import * as yamdown from ${packageNameLiteral};`,
        "for (const oldName of ['parseYamlMarkdown', 'YamlMarkdownError', 'YamlMarkdownParseError', 'YamlMarkdownRenderError', 'YamlMarkdownValidationError', 'yamlMarkdownDocumentSchema', 'yamlMarkdownSourceDocumentSchema']) if (oldName in yamdown) throw new Error(`Unexpected transitional export: ${oldName}`);",
        "const rendered = renderMarkdown({ blocks: [{ type: 'paragraph', children: [{ type: 'text', value: '**literal**' }] }] });",
        "if (rendered !== '\\\\*\\\\*literal\\\\*\\\\*\\n') throw new Error(`Unexpected library output: ${JSON.stringify(rendered)}`);",
        "const raw = renderMarkdown('blocks:\\n  - markdown: |\\n      **raw block**\\n');",
        "if (raw !== '**raw block**\\n') throw new Error(`Unexpected raw Markdown output: ${JSON.stringify(raw)}`);",
        "if (renderYamlMarkdown('blocks:\\n  - p: Adapter\\n') !== 'Adapter\\n') throw new Error('Preferred YAML renderer failed');",
        "if (parseYamlDocument('blocks: []').blocks.length !== 0) throw new Error('Preferred YAML parser failed');",
        'const markdownDocument = parseMarkdownDocument(\'<!-- yamdown:document {"v":1,"profile":"base"} -->\\n<!-- yamdown:node {"id":"title"} -->\\n# Installed Markdown\\n\');',
        "if (markdownDocument.root.children[0]?.type !== 'html' || markdownDocument.annotations.length !== 1) throw new Error('Markdown document parser failed');",
        "if (renderMarkdownDocument(markdownDocument) !== '# Installed Markdown\\n') throw new Error('Markdown clean renderer failed');",
        "if (!serializeMarkdownDocument(markdownDocument).includes('yamdown:node')) throw new Error('Markdown serializer failed');",
        'const frontmatterMarkdownDocument = parseMarkdownDocument(\'---\\ntitle: Installed\\n---\\n<!-- yamdown:document {"v":1,"profile":"base"} -->\\n# Frontmatter Markdown\\n\');',
        "if (frontmatterMarkdownDocument.root.children[0]?.type !== 'yaml') throw new Error('Markdown document frontmatter parser failed');",
        "const gfm = renderMarkdown({ blocks: [{ type: 'list', ordered: false, items: [{ checked: true, blocks: [{ type: 'paragraph', text: 'Done' }] }] }, { type: 'table', columns: [{ key: 'name', label: 'Name', align: 'center' }], rows: [{ name: 'Yamdown' }] }, { type: 'code', lang: 'ts', meta: 'title=\"demo.ts\"', value: 'console.log(\"hello\")' }] });",
        "if (!gfm.includes('- [x] Done') || !gfm.includes('| :---: |') || !gfm.includes('```ts title=\"demo.ts\"')) throw new Error(`Unexpected GFM output: ${JSON.stringify(gfm)}`);",
        "const tree = toMdast({ blocks: [{ type: 'paragraph', text: '**semantic**' }] });",
        "const elementSource = 'blocks:\\n  - element:\\n      name: context\\n      attrs: { id: demo }\\n      blocks:\\n        - p: Hello\\n';",
        "if (renderMarkdown(elementSource) !== '<context id=\"demo\">\\n\\nHello\\n\\n</context>\\n') throw new Error('Installed element rendering failed');",
        "if (toMdast(elementSource).children[0]?.type !== 'html') throw new Error('Installed element mdast conversion failed');",
        "if (tree.children[0]?.type !== 'paragraph' || tree.children[0].children[0]?.type !== 'strong') throw new Error('Official mdast conversion failed');",
        "if (documentToMdast({ blocks: [{ type: 'paragraph', text: 'Document' }] }).children[0]?.type !== 'paragraph') throw new Error('Document mdast conversion failed');",
        "const references = renderMarkdown({ blocks: [{ type: 'paragraph', children: [{ type: 'linkReference', identifier: 'docs', children: [{ type: 'text', value: 'Docs' }] }, { type: 'footnoteReference', identifier: 'note' }] }, { type: 'table', columns: [{ key: 'value', label: 'Value' }], rows: [{ value: { type: 'inline', children: [{ type: 'strong', children: [{ type: 'text', value: 'Rich' }] }] } }] }, { type: 'definition', identifier: 'docs', url: 'https://example.com' }, { type: 'footnoteDefinition', identifier: 'note', blocks: [{ type: 'paragraph', text: 'Note' }] }] });",
        "if (!references.includes('[Docs][docs][^note]') || !references.includes('| **Rich** |')) throw new Error(`Unexpected reference output: ${JSON.stringify(references)}`);"
      ].join('\n')
    ],
    consumerDirectory
  );

  const inputPath = join(consumerDirectory, 'input.yaml');
  await runNode(
    [
      '--input-type=module',
      '--eval',
      `process.argv[1] = 'nonexistent-embedded-entry'; await import('./node_modules/${packageName}/dist/cli.mjs');`
    ],
    consumerDirectory
  );
  await writeFile(inputPath, 'blocks:\n  - h1: Installed\n', 'utf8');
  const { stdout } = await runPnpm(['exec', 'yamdown', inputPath], consumerDirectory);

  if (stdout !== '# Installed\n') {
    throw new Error(`Unexpected CLI output: ${JSON.stringify(stdout)}`);
  }

  const markdownInputPath = join(consumerDirectory, 'input.yamdown.md');
  await writeFile(
    markdownInputPath,
    '<!-- yamdown:document {"v":1,"profile":"base"} -->\n<!-- yamdown:node {"id":"title"} -->\n# Installed Markdown\n',
    'utf8'
  );
  const { stdout: markdownStdout } = await runPnpm(['exec', 'yamdown', markdownInputPath], consumerDirectory);

  if (markdownStdout !== '# Installed Markdown\n') {
    throw new Error(`Unexpected Markdown CLI output: ${JSON.stringify(markdownStdout)}`);
  }

  /** @type {unknown} */
  const packageManifest = JSON.parse(await readFile(join(installedPackageDirectory, 'package.json'), 'utf8'));
  if (!isPackageManifest(packageManifest)) {
    throw new TypeError('Installed package manifest has no version.');
  }
  const { stdout: versionStdout } = await runPnpm(['exec', 'yamdown', '--version'], consumerDirectory);
  if (versionStdout !== `${packageManifest.version}\n`) {
    throw new Error(`Unexpected CLI version: ${JSON.stringify(versionStdout)}`);
  }

  const schemaPath = join(installedPackageDirectory, 'schema', 'yamdown.schema.json');
  const schemaFile = await readFile(schemaPath, 'utf8');
  /** @type {unknown} */
  const schema = JSON.parse(schemaFile);
  if (!isYamdownSchemaSummary(schema)) {
    throw new Error(`Unexpected packaged schema: ${JSON.stringify(schema)}`);
  }

  const { stdout: schemaStdout } = await runPnpm(['exec', 'yamdown', '--schema'], consumerDirectory);
  if (schemaStdout !== schemaFile) {
    throw new Error('CLI schema output did not match the packaged schema file.');
  }

  const { stdout: schemaExportStdout } = await runNode(
    [
      '--input-type=module',
      '--eval',
      [
        `const schemaUrl = import.meta.resolve(${packageNameLiteral} + '/schema.json');`,
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
  if (['.cjs', '.js', '.mjs'].includes(extname(pnpmExecutable).toLowerCase())) {
    return runNode([pnpmExecutable, ...arguments_], cwd);
  }
  return runExecutable(pnpmExecutable, arguments_, cwd);
}

/**
 * @param {string[]} arguments_ Node.js arguments
 * @param {string} cwd working directory
 */
function runNode(arguments_, cwd) {
  return runExecutable(process.execPath, arguments_, cwd);
}

/**
 * @param {string} executable executable path
 * @param {string[]} arguments_ executable arguments
 * @param {string} cwd working directory
 */
function runExecutable(executable, arguments_, cwd) {
  return execFileAsync(executable, arguments_, {
    cwd,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 10 * 1024 * 1024
  });
}

/**
 * Compile a consumer through the workspace TypeScript executable. The program
 * and declarations it resolves are installed from the tarball in `cwd`.
 *
 * @param {string} cwd consumer directory
 */
function runTypeScriptCheck(cwd) {
  return runNode([join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '--project', 'tsconfig.json'], cwd);
}

/**
 * @param {unknown} value parsed package manifest
 * @returns {value is { name: string, version: string }} true when the package manifest has a name and version
 */
function isPackageManifest(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    typeof value.name === 'string' &&
    'version' in value &&
    typeof value.version === 'string'
  );
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
