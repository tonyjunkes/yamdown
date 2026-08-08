import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const root = dirname(import.meta.dirname);
const schemaPath = join(root, 'schema', 'yamdown.schema.json');
const jsonSchemaModulePath = ['..', 'dist', 'json-schema.mjs'].join('/');
/** @type {unknown} */
const jsonSchemaModule = await import(jsonSchemaModulePath);

if (!isJsonSchemaModule(jsonSchemaModule)) {
  throw new TypeError('Expected the built JSON Schema module to export stringifyYamdownJsonSchema.');
}

const expected = jsonSchemaModule.stringifyYamdownJsonSchema();
const actual = await readFile(schemaPath, 'utf8');

if (actual !== expected) {
  throw new Error(
    `The committed JSON Schema is stale (${schemaPath}). Run \`pnpm run schema:generate\` and commit the result.`
  );
}

/**
 * @param {unknown} value imported module namespace
 * @returns {value is { stringifyYamdownJsonSchema: () => string }} true when the value has the expected export
 */
function isJsonSchemaModule(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    'stringifyYamdownJsonSchema' in value &&
    typeof value.stringifyYamdownJsonSchema === 'function'
  );
}
