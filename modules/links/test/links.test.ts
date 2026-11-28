import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { Link } from '../../../contracts/link.ts';
import type { HistoryLine, Matter } from '../../../contracts/matter.ts';
import { startBriefInstall } from '../../brief/test/helpers/brief-install.ts';
import type { BriefInstall } from '../../brief/test/helpers/brief-install.ts';

let it: BriefInstall;

before(async () => {
  it = await startBriefInstall();
});

after(async () => {
  await it?.close();
});

type Page = { matter: Matter; history: HistoryLine[]; messages: { link: string; sender: string }[]; people: { link: string; person: string; state: string }[] };

async function page(label: string): Promise<Page> {
  const got = await it.onScreen.call('matter_get', { matter: it.brief.matters[label] });
  assert.equal(got.result, 'matter');
  return got as unknown as Page;
}

async function linkRows(): Promise<Link[]> {
  const database = await it.install.database();
  return (await database.prepare('SELECT * FROM links ORDER BY rowid').all<Link>()).results;
}

test('moving a message to another matter works, leaves a history line on both matters, and deletes nothing', async () => {
  const rowsBefore = await linkRows();
  const link = it.brief.messages.lumber![1]!;
  const moved = await it.onScreen.call('link_move_message', { link, to: it.brief.matters.sealant });
  assert.equal(moved.result, 'moved');
  assert.equal(moved.from, it.brief.matters.lumber);
  assert.equal(moved.to, it.brief.matters.sealant);

  const from = await page('lumber');
  const to = await page('sealant');
  assert.equal(from.messages.some((message) => message.link === link), false);
  assert.equal(to.messages.some((message) => message.link === moved.link && message.sender === 'Pellworth Lumber billing'), true);
  assert.deepEqual({ ...from.history[0], at: '' }, { at: '', who: 'you', what: 'A message from Pellworth Lumber billing was taken off this matter.' });
  assert.deepEqual({ ...to.history[0], at: '' }, { at: '', who: 'you', what: 'A message from Pellworth Lumber billing was linked to this matter.' });

  // Nothing is deleted: the old link is kept, marked removed, beside the new one.
  const rowsAfter = await linkRows();
  assert.equal(rowsAfter.length, rowsBefore.length + 1);
  const old = rowsAfter.find((row) => row.id === link)!;
  assert.equal(old.state, 'removed');
  assert.equal(old.removed_by, 'you');
  assert.equal(old.matter, it.brief.matters.lumber);
  const made = rowsAfter.find((row) => row.id === moved.link)!;
  assert.deepEqual([made.message, made.quote, made.sender, made.sent_at, made.state], [old.message, old.quote, old.sender, old.sent_at, 'active']);

  // Moving it back is one more move, and the history keeps both.
  const back = await it.atCommandLine.call('link_move_message', { link: moved.link, to: it.brief.matters.lumber });
  assert.equal(back.result, 'moved');
  assert.equal((await page('lumber')).history.filter((line) => line.what.startsWith('A message from Pellworth Lumber billing')).length, 4);
  assert.equal((await linkRows()).length, rowsBefore.length + 2);
});

test('a move to where the message already is, to no matter, or of no message link is refused and changes nothing', async () => {
  const rowsBefore = await linkRows();
  const link = it.brief.messages.water![0]!;
  assert.equal((await it.onScreen.call('link_move_message', { link, to: it.brief.matters.water })).result, 'same_matter');
  assert.equal((await it.onScreen.call('link_move_message', { link, to: 'nosuchmatter' })).result, 'unknown_matter');
  assert.equal((await it.onScreen.call('link_move_message', { link: 'nosuchlink', to: it.brief.matters.lumber })).result, 'unknown_link');
  // A person link is not a message link.
  assert.equal((await it.onScreen.call('link_move_message', { link: it.brief.personLinks.deposit![0], to: it.brief.matters.lumber })).result, 'unknown_link');
  assert.deepEqual(await linkRows(), rowsBefore);
});

test('the same message moved twice at once is moved once, and is in force on one matter only', async () => {
  const link = it.brief.messages.pickup![0]!;
  const answers = await Promise.all([
    it.onScreen.call('link_move_message', { link, to: it.brief.matters.lumber }),
    it.onScreen.call('link_move_message', { link, to: it.brief.matters.water }),
    it.onScreen.call('link_move_message', { link, to: it.brief.matters.sealant }),
  ]);
  assert.deepEqual(answers.map((answer) => answer.result).sort(), ['changed_since', 'changed_since', 'moved']);
  const message = (await linkRows()).find((row) => row.id === link)!.message;
  const inForce = (await linkRows()).filter((row) => row.message === message && row.state !== 'removed');
  assert.equal(inForce.length, 1);
  // A stale page that moves the old link again is told someone changed it first.
  assert.equal((await it.onScreen.call('link_move_message', { link, to: it.brief.matters.pickup })).result, 'changed_since');
});

test('a person an agent proposed shows as unconfirmed until accepted, and accepting is one call that adds a history line', async () => {
  const [first] = it.brief.personLinks.inspection!;
  assert.equal((await page('inspection')).people.find((person) => person.link === first)!.state, 'proposed');
  const accepted = await it.onScreen.call('link_accept_person', { link: first });
  assert.equal(accepted.result, 'accepted');
  const after = await page('inspection');
  assert.equal(after.people.find((person) => person.link === first)!.state, 'active');
  assert.deepEqual({ ...after.history[0], at: '' }, { at: '', who: 'you', what: 'A person was accepted on this matter.' });

  const again = await it.onScreen.call('link_accept_person', { link: first });
  assert.equal(again.result, 'already_so');
  assert.equal((await page('inspection')).history.length, after.history.length);
});

test('removing a person works, leaves a history line, and deletes nothing', async () => {
  const [, second] = it.brief.personLinks.inspection!;
  const rowsBefore = await linkRows();
  const removed = await it.atCommandLine.call('link_remove_person', { link: second });
  assert.equal(removed.result, 'removed');
  const after = await page('inspection');
  assert.equal(after.people.some((person) => person.link === second), false);
  assert.deepEqual({ ...after.history[0], at: '' }, { at: '', who: 'you', what: 'A person was taken off this matter.' });
  const rowsAfter = await linkRows();
  assert.equal(rowsAfter.length, rowsBefore.length);
  assert.equal(rowsAfter.find((row) => row.id === second)!.state, 'removed');

  assert.equal((await it.onScreen.call('link_remove_person', { link: second })).result, 'already_so');
  // A removed person cannot be accepted from a stale page.
  assert.equal((await it.onScreen.call('link_accept_person', { link: second })).result, 'changed_since');
  assert.equal((await it.onScreen.call('link_accept_person', { link: 'nosuchlink' })).result, 'unknown_link');
  // A message link is not a person link.
  assert.equal((await it.onScreen.call('link_remove_person', { link: it.brief.messages.water![0] })).result, 'unknown_link');
  assert.equal((await page('water')).messages.length, 1);
});

test('accepting and removing one person at once never write over each other', async () => {
  const [link] = it.brief.personLinks.deposit!;
  const [accept, remove] = await Promise.all([
    it.onScreen.call('link_accept_person', { link }),
    it.onScreen.call('link_remove_person', { link }),
  ]);
  const state = (await linkRows()).find((row) => row.id === link)!;
  if (accept.result === 'accepted') {
    // The removal came second, so it removed the accepted link.
    assert.equal(remove.result, 'removed');
    assert.equal(state.accepted_by, 'you');
  } else {
    assert.equal(accept.result, 'changed_since');
    assert.equal(remove.result, 'removed');
    assert.equal(state.accepted_by, null);
  }
  assert.equal(state.state, 'removed');
});

test('a person on a matter is shown by name through person_get, the same from every way in', async () => {
  const { people } = await page('sealant');
  const [person] = people;
  const got = await it.onScreen.call('person_get', { person: person!.person });
  assert.deepEqual(got, { result: 'person', description: 'The person "Ines Marrow".', person: { id: person!.person, name: 'Ines Marrow', confirmed: 'no' } });
  assert.deepEqual(await it.atCommandLine.call('person_get', { person: person!.person }), got);
  assert.deepEqual(await it.reader.call('person_get', { person: person!.person }), got);
  assert.deepEqual(await it.preparer.call('person_get', { person: person!.person }), got);
  assert.equal((await it.onScreen.call('person_get', { person: 'nosuchperson' })).result, 'unknown_person');
});
