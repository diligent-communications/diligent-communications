// What is in an evidence folder, and how a new archive is written into an
// empty one. The layout follows modules/archive/CONTEXT.md.

import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { formatManifestHeader, newManifestHeader, readManifestHeader } from '../../../contracts/manifest-header.ts';
import { createFile, errorCode, fileProblem, readFirstLine } from './files.ts';

export const MANIFEST_FILE = 'manifest.jsonl';
export const READ_ME_FILE = 'READ-ME.txt';
const RECORD_FOLDERS = ['originals', 'decisions', 'receipts'];

// A header line is small. Anything longer is not one.
const HEADER_MAX_BYTES = 64 * 1024;

export type ArchiveInfo = {
  folder: string;
  archiveId: string;
  createdAt: string;
};

export type NotAnArchiveReason = 'not-a-folder' | 'no-manifest' | 'bad-header' | 'unfinished-creation';

export type EvidenceStatus =
  | ({ status: 'archive' } & ArchiveInfo)
  | { status: 'empty' }
  | { status: 'missing'; message: string }
  | { status: 'unavailable'; message: string }
  | { status: 'not-an-archive'; reason: 'unknown-version'; version: number; message: string }
  | { status: 'not-an-archive'; reason: NotAnArchiveReason; message: string };

export type InspectOptions = {
  // True when an archive ID is remembered for this folder. A creation can only
  // have stopped partway where none is, since the ID is remembered once
  // creating has finished.
  archiveRemembered: boolean;
};

// Looks at the folder without changing anything in it. A valid archive is a
// folder whose manifest starts with a header line of a known version; other
// files in the folder do not change that.
export async function inspectEvidenceFolder(folder: string, options: InspectOptions): Promise<EvidenceStatus> {
  try {
    return await inspect(folder, options);
  } catch (error) {
    const { problem, code } = fileProblem(error);
    if (problem === 'missing') {
      return missing(folder);
    }
    return {
      status: 'unavailable',
      message: `The evidence folder ${folder} cannot be read (${code}). It may need permission, or be on a drive or share that is not available.`,
    };
  }
}

async function inspect(folder: string, options: InspectOptions): Promise<EvidenceStatus> {
  if (!(await stat(folder)).isDirectory()) {
    return { status: 'not-an-archive', reason: 'not-a-folder', message: `${folder} is a file, not a folder.` };
  }
  const names = await readdir(folder);
  if (names.length === 0) {
    return { status: 'empty' };
  }
  const first = await readFirstLine(path.join(folder, MANIFEST_FILE), HEADER_MAX_BYTES);
  if (first.found === 'line') {
    const header = readManifestHeader(first.text);
    if (header.outcome === 'header') {
      return { status: 'archive', folder, archiveId: header.header.archive_id, createdAt: header.header.created_at };
    }
    if (header.outcome === 'unknown-version') {
      return { status: 'not-an-archive', reason: 'unknown-version', version: header.version, message: header.message };
    }
    return { status: 'not-an-archive', reason: 'bad-header', message: `${header.message} Folder: ${folder}.` };
  }
  if (!options.archiveRemembered && (await onlyCreationLeftovers(folder, names))) {
    return {
      status: 'not-an-archive',
      reason: 'unfinished-creation',
      message: `Creating an archive in ${folder} stopped partway, and the folder is left as it is. Choose a new empty folder for the evidence.`,
    };
  }
  if (first.found === 'no-line') {
    return {
      status: 'not-an-archive',
      reason: 'bad-header',
      message: `The first line of the manifest in ${folder} ${first.why}, so it is not a valid archive. Nothing in it was changed.`,
    };
  }
  return {
    status: 'not-an-archive',
    reason: 'no-manifest',
    message: `${folder} holds other files and no archive manifest, so it is not an archive. Nothing in it was changed.`,
  };
}

// Whether the folder holds nothing but what a stopped creation leaves: empty
// record folders, a read-me that is the start of this program's own, and a
// manifest that is only the start of a header line. Links are not followed.
async function onlyCreationLeftovers(folder: string, names: string[]): Promise<boolean> {
  for (const name of names) {
    const full = path.join(folder, name);
    const info = await lstat(full);
    if (RECORD_FOLDERS.includes(name)) {
      if (!info.isDirectory() || (await readdir(full)).length > 0) {
        return false;
      }
    } else if (name === READ_ME_FILE) {
      if (!info.isFile() || info.size > READ_ME_BYTES.length) {
        return false;
      }
      if (!(await readFile(full)).equals(READ_ME_BYTES.subarray(0, info.size))) {
        return false;
      }
    } else if (name === MANIFEST_FILE) {
      if (!info.isFile() || info.size > HEADER_SHAPE.length) {
        return false;
      }
      if (!isStartOfHeader(await readFile(full, 'latin1'))) {
        return false;
      }
    } else {
      return false;
    }
  }
  return true;
}

// The shape of a header line this program writes, without its line end. Two
// marks that cannot appear in the line stand for a character of a random
// archive ID and a character of a UTC time.
const ID_CHAR = '\u0001';
const TIME_CHAR = '\u0002';
const HEADER_SHAPE = `{"line":"header","manifest_version":1,"archive_id":"${ID_CHAR.repeat(36)}","created_at":"${TIME_CHAR.repeat(24)}"}`;

function isStartOfHeader(text: string): boolean {
  if (text.length > HEADER_SHAPE.length) {
    return false;
  }
  for (let i = 0; i < text.length; i += 1) {
    const shape = HEADER_SHAPE[i];
    const char = text[i] ?? '';
    const fits = shape === ID_CHAR ? /[0-9a-f-]/.test(char) : shape === TIME_CHAR ? /[0-9TZ:.-]/.test(char) : char === shape;
    if (!fits) {
      return false;
    }
  }
  return true;
}

function missing(folder: string): EvidenceStatus {
  return {
    status: 'missing',
    message: `The evidence folder ${folder} cannot be found. If it is on a drive that is not plugged in, plug it in and try again.`,
  };
}

export type CreateResult =
  | { outcome: 'created'; archive: ArchiveInfo }
  | { outcome: 'missing' | 'not-created' | 'creation-stopped'; message: string };

// Writes a new archive into a folder the caller has found empty. Nothing is
// ever replaced: each folder and file is created only if nothing of that name
// exists. The manifest is written last, so a stopped creation never leaves
// something that opens as an archive. Folders are made one level at a time, so
// an evidence folder that has gone missing is never made again.
//
// If the very first step fails, this call wrote nothing, and that is what it
// reports: the folder may be missing, read-only or unreadable, or another
// open may have just started creating there.
export async function createArchive(folder: string): Promise<CreateResult> {
  let started = false;
  try {
    for (const name of RECORD_FOLDERS) {
      await mkdir(path.join(folder, name));
      started = true;
    }
    await createFile(path.join(folder, READ_ME_FILE), READ_ME);
    const header = newManifestHeader(randomUUID(), new Date());
    await createFile(path.join(folder, MANIFEST_FILE), formatManifestHeader(header));
    return { outcome: 'created', archive: { folder, archiveId: header.archive_id, createdAt: header.created_at } };
  } catch (error) {
    const code = errorCode(error);
    if (code === undefined) {
      throw error;
    }
    if (!started) {
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        return { outcome: 'missing', message: `The evidence folder ${folder} went missing before the archive was created. Nothing was created.` };
      }
      return {
        outcome: 'not-created',
        message: `No archive was created in ${folder} (${code}), and nothing was written. The folder may be read-only, or another copy of the program may be creating an archive there.`,
      };
    }
    return {
      outcome: 'creation-stopped',
      message: `Creating an archive in ${folder} stopped partway (${code}). Nothing was replaced, and what was written is left as it is.`,
    };
  }
}

const READ_ME = `Diligent Communications evidence folder
=======================================

This folder is an archive of original communications and the records kept
about them. Nothing in it is encrypted, so you can find and open every file
without the program. Anyone who can open this folder, or a backup of it, can
read what is in it.

What is here
------------

${MANIFEST_FILE}
    The index of everything in this folder. It is a text file that any text
    editor opens. Each line is one record written as JSON.
    The first line says which version of the manifest this is, gives this
    archive's ID, and says when the archive was created.
    Each later line describes one saved file. Its "path" says where the file
    is inside this folder, and "sha256" and "size_bytes" let you check that
    the file has not changed. For an original, "source_id", "source_kind",
    "media_type" and "captured_at" say where it came from, what type of file
    it is, and when it was received.

originals/
    The original communications, saved exactly as they were received.

decisions/
    Readable records of choices a person made, such as an approval.

receipts/
    Readable records of approved actions and how they turned out.

Finding and opening a file without the program
----------------------------------------------

1. Open ${MANIFEST_FILE} in a text editor.
2. Search for something you know about the item, such as its source ID or the
   date it was captured.
3. On that line, read the "path" value.
4. Open the file at that path, inside this folder, with an ordinary app that
   handles its "media_type". For example, message/rfc822 is an email file
   that a mail program opens.

Please do not move, rename or change files here. The manifest records each
file's size and fingerprint, so a changed file shows up as damaged when the
files are checked against it.
`;

const READ_ME_BYTES = Buffer.from(READ_ME, 'utf8');
