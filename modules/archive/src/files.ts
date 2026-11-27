// File handling shared by the archive's operations. Nothing outside the archive
// module uses these directly.

import { randomUUID } from 'node:crypto';
import { open, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

// Writes the whole file under a temporary name beside the target, forces it to
// disk, then renames it over the target. A reader sees the old file or the new
// one, never a part-written file. Node's rename replaces an existing file.
export async function replaceFile(target: string, contents: string): Promise<void> {
  const folder = path.dirname(target);
  const temporary = path.join(folder, `.${path.basename(target)}.${randomUUID()}.tmp`);
  try {
    const handle = await open(temporary, 'wx');
    try {
      await handle.writeFile(contents, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  await syncFolder(folder);
}

// Forces the folder's list of names to disk, so the rename itself survives a
// crash. Windows does not let a program open a folder to do this.
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
// only once its line end is written.
export async function readFirstLine(file: string, maxBytes: number): Promise<FirstLine> {
  try {
    if (!(await stat(file)).isFile()) {
      return { found: 'not-a-file' };
    }
  } catch (error) {
    if (isMissingError(error)) {
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

// The path, or a folder on the way to it, does not exist.
export function isMissingError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}
