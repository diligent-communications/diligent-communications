import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isLink } from '../link.ts';
import type { Link } from '../link.ts';
import { MATTER_LIMITS, isDate, isHistoryLine, isLane, isMatter } from '../matter.ts';
import type { Matter } from '../matter.ts';
import { isPerson } from '../person.ts';

const matter: Matter = {
  id: 'm1a2',
  version: 1,
  kind: 'money',
  lane: 'work',
  title: 'Invoice 2093 from a made-up supplier',
  next_action: 'Pay it',
  owed_by: 'you',
  summary: 'A made-up invoice for decking boards.',
  latest_update: '',
  timing: 'by Friday',
  state: 'open',
  snoozed_until: null,
  main_action: 'reply',
  notes: '',
  due: null,
  set_by_you: [],
};

test('a matter has exactly its fields, each within its rule', () => {
  assert.equal(isMatter(matter), true);
  assert.equal(isMatter({ ...matter, set_by_you: ['title', 'lane'], due: '2026-12-12', notes: 'Call first.' }), true);
  assert.equal(isMatter({ ...matter, state: 'snoozed', snoozed_until: '2026-12-01T08:00:00.000Z' }), true);

  const { summary: _summary, ...missing } = matter;
  const broken: unknown[] = [
    missing,
    { ...matter, extra: 'no' },
    { ...matter, version: 0 },
    { ...matter, version: 1.5 },
    { ...matter, kind: 'other' },
    { ...matter, lane: 'Work' },
    { ...matter, lane: '' },
    { ...matter, title: '' },
    { ...matter, title: 'a'.repeat(MATTER_LIMITS.title + 1) },
    { ...matter, summary: 'a'.repeat(MATTER_LIMITS.summary + 1) },
    { ...matter, state: 'closed' },
    // A snoozed matter says until when, and only a snoozed one does.
    { ...matter, state: 'snoozed', snoozed_until: null },
    { ...matter, snoozed_until: '2026-12-01T08:00:00.000Z' },
    { ...matter, main_action: 'pay' },
    { ...matter, due: '2026-02-30' },
    { ...matter, due: '12/12/2026' },
    { ...matter, set_by_you: ['summary'] },
    { ...matter, set_by_you: ['title', 'title'] },
  ];
  for (const value of broken) {
    assert.equal(isMatter(value), false, JSON.stringify(value));
  }
  assert.equal(isMatter({ ...matter, summary: 'a'.repeat(MATTER_LIMITS.summary) }), true);
});

test('a lane is a short lowercase tag, and a date is a real calendar day', () => {
  for (const lane of ['work', 'home', 'job-114', 'a'.repeat(40)]) {
    assert.equal(isLane(lane), true, lane);
  }
  for (const lane of ['', 'Work', 'with space', '-work', 'a'.repeat(41), 7]) {
    assert.equal(isLane(lane), false, String(lane));
  }
  assert.equal(isDate('2028-02-29'), true);
  for (const day of ['2027-02-29', '2026-13-01', '2026-1-01', '2026-01-01T00:00:00Z', '']) {
    assert.equal(isDate(day), false, day);
  }
});

test('a history line is when, who and a short line of what changed', () => {
  assert.equal(isHistoryLine({ at: '2026-11-28T10:00:00.000Z', who: 'you', what: 'Marked done.' }), true);
  for (const value of [
    { at: '2026-11-28T10:00:00.000Z', who: 'someone', what: 'Marked done.' },
    { at: '2026-11-28', who: 'you', what: 'Marked done.' },
    { at: '2026-11-28T10:00:00.000Z', who: 'you', what: '' },
    { at: '2026-11-28T10:00:00.000Z', who: 'you', what: 'a'.repeat(301) },
    { at: '2026-11-28T10:00:00.000Z', who: 'you', what: 'Marked done.', extra: 1 },
  ]) {
    assert.equal(isHistoryLine(value), false, JSON.stringify(value));
  }
});

const messageLink: Link = {
  id: 'l1',
  kind: 'message',
  matter: 'm1a2',
  message: 's9',
  person: null,
  state: 'active',
  made_by: 'agent:a1',
  made_at: '2026-11-27T09:00:00.000Z',
  accepted_by: null,
  accepted_at: null,
  removed_by: null,
  removed_at: null,
  quote: 'Please find the invoice attached.',
  sender: 'A made-up supplier',
  sent_at: '2026-11-26T15:00:00.000Z',
};

const personLink: Link = {
  ...messageLink,
  id: 'l2',
  kind: 'person',
  message: null,
  person: 'p1',
  state: 'proposed',
  quote: null,
  sender: null,
  sent_at: null,
};

test('a link joins a message or a person to a matter, and says who made, accepted and removed it', () => {
  assert.equal(isLink(messageLink), true);
  assert.equal(isLink(personLink), true);
  assert.equal(isLink({ ...personLink, state: 'active', accepted_by: 'you', accepted_at: '2026-11-28T09:00:00.000Z' }), true);
  assert.equal(isLink({ ...messageLink, state: 'removed', removed_by: 'you', removed_at: '2026-11-28T09:00:00.000Z' }), true);

  for (const value of [
    { ...messageLink, quote: 'a'.repeat(301) },
    { ...messageLink, quote: null },
    { ...messageLink, person: 'p1' },
    { ...personLink, quote: 'words' },
    { ...personLink, message: 's9' },
    { ...messageLink, state: 'deleted' },
    // A removed link says who removed it, and a link in force does not.
    { ...messageLink, state: 'removed' },
    { ...messageLink, removed_by: 'you', removed_at: '2026-11-28T09:00:00.000Z' },
    { ...messageLink, accepted_by: 'you', accepted_at: null },
    { ...messageLink, made_by: 'someone' },
  ]) {
    assert.equal(isLink(value), false, JSON.stringify(value));
  }
  assert.equal(isLink({ ...messageLink, quote: 'a'.repeat(300) }), true);
});

test('a person, as a matter shows one, is an ID, a name and whether the record is confirmed', () => {
  assert.equal(isPerson({ id: 'p1', name: 'A made-up neighbour', confirmed: 'no' }), true);
  assert.equal(isPerson({ id: 'p1', name: 'A made-up neighbour', confirmed: 'yes' }), true);
  for (const value of [
    { id: 'p1', name: 'x' },
    { id: 'P1', name: 'x', confirmed: 'no' },
    { id: 'p1', name: '', confirmed: 'no' },
    { id: 'p1', name: 'a'.repeat(101), confirmed: 'no' },
    { id: 'p1', name: 'x', confirmed: true },
    { id: 'p1', name: 'x', confirmed: 'no', extra: 1 },
  ]) {
    assert.equal(isPerson(value), false, JSON.stringify(value));
  }
});
