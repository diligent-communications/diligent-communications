import assert from 'node:assert/strict';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { folderStatus, openArchive, setFolders } from '../src/archive.ts';
import { exists, newWorkspace, snapshot, type Workspace } from './helpers/workspace.ts';

async function withFolders(w: Workspace): Promise<void> {
  const result = await setFolders(w.settingsFile, { evidenceFolder: w.evidence, backupFolder: w.backup });
  assert.equal(result.outcome, 'saved');
}

const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('creating an archive writes the read-me and the manifest header', async (t) => {
  const w = await newWorkspace(t);
  await withFolders(w);
  const before = Date.now();
  const result = await openArchive(w.settingsFile);
  const after = Date.now();

  assert.equal(result.outcome, 'opened');
  if (result.outcome !== 'opened') return;
  assert.equal(result.created, true);
  assert.equal(result.archive.folder, w.evidence);

  assert.deepEqual((await readdir(w.evidence)).sort(), ['READ-ME.txt', 'decisions', 'manifest.jsonl', 'originals', 'receipts']);

  const manifest = await readFile(path.join(w.evidence, 'manifest.jsonl'), 'utf8');
  assert.ok(manifest.endsWith('\n'));
  assert.equal(manifest.split('\n').length, 2, 'only the header line');
  const header = JSON.parse(manifest);
  assert.deepEqual(Object.keys(header), ['line', 'manifest_version', 'archive_id', 'created_at']);
  assert.equal(header.line, 'header');
  assert.equal(header.manifest_version, 1);
  assert.match(header.archive_id, uuidShape);
  assert.match(header.created_at, /Z$/);
  const created = Date.parse(header.created_at);
  assert.ok(created >= before && created <= after);
  assert.equal(result.archive.archiveId, header.archive_id);
  assert.equal(result.archive.createdAt, header.created_at);

  const readMe = await readFile(path.join(w.evidence, 'READ-ME.txt'), 'utf8');
  assert.match(readMe, /without the program/);
  assert.match(readMe, /manifest\.jsonl/);
  assert.match(readMe, /originals/);
});

test('each new archive gets its own random archive ID', async (t) => {
  const ids = new Set<string>();
  for (let i = 0; i < 3; i += 1) {
    const w = await newWorkspace(t);
    await withFolders(w);
    const result = await openArchive(w.settingsFile);
    assert.equal(result.outcome, 'opened');
    if (result.outcome === 'opened') ids.add(result.archive.archiveId);
  }
  assert.equal(ids.size, 3);
});

test('opening an existing archive reads its header and changes nothing', async (t) => {
  const w = await newWorkspace(t);
  await withFolders(w);
  const first = await openArchive(w.settingsFile);
  assert.equal(first.outcome, 'opened');
  const before = await snapshot(w.evidence);

  const second = await openArchive(w.settingsFile);
  assert.equal(second.outcome, 'opened');
  if (first.outcome !== 'opened' || second.outcome !== 'opened') return;
  assert.equal(second.created, false);
  assert.deepEqual(second.archive, first.archive);
  assert.deepEqual(await snapshot(w.evidence), before);
});

test('an unknown manifest version is refused without changing anything', async (t) => {
  const w = await newWorkspace(t);
  await withFolders(w);
  assert.equal((await openArchive(w.settingsFile)).outcome, 'opened');
  const manifest = path.join(w.evidence, 'manifest.jsonl');
  const newer = { line: 'header', manifest_version: 2, archive_id: 'made-up-id', created_at: '2026-01-01T00:00:00.000Z' };
  await writeFile(manifest, `${JSON.stringify(newer)}\n{"line":"entry"}\n`);
  const before = await snapshot(w.evidence);

  const result = await openArchive(w.settingsFile);
  assert.equal(result.outcome, 'unknown-version');
  assert.ok(result.outcome === 'unknown-version' && result.version === 2);
  assert.match(result.outcome === 'unknown-version' ? result.message : '', /version 2/);
  assert.deepEqual(await snapshot(w.evidence), before);
});

test('a folder that is not a valid archive is refused without changing anything', async (t) => {
  const header = '{"line":"header","manifest_version":1,"archive_id":"made-up-id","created_at":"2026-01-01T00:00:00.000Z"}';
  const cases: Record<string, (folder: string) => Promise<void>> = {
    'other files and no manifest': (folder) => writeFile(path.join(folder, 'notes.txt'), 'made-up notes'),
    'a manifest whose first line is not a header': (folder) =>
      writeFile(path.join(folder, 'manifest.jsonl'), '{"line":"entry"}\n'),
    'a header line with no line end': (folder) => writeFile(path.join(folder, 'manifest.jsonl'), header),
    'an empty manifest': (folder) => writeFile(path.join(folder, 'manifest.jsonl'), ''),
    'a manifest that is a folder': (folder) => mkdir(path.join(folder, 'manifest.jsonl')),
  };
  for (const [name, arrange] of Object.entries(cases)) {
    const w = await newWorkspace(t);
    await withFolders(w);
    await arrange(w.evidence);
    const before = await snapshot(w.evidence);

    const result = await openArchive(w.settingsFile);
    assert.equal(result.outcome, 'not-an-archive', name);
    assert.ok(result.outcome === 'not-an-archive' && result.message.length > 0);
    assert.deepEqual(await snapshot(w.evidence), before, name);
  }
});

test('a missing saved evidence folder is reported and never replaced by a new empty archive', async (t) => {
  const w = await newWorkspace(t);
  await withFolders(w);
  assert.equal((await openArchive(w.settingsFile)).outcome, 'opened');
  // As if the drive holding it were unplugged.
  const unplugged = path.join(w.root, 'unplugged');
  await rename(w.evidence, unplugged);

  const result = await openArchive(w.settingsFile);
  assert.equal(result.outcome, 'missing');
  assert.ok(result.outcome === 'missing' && result.folder === w.evidence && result.message.includes(w.evidence));
  assert.equal(await exists(w.evidence), false);

  const status = await folderStatus(w.settingsFile);
  assert.equal(status.outcome === 'found' ? status.evidence.status : undefined, 'missing');
  assert.equal(await exists(w.evidence), false);
});

test('a missing saved backup folder is reported', async (t) => {
  const w = await newWorkspace(t);
  await withFolders(w);
  await rm(w.backup, { recursive: true });
  const status = await folderStatus(w.settingsFile);
  assert.equal(status.outcome === 'found' ? status.backup.status : undefined, 'missing');
  assert.equal(await exists(w.backup), false);
});

test('folder status reports present and valid, empty, missing, or not an archive', async (t) => {
  const w = await newWorkspace(t);
  assert.equal((await folderStatus(w.settingsFile)).outcome, 'not-set');
  assert.equal((await openArchive(w.settingsFile)).outcome, 'not-set');
  assert.deepEqual(await readdir(w.evidence), []);

  await withFolders(w);
  let status = await folderStatus(w.settingsFile);
  assert.equal(status.outcome, 'found');
  if (status.outcome !== 'found') return;
  assert.deepEqual(status.locations, { evidenceFolder: w.evidence, backupFolder: w.backup });
  assert.equal(status.evidence.status, 'empty');
  assert.equal(status.backup.status, 'present');
  assert.deepEqual(await readdir(w.evidence), [], 'status alone creates nothing');

  const opened = await openArchive(w.settingsFile);
  status = await folderStatus(w.settingsFile);
  assert.equal(status.outcome === 'found' ? status.evidence.status : undefined, 'archive');
  if (status.outcome === 'found' && status.evidence.status === 'archive' && opened.outcome === 'opened') {
    assert.equal(status.evidence.archiveId, opened.archive.archiveId);
  }

  await writeFile(path.join(w.evidence, 'manifest.jsonl'), 'not a header\n');
  status = await folderStatus(w.settingsFile);
  assert.equal(status.outcome === 'found' ? status.evidence.status : undefined, 'not-an-archive');

  const newer = { line: 'header', manifest_version: 3, archive_id: 'made-up-id', created_at: '2026-01-01T00:00:00.000Z' };
  await writeFile(path.join(w.evidence, 'manifest.jsonl'), `${JSON.stringify(newer)}\n`);
  status = await folderStatus(w.settingsFile);
  assert.equal(status.outcome === 'found' ? status.evidence.status : undefined, 'not-an-archive');
  assert.equal(
    status.outcome === 'found' && status.evidence.status === 'not-an-archive' ? status.evidence.reason : undefined,
    'unknown-version',
  );

  await rm(w.evidence, { recursive: true });
  status = await folderStatus(w.settingsFile);
  assert.equal(status.outcome === 'found' ? status.evidence.status : undefined, 'missing');
});
