import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Operation } from '../../../contracts/operation.ts';
import { operationList } from '../../operations/src/list.ts';
import { toolCalledIn, toolList, toolOf } from '../src/tools.ts';

test('the tool list is the operations list: one tool per operation, in the same order, with nothing added', () => {
  assert.deepEqual(toolList().map((tool) => tool.name), operationList.map((operation) => operation.name));
  for (const [index, tool] of toolList().entries()) {
    const operation = operationList[index]!;
    assert.ok(tool.description.startsWith(operation.meaning), tool.name);
    const expected = [...(operation.request_id ? ['request_id'] : []), ...Object.keys(operation.input)];
    assert.deepEqual(Object.keys(tool.inputSchema.properties), expected, tool.name);
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.equal(tool.annotations.readOnlyHint, !operation.changes);
    for (const result of Object.keys(operation.results)) {
      assert.ok(tool.description.includes(result), `${tool.name} names ${result}`);
    }
  }
});

test('a tool takes exactly the inputs its operation takes, with the same limits', () => {
  const sample: Operation = {
    name: 'sample_make',
    part: 'sample',
    meaning: 'Make a sample.',
    level: 'prepare',
    changes: true,
    request_id: true,
    input: {
      name: { kind: 'text', meaning: 'Its name.', required: true, max: 10 },
      note: { kind: 'text', meaning: 'A note.', required: false, min: 4, max: 20 },
      level: { kind: 'choice', meaning: 'Its level.', required: true, choices: ['read', 'prepare'] },
      on: { kind: 'yes_no', meaning: 'On or off.', required: false },
      limit: { kind: 'count', meaning: 'How many.', required: false, min: 1, max: 5 },
    },
    results: { made: 'The sample was made.', name_taken: 'The name is taken.' },
  };
  assert.deepEqual(toolOf(sample), {
    name: 'sample_make',
    description: 'Make a sample. Needs the level prepare. Results: made, name_taken.',
    inputSchema: {
      type: 'object',
      properties: {
        request_id: {
          type: 'string',
          description: 'A request ID you make up, 8 to 100 characters. Send the same one again to repeat safely.',
          minLength: 8,
          maxLength: 100,
        },
        name: { type: 'string', description: 'Its name.', minLength: 1, maxLength: 10 },
        note: { type: 'string', description: 'A note.', minLength: 4, maxLength: 20 },
        level: { type: 'string', description: 'Its level.', enum: ['read', 'prepare'] },
        on: { type: 'boolean', description: 'On or off.' },
        limit: { type: 'integer', description: 'How many.', minimum: 1, maximum: 5 },
      },
      required: ['request_id', 'name', 'level'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false },
  });
});

test("a tool says when its operation is the person's, so an agent knows the answer before it asks", () => {
  for (const name of ['sign_in', 'password_set', 'sign_out', 'agent_create', 'agent_list', 'agent_set', 'activity_list']) {
    const tool = toolList().find((candidate) => candidate.name === name)!;
    assert.ok(tool.description.includes('not_allowed'), name);
  }
  assert.ok(toolList().find((tool) => tool.name === 'whoami')!.description.includes('Needs the level read.'));
});

test('the name of a called tool is read from a request as plain JSON, and anything else is nothing', () => {
  const call = (params: unknown): string => JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params });
  assert.equal(toolCalledIn(call({ name: 'agent_set', arguments: { on: true } })), 'agent_set');
  assert.equal(toolCalledIn(call({ name: 'anything at all' })), 'anything at all');

  const nothing: (string | null)[] = [
    null,
    '',
    'not json {{{',
    'null',
    '"tools/call"',
    JSON.stringify([{ method: 'tools/call', params: { name: 'agent_set' } }]),
    JSON.stringify({ method: 'tools/list', params: { name: 'agent_set' } }),
    JSON.stringify({ method: 'initialize', params: {} }),
    JSON.stringify({ method: 'tools/call' }),
    JSON.stringify({ method: 'tools/call', params: null }),
    JSON.stringify({ method: 'tools/call', params: 'agent_set' }),
    call({ name: 7 }),
    call({ arguments: { name: 'agent_set' } }),
  ];
  for (const body of nothing) {
    assert.equal(toolCalledIn(body), null, String(body));
  }
});
