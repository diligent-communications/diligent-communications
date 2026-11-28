import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { ActivityEntry } from '../../../contracts/activity.ts';
import { madeUp, startInstall } from '../../host/test/helpers/local-install.ts';
import type { Install } from '../../host/test/helpers/local-install.ts';
import { screen } from '../../host/test/helpers/ways.ts';
import { activityWrite, storeTables } from '../src/activity.ts';
import { ACTIVITY_LIMIT } from '../src/operations.ts';
import { openStore } from '../src/store.ts';
import type { Tables } from '../src/store.ts';

let install: Install;
// The local runtime's own database, reached from the test.
let database: D1Database;

before(async () => {
  install = await startInstall();
  database = (await install.database()) as unknown as D1Database;
});

after(async () => {
  await install?.close();
});

test('each table step is applied once, in order, and a later step is applied on the next open', async () => {
  const first: Tables = { part: 'sample', steps: ['CREATE TABLE sample_things (id TEXT PRIMARY KEY, name TEXT NOT NULL) STRICT'] };
  const store = await openStore(database, [first]);
  assert.equal(await store.land([{ sql: 'INSERT INTO sample_things (id, name) VALUES (?, ?)', values: ['one', 'first'] }]), 'landed');

  // Opening again does not run the step again, so the row is still there.
  const again = await openStore(database, [first]);
  assert.deepEqual(await again.rows('SELECT id, name FROM sample_things'), [{ id: 'one', name: 'first' }]);

  const second: Tables = { part: 'sample', steps: [...first.steps, 'ALTER TABLE sample_things ADD COLUMN colour TEXT'] };
  const later = await openStore(database, [second]);
  assert.deepEqual(await later.rows('SELECT id, name, colour FROM sample_things'), [{ id: 'one', name: 'first', colour: null }]);

  const applied = await later.rows<{ part: string; step: number }>("SELECT part, step FROM store_upgrades WHERE part = 'sample' ORDER BY step");
  assert.deepEqual(applied, [
    { part: 'sample', step: 1 },
    { part: 'sample', step: 2 },
  ]);

  // Two openings at once apply a new step once between them.
  const third: Tables = { part: 'sample', steps: [...second.steps, 'CREATE TABLE sample_more (id TEXT PRIMARY KEY) STRICT'] };
  await Promise.all([openStore(database, [third]), openStore(database, [third]), openStore(database, [third])]);
  assert.equal((await later.rows("SELECT step FROM store_upgrades WHERE part = 'sample'")).length, 3);
});

test('a step that cannot be applied stops the open and is not recorded', async () => {
  const broken: Tables = { part: 'broken', steps: ['CREATE TABLE broken_one (id TEXT) STRICT', 'THIS IS NOT SQL'] };
  await assert.rejects(openStore(database, [broken]));
  const store = await openStore(database, []);
  assert.deepEqual(await store.rows("SELECT step FROM store_upgrades WHERE part = 'broken'"), [{ step: 1 }]);
});

test("one operation's writes land together or not at all", async () => {
  const tables: Tables = { part: 'pairs', steps: ['CREATE TABLE pairs_rows (id TEXT PRIMARY KEY) STRICT'] };
  const store = await openStore(database, [tables]);
  assert.equal(await store.land([{ sql: 'INSERT INTO pairs_rows (id) VALUES (?)', values: ['kept'] }]), 'landed');

  // The second write breaks a uniqueness rule, so the first is not kept either.
  const clash = await store.land([
    { sql: 'INSERT INTO pairs_rows (id) VALUES (?)', values: ['new'] },
    { sql: 'INSERT INTO pairs_rows (id) VALUES (?)', values: ['kept'] },
  ]);
  assert.equal(clash, 'clash');
  assert.deepEqual(await store.rows('SELECT id FROM pairs_rows ORDER BY id'), [{ id: 'kept' }]);

  // A write that fails for any other reason is an error, and lands nothing.
  await assert.rejects(
    store.land([
      { sql: 'INSERT INTO pairs_rows (id) VALUES (?)', values: ['other'] },
      { sql: 'INSERT INTO no_such_table (id) VALUES (?)', values: ['x'] },
    ]),
  );
  assert.deepEqual(await store.rows('SELECT id FROM pairs_rows ORDER BY id'), [{ id: 'kept' }]);
  assert.equal(await store.land([]), 'landed');
});

test('an activity line is written only when it is exactly an activity line', async () => {
  const entry: ActivityEntry = { at: '2026-01-02T03:04:05.006Z', who: 'you', operation: 'agent_set', on: 'agent:4f2a', result: 'changed' };
  assert.deepEqual(activityWrite(entry).values, [entry.at, 'you', 'agent_set', 'agent:4f2a', 'changed']);
  const refused: unknown[] = [
    { ...entry, note: 'the words of a message' },
    { ...entry, on: 'the words of a message' },
    { ...entry, result: 'A sentence, not a name.' },
    { ...entry, who: 'somebody' },
  ];
  for (const line of refused) {
    assert.throws(() => activityWrite(line as ActivityEntry), TypeError);
  }
  // The table has a column for each field and no other.
  const store = await openStore(database, [storeTables]);
  const columns = await store.rows<{ name: string }>("SELECT name FROM pragma_table_info('activity')");
  assert.deepEqual(columns.map((column) => column.name), ['id', 'at', 'who', 'operation', 'on_what', 'result']);
});

test('activity_list returns the newest lines first, as many as asked for', async () => {
  const person = screen(install);
  const password = madeUp('password');
  assert.equal((await person.call('password_set', { code: install.setupCode, password })).result, 'set');
  assert.equal((await person.call('sign_in', { password })).result, 'signed_in');
  for (const name of ['one', 'two', 'three']) {
    assert.equal((await person.call('agent_create', { name, level: 'read' })).result, 'created');
  }

  const all = await person.call('activity_list');
  const entries = all.entries as ActivityEntry[];
  assert.equal(all.result, 'listed');
  assert.deepEqual(entries.map((entry) => [entry.who, entry.operation, entry.result]), [
    ['you', 'agent_create', 'created'],
    ['you', 'agent_create', 'created'],
    ['you', 'agent_create', 'created'],
    ['you', 'sign_in', 'signed_in'],
    ['you', 'password_set', 'set'],
  ]);
  for (const entry of entries) {
    assert.deepEqual(Object.keys(entry).sort(), ['at', 'on', 'operation', 'result', 'who']);
  }
  assert.ok(entries[0]!.at >= entries[4]!.at);

  const two = (await person.call('activity_list', { limit: 2 })).entries as ActivityEntry[];
  assert.deepEqual(two, entries.slice(0, 2));
  assert.equal((await person.call('activity_list', { limit: 0 })).result, 'invalid_input');
  assert.equal((await person.call('activity_list', { limit: ACTIVITY_LIMIT.most + 1 })).result, 'invalid_input');
  // Reading the record is itself a read: it added no line.
  assert.equal(((await person.call('activity_list')).entries as ActivityEntry[]).length, 5);
});
