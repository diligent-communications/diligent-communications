import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { ActivityEntry } from '../../../contracts/activity.ts';
import type { Agent } from '../../../contracts/agent.ts';
import { madeUp, startInstall } from '../../host/test/helpers/local-install.ts';
import type { Install } from '../../host/test/helpers/local-install.ts';
import { agentConnection, commandLine, post, screen } from '../../host/test/helpers/ways.ts';
import type { AgentConnection, CommandLine, Screen } from '../../host/test/helpers/ways.ts';

let install: Install;
let onScreen: Screen;
let atCommandLine: CommandLine;
// The agent connection in each form of the agent protocol.
let asAgent: AgentConnection;
let asAgentInNewerForm: AgentConnection;
let agent: Agent;
let token: string;
const password = madeUp('password');

async function activity(): Promise<ActivityEntry[]> {
  const listed = await onScreen.call('activity_list', { limit: 200 });
  return listed.entries as ActivityEntry[];
}

before(async () => {
  install = await startInstall();
  onScreen = screen(install);
  atCommandLine = commandLine(install);
  assert.equal((await onScreen.call('password_set', { code: install.setupCode, password })).result, 'set');
  assert.equal((await onScreen.call('sign_in', { password })).result, 'signed_in');
  assert.equal((await atCommandLine.call('sign_in', { password })).result, 'signed_in');
  const created = await onScreen.call('agent_create', { name: 'reader', level: 'read' });
  assert.equal(created.result, 'created');
  agent = created.agent as Agent;
  token = String(created.token);
  asAgent = await agentConnection(install, token);
  asAgentInNewerForm = await agentConnection(install, token, 'newer');
});

after(async () => {
  await asAgent?.close();
  await asAgentInNewerForm?.close();
  await install?.close();
});

test('the person gets the same answer to a read from the screen and from the command line, and a read leaves no record', async () => {
  const before = await activity();
  const fromScreen = await onScreen.call('whoami');
  const fromCommandLine = await atCommandLine.call('whoami');
  assert.deepEqual(fromScreen, { result: 'you', description: 'The caller is the person, at the level you.', level: 'you' });
  assert.deepEqual(fromCommandLine, fromScreen);

  const listedOnScreen = await onScreen.call('agent_list');
  const listedAtCommandLine = await atCommandLine.call('agent_list');
  assert.equal(listedOnScreen.result, 'listed');
  assert.deepEqual(listedAtCommandLine, listedOnScreen);
  assert.deepEqual(await activity(), before);
});

test('an agent gets the same answer to a read on the agent connection, in either form of the protocol, and on the operation address, and it leaves no record', async () => {
  const before = await activity();
  const onConnection = await asAgent.call('whoami');
  const inNewerForm = await asAgentInNewerForm.call('whoami');
  const onAddress = await post(install, 'whoami', {}, { authorization: `Bearer ${token}` });
  assert.deepEqual(onConnection, {
    result: 'agent',
    description: 'The caller is the agent "reader", at the level read.',
    agent: { id: agent.id, name: 'reader', level: 'read' },
  });
  assert.deepEqual(inNewerForm, onConnection);
  assert.deepEqual(onAddress.answer, onConnection);
  assert.deepEqual(await activity(), before);
});

test('the same change from the screen and from the command line gives the same result and leaves one record each, under the person', async () => {
  const before = (await activity()).length;
  const fromScreen = await onScreen.call('agent_set', { agent: agent.id, level: 'prepare' });
  const fromCommandLine = await atCommandLine.call('agent_set', { agent: agent.id, level: 'prepare' });
  assert.equal(fromScreen.result, 'changed');
  assert.deepEqual(fromCommandLine, fromScreen);

  const added = (await activity()).slice(0, -before || undefined);
  assert.equal(added.length, 2);
  for (const entry of added) {
    assert.deepEqual({ ...entry, at: '' }, { at: '', who: 'you', operation: 'agent_set', on: `agent:${agent.id}`, result: 'changed' });
  }
  await onScreen.call('agent_set', { agent: agent.id, level: 'read' });
});

test("a change that needs the person is refused the same way on the agent connection, in either form of the protocol, and on the operation address, and each refusal leaves one record under the agent's name", async () => {
  const before = (await activity()).length;
  const onConnection = await asAgent.call('agent_set', { agent: agent.id, level: 'prepare' });
  const inNewerForm = await asAgentInNewerForm.call('agent_set', { agent: agent.id, level: 'prepare' });
  const onAddress = await post(install, 'agent_set', { request_id: crypto.randomUUID(), agent: agent.id, level: 'prepare' }, { authorization: `Bearer ${token}` });
  assert.equal(onConnection.result, 'not_allowed');
  assert.deepEqual(inNewerForm, onConnection);
  assert.deepEqual(onAddress.answer, onConnection);

  const added = (await activity()).slice(0, -before || undefined);
  assert.equal(added.length, 3);
  for (const entry of added) {
    assert.deepEqual({ ...entry, at: '' }, { at: '', who: `agent:${agent.id}`, operation: 'agent_set', on: null, result: 'not_allowed' });
  }
  const listed = await onScreen.call('agent_list');
  assert.equal((listed.agents as Agent[])[0]?.level, 'read');
});

test('every operation is offered as a tool on the agent connection, in either form of the protocol', async () => {
  assert.deepEqual(await asAgentInNewerForm.toolNames(), await asAgent.toolNames());
  assert.deepEqual((await asAgent.toolNames()).sort(), [
    'activity_list',
    'agent_create',
    'agent_list',
    'agent_set',
    'brief_list',
    'link_accept_person',
    'link_move_message',
    'link_remove_person',
    'matter_edit',
    'matter_get',
    'matter_search',
    'matter_set_state',
    'password_set',
    'person_get',
    'sign_in',
    'sign_out',
    'whoami',
  ]);
});
