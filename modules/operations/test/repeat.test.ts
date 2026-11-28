import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { ActivityEntry } from '../../../contracts/activity.ts';
import type { Agent } from '../../../contracts/agent.ts';
import { madeUp, startInstall } from '../../host/test/helpers/local-install.ts';
import type { Install } from '../../host/test/helpers/local-install.ts';
import { commandLine, screen } from '../../host/test/helpers/ways.ts';
import type { Screen } from '../../host/test/helpers/ways.ts';

let install: Install;
let person: Screen;
const password = madeUp('password');

async function agents(): Promise<Agent[]> {
  return (await person.call('agent_list')).agents as Agent[];
}

async function activity(): Promise<ActivityEntry[]> {
  return (await person.call('activity_list', { limit: 200 })).entries as ActivityEntry[];
}

before(async () => {
  install = await startInstall();
  person = screen(install);
  assert.equal((await person.call('password_set', { code: install.setupCode, password })).result, 'set');
  assert.equal((await person.call('sign_in', { password })).result, 'signed_in');
});

after(async () => {
  await install?.close();
});

test('agent_create sent twice with the same request ID makes one agent, and the repeat answers created without the token', async () => {
  const request = { request_id: madeUp('request'), name: 'sorter', level: 'prepare' };
  const first = await person.call('agent_create', request);
  assert.equal(first.result, 'created');
  assert.match(String(first.token), /^dla_[A-Za-z0-9_-]{43}$/);

  const repeat = await person.call('agent_create', request);
  const { token: _token, ...withoutToken } = first;
  assert.deepEqual(repeat, withoutToken);
  assert.equal('token' in repeat, false);

  // A repeat that comes in by another way gets the same kept answer.
  const elsewhere = commandLine(install);
  assert.equal((await elsewhere.call('sign_in', { password })).result, 'signed_in');
  assert.deepEqual(await elsewhere.call('agent_create', request), withoutToken);

  assert.equal((await agents()).filter((agent) => agent.name === 'sorter').length, 1);
  // The repeats changed nothing and recorded nothing: one line for the agent.
  const id = (first.agent as Agent).id;
  assert.equal((await activity()).filter((entry) => entry.on === `agent:${id}`).length, 1);
});

test('the same request ID with a different input is refused and changes nothing', async () => {
  const request = { request_id: madeUp('request'), name: 'first-name', level: 'read' };
  assert.equal((await person.call('agent_create', request)).result, 'created');

  const otherName = await person.call('agent_create', { ...request, name: 'second-name' });
  assert.equal(otherName.result, 'request_id_reused');
  const otherLevel = await person.call('agent_create', { ...request, level: 'prepare' });
  assert.equal(otherLevel.result, 'request_id_reused');
  // The same ID on another operation is a different request too.
  const otherOperation = await person.call('agent_set', { request_id: request.request_id, agent: 'abc', on: false });
  assert.equal(otherOperation.result, 'request_id_reused');

  const names = (await agents()).map((agent) => agent.name);
  assert.equal(names.includes('first-name'), true);
  assert.equal(names.includes('second-name'), false);
  const lines = (await activity()).slice(0, 3).map((entry) => [entry.who, entry.operation, entry.result]);
  assert.deepEqual(lines, [
    ['you', 'agent_set', 'request_id_reused'],
    ['you', 'agent_create', 'request_id_reused'],
    ['you', 'agent_create', 'request_id_reused'],
  ]);
});

test('a repeat returns the answer it was first given and does not make the change a second time', async () => {
  const created = await person.call('agent_create', { name: 'stepper', level: 'read' });
  const id = (created.agent as Agent).id;
  const raise = { request_id: madeUp('request'), agent: id, level: 'prepare' };
  const raised = await person.call('agent_set', raise);
  assert.equal((raised.agent as Agent).level, 'prepare');
  assert.equal((await person.call('agent_set', { agent: id, level: 'read' })).result, 'changed');

  // The late repeat of the first change answers as it did, and the agent
  // stays as the later change left it.
  assert.deepEqual(await person.call('agent_set', raise), raised);
  assert.equal((await agents()).find((agent) => agent.id === id)?.level, 'read');
});

test('two copies of one request arriving together make one agent', async () => {
  const request = { request_id: madeUp('request'), name: 'twin', level: 'read' };
  const answers = await Promise.all([person.call('agent_create', request), person.call('agent_create', request), person.call('agent_create', request)]);
  for (const answer of answers) {
    assert.equal(answer.result, 'created');
  }
  assert.equal(answers.filter((answer) => 'token' in answer).length <= 1, true);
  assert.equal(new Set(answers.map((answer) => (answer.agent as Agent).id)).size, 1);
  assert.equal((await agents()).filter((agent) => agent.name === 'twin').length, 1);
  assert.equal((await activity()).filter((entry) => entry.on === `agent:${(answers[0]!.agent as Agent).id}`).length, 1);
});

test('a change without a request ID is refused, and a read refuses one', async () => {
  const { requestFor } = (await import(new URL('../../app/public/app.js', import.meta.url).href)) as {
    requestFor(operation: string, input: unknown): { path: string; init: RequestInit };
  };
  const cookie = person.setCookies.at(-1)!.split(';')[0]!;
  const send = async (operation: string, input: unknown): Promise<string> => {
    const { path, init } = requestFor(operation, input);
    const response = await install.fetch(path, { ...init, headers: { ...(init.headers as Record<string, string>), cookie } });
    return ((await response.json()) as { result: string }).result;
  };
  assert.equal(await send('agent_create', { name: 'no-id', level: 'read' }), 'invalid_input');
  assert.equal(await send('agent_create', { request_id: 'short', name: 'no-id', level: 'read' }), 'invalid_input');
  assert.equal(await send('whoami', { request_id: madeUp('request') }), 'invalid_input');
  assert.equal(await send('sign_out', { request_id: madeUp('request') }), 'invalid_input');
  assert.equal((await agents()).some((agent) => agent.name === 'no-id'), false);
});
