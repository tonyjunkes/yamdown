#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Command, CommanderError } from 'commander';
import { YamlMarkdownError, YamlMarkdownParseError, YamlMarkdownValidationError } from './errors.js';
import type { SourceRange } from './errors.js';
import { parseYamlMarkdown } from './parse.js';
import { renderMarkdown } from './render.js';

interface CliOptions {
  check?: boolean;
  debug?: boolean;
  output?: string;
}

interface WritableStreamLike {
  write(chunk: string): boolean;
}

interface CliIO {
  stderr: WritableStreamLike;
  stdout: WritableStreamLike;
}

const DEFAULT_IO: CliIO = { stderr: process.stderr, stdout: process.stdout };

export async function runCli(argv: readonly string[] = process.argv, io: CliIO = DEFAULT_IO): Promise<number> {
  const program = new Command();
  let inputPath: string | undefined;
  let inputSource: string | undefined;
  let outputPath: string | undefined;

  program
    .name('yamdown')
    .description('Convert structured YAML into deterministic Markdown.')
    .argument('<input>', 'YAML input file')
    .option('-o, --output <file>', 'write Markdown to a file')
    .option('--check', 'validate input without rendering Markdown')
    .option('--debug', 'print stack traces for unexpected errors')
    .exitOverride()
    .configureOutput({
      writeErr: (value) => {
        io.stderr.write(value);
      },
      writeOut: (value) => {
        io.stdout.write(value);
      }
    })
    .action(async (input: string, options: CliOptions) => {
      inputPath = input;
      const yaml = await readFile(input, 'utf8');
      inputSource = yaml;

      if (options.check === true) {
        parseYamlMarkdown(yaml);
        return;
      }

      const markdown = renderMarkdown(yaml);
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

    if (error instanceof YamlMarkdownError) {
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

function formatCliError(error: YamlMarkdownError, inputPath?: string, source?: string): string {
  const location =
    error instanceof YamlMarkdownParseError
      ? error.location
      : error instanceof YamlMarkdownValidationError
        ? error.issues[0]?.location
        : undefined;

  if (location === undefined || inputPath === undefined || source === undefined) {
    return `${error.message}\n`;
  }

  const { line, column } = location.start;
  const sourceLine = source.split(/\r?\n/u)[line - 1] ?? '';
  const markerWidth = codeFrameWidth(location, line, sourceLine.length);
  const gutter = String(line);

  return [
    `${inputPath}:${line}:${column} error: ${error.message}`,
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

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const exitCode = await runCli();
  process.exitCode = exitCode;
}
