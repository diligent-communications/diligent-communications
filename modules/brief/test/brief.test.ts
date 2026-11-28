import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { HistoryLine, Matter } from '../../../contracts/matter.ts';
import { isMatter } from '../../../contracts/matter.ts';
import { startBriefInstall } from './helpers/brief-install.ts';
import type { BriefInstall } from './helpers/brief-install.ts';
import { MATTERS } from './helpers/made-up.ts';

let it: BriefInstall;

type Group = { kind: string; count: number; matters: Matter[] };

before(async () => {
  it = await startBriefInstall();
});

after(async () => {
  await it?.close();
});

function titles(answer: Record<string, unknown>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const group of answer.groups as Group[]) {
    out[group.kind] = group.matters.map((matter) => matter.title);
    assert.equal(group.count, group.matters.length);
  }
  return out;
}

async function getMatter(label: string): Promise<{ matter: Matter; history: HistoryLine[] } & Record<string, unknown>> {
  const got = await it.onScreen.call('matter_get', { matter: it.brief.matters[label] });
  assert.equal(got.result, 'matter');
  return got as never;
}

function made(label: string): (typeof MATTERS)[number] {
  return MATTERS.find((matter) => matter.label === label)!;
}

test('the Brief is grouped by kind, money, do, reply, each with its count, longest waiting first, and shows only what needs the person', async () => {
  const listed = await it.onScreen.call('brief_list');
  assert.equal(listed.result, 'brief');
  assert.deepEqual(
    (listed.groups as Group[]).map((group) => group.kind),
    ['money', 'do', 'reply'],
  );
  assert.deepEqual(titles(listed), {
    // Open matters only, the one that has waited longest first: no waiting,
    // snoozed, done or dismissed one.
    money: ['Pellworth Lumber invoice 2093', 'Water bill for November', 'Deposit for the Halvik porch'],
    do: ['Renew the trailer registration', 'Order sealant for the Marrow deck'],
    reply: ['School pickup change next week', 'Inspector asks: Tuesday or Wednesday?'],
  });
  for (const group of listed.groups as Group[]) {
    for (const matter of group.matters) {
      assert.equal(isMatter(matter), true);
    }
  }
  assert.deepEqual(listed.counts, { brief: 7, waiting: 2 });
  assert.deepEqual(listed.lanes, ['home', 'work']);
});

test('the lane is a filter, and the Waiting filter shows the matters marked waiting', async () => {
  const home = await it.onScreen.call('brief_list', { lane: 'home' });
  assert.deepEqual(titles(home), {
    money: ['Water bill for November'],
    do: ['Renew the trailer registration'],
    reply: ['School pickup change next week'],
  });
  assert.deepEqual(home.counts, { brief: 3, waiting: 0 });
  // The filter narrows the Brief. It does not change the lanes there are to pick from.
  assert.deepEqual(home.lanes, ['home', 'work']);

  const waiting = await it.onScreen.call('brief_list', { show: 'waiting' });
  assert.deepEqual(titles(waiting), { money: ['Refund for the returned tile saw'], do: [], reply: ['Quote for the shower glass'] });
  const waitingAtWork = await it.onScreen.call('brief_list', { show: 'waiting', lane: 'work' });
  assert.deepEqual(waitingAtWork.groups, waiting.groups);
  const waitingAtHome = await it.onScreen.call('brief_list', { show: 'waiting', lane: 'home' });
  assert.deepEqual(titles(waitingAtHome), { money: [], do: [], reply: [] });

  const notALane = await it.onScreen.call('brief_list', { lane: 'Not A Lane' });
  assert.equal(notALane.result, 'invalid_input');
});

test('each read gives the same answer from the screen, the command line and an agent at either level, and leaves no record', async () => {
  const before = await it.activity();
  const reads: [string, Record<string, unknown>][] = [
    ['brief_list', {}],
    ['brief_list', { show: 'waiting', lane: 'work' }],
    ['matter_get', { matter: it.brief.matters.inspection }],
    ['matter_search', { words: 'invoice' }],
  ];
  for (const [operation, input] of reads) {
    const fromScreen = await it.onScreen.call(operation, input);
    assert.deepEqual(await it.atCommandLine.call(operation, input), fromScreen, operation);
    assert.deepEqual(await it.reader.call(operation, input), fromScreen, operation);
    assert.deepEqual(await it.preparer.call(operation, input), fromScreen, operation);
  }
  assert.deepEqual(await it.activity(), before);
});

test("a matter's page has its summary, latest update, the people on it, the messages behind it and its dated history", async () => {
  const got = await getMatter('inspection');
  assert.equal(got.matter.summary, made('inspection').summary);
  assert.equal(got.matter.latest_update, made('inspection').latest_update);
  const messages = got.messages as { link: string; quote: string; sender: string; sent_at: string }[];
  assert.deepEqual(
    messages.map((message) => [message.sender, message.quote]),
    // Newest first.
    [...made('inspection').messages].sort((a, b) => a.hoursAgo - b.hoursAgo).map((message) => [message.sender, message.quote]),
  );
  for (const message of messages) {
    assert.match(message.sent_at, /^\d{4}-\d{2}-\d{2}T/);
  }
  const people = got.people as { link: string; person: string; state: string }[];
  assert.deepEqual(
    people.map((person) => [person.person, person.state]),
    [
      [it.brief.people.inspector, 'proposed'],
      [it.brief.people.okafor, 'proposed'],
    ],
  );
  assert.deepEqual(got.history.at(-1), { at: got.history.at(-1)!.at, who: `agent:${it.preparerAgent.id}`, what: 'This matter was made.' });
  assert.equal(got.history.some((line) => line.what === 'A person was proposed for this matter.'), true);

  const unknown = await it.onScreen.call('matter_get', { matter: 'nosuchmatter' });
  assert.equal(unknown.result, 'unknown_matter');
});

test('search finds matters in any state, done and dismissed included, and treats pattern characters as plain text', async () => {
  const found = await it.onScreen.call('matter_search', { words: 'permit' });
  assert.equal(found.result, 'found');
  assert.deepEqual(
    (found.matters as Matter[]).map((matter) => [matter.title, matter.state]),
    [['Permit fee for the Okafor addition', 'done']],
  );
  const dismissed = await it.onScreen.call('matter_search', { words: 'survey' });
  assert.deepEqual((dismissed.matters as Matter[]).map((matter) => matter.state), ['dismissed']);
  // Matched without regard to case, in the summary as well as the title.
  const inSummary = await it.onScreen.call('matter_search', { words: 'CEDAR DECKING' });
  assert.deepEqual((inSummary.matters as Matter[]).map((matter) => matter.title), ['Pellworth Lumber invoice 2093']);
  // `%` and `_` would match anything if they were read as a pattern.
  for (const words of ['%', '_', '\\']) {
    const none = await it.onScreen.call('matter_search', { words });
    assert.deepEqual(none.matters, [], words);
  }
});

test('a snoozed matter leaves the Brief until its time and then returns', async () => {
  const id = it.brief.matters.pickup!;
  const until = new Date(Date.now() + 2 * 86_400_000).toISOString();
  const snoozed = await it.onScreen.call('matter_set_state', { matter: id, to: 'snoozed', until });
  assert.equal(snoozed.result, 'changed');
  assert.equal(titles(await it.onScreen.call('brief_list')).reply!.includes('School pickup change next week'), false);

  // Its time comes: the stored time is moved into the past.
  const database = await it.install.database();
  await database.prepare('UPDATE brief_matters SET snoozed_until = ? WHERE id = ?').bind(new Date(Date.now() - 1000).toISOString(), id).run();
  assert.equal(titles(await it.onScreen.call('brief_list')).reply!.includes('School pickup change next week'), true);
  // It is still marked snoozed until the person changes it.
  assert.equal((await getMatter('pickup')).matter.state, 'snoozed');

  const back = await it.onScreen.call('matter_set_state', { matter: id, to: 'open' });
  assert.equal(back.result, 'changed');
  assert.equal((back.matter as Matter).snoozed_until, null);
});

test('a snooze needs a time still to come, and only a snooze takes one', async () => {
  const id = it.brief.matters.water!;
  for (const input of [
    { matter: id, to: 'snoozed' },
    { matter: id, to: 'snoozed', until: new Date(Date.now() - 60_000).toISOString() },
    { matter: id, to: 'snoozed', until: 'tomorrow' },
    { matter: id, to: 'done', until: new Date(Date.now() + 60_000).toISOString() },
  ]) {
    assert.equal((await it.onScreen.call('matter_set_state', input)).result, 'invalid_input', JSON.stringify(input));
  }
  assert.equal((await getMatter('water')).matter.state, 'open');
});

test('done, waiting, snooze, dismiss and reopen each work and add a history line; the state a matter already has answers already_so and adds none; the ID never changes', async () => {
  const id = it.brief.matters.registration!;
  const until = new Date(Date.now() + 86_400_000).toISOString();
  const steps: [Record<string, unknown>, string][] = [
    [{ to: 'done' }, 'Marked done.'],
    [{ to: 'open' }, 'Reopened.'],
    [{ to: 'waiting' }, 'Marked waiting.'],
    [{ to: 'snoozed', until }, `Snoozed until ${until.slice(0, 16).replace('T', ' ')} UTC.`],
    [{ to: 'dismissed' }, 'Dismissed.'],
    [{ to: 'open' }, 'Reopened.'],
  ];
  let version = (await getMatter('registration')).matter.version;
  for (const [input, line] of steps) {
    const changed = await it.onScreen.call('matter_set_state', { matter: id, ...input });
    assert.equal(changed.result, 'changed', JSON.stringify(input));
    const matter = changed.matter as Matter;
    assert.equal(matter.id, id);
    assert.equal(matter.state, input.to);
    assert.equal(matter.version, version + 1);
    version = matter.version;
    const got = await getMatter('registration');
    assert.deepEqual(got.matter, matter);
    assert.deepEqual({ ...got.history[0], at: '' }, { at: '', who: 'you', what: line });

    const linesBefore = got.history.length;
    const again = await it.onScreen.call('matter_set_state', { matter: id, ...input });
    assert.equal(again.result, 'already_so', JSON.stringify(input));
    const unchanged = await getMatter('registration');
    assert.equal(unchanged.history.length, linesBefore);
    assert.equal(unchanged.matter.version, version);
  }
  // Waiting from the Brief, and back.
  assert.equal((await it.onScreen.call('matter_set_state', { matter: id, to: 'waiting' })).result, 'changed');
  assert.equal((await it.onScreen.call('matter_set_state', { matter: id, to: 'open' })).result, 'changed');
  assert.equal((await getMatter('registration')).history[0]!.what, 'Back on the Brief.');

  assert.equal((await it.onScreen.call('matter_set_state', { matter: 'nosuchmatter', to: 'done' })).result, 'unknown_matter');
});

test('a done or a dismissed matter leaves the Brief and is still found by search', async () => {
  const id = it.brief.matters.lumber!;
  assert.equal((await it.atCommandLine.call('matter_set_state', { matter: id, to: 'done' })).result, 'changed');
  assert.equal(titles(await it.onScreen.call('brief_list')).money!.includes('Pellworth Lumber invoice 2093'), false);
  const found = await it.onScreen.call('matter_search', { words: 'Pellworth' });
  assert.deepEqual((found.matters as Matter[]).map((matter) => [matter.id, matter.state]), [[id, 'done']]);
  // One tap reopens it.
  assert.equal((await it.onScreen.call('matter_set_state', { matter: id, to: 'open' })).result, 'changed');
  assert.equal(titles(await it.onScreen.call('brief_list')).money!.includes('Pellworth Lumber invoice 2093'), true);

  const deposit = it.brief.matters.deposit!;
  assert.equal((await it.onScreen.call('matter_set_state', { matter: deposit, to: 'dismissed' })).result, 'changed');
  assert.equal(titles(await it.onScreen.call('brief_list')).money!.includes('Deposit for the Halvik porch'), false);
  const dismissed = await it.onScreen.call('matter_search', { words: 'Halvik porch' });
  assert.deepEqual((dismissed.matters as Matter[]).map((matter) => matter.state), ['dismissed']);
  assert.equal((await it.onScreen.call('matter_set_state', { matter: deposit, to: 'open' })).result, 'changed');
});

test('each field edited in place changes, adds a history line and is recorded as set by the person', async () => {
  const id = it.brief.matters.sealant!;
  const edits: [string, string, string][] = [
    ['title', 'Order clear sealant for the Marrow deck', 'The title was changed to "Order clear sealant for the Marrow deck".'],
    ['notes', 'Two gallons, clear.', 'The notes were changed.'],
    ['due', '2026-12-04', 'The due date was set to 2026-12-04.'],
    ['kind', 'money', 'The kind was changed to Money.'],
    ['lane', 'job-114', 'The lane was changed to job-114.'],
    ['notes', '', 'The notes were cleared.'],
    ['due', '', 'The due date was cleared.'],
  ];
  const expected = new Set<string>();
  for (const [field, value, line] of edits) {
    const { matter } = await getMatter('sealant');
    const changed = await it.onScreen.call('matter_edit', { matter: id, version: matter.version, [field]: value });
    assert.equal(changed.result, 'changed', field);
    const after = changed.matter as Matter;
    assert.equal(after.version, matter.version + 1);
    assert.equal(after[field as keyof Matter] ?? '', value);
    expected.add(field);
    assert.deepEqual(new Set(after.set_by_you), expected);
    const got = await getMatter('sealant');
    assert.deepEqual(got.matter, after);
    assert.deepEqual({ ...got.history[0], at: '' }, { at: '', who: 'you', what: line });
  }
  const { matter } = await getMatter('sealant');
  assert.equal(matter.lane, 'job-114');
  assert.equal(matter.kind, 'money');
  // The fields sorting fills in are not the person's, and stay as they were.
  assert.equal(matter.summary, made('sealant').summary);
});

test('several fields change in one edit, a field given its own value changes nothing, and a bad value is refused', async () => {
  const id = it.brief.matters.water!;
  const { matter } = await getMatter('water');
  const both = await it.onScreen.call('matter_edit', { matter: id, version: matter.version, title: 'Water bill, November', lane: 'house' });
  assert.equal(both.result, 'changed');
  const got = await getMatter('water');
  assert.deepEqual(got.history.slice(0, 2).map((line) => line.what).sort(), ['The lane was changed to house.', 'The title was changed to "Water bill, November".']);

  const same = await it.onScreen.call('matter_edit', { matter: id, version: got.matter.version, title: 'Water bill, November' });
  assert.equal(same.result, 'already_so');
  assert.equal((await getMatter('water')).history.length, got.history.length);

  for (const input of [{ due: '2026-02-30' }, { due: 'Friday' }, { lane: 'House' }, { kind: 'other' }, { title: '' }, {}]) {
    const refused = await it.onScreen.call('matter_edit', { matter: id, version: got.matter.version, ...input });
    assert.equal(refused.result, 'invalid_input', JSON.stringify(input));
  }
  assert.equal((await it.onScreen.call('matter_edit', { matter: 'nosuchmatter', version: 1, title: 'x' })).result, 'unknown_matter');
  assert.deepEqual((await getMatter('water')).matter, got.matter);
});

test('a change made on a stale copy answers changed_since and changes nothing', async () => {
  const id = it.brief.matters.inspection!;
  const { matter } = await getMatter('inspection');
  assert.equal((await it.onScreen.call('matter_edit', { matter: id, version: matter.version, notes: 'Tuesday suits.' })).result, 'changed');
  const stale = await it.atCommandLine.call('matter_edit', { matter: id, version: matter.version, title: 'A title from a stale copy' });
  assert.equal(stale.result, 'changed_since');
  assert.equal((await getMatter('inspection')).matter.title, made('inspection').title);
});

test('two changes to one matter sent at once never both land on the same copy', async () => {
  const id = it.brief.matters.pickup!;
  const { matter } = await getMatter('pickup');
  const edits = await Promise.all(
    ['First title', 'Second title', 'Third title'].map((title) => it.onScreen.call('matter_edit', { matter: id, version: matter.version, title })),
  );
  assert.deepEqual(edits.map((edit) => edit.result).sort(), ['changed', 'changed_since', 'changed_since']);
  const after = await getMatter('pickup');
  assert.equal(after.matter.version, matter.version + 1);
  assert.equal(after.history.filter((line) => line.what.startsWith('The title was changed')).length, 1);

  const states = await Promise.all([1, 2, 3].map(() => it.onScreen.call('matter_set_state', { matter: id, to: 'done' })));
  assert.deepEqual(states.map((state) => state.result).sort(), ['already_so', 'already_so', 'changed']);
  const done = await getMatter('pickup');
  assert.equal(done.matter.version, matter.version + 2);
  assert.equal(done.history.filter((line) => line.what === 'Marked done.').length, 1);
  await it.onScreen.call('matter_set_state', { matter: id, to: 'open' });
});

test('every change by an agent, at either level, answers not_allowed and is recorded under the agent', async () => {
  const id = it.brief.matters.water!;
  const { matter } = await getMatter('water');
  const changes: [string, Record<string, unknown>][] = [
    ['matter_edit', { matter: id, version: matter.version, title: 'An agent title' }],
    ['matter_set_state', { matter: id, to: 'done' }],
    ['link_move_message', { link: it.brief.messages.water![0], to: it.brief.matters.lumber }],
    ['link_accept_person', { link: it.brief.personLinks.inspection![0] }],
    ['link_remove_person', { link: it.brief.personLinks.inspection![0] }],
  ];
  const before = (await it.activity()).length;
  for (const [operation, input] of changes) {
    assert.equal((await it.reader.call(operation, input)).result, 'not_allowed', operation);
    assert.equal((await it.preparer.call(operation, input)).result, 'not_allowed', operation);
  }
  const added = (await it.activity()).slice(0, -before || undefined).reverse();
  assert.deepEqual(
    added.map((entry) => [entry.who, entry.operation, entry.result]),
    changes.flatMap(([operation]) => [
      [`agent:${it.readerAgent.id}`, operation, 'not_allowed'],
      [`agent:${it.preparerAgent.id}`, operation, 'not_allowed'],
    ]),
  );
  assert.deepEqual((await getMatter('water')).matter, matter);
});

test('each of the five changes by the person leaves one record under the person, on the matter it changed', async () => {
  const id = it.brief.matters.glass!;
  const to = it.brief.matters.water!;
  const message = it.brief.messages.glass![0]!;
  const [accepting, removing] = it.brief.personLinks.inspection!;
  const before = (await it.activity()).length;
  const { matter } = await getMatter('glass');
  assert.equal((await it.onScreen.call('matter_set_state', { matter: id, to: 'open' })).result, 'changed');
  assert.equal((await it.atCommandLine.call('matter_set_state', { matter: id, to: 'open' })).result, 'already_so');
  assert.equal((await it.atCommandLine.call('matter_edit', { matter: id, version: matter.version + 1, notes: 'Measured Thursday.' })).result, 'changed');
  assert.equal((await it.onScreen.call('link_move_message', { link: message, to })).result, 'moved');
  assert.equal((await it.atCommandLine.call('link_accept_person', { link: accepting })).result, 'accepted');
  assert.equal((await it.onScreen.call('link_remove_person', { link: removing })).result, 'removed');
  const added = (await it.activity()).slice(0, -before || undefined).reverse();
  const inspection = `matter:${it.brief.matters.inspection}`;
  assert.deepEqual(
    added.map((entry) => [entry.who, entry.operation, entry.on, entry.result]),
    [
      ['you', 'matter_set_state', `matter:${id}`, 'changed'],
      ['you', 'matter_set_state', `matter:${id}`, 'already_so'],
      ['you', 'matter_edit', `matter:${id}`, 'changed'],
      // A move is recorded on the matter the message was on.
      ['you', 'link_move_message', `matter:${id}`, 'moved'],
      ['you', 'link_accept_person', inspection, 'accepted'],
      ['you', 'link_remove_person', inspection, 'removed'],
    ],
  );
});

test('a refused change names the matter only when the work found it', async () => {
  const id = it.brief.matters.water!;
  const { matter } = await getMatter('water');
  const before = (await it.activity()).length;
  const calls: [string, Record<string, unknown>, string][] = [
    // The work found the matter.
    ['matter_edit', { matter: id, version: matter.version, due: 'Friday' }, 'invalid_input'],
    ['matter_edit', { matter: id, version: matter.version + 99, title: 'A title' }, 'changed_since'],
    ['matter_set_state', { matter: id, to: 'snoozed' }, 'invalid_input'],
    // The work found the person link, which was already accepted.
    ['link_accept_person', { link: it.brief.personLinks.sealant![0] }, 'already_so'],
    // The work found no matter or link.
    ['matter_edit', { matter: 'nosuchmatter', version: 1, title: 'A title' }, 'unknown_matter'],
    ['matter_set_state', { matter: 'nosuchmatter', to: 'done' }, 'unknown_matter'],
    ['link_accept_person', { link: 'nosuchlink' }, 'unknown_link'],
    ['link_remove_person', { link: 'nosuchlink' }, 'unknown_link'],
    // The door refused before the work ran.
    ['matter_edit', { matter: id, version: matter.version, colour: 'red' }, 'invalid_input'],
  ];
  for (const [operation, input, result] of calls) {
    assert.equal((await it.onScreen.call(operation, input)).result, result, operation);
  }
  assert.equal((await it.reader.call('matter_set_state', { matter: id, to: 'done' })).result, 'not_allowed');
  const added = (await it.activity()).slice(0, -before || undefined).reverse();
  const on = `matter:${id}`;
  assert.deepEqual(
    added.map((entry) => [entry.operation, entry.result, entry.on]),
    [
      ['matter_edit', 'invalid_input', on],
      ['matter_edit', 'changed_since', on],
      ['matter_set_state', 'invalid_input', on],
      ['link_accept_person', 'already_so', `matter:${it.brief.matters.sealant}`],
      ['matter_edit', 'unknown_matter', null],
      ['matter_set_state', 'unknown_matter', null],
      ['link_accept_person', 'unknown_link', null],
      ['link_remove_person', 'unknown_link', null],
      ['matter_edit', 'invalid_input', null],
      ['matter_set_state', 'not_allowed', null],
    ],
  );
});

test('notes may hold line breaks: saved from the screen and the command line, shown again the same every way in, and refused to an agent', async () => {
  const id = it.brief.matters.registration!;
  const twoLines = 'Bring the old registration.\nThe office closes at noon.';
  let { matter } = await getMatter('registration');
  const fromScreen = await it.onScreen.call('matter_edit', { matter: id, version: matter.version, notes: twoLines });
  assert.equal(fromScreen.result, 'changed');
  for (const way of [it.onScreen, it.atCommandLine, it.reader, it.preparer]) {
    const got = await way.call('matter_get', { matter: id });
    assert.equal((got.matter as Matter).notes, twoLines);
  }
  // A Windows line ending is kept as a plain one.
  matter = (await getMatter('registration')).matter;
  const windows = 'First line.\r\nSecond line.';
  assert.equal((await it.atCommandLine.call('matter_edit', { matter: id, version: matter.version, notes: windows })).result, 'changed');
  assert.equal((await getMatter('registration')).matter.notes, 'First line.\nSecond line.');
  // An agent is refused, whatever the notes hold.
  matter = (await getMatter('registration')).matter;
  assert.equal((await it.preparer.call('matter_edit', { matter: id, version: matter.version, notes: twoLines })).result, 'not_allowed');
  // Other control characters are still refused in notes, and a line break is refused in a title.
  assert.equal((await it.onScreen.call('matter_edit', { matter: id, version: matter.version, notes: 'one\ttwo' })).result, 'invalid_input');
  assert.equal((await it.onScreen.call('matter_edit', { matter: id, version: matter.version, title: 'one\ntwo' })).result, 'invalid_input');
  assert.equal((await getMatter('registration')).matter.notes, 'First line.\nSecond line.');
});

test('search finds words of any length, in any characters, and matches the case of the letters A to Z only', async () => {
  const id = it.brief.matters.newsletter!;
  const { matter } = await getMatter('newsletter');
  const notes = 'Ask for 50%_off\\back at Ødegård Hardware, the one on the corner past the old mill road.';
  assert.equal((await it.onScreen.call('matter_edit', { matter: id, version: matter.version, notes })).result, 'changed');
  const found = async (words: string) => ((await it.onScreen.call('matter_search', { words })).matters as Matter[]).map((one) => one.id);
  // Pattern characters are plain text.
  for (const words of ['%', '_', '\\', '50%_off\\back']) {
    assert.deepEqual(await found(words), [id], words);
  }
  assert.deepEqual(await found('50%x'), []);
  // Words well over 50 bytes, plain and with non-ASCII letters.
  const plain = notes.slice(30);
  const nonAscii = 'Ødegård Hardware, the one on the corner past the old';
  for (const words of [plain, nonAscii]) {
    assert.ok(new TextEncoder().encode(words).length > 50, words);
    assert.deepEqual(await found(words), [id], words);
  }
  assert.equal((await it.onScreen.call('matter_search', { words: 'x'.repeat(200) })).result, 'found');
  // The letters A to Z match in either case; other letters only as written.
  assert.deepEqual(await found('Ødegård HARDWARE'), [id]);
  assert.deepEqual(await found('ødegård hardware'), []);
});
