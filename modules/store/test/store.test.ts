import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { ActivityEntry } from '../../../contracts/activity.ts';
import { madeUp, startInstall } from '../../host/test/helpers/local-install.ts';
import type { Install } from '../../host/test/helpers/local-install.ts';
import { screen } from '../../host/test/helpers/ways.ts';
import { activityWrite, activityWrites, storeTables } from '../src/activity.ts';
import { ACTIVITY_LIMIT } from '../src/operations.ts';
import { openStore, stillTrue } from '../src/store.ts';
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

test('one write landed by itself returns the rows it names, and counts whole when many arrive together', async () => {
  const tables: Tables = { part: 'counts', steps: ['CREATE TABLE counts_rows (name TEXT PRIMARY KEY, n INTEGER NOT NULL) STRICT'] };
  const store = await openStore(database, [tables]);
  // Let through only while the count is under three, and say what it became.
  const count = { sql: "INSERT INTO counts_rows (name, n) VALUES ('tries', 1) ON CONFLICT (name) DO UPDATE SET n = n + 1 WHERE n < 3 RETURNING n", values: [] };
  const answers = await Promise.all(Array.from({ length: 12 }, () => store.landOne<{ n: number }>(count)));
  const through = answers.filter((rows) => rows.length === 1).map((rows) => rows[0]!.n).sort();
  assert.deepEqual(through, [1, 2, 3]);
  assert.equal(answers.filter((rows) => rows.length === 0).length, 9);
  assert.deepEqual(await store.rows('SELECT n FROM counts_rows'), [{ n: 3 }]);
});

test('writes that rest on something read earlier land only while it is still true', async () => {
  const tables: Tables = { part: 'guarded', steps: ['CREATE TABLE guarded_rows (id TEXT PRIMARY KEY, state TEXT NOT NULL) STRICT'] };
  const store = await openStore(database, [storeTables, tables]);
  assert.equal(await store.land([{ sql: "INSERT INTO guarded_rows (id, state) VALUES ('one', 'read')", values: [] }]), 'landed');
  const asRead = stillTrue('SELECT 1 FROM guarded_rows WHERE id = ? AND state = ?', ['one', 'read']);
  const change = { sql: "UPDATE guarded_rows SET state = 'changed by me' WHERE id = 'one'", values: [] };

  // Still as it was read: the writes land.
  assert.equal(await store.land([asRead, change]), 'landed');
  assert.deepEqual(await store.rows('SELECT state FROM guarded_rows'), [{ state: 'changed by me' }]);

  // No longer as it was read: nothing lands, wherever the guard sits.
  const other = { sql: "UPDATE guarded_rows SET state = 'written over' WHERE id = 'one'", values: [] };
  assert.equal(await store.land([asRead, other]), 'clash');
  assert.equal(await store.land([other, asRead]), 'clash');
  assert.deepEqual(await store.rows('SELECT state FROM guarded_rows'), [{ state: 'changed by me' }]);
  // The guard itself never keeps a row.
  assert.deepEqual(await store.rows('SELECT held FROM store_guard'), []);
});

test('many activity lines are written in few statements, each line exactly an activity line', async () => {
  const line = (n: number): ActivityEntry => ({ at: '2026-01-02T03:04:05.006Z', who: 'agent:4f2a', operation: 'agent_set', on: null, result: n % 2 === 0 ? 'switched_off' : 'not_allowed' });
  assert.deepEqual(activityWrites([]), []);
  assert.equal(activityWrites([line(1)]).length, 1);
  const hundred = activityWrites(Array.from({ length: 100 }, (_, n) => line(n)));
  assert.equal(hundred.length, 5);
  for (const write of hundred) {
    // No statement carries more values than the database takes in one.
    assert.ok(write.values.length <= 100);
  }
  assert.throws(() => activityWrites([line(1), { ...line(2), note: 'the words of a message' } as ActivityEntry]), TypeError);

  // They land, all of them, in order.
  const own = await startInstall();
  try {
    const store = await openStore((await own.database()) as unknown as D1Database, [storeTables]);
    assert.equal(await store.land(hundred), 'landed');
    const kept = await store.rows<{ result: string }>('SELECT result FROM activity ORDER BY id');
    assert.equal(kept.length, 100);
    assert.deepEqual(kept.slice(0, 3).map((row) => row.result), ['switched_off', 'not_allowed', 'switched_off']);
  } finally {
    await own.close();
  }
});
