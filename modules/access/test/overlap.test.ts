// Calls that overlap. Each test holds one call at the moment it is about to
// land its writes, lets another call finish first, then lets the held call
// go on. The parts run here in Node against the local runtime's own database,
// so the landing rules are the real ones.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { Agent } from '../../../contracts/agent.ts';
import type { Write } from '../../../contracts/operation.ts';
import type { Caller } from '../../../contracts/who.ts';
import { madeUp, startInstall } from '../../host/test/helpers/local-install.ts';
import type { Install } from '../../host/test/helpers/local-install.ts';
import { openDoor, operationsTables } from '../../operations/src/door.ts';
import type { Door } from '../../operations/src/door.ts';
import { storeTables, storeWork } from '../../store/src/activity.ts';
import { openStore } from '../../store/src/store.ts';
import type { Store } from '../../store/src/store.ts';
import { accessTables, openAccess } from '../src/access.ts';
import type { Access } from '../src/access.ts';
import { WRONG_TRIES } from '../src/limits.ts';

const installs: Install[] = [];

after(async () => {
  await Promise.all(installs.map((install) => install.close()));
});

type Held = { reached: Promise<void>; release(): void };

type Setup = {
  store: Store;
  access: Access;
  // A door that lands at once.
  door: Door;
  // A door whose next landing waits until it is released.
  held: Door;
  hold(): Held;
  code: string;
  rows<Row>(sql: string): Promise<Row[]>;
};

// An empty install, with its parts opened here over its database. `code` is
// the set-up code the parts are given.
async function setUp(): Promise<Setup> {
  const install = await startInstall();
  installs.push(install);
  const store = await openStore((await install.database()) as unknown as D1Database, [storeTables, operationsTables, accessTables]);
  const code = madeUp('setup-code');
  const access = openAccess({ store, setupCode: code });
  const work = { ...access.work, ...storeWork(store) };

  let waiting: { arrive(): void; gate: Promise<void> } | undefined;
  const gated: Store = {
    rows: (sql, ...values) => store.rows(sql, ...values),
    landOne: (write) => store.landOne(write),
    async land(writes: readonly Write[]) {
      const mine = waiting;
      if (mine !== undefined && writes.length > 0) {
        waiting = undefined;
        mine.arrive();
        await mine.gate;
      }
      return store.land(writes);
    },
  };
  return {
    store,
    access,
    code,
    door: openDoor({ store, work }),
    held: openDoor({ store: gated, work }),
    hold() {
      let arrive!: () => void;
      let release!: () => void;
      const reached = new Promise<void>((resolve) => (arrive = resolve));
      const gate = new Promise<void>((resolve) => (release = resolve));
      waiting = { arrive, gate };
      return { reached, release };
    },
    rows: (sql) => store.rows(sql),
  };
}

const nobody: Caller = { kind: 'nobody' };

// Sets the first password and returns the person, signed in by doing so.
async function firstPassword(setup: Setup, password: string): Promise<Caller> {
  const ran = await setup.door.run(nobody, 'password_set', { code: setup.code, password });
  assert.equal(ran.answer.result, 'set');
  assert.ok(ran.session !== undefined && 'begin' in ran.session);
  const { caller } = await setup.access.identify({ session: ran.session.begin, token: null });
  assert.equal(caller.kind, 'you');
  return caller;
}

// A second set-up code, as the person who controls the hosting account would
// put in, and a door that knows it.
function withNewCode(setup: Setup): { door: Door; code: string } {
  const code = madeUp('setup-code');
  const access = openAccess({ store: setup.store, setupCode: code });
  return { code, door: openDoor({ store: setup.store, work: { ...access.work, ...storeWork(setup.store) } }) };
}

test('a sign-in that was checking the old password while a reset landed starts no session', async () => {
  const setup = await setUp();
  const oldPassword = madeUp('password');
  await firstPassword(setup, oldPassword);

  const held = setup.hold();
  const signingIn = setup.held.run(nobody, 'sign_in', { password: oldPassword });
  await held.reached;
  // The old password was right when it was checked. Now the person resets it.
  const reset = withNewCode(setup);
  const newPassword = madeUp('password');
  assert.equal((await reset.door.run(nobody, 'password_set', { code: reset.code, password: newPassword })).answer.result, 'set');
  held.release();

  const ran = await signingIn;
  assert.equal(ran.answer.result, 'wrong_password');
  assert.equal(ran.session, undefined);
  // The only session is the one the reset began.
  assert.equal((await setup.rows('SELECT id FROM access_sessions')).length, 1);
  assert.equal((await setup.door.run(nobody, 'sign_in', { password: newPassword })).answer.result, 'signed_in');
});

test('a sign-in that was checking the old password while it was changed starts no session', async () => {
  const setup = await setUp();
  const oldPassword = madeUp('password');
  const person = await firstPassword(setup, oldPassword);

  const held = setup.hold();
  const signingIn = setup.held.run(nobody, 'sign_in', { password: oldPassword });
  await held.reached;
  const newPassword = madeUp('password');
  assert.equal((await setup.door.run(person, 'password_set', { current: oldPassword, password: newPassword })).answer.result, 'set');
  held.release();

  const ran = await signingIn;
  assert.equal(ran.answer.result, 'wrong_password');
  assert.equal(ran.session, undefined);
  // The change ended every other session, and none was added after it.
  assert.deepEqual(await setup.rows('SELECT id FROM access_sessions'), [{ id: person.kind === 'you' ? person.session : '' }]);
});

test('a password change from a session that was ended while it was in flight writes nothing', async () => {
  const setup = await setUp();
  const first = madeUp('password');
  const borrowed = await firstPassword(setup, first);

  // Someone with a borrowed session and the old password starts a change.
  const held = setup.hold();
  const theirs = madeUp('password');
  const changing = setup.held.run(borrowed, 'password_set', { current: first, password: theirs });
  await held.reached;
  // Meanwhile the person resets the password with a new set-up code, which
  // ends that session.
  const reset = withNewCode(setup);
  const mine = madeUp('password');
  assert.equal((await reset.door.run(nobody, 'password_set', { code: reset.code, password: mine })).answer.result, 'set');
  const sessions = await setup.rows<{ id: string }>('SELECT id FROM access_sessions');
  held.release();

  const ran = await changing;
  assert.equal(ran.answer.result, 'not_signed_in');
  // The person's new password stands, and their session was not ended.
  assert.equal((await setup.door.run(nobody, 'sign_in', { password: theirs })).answer.result, 'wrong_password');
  assert.deepEqual(await setup.rows('SELECT id FROM access_sessions'), sessions);
  assert.equal((await setup.door.run(nobody, 'sign_in', { password: mine })).answer.result, 'signed_in');
});

test('a password change whose session was signed out while it was in flight writes nothing', async () => {
  const setup = await setUp();
  const password = madeUp('password');
  const person = await firstPassword(setup, password);

  const held = setup.hold();
  const changing = setup.held.run(person, 'password_set', { current: password, password: madeUp('password') });
  await held.reached;
  assert.equal((await setup.door.run(person, 'sign_out', {})).answer.result, 'signed_out');
  held.release();

  assert.equal((await changing).answer.result, 'not_signed_in');
  assert.equal((await setup.door.run(nobody, 'sign_in', { password })).answer.result, 'signed_in');
});

test('two password changes at once: one is made, and the other finds its current password is no longer right', async () => {
  const setup = await setUp();
  const password = madeUp('password');
  const person = await firstPassword(setup, password);

  const held = setup.hold();
  const slower = madeUp('password');
  const changing = setup.held.run(person, 'password_set', { current: password, password: slower });
  await held.reached;
  const faster = madeUp('password');
  assert.equal((await setup.door.run(person, 'password_set', { current: password, password: faster })).answer.result, 'set');
  held.release();

  assert.equal((await changing).answer.result, 'wrong_password');
  assert.equal((await setup.door.run(nobody, 'sign_in', { password: slower })).answer.result, 'wrong_password');
  assert.equal((await setup.door.run(nobody, 'sign_in', { password: faster })).answer.result, 'signed_in');
});

test('a level change that overlaps a switch-off never switches the agent back on, and each answers how the agent is', async () => {
  const setup = await setUp();
  const person = await firstPassword(setup, madeUp('password'));
  const created = await setup.door.run(person, 'agent_create', { request_id: madeUp('request'), name: 'overlapped', level: 'read' });
  const id = (created.answer.agent as Agent).id;
  const stored = async (): Promise<unknown> => (await setup.rows('SELECT level, is_on FROM access_agents'))[0];

  // The level change read the agent while it was on, and is held before it lands.
  const held = setup.hold();
  const raising = setup.held.run(person, 'agent_set', { request_id: madeUp('request'), agent: id, level: 'prepare' });
  await held.reached;
  const off = await setup.door.run(person, 'agent_set', { request_id: madeUp('request'), agent: id, on: false });
  assert.equal((off.answer.agent as Agent).on, false);
  held.release();

  const raised = await raising;
  assert.equal(raised.answer.result, 'changed');
  assert.deepEqual({ level: (raised.answer.agent as Agent).level, on: (raised.answer.agent as Agent).on }, { level: 'prepare', on: false });
  assert.deepEqual(await stored(), { level: 'prepare', is_on: 0 });

  // The other way round: a switch-on is held while the level is lowered.
  const heldAgain = setup.hold();
  const switchingOn = setup.held.run(person, 'agent_set', { request_id: madeUp('request'), agent: id, on: true });
  await heldAgain.reached;
  assert.equal((await setup.door.run(person, 'agent_set', { request_id: madeUp('request'), agent: id, level: 'read' })).answer.result, 'changed');
  heldAgain.release();

  const switchedOn = await switchingOn;
  assert.deepEqual({ level: (switchedOn.answer.agent as Agent).level, on: (switchedOn.answer.agent as Agent).on }, { level: 'read', on: true });
  assert.deepEqual(await stored(), { level: 'read', is_on: 1 });
});

test('agent_set writes only the fields it was given', async () => {
  const setup = await setUp();
  const person = await firstPassword(setup, madeUp('password'));
  const created = await setup.door.run(person, 'agent_create', { request_id: madeUp('request'), name: 'narrow', level: 'read' });
  const id = (created.answer.agent as Agent).id;
  const updates = async (input: Record<string, unknown>): Promise<string[]> => {
    const outcome = await setup.access.work.agent_set!({ caller: person, input: { agent: id, ...input }, now: new Date() });
    return (outcome.writes ?? []).map((write) => write.sql).filter((sql) => sql.startsWith('UPDATE'));
  };
  assert.deepEqual(await updates({ level: 'prepare' }), ['UPDATE access_agents SET level = ? WHERE id = ?']);
  assert.deepEqual(await updates({ on: false }), ['UPDATE access_agents SET is_on = ? WHERE id = ?']);
  assert.deepEqual(await updates({ level: 'prepare', on: false }), [
    'UPDATE access_agents SET level = ? WHERE id = ?',
    'UPDATE access_agents SET is_on = ? WHERE id = ?',
  ]);
});

test('a right password that lands late signs in, and does not clear a lock that another try started', async () => {
  const setup = await setUp();
  const password = madeUp('password');
  await firstPassword(setup, password);

  // The right password is counted and checked, then held before it lands.
  const held = setup.hold();
  const signingIn = setup.held.run(nobody, 'sign_in', { password });
  await held.reached;
  // Wrong tries use up the rest of what is allowed, and the last starts a lock.
  for (let tries = 2; tries < WRONG_TRIES; tries += 1) {
    assert.equal((await setup.door.run(nobody, 'sign_in', { password: madeUp('guess') })).answer.result, 'wrong_password');
  }
  const locking = await setup.door.run(nobody, 'sign_in', { password: madeUp('guess') });
  assert.equal(locking.answer.result, 'locked_out');
  const lock = await setup.rows<{ locked_until: string }>("SELECT locked_until FROM access_tries WHERE kind = 'password'");
  assert.equal(lock[0]?.locked_until, locking.answer.until);
  held.release();

  // The held try was let through before the lock, and it was right.
  const ran = await signingIn;
  assert.equal(ran.answer.result, 'signed_in');
  // The lock another try started still stands, unchanged.
  assert.deepEqual(await setup.rows("SELECT locked_until FROM access_tries WHERE kind = 'password'"), lock);
  const next = await setup.door.run(nobody, 'sign_in', { password });
  assert.equal(next.answer.result, 'locked_out');
  assert.equal(next.answer.until, locking.answer.until);
});

test('of many tries sent at once, the password is read and checked for only as many as are allowed', async () => {
  const setup = await setUp();
  await firstPassword(setup, madeUp('password'));
  // The same parts, over a store that counts how often the stored password
  // is read. It is read once for each try that is checked.
  let checked = 0;
  const counting: Store = {
    rows: (sql, ...values) => {
      if (sql.includes('FROM access_password')) {
        checked += 1;
      }
      return setup.store.rows(sql, ...values);
    },
    land: (writes) => setup.store.land(writes),
    landOne: (write) => setup.store.landOne(write),
  };
  const access = openAccess({ store: counting, setupCode: setup.code });
  const door = openDoor({ store: counting, work: { ...access.work, ...storeWork(counting) } });

  const sent = WRONG_TRIES * 4;
  const answers = await Promise.all(Array.from({ length: sent }, () => door.run(nobody, 'sign_in', { password: madeUp('guess') })));
  assert.equal(checked, WRONG_TRIES);
  assert.equal(answers.filter((ran) => ran.answer.result === 'wrong_password').length, WRONG_TRIES - 1);
  assert.equal(answers.filter((ran) => ran.answer.result === 'locked_out').length, sent - WRONG_TRIES + 1);

  // A try made during the lock is not checked either.
  await door.run(nobody, 'sign_in', { password: madeUp('guess') });
  assert.equal(checked, WRONG_TRIES);
});
