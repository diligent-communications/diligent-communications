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

// The most messages the agent protocol's handler takes in one array.
export const MESSAGES_AT_MOST = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// The names of the tools a request on the agent connection calls, in order.
//
// It is read as plain JSON, without the protocol library, for one purpose: so
// the host can have recorded every change that an agent it has already
// refused was trying to make. The handler runs a tool call from one request,
// or from each request in an array of up to 100, so both are read here. A
// tool call is a request: it names the protocol's version, carries an ID and
// the method `tools/call`, and names its tool. Anything else is not one, and
// a body that cannot be understood calls nothing.
export function toolsCalledIn(body: string): string[] {
  let request: unknown;
  try {
    request = JSON.parse(body);
  } catch {
    return [];
  }
  if (Array.isArray(request) && request.length > MESSAGES_AT_MOST) {
    return [];
  }
  const names: string[] = [];
  for (const message of Array.isArray(request) ? request : [request]) {
    if (!isRecord(message) || message.jsonrpc !== '2.0' || message.method !== 'tools/call') {
      continue;
    }
    const hasId = typeof message.id === 'string' || (typeof message.id === 'number' && Number.isInteger(message.id));
    if (hasId && isRecord(message.params) && typeof message.params.name === 'string') {
      names.push(message.params.name);
    }
  }
  return names;
}

// Every operation is offered as a tool.
export function toolList(): Tool[] {
  return operationList.map(toolOf);
}
