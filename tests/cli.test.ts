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

  test('returns commander errors for missing input', async () => {
    const stderr = new MemoryStream();

    const exitCode = await runCli(['node', 'yamdown'], {
      stderr,
      stdout: new MemoryStream()
    });

    expect(exitCode).toBe(1);
    expect(stderr.value).toMatch(/missing required argument 'input'/u);
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
});
