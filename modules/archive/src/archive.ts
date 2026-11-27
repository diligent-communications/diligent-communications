// The archive's operations for choosing its folders and creating or opening an
// archive. Other parts of the program use only these, never the files.
//
// Every operation takes the location of the folder settings file. The program
// passes its own local data folder for the signed-in person; tests pass a
// temporary folder.

import { stat } from 'node:fs/promises';
import { createArchive, inspectEvidenceFolder, type ArchiveInfo, type EvidenceStatus } from './evidence-folder.ts';
import { fileProblem } from './files.ts';
import {
  checkFolderPair,
  readSettingsFile,
  refuse,
  sameSavedFolder,
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
  | FolderRefusal;

// Saves the two folder locations after checking them. The evidence folder must
// be empty or already hold a valid archive. Nothing is written when a rule
// refuses the pair.
//
// The remembered archive ID is kept when the same evidence folder is saved
// again. For a different evidence folder it is cleared, or set to the ID of
// the archive already there.
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
  const evidence = await inspectEvidenceFolder(checked.locations.evidenceFolder);
  if (evidence.status === 'missing' || evidence.status === 'unavailable') {
    return refuse(evidence.status, evidence.message);
  }
  if (evidence.status === 'not-an-archive') {
    if (evidence.reason === 'unknown-version') {
      return refuse('unknown-manifest-version', evidence.message);
    }
    return refuse('evidence-not-empty', `The evidence folder must be empty or already hold an archive. ${evidence.message}`);
  }
  const sameFolder =
    current.outcome === 'found' &&
    current.archiveId !== null &&
    sameSavedFolder(current.locations.evidenceFolder, checked.locations.evidenceFolder);
  const archiveId = sameFolder ? current.archiveId : evidence.status === 'archive' ? evidence.archiveId : null;
  await writeSettingsFile(settingsFile, { locations: checked.locations, archiveId });
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
  | { outcome: 'opened'; created: boolean; archive: ArchiveInfo }
  | { outcome: 'missing' | 'unavailable' | 'creation-stopped'; folder: string; message: string }
  | { outcome: 'unknown-version'; folder: string; version: number; message: string }
  | { outcome: 'not-an-archive'; folder: string; reason: string; message: string }
  | { outcome: 'archive-gone'; folder: string; expectedArchiveId: string; message: string }
  | { outcome: 'different-archive'; folder: string; expectedArchiveId: string; foundArchiveId: string; message: string }
  | NotFound;

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
      if (settings.archiveId === null) {
        await writeSettingsFile(settingsFile, { locations: settings.locations, archiveId: archive.archiveId });
      }
      return { outcome: 'opened', created: false, archive };
    }
    case 'empty': {
      const created = await createArchive(folder);
      if (created.outcome !== 'created') {
        return { outcome: created.outcome, folder, message: created.message };
      }
      await writeSettingsFile(settingsFile, { locations: settings.locations, archiveId: created.archive.archiveId });
      return { outcome: 'opened', created: true, archive: created.archive };
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

async function evidenceState(settings: SavedSettings): Promise<EvidenceState> {
  const folder = settings.locations.evidenceFolder;
  const evidence = await inspectEvidenceFolder(folder);
  const expected = settings.archiveId;
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

async function backupState(folder: string): Promise<BackupState> {
  try {
    if ((await stat(folder)).isDirectory()) {
      return { status: 'present' };
    }
    return { status: 'not-a-folder', message: `The backup folder ${folder} is a file, not a folder.` };
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
