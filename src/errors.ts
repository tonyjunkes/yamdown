import { z } from 'zod';

export interface SourcePosition {
  readonly line: number;
  readonly column: number;
  readonly offset: number;
}

export interface SourceRange {
  readonly start: SourcePosition;
  readonly end: SourcePosition;
}

export interface ValidationIssue {
  readonly message: string;
  readonly path?: readonly (string | number)[];
  readonly code?: string;
  readonly location?: SourceRange;
}

export class YamlMarkdownError extends Error {
  public override readonly name: string = 'YamlMarkdownError';
}

export class YamlMarkdownParseError extends YamlMarkdownError {
  public override readonly name: string = 'YamlMarkdownParseError';

  public constructor(
    message: string,
    public readonly location?: SourceRange
  ) {
    super(message);
  }
}

export class YamlMarkdownValidationError extends YamlMarkdownError {
  public override readonly name: string = 'YamlMarkdownValidationError';

  public constructor(
    message: string,
    public readonly issues: readonly ValidationIssue[]
  ) {
    super(message);
  }
}

export class YamlMarkdownRenderError extends YamlMarkdownError {
  public override readonly name: string = 'YamlMarkdownRenderError';
}

export function validationErrorFromZodIssues(
  issues: readonly z.core.$ZodIssue[],
  locate?: (path: readonly (string | number)[]) => SourceRange | undefined
): YamlMarkdownValidationError {
  const normalizedIssues = issues.flatMap((issue) => normalizeZodIssue(issue, locate));

  const firstIssue = normalizedIssues[0];
  const location =
    firstIssue?.path !== undefined && firstIssue.path.length > 0 ? ` at ${formatPath(firstIssue.path)}` : '';
  const detail = firstIssue ? `: ${firstIssue.message}` : '.';

  return new YamlMarkdownValidationError(`Invalid YAML Markdown document${location}${detail}`, normalizedIssues);
}

function normalizeZodIssue(
  issue: z.core.$ZodIssue,
  locate?: (path: readonly (string | number)[]) => SourceRange | undefined,
  prefix: readonly (string | number)[] = []
): ValidationIssue[] {
  if (issue.code === 'invalid_union') {
    const unionPath = [...prefix, ...normalizePath(issue.path)];
    const branches = issue.errors.map((branch) =>
      branch.flatMap((nestedIssue) => normalizeZodIssue(nestedIssue, locate, unionPath))
    );
    return branches.reduce((best, branch) => (compareIssueBranches(branch, best) < 0 ? branch : best));
  }

  const path = [...prefix, ...normalizePath(issue.path)];

  if (issue.code === 'unrecognized_keys') {
    return issue.keys.map((key) => {
      const keyPath = [...path, key];
      return { code: issue.code, location: locate?.(keyPath), message: `Unrecognized key: "${key}"`, path: keyPath };
    });
  }

  return [{ code: issue.code, location: locate?.(path), message: issue.message, path }];
}

function compareIssueBranches(left: readonly ValidationIssue[], right: readonly ValidationIssue[]): number {
  if (left.length !== right.length) {
    return left.length - right.length;
  }

  return issuePathScore(right) - issuePathScore(left);
}

function issuePathScore(issues: readonly ValidationIssue[]): number {
  return issues.reduce((total, issue) => total + (issue.path?.length ?? 0), 0);
}

function normalizePath(path: readonly PropertyKey[]): (string | number)[] {
  return path.filter((part): part is string | number => typeof part === 'string' || typeof part === 'number');
}

export function formatPath(path: readonly (string | number)[]): string {
  if (path.length === 0) {
    return 'document';
  }

  return path
    .map((part, index) => {
      if (typeof part === 'number') {
        return `[${part}]`;
      }

      return index === 0 ? part : `.${part}`;
    })
    .join('');
}
