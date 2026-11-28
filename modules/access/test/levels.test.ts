import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { ActivityEntry } from '../../../contracts/activity.ts';
import type { Agent } from '../../../contracts/agent.ts';
import { operationList } from '../../operations/src/list.ts';
import { madeUp, startInstall } from '../../host/test/helpers/local-install.ts';
import type { Install } from '../../host/test/helpers/local-install.ts';
import { agentConnection, post, screen } from '../../host/test/helpers/ways.ts';
import type { AgentConnection, Screen } from '../../host/test/helpers/ways.ts';

let install: Install;
let person: Screen;
const connections: AgentConnection[] = [];

async function newAgent(name: string, level: 'read' | 'prepare'): Promise<{ agent: Agent; token: string; connection: AgentConnection }> {
  const created = await person.call('agent_create', { name, level });
  assert.equal(created.result, 'created');
  const token = String(created.token);
  const connection = await agentConnection(install, token);
  connections.push(connection);
  return { agent: created.agent as Agent, token, connection };
}

async function activity(): Promise<ActivityEntry[]> {
  return (await person.call('activity_list', { limit: 200 })).entries as ActivityEntry[];
}

before(async () => {
  install = await startInstall();
  person = screen(install);
  const password = madeUp('password');
  assert.equal((await person.call('password_set', { code: install.setupCode, password })).result, 'set');
  assert.equal((await person.call('sign_in', { password })).result, 'signed_in');
});

after(async () => {
  await Promise.all(connections.map((connection) => connection.close()));
  await install?.close();
});

test('a caller with no sign-in may call sign_in and password_set and nothing else', async () => {
  for (const operation of operationList) {
    const { answer } = await post(install, operation.name, {});
    if (operation.level === 'none') {
      assert.equal(answer.result, 'invalid_input', operation.name);
    } else {
      assert.equal(answer.result, 'not_signed_in', operation.name);
    }
  }
  // A sign-in the install does not know is no sign-in.
  assert.equal((await post(install, 'whoami', {}, { authorization: 'Bearer dla_not-a-token-this-install-made' })).answer.result, 'not_signed_in');
  assert.equal((await post(install, 'whoami', {}, { cookie: 'diligent_session=dls_not-a-session-this-install-made' })).answer.result, 'not_signed_in');
});

test('a request that carries an Authorization header is judged by that header alone, and never by a session cookie it also carries', async () => {
  const { agent, token } = await newAgent('header', 'read');
  const cookie = person.setCookies.at(-1)!.split(';')[0]!;
  assert.equal((await post(install, 'whoami', {}, { cookie })).answer.result, 'you');

  // The scheme is matched without regard to case, and the token wins.
  for (const scheme of ['Bearer', 'bearer', 'BEARER']) {
    const answer = (await post(install, 'whoami', {}, { cookie, authorization: `${scheme} ${token}` })).answer;
    assert.deepEqual([answer.result, (answer.agent as Agent | undefined)?.id], ['agent', agent.id], scheme);
  }

  // A header that cannot be read, or that names no agent, is no sign-in, with
  // the person's cookie beside it. Nothing is done as the person.
  const agents = ((await person.call('agent_list')).agents as Agent[]).length;
  const unreadable = ['Bearer', 'bearer', `Bearer ${token} more`, `Bearer  ${token}`, `Basic ${token}`, `Token ${token}`, token, 'bearer dla_not-a-token-this-install-made'];
  for (const authorization of unreadable) {
    assert.equal((await post(install, 'whoami', {}, { cookie, authorization })).answer.result, 'not_signed_in', authorization);
    const change = await post(install, 'agent_create', { request_id: crypto.randomUUID(), name: 'made-by-fallback', level: 'read' }, { cookie, authorization });
    assert.equal(change.answer.result, 'not_signed_in', authorization);
  }
  assert.equal(((await person.call('agent_list')).agents as Agent[]).length, agents);

  // The agent connection reads the header the same way.
  const list = { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }) };
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
  assert.equal((await install.fetch('/mcp', { ...list, headers: { ...headers, authorization: `bearer ${token}` } })).status, 200);
  assert.equal((await install.fetch('/mcp', { ...list, headers: { ...headers, cookie, authorization: `Basic ${token}` } })).status, 401);
});

test('a Read agent may read who it is and is refused every change', async () => {
  const { agent, connection } = await newAgent('reader', 'read');
  assert.equal((await connection.call('whoami')).result, 'agent');
  const refused = await connection.call('agent_set', { agent: agent.id, level: 'prepare' });
  assert.equal(refused.result, 'not_allowed');
  const listed = (await person.call('agent_list')).agents as Agent[];
  assert.equal(listed.find((row) => row.id === agent.id)?.level, 'read');
});

test('no agent, at either level, can make an agent, list agents or read the activity record', async () => {
  const { connection: reader } = await newAgent('second-reader', 'read');
  const { connection: preparer, agent } = await newAgent('preparer', 'prepare');
  const before = ((await person.call('agent_list')).agents as Agent[]).length;
  for (const connection of [reader, preparer]) {
    assert.equal((await connection.call('agent_create', { name: madeUp('made-by-agent'), level: 'read' })).result, 'not_allowed');
    assert.equal((await connection.call('agent_list')).result, 'not_allowed');
    assert.equal((await connection.call('activity_list')).result, 'not_allowed');
    assert.equal((await connection.call('agent_set', { agent: agent.id, on: false })).result, 'not_allowed');
  }
  assert.equal(((await person.call('agent_list')).agents as Agent[]).length, before);
});

test("an operation at the person's level answers not_allowed on the agent connection, and each refused change is recorded under the agent", async () => {
  const { agent, connection, token } = await newAgent('asker', 'prepare');
  const before = (await activity()).length;
  const password = madeUp('password');
  assert.equal((await connection.call('sign_in', { password })).result, 'not_allowed');
  assert.equal((await connection.call('sign_out')).result, 'not_allowed');
  assert.equal((await connection.call('password_set', { code: install.setupCode, password })).result, 'not_allowed');
  assert.equal((await connection.call('agent_create', { name: 'another', level: 'read' })).result, 'not_allowed');
  assert.equal((await connection.call('agent_list')).result, 'not_allowed');
  assert.equal((await connection.call('activity_list')).result, 'not_allowed');

  // The same holds for the agent's sign-in on the operation address.
  assert.equal((await post(install, 'sign_out', {}, { authorization: `Bearer ${token}` })).answer.result, 'not_allowed');

  const added = (await activity()).slice(0, -before);
  assert.deepEqual(
    added.map((entry) => [entry.who, entry.operation, entry.result]).reverse(),
    [
      [`agent:${agent.id}`, 'sign_in', 'not_allowed'],
      [`agent:${agent.id}`, 'sign_out', 'not_allowed'],
      [`agent:${agent.id}`, 'password_set', 'not_allowed'],
      [`agent:${agent.id}`, 'agent_create', 'not_allowed'],
      [`agent:${agent.id}`, 'sign_out', 'not_allowed'],
    ],
  );
  // The set-up code the agent sent was not used up.
  assert.equal((await person.call('whoami')).result, 'you');
});

test('a switched-off agent is refused everything on its very next call, and works again when switched on', async () => {
  const { agent, connection, token } = await newAgent('sleeper', 'prepare');
  assert.equal((await connection.call('whoami')).result, 'agent');

  const off = await person.call('agent_set', { agent: agent.id, on: false });
  assert.equal(off.result, 'changed');
  assert.equal((off.agent as Agent).on, false);
  const before = (await activity()).length;

  // On the agent connection the host refuses every request itself, before
  // the protocol handler: the handshake, the tool list and a tool call alike.
  // Each gets the named result, and none is answered by the protocol.
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${token}` };
  const refused = async (body: string): Promise<void> => {
    const response = await install.fetch('/mcp', { method: 'POST', headers, body });
    assert.equal(response.status, 403, body.slice(0, 60));
    assert.deepEqual(await response.json(), {
      result: 'switched_off',
      description: 'The caller\'s agent sign-in is switched off. The agent "sleeper" is switched off.',
    });
  };
  const change = { request_id: crypto.randomUUID(), agent: agent.id, on: true };
  // None of these is an attempt at a change, so none leaves a record: a
  // handshake, a tool list, a read, a tool that is no operation, a request
  // that is not a tool call, a body that is not JSON, and a body too large
  // to read. The same shapes that do attempt a change are in host's
  // agent-connection test.
  const noRecord = [
    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test-agent', version: '1' } } }),
    JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
    JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'whoami', arguments: {} } }),
    JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'no_such_operation', arguments: {} } }),
    JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'agent_set', params: { name: 'agent_set' } }),
    'not json {{{',
    JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'agent_set', arguments: { ...change, padding: 'x'.repeat(70_000) } } }),
  ];
  for (const body of noRecord) {
    await refused(body);
  }
  // A real client is refused on the connection it already had open, cannot
  // list the tools, and cannot complete a new handshake.
  await assert.rejects(connection.toolNames());
  await assert.rejects(agentConnection(install, token));
  assert.equal((await activity()).length, before);

  // A tool call that names an operation that changes something is refused
  // the same way, and that attempt is recorded: one line, by that agent.
  await refused(JSON.stringify({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'agent_set', arguments: change } }));
  await assert.rejects(connection.call('agent_set', change));
  const onConnection = (await activity()).slice(0, -before);
  assert.deepEqual(
    onConnection.map((entry) => [entry.who, entry.operation, entry.on, entry.result]),
    [
      [`agent:${agent.id}`, 'agent_set', null, 'switched_off'],
      [`agent:${agent.id}`, 'agent_set', null, 'switched_off'],
    ],
  );

  // On the operation address the sign-in gets `switched_off` on every
  // operation, a read included. The refused change is recorded. The read is not.
  const asAgent = { authorization: `Bearer ${token}` };
  for (const operation of ['whoami', 'agent_list', 'activity_list', 'sign_out']) {
    assert.equal((await post(install, operation, {}, asAgent)).answer.result, 'switched_off', operation);
  }
  const onAddress = await post(install, 'agent_set', { request_id: crypto.randomUUID(), agent: agent.id, on: true }, asAgent);
  assert.equal(onAddress.answer.result, 'switched_off');
  const lines = (await activity()).filter((entry) => entry.who === `agent:${agent.id}`);
  assert.deepEqual(lines.map((entry) => [entry.operation, entry.result]), [
    ['agent_set', 'switched_off'],
    ['sign_out', 'switched_off'],
    ['agent_set', 'switched_off'],
    ['agent_set', 'switched_off'],
  ]);
  // The agent stayed as the person left it through all of that.
  assert.equal(((await person.call('agent_list')).agents as Agent[]).find((row) => row.id === agent.id)?.on, false);

  // Switching it off erased nothing, and switching it on brings it back.
  const listed = (await person.call('agent_list')).agents as Agent[];
  assert.equal(listed.find((row) => row.id === agent.id)?.on, false);
  assert.equal((await person.call('agent_set', { agent: agent.id, on: true })).result, 'changed');
  const again = await agentConnection(install, token);
  connections.push(again);
  assert.equal((await again.call('whoami')).result, 'agent');
  assert.equal((await again.toolNames()).length > 0, true);
});

test("changing an agent's level takes effect on its next call", async () => {
  const { agent, connection } = await newAgent('riser', 'read');
  assert.deepEqual((await connection.call('whoami')).agent, { id: agent.id, name: 'riser', level: 'read' });
  assert.equal((await person.call('agent_set', { agent: agent.id, level: 'prepare' })).result, 'changed');
  assert.deepEqual((await connection.call('whoami')).agent, { id: agent.id, name: 'riser', level: 'prepare' });
  assert.equal((await person.call('agent_set', { agent: 'nosuchagent', level: 'read' })).result, 'unknown_agent');
  assert.equal((await person.call('agent_set', { agent: agent.id })).result, 'invalid_input');
});

test('the agent connection refuses a request with no agent sign-in before the protocol handler reads it', async () => {
  const handshake = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
  const personCookie = person.setCookies.at(-1)!.split(';')[0]!;
  const tries: Record<string, string>[] = [
    {},
    { authorization: 'Bearer dla_not-a-token-this-install-made' },
    { authorization: 'Basic abc' },
    // The person's own session is not an agent sign-in.
    { cookie: personCookie },
  ];
  for (const extra of tries) {
    const response = await install.fetch('/mcp', { method: 'POST', headers: { ...headers, ...extra }, body: handshake });
    assert.equal(response.status, 401);
    assert.equal(((await response.json()) as { result: string }).result, 'not_signed_in');
  }
  // A body that is not the protocol at all is refused the same way, unread.
  const garbage = await install.fetch('/mcp', { method: 'POST', headers, body: 'not json {{{' });
  assert.equal(garbage.status, 401);
});

test('an agent is listed with its level, whether it is on, and when it was last used, and never with its token', async () => {
  const { agent, token, connection } = await newAgent('listed', 'read');
  const fresh = ((await person.call('agent_list')).agents as Agent[]).find((row) => row.id === agent.id)!;
  assert.deepEqual(Object.keys(fresh).sort(), ['id', 'last_used_at', 'level', 'made_at', 'name', 'on']);
  await connection.call('whoami');
  const listing = await person.call('agent_list');
  const used = (listing.agents as Agent[]).find((row) => row.id === agent.id)!;
  assert.ok(typeof used.last_used_at === 'string' && used.last_used_at >= used.made_at);
  assert.equal(JSON.stringify(listing).includes(token), false);

  const taken = await person.call('agent_create', { name: 'LISTED', level: 'read' });
  assert.equal(taken.result, 'name_taken');
});
