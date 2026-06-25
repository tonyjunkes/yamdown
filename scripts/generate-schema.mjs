import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { stringifyYamlMarkdownJsonSchema } from '../dist/json-schema.mjs';

const root = dirname(import.meta.dirname);
const schemaPath = join(root, 'schema', 'yamdown.schema.json');

await mkdir(dirname(schemaPath), { recursive: true });
await writeFile(schemaPath, stringifyYamlMarkdownJsonSchema(), 'utf8');
