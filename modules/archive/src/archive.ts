// The archive's operations for choosing its folders and creating or opening an
// archive. Other parts of the program use only these, never the files.
//
// Every operation takes the location of the folder settings file. The program
// passes its own local data folder for the signed-in person; tests pass a
// temporary folder.

import { readdir, stat } from 'node:fs/promises';
import { createArchive, inspectEvidenceFolder, type ArchiveInfo, type EvidenceStatus } from './evidence-folder.ts';
import { errorCode, fileProblem } from './files.ts';
import {
  checkFolderPair,
  isSameFolder,
  readSettingsFile,
  refuse,
  writeSettingsFile,
  type FolderLocations,
  type FolderRefusal,
  type FolderWarning,
  type SavedSettings,
  type SettingsRead,
} from './settings.ts';

export type { ArchiveInfo, FolderLocations, FolderRefusal, FolderWarning, SettingsRead };

type NotFound = Exclude<SettingsRead, { outcome: 'found' }>;

export type SetFoldersResult =
  | {
      outcome: 'saved';
      locations: FolderLocations;
      evidenceFolder: 'empty' | 'archive';
      warnings: FolderWarning[];
    }
  | { outcome: 'not-saved'; message: string }
  | FolderRefusal;

// Saves the two folder locations after checking them. The evidence folder must
// be empty or already hold a valid archive. Nothing is written when a rule
// refuses the pair.
//
// The remembered archive ID is kept when the same evidence folder is saved
// again, judged by file identity when both can be looked at, so another
// spelling of the same place keeps it. For a different evidence folder it is
// cleared, or set to the ID of the archive already there.
export async function setFolders(settingsFile: string, given: FolderLocations): Promise<SetFoldersResult> {
  const current = await readSettingsFile(settingsFile);
  if (current.outcome === 'unknown-version') {
    return refuse('newer-settings', `${current.message} Update the program before changing the folders.`);
  }
  if (current.outcome === 'unavailable') {
    return refuse('unavailable', current.message);
  }
  const checked = await checkFolderPair(settingsFile, given);
  if (checked.outcome === 'refused') {
    return checked;
  }
  const sameFolder =
    current.outcome === 'found' &&
    current.archiveId !== null &&
    (await isSameFolder(current.locations.evidenceFolder, checked.evidencePlace));
  const evidence = await inspectEvidenceFolder(checked.locations.evidenceFolder, { archiveRemembered: sameFolder });
  if (evidence.status === 'missing' || evidence.status === 'unavailable') {
    return refuse(evidence.status, evidence.message);
  }
  if (evidence.status === 'not-an-archive') {
    if (evidence.reason === 'unknown-version') {
      return refuse('unknown-manifest-version', evidence.message);
    }
    return refuse('evidence-not-empty', `The evidence folder must be empty or already hold an archive. ${evidence.message}`);
  }
  const archiveId =
    sameFolder && current.outcome === 'found' ? current.archiveId : evidence.status === 'archive' ? evidence.archiveId : null;
  const failed = await saveSettings(settingsFile, { locations: checked.locations, archiveId });
  if (failed !== null) {
    return { outcome: 'not-saved', message: `The folder settings could not be saved at ${settingsFile} (${failed}). Nothing was changed.` };
  }
  return {
    outcome: 'saved',
    locations: checked.locations,
    evidenceFolder: evidence.status,
    warnings: checked.warnings,
  };
}

// Reads the saved folder locations and the remembered archive ID.
export async function readFolders(settingsFile: string): Promise<SettingsRead> {
  return readSettingsFile(settingsFile);
}

// What is at the evidence folder, judged against the remembered archive ID.
export type EvidenceState =
  | EvidenceStatus
  | { status: 'archive-gone'; expectedArchiveId: string; message: string }
  | { status: 'different-archive'; expectedArchiveId: string; foundArchiveId: string; message: string };

export type BackupState =
  | { status: 'present' }
  | { status: 'missing' | 'not-a-folder' | 'unavailable'; message: string };

export type FolderStatus =
  | ({
      outcome: 'found';
      evidence: EvidenceState;
      backup: BackupState;
    } & SavedSettings)
  | NotFound;

// Reports what is at each saved location, without changing anything. Each
// folder is looked at on its own, so a problem with one never hides the other.
export async function folderStatus(settingsFile: string): Promise<FolderStatus> {
  const settings = await readSettingsFile(settingsFile);
  if (settings.outcome !== 'found') {
    return settings;
  }
  return {
    ...settings,
    evidence: await evidenceState(settings),
    backup: await backupState(settings.locations.backupFolder),
  };
}

export type OpenResult =
  | ({ outcome: 'opened'; created: boolean; archive: ArchiveInfo } & Remembered)
  | { outcome: 'missing' | 'unavailable' | 'not-created' | 'creation-stopped'; folder: string; message: string }
  | { outcome: 'unknown-version'; folder: string; version: number; message: string }
  | { outcome: 'not-an-archive'; folder: string; reason: string; message: string }
  | { outcome: 'archive-gone'; folder: string; expectedArchiveId: string; message: string }
  | { outcome: 'different-archive'; folder: string; expectedArchiveId: string; foundArchiveId: string; message: string }
  | NotFound;

// Whether the archive's ID is remembered in the settings file. When saving it
// failed, the message says so; the next open tries again.
type Remembered = { remembered: true } | { remembered: false; message: string };

// Opens the archive in the saved evidence folder. An archive is created only
// when no archive ID is remembered and the folder is empty; its ID is then
// remembered. Once an ID is remembered, that archive must be at the folder: an
// empty folder, a missing one or a different archive is reported, and nothing
// is created. A folder that is not a valid archive, holds a manifest version
// this program does not know, or cannot be read is left as it is.
export async function openArchive(settingsFile: string): Promise<OpenResult> {
  const settings = await readSettingsFile(settingsFile);
  if (settings.outcome !== 'found') {
    return settings;
  }
  const folder = settings.locations.evidenceFolder;
  const evidence = await evidenceState(settings);
  switch (evidence.status) {
    case 'archive': {
      const archive = { folder, archiveId: evidence.archiveId, createdAt: evidence.createdAt };
      if (settings.archiveId !== null) {
        return { outcome: 'opened', created: false, archive, remembered: true };
      }
      return { outcome: 'opened', created: false, archive, ...(await remember(settingsFile, settings, archive, false)) };
    }
    case 'empty': {
      const created = await createArchive(folder);
      if (created.outcome !== 'created') {
        return { outcome: created.outcome, folder, message: created.message };
      }
      return { outcome: 'opened', created: true, archive: created.archive, ...(await remember(settingsFile, settings, created.archive, true)) };
    }
    case 'missing':
    case 'unavailable':
      return { outcome: evidence.status, folder, message: evidence.message };
    case 'archive-gone':
      return { outcome: 'archive-gone', folder, expectedArchiveId: evidence.expectedArchiveId, message: evidence.message };
    case 'different-archive':
      return {
        outcome: 'different-archive',
        folder,
        expectedArchiveId: evidence.expectedArchiveId,
        foundArchiveId: evidence.foundArchiveId,
        message: evidence.message,
      };
    case 'not-an-archive':
      if (evidence.reason === 'unknown-version') {
        return { outcome: 'unknown-version', folder, version: evidence.version, message: evidence.message };
      }
      return { outcome: 'not-an-archive', folder, reason: evidence.reason, message: evidence.message };
  }
}

async function remember(
  settingsFile: string,
  settings: SavedSettings,
  archive: ArchiveInfo,
  created: boolean,
): Promise<Remembered> {
  const failed = await saveSettings(settingsFile, { locations: settings.locations, archiveId: archive.archiveId });
  if (failed === null) {
    return { remembered: true };
  }
  const what = created ? 'The archive was created' : 'The archive was opened';
  return {
    remembered: false,
    message: `${what}, but its ID could not be remembered in ${settingsFile} (${failed}). Opening it again tries once more.`,
  };
}

// Writes the settings file, returning null, or the error code when it could
// not be written.
async function saveSettings(settingsFile: string, settings: SavedSettings): Promise<string | null> {
  try {
    await writeSettingsFile(settingsFile, settings);
    return null;
  } catch (error) {
    const code = errorCode(error);
    if (code === undefined) {
      throw error;
    }
    return code;
  }
}

async function evidenceState(settings: SavedSettings): Promise<EvidenceState> {
  const folder = settings.locations.evidenceFolder;
  const expected = settings.archiveId;
  const evidence = await inspectEvidenceFolder(folder, { archiveRemembered: expected !== null });
  if (expected === null) {
    return evidence;
  }
  if (evidence.status === 'empty') {
    return {
      status: 'archive-gone',
      expectedArchiveId: expected,
      message: `The evidence folder ${folder} is empty, but archive ${expected} was kept there. No new archive is created. If the archive is on a drive that is not plugged in, plug it in and try again.`,
    };
  }
  if (evidence.status === 'archive' && evidence.archiveId !== expected) {
    return {
      status: 'different-archive',
      expectedArchiveId: expected,
      foundArchiveId: evidence.archiveId,
      message: `The evidence folder ${folder} holds archive ${evidence.archiveId}, not archive ${expected}, which was kept there. Nothing was changed.`,
    };
  }
  return evidence;
}

// The backup folder is listed as well as looked at, since a folder can be
// found without being readable.
async function backupState(folder: string): Promise<BackupState> {
  try {
    if (!(await stat(folder)).isDirectory()) {
      return { status: 'not-a-folder', message: `The backup folder ${folder} is a file, not a folder.` };
    }
    await readdir(folder);
    return { status: 'present' };
  } catch (error) {
    const { problem, code } = fileProblem(error);
    if (problem === 'missing') {
      return {
        status: 'missing',
        message: `The backup folder ${folder} cannot be found. If it is on a drive that is not plugged in, plug it in and try again.`,
      };
    }
    return {
      status: 'unavailable',
      message: `The backup folder ${folder} cannot be read (${code}). It may need permission, or be on a drive or share that is not available.`,
    };
  }
}
