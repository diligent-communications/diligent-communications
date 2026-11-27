// Every message the archive's folder operations can return to a person, in one
// place. A message says what the program found, and names the folder or file
// it is about. It gives no advice: what to do next is for the surface that
// shows the result, which can see the whole situation. A message never claims
// something the program has not checked.

import type { BadManifest } from './writer-manifest.ts';

// Messages about the folder settings file.
export const settingsFileMessages = {
  notSet: (file: string) => `The folder settings file ${file} cannot be found.`,
  settingsUnavailable: (file: string, code: string) => `The folder settings file ${file} cannot be read (${code}).`,
  settingsDamaged: (file: string) => `The folder settings file ${file} cannot be understood. It was left as it is.`,
  settingsNewer: (version: string, known: string) =>
    `The folder settings file is version ${version}. This program reads only version ${known}, so it left the file as it is.`,
  settingsNotSaved: (file: string, code: string) =>
    `The folder settings could not be saved at ${file} (${code}). The settings file was not changed.`,
};

// Messages about a folder in the chosen pair. `name` is "evidence folder" or
// "backup folder".
export const pairMessages = {
  notFullPath: (name: string, location: string) =>
    `The ${name} "${location}" is not a full path from a drive or the top folder.`,
  folderMissing: (name: string, location: string) => `The ${name} ${location} cannot be found.`,
  notAFolder: (name: string, location: string) => `The ${name} ${location} is a file, not a folder.`,
  folderUnavailable: (name: string, location: string, code: string) => `The ${name} ${location} cannot be read (${code}).`,
  driveRoot: (name: string, location: string) => `The ${name} is the top of a drive (${location}).`,
};

// Messages that are about both folders, or about the settings file and a folder.
export const bothFoldersMessages = {
  sameFolder: (evidence: string, backup: string) =>
    `The evidence folder and the backup folder are the same folder (${evidence} and ${backup}).`,
  nested: (evidence: string, backup: string) =>
    `Of the evidence folder and the backup folder, one is inside the other (${evidence} and ${backup}).`,
  settingsInside: (file: string, name: string, folder: string) =>
    `The folder settings file ${file} is inside the chosen ${name} ${folder}.`,
};

// Messages about the evidence folder.
export const evidenceMessages = {
  evidenceNotUsable: (detail: string) => `The evidence folder is neither empty nor an archive. ${detail}`,
  evidenceMissing: (folder: string) => `The evidence folder ${folder} cannot be found.`,
  evidenceUnavailable: (folder: string, code: string) => `The evidence folder ${folder} cannot be read (${code}).`,
  evidenceIsFile: (folder: string) => `The evidence folder ${folder} is a file, not a folder.`,
  unknownManifestVersion: (detail: string, folder: string) => `In the evidence folder ${folder}: ${detail}`,
  badHeader: (detail: string, folder: string) =>
    `In the evidence folder ${folder}: ${detail} It is not a valid archive, and nothing in it was changed.`,
  badFirstLine: (folder: string, why: string) =>
    `The first line of the manifest in the evidence folder ${folder} ${why}, so it is not a valid archive. Nothing in it was changed.`,
  noManifest: (folder: string) =>
    `The evidence folder ${folder} holds other files and no archive manifest, so it is not an archive. Nothing in it was changed.`,
  stoppedCreation: (folder: string) =>
    `The evidence folder ${folder} holds only the start of an archive whose creation stopped partway. It was left as it is.`,
  archiveGone: (folder: string, expected: string) =>
    `The evidence folder ${folder} is empty, but archive ${expected} was kept there. No new archive was created.`,
  differentArchive: (folder: string, found: string, expected: string) =>
    `The evidence folder ${folder} holds archive ${found}, not archive ${expected}, which was kept there. Nothing was changed.`,
  wentMissing: (folder: string) =>
    `The evidence folder ${folder} went missing before the archive was created. Nothing was created.`,
  notCreated: (folder: string, code: string) =>
    `No archive was created in the evidence folder ${folder} (${code}), and nothing was written.`,
  creationStopped: (folder: string, code: string) =>
    `Creating an archive in the evidence folder ${folder} stopped partway (${code}). Nothing was replaced, and what was written was left as it is.`,
  creationIncomplete: (folder: string, code: string) =>
    `Creating an archive in the evidence folder ${folder} did not complete (${code}), and the folder now holds something else as well. Nothing was replaced, and everything in it was left as it is.`,
  creationUnchecked: (folder: string, code: string, readCode: string) =>
    `An error occurred while creating an archive in the evidence folder ${folder} (${code}). The folder could not be read afterwards (${readCode}). Nothing was replaced.`,
};

// Messages about the backup folder.
export const backupMessages = {
  backupMissing: (folder: string) => `The backup folder ${folder} cannot be found.`,
  backupIsFile: (folder: string) => `The backup folder ${folder} is a file, not a folder.`,
  backupUnavailable: (folder: string, code: string) => `The backup folder ${folder} cannot be read (${code}).`,
};

const badManifestReasons = {
  'unreadable-line': 'cannot be read as a manifest line',
  'duplicate-record-id': 'repeats a record ID within its kind',
  'duplicate-path': 'repeats a file path',
  'duplicate-source-id': 'repeats an original’s source ID',
  'wrong-original-id': 'has an original record ID that does not match its derivation',
  'wrong-original-path': 'has an original path that does not match its derivation',
};

export const originalMessages = {
  inUse: (archiveId: string) => `An archive with ID ${archiveId} is open for writing.`,
  lockUnavailable: (archiveId: string, detail: string) =>
    `The write lock for archive ID ${archiveId} could not be opened (${detail}).`,
  badManifest: (file: string, problem: BadManifest) => {
    const reason = problem.reason === 'unknown-version' ? `has unsupported version ${problem.version}` : badManifestReasons[problem.reason];
    return `Line ${problem.line} of the manifest ${file} ${reason}.`;
  },
  manifestUnavailable: (file: string, detail: string) => `The manifest ${file} could not be opened for this archive (${detail}).`,
  differentArchive: (file: string, found: string, expected: string) =>
    `The manifest ${file} identifies archive ${found}. The requested archive ID is ${expected}.`,
  manifestChanged: (file: string) => `The manifest ${file} changed while the archive was open for writing.`,
  invalidRecord: (file: string) => `No entry was added to manifest ${file} because the captured record does not match version 1.`,
  unknownRecordVersion: (file: string, version: number) =>
    `No entry was added to manifest ${file} for the version ${version} captured record. This program reads version 1.`,
  closed: (folder: string) => `The archive in the evidence folder ${folder} is closed for writing.`,
  held: (id: string, bytesDiffer: boolean) =>
    `Record ${id} is already held.${bytesDiffer ? ' The incoming bytes differ from the stored original.' : ''}`,
  comparisonUnavailable: (id: string, file: string, detail: string) =>
    `Record ${id} is already held. Its original ${file} could not be read for comparison (${detail}).`,
  saveFailed: (id: string, step: string, detail: string) =>
    `Saving original ${id} encountered an error while ${step} (${detail}).`,
  stemInUse: (id: string) => `Another manifest entry uses the file name stem for original ${id}.`,
  saved: (id: string) => `Original ${id} was saved.`,
  appendFailure: (id: string, step: string, detail: string) =>
    `The entry for original ${id} is complete. An error occurred while ${step} (${detail}).`,
  heldAfterChange: (id: string, file: string) =>
    `The entry for original ${id} is complete. The manifest ${file} changed afterwards and the writer has stopped.`,
  stopped: (file: string, step: string) =>
    `The writer for manifest ${file} has stopped after an earlier problem while ${step}.`,
};

// Notices that come with a result that succeeded.
export const notices = {
  sameDrive: () =>
    'The evidence folder and the backup folder are on the same drive. If that drive fails, both can be lost.',
  settingsNotFlushed: (file: string, code: string) =>
    `The folder settings file ${file} was replaced, but forcing it to disk then failed (${code}). The new settings are in place, but are not known to be on disk.`,
  createdStepFailed: (folder: string, step: string, code: string) =>
    `The archive in the evidence folder ${folder} was fully written, but ${step} then failed (${code}). It is not known to be on disk.`,
  notRemembered: (what: string, file: string, code: string) =>
    `${what}, but its ID could not be saved in the folder settings file ${file} (${code}).`,
};
