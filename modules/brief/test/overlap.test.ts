// Changes that overlap: one change is held just before it lands while
// another lands, then let go. On the local runtime, calls sent at once may
// still run one after another, so holding one is the way to make them overlap
// for certain.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { Link } from '../../../contracts/link.ts';
import type { HistoryLine, Matter } from '../../../contracts/matter.ts';
import type { Write } from '../../../contracts/operation.ts';
import type { Caller } from '../../../contracts/who.ts';
import { openAccess } from '../../access/src/access.ts';
import { PART_TABLES, partsWork } from '../../host/src/parts.ts';
import { madeUp, startInstall } from '../../host/test/helpers/local-install.ts';
import type { Install } from '../../host/test/helpers/local-install.ts';
import { openDoor } from '../../operations/src/door.ts';
import type { Door } from '../../operations/src/door.ts';
import { openStore } from '../../store/src/store.ts';
import type { Store } from '../../store/src/store.ts';
import { loadMadeUpBrief } from './helpers/made-up.ts';
import type { MadeUpBrief } from './helpers/made-up.ts';

const installs: Install[] = [];

after(async () => {
  await Promise.all(installs.map((install) => install.close()));
});

const you: Caller = { kind: 'you', session: 'ab12' };

type Setup = {
  brief: MadeUpBrief;
  // A door that lands at once.
  door: Door;
  // A door whose next landing waits until it is released.
  held: Door;
  hold(): { reached: Promise<void>; release(): void };
  store: Store;
};

// An install with the made-up Brief, and its parts opened here over its database.
async function setUp(): Promise<Setup> {
  const install = await startInstall();
  installs.push(install);
  const database = await install.database();
  const store = await openStore(database as unknown as D1Database, PART_TABLES);
  const work = partsWork(store, openAccess({ store, setupCode: madeUp('setup-code') }));
  const brief = await loadMadeUpBrief(database, 'diligent');

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
    brief,
    store,
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
  };
}

function id(): string {
  return crypto.randomUUID();
}

async function matter(setup: Setup, matterId: string): Promise<{ matter: Matter; history: HistoryLine[] }> {
  const ran = await setup.door.run(you, 'matter_get', { matter: matterId });
  return ran.answer as never;
}

test('a state change read before another change landed is made on the matter as it is now, and never lost', async () => {
  const setup = await setUp();
  const target = setup.brief.matters.water!;
  const before = await matter(setup, target);

  const held = setup.hold();
  const marking = setup.held.run(you, 'matter_set_state', { request_id: id(), matter: target, to: 'done' });
  await held.reached;
  assert.equal((await setup.door.run(you, 'matter_set_state', { request_id: id(), matter: target, to: 'waiting' })).answer.result, 'changed');
  held.release();

  assert.equal((await marking).answer.result, 'changed');
  const after = await matter(setup, target);
  assert.equal(after.matter.state, 'done');
  assert.equal(after.matter.version, before.matter.version + 2);
  // Each landed once. A change keeps the time its call began, so the one that
  // waited may be dated before the one that landed first.
  assert.deepEqual(
    after.history.slice(0, 2).map((line) => line.what).sort(),
    ['Marked done.', 'Marked waiting.'],
  );
  assert.equal(after.history.filter((line) => line.what === 'Marked done.').length, 1);
});

test('an edit read before another edit landed answers changed_since and writes nothing', async () => {
  const setup = await setUp();
  const target = setup.brief.matters.lumber!;
  const before = await matter(setup, target);

  const held = setup.hold();
  const editing = setup.held.run(you, 'matter_edit', { request_id: id(), matter: target, version: before.matter.version, title: 'A title written over' });
  await held.reached;
  assert.equal((await setup.door.run(you, 'matter_edit', { request_id: id(), matter: target, version: before.matter.version, notes: 'First.' })).answer.result, 'changed');
  held.release();

  assert.equal((await editing).answer.result, 'changed_since');
  const after = await matter(setup, target);
  assert.equal(after.matter.title, before.matter.title);
  assert.equal(after.matter.version, before.matter.version + 1);
  assert.equal(after.history.filter((line) => line.what.startsWith('The title')).length, 0);
});

test('an accept read before the person was removed answers changed_since, and the person stays removed', async () => {
  const setup = await setUp();
  const [link] = setup.brief.personLinks.deposit!;

  const held = setup.hold();
  const accepting = setup.held.run(you, 'link_accept_person', { request_id: id(), link });
  await held.reached;
  assert.equal((await setup.door.run(you, 'link_remove_person', { request_id: id(), link })).answer.result, 'removed');
  held.release();

  assert.equal((await accepting).answer.result, 'changed_since');
  const [row] = await setup.store.rows<Link>('SELECT * FROM links WHERE id = ?', link!);
  assert.equal(row!.state, 'removed');
  assert.equal(row!.accepted_by, null);
});

test('a move read before the same message was moved elsewhere answers changed_since, and the message is in force once', async () => {
  const setup = await setUp();
  const [link] = setup.brief.messages.pickup!;

  const held = setup.hold();
  const moving = setup.held.run(you, 'link_move_message', { request_id: id(), link, to: setup.brief.matters.lumber });
  await held.reached;
  assert.equal((await setup.door.run(you, 'link_move_message', { request_id: id(), link, to: setup.brief.matters.water })).answer.result, 'moved');
  held.release();

  assert.equal((await moving).answer.result, 'changed_since');
  const [old] = await setup.store.rows<Link>('SELECT * FROM links WHERE id = ?', link!);
  const inForce = await setup.store.rows<Link>("SELECT * FROM links WHERE message = ? AND state <> 'removed'", old!.message!);
  assert.deepEqual(inForce.map((row) => row.matter), [setup.brief.matters.water]);
});
