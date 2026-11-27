// What is in an evidence folder, and how a new archive is written into an
// empty one. The layout follows modules/archive/CONTEXT.md.

import { randomUUID } from 'node:crypto';
import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { formatManifestHeader, newManifestHeader, readManifestHeader } from '../../../contracts/manifest-header.ts';
import { createFile, fileProblem, readFirstLine } from './files.ts';

export const MANIFEST_FILE = 'manifest.jsonl';
export const READ_ME_FILE = 'READ-ME.txt';
const RECORD_FOLDERS = ['originals', 'decisions', 'receipts'];

// Everything creating an archive writes. A folder holding only some of these,
// with no finished manifest header, is a creation that stopped partway.
const CREATED_NAMES = new Set([...RECORD_FOLDERS, READ_ME_FILE, MANIFEST_FILE]);

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

// Looks at the folder without changing anything in it. A valid archive is a
// folder whose manifest starts with a header line of a known version; other
// files in the folder do not change that.
export async function inspectEvidenceFolder(folder: string): Promise<EvidenceStatus> {
  try {
    return await inspect(folder);
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

async function inspect(folder: string): Promise<EvidenceStatus> {
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
  if (first.found !== 'not-a-file' && names.every((name) => CREATED_NAMES.has(name))) {
    return {
      status: 'not-an-archive',
      reason: 'unfinished-creation',
      message: `Creating an archive in ${folder} stopped partway. The folder is left as it is. Choose a new empty folder, or empty this one yourself.`,
    };
  }
  if (first.found === 'no-line') {
    return {
      status: 'not-an-archive',
      reason: 'bad-header',
      message: `The first line of the manifest in ${folder} ${first.why}, so it is not a valid archive.`,
    };
  }
  return {
    status: 'not-an-archive',
    reason: 'no-manifest',
    message: `${folder} holds other files and no archive manifest, so it is not an archive.`,
  };
}

function missing(folder: string): EvidenceStatus {
  return {
    status: 'missing',
    message: `The evidence folder ${folder} cannot be found. If it is on a drive that is not plugged in, plug it in and try again.`,
  };
}

export type CreateResult =
  | { outcome: 'created'; archive: ArchiveInfo }
  | { outcome: 'missing'; message: string }
  | { outcome: 'creation-stopped'; message: string };

// Writes a new archive into a folder the caller has found empty. Nothing is
// ever replaced: each folder and file is created only if nothing of that name
// exists. The manifest is written last, so a stopped creation never leaves
// something that opens as an archive. Folders are made one level at a time, so
// an evidence folder that has gone missing is never made again.
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
    const { problem, code } = fileProblem(error);
    if (problem === 'missing' && !started) {
      return { outcome: 'missing', message: `The evidence folder ${folder} went missing before the archive was created. Nothing was created.` };
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
