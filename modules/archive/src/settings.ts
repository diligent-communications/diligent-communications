// The two folder settings: the settings file, and the rules a pair of folders
// must meet before it is saved. The settings file is local to this computer and
// is never put in the archive or a backup.

import { mkdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileProblem, replaceFile, type ReplaceSteps } from './files.ts';

export const SETTINGS_VERSION = 1;

export type FolderLocations = {
  evidenceFolder: string;
  backupFolder: string;
};

export type SavedSettings = {
  locations: FolderLocations;
  // The ID of the archive created or accepted at the evidence folder, or null
  // when none has been yet.
  archiveId: string | null;
};

export type SettingsRead =
  | ({ outcome: 'found' } & SavedSettings)
  | { outcome: 'not-set'; message: string }
  | { outcome: 'unknown-version'; version: number; message: string }
  | { outcome: 'damaged'; message: string }
  | { outcome: 'unavailable'; message: string };

export async function readSettingsFile(settingsFile: string): Promise<SettingsRead> {
  let text: string;
  try {
    text = await readFile(settingsFile, 'utf8');
  } catch (error) {
    const { problem, code } = fileProblem(error);
    if (problem === 'missing') {
      return { outcome: 'not-set', message: 'The evidence and backup folders have not been chosen yet.' };
    }
    return { outcome: 'unavailable', message: `The folder settings file ${settingsFile} cannot be read (${code}).` };
  }
  const damaged: SettingsRead = {
    outcome: 'damaged',
    message: `The folder settings file ${settingsFile} cannot be read. Choose the evidence and backup folders again.`,
  };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return damaged;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return damaged;
  }
  const record = value as Record<string, unknown>;
  const version = record.settings_version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return damaged;
  }
  if (version !== SETTINGS_VERSION) {
    return {
      outcome: 'unknown-version',
      version,
      message: `The folder settings file is version ${version}. This program reads only version ${SETTINGS_VERSION}, so it leaves the file as it is.`,
    };
  }
  const { evidence_folder: evidenceFolder, backup_folder: backupFolder, archive_id: archiveId } = record;
  if (typeof evidenceFolder !== 'string' || typeof backupFolder !== 'string') {
    return damaged;
  }
  if (!isFullPath(evidenceFolder) || !isFullPath(backupFolder)) {
    return damaged;
  }
  if (archiveId !== null && (typeof archiveId !== 'string' || archiveId === '')) {
    return damaged;
  }
  return { outcome: 'found', locations: { evidenceFolder, backupFolder }, archiveId };
}

export async function writeSettingsFile(
  settingsFile: string,
  settings: SavedSettings,
  steps: ReplaceSteps = {},
): Promise<void> {
  await mkdir(path.dirname(settingsFile), { recursive: true });
  const record = {
    settings_version: SETTINGS_VERSION,
    evidence_folder: settings.locations.evidenceFolder,
    backup_folder: settings.locations.backupFolder,
    archive_id: settings.archiveId,
  };
  await replaceFile(settingsFile, `${JSON.stringify(record, null, 2)}\n`, steps);
}

export type FolderRefusal = {
  outcome: 'refused';
  reason:
    | 'not-full-path'
    | 'missing'
    | 'not-a-folder'
    | 'unavailable'
    | 'drive-root'
    | 'same-folder'
    | 'nested'
    | 'settings-inside'
    | 'evidence-not-empty'
    | 'unknown-manifest-version'
    | 'newer-settings';
  message: string;
};

export type FolderWarning = { kind: 'same-drive'; message: string };

export type CheckedFolders = {
  outcome: 'checked';
  // The real locations, after following any folder links.
  locations: FolderLocations;
  warnings: FolderWarning[];
};

// Checks the rules that do not depend on what is inside the evidence folder.
// Every comparison uses real locations, so a folder link cannot get around a
// rule, and file identity, so a second spelling of the same place cannot
// either.
export async function checkFolderPair(
  settingsFile: string,
  given: FolderLocations,
): Promise<CheckedFolders | FolderRefusal> {
  const named: [string, string][] = [
    ['evidence folder', given.evidenceFolder],
    ['backup folder', given.backupFolder],
  ];
  for (const [name, location] of named) {
    if (!isFullPath(location)) {
      return refuse('not-full-path', `The ${name} must be a full path, starting from a drive or the top folder. Got: "${location}".`);
    }
    // Refused before the disk is touched at all.
    if (isDriveRoot(path.resolve(location))) {
      return driveRootRefusal(name, location);
    }
  }
  const real: Place[] = [];
  for (const [name, location] of named) {
    const found = await realFolder(location);
    if (found.kind === 'missing') {
      return refuse('missing', `The ${name} ${location} cannot be found. Choose a folder that exists.`);
    }
    if (found.kind === 'not-a-folder') {
      return refuse('not-a-folder', `The ${name} ${location} is a file, not a folder.`);
    }
    if (found.kind === 'unavailable') {
      return refuse('unavailable', `The ${name} ${location} cannot be read (${found.code}). It may need permission, or be on a drive or share that is not available.`);
    }
    if (isDriveRoot(found.place.location)) {
      return driveRootRefusal(name, found.place.location);
    }
    real.push(found.place);
  }
  const [evidence, backup] = real as [Place, Place];
  if (await isSamePlace(evidence, backup)) {
    return refuse('same-folder', `The evidence folder and the backup folder are the same folder (${evidence.location} and ${backup.location}). Choose two separate folders.`);
  }
  if ((await isInsidePlace(evidence, backup)) || (await isInsidePlace(backup, evidence))) {
    return refuse('nested', `One folder is inside the other (${evidence.location} and ${backup.location}). Choose two separate folders.`);
  }
  const settings = await existingPlace(settingsFile);
  for (const folder of real) {
    if (settings !== null && ((await isSamePlace(settings, folder)) || (await isInsidePlace(settings, folder)))) {
      return refuse('settings-inside', `The folder settings are kept at ${settingsFile}, which is inside ${folder.location}. They must stay outside both folders.`);
    }
  }
  return {
    outcome: 'checked',
    locations: { evidenceFolder: evidence.location, backupFolder: backup.location },
    warnings: driveWarnings(evidence.dev, backup.dev),
  };
}

// Two folders on one drive could both be lost if that drive fails. Drives are
// compared by the device number the file system reports for each folder.
export function driveWarnings(evidenceDevice: bigint, backupDevice: bigint): FolderWarning[] {
  if (evidenceDevice !== backupDevice) {
    return [];
  }
  return [
    {
      kind: 'same-drive',
      message: 'The evidence folder and the backup folder are on the same drive. If that drive fails, both can be lost.',
    },
  ];
}

export function refuse(reason: FolderRefusal['reason'], message: string): FolderRefusal {
  return { outcome: 'refused', reason, message };
}

function driveRootRefusal(name: string, location: string): FolderRefusal {
  return refuse('drive-root', `The ${name} cannot be the top of a drive (${location}). Choose or make a folder on it.`);
}

// A full path names its drive or top folder. On Windows, "\folder" (relative
// to the current drive) and "C:folder" (relative to the current folder on C:)
// are not full paths, although Node counts the first as absolute.
function isFullPath(location: string): boolean {
  if (process.platform === 'win32') {
    return /^[A-Za-z]:[\\/]/.test(location) || /^[\\/]{2}[^\\/]/.test(location);
  }
  return path.isAbsolute(location);
}

// The top of a drive. On Windows, a drive letter's top folder such as "C:\",
// or a share's top folder such as "\\server\share\". On Linux and macOS, "/"
// only: the top folder of a mounted drive is not counted.
export function isDriveRoot(location: string, paths: path.PlatformPath = path): boolean {
  const root = paths.parse(location).root;
  return root !== '' && sameText(location, root, paths);
}

// A folder's real location and its file identity: the device number and file
// number the file system reports. The identity is null when the file system
// gives no file number.
type Place = { location: string; dev: bigint; id: string | null };

type FoundFolder =
  | { kind: 'folder'; place: Place }
  | { kind: 'missing' }
  | { kind: 'not-a-folder' }
  | { kind: 'unavailable'; code: string };

// The real location of an existing folder, with every folder link followed.
// Node's promise-based realpath uses the system's own lookup, which on Windows
// also gives each name its stored capitals and long form.
async function realFolder(location: string): Promise<FoundFolder> {
  try {
    const found = await realpath(location);
    const info = await stat(found, { bigint: true });
    if (!info.isDirectory()) {
      return { kind: 'not-a-folder' };
    }
    return { kind: 'folder', place: { location: found, dev: info.dev, id: identity(info) } };
  } catch (error) {
    const { problem, code } = fileProblem(error);
    return problem === 'missing' ? { kind: 'missing' } : { kind: 'unavailable', code };
  }
}

function identity(info: { dev: bigint; ino: bigint }): string | null {
  return info.ino === 0n ? null : `${info.dev}:${info.ino}`;
}

// The nearest part of a path that exists, as a place, or null if no part can
// be looked at. Used for the settings file, which may not exist yet.
async function existingPlace(location: string): Promise<Place | null> {
  let current = path.resolve(location);
  for (;;) {
    try {
      const found = await realpath(current);
      const info = await stat(found, { bigint: true });
      return { location: found, dev: info.dev, id: identity(info) };
    } catch (error) {
      const parent = path.dirname(current);
      if (fileProblem(error).problem !== 'missing' || parent === current) {
        return null;
      }
      current = parent;
    }
  }
}

async function isSamePlace(a: Place, b: Place): Promise<boolean> {
  return sameText(a.location, b.location) || (a.id !== null && a.id === b.id);
}

// Whether inner is inside outer: by its path, or because one of the folders
// above inner has the same file identity as outer.
async function isInsidePlace(inner: Place, outer: Place): Promise<boolean> {
  if (isInsideText(inner.location, outer.location)) {
    return true;
  }
  if (outer.id === null) {
    return false;
  }
  let current = inner.location;
  for (;;) {
    const parent = path.dirname(current);
    if (parent === current) {
      return false;
    }
    current = parent;
    try {
      if (identity(await stat(current, { bigint: true })) === outer.id) {
        return true;
      }
    } catch {
      // A folder above that cannot be looked at gives no answer; keep going up.
    }
  }
}

// Windows treats names that differ only in capitals as the same name.
function comparable(location: string, paths: path.PlatformPath = path): string {
  const withEnd = location.endsWith(paths.sep) ? location : `${location}${paths.sep}`;
  return paths === path.win32 ? withEnd.toLowerCase() : withEnd;
}

function sameText(a: string, b: string, paths: path.PlatformPath = path): boolean {
  return comparable(a, paths) === comparable(b, paths);
}

function isInsideText(inner: string, outer: string): boolean {
  return comparable(inner).startsWith(comparable(outer)) && !sameText(inner, outer);
}

export function sameSavedFolder(a: string, b: string): boolean {
  return sameText(a, b);
}
