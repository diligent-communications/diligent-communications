// File handling shared by the archive's operations. Nothing outside the archive
// module uses these directly.

import { randomUUID } from 'node:crypto';
import { open, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

export type ReplaceSteps = {
  // Called once the new contents are complete on disk under the temporary
  // name, just before the rename. Tests use it to look at the files then.
  beforeRename?: (temporary: string) => Promise<void>;
};

// Writes the whole file under a temporary name beside the target, forces it to
// disk, then renames it over the target. A reader sees the old file or the new
// one, never a part-written file, and the old file is never deleted first.
// Node's rename replaces an existing file. If anything fails, the temporary
// file is removed and the target is left as it was.
export async function replaceFile(target: string, contents: string, steps: ReplaceSteps = {}): Promise<void> {
  const folder = path.dirname(target);
  const temporary = path.join(folder, `.${path.basename(target)}.${randomUUID()}.tmp`);
  try {
    await writeNewFile(temporary, contents);
    await steps.beforeRename?.(temporary);
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  await syncFolder(folder);
}

// Creates a file that must not exist yet. If a file of that name is already
// there, it fails with EEXIST and leaves that file as it is.
export async function createFile(target: string, contents: string): Promise<void> {
  await writeNewFile(target, contents);
  await syncFolder(path.dirname(target));
}

async function writeNewFile(target: string, contents: string): Promise<void> {
  const handle = await open(target, 'wx');
  try {
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

// Forces the folder's list of names to disk, so a new name survives a crash.
// Windows does not let a program open a folder to do this.
async function syncFolder(folder: string): Promise<void> {
  if (process.platform === 'win32') {
    return;
  }
  const handle = await open(folder, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export type FirstLine =
  | { found: 'line'; text: string }
  | { found: 'missing' }
  | { found: 'not-a-file' }
  | { found: 'no-line'; why: string };

// Reads the first line of a text file without reading the rest. A line counts
// only once its line end is written. Errors other than a missing file are
// passed on for the caller to classify.
export async function readFirstLine(file: string, maxBytes: number): Promise<FirstLine> {
  try {
    if (!(await stat(file)).isFile()) {
      return { found: 'not-a-file' };
    }
  } catch (error) {
    if (fileProblem(error).problem === 'missing') {
      return { found: 'missing' };
    }
    throw error;
  }
  const buffer = Buffer.alloc(maxBytes);
  let length = 0;
  let end = -1;
  const handle = await open(file, 'r');
  try {
    while (length < maxBytes) {
      const { bytesRead } = await handle.read(buffer, length, maxBytes - length, length);
      if (bytesRead === 0) {
        break;
      }
      end = buffer.subarray(0, length + bytesRead).indexOf(0x0a, length);
      length += bytesRead;
      if (end !== -1) {
        break;
      }
    }
  } finally {
    await handle.close();
  }
  if (end === -1) {
    return { found: 'no-line', why: length >= maxBytes ? 'is too long' : 'has no line end' };
  }
  try {
    return { found: 'line', text: new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, end)) };
  } catch {
    return { found: 'no-line', why: 'is not readable text' };
  }
}

// What a failed file system call means for a caller. "missing": the path, or a
// folder on the way to it, does not exist. "unavailable": anything else the
// system reported, such as no permission, a link loop, or a drive or share
// that is not ready. An error that did not come from the file system is a
// fault in the program and is thrown again.
export function fileProblem(error: unknown): { problem: 'missing' | 'unavailable'; code: string } {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (typeof code !== 'string') {
    throw error;
  }
  return { problem: code === 'ENOENT' || code === 'ENOTDIR' ? 'missing' : 'unavailable', code };
}
