// The archive's operations for choosing its folders and creating or opening an
// archive. Other parts of the program use only these, never the files.
//
// Every operation takes the location of the folder settings file. The program
// passes its own local data folder for the signed-in person; tests pass a
// temporary folder.

import { stat } from 'node:fs/promises';
import { createArchive, inspectEvidenceFolder, type ArchiveInfo, type EvidenceStatus } from './evidence-folder.ts';
import { isMissingError } from './files.ts';
import {
  checkFolderPair,
  readSettingsFile,
  refuse,
  writeSettingsFile,
  type FolderLocations,
  type FolderRefusal,
  type FolderWarning,
  type SettingsRead,
} from './settings.ts';

export type { ArchiveInfo, EvidenceStatus, FolderLocations, FolderRefusal, FolderWarning, SettingsRead };

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
export async function setFolders(settingsFile: string, given: FolderLocations): Promise<SetFoldersResult> {
  const current = await readSettingsFile(settingsFile);
  if (current.outcome === 'unknown-version') {
    return refuse('newer-settings', `${current.message} Update the program before changing the folders.`);
  }
  const checked = await checkFolderPair(settingsFile, given);
  if (checked.outcome === 'refused') {
    return checked;
  }
  const evidence = await inspectEvidenceFolder(checked.locations.evidenceFolder);
  if (evidence.status === 'missing') {
    return refuse('missing', evidence.message);
  }
  if (evidence.status === 'not-an-archive') {
    if (evidence.reason === 'unknown-version') {
      return refuse('unknown-manifest-version', evidence.message);
    }
    return refuse(
      'evidence-not-empty',
      `The evidence folder must be empty or already hold an archive. ${evidence.message}`,
    );
  }
  await writeSettingsFile(settingsFile, checked.locations);
  return {
    outcome: 'saved',
    locations: checked.locations,
    evidenceFolder: evidence.status,
    warnings: checked.warnings,
  };
}

// Reads the saved folder locations.
export async function readFolders(settingsFile: string): Promise<SettingsRead> {
  return readSettingsFile(settingsFile);
}

export type FolderStatus =
  | {
      outcome: 'found';
      locations: FolderLocations;
      evidence: EvidenceStatus;
      backup: { status: 'present' } | { status: 'missing' | 'not-a-folder'; message: string };
    }
  | NotFound;

// Reports what is at each saved location, without changing anything.
export async function folderStatus(settingsFile: string): Promise<FolderStatus> {
  const settings = await readSettingsFile(settingsFile);
  if (settings.outcome !== 'found') {
    return settings;
  }
  const { locations } = settings;
  return {
    outcome: 'found',
    locations,
    evidence: await inspectEvidenceFolder(locations.evidenceFolder),
    backup: await backupStatus(locations.backupFolder),
  };
}

export type OpenResult =
  | { outcome: 'opened'; created: boolean; archive: ArchiveInfo }
  | { outcome: 'missing'; folder: string; message: string }
  | { outcome: 'unknown-version'; folder: string; version: number; message: string }
  | { outcome: 'not-an-archive'; folder: string; message: string }
  | NotFound;

// Opens the archive in the saved evidence folder, creating it there if the
// folder is empty. A missing folder is reported; no archive is made in its
// place. A folder that is not a valid archive, or holds a manifest version this
// program does not know, is left as it is.
export async function openArchive(settingsFile: string): Promise<OpenResult> {
  const settings = await readSettingsFile(settingsFile);
  if (settings.outcome !== 'found') {
    return settings;
  }
  const folder = settings.locations.evidenceFolder;
  const evidence = await inspectEvidenceFolder(folder);
  switch (evidence.status) {
    case 'archive':
      return { outcome: 'opened', created: false, archive: { folder, archiveId: evidence.archiveId, createdAt: evidence.createdAt } };
    case 'missing':
      return { outcome: 'missing', folder, message: evidence.message };
    case 'not-an-archive':
      if (evidence.reason === 'unknown-version') {
        return { outcome: 'unknown-version', folder, version: evidence.version, message: evidence.message };
      }
      return { outcome: 'not-an-archive', folder, message: evidence.message };
    case 'empty':
      try {
        return { outcome: 'opened', created: true, archive: await createArchive(folder) };
      } catch (error) {
        if (isMissingError(error)) {
          return { outcome: 'missing', folder, message: `The evidence folder ${folder} went missing while the archive was being created.` };
        }
        throw error;
      }
  }
}

async function backupStatus(folder: string): Promise<{ status: 'present' } | { status: 'missing' | 'not-a-folder'; message: string }> {
  try {
    if ((await stat(folder)).isDirectory()) {
      return { status: 'present' };
    }
    return { status: 'not-a-folder', message: `The backup folder ${folder} is a file, not a folder.` };
  } catch (error) {
    if (isMissingError(error)) {
      return {
        status: 'missing',
        message: `The backup folder ${folder} cannot be found. If it is on a drive that is not plugged in, plug it in and try again.`,
      };
    }
    throw error;
  }
}
