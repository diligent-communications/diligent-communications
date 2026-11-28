import { REQUEST_ID_FIELD } from '../../../contracts/operation.ts';
import type { InputField, Operation } from '../../../contracts/operation.ts';
import { operationList } from '../../operations/src/list.ts';

// One input of a tool, as JSON Schema.
export type FieldSchema = { [key: string]: string | number | string[] };

// One agent tool, in the form the agent protocol lists it.
export type Tool = {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, FieldSchema>;
    required: string[];
    additionalProperties: false;
  };
  annotations: { readOnlyHint: boolean };
};

function schemaOf(field: InputField): FieldSchema {
  if (field.kind === 'text') {
    return { type: 'string', description: field.meaning, minLength: field.min ?? 1, maxLength: field.max };
  }
  if (field.kind === 'choice') {
    return { type: 'string', description: field.meaning, enum: [...field.choices] };
  }
  if (field.kind === 'yes_no') {
    return { type: 'boolean', description: field.meaning };
  }
  return { type: 'integer', description: field.meaning, minimum: field.min, maximum: field.max };
}

const LEVEL_WORDS = {
  read: 'Needs the level read.',
  prepare: 'Needs the level prepare.',
  you: "Needs the person's level, so an agent is answered not_allowed.",
  none: "The person's, so an agent is answered not_allowed.",
} as const;

// A tool is an operation. This makes one from an entry in the operations list
// and adds nothing of its own.
export function toolOf(operation: Operation): Tool {
  const properties: Record<string, FieldSchema> = {};
  const required: string[] = [];
  if (operation.request_id) {
    properties[REQUEST_ID_FIELD] = {
      type: 'string',
      description: 'A request ID you make up, 8 to 100 characters. Send the same one again to repeat safely.',
      minLength: 8,
      maxLength: 100,
    };
    required.push(REQUEST_ID_FIELD);
  }
  for (const [name, field] of Object.entries(operation.input)) {
    properties[name] = schemaOf(field);
    if (field.required) {
      required.push(name);
    }
  }
  return {
    name: operation.name,
    description: `${operation.meaning} ${LEVEL_WORDS[operation.level]} Results: ${Object.keys(operation.results).join(', ')}.`,
    inputSchema: { type: 'object', properties, required, additionalProperties: false },
    annotations: { readOnlyHint: !operation.changes },
  };
}

// Every operation is offered as a tool.
export function toolList(): Tool[] {
  return operationList.map(toolOf);
}
