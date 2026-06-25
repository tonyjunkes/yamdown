import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { runCli } from '../src/cli.js';

class MemoryStream {
  public value = '';

  public write(chunk: string): boolean {
    this.value += chunk;
    return true;
  }
}

class ThrowingStream {
  public write(): boolean {
    throw new Error('stdout failed');
  }
}

describe('runCli', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'yamdown-'));
  });

  afterEach(async () => {
    await rm(dir, { force: true, recursive: true });
  });

  test('prints Markdown to stdout', async () => {
    const input = join(dir, 'input.yaml');
    await writeFile(input, 'blocks:\n  - h1: CLI\n', 'utf8');
    const stdout = new MemoryStream();
    const stderr = new MemoryStream();

    const exitCode = await runCli(['node', 'yamdown', input], { stderr, stdout });

    expect(exitCode).toBe(0);
    expect(stdout.value).toBe('# CLI\n');
    expect(stderr.value).toBe('');
  });

  test('renders and checks raw Markdown blocks', async () => {
    const input = join(dir, 'input.yaml');
    await writeFile(input, 'blocks:\n  - markdown: |\n      **CLI Markdown**\n', 'utf8');
    const stdout = new MemoryStream();
    const stderr = new MemoryStream();

    await expect(runCli(['node', 'yamdown', '--check', input], { stderr, stdout })).resolves.toBe(0);
    await expect(runCli(['node', 'yamdown', input], { stderr, stdout })).resolves.toBe(0);
    expect(stdout.value).toBe('**CLI Markdown**\n');
    expect(stderr.value).toBe('');
  });

  test('writes Markdown to an output file', async () => {
    const input = join(dir, 'input.yaml');
    const output = join(dir, 'output.md');
    await writeFile(input, 'blocks:\n  - p: Saved\n', 'utf8');

    const exitCode = await runCli(['node', 'yamdown', input, '-o', output], {
      stderr: new MemoryStream(),
      stdout: new MemoryStream()
    });

    expect(exitCode).toBe(0);
    await expect(readFile(output, 'utf8')).resolves.toBe('Saved\n');
  });

  test('checks validity without writing Markdown', async () => {
    const input = join(dir, 'input.yaml');
    await writeFile(input, 'blocks:\n  - p: Valid\n', 'utf8');
    const stdout = new MemoryStream();

    const exitCode = await runCli(['node', 'yamdown', '--check', input], {
      stderr: new MemoryStream(),
      stdout
    });

    expect(exitCode).toBe(0);
    expect(stdout.value).toBe('');
  });

  test('returns non-zero for invalid documents', async () => {
    const input = join(dir, 'input.yaml');
    const stderr = new MemoryStream();
    await writeFile(input, 'blocks:\n  - type: heading\n    depth: 9\n    text: Bad\n', 'utf8');

    const exitCode = await runCli(['node', 'yamdown', '--check', input], {
      stderr,
      stdout: new MemoryStream()
    });

    expect(exitCode).toBe(1);
    expect(stderr.value).toMatch(/Invalid YAML Markdown document/u);
    expect(stderr.value).toContain(`${input}:3:12 error:`);
    expect(stderr.value).toContain('3 |     depth: 9');
    expect(stderr.value).toContain('|            ^');
  });

  test('points shorthand validation errors at the shorthand value', async () => {
    const input = join(dir, 'input.yaml');
    const stderr = new MemoryStream();
    await writeFile(input, 'blocks:\n  - h2: 42\n', 'utf8');

    const exitCode = await runCli(['node', 'yamdown', '--check', input], {
      stderr,
      stdout: new MemoryStream()
    });

    expect(exitCode).toBe(1);
    expect(stderr.value).toContain(`${input}:2:9 error:`);
    expect(stderr.value).toContain('2 |   - h2: 42');
    expect(stderr.value).toContain('|         ^^');
  });

  test('points multiline validation ranges through the end of the source line', async () => {
    const input = join(dir, 'input.yaml');
    const stderr = new MemoryStream();
    await writeFile(
      input,
      [
        'blocks:',
        '  - code:',
        '      lang: ts',
        '      meta: |',
        '        title="example.ts"',
        '        extra',
        '      value: content',
        ''
      ].join('\n'),
      'utf8'
    );

    const exitCode = await runCli(['node', 'yamdown', '--check', input], {
      stderr,
      stdout: new MemoryStream()
    });

    expect(exitCode).toBe(1);
    expect(stderr.value).toContain(`${input}:4:13 error:`);
    expect(stderr.value).toContain('4 |       meta: |');
    expect(stderr.value).toContain('|             ^^');
  });

  test('omits the code frame when an error has no source location', async () => {
    const input = join(dir, 'empty.yaml');
    const stderr = new MemoryStream();
    await writeFile(input, '', 'utf8');

    const exitCode = await runCli(['node', 'yamdown', '--check', input], {
      stderr,
      stdout: new MemoryStream()
    });

    expect(exitCode).toBe(1);
    expect(stderr.value).toBe('Invalid YAML Markdown document: Invalid input: expected object, received null\n');
  });

  test('prints unexpected error stacks in debug mode', async () => {
    const input = join(dir, 'input.yaml');
    const stderr = new MemoryStream();
    await writeFile(input, 'blocks:\n  - p: Valid\n', 'utf8');

    const exitCode = await runCli(['node', 'yamdown', '--debug', input], {
      stderr,
      stdout: new ThrowingStream()
    });

    expect(exitCode).toBe(1);
    expect(stderr.value).toContain('Error: stdout failed');
    expect(stderr.value).toContain('ThrowingStream.write');
  });

  test('returns commander errors for missing input', async () => {
    const stderr = new MemoryStream();

    const exitCode = await runCli(['node', 'yamdown'], {
      stderr,
      stdout: new MemoryStream()
    });

    expect(exitCode).toBe(1);
    expect(stderr.value).toMatch(/missing required argument 'input'/u);
  });

  test('prints help to stdout', async () => {
    const stdout = new MemoryStream();
    const stderr = new MemoryStream();

    const exitCode = await runCli(['node', 'yamdown', '--help'], { stderr, stdout });

    expect(exitCode).toBe(0);
    expect(stdout.value).toContain('Usage: yamdown [options] <input>');
    expect(stdout.value).toContain('Author deterministic Markdown with structured YAML.');
    expect(stderr.value).toBe('');
  });

  test('returns a friendly error for missing files', async () => {
    const missing = join(dir, 'missing.yaml');
    const stderr = new MemoryStream();

    const exitCode = await runCli(['node', 'yamdown', missing], {
      stderr,
      stdout: new MemoryStream()
    });

    expect(exitCode).toBe(1);
    expect(stderr.value).toBe(`File not found: ${missing}\n`);
  });

  test('distinguishes a missing output directory from a missing input file', async () => {
    const input = join(dir, 'input.yaml');
    const output = join(dir, 'missing', 'output.md');
    const stderr = new MemoryStream();
    await writeFile(input, 'blocks:\n  - p: Saved\n', 'utf8');

    const exitCode = await runCli(['node', 'yamdown', input, '--output', output], {
      stderr,
      stdout: new MemoryStream()
    });

    expect(exitCode).toBe(1);
    expect(stderr.value).toBe(`Output directory not found for: ${output}\n`);
  });
});
