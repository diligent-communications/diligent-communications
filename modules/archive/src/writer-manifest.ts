import { constants, type BigIntStats } from 'node:fs';
import { lstat, open, type FileHandle } from 'node:fs/promises';
import { readManifestEntry, type OriginalEntry } from '../../../contracts/manifest-entry.ts';
import { readManifestHeader } from '../../../contracts/manifest-header.ts';
import { originalLocation, sha256 } from './original-files.ts';

export type Checkpoint = {
  size: number;
  completeSize: number;
  lastLine: Buffer;
  suffix: Buffer;
  file: BigIntStats;
};

type LoadedManifest =
  | { outcome: 'loaded'; checkpoint: Checkpoint; held: Map<string, OriginalEntry>; usedOriginalStems: Set<string> }
  | { outcome: 'bad-manifest'; line: number }
  | { outcome: 'different-archive'; found: string };

export async function openManifest(file: string, mode: 'read' | 'truncate' | 'append'): Promise<FileHandle> {
  const before = await lstat(file, { bigint: true });
  if (!before.isFile()) {
    throw Object.assign(new Error('The manifest is not a regular file'), { code: 'NOT_REGULAR_FILE' });
  }
  // Append to an existing file only. The usual a+ mode can create a file.
  const flags = { read: constants.O_RDONLY, truncate: constants.O_RDWR, append: constants.O_RDWR | constants.O_APPEND };
  const handle = await open(file, flags[mode]);
  try {
    if (!sameFile(before, await handle.stat({ bigint: true }))) {
      throw Object.assign(new Error('The manifest was replaced while opening it'), { code: 'MANIFEST_REPLACED' });
    }
    return handle;
  } catch (error) {
    await handle.close();
    throw error;
  }
}

export async function loadManifest(file: string, archiveId: string): Promise<LoadedManifest> {
  const handle = await openManifest(file, 'read');
  try {
    const info = await handle.stat({ bigint: true });
    const bytes = await handle.readFile();
    const current = await handle.stat({ bigint: true });
    if (current.size !== BigInt(bytes.length) || info.mtimeNs !== current.mtimeNs || info.ctimeNs !== current.ctimeNs) {
      throw Object.assign(new Error('The manifest changed while reading it'), { code: 'MANIFEST_REPLACED' });
    }
    return parseManifest(bytes, archiveId, info);
  } finally {
    await handle.close();
  }
}

function parseManifest(bytes: Buffer, archiveId: string, file: BigIntStats): LoadedManifest {
  const held = new Map<string, OriginalEntry>();
  const usedPaths = new Set<string>();
  const usedOriginalStems = new Set<string>();
  const recordIds = new Set<string>();
  const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  let line = 0;
  let offset = 0;
  let lastStart = 0;
  for (let end = bytes.indexOf(10); end !== -1; end = bytes.indexOf(10, offset)) {
    line += 1;
    let text: string;
    try {
      text = utf8.decode(bytes.subarray(offset, end));
    } catch {
      return { outcome: 'bad-manifest', line };
    }
    lastStart = offset;
    offset = end + 1;
    if (line === 1) {
      const header = readManifestHeader(text.replace(/^\uFEFF/, ''));
      if (header.outcome !== 'header') return { outcome: 'bad-manifest', line };
      if (header.header.archive_id !== archiveId) return { outcome: 'different-archive', found: header.header.archive_id };
      continue;
    }
    const parsed = readManifestEntry(text);
    if (parsed.outcome !== 'entry') return { outcome: 'bad-manifest', line };
    const entry = parsed.entry;
    const key = `${entry.kind}:${entry.record_id}`;
    if (recordIds.has(key) || usedPaths.has(entry.path)) return { outcome: 'bad-manifest', line };
    recordIds.add(key);
    usedPaths.add(entry.path);
    const stem = /^originals\/([a-f0-9]{2}\/[a-f0-9]{64})(?:\.|$)/i.exec(entry.path)?.[1];
    if (stem) usedOriginalStems.add(stem.toLowerCase());
    if (entry.kind !== 'original') continue;
    if (held.has(entry.source_id) || entry.record_id !== sha256(entry.source_id) ||
        entry.path !== originalLocation(entry.record_id, entry.media_type).relative) {
      return { outcome: 'bad-manifest', line };
    }
    held.set(entry.source_id, entry);
  }
  if (line === 0) return { outcome: 'bad-manifest', line: 1 };
  return { outcome: 'loaded', held, usedOriginalStems, checkpoint: {
    size: bytes.length, completeSize: offset, lastLine: Buffer.from(bytes.subarray(lastStart, offset)),
    suffix: Buffer.from(bytes.subarray(lastStart)), file,
  } };
}

export async function manifestMatches(file: string, handle: FileHandle, expected: Checkpoint): Promise<boolean> {
  const info = await handle.stat({ bigint: true });
  if (!sameFile(info, expected.file) || info.size !== BigInt(expected.size)) return false;
  const actual = Buffer.alloc(expected.suffix.length);
  let offset = 0;
  while (offset < actual.length) {
    const { bytesRead } = await handle.read(actual, offset, actual.length - offset, expected.size - actual.length + offset);
    if (bytesRead === 0) return false;
    offset += bytesRead;
  }
  if (!actual.equals(expected.suffix)) return false;
  const current = await lstat(file, { bigint: true });
  return sameFile(current, info) && current.size === info.size &&
    current.mtimeNs === info.mtimeNs && current.ctimeNs === info.ctimeNs;
}

function sameFile(a: BigIntStats, b: BigIntStats): boolean {
  return a.isFile() && b.isFile() && a.dev === b.dev && a.ino === b.ino;
}
