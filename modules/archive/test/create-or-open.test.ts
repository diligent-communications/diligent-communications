import assert from 'node:assert/strict';
import { chmod, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { folderStatus, openArchive, readFolders, setFolders } from '../src/archive.ts';
import { createArchive } from '../src/evidence-folder.ts';
import { writeSettingsFile } from '../src/settings.ts';
import { exists, folderLink, linkLoop, newWorkspace, snapshot, type Workspace } from './helpers/workspace.ts';

async function withFolders(w: Workspace): Promise<void> {
  const result = await setFolders(w.settingsFile, { evidenceFolder: w.evidence, backupFolder: w.backup });
  assert.equal(result.outcome, 'saved');
}

async function created(w: Workspace): Promise<string> {
  await withFolders(w);
  const result = await openArchive(w.settingsFile);
  assert.equal(result.outcome, 'opened');
  return result.outcome === 'opened' ? result.archive.archiveId : '';
}

async function emptyFolder(folder: string): Promise<void> {
  for (const name of await readdir(folder)) {
    await rm(path.join(folder, name), { recursive: true });
  }
}

function header(archiveId: string, version = 1): string {
  return `${JSON.stringify({ line: 'header', manifest_version: version, archive_id: archiveId, created_at: '2026-01-01T00:00:00.000Z' })}\n`;
}

const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('creating an archive writes the read-me and the manifest header, and remembers the archive ID', async (t) => {
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
  const line = JSON.parse(manifest);
  assert.deepEqual(Object.keys(line), ['line', 'manifest_version', 'archive_id', 'created_at']);
  assert.equal(line.line, 'header');
  assert.equal(line.manifest_version, 1);
  assert.match(line.archive_id, uuidShape);
  assert.match(line.created_at, /Z$/);
  const createdAt = Date.parse(line.created_at);
  assert.ok(createdAt >= before && createdAt <= after);
  assert.equal(result.archive.archiveId, line.archive_id);
  assert.equal(result.archive.createdAt, line.created_at);

  const readMe = await readFile(path.join(w.evidence, 'READ-ME.txt'), 'utf8');
  assert.match(readMe, /without the program/);
  assert.match(readMe, /manifest\.jsonl/);
  assert.match(readMe, /originals/);

  const read = await readFolders(w.settingsFile);
  assert.equal(read.outcome === 'found' ? read.archiveId : undefined, line.archive_id);
});

test('each new archive gets its own random archive ID', async (t) => {
  const ids = new Set<string>();
  for (let i = 0; i < 3; i += 1) {
    ids.add(await created(await newWorkspace(t)));
  }
  assert.equal(ids.size, 3);
});

test('opening an existing archive reads its header and changes nothing', async (t) => {
  const w = await newWorkspace(t);
  await created(w);
  // Other files beside the manifest do not stop it being an archive.
  await writeFile(path.join(w.evidence, 'notes.txt'), 'made-up notes');
  const first = await openArchive(w.settingsFile);
  const before = await snapshot(w.evidence);

  const second = await openArchive(w.settingsFile);
  assert.equal(second.outcome, 'opened');
  if (first.outcome !== 'opened' || second.outcome !== 'opened') return;
  assert.equal(second.created, false);
  assert.deepEqual(second.archive, first.archive);
  assert.deepEqual(await snapshot(w.evidence), before);
});

test('an archive is created once: an empty folder where it was is reported and nothing is created', async (t) => {
  const w = await newWorkspace(t);
  const id = await created(w);
  // Left empty at the same path, as an unplugged drive's mount folder is.
  await emptyFolder(w.evidence);

  const result = await openArchive(w.settingsFile);
  assert.equal(result.outcome, 'archive-gone');
  assert.ok(result.outcome === 'archive-gone' && result.expectedArchiveId === id && result.message.includes(id));
  assert.deepEqual(await readdir(w.evidence), []);

  const status = await folderStatus(w.settingsFile);
  assert.equal(status.outcome === 'found' ? status.evidence.status : undefined, 'archive-gone');
  assert.deepEqual(await readdir(w.evidence), []);
});

test('a different archive at the evidence folder is reported and nothing is changed', async (t) => {
  const w = await newWorkspace(t);
  const id = await created(w);
  await writeFile(path.join(w.evidence, 'manifest.jsonl'), header('another-made-up-archive'));
  const before = await snapshot(w.evidence);

  const result = await openArchive(w.settingsFile);
  assert.equal(result.outcome, 'different-archive');
  if (result.outcome === 'different-archive') {
    assert.equal(result.expectedArchiveId, id);
    assert.equal(result.foundArchiveId, 'another-made-up-archive');
  }
  assert.deepEqual(await snapshot(w.evidence), before);
  const status = await folderStatus(w.settingsFile);
  assert.equal(status.outcome === 'found' ? status.evidence.status : undefined, 'different-archive');
});

test('an archive accepted at the evidence folder is remembered when it is opened', async (t) => {
  const w = await newWorkspace(t);
  await writeFile(path.join(w.evidence, 'manifest.jsonl'), header('accepted-made-up-archive'));
  await writeSettingsFile(w.settingsFile, { locations: { evidenceFolder: w.evidence, backupFolder: w.backup }, archiveId: null });
  assert.equal((await openArchive(w.settingsFile)).outcome, 'opened');
  const read = await readFolders(w.settingsFile);
  assert.equal(read.outcome === 'found' ? read.archiveId : undefined, 'accepted-made-up-archive');
});

test('an unknown manifest version is refused without changing anything', async (t) => {
  const w = await newWorkspace(t);
  await created(w);
  await writeFile(path.join(w.evidence, 'manifest.jsonl'), `${header('made-up-id', 2)}{"line":"entry"}\n`);
  const before = await snapshot(w.evidence);

  const result = await openArchive(w.settingsFile);
  assert.equal(result.outcome, 'unknown-version');
  assert.ok(result.outcome === 'unknown-version' && result.version === 2);
  assert.match(result.outcome === 'unknown-version' ? result.message : '', /version 2/);
  assert.deepEqual(await snapshot(w.evidence), before);
});

test('a folder that is not a valid archive is refused without changing anything', async (t) => {
  const cases: Record<string, [(folder: string) => Promise<void>, string]> = {
    'other files and no manifest': [(folder) => writeFile(path.join(folder, 'notes.txt'), 'made-up notes'), 'no-manifest'],
    'a manifest whose first line is not a header': [
      async (folder) => {
        await writeFile(path.join(folder, 'manifest.jsonl'), '{"line":"entry"}\n');
        await writeFile(path.join(folder, 'notes.txt'), 'made-up notes');
      },
      'bad-header',
    ],
    'a header line with no line end, beside other files': [
      async (folder) => {
        await writeFile(path.join(folder, 'manifest.jsonl'), header('made-up-id').trimEnd());
        await writeFile(path.join(folder, 'notes.txt'), 'made-up notes');
      },
      'bad-header',
    ],
    'a manifest that is a folder': [(folder) => mkdir(path.join(folder, 'manifest.jsonl')), 'no-manifest'],
  };
  for (const [name, [arrange, reason]] of Object.entries(cases)) {
    const w = await newWorkspace(t);
    await withFolders(w);
    await arrange(w.evidence);
    const before = await snapshot(w.evidence);

    const result = await openArchive(w.settingsFile);
    assert.equal(result.outcome, 'not-an-archive', name);
    assert.equal(result.outcome === 'not-an-archive' ? result.reason : undefined, reason, name);
    assert.ok(result.outcome === 'not-an-archive' && result.message.length > 0);
    assert.deepEqual(await snapshot(w.evidence), before, name);
  }
});

test('a creation that stopped partway is reported as such and left alone', async (t) => {
  const stopped: Record<string, (folder: string) => Promise<void>> = {
    'before the manifest': async (folder) => {
      await mkdir(path.join(folder, 'originals'));
      await writeFile(path.join(folder, 'READ-ME.txt'), 'part of a read-me');
    },
    'while writing the manifest': async (folder) => {
      await mkdir(path.join(folder, 'originals'));
      await mkdir(path.join(folder, 'decisions'));
      await mkdir(path.join(folder, 'receipts'));
      await writeFile(path.join(folder, 'READ-ME.txt'), 'a read-me');
      await writeFile(path.join(folder, 'manifest.jsonl'), '{"line":"head');
    },
  };
  for (const [name, arrange] of Object.entries(stopped)) {
    const w = await newWorkspace(t);
    await withFolders(w);
    await arrange(w.evidence);
    const before = await snapshot(w.evidence);
    const result = await openArchive(w.settingsFile);
    assert.equal(result.outcome === 'not-an-archive' ? result.reason : result.outcome, 'unfinished-creation', name);
    assert.match(result.outcome === 'not-an-archive' ? result.message : '', /stopped partway/);
    assert.deepEqual(await snapshot(w.evidence), before, name);
  }
});

test('creating never replaces a file that appeared after the folder was found empty', async (t) => {
  for (const name of ['READ-ME.txt', 'manifest.jsonl']) {
    const w = await newWorkspace(t);
    await writeFile(path.join(w.evidence, name), 'arrived in the meantime');
    const result = await createArchive(w.evidence);
    assert.equal(result.outcome, 'creation-stopped', name);
    assert.match(result.outcome === 'creation-stopped' ? result.message : '', /stopped partway/);
    assert.equal(await readFile(path.join(w.evidence, name), 'utf8'), 'arrived in the meantime', name);
    if (name === 'READ-ME.txt') {
      assert.equal(await exists(path.join(w.evidence, 'manifest.jsonl')), false);
    }
  }
});

test('a missing saved evidence folder is reported and never replaced by a new empty archive', async (t) => {
  const w = await newWorkspace(t);
  await withFolders(w);
  // As if the drive holding it were unplugged before any archive was made.
  await rm(w.evidence, { recursive: true });

  const result = await openArchive(w.settingsFile);
  assert.equal(result.outcome, 'missing');
  assert.ok(result.outcome === 'missing' && result.folder === w.evidence && result.message.includes(w.evidence));
  assert.equal(await exists(w.evidence), false);

  const status = await folderStatus(w.settingsFile);
  assert.equal(status.outcome === 'found' ? status.evidence.status : undefined, 'missing');
  assert.equal(await exists(w.evidence), false);
});

test('a missing archive folder is reported once an archive was made there', async (t) => {
  const w = await newWorkspace(t);
  await created(w);
  await rename(w.evidence, path.join(w.root, 'unplugged'));
  assert.equal((await openArchive(w.settingsFile)).outcome, 'missing');
  assert.equal(await exists(w.evidence), false);
});

test('an evidence folder that goes missing just before creating is not made again', async (t) => {
  const w = await newWorkspace(t);
  const gone = path.join(w.root, 'gone');
  const result = await createArchive(gone);
  assert.equal(result.outcome, 'missing');
  assert.equal(await exists(gone), false);
});

test('an evidence path that is a file is reported, not opened', async (t) => {
  const w = await newWorkspace(t);
  const file = path.join(w.root, 'evidence-file');
  await writeFile(file, 'made-up text');
  await writeSettingsFile(w.settingsFile, { locations: { evidenceFolder: file, backupFolder: w.backup }, archiveId: null });
  const result = await openArchive(w.settingsFile);
  assert.equal(result.outcome === 'not-an-archive' ? result.reason : result.outcome, 'not-a-folder');
  assert.equal(await readFile(file, 'utf8'), 'made-up text');
});

test('an evidence folder that cannot be read is unavailable, not empty, and nothing is created', async (t) => {
  const w = await newWorkspace(t);
  await withFolders(w);
  await rm(w.evidence, { recursive: true });
  await linkLoop(w, w.evidence);

  const result = await openArchive(w.settingsFile);
  assert.equal(result.outcome, 'unavailable');
  const status = await folderStatus(w.settingsFile);
  assert.equal(status.outcome === 'found' ? status.evidence.status : undefined, 'unavailable');
  // The backup folder is still reported.
  assert.equal(status.outcome === 'found' ? status.backup.status : undefined, 'present');
  assert.equal(await exists(path.join(w.root, 'loop-evidence', 'manifest.jsonl')), false);
});

test('an evidence folder without permission to read it is unavailable (Linux)', async (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows ignores these permission bits on folders.');
    return;
  }
  if (process.getuid?.() === 0) {
    t.skip('The system administrator account can read any folder.');
    return;
  }
  const w = await newWorkspace(t);
  await withFolders(w);
  await chmod(w.evidence, 0o000);
  try {
    assert.equal((await openArchive(w.settingsFile)).outcome, 'unavailable');
  } finally {
    // Readable again, so the clean-up can remove it.
    await chmod(w.evidence, 0o700);
  }
  assert.deepEqual(await readdir(w.evidence), []);
});

test('a backup folder that is missing, not a folder, or cannot be read is reported beside the evidence folder', async (t) => {
  const w = await newWorkspace(t);
  await created(w);
  const statusOf = async () => {
    const status = await folderStatus(w.settingsFile);
    assert.equal(status.outcome === 'found' ? status.evidence.status : undefined, 'archive');
    return status.outcome === 'found' ? status.backup.status : undefined;
  };
  assert.equal(await statusOf(), 'present');
  await rm(w.backup, { recursive: true });
  assert.equal(await statusOf(), 'missing');
  await writeFile(w.backup, 'made-up text');
  assert.equal(await statusOf(), 'not-a-folder');
  await rm(w.backup);
  await linkLoop(w, w.backup);
  assert.equal(await statusOf(), 'unavailable');
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

  await writeFile(path.join(w.evidence, 'manifest.jsonl'), header('made-up-id', 3));
  status = await folderStatus(w.settingsFile);
  assert.equal(
    status.outcome === 'found' && status.evidence.status === 'not-an-archive' ? status.evidence.reason : undefined,
    'unknown-version',
  );

  await rm(w.evidence, { recursive: true });
  status = await folderStatus(w.settingsFile);
  assert.equal(status.outcome === 'found' ? status.evidence.status : undefined, 'missing');
});
