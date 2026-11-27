import assert from 'node:assert/strict';
import fsp, { chmod, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { mock, test, type TestContext } from 'node:test';
import { formatManifestHeader, newManifestHeader, readManifestHeader } from '../../../contracts/manifest-header.ts';
import { folderStatus, openArchive, readFolders, setFolders } from '../src/archive.ts';
import { createArchive } from '../src/evidence-folder.ts';
import { fileProblem } from '../src/files.ts';
import {
  backupMessages,
  bothFoldersMessages,
  evidenceMessages,
  notices,
  originalMessages,
  pairMessages,
  settingsFileMessages,
} from '../src/messages.ts';
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
  assert.equal(result.outcome, 'unknown-manifest-version');
  assert.ok(result.outcome === 'unknown-manifest-version' && result.version === 2);
  assert.match(result.outcome === 'unknown-manifest-version' ? result.message : '', /version 2/);
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

// No message from this module may give advice: what to do next belongs to the
// surface that shows the result.
function assertNoAdvice(message: string): void {
  assert.doesNotMatch(
    message,
    /\b(choose|chose|pick|select|empty (this|it|that|the|your)|delete|remove|reconnect|plug it|try again|update|instead|you can|you should|should|must|please)\b|\breplace (it|the|this)\b/i,
    message,
  );
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
      // Cut off inside the creation time, past the archive ID.
      const line = formatManifestHeader(newManifestHeader('3f2b8c1e-7d4a-4f6b-9a2e-5c1d0e8f7a6b', new Date(0)));
      await writeFile(path.join(folder, 'manifest.jsonl'), line.slice(0, line.length - 8));
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
    assertNoAdvice(message);
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
    assertNoAdvice(result.outcome === 'not-an-archive' ? result.message : '');
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
  assertNoAdvice(result.outcome === 'not-an-archive' ? result.message : '');
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
    // A person's file is now there, so the folder is not a stopped creation.
    assert.equal(result.outcome, 'creation-incomplete', name);
    assert.match(result.outcome === 'creation-incomplete' ? result.message : '', /did not complete/);
    assert.equal(await readFile(path.join(w.evidence, name), 'utf8'), 'arrived in the meantime', name);
    if (name === 'READ-ME.txt') {
      assert.equal(await exists(path.join(w.evidence, 'manifest.jsonl')), false);
    }
  }
});

test('a creation that fails partway with only its own leftovers is a stopped creation', async (t) => {
  const w = await newWorkspace(t);
  // Something made the manifest name, empty, just before this creation did.
  await writeFile(path.join(w.evidence, 'manifest.jsonl'), '');
  const result = await createArchive(w.evidence);
  assert.equal(result.outcome, 'creation-stopped');
  assert.equal(await readFile(path.join(w.evidence, 'manifest.jsonl'), 'utf8'), '');
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
  const missing = await folderStatus(w.settingsFile);
  assert.equal(
    missing.outcome === 'found' && missing.backup.status === 'missing' ? missing.backup.message : undefined,
    `The backup folder ${w.backup} cannot be found.`,
  );
  await writeFile(w.backup, 'made-up text');
  assert.equal(await statusOf(), 'not-a-folder');
  await rm(w.backup);
  await linkLoop(w, w.backup);
  assert.equal(await statusOf(), 'unavailable');
});

test('folder status reports present and valid, empty, missing, or not an archive', async (t) => {
  const w = await newWorkspace(t);
  const unset = await folderStatus(w.settingsFile);
  assert.equal(unset.outcome, 'not-set');
  assert.equal(
    unset.outcome === 'not-set' ? unset.message : undefined,
    `The folder settings file ${w.settingsFile} cannot be found.`,
  );
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
  assert.match(result.remembered ? '' : result.message, /was created, but its ID could not be saved/);
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
  for (const code of [
    'EACCES', 'EPERM', 'ELOOP', 'EIO', 'UNKNOWN',
    // A share or network folder that stops answering.
    'ECONNRESET', 'ENOTCONN', 'ECONNABORTED', 'ECONNREFUSED', 'EHOSTDOWN', 'ENETDOWN', 'ENONET', 'EREMOTEIO', 'ETIMEDOUT',
  ]) {
    assert.deepEqual(fileProblem(failure(code)), { problem: 'unavailable', code });
  }
  // A fault in the program is passed on, not reported as an unreadable folder.
  for (const error of [failure('ERR_INVALID_ARG_TYPE'), failure('EEXIST'), new Error('not from the file system')]) {
    assert.throws(() => fileProblem(error), (thrown) => thrown === error);
  }
});

// Makes the file system answer for one folder the way a share that stopped
// answering does, using Node's own test mocks. Nothing on disk is touched.
async function withShareFailure<T>(folder: string, code: string, run: () => Promise<T>): Promise<T> {
  const fail = () => Promise.reject(Object.assign(new Error(`made-up ${code}`), { code }));
  const original = { stat: fsp.stat, readdir: fsp.readdir };
  const stats = mock.method(fsp, 'stat', ((target: string, ...rest: unknown[]) =>
    target === folder ? fail() : (original.stat as (...args: unknown[]) => unknown)(target, ...rest)) as typeof fsp.stat);
  const lists = mock.method(fsp, 'readdir', ((target: string, ...rest: unknown[]) =>
    target === folder ? fail() : (original.readdir as (...args: unknown[]) => unknown)(target, ...rest)) as typeof fsp.readdir);
  syncBuiltinESMExports();
  try {
    return await run();
  } finally {
    stats.mock.restore();
    lists.mock.restore();
    syncBuiltinESMExports();
  }
}

test('a share that stops answering is unavailable, and never hides the other folder', async (t) => {
  const w = await newWorkspace(t);
  await created(w);
  for (const code of ['ECONNRESET', 'ENOTCONN', 'ECONNABORTED', 'EHOSTDOWN', 'ENETDOWN']) {
    const backup = await withShareFailure(w.backup, code, () => folderStatus(w.settingsFile));
    assert.equal(backup.outcome === 'found' ? backup.backup.status : undefined, 'unavailable', code);
    assert.equal(backup.outcome === 'found' ? backup.evidence.status : undefined, 'archive', code);

    const evidence = await withShareFailure(w.evidence, code, () => folderStatus(w.settingsFile));
    assert.equal(evidence.outcome === 'found' ? evidence.evidence.status : undefined, 'unavailable', code);
    assert.equal(evidence.outcome === 'found' ? evidence.backup.status : undefined, 'present', code);

    const opened = await withShareFailure(w.evidence, code, () => openArchive(w.settingsFile));
    assert.equal(opened.outcome, 'unavailable', code);
  }
});

test('a fully written archive whose last flush fails is reported as created, with a notice (Linux)', async (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows has no folder flush step, and ignores these permission bits on folders.');
    return;
  }
  if (process.getuid?.() === 0) {
    t.skip('The system administrator account can read any folder.');
    return;
  }
  const w = await newWorkspace(t);
  // Write and search permission, but not read: files can be made, and the
  // folder cannot be opened to flush it.
  await chmod(w.evidence, 0o300);
  let result: Awaited<ReturnType<typeof createArchive>>;
  try {
    result = await createArchive(w.evidence);
  } finally {
    await chmod(w.evidence, 0o755);
  }
  assert.equal(result.outcome, 'created');
  assert.match(result.outcome === 'created' ? (result.notice ?? '') : '', /fully written/);
  const status = await withFolders(w).then(() => folderStatus(w.settingsFile));
  assert.equal(status.outcome === 'found' ? status.evidence.status : undefined, 'archive');
});

test('no message the archive can return gives advice, and each names the right folder or file', () => {
  const call = (fn: unknown, ...args: string[]) => (fn as (...a: string[]) => string)(...args);
  const groups: [Record<string, unknown>, (text: string, name: string) => void][] = [
    [settingsFileMessages, (text, name) => assert.match(text, /folder settings|have not been chosen/, name)],
    [evidenceMessages, (text, name) => {
      assert.match(text, /evidence folder/, name);
      assert.doesNotMatch(text, /backup/, name);
    }],
    [backupMessages, (text, name) => {
      assert.match(text, /backup folder/, name);
      assert.doesNotMatch(text, /evidence/, name);
    }],
    [bothFoldersMessages, (text, name) => assert.match(text, /folder/, name)],
    [notices, (text, name) => assert.ok(text.length > 0, name)],
    [originalMessages, (text, name) => assert.ok(text.length > 0, name)],
  ];
  let counted = 0;
  for (const [group, check] of groups) {
    for (const [name, fn] of Object.entries(group)) {
      const text = call(fn, '/made/up/place', 'MADE-UP', 'MADE-UP-2');
      assertNoAdvice(text);
      check(text, name);
      counted += 1;
    }
  }
  // Messages about one folder of the pair name that folder, and no other.
  for (const [name, fn] of Object.entries(pairMessages)) {
    const backup = call(fn, 'backup folder', '/made/up/place', 'MADE-UP');
    assertNoAdvice(backup);
    assert.match(backup, /backup folder/, name);
    assert.doesNotMatch(backup, /evidence/, name);
    const evidence = call(fn, 'evidence folder', '/made/up/place', 'MADE-UP');
    assert.doesNotMatch(evidence, /backup/, name);
    counted += 1;
  }
  const all = [settingsFileMessages, evidenceMessages, backupMessages, bothFoldersMessages, notices, originalMessages, pairMessages];
  assert.equal(counted, all.reduce((sum, group) => sum + Object.keys(group).length, 0));

  // The manifest's own message about a newer version, as the archive returns it.
  const newer = readManifestHeader('{"line":"header","manifest_version":2,"archive_id":"x","created_at":"2026-01-01T00:00:00.000Z"}');
  assert.ok(newer.outcome === 'unknown-version');
  assertNoAdvice(evidenceMessages.unknownManifestVersion(newer.outcome === 'unknown-version' ? newer.message : '', '/made/up'));
});

// Makes opening this file hand back a handle whose write, flush or close
// fails after the contents are written, using Node's own test mocks. The
// file is still written and closed for real, inside the test's folder.
async function withFileStepFailure<T>(file: string, step: 'writeFile' | 'sync' | 'close', run: () => Promise<T>): Promise<T> {
  const original = fsp.open;
  const fail = () => Object.assign(new Error(`made-up ${step} failure`), { code: 'EIO' });
  const opens = mock.method(fsp, 'open', (async (target: string, ...rest: unknown[]) => {
    const handle = await (original as (...args: unknown[]) => Promise<fsp.FileHandle>)(target, ...rest);
    if (target !== file) {
      return handle;
    }
    return {
      writeFile: async (...args: unknown[]) => {
        await (handle.writeFile as (...a: unknown[]) => Promise<void>)(...args);
        if (step === 'writeFile') throw fail();
      },
      sync: async () => {
        if (step === 'sync') throw fail();
        await handle.sync();
      },
      close: async () => {
        await handle.close();
        if (step === 'close') throw fail();
      },
    };
  }) as typeof fsp.open);
  syncBuiltinESMExports();
  try {
    return await run();
  } finally {
    opens.mock.restore();
    syncBuiltinESMExports();
  }
}

test('opening reports creation with the actual failed step when the full header can be read back', async (t) => {
  for (const [step, words] of [
    ['writeFile', 'writing the manifest file'],
    ['sync', 'flushing the manifest file'],
    ['close', 'closing the manifest file'],
  ] as const) {
    const w = await newWorkspace(t);
    await withFolders(w);
    const file = path.join(w.evidence, 'manifest.jsonl');
    const result = await withFileStepFailure(file, step, () => openArchive(w.settingsFile));
    assert.equal(result.outcome, 'opened', step);
    assert.ok(result.outcome === 'opened' && result.created);
    assert.match(result.notice ?? '', new RegExp(`fully written, but ${words}`), step);
    assertNoAdvice(result.notice ?? '');
    assert.equal(JSON.parse(await readFile(file, 'utf8')).archive_id, result.archive.archiveId);
  }
});

test('a creation that fails when the folder cannot be read again says only that', async (t) => {
  const w = await newWorkspace(t);
  // Writing the read-me fails, and the folder then stops answering.
  const result = await withFileStepFailure(path.join(w.evidence, 'READ-ME.txt'), 'sync', () =>
    withShareFailure(path.join(w.evidence), 'ECONNRESET', async () => {
      // The record folders are made before the share fails.
      return createArchive(w.evidence);
    }),
  );
  assert.equal(result.outcome, 'creation-unchecked');
  const message = result.outcome === 'creation-unchecked' ? result.message : '';
  assert.match(message, /could not be read afterwards \(ECONNRESET\)/);
  assert.doesNotMatch(message, /holds|leftovers|stopped partway|something else|did not complete/);
  assertNoAdvice(message);
});

test('an archive ID saved while the settings folder cannot be flushed is remembered, with a notice (Linux)', async (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows has no folder flush step, and ignores these permission bits on folders.');
    return;
  }
  if (process.getuid?.() === 0) {
    t.skip('The system administrator account can read any folder.');
    return;
  }
  const w = await newWorkspace(t);
  await withFolders(w);
  const settingsFolder = path.dirname(w.settingsFile);
  // Write and search permission, but not read.
  await chmod(settingsFolder, 0o300);
  let result: Awaited<ReturnType<typeof openArchive>>;
  try {
    result = await openArchive(w.settingsFile);
  } finally {
    await chmod(settingsFolder, 0o700);
  }
  assert.equal(result.outcome, 'opened');
  assert.ok(result.outcome === 'opened' && result.remembered);
  assert.match(result.outcome === 'opened' && result.remembered ? (result.rememberNotice ?? '') : '', /was replaced, but forcing it to disk then failed/);
  const read = await readFolders(w.settingsFile);
  assert.equal(read.outcome === 'found' ? read.archiveId : undefined, result.outcome === 'opened' ? result.archive.archiveId : '');
});
