// Every message the archive's folder operations can return to a person, in one
// place. No message advises emptying or deleting a folder. Every refusal about
// a folder suggests choosing a new empty folder instead.

const NEW_FOLDER = 'You can choose a new empty folder for the evidence instead.';

// Messages about the settings file itself. They are about the program's own
// file, not a folder the person chose, so they do not suggest a new folder.
export const settingsFileMessages = {
  notSet: () => 'The evidence and backup folders have not been chosen yet.',
  settingsUnavailable: (file: string, code: string) => `The folder settings file ${file} cannot be read (${code}).`,
  settingsDamaged: (file: string) =>
    `The folder settings file ${file} cannot be understood, so it is left as it is. To replace it, set the folders again and choose to replace the damaged settings; the damaged file is then kept beside the new one under another name.`,
  settingsNewer: (version: string, known: string) =>
    `The folder settings file is version ${version}. This program reads only version ${known}, so it leaves the file as it is. Update the program before changing the folders.`,
  settingsNotSaved: (file: string, code: string) =>
    `The folder settings could not be saved at ${file} (${code}). The settings file was not changed.`,
};

// Refusals and problems about a folder the person chose.
export const folderRefusals = {
  notFullPath: (name: string, location: string) =>
    `The ${name} must be a full path, starting from a drive or the top folder. Got: "${location}". ${NEW_FOLDER}`,
  folderMissing: (name: string, location: string) =>
    `The ${name} ${location} cannot be found. Only a folder that exists can be chosen. ${NEW_FOLDER}`,
  notAFolder: (name: string, location: string) => `The ${name} ${location} is a file, not a folder. ${NEW_FOLDER}`,
  folderUnavailable: (name: string, location: string, code: string) =>
    `The ${name} ${location} cannot be read (${code}). It may need permission, or be on a drive or share that is not available. ${NEW_FOLDER}`,
  driveRoot: (name: string, location: string) => `The ${name} cannot be the top of a drive (${location}). ${NEW_FOLDER}`,
  sameFolder: (a: string, b: string) =>
    `The evidence folder and the backup folder are the same folder (${a} and ${b}). They must be two separate folders. ${NEW_FOLDER}`,
  nested: (a: string, b: string) =>
    `One folder is inside the other (${a} and ${b}). They must be two separate folders. ${NEW_FOLDER}`,
  settingsInside: (file: string, folder: string) =>
    `The folder settings are kept at ${file}, which is inside ${folder}. They must stay outside both folders. ${NEW_FOLDER}`,
  evidenceNotUsable: (detail: string) =>
    `The evidence folder must be a new empty folder or one that already holds an archive. ${detail}`,
  evidenceMissing: (folder: string) =>
    `The evidence folder ${folder} cannot be found. If it is on a drive that is not plugged in, plug it in and try again. ${NEW_FOLDER}`,
  evidenceUnavailable: (folder: string, code: string) =>
    `The evidence folder ${folder} cannot be read (${code}). It may need permission, or be on a drive or share that is not available. ${NEW_FOLDER}`,
  evidenceIsFile: (folder: string) => `${folder} is a file, not a folder. ${NEW_FOLDER}`,
  unknownManifestVersion: (detail: string) => `${detail} ${NEW_FOLDER}`,
  badHeader: (detail: string, folder: string) => `${detail} Folder: ${folder}. Nothing in it was changed. ${NEW_FOLDER}`,
  badFirstLine: (folder: string, why: string) =>
    `The first line of the manifest in ${folder} ${why}, so it is not a valid archive. Nothing in it was changed. ${NEW_FOLDER}`,
  noManifest: (folder: string) =>
    `${folder} holds other files and no archive manifest, so it is not an archive. Nothing in it was changed. ${NEW_FOLDER}`,
  stoppedCreation: (folder: string) =>
    `Creating an archive in ${folder} stopped partway, and the folder is left as it is. ${NEW_FOLDER}`,
  archiveGone: (folder: string, expected: string) =>
    `The evidence folder ${folder} is empty, but archive ${expected} was kept there. No new archive is created. If the archive is on a drive that is not plugged in, plug it in and try again. ${NEW_FOLDER}`,
  differentArchive: (folder: string, found: string, expected: string) =>
    `The evidence folder ${folder} holds archive ${found}, not archive ${expected}, which was kept there. Nothing was changed. ${NEW_FOLDER}`,
  wentMissing: (folder: string) =>
    `The evidence folder ${folder} went missing before the archive was created. Nothing was created. ${NEW_FOLDER}`,
  notCreated: (folder: string, code: string) =>
    `No archive was created in ${folder} (${code}), and nothing was written. The folder may be read-only, or another copy of the program may be creating an archive there. ${NEW_FOLDER}`,
  creationStopped: (folder: string, code: string) =>
    `Creating an archive in ${folder} stopped partway (${code}). Nothing was replaced, and what was written is left as it is. ${NEW_FOLDER}`,
  creationIncomplete: (folder: string, code: string) =>
    `Creating an archive in ${folder} did not complete (${code}), and the folder now holds something else as well. Nothing was replaced, and everything in it is left as it is. ${NEW_FOLDER}`,
  backupMissing: (folder: string) =>
    `The backup folder ${folder} cannot be found. If it is on a drive that is not plugged in, plug it in and try again. ${NEW_FOLDER}`,
  backupIsFile: (folder: string) => `The backup folder ${folder} is a file, not a folder. ${NEW_FOLDER}`,
  backupUnavailable: (folder: string, code: string) =>
    `The backup folder ${folder} cannot be read (${code}). It may need permission, or be on a drive or share that is not available. ${NEW_FOLDER}`,
};

// Notices that come with a result that succeeded, or partly succeeded.
export const notices = {
  sameDrive: () =>
    'The evidence folder and the backup folder are on the same drive. If that drive fails, both can be lost.',
  settingsNotFlushed: (file: string, code: string) =>
    `The folder settings at ${file} were replaced, but forcing them to disk then failed (${code}). The new settings are in place, but may not survive a crash.`,
  createdNotFlushed: (folder: string, code: string) =>
    `The archive in ${folder} was fully written, but forcing the folder to disk then failed (${code}). It may not survive a crash.`,
  notRemembered: (what: string, file: string, code: string) =>
    `${what}, but its ID could not be remembered in ${file} (${code}). Opening it again tries once more.`,
};
