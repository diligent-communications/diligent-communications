import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fsp, { chmod, link, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { mock, test } from 'node:test';
import { promisify } from 'node:util';
import { folderStatus, openArchive, readFolders, setFolders } from '../src/archive.ts';
import { replaceFile } from '../src/files.ts';
import { checkFolderPair, driveWarnings, isDriveRoot, isSameFolder, realFolder, writeSettingsFile, type FoundFolder } from '../src/settings.ts';
import { exists, folderLink, linkLoop, newWorkspace, type Workspace } from './helpers/workspace.ts';

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

async function setPair(w: Workspace, evidenceFolder: string, backupFolder: string) {
  return setFolders(w.settingsFile, { evidenceFolder, backupFolder });
}

test('setting the folders saves both locations', async (t) => {
  const w = await newWorkspace(t);
  const result = await setPair(w, w.evidence, w.backup);
  assert.equal(result.outcome, 'saved');
  assert.deepEqual(await readFolders(w.settingsFile), {
    outcome: 'found',
    locations: { evidenceFolder: w.evidence, backupFolder: w.backup },
    archiveId: null,
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
    await assertRefused(await setPair(w, given, w.backup), 'not-full-path', w.settingsFile);
    await assertRefused(await setPair(w, w.evidence, given), 'not-full-path', w.settingsFile);
  }
});

test('the evidence and backup folders cannot be the same folder', async (t) => {
  const w = await newWorkspace(t);
  await assertRefused(await setPair(w, w.evidence, w.evidence), 'same-folder', w.settingsFile);
  await assertRefused(await setPair(w, w.evidence, `${w.evidence}${path.sep}`), 'same-folder', w.settingsFile);
  if (onWindows) {
    await assertRefused(await setPair(w, w.evidence, w.evidence.toUpperCase()), 'same-folder', w.settingsFile);
  }
});

test('a second spelling of the same folder is caught by its file identity (Windows)', async (t) => {
  if (!onWindows) {
    t.skip('Windows only: it uses the \\\\localhost\\C$ spelling of a local folder.');
    return;
  }
  const w = await newWorkspace(t);
  const viaShare = (location: string) => `\\\\localhost\\${location[0]}$${location.slice(2)}`;
  try {
    await stat(viaShare(w.evidence));
  } catch (error) {
    t.skip(`This machine does not offer its administrative share (${(error as NodeJS.ErrnoException).code}).`);
    return;
  }
  await assertRefused(await setPair(w, w.evidence, viaShare(w.evidence)), 'same-folder', w.settingsFile);
  const inner = path.join(w.evidence, 'inner');
  await mkdir(inner);
  await assertRefused(await setPair(w, w.evidence, viaShare(inner)), 'nested', w.settingsFile);
  await rm(inner, { recursive: true });
  const backupInner = path.join(w.backup, 'inner');
  await mkdir(backupInner);
  await assertRefused(await setPair(w, viaShare(backupInner), w.backup), 'nested', w.settingsFile);
});

test('neither folder may be inside the other', async (t) => {
  const w = await newWorkspace(t);
  const inBackup = path.join(w.backup, 'evidence');
  const inEvidence = path.join(w.evidence, 'backup');
  await mkdir(inBackup);
  await mkdir(inEvidence);
  await assertRefused(await setPair(w, inBackup, w.backup), 'nested', w.settingsFile);
  await assertRefused(await setPair(w, w.evidence, inEvidence), 'nested', w.settingsFile);
  // A shared start of the name is not nesting.
  const pair = path.join(w.root, 'pair');
  const sibling = `${pair}-backup`;
  await mkdir(pair);
  await mkdir(sibling);
  assert.equal((await setPair(w, pair, sibling)).outcome, 'saved');
});

test('neither folder may be a drive root', async (t) => {
  const w = await newWorkspace(t);
  // The path text is checked before the disk is touched, so no real folder
  // is read here.
  const driveRoot = path.parse(w.root).root;
  await assertRefused(await setPair(w, driveRoot, w.backup), 'drive-root', w.settingsFile);
  await assertRefused(await setPair(w, w.evidence, driveRoot), 'drive-root', w.settingsFile);
});

test('what counts as a drive root on each system', () => {
  for (const root of ['C:\\', 'd:/', '\\\\server\\share\\', '\\\\server\\share']) {
    assert.equal(isDriveRoot(root, path.win32), true, root);
  }
  for (const folder of ['C:\\evidence', '\\\\server\\share\\evidence']) {
    assert.equal(isDriveRoot(folder, path.win32), false, folder);
  }
  assert.equal(isDriveRoot('/', path.posix), true);
  // Stated limit: the top folder of a mounted drive is allowed on Linux and macOS.
  for (const folder of ['/mnt/usb', '/media/stick', '/home']) {
    assert.equal(isDriveRoot(folder, path.posix), false, folder);
  }
});

test('a folder link cannot get around the folder rules', async (t) => {
  const w = await newWorkspace(t);
  const toEvidence = path.join(w.root, 'link-to-evidence');
  await folderLink(w, w.evidence, toEvidence);
  await assertRefused(await setPair(w, w.evidence, toEvidence), 'same-folder', w.settingsFile);

  const inside = path.join(w.backup, 'inner');
  await mkdir(inside);
  const toInside = path.join(w.root, 'link-to-inner');
  await folderLink(w, inside, toInside);
  await assertRefused(await setPair(w, toInside, w.backup), 'nested', w.settingsFile);
});

test('a folder reached through a link is saved as its real location', async (t) => {
  const w = await newWorkspace(t);
  const toBackup = path.join(w.root, 'link-to-backup');
  await folderLink(w, w.backup, toBackup);
  assert.equal((await setPair(w, w.evidence, toBackup)).outcome, 'saved');
  const read = await readFolders(w.settingsFile);
  assert.deepEqual(read.outcome === 'found' ? read.locations : undefined, { evidenceFolder: w.evidence, backupFolder: w.backup });
});

test('the settings file must stay outside both folders', async (t) => {
  const w = await newWorkspace(t);
  for (const [name, folder, settingsFile] of [
    ['evidence folder', w.evidence, path.join(w.evidence, 'archive-settings.json')],
    ['backup folder', w.backup, path.join(w.backup, 'local-data', 'archive-settings.json')],
  ] as const) {
    const result = await setFolders(settingsFile, { evidenceFolder: w.evidence, backupFolder: w.backup });
    await assertRefused(result, 'settings-inside', settingsFile);
    assert.equal(
      result.outcome === 'refused' ? result.message : undefined,
      `The folder settings file ${settingsFile} is inside the chosen ${name} ${folder}.`,
    );
  }
  // Through a link, too.
  const toBackup = path.join(w.root, 'link-to-backup');
  await folderLink(w, w.backup, toBackup);
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
  await assertRefused(await setPair(w, gone, w.backup), 'missing', w.settingsFile);
  await assertRefused(await setPair(w, w.evidence, gone), 'missing', w.settingsFile);
  assert.equal(await exists(gone), false);
});

test('a missing backup refusal names the backup folder and its path', async (t) => {
  const w = await newWorkspace(t);
  const backup = path.join(w.root, 'absent-backup');
  const result = await setPair(w, w.evidence, backup);
  await assertRefused(result, 'missing', w.settingsFile);
  assert.equal(
    result.outcome === 'refused' ? result.message : undefined,
    `The backup folder ${backup} cannot be found.`,
  );
});

test('a file is not accepted as either folder', async (t) => {
  const w = await newWorkspace(t);
  const file = path.join(w.root, 'a-file.txt');
  await writeFile(file, 'made-up text');
  await assertRefused(await setPair(w, file, w.backup), 'not-a-folder', w.settingsFile);
  await assertRefused(await setPair(w, w.evidence, file), 'not-a-folder', w.settingsFile);
});

test('a folder that cannot be read is refused as unavailable', async (t) => {
  const w = await newWorkspace(t);
  const loop = path.join(w.root, 'loop');
  await linkLoop(w, loop);
  await assertRefused(await setPair(w, loop, w.backup), 'unavailable', w.settingsFile);
  await assertRefused(await setPair(w, w.evidence, loop), 'unavailable', w.settingsFile);
});

test('a new evidence folder is accepted only if it is empty or already an archive', async (t) => {
  const w = await newWorkspace(t);
  const empty = await setPair(w, w.evidence, w.backup);
  assert.equal(empty.outcome === 'saved' ? empty.evidenceFolder : undefined, 'empty');

  assert.equal((await openArchive(w.settingsFile)).outcome, 'opened');
  // Other files beside the manifest do not stop it being an archive.
  await writeFile(path.join(w.evidence, 'notes.txt'), 'made-up notes');
  const archive = await setPair(w, w.evidence, w.backup);
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
  await assertRefused(await setPair(w, w.evidence, w.backup), 'unknown-manifest-version', w.settingsFile);
});

test('saving the same evidence folder again keeps the remembered archive ID', async (t) => {
  const w = await newWorkspace(t);
  await setPair(w, w.evidence, w.backup);
  const opened = await openArchive(w.settingsFile);
  assert.equal(opened.outcome, 'opened');
  const id = opened.outcome === 'opened' ? opened.archive.archiveId : '';

  const otherBackup = path.join(w.root, 'other-backup');
  await mkdir(otherBackup);
  assert.equal((await setPair(w, w.evidence, otherBackup)).outcome, 'saved');
  const read = await readFolders(w.settingsFile);
  assert.equal(read.outcome === 'found' ? read.archiveId : undefined, id);

  // Even when the folder has since been emptied.
  for (const name of await readdir(w.evidence)) {
    await rm(path.join(w.evidence, name), { recursive: true });
  }
  assert.equal((await setPair(w, w.evidence, w.backup)).outcome, 'saved');
  const again = await readFolders(w.settingsFile);
  assert.equal(again.outcome === 'found' ? again.archiveId : undefined, id);
});

test('choosing a different evidence folder clears the remembered archive ID', async (t) => {
  const w = await newWorkspace(t);
  await setPair(w, w.evidence, w.backup);
  assert.equal((await openArchive(w.settingsFile)).outcome, 'opened');
  const second = path.join(w.root, 'second-evidence');
  await mkdir(second);
  assert.equal((await setPair(w, second, w.backup)).outcome, 'saved');
  const read = await readFolders(w.settingsFile);
  assert.equal(read.outcome === 'found' ? read.archiveId : undefined, null);

  // Choosing a folder that already holds an archive remembers that archive.
  const first = await readFile(path.join(w.evidence, 'manifest.jsonl'), 'utf8');
  assert.equal((await setPair(w, w.evidence, w.backup)).outcome, 'saved');
  const back = await readFolders(w.settingsFile);
  assert.equal(back.outcome === 'found' ? back.archiveId : undefined, JSON.parse(first).archive_id);
});

test('both folders on the same drive give a warning, not a refusal', async (t) => {
  const w = await newWorkspace(t);
  const result = await setPair(w, w.evidence, w.backup);
  assert.equal(result.outcome, 'saved');
  const warnings = result.outcome === 'saved' ? result.warnings : [];
  assert.deepEqual(warnings.map((warning) => warning.kind), ['same-drive']);
  assert.match(warnings[0]?.message ?? '', /same drive/);
  assert.ok(warnings[0]?.message.includes(w.evidence));
  assert.ok(warnings[0]?.message.includes(w.backup));
});

test('the same-drive warning compares the two device numbers', () => {
  const evidence = { dev: 7n, location: '/fixture/evidence' };
  const backup = { dev: 7n, location: '/fixture/backup' };
  assert.deepEqual(driveWarnings(evidence, backup).map((warning) => warning.kind), ['same-drive']);
  assert.deepEqual(driveWarnings(evidence, { ...backup, dev: 8n }), []);
});

test('the settings file is versioned and holds the locations and the remembered archive ID', async (t) => {
  const w = await newWorkspace(t);
  await setPair(w, w.evidence, w.backup);
  assert.deepEqual(JSON.parse(await readFile(w.settingsFile, 'utf8')), {
    settings_version: 1,
    evidence_folder: w.evidence,
    backup_folder: w.backup,
    archive_id: null,
  });
});

test('the settings file is replaced by renaming a finished temporary file, never rewritten or deleted first', async (t) => {
  const w = await newWorkspace(t);
  await setPair(w, w.evidence, w.backup);
  const first = await readFile(w.settingsFile, 'utf8');

  // A second name for the same file keeps the old contents only if the new
  // settings arrive as a new file renamed into place, not as a rewrite.
  const secondName = path.join(w.root, 'second-name.json');
  await link(w.settingsFile, secondName);

  const other = path.join(w.root, 'other-backup');
  await mkdir(other);
  const locations = { evidenceFolder: w.evidence, backupFolder: other };
  let seen = false;
  await writeSettingsFile(w.settingsFile, { locations, archiveId: null }, {
    beforeRename: async (temporary) => {
      seen = true;
      // The old file is still there, whole, while the new one waits beside it.
      assert.equal(await readFile(w.settingsFile, 'utf8'), first);
      assert.equal(path.dirname(temporary), path.dirname(w.settingsFile));
      assert.equal(JSON.parse(await readFile(temporary, 'utf8')).backup_folder, other);
    },
  });
  assert.equal(seen, true, 'the new contents were written to a temporary file first');
  assert.equal(await readFile(secondName, 'utf8'), first);
  assert.equal(JSON.parse(await readFile(w.settingsFile, 'utf8')).backup_folder, other);
  assert.deepEqual(await readdir(path.dirname(w.settingsFile)), ['archive-settings.json']);
});

test('a failed save removes its temporary file and leaves the old file as it was', async (t) => {
  const w = await newWorkspace(t);
  const target = path.join(w.root, 'target.json');
  await writeFile(target, 'old contents');
  await assert.rejects(
    replaceFile(target, 'new contents', {
      beforeRename: async () => {
        throw new Error('stopped on purpose');
      },
    }),
    /stopped on purpose/,
  );
  assert.equal(await readFile(target, 'utf8'), 'old contents');
  assert.deepEqual((await readdir(w.root)).sort(), ['backup', 'evidence', 'target.json']);

  // A rename the system refuses: the target is a folder.
  const folderTarget = path.join(w.root, 'folder-target');
  await mkdir(folderTarget);
  await assert.rejects(replaceFile(folderTarget, 'new contents'));
  assert.deepEqual((await readdir(w.root)).sort(), ['backup', 'evidence', 'folder-target', 'target.json']);
});

test('settings with a newer version are reported and never rewritten', async (t) => {
  const w = await newWorkspace(t);
  await mkdir(path.dirname(w.settingsFile));
  const newer = '{"settings_version":2,"evidence_folder":"made-up","backup_folder":"made-up"}\n';
  await writeFile(w.settingsFile, newer);

  const read = await readFolders(w.settingsFile);
  assert.equal(read.outcome, 'settings-unknown-version');
  assert.match(read.outcome === 'settings-unknown-version' ? read.message : '', /version 2/);
  assert.ok(read.outcome === 'settings-unknown-version' && read.message.includes(w.settingsFile));
  assert.deepEqual(await folderStatus(w.settingsFile), read);
  assert.deepEqual(await openArchive(w.settingsFile), read);

  const set = await setPair(w, w.evidence, w.backup);
  assert.equal(set.outcome === 'refused' ? set.reason : undefined, 'newer-settings');
  assert.ok(set.outcome === 'refused' && set.message.includes(w.settingsFile));
  assert.equal(await readFile(w.settingsFile, 'utf8'), newer);
});

test('a damaged settings file is reported', async (t) => {
  const w = await newWorkspace(t);
  await mkdir(path.dirname(w.settingsFile));
  const full = (name: string) => JSON.stringify(path.join(w.root, name));
  for (const damaged of [
    '{"settings_version":1,',
    '{"settings_version":1,"evidence_folder":"relative","backup_folder":"x","archive_id":null}',
    `{"settings_version":1,"evidence_folder":${full('e')},"backup_folder":${full('b')},"archive_id":7}`,
    `{"settings_version":1,"evidence_folder":${full('e')},"backup_folder":${full('b')},"archive_id":""}`,
    '[]',
  ]) {
    await writeFile(w.settingsFile, damaged);
    assert.equal((await readFolders(w.settingsFile)).outcome, 'settings-damaged', damaged);
  }
});

test('no saved settings are reported as not set', async (t) => {
  const w = await newWorkspace(t);
  assert.equal((await readFolders(w.settingsFile)).outcome, 'not-set');
  assert.equal(await exists(path.dirname(w.settingsFile)), false);
});

test('both locations and the archive ID read back the same after the program stops and starts again', async (t) => {
  const w = await newWorkspace(t);
  await setPair(w, w.evidence, w.backup);
  const opened = await openArchive(w.settingsFile);
  const reader = path.join(import.meta.dirname, 'helpers', 'read-folders.ts');
  const { stdout } = await promisify(execFile)(process.execPath, [reader, w.settingsFile]);
  assert.deepEqual(JSON.parse(stdout), {
    outcome: 'found',
    locations: { evidenceFolder: w.evidence, backupFolder: w.backup },
    archiveId: opened.outcome === 'opened' ? opened.archive.archiveId : 'none',
  });
});

test('a folder whose real location is a drive root is refused', async (t) => {
  const w = await newWorkspace(t);
  // The lookup gives a made-up real location for an ordinary-looking path, as
  // a link to the top of a drive would. No link is made and the root is never
  // looked at.
  const looksOrdinary = path.join(w.root, 'looks-ordinary');
  const lookup = {
    findFolder: async (location: string): Promise<FoundFolder> =>
      location === looksOrdinary
        ? { kind: 'folder', place: { location: path.parse(w.root).root, dev: 1n, id: 'made-up' } }
        : realFolder(location),
  };
  for (const given of [
    { evidenceFolder: looksOrdinary, backupFolder: w.backup },
    { evidenceFolder: w.evidence, backupFolder: looksOrdinary },
  ]) {
    const result = await checkFolderPair(w.settingsFile, given, lookup);
    assert.equal(result.outcome === 'refused' ? result.reason : result.outcome, 'drive-root');
  }
});

test('saving the same evidence folder under another spelling keeps the remembered ID (Windows)', async (t) => {
  if (!onWindows) {
    t.skip('Windows only: it uses the \\\\localhost\\C$ spelling of a local folder.');
    return;
  }
  const w = await newWorkspace(t);
  const viaShare = (location: string) => `\\\\localhost\\${location[0]}$${location.slice(2)}`;
  try {
    await stat(viaShare(w.evidence));
  } catch (error) {
    t.skip(`This machine does not offer its administrative share (${(error as NodeJS.ErrnoException).code}).`);
    return;
  }
  await setPair(w, w.evidence, w.backup);
  const opened = await openArchive(w.settingsFile);
  const id = opened.outcome === 'opened' ? opened.archive.archiveId : '';

  // Emptied, then saved again under the other spelling: the ID stays, and
  // opening reports the archive as gone instead of making a new one.
  for (const name of await readdir(w.evidence)) {
    await rm(path.join(w.evidence, name), { recursive: true });
  }
  assert.equal((await setPair(w, viaShare(w.evidence), w.backup)).outcome, 'saved');
  const read = await readFolders(w.settingsFile);
  assert.equal(read.outcome === 'found' ? read.archiveId : undefined, id);
  assert.equal((await openArchive(w.settingsFile)).outcome, 'archive-gone');
  assert.deepEqual(await readdir(w.evidence), []);

  // Holding a different archive, saved under the first spelling again: its ID
  // is not adopted, and opening reports it.
  const other = '{"line":"header","manifest_version":1,"archive_id":"other-made-up-archive","created_at":"2026-01-01T00:00:00.000Z"}\n';
  await writeFile(path.join(w.evidence, 'manifest.jsonl'), other);
  assert.equal((await setPair(w, w.evidence, w.backup)).outcome, 'saved');
  const again = await readFolders(w.settingsFile);
  assert.equal(again.outcome === 'found' ? again.archiveId : undefined, id);
  assert.equal((await openArchive(w.settingsFile)).outcome, 'different-archive');
});

test('a backup folder without permission to list it is refused as unavailable (Linux)', async (t) => {
  if (onWindows) {
    t.skip('Windows ignores these permission bits on folders.');
    return;
  }
  if (process.getuid?.() === 0) {
    t.skip('The system administrator account can read any folder.');
    return;
  }
  const w = await newWorkspace(t);
  await chmod(w.backup, 0o000);
  try {
    await assertRefused(await setPair(w, w.evidence, w.backup), 'unavailable', w.settingsFile);
  } finally {
    await chmod(w.backup, 0o700);
  }
});

test('settings that cannot be written are reported, not thrown', async (t) => {
  const w = await newWorkspace(t);
  // The settings file's folder cannot be made: a file has that name.
  const blocker = path.join(w.root, 'local-data');
  await writeFile(blocker, 'made-up text');
  const result = await setPair(w, w.evidence, w.backup);
  assert.equal(result.outcome, 'settings-not-saved');
  assert.match(result.outcome === 'settings-not-saved' ? result.message : '', /could not be saved/);
  assert.equal(await readFile(blocker, 'utf8'), 'made-up text');
});

test('a damaged settings file is reported and nothing is written unless replacing it is chosen', async (t) => {
  const w = await newWorkspace(t);
  await mkdir(path.dirname(w.settingsFile));
  const damaged = '{"settings_version":1,';
  await writeFile(w.settingsFile, damaged);
  const refused = await setPair(w, w.evidence, w.backup);
  assert.equal(refused.outcome === 'refused' ? refused.reason : refused.outcome, 'settings-damaged');
  assert.equal(await readFile(w.settingsFile, 'utf8'), damaged);
  assert.deepEqual(await readdir(path.dirname(w.settingsFile)), ['archive-settings.json']);
});

test('replacing a damaged settings file keeps it beside the new one and never overwrites a kept copy', async (t) => {
  const w = await newWorkspace(t);
  await mkdir(path.dirname(w.settingsFile));
  await writeFile(w.settingsFile, 'first damaged');
  const first = await setFolders(w.settingsFile, { evidenceFolder: w.evidence, backupFolder: w.backup }, { replaceDamagedSettings: true });
  assert.equal(first.outcome, 'saved');
  assert.equal(first.outcome === 'saved' ? first.keptDamagedSettingsAs : undefined, `${w.settingsFile}.damaged`);
  assert.equal(await readFile(`${w.settingsFile}.damaged`, 'utf8'), 'first damaged');
  assert.equal((await readFolders(w.settingsFile)).outcome, 'found');

  // Damaged again: the name already used is taken, so the next one is used.
  await writeFile(w.settingsFile, 'second damaged');
  const second = await setFolders(w.settingsFile, { evidenceFolder: w.evidence, backupFolder: w.backup }, { replaceDamagedSettings: true });
  assert.equal(second.outcome === 'saved' ? second.keptDamagedSettingsAs : undefined, `${w.settingsFile}.damaged-2`);
  assert.equal(await readFile(`${w.settingsFile}.damaged`, 'utf8'), 'first damaged');
  assert.equal(await readFile(`${w.settingsFile}.damaged-2`, 'utf8'), 'second damaged');
});

test('the old settings file is never deleted before the rename', async (t) => {
  const w = await newWorkspace(t);
  const target = path.join(w.root, 'target.json');
  await writeFile(target, 'old contents');
  // The temporary file vanishes, so the rename itself fails.
  await assert.rejects(replaceFile(target, 'new contents', { beforeRename: (temporary) => rm(temporary) }));
  assert.equal(await readFile(target, 'utf8'), 'old contents');
});

test('a saved evidence folder that cannot be looked at is compared by path text', async (t) => {
  const w = await newWorkspace(t);
  await setPair(w, w.evidence, w.backup);
  assert.equal((await openArchive(w.settingsFile)).outcome, 'opened');
  // The remembered folder is unplugged, and another folder is chosen.
  await rename(w.evidence, path.join(w.root, 'unplugged'));
  const other = path.join(w.root, 'other-evidence');
  await mkdir(other);
  assert.equal((await setPair(w, other, w.backup)).outcome, 'saved');
  const read = await readFolders(w.settingsFile);
  assert.equal(read.outcome === 'found' ? read.archiveId : undefined, null);
});

test('setting the folders never calls the remains of a remembered archive a stopped creation', async (t) => {
  const w = await newWorkspace(t);
  await setPair(w, w.evidence, w.backup);
  assert.equal((await openArchive(w.settingsFile)).outcome, 'opened');
  // Only the manifest is gone: what is left looks like creation leftovers.
  await rm(path.join(w.evidence, 'manifest.jsonl'));
  const settingsBefore = await readFile(w.settingsFile, 'utf8');
  const result = await setPair(w, w.evidence, w.backup);
  assert.equal(result.outcome === 'refused' ? result.reason : result.outcome, 'evidence-not-empty');
  assert.doesNotMatch(result.outcome === 'refused' ? result.message : '', /stopped partway/);
  assert.match(result.outcome === 'refused' ? result.message : '', /no archive manifest/);
  assert.equal(await readFile(w.settingsFile, 'utf8'), settingsBefore);
});

test('file identity catches the same folder, or one inside the other, under made-up spellings', async (t) => {
  const w = await newWorkspace(t);
  const inner = path.join(w.evidence, 'inner');
  await mkdir(inner);
  const evidencePlace = await realFolder(w.evidence);
  assert.equal(evidencePlace.kind, 'folder');
  if (evidencePlace.kind !== 'folder') return;
  // A made-up spelling that shares nothing with the real path but its identity.
  const spelling = path.join(w.root, 'made-up-spelling');
  const madeUp = (location: string): FoundFolder => ({
    kind: 'folder',
    place: { location: spelling, dev: evidencePlace.place.dev, id: evidencePlace.place.id },
  });
  const lookup = (stand: string) => ({
    findFolder: async (location: string): Promise<FoundFolder> => (location === stand ? madeUp(location) : realFolder(location)),
  });
  const same = await checkFolderPair(w.settingsFile, { evidenceFolder: w.evidence, backupFolder: spelling }, lookup(spelling));
  assert.equal(same.outcome === 'refused' ? same.reason : same.outcome, 'same-folder');
  const nested = await checkFolderPair(w.settingsFile, { evidenceFolder: spelling, backupFolder: inner }, lookup(spelling));
  assert.equal(nested.outcome === 'refused' ? nested.reason : nested.outcome, 'nested');
});

test('a remembered evidence folder saved again under another spelling keeps its ID, by file identity', async (t) => {
  const w = await newWorkspace(t);
  await setPair(w, w.evidence, w.backup);
  const opened = await openArchive(w.settingsFile);
  const id = opened.outcome === 'opened' ? opened.archive.archiveId : '';
  // The saved location becomes a link inside the test folder that leads to
  // the same folder, so the two paths share no text.
  const spelling = path.join(w.root, 'other-spelling');
  await folderLink(w, w.evidence, spelling);
  await writeSettingsFile(w.settingsFile, { locations: { evidenceFolder: spelling, backupFolder: w.backup }, archiveId: id });
  for (const name of await readdir(w.evidence)) {
    await rm(path.join(w.evidence, name), { recursive: true });
  }
  assert.equal((await setPair(w, w.evidence, w.backup)).outcome, 'saved');
  const read = await readFolders(w.settingsFile);
  assert.equal(read.outcome === 'found' ? read.archiveId : undefined, id);
  assert.equal((await openArchive(w.settingsFile)).outcome, 'archive-gone');
});

test('settings replaced but not flushed are saved with a warning, never "not changed" (Linux)', async (t) => {
  if (onWindows) {
    t.skip('Windows has no folder flush step, and ignores these permission bits on folders.');
    return;
  }
  if (process.getuid?.() === 0) {
    t.skip('The system administrator account can read any folder.');
    return;
  }
  const w = await newWorkspace(t);
  await setPair(w, w.evidence, w.backup);
  const other = path.join(w.root, 'other-backup');
  await mkdir(other);
  // Write and search permission, but not read: the file can be replaced, and
  // the folder cannot be opened to flush it.
  const settingsFolder = path.dirname(w.settingsFile);
  await chmod(settingsFolder, 0o300);
  let result: Awaited<ReturnType<typeof setFolders>>;
  try {
    result = await setPair(w, w.evidence, other);
  } finally {
    await chmod(settingsFolder, 0o700);
  }
  assert.equal(result.outcome, 'saved');
  assert.deepEqual(result.outcome === 'saved' ? result.warnings.map((warning) => warning.kind) : [], ['same-drive', 'settings-not-flushed']);
  const read = await readFolders(w.settingsFile);
  assert.equal(read.outcome === 'found' ? read.locations.backupFolder : undefined, other);
});

test('when file identity cannot be used, the same path text counts as the same folder', async (t) => {
  const w = await newWorkspace(t);
  // The saved folder cannot be looked at, and the chosen place has no file
  // number, so only the path text is left to compare.
  const saved = path.join(w.root, 'not-there');
  assert.equal(await isSameFolder(saved, { location: saved, dev: 1n, id: null }), true);
  assert.equal(await isSameFolder(saved, { location: path.join(w.root, 'elsewhere'), dev: 1n, id: null }), false);
});

test('choosing to replace damaged settings does not replace settings of a newer version', async (t) => {
  const w = await newWorkspace(t);
  await mkdir(path.dirname(w.settingsFile));
  const newer = '{"settings_version":2,"evidence_folder":"made-up","backup_folder":"made-up"}\n';
  await writeFile(w.settingsFile, newer);
  const result = await setFolders(w.settingsFile, { evidenceFolder: w.evidence, backupFolder: w.backup }, { replaceDamagedSettings: true });
  assert.equal(result.outcome === 'refused' ? result.reason : result.outcome, 'newer-settings');
  assert.equal(await readFile(w.settingsFile, 'utf8'), newer);
  assert.deepEqual(await readdir(path.dirname(w.settingsFile)), ['archive-settings.json']);
});

test('the kept copy of a damaged settings file is flushed before the original is replaced', async (t) => {
  const w = await newWorkspace(t);
  await mkdir(path.dirname(w.settingsFile));
  await writeFile(w.settingsFile, 'damaged');
  const kept = `${w.settingsFile}.damaged`;
  // Records, through Node's own test mocks, each flush of the kept copy and
  // each rename onto the settings file. The real calls still run.
  const events: string[] = [];
  const original = { open: fsp.open, rename: fsp.rename };
  const opens = mock.method(fsp, 'open', (async (target: string, ...rest: unknown[]) => {
    const handle = await (original.open as (...args: unknown[]) => Promise<fsp.FileHandle>)(target, ...rest);
    if (String(target) !== kept) {
      return handle;
    }
    return {
      sync: async () => {
        await handle.sync();
        events.push('kept copy flushed');
      },
      close: () => handle.close(),
    };
  }) as typeof fsp.open);
  const renames = mock.method(fsp, 'rename', (async (from: string, to: string) => {
    await (original.rename as (a: string, b: string) => Promise<void>)(from, to);
    if (String(to) === w.settingsFile) {
      events.push('settings replaced');
    }
  }) as typeof fsp.rename);
  syncBuiltinESMExports();
  try {
    const result = await setFolders(w.settingsFile, { evidenceFolder: w.evidence, backupFolder: w.backup }, { replaceDamagedSettings: true });
    assert.equal(result.outcome, 'saved');
  } finally {
    opens.mock.restore();
    renames.mock.restore();
    syncBuiltinESMExports();
  }
  assert.deepEqual(events, ['kept copy flushed', 'settings replaced']);
  assert.equal(await readFile(kept, 'utf8'), 'damaged');
});
