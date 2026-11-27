import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readCapturedRecord } from '../captured-record.ts';
import { formatManifestEntry, readManifestEntry } from '../manifest-entry.ts';

const captured = {
  record_version: 1,
  source_id: ' Café ',
  source_kind: 'mail',
  media_type: 'message/rfc822',
  payload: Uint8Array.of(0x00, 0xff),
  captured_at: '2026-01-01T00:00:00.000Z',
};

test('captured record version 1 preserves exact source text and bytes', () => {
  assert.deepEqual(readCapturedRecord(captured), { outcome: 'record', record: captured });
  for (const source_id of [' ', '📨'.repeat(2048)]) {
    assert.equal(readCapturedRecord({ ...captured, source_id }).outcome, 'record');
  }
});

test('captured records with missing, additional or invalid fields and newer versions are refused', () => {
  for (const key of Object.keys(captured)) {
    const missing: Record<string, unknown> = { ...captured };
    delete missing[key];
    assert.equal(readCapturedRecord(missing).outcome, 'invalid-record', key);
  }
  for (const bad of [
    null, [], { record_version: '1' }, { extra: undefined }, { source_id: '' },
    { source_id: 'x'.repeat(2049) }, { source_id: '\ud800' }, { source_kind: 'other' },
    { media_type: '' }, { payload: [0, 255] }, { payload: 'text' },
    { captured_at: '2026-02-30T00:00:00Z' }, { captured_at: '2026-01-01T00:00:00+01:00' },
  ]) {
    assert.equal(readCapturedRecord(bad === null || Array.isArray(bad) ? bad : { ...captured, ...bad }).outcome, 'invalid-record');
  }
  assert.deepEqual(readCapturedRecord({ ...captured, record_version: 2 }), { outcome: 'unknown-record-version', version: 2 });
});

const entry = {
  line: 'entry',
  kind: 'original',
  record_id: 'sample-id',
  record_version: 1,
  path: 'originals/12/example.eml',
  size_bytes: 2,
  sha256: 'a'.repeat(64),
  archived_at: '2026-01-02T00:00:00.000Z',
  source_id: captured.source_id,
  source_kind: 'mail',
  media_type: captured.media_type,
  captured_at: captured.captured_at,
} as const;

test('a manifest line round-trips shared fields and includes source fields for originals only', () => {
  const { source_id, source_kind, media_type, captured_at, ...common } = entry;
  for (const item of [entry, { ...common, kind: 'decision' }, { ...common, kind: 'receipt' }] as const) {
    const line = formatManifestEntry(item);
    assert.ok(line.endsWith('\n'));
    assert.equal(line.indexOf('\n'), line.length - 1);
    assert.deepEqual(readManifestEntry(line.slice(0, -1)), { outcome: 'entry', entry: item });
  }
  assert.equal(readManifestEntry(JSON.stringify({ ...entry, kind: 'receipt' })).outcome, 'invalid-entry');
  assert.equal(readManifestEntry(JSON.stringify({ ...common, kind: 'unknown' })).outcome, 'invalid-entry');
});

test('malformed and unsupported manifest entries are refused', () => {
  for (const key of Object.keys(entry)) {
    const missing: Record<string, unknown> = { ...entry };
    delete missing[key];
    assert.equal(readManifestEntry(JSON.stringify(missing)).outcome, 'invalid-entry', key);
  }
  for (const bad of [
    { line: 'header' }, { kind: 'unknown' }, { record_id: '' }, { record_version: 2 }, { path: '../outside' },
    { path: '/absolute' }, { path: 'C:/absolute' }, { path: 'a\\b' }, { size_bytes: -1 },
    { size_bytes: Number.MAX_SAFE_INTEGER + 1 }, { sha256: 'abc' }, { archived_at: 'yesterday' },
    { extra: true }, { source_id: '' }, { source_kind: 'unknown' }, { media_type: '' }, { captured_at: '' },
  ]) {
    assert.equal(readManifestEntry(JSON.stringify({ ...entry, ...bad })).outcome, 'invalid-entry');
  }
  assert.equal(readManifestEntry('not JSON').outcome, 'invalid-entry');
});
