// What is in an evidence folder, and how a new archive is written into an
// empty one. The layout follows modules/archive/CONTEXT.md.

import { randomUUID } from 'node:crypto';
import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { formatManifestHeader, newManifestHeader, readManifestHeader } from '../../../contracts/manifest-header.ts';
import { isMissingError, readFirstLine, replaceFile } from './files.ts';

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

export type EvidenceStatus =
  | ({ status: 'archive' } & ArchiveInfo)
  | { status: 'empty' }
  | { status: 'missing'; message: string }
  | { status: 'not-an-archive'; reason: 'unknown-version'; version: number; message: string }
  | { status: 'not-an-archive'; reason: 'not-a-folder' | 'no-manifest' | 'bad-header'; message: string };

// Looks at the folder without changing anything in it.
export async function inspectEvidenceFolder(folder: string): Promise<EvidenceStatus> {
  try {
    if (!(await stat(folder)).isDirectory()) {
      return { status: 'not-an-archive', reason: 'not-a-folder', message: `${folder} is a file, not a folder.` };
    }
  } catch (error) {
    if (isMissingError(error)) {
      return {
        status: 'missing',
        message: `The evidence folder ${folder} cannot be found. If it is on a drive that is not plugged in, plug it in and try again.`,
      };
    }
    throw error;
  }
  if ((await readdir(folder)).length === 0) {
    return { status: 'empty' };
  }
  const first = await readFirstLine(path.join(folder, MANIFEST_FILE), HEADER_MAX_BYTES);
  if (first.found === 'missing' || first.found === 'not-a-file') {
    return {
      status: 'not-an-archive',
      reason: 'no-manifest',
      message: `${folder} holds other files and no archive manifest, so it is not an archive.`,
    };
  }
  if (first.found === 'no-line') {
    return {
      status: 'not-an-archive',
      reason: 'bad-header',
      message: `The first line of the manifest in ${folder} ${first.why}, so it is not a valid archive.`,
    };
  }
  const header = readManifestHeader(first.text);
  if (header.outcome === 'unknown-version') {
    return { status: 'not-an-archive', reason: 'unknown-version', version: header.version, message: header.message };
  }
  if (header.outcome === 'not-a-header') {
    return { status: 'not-an-archive', reason: 'bad-header', message: `${header.message} Folder: ${folder}.` };
  }
  return { status: 'archive', folder, archiveId: header.header.archive_id, createdAt: header.header.created_at };
}

// Writes a new archive into a folder the caller has found empty. The manifest
// is written last, so a stopped creation never leaves something that opens as
// an archive. Folders are made one level at a time, so a folder that has gone
// missing is never made again.
export async function createArchive(folder: string): Promise<ArchiveInfo> {
  for (const name of RECORD_FOLDERS) {
    await mkdir(path.join(folder, name));
  }
  await replaceFile(path.join(folder, READ_ME_FILE), READ_ME);
  const header = newManifestHeader(randomUUID(), new Date());
  await replaceFile(path.join(folder, MANIFEST_FILE), formatManifestHeader(header));
  return { folder, archiveId: header.archive_id, createdAt: header.created_at };
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
