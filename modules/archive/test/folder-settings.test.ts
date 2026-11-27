import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { link, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { openArchive, readFolders, setFolders } from '../src/archive.ts';
import { exists, folderLink, newWorkspace } from './helpers/workspace.ts';

const onWindows = process.platform === 'win32';

async function assertRefused(
  result: Awaited<ReturnType<typeof setFolders>>,
  reason: string,
  settingsFile: string,
): Promise<void> {
  assert.equal(result.outcome, 'refused');
  assert.equal(result.outcome === 'refused' ? result.reason : undefined, reason);
  assert.ok(result.outcome === 'refused' && result.message.length > 0);
  assert.equal(await exists(settingsFile), false, 'a refused setting saves nothing');
}

test('setting the folders saves both locations', async (t) => {
  const w = await newWorkspace(t);
  const result = await setFolders(w.settingsFile, { evidenceFolder: w.evidence, backupFolder: w.backup });
  assert.equal(result.outcome, 'saved');
  assert.deepEqual(await readFolders(w.settingsFile), {
    outcome: 'found',
    locations: { evidenceFolder: w.evidence, backupFolder: w.backup },
  });
});

test('setting the folders requires two full paths', async (t) => {
  const w = await newWorkspace(t);
  const notFull = ['', 'evidence', path.join('.', 'evidence'), path.join('..', 'evidence')];
  if (onWindows) {
    // Relative to the current drive, or to the current folder on a drive.
    notFull.push('\\evidence', 'C:evidence');
  }
  for (const given of notFull) {
    await assertRefused(
      await setFolders(w.settingsFile, { evidenceFolder: given, backupFolder: w.backup }),
      'not-full-path',
      w.settingsFile,
    );
    await assertRefused(
      await setFolders(w.settingsFile, { evidenceFolder: w.evidence, backupFolder: given }),
      'not-full-path',
      w.settingsFile,
    );
  }
});

test('the evidence and backup folders cannot be the same folder', async (t) => {
  const w = await newWorkspace(t);
  await assertRefused(
    await setFolders(w.settingsFile, { evidenceFolder: w.evidence, backupFolder: w.evidence }),
    'same-folder',
    w.settingsFile,
  );
  await assertRefused(
    await setFolders(w.settingsFile, { evidenceFolder: w.evidence, backupFolder: `${w.evidence}${path.sep}` }),
    'same-folder',
    w.settingsFile,
  );
  if (onWindows) {
    await assertRefused(
      await setFolders(w.settingsFile, { evidenceFolder: w.evidence, backupFolder: w.evidence.toUpperCase() }),
      'same-folder',
      w.settingsFile,
    );
  }
});

test('neither folder may be inside the other', async (t) => {
  const w = await newWorkspace(t);
  const inBackup = path.join(w.backup, 'evidence');
  const inEvidence = path.join(w.evidence, 'backup');
  await mkdir(inBackup);
  await mkdir(inEvidence);
  await assertRefused(
    await setFolders(w.settingsFile, { evidenceFolder: inBackup, backupFolder: w.backup }),
    'nested',
    w.settingsFile,
  );
  await assertRefused(
    await setFolders(w.settingsFile, { evidenceFolder: w.evidence, backupFolder: inEvidence }),
    'nested',
    w.settingsFile,
  );
  // A shared start of the name is not nesting.
  const pair = path.join(w.root, 'pair');
  const sibling = `${pair}-backup`;
  await mkdir(pair);
  await mkdir(sibling);
  const result = await setFolders(w.settingsFile, { evidenceFolder: pair, backupFolder: sibling });
  assert.equal(result.outcome, 'saved');
});

test('neither folder may be a drive root', async (t) => {
  const w = await newWorkspace(t);
  const driveRoot = path.parse(w.root).root;
  await assertRefused(
    await setFolders(w.settingsFile, { evidenceFolder: driveRoot, backupFolder: w.backup }),
    'drive-root',
    w.settingsFile,
  );
  await assertRefused(
    await setFolders(w.settingsFile, { evidenceFolder: w.evidence, backupFolder: driveRoot }),
    'drive-root',
    w.settingsFile,
  );
});

test('a folder link cannot get around the folder rules', async (t) => {
  const w = await newWorkspace(t);
  const toEvidence = path.join(w.root, 'link-to-evidence');
  await folderLink(w.evidence, toEvidence);
  await assertRefused(
    await setFolders(w.settingsFile, { evidenceFolder: w.evidence, backupFolder: toEvidence }),
    'same-folder',
    w.settingsFile,
  );

  const inside = path.join(w.backup, 'inner');
  await mkdir(inside);
  const toInside = path.join(w.root, 'link-to-inner');
  await folderLink(inside, toInside);
  await assertRefused(
    await setFolders(w.settingsFile, { evidenceFolder: toInside, backupFolder: w.backup }),
    'nested',
    w.settingsFile,
  );

  const toRoot = path.join(w.root, 'link-to-root');
  await folderLink(path.parse(w.root).root, toRoot);
  await assertRefused(
    await setFolders(w.settingsFile, { evidenceFolder: w.evidence, backupFolder: toRoot }),
    'drive-root',
    w.settingsFile,
  );
});

test('a folder reached through a link is saved as its real location', async (t) => {
  const w = await newWorkspace(t);
  const toBackup = path.join(w.root, 'link-to-backup');
  await folderLink(w.backup, toBackup);
  const result = await setFolders(w.settingsFile, { evidenceFolder: w.evidence, backupFolder: toBackup });
  assert.equal(result.outcome, 'saved');
  assert.deepEqual(await readFolders(w.settingsFile), {
    outcome: 'found',
    locations: { evidenceFolder: w.evidence, backupFolder: w.backup },
  });
});

test('the settings file must stay outside both folders', async (t) => {
  const w = await newWorkspace(t);
  for (const settingsFile of [
    path.join(w.evidence, 'archive-settings.json'),
    path.join(w.backup, 'local-data', 'archive-settings.json'),
  ]) {
    await assertRefused(
      await setFolders(settingsFile, { evidenceFolder: w.evidence, backupFolder: w.backup }),
      'settings-inside',
      settingsFile,
    );
  }
  // Through a link, too.
  const toBackup = path.join(w.root, 'link-to-backup');
  await folderLink(w.backup, toBackup);
  const settingsFile = path.join(toBackup, 'archive-settings.json');
  await assertRefused(
    await setFolders(settingsFile, { evidenceFolder: w.evidence, backupFolder: w.backup }),
    'settings-inside',
    settingsFile,
  );
  assert.deepEqual(await readdir(w.backup), []);
});

test('both folders must already exist; nothing is created in their place', async (t) => {
  const w = await newWorkspace(t);
  const gone = path.join(w.root, 'not-there');
  await assertRefused(
    await setFolders(w.settingsFile, { evidenceFolder: gone, backupFolder: w.backup }),
    'missing',
    w.settingsFile,
  );
  await assertRefused(
    await setFolders(w.settingsFile, { evidenceFolder: w.evidence, backupFolder: gone }),
    'missing',
    w.settingsFile,
  );
  assert.equal(await exists(gone), false);
});

test('a file is not accepted as a folder', async (t) => {
  const w = await newWorkspace(t);
  const file = path.join(w.root, 'a-file.txt');
  await writeFile(file, 'made-up text');
  await assertRefused(
    await setFolders(w.settingsFile, { evidenceFolder: file, backupFolder: w.backup }),
    'not-a-folder',
    w.settingsFile,
  );
  await assertRefused(
    await setFolders(w.settingsFile, { evidenceFolder: w.evidence, backupFolder: file }),
    'not-a-folder',
    w.settingsFile,
  );
});

test('a new evidence folder is accepted only if it is empty or already an archive', async (t) => {
  const w = await newWorkspace(t);
  const empty = await setFolders(w.settingsFile, { evidenceFolder: w.evidence, backupFolder: w.backup });
  assert.equal(empty.outcome === 'saved' ? empty.evidenceFolder : undefined, 'empty');

  assert.equal((await openArchive(w.settingsFile)).outcome, 'opened');
  const archive = await setFolders(w.settingsFile, { evidenceFolder: w.evidence, backupFolder: w.backup });
  assert.equal(archive.outcome === 'saved' ? archive.evidenceFolder : undefined, 'archive');

  const other = path.join(w.root, 'other');
  await mkdir(other);
  await writeFile(path.join(other, 'notes.txt'), 'made-up notes');
  const settingsFile = path.join(w.root, 'second-local-data', 'archive-settings.json');
  await assertRefused(
    await setFolders(settingsFile, { evidenceFolder: other, backupFolder: w.backup }),
    'evidence-not-empty',
    settingsFile,
  );
  // The backup folder may hold other files.
  const saved = await setFolders(settingsFile, { evidenceFolder: w.evidence, backupFolder: other });
  assert.equal(saved.outcome, 'saved');
});

test('an evidence folder with a manifest version this program does not know is refused', async (t) => {
  const w = await newWorkspace(t);
  const header = { line: 'header', manifest_version: 2, archive_id: 'made-up-id', created_at: '2026-01-01T00:00:00.000Z' };
  await writeFile(path.join(w.evidence, 'manifest.jsonl'), `${JSON.stringify(header)}\n`);
  await assertRefused(
    await setFolders(w.settingsFile, { evidenceFolder: w.evidence, backupFolder: w.backup }),
    'unknown-manifest-version',
    w.settingsFile,
  );
});

test('both folders on the same drive give a warning, not a refusal', async (t) => {
  const w = await newWorkspace(t);
  const result = await setFolders(w.settingsFile, { evidenceFolder: w.evidence, backupFolder: w.backup });
  assert.equal(result.outcome, 'saved');
  const warnings = result.outcome === 'saved' ? result.warnings : [];
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.kind, 'same-drive');
  assert.match(warnings[0]?.message ?? '', /same drive/);
});

test('the settings file is versioned and replaced by renaming a finished temporary file', async (t) => {
  const w = await newWorkspace(t);
  await setFolders(w.settingsFile, { evidenceFolder: w.evidence, backupFolder: w.backup });
  const first = await readFile(w.settingsFile, 'utf8');
  assert.deepEqual(JSON.parse(first), {
    settings_version: 1,
    evidence_folder: w.evidence,
    backup_folder: w.backup,
  });

  // A second name for the same file keeps the old contents only if the new
  // settings arrive as a new file renamed into place, not as a rewrite.
  const secondName = path.join(w.root, 'second-name.json');
  await link(w.settingsFile, secondName);
  const other = path.join(w.root, 'other-backup');
  await mkdir(other);
  await setFolders(w.settingsFile, { evidenceFolder: w.evidence, backupFolder: other });
  assert.equal(await readFile(secondName, 'utf8'), first);
  assert.equal(JSON.parse(await readFile(w.settingsFile, 'utf8')).backup_folder, other);
  assert.deepEqual(await readdir(path.dirname(w.settingsFile)), ['archive-settings.json']);
});

test('settings with a newer version are reported and never rewritten', async (t) => {
  const w = await newWorkspace(t);
  await mkdir(path.dirname(w.settingsFile));
  const newer = '{"settings_version":2,"evidence_folder":"made-up","backup_folder":"made-up"}\n';
  await writeFile(w.settingsFile, newer);

  const read = await readFolders(w.settingsFile);
  assert.equal(read.outcome, 'unknown-version');
  assert.match(read.outcome === 'unknown-version' ? read.message : '', /version 2/);

  const set = await setFolders(w.settingsFile, { evidenceFolder: w.evidence, backupFolder: w.backup });
  assert.equal(set.outcome, 'refused');
  assert.equal(set.outcome === 'refused' ? set.reason : undefined, 'newer-settings');
  assert.equal(await readFile(w.settingsFile, 'utf8'), newer);
});

test('a damaged settings file is reported', async (t) => {
  const w = await newWorkspace(t);
  await mkdir(path.dirname(w.settingsFile));
  for (const damaged of ['{"settings_version":1,', '{"settings_version":1,"evidence_folder":"relative","backup_folder":"x"}', '[]']) {
    await writeFile(w.settingsFile, damaged);
    const read = await readFolders(w.settingsFile);
    assert.equal(read.outcome, 'damaged', damaged);
  }
});

test('no saved settings are reported as not set', async (t) => {
  const w = await newWorkspace(t);
  const read = await readFolders(w.settingsFile);
  assert.equal(read.outcome, 'not-set');
  assert.equal(await exists(path.dirname(w.settingsFile)), false);
});

test('both locations read back the same after the program stops and starts again', async (t) => {
  const w = await newWorkspace(t);
  await setFolders(w.settingsFile, { evidenceFolder: w.evidence, backupFolder: w.backup });
  const reader = path.join(import.meta.dirname, 'helpers', 'read-folders.ts');
  const { stdout } = await promisify(execFile)(process.execPath, [reader, w.settingsFile]);
  assert.deepEqual(JSON.parse(stdout), {
    outcome: 'found',
    locations: { evidenceFolder: w.evidence, backupFolder: w.backup },
  });
});
