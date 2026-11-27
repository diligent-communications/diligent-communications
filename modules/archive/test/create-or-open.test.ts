import assert from 'node:assert/strict';
import { chmod, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { folderStatus, openArchive, readFolders, setFolders } from '../src/archive.ts';
import { createArchive } from '../src/evidence-folder.ts';
import { fileProblem } from '../src/files.ts';
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

// The program's own read-me, taken from an archive made in another
// temporary folder.
async function programReadMe(t: TestContext): Promise<string> {
  const other = await newWorkspace(t);
  await created(other);
  return readFile(path.join(other.evidence, 'READ-ME.txt'), 'utf8');
}

// No message from this module may advise emptying or deleting a folder.
function assertNoEmptyingAdvice(message: string): void {
  assert.doesNotMatch(message, /empty (this|it|the folder)|delete|remove/i);
}

test('a creation that stopped partway is reported as such and left alone', async (t) => {
  const readMe = await programReadMe(t);
  const stopped: Record<string, (folder: string) => Promise<void>> = {
    'after the first record folder': (folder) => mkdir(path.join(folder, 'originals')),
    'while writing the read-me': async (folder) => {
      for (const name of ['originals', 'decisions', 'receipts']) await mkdir(path.join(folder, name));
      await writeFile(path.join(folder, 'READ-ME.txt'), readMe.slice(0, 200));
    },
    'while writing the manifest': async (folder) => {
      for (const name of ['originals', 'decisions', 'receipts']) await mkdir(path.join(folder, name));
      await writeFile(path.join(folder, 'READ-ME.txt'), readMe);
      await writeFile(path.join(folder, 'manifest.jsonl'), '{"line":"header","manifest_version":1,"archive_id":"3f2b8c1e-7d');
    },
    'with an empty manifest': async (folder) => {
      for (const name of ['originals', 'decisions', 'receipts']) await mkdir(path.join(folder, name));
      await writeFile(path.join(folder, 'READ-ME.txt'), readMe);
      await writeFile(path.join(folder, 'manifest.jsonl'), '');
    },
  };
  for (const [name, arrange] of Object.entries(stopped)) {
    const w = await newWorkspace(t);
    await withFolders(w);
    await arrange(w.evidence);
    const before = await snapshot(w.evidence);
    const result = await openArchive(w.settingsFile);
    assert.equal(result.outcome === 'not-an-archive' ? result.reason : result.outcome, 'unfinished-creation', name);
    const message = result.outcome === 'not-an-archive' ? result.message : '';
    assert.match(message, /stopped partway/);
    assert.match(message, /Choose a new empty folder/);
    assertNoEmptyingAdvice(message);
    assert.deepEqual(await snapshot(w.evidence), before, name);
  }
});

test('a person\'s files are never called a stopped creation', async (t) => {
  const readMe = await programReadMe(t);
  const cases: Record<string, [(folder: string) => Promise<void>, string]> = {
    'a record folder with a file in it': [
      async (folder) => {
        await mkdir(path.join(folder, 'receipts'));
        await writeFile(path.join(folder, 'receipts', 'made-up.pdf'), 'made-up receipt');
      },
      'no-manifest',
    ],
    'an empty manifest beside saved files': [
      async (folder) => {
        await mkdir(path.join(folder, 'originals'));
        await writeFile(path.join(folder, 'originals', 'made-up.eml'), 'made-up mail');
        await writeFile(path.join(folder, 'manifest.jsonl'), '');
      },
      'bad-header',
    ],
    'a read-me that is not the program\'s own': [
      async (folder) => {
        await mkdir(path.join(folder, 'originals'));
        await writeFile(path.join(folder, 'READ-ME.txt'), 'a person\'s own notes');
      },
      'no-manifest',
    ],
    'a record name that is a file': [
      async (folder) => {
        await writeFile(path.join(folder, 'decisions'), 'made-up text');
        await writeFile(path.join(folder, 'READ-ME.txt'), readMe);
      },
      'no-manifest',
    ],
    'a manifest that is not the start of a header': [
      async (folder) => {
        await mkdir(path.join(folder, 'originals'));
        await writeFile(path.join(folder, 'manifest.jsonl'), 'made-up notes');
      },
      'bad-header',
    ],
  };
  for (const [name, [arrange, reason]] of Object.entries(cases)) {
    const w = await newWorkspace(t);
    await withFolders(w);
    await arrange(w.evidence);
    const before = await snapshot(w.evidence);
    const result = await openArchive(w.settingsFile);
    assert.equal(result.outcome === 'not-an-archive' ? result.reason : result.outcome, reason, name);
    assertNoEmptyingAdvice(result.outcome === 'not-an-archive' ? result.message : '');
    assert.deepEqual(await snapshot(w.evidence), before, name);
  }
});

test('with a remembered archive ID, the remains of an archive are never called a stopped creation', async (t) => {
  const w = await newWorkspace(t);
  await created(w);
  // The manifest is gone; only the empty record folders and the read-me stay.
  await rm(path.join(w.evidence, 'manifest.jsonl'));
  const before = await snapshot(w.evidence);
  const result = await openArchive(w.settingsFile);
  assert.equal(result.outcome === 'not-an-archive' ? result.reason : result.outcome, 'no-manifest');
  assertNoEmptyingAdvice(result.outcome === 'not-an-archive' ? result.message : '');
  assert.deepEqual(await snapshot(w.evidence), before);

  await writeFile(path.join(w.evidence, 'manifest.jsonl'), '{"line":"head');
  const cut = await openArchive(w.settingsFile);
  assert.equal(cut.outcome === 'not-an-archive' ? cut.reason : cut.outcome, 'bad-header');
});

test('when the first creating step fails, nothing is reported as a stopped creation', async (t) => {
  // Another open got there first: the first record folder already exists.
  const w = await newWorkspace(t);
  await mkdir(path.join(w.evidence, 'originals'));
  const result = await createArchive(w.evidence);
  assert.equal(result.outcome, 'not-created');
  assert.match(result.outcome === 'not-created' ? result.message : '', /nothing was written/);
  assert.deepEqual(await readdir(w.evidence), ['originals']);
});

test('a read-only evidence folder is not created in and not called a stopped creation (Linux)', async (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows ignores these permission bits on folders.');
    return;
  }
  if (process.getuid?.() === 0) {
    t.skip('The system administrator account can write to any folder.');
    return;
  }
  const w = await newWorkspace(t);
  await withFolders(w);
  await chmod(w.evidence, 0o555);
  try {
    const result = await openArchive(w.settingsFile);
    assert.equal(result.outcome, 'not-created');
  } finally {
    await chmod(w.evidence, 0o755);
  }
  assert.deepEqual(await readdir(w.evidence), []);
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

test('a backup folder without permission to list it is unavailable, beside the evidence folder (Linux)', async (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows ignores these permission bits on folders.');
    return;
  }
  if (process.getuid?.() === 0) {
    t.skip('The system administrator account can read any folder.');
    return;
  }
  const w = await newWorkspace(t);
  await created(w);
  await chmod(w.backup, 0o000);
  try {
    const status = await folderStatus(w.settingsFile);
    assert.equal(status.outcome === 'found' ? status.backup.status : undefined, 'unavailable');
    assert.equal(status.outcome === 'found' ? status.evidence.status : undefined, 'archive');
  } finally {
    await chmod(w.backup, 0o700);
  }
});

test('an archive created when its ID cannot be remembered says so, and the next open remembers it', async (t) => {
  if (process.platform !== 'win32' && process.getuid?.() === 0) {
    t.skip('The system administrator account can write to any folder.');
    return;
  }
  const w = await newWorkspace(t);
  await withFolders(w);
  // Windows refuses to replace a read-only file; Linux refuses new names in a
  // folder without write permission.
  const blocked = process.platform === 'win32' ? w.settingsFile : path.dirname(w.settingsFile);
  const blockedMode = process.platform === 'win32' ? 0o444 : 0o555;
  const openMode = process.platform === 'win32' ? 0o666 : 0o755;
  await chmod(blocked, blockedMode);
  let result: Awaited<ReturnType<typeof openArchive>>;
  try {
    result = await openArchive(w.settingsFile);
  } finally {
    await chmod(blocked, openMode);
  }
  assert.equal(result.outcome, 'opened');
  if (result.outcome !== 'opened') return;
  assert.equal(result.created, true);
  assert.equal(result.remembered, false);
  assert.match(result.remembered ? '' : result.message, /created, but its ID could not be remembered/);
  const before = await readFolders(w.settingsFile);
  assert.equal(before.outcome === 'found' ? before.archiveId : undefined, null);

  const again = await openArchive(w.settingsFile);
  assert.ok(again.outcome === 'opened' && !again.created && again.remembered);
  const after = await readFolders(w.settingsFile);
  assert.equal(after.outcome === 'found' ? after.archiveId : undefined, result.archive.archiveId);
});

test('only the file system problems it names are treated as unavailable', () => {
  const failure = (code: string) => Object.assign(new Error(code), { code });
  assert.deepEqual(fileProblem(failure('ENOENT')), { problem: 'missing', code: 'ENOENT' });
  assert.deepEqual(fileProblem(failure('ENOTDIR')), { problem: 'missing', code: 'ENOTDIR' });
  for (const code of ['EACCES', 'EPERM', 'ELOOP', 'EIO', 'UNKNOWN']) {
    assert.deepEqual(fileProblem(failure(code)), { problem: 'unavailable', code });
  }
  // A fault in the program is passed on, not reported as an unreadable folder.
  for (const error of [failure('ERR_INVALID_ARG_TYPE'), failure('EEXIST'), new Error('not from the file system')]) {
    assert.throws(() => fileProblem(error), (thrown) => thrown === error);
  }
});
