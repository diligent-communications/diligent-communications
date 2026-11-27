import { createHash, randomUUID } from 'node:crypto';
import { link, lstat, mkdir, open, readFile, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { errorCode, failedStep, syncFolder, writeNewFile } from './files.ts';

export function sha256(bytes: string | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

const EXTENSIONS = new Map([
  ['message/rfc822', '.eml'],
  ['text/plain', '.txt'],
  ['application/json', '.json'],
]);

export function originalLocation(recordId: string, mediaType: string) {
  const stem = sha256(recordId);
  const shard = stem.slice(0, 2);
  const name = stem + (EXTENSIONS.get(mediaType) ?? '.bin');
  return { stem, shard, name, relative: `originals/${shard}/${name}` };
}

export async function originalBytes(folder: string, relative: string): Promise<Buffer> {
  const [root, shard, name] = relative.split('/');
  const originals = path.join(folder, root);
  const directory = path.join(originals, shard);
  await requireDirectory(originals);
  await requireDirectory(directory);
  return readPlainFile(path.join(directory, name));
}

export async function putOriginal(
  folder: string,
  location: ReturnType<typeof originalLocation>,
  payload: Buffer,
): Promise<void> {
  const originals = path.join(folder, 'originals');
  await requireDirectory(originals);
  const directory = path.join(originals, location.shard);
  await makeDirectory(directory);
  // The shard's own name must also have been flushed before indexing a file.
  await syncFolder(originals);

  let adopted = false;
  for (const name of await readdir(directory)) {
    if (name !== location.stem && !name.startsWith(location.stem + '.')) continue;
    const candidate = path.join(directory, name);
    const info = await lstat(candidate);
    if (!info.isFile()) {
      throw Object.assign(new Error('An original path is not a regular file'), { code: 'NOT_REGULAR_FILE' });
    }
    if (name === location.name && info.size === payload.length && (await readFile(candidate)).equals(payload)) {
      const handle = await open(candidate, 'r+');
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
      adopted = true;
    } else {
      await moveLeftover(folder, candidate, name);
    }
  }

  if (adopted) {
    await syncFolder(directory);
    return;
  }

  const temporary = path.join(directory, `.original-${randomUUID()}.tmp`);
  let madeTemporary = false;
  try {
    try {
      await writeNewFile(temporary, payload);
      madeTemporary = true;
    } catch (error) {
      madeTemporary = failedStep(error) !== undefined;
      throw error;
    }
    // A hard link publishes the fully written file and fails if the name
    // already exists. A crash before unlinking leaves an extra temporary name.
    await link(temporary, path.join(directory, location.name));
  } finally {
    if (madeTemporary) await unlink(temporary);
  }
  await syncFolder(directory);
}

async function moveLeftover(folder: string, candidate: string, name: string): Promise<void> {
  const kept = path.join(folder, 'leftovers');
  await makeDirectory(kept);
  await syncFolder(folder);
  let target = path.join(kept, name);
  for (;;) {
    try {
      await link(candidate, target);
      break;
    } catch (error) {
      if (errorCode(error) !== 'EEXIST') throw error;
      const ending = /\.(eml|txt|json|bin)$/.exec(name)?.[0] ?? '';
      target = path.join(kept, `original-${randomUUID()}${ending}`);
    }
  }
  // Keep the other name in place before removing this one.
  await syncFolder(kept);
  await unlink(candidate);
  await syncFolder(path.dirname(candidate));
}

async function readPlainFile(file: string): Promise<Buffer> {
  if (!(await lstat(file)).isFile()) {
    throw Object.assign(new Error('An original path is not a regular file'), { code: 'NOT_REGULAR_FILE' });
  }
  return readFile(file);
}

async function makeDirectory(folder: string): Promise<void> {
  try {
    await mkdir(folder);
  } catch (error) {
    if (errorCode(error) !== 'EEXIST') throw error;
    await requireDirectory(folder);
  }
}

async function requireDirectory(folder: string): Promise<void> {
  if (!(await lstat(folder)).isDirectory()) {
    throw Object.assign(new Error('An archive path is not a directory'), { code: 'NOT_DIRECTORY' });
  }
}
