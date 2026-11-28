import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasFields, isRecord, isText, isUtcTime } from '../record-fields.ts';

test('a record is a plain object, and a text value is a non-empty well-formed string', () => {
  assert.equal(isRecord({ id: 'one' }), true);
  for (const value of [null, undefined, 'one', 1, true, ['one']]) {
    assert.equal(isRecord(value), false);
  }

  assert.equal(isText(' Café '), true);
  assert.equal(isText('a'.repeat(300)), true);
  for (const value of ['', 'bad\ud800', 1, null, { text: 'one' }]) {
    assert.equal(isText(value), false);
  }
});

test('a record has exactly the named fields, each an own data property', () => {
  const record = { id: 'one', name: 'sample' };
  assert.equal(hasFields(record, ['name', 'id']), true);
  assert.equal(hasFields(record, ['id']), false);
  assert.equal(hasFields(record, ['id', 'name', 'extra']), false);
  assert.equal(hasFields({ id: 'one', extra: 'no' }, ['id']), false);

  const withGetter: Record<string, unknown> = { id: 'one' };
  Object.defineProperty(withGetter, 'name', { get: () => 'sample', enumerable: true });
  assert.equal(hasFields(withGetter, ['id', 'name']), false);
});

test('a UTC time names a real instant and is written with a Z', () => {
  for (const value of ['2026-01-02T03:04:05Z', '2026-01-02T03:04:05.006Z', '2026-01-02T03:04:05.6Z']) {
    assert.equal(isUtcTime(value), true);
  }
  for (const value of [
    '',
    '2026-01-02',
    '2026-01-02T03:04:05',
    '2026-01-02T03:04:05+00:00',
    '2026-02-30T00:00:00Z',
    '2026-01-02T03:04:05.0000Z',
    'yesterday',
  ]) {
    assert.equal(isUtcTime(value), false);
  }
});
