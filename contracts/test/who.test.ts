import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isActivityEntry } from '../activity.ts';
import { isAgent } from '../agent.ts';
import { isAgentLevel, isCaller, isLevel, isWho, levelOf, levelReaches, whoOf } from '../who.ts';
import type { Caller } from '../who.ts';

test('each level includes the ones before it, and an agent level stops at prepare', () => {
  assert.equal(levelReaches('you', 'read'), true);
  assert.equal(levelReaches('you', 'you'), true);
  assert.equal(levelReaches('prepare', 'read'), true);
  assert.equal(levelReaches('prepare', 'prepare'), true);
  assert.equal(levelReaches('read', 'prepare'), false);
  assert.equal(levelReaches('prepare', 'you'), false);
  assert.equal(levelReaches('read', 'you'), false);

  assert.equal(isLevel('you'), true);
  assert.equal(isAgentLevel('you'), false);
  assert.equal(isAgentLevel('prepare'), true);
  for (const value of ['', 'Read', 'act', null, 1]) {
    assert.equal(isLevel(value), false);
  }
});

test('who did it is the person, the install, a named agent or a named device', () => {
  for (const value of ['you', 'diligent', 'agent:4f2a', 'device:9']) {
    assert.equal(isWho(value), true);
  }
  for (const value of ['', 'agent', 'agent:', 'agent:A', 'agent:a:b', 'person:1', 'nobody', null, 7]) {
    assert.equal(isWho(value), false);
  }
});

test('a caller is nobody, the person with a session ID, or an agent with a level', () => {
  const nobody: Caller = { kind: 'nobody' };
  const you: Caller = { kind: 'you', session: 'ab12' };
  const agent: Caller = { kind: 'agent', id: '4f2a', name: 'sorter', level: 'read', on: true };
  for (const caller of [nobody, you, agent]) {
    assert.equal(isCaller(caller), true);
  }
  assert.equal(whoOf(nobody), null);
  assert.equal(whoOf(you), 'you');
  assert.equal(whoOf(agent), 'agent:4f2a');
  assert.equal(levelOf(nobody), null);
  assert.equal(levelOf(you), 'you');
  assert.equal(levelOf(agent), 'read');

  for (const value of [
    null,
    {},
    { kind: 'nobody', level: 'you' },
    { kind: 'you' },
    { kind: 'you', session: 'ab12', level: 'you' },
    { kind: 'agent', id: '4f2a', name: 'sorter', level: 'you', on: true },
    { kind: 'agent', id: '4f2a', name: '', level: 'read', on: true },
    { kind: 'agent', id: '4f2a', name: 'sorter', level: 'read', on: 'yes' },
    { kind: 'device', id: '9' },
  ]) {
    assert.equal(isCaller(value), false);
  }
});

test('an agent has exactly its six fields and never a token', () => {
  const agent = {
    id: '4f2a',
    name: 'sorter',
    level: 'prepare',
    on: true,
    made_at: '2026-01-02T03:04:05Z',
    last_used_at: null,
  };
  assert.equal(isAgent(agent), true);
  assert.equal(isAgent({ ...agent, last_used_at: '2026-01-03T00:00:00.000Z' }), true);
  assert.equal(isAgent({ ...agent, token: 'anything' }), false);
  assert.equal(isAgent({ ...agent, level: 'you' }), false);
  assert.equal(isAgent({ ...agent, on: 1 }), false);
  assert.equal(isAgent({ ...agent, made_at: 'yesterday' }), false);
  assert.equal(isAgent({ ...agent, name: '' }), false);
});

test('an activity line has exactly its five fields, with nowhere to put content', () => {
  const entry = { at: '2026-01-02T03:04:05.006Z', who: 'agent:4f2a', operation: 'agent_set', on: 'agent:4f2a', result: 'changed' };
  assert.equal(isActivityEntry(entry), true);
  assert.equal(isActivityEntry({ ...entry, on: null }), true);
  assert.equal(isActivityEntry({ ...entry, who: 'diligent' }), true);
  assert.equal(isActivityEntry({ ...entry, note: 'some words' }), false);
  assert.equal(isActivityEntry({ ...entry, who: 'someone' }), false);
  assert.equal(isActivityEntry({ ...entry, on: 'a sentence of words' }), false);
  assert.equal(isActivityEntry({ ...entry, result: 'Changed it' }), false);
  assert.equal(isActivityEntry({ ...entry, operation: 'agent set' }), false);
  assert.equal(isActivityEntry({ ...entry, at: '2026-01-02' }), false);
});
