import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ANY_OPERATION_RESULTS, isOperation } from '../../../contracts/operation.ts';
import type { Work, Write } from '../../../contracts/operation.ts';
import type { Caller } from '../../../contracts/who.ts';
import type { Store } from '../../store/src/store.ts';
import { openDoor } from '../src/door.ts';
import { operationList } from '../src/list.ts';

// A stand-in store that keeps what it was asked to land. The door's own rules
// are checked here. The real database is behind the tests that start an install.
function standIn(landing: 'landed' | 'clash' = 'landed'): Store & { landed: Write[][] } {
  const landed: Write[][] = [];
  return {
    landed,
    async rows() {
      return [];
    },
    async land(writes) {
      // Like the real store, landing nothing does nothing.
      if (writes.length > 0) {
        landed.push([...writes]);
      }
      return landing;
    },
    async landOne() {
      return [];
    },
  };
}

function workFor(overrides: Record<string, Work> = {}): Record<string, Work> {
  const work: Record<string, Work> = {};
  for (const operation of operationList) {
    const result = Object.keys(operation.results)[0]!;
    work[operation.name] = async () => ({ answer: { result, description: 'A stand-in answer.' } });
  }
  return { ...work, ...overrides };
}

const you: Caller = { kind: 'you', session: 'ab12' };

test('the operations list is well formed: unique lowercase names, and the eight operations of this slice', () => {
  for (const operation of operationList) {
    assert.equal(isOperation(operation), true, operation.name);
  }
  assert.deepEqual(operationList.map((operation) => `${operation.part}.${operation.name}`).sort(), [
    'access.agent_create',
    'access.agent_list',
    'access.agent_set',
    'access.password_set',
    'access.sign_in',
    'access.sign_out',
    'access.whoami',
    'store.activity_list',
  ]);
  assert.equal(new Set(operationList.map((operation) => operation.name)).size, operationList.length);
});

test('the levels, request IDs and named results are the ones the operations table gives', () => {
  const table = Object.fromEntries(
    operationList.map((operation) => [operation.name, [operation.level, operation.request_id, Object.keys(operation.results).sort().join(' ')]]),
  );
  assert.deepEqual(table, {
    password_set: ['none', false, 'locked_out not_allowed set wrong_code wrong_password'],
    sign_in: ['none', false, 'locked_out signed_in wrong_password'],
    sign_out: ['you', false, 'signed_out'],
    whoami: ['read', false, 'agent you'],
    agent_create: ['you', true, 'created name_taken'],
    agent_list: ['you', false, 'listed'],
    agent_set: ['you', true, 'changed unknown_agent'],
    activity_list: ['you', false, 'listed'],
  });
  // The three sign-in operations take no request ID, so no answer of theirs is kept.
  for (const name of ['sign_in', 'sign_out', 'password_set']) {
    assert.equal(operationList.find((operation) => operation.name === name)?.request_id, false);
  }
});

test('the door opens only when every listed operation has its work and no work is unlisted', () => {
  const store = standIn();
  const { whoami: _whoami, ...missing } = workFor();
  assert.throws(() => openDoor({ store, work: missing }), /whoami is listed but no part does its work/);
  assert.throws(() => openDoor({ store, work: workFor({ extra_thing: async () => ({ answer: { result: 'x', description: 'x' } }) }) }), /extra_thing is not in the operations list/);
});

test('an answer that is not one of the named results is never returned or recorded', async () => {
  const store = standIn();
  const door = openDoor({
    store,
    work: workFor({ agent_set: async () => ({ answer: { result: 'made_up_result', description: 'Not in the list.' } }) }),
  });
  await assert.rejects(door.run(you, 'agent_set', { request_id: 'request-0001', agent: 'abc', on: true }), /not one of its named results/);
  assert.deepEqual(store.landed, []);
});

test('an unknown operation is refused without running anything', async () => {
  const store = standIn();
  const door = openDoor({ store, work: workFor() });
  const ran = await door.run(you, 'no_such_operation', {});
  assert.equal(ran.answer.result, 'invalid_input');
  assert.deepEqual(store.landed, []);
});

test('a refusal says what was found and never repeats what was sent', async () => {
  const door = openDoor({ store: standIn(), work: workFor() });
  const sent = 'a value that might be a secret';
  const ran = await door.run(you, 'agent_create', { request_id: 'request-0001', name: sent.repeat(4), level: sent });
  assert.equal(ran.answer.result, 'invalid_input');
  assert.equal(JSON.stringify(ran).includes(sent), false);
  assert.ok(ran.answer.description.startsWith(ANY_OPERATION_RESULTS.invalid_input));
});

test('when the writes keep clashing the door answers unavailable, and the caller gets no session', async () => {
  const store = standIn('clash');
  const door = openDoor({
    store,
    work: workFor({
      sign_in: async () => ({
        answer: { result: 'signed_in', description: 'A stand-in answer.' },
        session: { begin: 'never-handed-out' },
        writes: [{ sql: 'INSERT', values: [] }],
      }),
    }),
  });
  const ran = await door.run({ kind: 'nobody' }, 'sign_in', { password: 'anything' });
  assert.deepEqual(ran, { answer: { result: 'unavailable', description: ANY_OPERATION_RESULTS.unavailable } });
  assert.equal(store.landed.length, 2);
});

test('the door writes the record in the same landing as the change, and none for a read', async () => {
  const store = standIn();
  const at = new Date('2026-01-02T03:04:05.006Z');
  const door = openDoor({
    store,
    now: () => at,
    work: workFor({
      agent_set: async () => ({
        answer: { result: 'changed', description: 'A stand-in answer.' },
        on: 'agent:abc',
        writes: [{ sql: 'UPDATE things', values: [1] }],
      }),
    }),
  });
  await door.run(you, 'agent_set', { request_id: 'request-0001', agent: 'abc', on: true });
  assert.equal(store.landed.length, 1);
  const [change, record, kept] = store.landed[0]!;
  assert.equal(change?.sql, 'UPDATE things');
  assert.deepEqual(record?.values, [at.toISOString(), 'you', 'agent_set', 'agent:abc', 'changed']);
  assert.ok(kept?.sql.startsWith('INSERT INTO operations_requests'));

  await door.run(you, 'whoami', {});
  assert.equal(store.landed.length, 1);
});

test('a switched-off agent is refused several calls in one landing: one line for each that would change something', async () => {
  const store = standIn();
  const at = new Date('2026-01-02T03:04:05.006Z');
  const door = openDoor({ store, now: () => at, work: workFor() });
  const off: Caller = { kind: 'agent', id: '4f2a', name: 'sleeper', level: 'prepare', on: false };
  const seen = [{ sql: 'UPDATE seen', values: [] }];

  const answer = await door.refuseSwitchedOff(off, ['agent_set', 'whoami', 'no_such_operation', 'sign_out', 'agent_set'], seen);
  assert.deepEqual(answer, { result: 'switched_off', description: 'The caller\'s agent sign-in is switched off. The agent "sleeper" is switched off.' });
  // One landing, holding the three lines and the note that the agent was seen.
  assert.equal(store.landed.length, 1);
  const [lines, noted] = store.landed[0]!;
  assert.ok(lines!.sql.startsWith('INSERT INTO activity'));
  const line = (operation: string): unknown[] => [at.toISOString(), 'agent:4f2a', operation, null, 'switched_off'];
  assert.deepEqual(lines!.values, [...line('agent_set'), ...line('sign_out'), ...line('agent_set')]);
  assert.equal(noted!.sql, 'UPDATE seen');

  // The same answer and the same line as the door gives for one such call.
  const single = standIn();
  const ran = await openDoor({ store: single, now: () => at, work: workFor() }).run(off, 'agent_set', {});
  assert.deepEqual(ran.answer, answer);
  assert.deepEqual(single.landed[0]![0]!.values, line('agent_set'));

  // Nothing that would change something leaves no line.
  const quiet = standIn();
  await openDoor({ store: quiet, work: workFor() }).refuseSwitchedOff(off, ['whoami', 'agent_list']);
  assert.deepEqual(quiet.landed, []);

  // It is only for an agent that is switched off.
  await assert.rejects(door.refuseSwitchedOff({ ...off, on: true }, ['agent_set']));
  await assert.rejects(door.refuseSwitchedOff(you, ['agent_set']));
  await assert.rejects(door.refuseSwitchedOff({ kind: 'nobody' }, ['agent_set']));
});
