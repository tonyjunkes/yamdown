import { z } from 'zod';
import { sourceDocumentSchema } from './schema.js';

export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export type JsonPrimitive = boolean | null | number | string;
export type JsonArray = JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

const schemaMetadata = {
  $id: 'https://github.com/tonyjunkes/yamdown/schema/yamdown.schema.json',
  title: 'Yamdown authoring document',
  description: 'YAML authoring schema for Yamdown documents before normalization.'
} satisfies JsonObject;

export function createYamlMarkdownJsonSchema(): JsonObject {
  const generatedSchema = z.toJSONSchema(sourceDocumentSchema, {
    target: 'draft-2020-12'
  });

  if (!isJsonObject(generatedSchema)) {
    throw new TypeError('Expected Zod to generate a JSON Schema object.');
  }

  const schema = generatedSchema;

  Object.assign(schema, schemaMetadata);
  applyCodeMetadataConstraints(schema);

  return schema;
}

export function stringifyYamlMarkdownJsonSchema(): string {
  return `${JSON.stringify(createYamlMarkdownJsonSchema(), null, 2)}\n`;
}

function applyCodeMetadataConstraints(value: JsonValue): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      applyCodeMetadataConstraints(item);
    }
    return;
  }

  if (!isJsonObject(value)) {
    return;
  }

  if (isCodeObjectSchema(value)) {
    const properties = asJsonObject(value.properties);
    properties.meta = {
      ...asJsonObject(properties.meta),
      minLength: 1,
      pattern: '^(?!\\s)(?!.*\\s$)[^\\r\\n]+$'
    };

    value.if = { required: ['meta'] };
    setJsonSchemaKeyword(value, 'then', {
      required: ['lang'],
      properties: {
        lang: {
          ...asJsonObject(properties?.lang),
          minLength: 1,
          pattern: '^\\S+$'
        }
      }
    });
  }

  for (const item of Object.values(value)) {
    applyCodeMetadataConstraints(item);
  }
}

function isCodeObjectSchema(value: JsonObject): boolean {
  if (value.type !== 'object' || !isJsonObject(value.properties)) {
    return false;
  }

  const { properties } = value;
  const isVerboseCodeSchema = hasStringConst(properties.type, 'code');
  const isCodeShorthandBodySchema = isStringSchema(properties.lang);

  return (
    isStringSchema(properties.meta) &&
    isStringSchema(properties.value) &&
    (isVerboseCodeSchema || isCodeShorthandBodySchema)
  );
}

function asJsonObject(value: JsonValue | undefined): JsonObject {
  return isJsonObject(value) ? value : {};
}

function hasStringConst(value: JsonValue | undefined, constant: string): boolean {
  return isStringSchema(value) && value.const === constant;
}

function isStringSchema(value: JsonValue | undefined): value is JsonObject {
  return isJsonObject(value) && value.type === 'string';
}

function setJsonSchemaKeyword(target: JsonObject, keyword: string, value: JsonValue): void {
  target[keyword] = value;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
