// What a switched-off agent's refused request records on the agent connection.
//
// The rule: every tool call that would change something, and that the
// protocol handler would run for a working agent, is one recorded refusal for
// a switched-off agent. Nothing else is recorded.
//
// The test does not guess what the handler would run. It sends each request
// twice, once as a working agent and once as a switched-off one, and compares
// the lines each left. A working agent's call that reaches the door leaves a
// line too, because no agent may make these changes: `not_allowed`.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { Agent } from '../../../contracts/agent.ts';
import { AGENT_CONNECTION_PATH } from '../../mcp/src/address.ts';
import { MESSAGES_AT_MOST } from '../../mcp/src/tools.ts';
import { BODY_LIMIT, readBody } from '../src/body.ts';
import { madeUp, startInstall } from './helpers/local-install.ts';
import type { Install } from './helpers/local-install.ts';
import { screen } from './helpers/ways.ts';

let install: Install;
let working: { id: string; token: string };
let refused: { id: string; token: string };

type Line = { who: string; operation: string; result: string };

// Every line of the record, oldest first, read from the database itself.
async function lines(): Promise<Line[]> {
  const database = await install.database();
  return (await database.prepare('SELECT who, operation, result FROM activity ORDER BY id').all<Line>()).results;
}

type Sent = { body: string; declared?: boolean; headers?: Record<string, string> };

// Sends one body to the agent connection as one agent. With `declared` false
// the body goes as a stream, so the request carries no length.
async function send(token: string, sent: Sent): Promise<{ status: number; text: string }> {
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    ...sent.headers,
    authorization: `Bearer ${token}`,
  };
  const init: RequestInit & { duplex?: 'half' } =
    sent.declared === false
      ? {
          method: 'POST',
          headers,
          duplex: 'half',
          body: new ReadableStream<Uint8Array>({
            start(controller) {
              // In two pieces, so it cannot be sent as one block with a length.
              const bytes = new TextEncoder().encode(sent.body);
              const half = Math.ceil(bytes.length / 2);
              controller.enqueue(bytes.slice(0, half));
              controller.enqueue(bytes.slice(half));
              controller.close();
            },
          }) as unknown as BodyInit,
        }
      : { method: 'POST', headers, body: sent.body };
  const response = await install.fetch(AGENT_CONNECTION_PATH, init);
  return { status: response.status, text: await response.text() };
}

// What each agent's sending of the same request left in the record.
async function leftBy(sent: Sent): Promise<{ working: Line[]; refused: Line[]; workingStatus: number; refusedAnswer: unknown; refusedStatus: number }> {
  const start = (await lines()).length;
  const asWorking = await send(working.token, sent);
  const afterWorking = await lines();
  const asRefused = await send(refused.token, sent);
  const afterRefused = await lines();
  return {
    working: afterWorking.slice(start),
    refused: afterRefused.slice(afterWorking.length),
    workingStatus: asWorking.status,
    refusedStatus: asRefused.status,
    refusedAnswer: JSON.parse(asRefused.text),
  };
}

let nextId = 1;
const call = (name: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  jsonrpc: '2.0',
  id: nextId++,
  method: 'tools/call',
  params: { name, arguments: { request_id: crypto.randomUUID(), agent: 'abc', on: true, ...extra } },
});
const read = (): Record<string, unknown> => ({ jsonrpc: '2.0', id: nextId++, method: 'tools/call', params: { name: 'whoami', arguments: {} } });
const text = (value: unknown): string => JSON.stringify(value);

// One tool call, padded so the whole body is exactly this many bytes.
function callOfSize(bytes: number): string {
  const make = (padding: string): string =>
    text({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'agent_set', arguments: { request_id: 'a-request-id-of-one-fixed-length', agent: 'abc', on: true, padding } },
    });
  const body = make('x'.repeat(bytes - make('').length));
  assert.equal(new TextEncoder().encode(body).length, bytes);
  return body;
}

before(async () => {
  install = await startInstall();
  const person = screen(install);
  assert.equal((await person.call('password_set', { code: install.setupCode, password: madeUp('password') })).result, 'set');
  const make = async (name: string): Promise<{ id: string; token: string }> => {
    const created = await person.call('agent_create', { name, level: 'prepare' });
    return { id: (created.agent as Agent).id, token: String(created.token) };
  };
  working = await make('working');
  refused = await make('refused');
  assert.equal((await person.call('agent_set', { agent: refused.id, on: false })).result, 'changed');
});

after(async () => {
  await install?.close();
});

type Shape = { name: string; sent: () => Sent | Promise<Sent>; changes: string[]; workingStatus?: number };

// The request a real client of the agent protocol sends for one tool call,
// taken from the client itself, so the newest form of a call is in the table.
async function asARealClientSendsIt(): Promise<Sent> {
  const bodies: { body: string; headers: Record<string, string> }[] = [];
  const client = new Client({ name: 'test-agent', version: '1' });
  const transport = new StreamableHTTPClientTransport(new URL(AGENT_CONNECTION_PATH, install.origin), {
    authProvider: { token: async () => working.token },
    fetch: async (url, init) => {
      if (typeof init?.body === 'string') {
        bodies.push({ body: init.body, headers: Object.fromEntries(new Headers(init.headers)) });
      }
      return fetch(url, init);
    },
  });
  await client.connect(transport);
  try {
    await client.callTool({ name: 'agent_set', arguments: { request_id: crypto.randomUUID(), agent: 'abc', on: true } });
  } finally {
    await client.close();
  }
  const sent = bodies.find((request) => request.body.includes('"tools/call"'));
  assert.ok(sent, 'the client sent a tool call');
  const { authorization: _authorization, 'content-length': _length, ...headers } = sent.headers;
  return { body: sent.body, headers };
}

const shapes: Shape[] = [
  { name: 'one tool call', sent: () => ({ body: text(call('agent_set')) }), changes: ['agent_set'] },
  { name: 'one tool call, as a real client sends it', sent: asARealClientSendsIt, changes: ['agent_set'] },
  { name: 'an array of one tool call', sent: () => ({ body: text([call('agent_set')]) }), changes: ['agent_set'] },
  {
    name: 'an array mixing a change, a read, a request that is not a tool call, a notice and another change',
    sent: () => ({
      body: text([call('agent_set'), read(), { jsonrpc: '2.0', id: nextId++, method: 'tools/list', params: {} }, { jsonrpc: '2.0', method: 'notifications/initialized' }, call('sign_out')]),
    }),
    changes: ['agent_set', 'sign_out'],
  },
  { name: 'one tool call with no declared length', sent: () => ({ body: text(call('agent_set')), declared: false }), changes: ['agent_set'] },
  {
    name: 'an array with no declared length',
    sent: () => ({ body: text([call('sign_out'), read(), call('agent_set')]), declared: false }),
    changes: ['sign_out', 'agent_set'],
  },
  { name: 'a body exactly at the size limit', sent: () => ({ body: callOfSize(BODY_LIMIT) }), changes: ['agent_set'] },
  { name: 'a body at the size limit with no declared length', sent: () => ({ body: callOfSize(BODY_LIMIT), declared: false }), changes: ['agent_set'] },
  // Over the limit the host refuses every agent before the handler, so there
  // is no call a working agent can make that a switched-off one makes unseen.
  { name: 'a body one byte over the size limit', sent: () => ({ body: callOfSize(BODY_LIMIT + 1) }), changes: [], workingStatus: 400 },
  { name: 'a body over the size limit with no declared length', sent: () => ({ body: callOfSize(BODY_LIMIT + 1), declared: false }), changes: [], workingStatus: 400 },
  {
    name: 'an array of as many tool calls as the handler takes',
    sent: () => ({ body: text(Array.from({ length: MESSAGES_AT_MOST }, () => call('agent_set'))) }),
    changes: Array.from({ length: MESSAGES_AT_MOST }, () => 'agent_set'),
  },
  // What the handler does not run is not an attempt it would have carried out.
  { name: 'an array of one more than the handler takes', sent: () => ({ body: text(Array.from({ length: MESSAGES_AT_MOST + 1 }, () => call('agent_set'))) }), changes: [], workingStatus: 400 },
  { name: 'an empty array', sent: () => ({ body: '[]' }), changes: [], workingStatus: 400 },
  { name: 'a tool call sent as a notice, with no ID', sent: () => ({ body: text({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'agent_set', arguments: {} } }) }), changes: [], workingStatus: 202 },
  { name: 'a tool call that names a read', sent: () => ({ body: text(read()) }), changes: [] },
  { name: 'a tool call that names no operation', sent: () => ({ body: text({ jsonrpc: '2.0', id: nextId++, method: 'tools/call', params: { name: 'no_such_operation', arguments: {} } }) }), changes: [] },
  { name: 'a tool list', sent: () => ({ body: text({ jsonrpc: '2.0', id: nextId++, method: 'tools/list', params: {} }) }), changes: [] },
  { name: 'a body that is not JSON', sent: () => ({ body: 'not json {{{' }), changes: [], workingStatus: 400 },
];

for (const shape of shapes) {
  test(`${shape.name}: each change the handler runs for a working agent is one recorded refusal for a switched-off one, and nothing else is`, async () => {
    const sent = await shape.sent();
    const left = await leftBy(sent);

    // What the working agent's request did: the handler ran each changing
    // call, and the door refused and recorded it.
    assert.equal(left.workingStatus, shape.workingStatus ?? 200);
    assert.deepEqual(
      left.working,
      shape.changes.map((operation) => ({ who: `agent:${working.id}`, operation, result: 'not_allowed' })),
    );

    // The switched-off agent is refused by the host with the named result,
    // and leaves the same lines, call for call.
    assert.equal(left.refusedStatus, 403);
    assert.deepEqual(left.refusedAnswer, {
      result: 'switched_off',
      description: 'The caller\'s agent sign-in is switched off. The agent "refused" is switched off.',
    });
    assert.deepEqual(
      left.refused,
      shape.changes.map((operation) => ({ who: `agent:${refused.id}`, operation, result: 'switched_off' })),
    );
    assert.deepEqual(
      left.refused.map((line) => line.operation),
      left.working.map((line) => line.operation),
    );
  });
}

test('a body over the size limit is refused for a working agent with a named result, before the handler', async () => {
  const over = await send(working.token, { body: callOfSize(BODY_LIMIT + 1) });
  assert.equal(over.status, 400);
  assert.deepEqual(JSON.parse(over.text), {
    result: 'invalid_input',
    description: 'The input is not what this operation takes. The body must be at most 65,536 bytes.',
  });
  // The same with no declared length.
  const streamed = await send(working.token, { body: callOfSize(BODY_LIMIT + 1), declared: false });
  assert.equal(streamed.status, 400);
  assert.equal((JSON.parse(streamed.text) as { result: string }).result, 'invalid_input');
});

test('a body far over the size limit is never handled: nothing is recorded, and the install goes on answering', async () => {
  // The program stops reading at the limit. On the local runtime the tooling
  // in front of it may then drop the connection instead of passing on the
  // program's refusal, so this test accepts either. What it holds to is that
  // the calls in such a body are never run and never recorded.
  const start = (await lines()).length;
  const huge = text(Array.from({ length: 60 }, () => call('agent_set', { padding: 'x'.repeat(BODY_LIMIT) })));
  for (const token of [working.token, refused.token]) {
    for (const declared of [true, false]) {
      let status: number | 'no answer';
      try {
        status = (await send(token, { body: huge, declared })).status;
      } catch {
        status = 'no answer';
      }
      assert.notEqual(status, 200);
      assert.notEqual(status, 202);
    }
  }
  assert.equal((await lines()).length, start);
  assert.equal((await send(working.token, { body: text(read()) })).status, 200);
});

test('the reader errs toward recording: a refused request the handler would have turned away for another reason is still recorded', async () => {
  // The host does not copy the handler's other checks. These two requests
  // would not run for a working agent, and are recorded for a switched-off
  // one all the same. More is recorded than was possible, never less.
  const wrongAccept = await leftBy({ body: text(call('agent_set')), headers: { accept: 'application/json' } });
  assert.deepEqual(wrongAccept.working, []);
  assert.equal(wrongAccept.refused.length, 1);

  const withABrokenElement = await leftBy({ body: text([call('agent_set'), 7]) });
  assert.deepEqual(withABrokenElement.working, []);
  assert.equal(withABrokenElement.refused.length, 1);
});

test('a body is read up to the limit and no further, whatever length it declares', async () => {
  const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);
  // A stream that counts what it is asked for and whether it was told to stop.
  const counted = (chunks: Uint8Array[]): { body: ReadableStream<Uint8Array>; pulled: () => number; stopped: () => boolean } => {
    let pulled = 0;
    let stopped = false;
    let index = 0;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          const chunk = chunks[index++];
          if (chunk === undefined) {
            controller.close();
          } else {
            pulled += 1;
            controller.enqueue(chunk);
          }
        },
        cancel() {
          stopped = true;
        },
      },
      { highWaterMark: 0 },
    );
    return { body: body as unknown as ReadableStream<Uint8Array>, pulled: () => pulled, stopped: () => stopped };
  };

  assert.equal(await readBody({ body: null }), '');
  const small = counted([bytes('{"a":'), bytes('1}')]);
  assert.equal(await readBody(small, 10), '{"a":1}');

  // Exactly at the limit is read. One byte more is not.
  assert.equal(await readBody(counted([bytes('12345'), bytes('67890')]), 10), '1234567890');
  assert.equal(await readBody(counted([bytes('12345'), bytes('678901')]), 10), null);

  // A character split between two pieces is put back together.
  const euro = bytes('€');
  assert.equal(await readBody(counted([euro.slice(0, 1), euro.slice(1)]), 10), '€');

  // Far over the limit: the read stops at the piece that crosses it. The
  // sender is told to stop, and the pieces after it are never asked for.
  const piece = bytes('x'.repeat(4));
  const long = counted(Array.from({ length: 1000 }, () => piece));
  assert.equal(await readBody(long, 10), null);
  assert.equal(long.pulled(), 3);
  assert.equal(long.stopped(), true);
});
