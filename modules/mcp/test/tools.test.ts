import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Operation } from '../../../contracts/operation.ts';
import { operationList } from '../../operations/src/list.ts';
import { MESSAGES_AT_MOST, toolList, toolOf, toolsCalledIn } from '../src/tools.ts';

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

test('the tools a request calls are read as plain JSON: one request, or each request in an array', () => {
  const call = (name: unknown, id: unknown = 1): Record<string, unknown> => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: {} } });
  const text = (value: unknown): string => JSON.stringify(value);

  assert.deepEqual(toolsCalledIn(text(call('agent_set'))), ['agent_set']);
  assert.deepEqual(toolsCalledIn(text(call('anything at all', 'an-id'))), ['anything at all']);
  // An array of one is read as an array of one.
  assert.deepEqual(toolsCalledIn(text([call('agent_set')])), ['agent_set']);
  // Every tool call in an array is read, in order, and the rest is passed over.
  assert.deepEqual(
    toolsCalledIn(
      text([
        call('agent_set', 1),
        { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
        call('whoami', 3),
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        call('agent_set', 4),
        7,
        null,
        'tools/call',
      ]),
    ),
    ['agent_set', 'whoami', 'agent_set'],
  );
  // As many as the handler takes are read, and one more than that is none.
  const most = Array.from({ length: MESSAGES_AT_MOST }, (_, index) => call('agent_set', index));
  assert.equal(MESSAGES_AT_MOST, 100);
  assert.equal(toolsCalledIn(text(most)).length, MESSAGES_AT_MOST);
  assert.deepEqual(toolsCalledIn(text([...most, call('agent_set', 100)])), []);
});

test('what is not a tool call, or cannot be understood, calls nothing', () => {
  const nothing: unknown[] = [
    { jsonrpc: '2.0', id: 1, method: 'tools/list', params: { name: 'agent_set' } },
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 1, method: 'tools/call' },
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: null },
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: 'agent_set' },
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 7 } },
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { arguments: { name: 'agent_set' } } },
    // A request names the protocol's version and carries an ID. Without
    // either, the handler does not run it as a tool call.
    { id: 1, method: 'tools/call', params: { name: 'agent_set' } },
    { jsonrpc: '1.0', id: 1, method: 'tools/call', params: { name: 'agent_set' } },
    { jsonrpc: '2.0', method: 'tools/call', params: { name: 'agent_set' } },
    { jsonrpc: '2.0', id: null, method: 'tools/call', params: { name: 'agent_set' } },
    { jsonrpc: '2.0', id: 1.5, method: 'tools/call', params: { name: 'agent_set' } },
    [],
    [[{ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'agent_set' } }]],
    null,
    'tools/call',
    7,
  ];
  for (const body of nothing) {
    assert.deepEqual(toolsCalledIn(JSON.stringify(body)), [], JSON.stringify(body));
  }
  for (const body of ['', 'not json {{{', '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"agent_set"}']) {
    assert.deepEqual(toolsCalledIn(body), [], body);
  }
});
