import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatManifestHeader,
  newManifestHeader,
  isStartOfManifestHeader,
  readManifestHeader,
} from '../manifest-header.ts';

const sampleId = '3f2b8c1e-7d4a-4f6b-9a2e-5c1d0e8f7a6b';

test('the header line holds version 1, the archive ID and the UTC creation time, in that order', () => {
  const header = newManifestHeader(sampleId, new Date(Date.UTC(2026, 0, 2, 3, 4, 5, 6)));
  assert.equal(
    formatManifestHeader(header),
    `{"line":"header","manifest_version":1,"archive_id":"${sampleId}","created_at":"2026-01-02T03:04:05.006Z"}\n`,
  );
});

test('a version 1 header reads back as written', () => {
  const header = newManifestHeader(sampleId, new Date(Date.UTC(2026, 5, 7)));
  const line = formatManifestHeader(header).trimEnd();
  assert.deepEqual(readManifestHeader(line), { outcome: 'header', header });
});

test('a newer manifest version is reported as unknown, not read', () => {
  const line = JSON.stringify({ line: 'header', manifest_version: 2, archive_id: sampleId, created_at: '2026-01-01T00:00:00.000Z' });
  const result = readManifestHeader(line);
  assert.equal(result.outcome, 'unknown-version');
  assert.ok(result.outcome === 'unknown-version' && result.version === 2);
  assert.match(result.outcome === 'unknown-version' ? result.message : '', /version 2/);
});

test('a line that is not a valid version 1 header is refused', () => {
  const good = { line: 'header', manifest_version: 1, archive_id: sampleId, created_at: '2026-01-01T00:00:00.000Z' };
  const bad: unknown[] = [
    'not json',
    '[]',
    'null',
    { ...good, line: 'entry' },
    { ...good, manifest_version: 0 },
    { ...good, manifest_version: '1' },
    { ...good, manifest_version: 1.5 },
    { ...good, archive_id: '' },
    { ...good, archive_id: 7 },
    { ...good, created_at: '2026-01-01T00:00:00+02:00' },
    { ...good, created_at: '2026-13-45T00:00:00.000Z' },
    // A date that does not exist, although every number is in range.
    { ...good, created_at: '2026-02-30T00:00:00.000Z' },
    { line: 'header', manifest_version: 1, archive_id: sampleId },
  ];
  for (const value of bad) {
    const line = typeof value === 'string' ? value : JSON.stringify(value);
    const result = readManifestHeader(line);
    assert.equal(result.outcome, 'not-a-header', line);
  }
});

test('the start of a header line is recognised, cut off anywhere before its line end', () => {
  const line = formatManifestHeader(newManifestHeader(sampleId, new Date(Date.UTC(2026, 0, 2, 3, 4, 5, 6)))).trimEnd();
  for (let length = 0; length <= line.length; length += 1) {
    assert.equal(isStartOfManifestHeader(line.slice(0, length)), true, line.slice(0, length));
  }
  assert.equal(isStartOfManifestHeader(`${line}\n`), false, 'a finished line is not a cut-off one');
  assert.equal(isStartOfManifestHeader('{"line":"entry"'), false);
  assert.equal(isStartOfManifestHeader(line.replace('2026', '2O26')), false, 'a letter where the time has a digit');
  assert.equal(isStartOfManifestHeader(line.replace(sampleId, sampleId.toUpperCase())), false, 'an ID in capitals');
  assert.equal(isStartOfManifestHeader('made-up notes'), false);
});
