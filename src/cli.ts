#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { Command, CommanderError } from 'commander';
import { YamdownError, YamdownValidationError, YamdownYamlParseError } from './errors.js';
import type { SourceRange } from './errors.js';
import { parseMarkdownDocument, renderMarkdownDocument } from './markdown-document.js';
import { parseYamlDocument, renderYamlMarkdown } from './yaml.js';

interface CliOptions {
  check?: boolean;
  debug?: boolean;
  inputFormat?: string;
  output?: string;
  schema?: boolean;
}

type InputFormat = 'markdown' | 'yaml';

interface WritableStreamLike {
  write(chunk: string): boolean;
}

interface CliIO {
  stderr: WritableStreamLike;
  stdout: WritableStreamLike;
}

const DEFAULT_IO: CliIO = { stderr: process.stderr, stdout: process.stdout };
// Keep this in sync with package.json. The bundled CLI cannot read the source
// package manifest once it has been installed from a tarball.
const VERSION = '0.11.5';

export async function runCli(argv: readonly string[] = process.argv, io: CliIO = DEFAULT_IO): Promise<number> {
  const program = new Command();
  let inputPath: string | undefined;
  let inputSource: string | undefined;
  let outputPath: string | undefined;

  program
    .name('yamdown')
    .description('Validate and render portable Yamdown Markdown or structured YAML.')
    .version(VERSION, '--version', 'output the installed version')
    .argument('[input]', 'YAML or Markdown input file; use - for stdin')
    .option('--input-format <yaml|markdown>', 'select the input format for stdin or ambiguous paths')
    .option('-o, --output <file>', 'write Markdown to a file')
    .option('--check', 'validate input without rendering Markdown')
    .option('--debug', 'print stack traces for unexpected errors')
    .option('--schema', 'print the Yamdown authoring JSON Schema')
    .exitOverride()
    .configureOutput({
      writeErr: (value) => {
        io.stderr.write(value);
      },
      writeOut: (value) => {
        io.stdout.write(value);
      }
    })
    .action(async (input: string | undefined, options: CliOptions) => {
      if (options.schema === true) {
        if (
          input !== undefined ||
          options.check === true ||
          options.inputFormat !== undefined ||
          options.output !== undefined
        ) {
          program.error(
            '--schema cannot be combined with an input file, --check, or --output; --input-format is also unavailable'
          );
        }

        io.stdout.write(await readFile(new URL('../schema/yamdown.schema.json', import.meta.url), 'utf8'));
        return;
      }

      if (input === undefined) {
        program.error("missing required argument 'input'");
        return;
      }

      const inputFormat = resolveInputFormat(input, options.inputFormat, program);
      if (inputFormat === undefined) {
        return;
      }

      inputPath = input === '-' ? '<stdin>' : input;
      const source = input === '-' ? await readStandardInput() : await readFile(input, 'utf8');
      inputSource = source;

      if (options.check === true) {
        if (inputFormat === 'yaml') {
          parseYamlDocument(source);
        } else {
          parseMarkdownDocument(source);
        }
        return;
      }

      const markdown =
        inputFormat === 'yaml' ? renderYamlMarkdown(source) : renderMarkdownDocument(parseMarkdownDocument(source));
      if (options.output !== undefined) {
        outputPath = options.output;
        await writeFile(options.output, markdown, 'utf8');
        return;
      }

      io.stdout.write(markdown);
    });

  try {
    await program.parseAsync([...argv], { from: 'node' });
    return 0;
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.exitCode;
    }

    if (error instanceof YamdownError) {
      io.stderr.write(formatCliError(error, inputPath, inputSource));
      return 1;
    }

    if (isNodeError(error) && error.code === 'ENOENT') {
      if (outputPath !== undefined && error.path === outputPath) {
        io.stderr.write(`Output directory not found for: ${outputPath}\n`);
        return 1;
      }

      io.stderr.write(`File not found: ${error.path}\n`);
      return 1;
    }

    const debug = argv.includes('--debug');
    const message = error instanceof Error ? (debug ? (error.stack ?? error.message) : error.message) : String(error);
    io.stderr.write(`${message}\n`);
    return 1;
  }
}

function resolveInputFormat(
  input: string | undefined,
  requestedFormat: string | undefined,
  program: Command
): InputFormat | undefined {
  if (requestedFormat !== undefined) {
    if (requestedFormat === 'yaml' || requestedFormat === 'markdown') {
      return requestedFormat;
    }

    program.error('--input-format must be either "yaml" or "markdown"');
    return undefined;
  }

  if (input === undefined) {
    program.error("missing required argument 'input'");
    return undefined;
  }

  if (input === '-') {
    program.error('stdin requires --input-format yaml or --input-format markdown');
    return undefined;
  }

  const lowerCasePath = input.toLocaleLowerCase('en-US');
  if (lowerCasePath.endsWith('.yaml') || lowerCasePath.endsWith('.yml')) {
    return 'yaml';
  }

  if (lowerCasePath.endsWith('.yamdown.md')) {
    return 'markdown';
  }

  program.error(`Cannot determine the input format for ${input}; use --input-format yaml or --input-format markdown`);
  return undefined;
}

async function readStandardInput(): Promise<string> {
  process.stdin.setEncoding('utf8');
  let source = '';
  for await (const chunk of process.stdin) {
    source += chunk;
  }
  return source;
}

function formatCliError(error: YamdownError, inputPath?: string, source?: string): string {
  if (error instanceof YamdownValidationError) {
    if (error.issues.length === 0) {
      return `${error.message}\n`;
    }

    return error.issues
      .map((issue, index) =>
        formatCliDiagnostic(index === 0 ? error.message : issue.message, issue.location, inputPath, source)
      )
      .join('');
  }

  return formatCliDiagnostic(
    error.message,
    error instanceof YamdownYamlParseError ? error.location : undefined,
    inputPath,
    source
  );
}

function formatCliDiagnostic(
  message: string,
  location: SourceRange | undefined,
  inputPath: string | undefined,
  source: string | undefined
): string {
  if (location === undefined || inputPath === undefined || source === undefined) {
    return `${message}\n`;
  }

  const { line, column } = location.start;
  const sourceLine = source.split(/\r?\n/u)[line - 1] ?? '';
  const markerWidth = codeFrameWidth(location, line, sourceLine.length);
  const gutter = String(line);

  return [
    `${inputPath}:${line}:${column} error: ${message}`,
    `${gutter} | ${sourceLine}`,
    `${' '.repeat(gutter.length)} | ${' '.repeat(Math.max(0, column - 1))}${'^'.repeat(markerWidth)}`,
    ''
  ].join('\n');
}

function codeFrameWidth(location: SourceRange, line: number, lineLength: number): number {
  if (location.end.line !== line) {
    return Math.max(1, lineLength - location.start.column + 2);
  }

  return Math.max(1, location.end.column - location.start.column);
}

function isNodeError(error: unknown): error is Error & { code: string; path: string } {
  return (
    error instanceof Error &&
    'code' in error &&
    'path' in error &&
    typeof error.code === 'string' &&
    typeof error.path === 'string'
  );
}

function isMainModule(): boolean {
  if (process.argv[1] === undefined) {
    return false;
  }
  try {
    return realpathSync(import.meta.filename) === realpathSync(process.argv[1]);
  } catch {
    // Embedded callers can supply an argv label that is not a filesystem path.
    return false;
  }
}

if (isMainModule()) {
  const exitCode = await runCli();
  process.exitCode = exitCode;
}
