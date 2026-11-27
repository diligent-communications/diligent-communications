// The two folder settings: the settings file, and the rules a pair of folders
// must meet before it is saved. The settings file is local to this computer and
// is never put in the archive or a backup.

import { mkdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { isMissingError, replaceFile } from './files.ts';

export const SETTINGS_VERSION = 1;

export type FolderLocations = {
  evidenceFolder: string;
  backupFolder: string;
};

export type SettingsRead =
  | { outcome: 'found'; locations: FolderLocations }
  | { outcome: 'not-set'; message: string }
  | { outcome: 'unknown-version'; version: number; message: string }
  | { outcome: 'damaged'; message: string };

export async function readSettingsFile(settingsFile: string): Promise<SettingsRead> {
  let text: string;
  try {
    text = await readFile(settingsFile, 'utf8');
  } catch (error) {
    if (isMissingError(error)) {
      return { outcome: 'not-set', message: 'The evidence and backup folders have not been chosen yet.' };
    }
    throw error;
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
  const { evidence_folder: evidenceFolder, backup_folder: backupFolder } = record;
  if (typeof evidenceFolder !== 'string' || typeof backupFolder !== 'string') {
    return damaged;
  }
  if (!isFullPath(evidenceFolder) || !isFullPath(backupFolder)) {
    return damaged;
  }
  return { outcome: 'found', locations: { evidenceFolder, backupFolder } };
}

export async function writeSettingsFile(settingsFile: string, locations: FolderLocations): Promise<void> {
  await mkdir(path.dirname(settingsFile), { recursive: true });
  const record = {
    settings_version: SETTINGS_VERSION,
    evidence_folder: locations.evidenceFolder,
    backup_folder: locations.backupFolder,
  };
  await replaceFile(settingsFile, `${JSON.stringify(record, null, 2)}\n`);
}

export type FolderRefusal = {
  outcome: 'refused';
  reason:
    | 'not-full-path'
    | 'missing'
    | 'not-a-folder'
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
// rule.
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
  }
  const real: string[] = [];
  for (const [name, location] of named) {
    const found = await realFolder(location);
    if (found === 'missing') {
      return refuse('missing', `The ${name} ${location} cannot be found. Choose a folder that exists.`);
    }
    if (found === 'not-a-folder') {
      return refuse('not-a-folder', `The ${name} ${location} is a file, not a folder.`);
    }
    if (isDriveRoot(found)) {
      return refuse('drive-root', `The ${name} cannot be the top of a drive (${found}). Choose or make a folder on it.`);
    }
    real.push(found);
  }
  const [evidence, backup] = real as [string, string];
  if (sameLocation(evidence, backup)) {
    return refuse('same-folder', `The evidence folder and the backup folder are the same folder (${evidence}). Choose two separate folders.`);
  }
  if (isInside(evidence, backup) || isInside(backup, evidence)) {
    return refuse('nested', `One folder is inside the other (${evidence} and ${backup}). Choose two separate folders.`);
  }
  const settings = await realLocation(settingsFile);
  for (const folder of real) {
    if (sameLocation(settings, folder) || isInside(settings, folder)) {
      return refuse('settings-inside', `The folder settings are kept at ${settings}, which is inside ${folder}. They must stay outside both folders.`);
    }
  }
  const warnings: FolderWarning[] = [];
  if ((await stat(evidence)).dev === (await stat(backup)).dev) {
    warnings.push({
      kind: 'same-drive',
      message: 'The evidence folder and the backup folder are on the same drive. If that drive fails, both can be lost.',
    });
  }
  return { outcome: 'checked', locations: { evidenceFolder: evidence, backupFolder: backup }, warnings };
}

export function refuse(reason: FolderRefusal['reason'], message: string): FolderRefusal {
  return { outcome: 'refused', reason, message };
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

// The real location of an existing folder, with every folder link followed.
// Node's promise-based realpath uses the system's own lookup, which on Windows
// also gives each name its stored capitals and long form.
async function realFolder(location: string): Promise<string | 'missing' | 'not-a-folder'> {
  try {
    const found = await realpath(location);
    return (await stat(found)).isDirectory() ? found : 'not-a-folder';
  } catch (error) {
    if (isMissingError(error)) {
      return 'missing';
    }
    throw error;
  }
}

// The real location of a path that may not exist yet: the real location of
// the nearest part that does, followed by the rest.
async function realLocation(location: string): Promise<string> {
  const rest: string[] = [];
  let current = path.resolve(location);
  for (;;) {
    try {
      return path.join(await realpath(current), ...rest);
    } catch (error) {
      const parent = path.dirname(current);
      if (!isMissingError(error) || parent === current) {
        throw error;
      }
      rest.unshift(path.basename(current));
      current = parent;
    }
  }
}

// The top of a drive: "C:\" or a network share such as "\\server\share\" on
// Windows, and "/" elsewhere.
function isDriveRoot(location: string): boolean {
  return sameLocation(location, path.parse(location).root);
}

// Windows treats names that differ only in capitals as the same name.
function comparable(location: string): string {
  const withEnd = location.endsWith(path.sep) ? location : `${location}${path.sep}`;
  return process.platform === 'win32' ? withEnd.toLowerCase() : withEnd;
}

function sameLocation(a: string, b: string): boolean {
  return comparable(a) === comparable(b);
}

function isInside(inner: string, outer: string): boolean {
  return comparable(inner).startsWith(comparable(outer)) && !sameLocation(inner, outer);
}
