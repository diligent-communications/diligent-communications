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
// Node's rename replaces an existing file. If anything fails before the
// rename, the temporary file is removed and the target is left as it was. If
// only the last step fails, after the target was replaced, the error is a
// ReplacedButNotFlushed, so the caller can say what really happened.
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
  try {
    await syncFolder(folder);
  } catch (error) {
    throw new ReplacedButNotFlushed(error);
  }
}

// The file was replaced, but forcing the folder's list of names to disk then
// failed. The new contents are in place; they may not survive a crash.
export class ReplacedButNotFlushed extends Error {
  readonly code: string;
  constructor(cause: unknown) {
    const code = errorCode(cause) ?? 'UNKNOWN';
    super(`The file was replaced, but the folder could not be flushed to disk (${code}).`, { cause });
    this.code = code;
  }
}

// Creates a file that must not exist yet and forces its contents to disk. If a
// file of that name is already there, it fails with EEXIST and leaves that file
// as it is. Failures after opening carry the step that failed.
export async function writeNewFile(target: string, contents: string | Uint8Array): Promise<void> {
  const handle = await open(target, 'wx');
  try {
    await handle.writeFile(contents, 'utf8');
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw withStep(error, 'write');
  }
  try {
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw withStep(error, 'flush');
  }
  try {
    await handle.close();
  } catch (error) {
    throw withStep(error, 'close');
  }
}

export type FileStep = 'write' | 'flush' | 'close';

function withStep(error: unknown, step: FileStep): unknown {
  if (typeof error === 'object' && error !== null) {
    Object.assign(error, { step });
  }
  return error;
}

// The step a writeNewFile failure came from, after opening the file.
export function failedStep(error: unknown): FileStep | undefined {
  const step = (error as { step?: unknown } | undefined)?.step;
  return step === 'write' || step === 'flush' || step === 'close' ? step : undefined;
}

// Forces the folder's list of names to disk, so a new name survives a crash.
// Windows does not let a program open a folder to do this.
export async function syncFolder(folder: string): Promise<void> {
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

const MISSING_CODES = new Set(['ENOENT', 'ENOTDIR']);

// No permission (EACCES, EPERM), a link loop (ELOOP), a read-only drive
// (EROFS), a device that fails or is not there (EIO, EBUSY, ENODEV, ENXIO), or
// a share or network folder that stops answering. The network codes are the
// ones Node's libuv (the same in Node 24.12.0 and 26) gives for this: on
// Windows, "network name is no longer available" becomes ECONNRESET, "not
// connected" ENOTCONN, "connection aborted" ECONNABORTED, "semaphore timeout"
// ETIMEDOUT, and unreachable hosts and networks EHOSTUNREACH and ENETUNREACH;
// network mounts on Linux can also give ECONNREFUSED, EHOSTDOWN, ENETDOWN,
// ENONET and EREMOTEIO. Errors Windows has no mapping for arrive as UNKNOWN.
const UNAVAILABLE_CODES = new Set([
  'EACCES',
  'EPERM',
  'ELOOP',
  'EROFS',
  'EIO',
  'EBUSY',
  'ENODEV',
  'ENXIO',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ECONNRESET',
  'ECONNABORTED',
  'ECONNREFUSED',
  'ENOTCONN',
  'EHOSTDOWN',
  'ENETDOWN',
  'ENONET',
  'EREMOTEIO',
  'UNKNOWN',
]);

// What a failed file system call means for a caller. "missing": the path, or a
// folder on the way to it, does not exist. "unavailable": one of the problems
// listed above. Any other error is a fault the program does not expect here
// and is thrown again.
export function fileProblem(error: unknown): { problem: 'missing' | 'unavailable'; code: string } {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (typeof code === 'string' && MISSING_CODES.has(code)) {
    return { problem: 'missing', code };
  }
  if (typeof code === 'string' && UNAVAILABLE_CODES.has(code)) {
    return { problem: 'unavailable', code };
  }
  throw error;
}

// The code of a file system error, or undefined for any other error.
export function errorCode(error: unknown): string | undefined {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return typeof code === 'string' ? code : undefined;
}
