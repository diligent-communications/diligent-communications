import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { readCapturedRecord, type CapturedRecord } from '../../../contracts/captured-record.ts';
import { formatManifestEntry, type OriginalEntry } from '../../../contracts/manifest-entry.ts';
import { MANIFEST_FILE, type ArchiveInfo } from './evidence-folder.ts';
import { errorCode } from './files.ts';
import { evidenceMessages, originalMessages as say } from './messages.ts';
import { originalBytes, originalLocation, putOriginal, sha256 } from './original-files.ts';
import { takeWriterLock } from './writer-lock.ts';
import { loadManifest, manifestMatches, openManifest, type Checkpoint } from './writer-manifest.ts';

export type OriginalWriter = {
  saveOriginal(record: unknown): Promise<SaveOriginalResult>;
  close(): Promise<void>;
};

type OriginalRefusal<Outcome extends string> = { outcome: Outcome; message: string };

export type OpenWriterResult =
  | { outcome: 'writer-opened'; writer: OriginalWriter }
  | (OriginalRefusal<'bad-manifest'> & { line: number })
  | OriginalRefusal<'archive-in-use' | 'lock-unavailable' | 'manifest-unavailable' | 'different-archive'>;

export type SaveOriginalResult =
  | { outcome: 'saved-original'; recordId: string; message: string; notice?: string }
  | { outcome: 'already-held'; recordId: string; bytesDiffer: boolean | null; message: string }
  | (OriginalRefusal<'unknown-record-version'> & { version: number })
  | OriginalRefusal<'invalid-record' | 'manifest-changed' | 'writer-closed' | 'save-unavailable'>;

// Opens a previously initialized archive for writes, without creating it or
// changing settings. The lock is acquired before reading the original index.
export async function openArchiveWriter(archive: ArchiveInfo): Promise<OpenWriterResult> {
  const lock = await takeWriterLock(archive.archiveId);
  if (lock.outcome === 'archive-in-use') return { outcome: lock.outcome, message: say.inUse(archive.folder) };
  if (lock.outcome === 'lock-unavailable') return { outcome: lock.outcome, message: say.lockUnavailable(archive.folder, lock.detail) };

  let keepLock = false;
  let manifest = path.join(archive.folder, MANIFEST_FILE);
  try {
    const folder = await realpath(archive.folder);
    manifest = path.join(folder, MANIFEST_FILE);
    const loaded = await loadManifest(manifest, archive.archiveId);
    if (loaded.outcome === 'bad-manifest') return { ...loaded, message: say.badManifest(manifest, loaded.line) };
    if (loaded.outcome === 'different-archive') {
      return { outcome: loaded.outcome, message: evidenceMessages.differentArchive(folder, loaded.found, archive.archiveId) };
    }
    const writer = makeWriter(folder, manifest, loaded.checkpoint, loaded.held, loaded.usedOriginalStems, lock.close);
    keepLock = true;
    return { outcome: 'writer-opened', writer };
  } catch (error) {
    return { outcome: 'manifest-unavailable', message: say.manifestUnavailable(manifest, detail(error)) };
  } finally {
    if (!keepLock) await lock.close();
  }
}

function makeWriter(
  folder: string,
  manifest: string,
  initial: Checkpoint,
  held: Map<string, OriginalEntry>,
  usedOriginalStems: Set<string>,
  release: () => Promise<void>,
): OriginalWriter {
  let checkpoint = initial;
  let queue: Promise<unknown> = Promise.resolve();
  let closing: Promise<void> | undefined;
  let stop: SaveOriginalResult | undefined;

  return {
    async saveOriginal(value) {
      if (closing) return { outcome: 'writer-closed', message: say.closed(folder) };
      const checked = readCapturedRecord(value);
      if (checked.outcome === 'invalid-record') return { ...checked, message: say.invalidRecord() };
      if (checked.outcome === 'unknown-record-version') return { ...checked, message: say.unknownRecordVersion(checked.version) };
      const { record } = checked;
      // The caller can reuse its buffer as soon as it hands the record over.
      const payload = Buffer.from(record.payload);
      const pending = queue.then(() => stop ?? save(record, payload));
      queue = pending.catch(() => undefined);
      return pending;
    },
    close() {
      closing ??= queue.then(release);
      return closing;
    },
  };

  async function save(record: CapturedRecord, payload: Buffer): Promise<SaveOriginalResult> {
    let step = 'checking the manifest';
    let appendStarted = false;
    let entry: OriginalEntry | undefined;
    let added: Checkpoint | undefined;
    try {
      const check = await openManifest(manifest, 'read');
      try {
        if (!(await manifestMatches(manifest, check, checkpoint))) return changed();
      } finally {
        await check.close();
      }
      const existing = held.get(record.source_id);
      if (existing) return repeat(folder, existing, payload);

      const id = sha256(record.source_id);
      const location = originalLocation(id, record.media_type);
      if (usedOriginalStems.has(`${location.shard}/${location.stem}`)) {
        return { outcome: 'save-unavailable', message: say.saveFailed(folder, step, 'an entry already uses this file name') };
      }
      if (checkpoint.completeSize !== checkpoint.size) {
        step = 'removing the unfinished manifest tail';
        const tail = await openManifest(manifest, 'truncate');
        try {
          if (!(await manifestMatches(manifest, tail, checkpoint))) return changed();
          await tail.truncate(checkpoint.completeSize);
          checkpoint = { ...checkpoint, size: checkpoint.completeSize, suffix: checkpoint.lastLine };
          await tail.sync();
        } finally {
          await tail.close();
        }
      }

      step = 'placing the original file';
      await putOriginal(folder, location, payload);
      entry = {
        line: 'entry', kind: 'original', record_id: id, record_version: 1,
        path: location.relative, size_bytes: payload.length, sha256: sha256(payload), archived_at: new Date().toISOString(),
        source_id: record.source_id, source_kind: record.source_kind, media_type: record.media_type, captured_at: record.captured_at,
      };
      const line = Buffer.from(formatManifestEntry(entry));
      const size = checkpoint.size + line.length;
      added = { size, completeSize: size, lastLine: line, suffix: line, file: checkpoint.file };
      step = 'checking the manifest';
      const append = await openManifest(manifest, 'append');
      try {
        if (!(await manifestMatches(manifest, append, checkpoint))) return changed();
        step = 'appending the manifest entry';
        appendStarted = true;
        await append.writeFile(line);
        step = 'flushing the manifest';
        await append.sync();
        step = 'checking the appended entry';
        if (!(await manifestMatches(manifest, append, added))) return changed();
        step = 'closing the manifest';
      } finally {
        await append.close();
      }
      return saved(entry, added);
    } catch (error) {
      const code = errorCode(error);
      if (code === 'MANIFEST_REPLACED' ||
          (step === 'checking the manifest' && (code === 'ENOENT' || code === 'ENOTDIR' || code === 'NOT_REGULAR_FILE'))) {
        return changed();
      }
      if (appendStarted && entry && added) {
        if (await entryWasWritten(added)) return saved(entry, added, say.appendFailure(manifest, step, detail(error)));
        stop = { outcome: 'save-unavailable', message: say.saveFailed(folder, step, detail(error)) };
        return stop;
      }
      return { outcome: 'save-unavailable', message: say.saveFailed(folder, step, detail(error)) };
    }
  }

  function changed(): SaveOriginalResult {
    stop = { outcome: 'manifest-changed', message: say.manifestChanged(manifest) };
    return stop;
  }

  function saved(entry: OriginalEntry, next: Checkpoint, notice?: string): SaveOriginalResult {
    checkpoint = next;
    held.set(entry.source_id, entry);
    const { shard, stem } = originalLocation(entry.record_id, entry.media_type);
    usedOriginalStems.add(`${shard}/${stem}`);
    return { outcome: 'saved-original', recordId: entry.record_id, message: say.saved(entry.record_id), ...(notice ? { notice } : {}) };
  }

  async function entryWasWritten(expected: Checkpoint): Promise<boolean> {
    try {
      const handle = await openManifest(manifest, 'read');
      try {
        return await manifestMatches(manifest, handle, expected);
      } finally {
        await handle.close();
      }
    } catch {
      return false;
    }
  }
}

async function repeat(folder: string, entry: OriginalEntry, incoming: Buffer): Promise<SaveOriginalResult> {
  const recordId = entry.record_id;
  try {
    const bytesDiffer = !(await originalBytes(folder, entry.path)).equals(incoming);
    return { outcome: 'already-held', recordId, bytesDiffer, message: say.held(recordId, bytesDiffer) };
  } catch (error) {
    return {
      outcome: 'already-held', recordId, bytesDiffer: null,
      message: say.comparisonUnavailable(recordId, path.join(folder, entry.path), detail(error)),
    };
  }
}

function detail(error: unknown): string {
  return errorCode(error) ?? 'the file-system operation failed';
}
