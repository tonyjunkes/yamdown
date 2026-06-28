import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const root = dirname(import.meta.dirname);
const schemaPath = join(root, 'schema', 'yamdown.schema.json');
const jsonSchemaModulePath = ['..', 'dist', 'json-schema.mjs'].join('/');
/** @type {unknown} */
const jsonSchemaModule = await import(jsonSchemaModulePath);

if (!isJsonSchemaModule(jsonSchemaModule)) {
  throw new TypeError('Expected the built JSON Schema module to export stringifyYamdownJsonSchema.');
}

await mkdir(dirname(schemaPath), { recursive: true });
await writeFile(schemaPath, jsonSchemaModule.stringifyYamdownJsonSchema(), 'utf8');

/**
 * @param {unknown} value imported module namespace
 * @returns {value is { stringifyYamdownJsonSchema: () => string }} true when the module has the expected export
 */
function isJsonSchemaModule(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    'stringifyYamdownJsonSchema' in value &&
    typeof value.stringifyYamdownJsonSchema === 'function'
  );
}
