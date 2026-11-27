// What is in an evidence folder, and how a new archive is written into an
// empty one. The layout follows modules/archive/CONTEXT.md.

import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  formatManifestHeader,
  isStartOfManifestHeader,
  newManifestHeader,
  readManifestHeader,
  type ManifestHeader,
} from '../../../contracts/manifest-header.ts';
import { errorCode, failedStep, fileProblem, readFirstLine, syncFolder, writeNewFile } from './files.ts';
import { evidenceMessages as say, notices } from './messages.ts';

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
      return { status: 'missing', message: say.evidenceMissing(folder) };
    }
    return { status: 'unavailable', message: say.evidenceUnavailable(folder, code) };
  }
}

async function inspect(folder: string, options: InspectOptions): Promise<EvidenceStatus> {
  if (!(await stat(folder)).isDirectory()) {
    return { status: 'not-an-archive', reason: 'not-a-folder', message: say.evidenceIsFile(folder) };
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
      return {
        status: 'not-an-archive',
        reason: 'unknown-version',
        version: header.version,
        message: say.unknownManifestVersion(header.message, folder),
      };
    }
    return { status: 'not-an-archive', reason: 'bad-header', message: say.badHeader(header.message, folder) };
  }
  if (!options.archiveRemembered && (await onlyCreationLeftovers(folder, names))) {
    return { status: 'not-an-archive', reason: 'unfinished-creation', message: say.stoppedCreation(folder) };
  }
  if (first.found === 'no-line') {
    return { status: 'not-an-archive', reason: 'bad-header', message: say.badFirstLine(folder, first.why) };
  }
  return { status: 'not-an-archive', reason: 'no-manifest', message: say.noManifest(folder) };
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
      if (!info.isFile() || info.size > HEADER_MAX_BYTES) {
        return false;
      }
      if (!isStartOfManifestHeader(await readFile(full, 'latin1'))) {
        return false;
      }
    } else {
      return false;
    }
  }
  return true;
}

export type CreateResult =
  | { outcome: 'created'; archive: ArchiveInfo; notice?: string }
  | {
      outcome: 'missing' | 'not-created' | 'creation-stopped' | 'creation-incomplete' | 'creation-unchecked';
      message: string;
    };

// Writes a new archive into a folder the caller has found empty. Nothing is
// ever replaced: each folder and file is created only if nothing of that name
// exists. The manifest is written last, so a stopped creation never leaves
// something that opens as an archive. Folders are made one level at a time, so
// an evidence folder that has gone missing is never made again.
//
// What a failure is reported as:
// - If the very first step fails, this call wrote nothing: the folder may be
//   missing, read-only or unreadable, or another open may have started there.
// - If this call's own header line is fully in place when a later step fails
//   (writing, flushing or closing the manifest, or flushing the folder), the archive is
//   complete: it is reported as created, with a notice naming that step.
// - Otherwise the folder is looked at again. Only if it holds nothing but this
//   creation's leftovers is it a stopped creation; if it holds anything else,
//   the creation did not complete; if it cannot be read, only that is said.
export async function createArchive(folder: string): Promise<CreateResult> {
  const manifest = path.join(folder, MANIFEST_FILE);
  let started = false;
  let header: ManifestHeader | undefined;
  try {
    for (const name of RECORD_FOLDERS) {
      await mkdir(path.join(folder, name));
      started = true;
    }
    await writeNewFile(path.join(folder, READ_ME_FILE), READ_ME);
    header = newManifestHeader(randomUUID(), new Date());
    await writeNewFile(manifest, formatManifestHeader(header));
  } catch (error) {
    const code = errorCode(error);
    if (code === undefined) {
      throw error;
    }
    if (!started) {
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        return { outcome: 'missing', message: say.wentMissing(folder) };
      }
      return { outcome: 'not-created', message: say.notCreated(folder, code) };
    }
    if (header !== undefined && (await holdsExactly(manifest, formatManifestHeader(header)))) {
      const step = {
        write: 'writing the manifest file',
        flush: 'flushing the manifest file',
        close: 'closing the manifest file',
        open: 'opening the manifest file',
      }[failedStep(error) ?? 'open'];
      return { outcome: 'created', archive: infoOf(folder, header), notice: notices.createdStepFailed(folder, step, code) };
    }
    const left = await leftoversOnly(folder);
    if (left.readable === false) {
      return { outcome: 'creation-unchecked', message: say.creationUnchecked(folder, code, left.code) };
    }
    if (left.only) {
      return { outcome: 'creation-stopped', message: say.creationStopped(folder, code) };
    }
    return { outcome: 'creation-incomplete', message: say.creationIncomplete(folder, code) };
  }
  try {
    await syncFolder(folder);
  } catch (error) {
    const code = errorCode(error);
    if (code === undefined) {
      throw error;
    }
    return {
      outcome: 'created',
      archive: infoOf(folder, header),
      notice: notices.createdStepFailed(folder, 'flushing the evidence folder', code),
    };
  }
  return { outcome: 'created', archive: infoOf(folder, header) };
}

function infoOf(folder: string, header: ManifestHeader): ArchiveInfo {
  return { folder, archiveId: header.archive_id, createdAt: header.created_at };
}

// Whether the file holds exactly this text. Any problem reading it means no.
async function holdsExactly(file: string, text: string): Promise<boolean> {
  try {
    return (await readFile(file, 'utf8')) === text;
  } catch (error) {
    if (errorCode(error) === undefined) {
      throw error;
    }
    return false;
  }
}

// The leftovers test, for a folder that may no longer be readable.
async function leftoversOnly(folder: string): Promise<{ readable: true; only: boolean } | { readable: false; code: string }> {
  try {
    return { readable: true, only: await onlyCreationLeftovers(folder, await readdir(folder)) };
  } catch (error) {
    const code = errorCode(error);
    if (code === undefined) {
      throw error;
    }
    return { readable: false, code };
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
