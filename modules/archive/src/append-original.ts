import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { readCapturedRecord, type CapturedRecord } from '../../../contracts/captured-record.ts';
import { formatManifestEntry, type OriginalEntry } from '../../../contracts/manifest-entry.ts';
import { MANIFEST_FILE, type ArchiveInfo } from './evidence-folder.ts';
import { systemFailure } from './files.ts';
import { evidenceMessages, originalMessages as say } from './messages.ts';
import { originalBytes, originalLocation, putOriginal, sha256 } from './original-files.ts';
import { takeWriterLock } from './writer-lock.ts';
import { containsAppendedLine, loadManifest, manifestMatches, openManifest, type BadManifest, type Checkpoint } from './writer-manifest.ts';

export type OriginalWriter = {
  saveOriginal(record: unknown): Promise<SaveOriginalResult>;
  close(): Promise<void>;
};

type OriginalRefusal<Outcome extends string> = { outcome: Outcome; message: string };

export type OpenWriterResult =
  | { outcome: 'writer-opened'; writer: OriginalWriter }
  | (BadManifest & { message: string })
  | OriginalRefusal<'archive-in-use' | 'lock-unavailable' | 'manifest-unavailable' | 'different-archive' | 'evidence-missing'>;

export type SaveOriginalResult =
  | { outcome: 'saved-original'; recordId: string; message: string; notice?: string }
  | { outcome: 'already-held'; recordId: string; bytesDiffer: boolean | null; message: string }
  | (OriginalRefusal<'unknown-record-version'> & { version: number })
  | (OriginalRefusal<'writer-stopped'> & { step: string })
  | OriginalRefusal<'invalid-record' | 'manifest-changed' | 'evidence-missing' | 'writer-closed' | 'file-name-in-use' | 'save-unavailable'>;

// Opens a previously initialized archive for writes, without creating it or
// changing settings. The lock is acquired before reading the original index.
export async function openArchiveWriter(archive: ArchiveInfo): Promise<OpenWriterResult> {
  const lock = await takeWriterLock(archive.archiveId);
  if (lock.outcome === 'archive-in-use') return { outcome: lock.outcome, message: say.inUse(archive.archiveId) };
  if (lock.outcome === 'lock-unavailable') return { outcome: lock.outcome, message: say.lockUnavailable(archive.archiveId, lock.detail) };

  let keepLock = false;
  let folder: string | undefined;
  let manifest = path.join(archive.folder, MANIFEST_FILE);
  try {
    folder = await realpath(archive.folder);
    manifest = path.join(folder, MANIFEST_FILE);
    const loaded = await loadManifest(manifest, archive.archiveId);
    if (loaded.outcome === 'bad-manifest') return { ...loaded, message: say.badManifest(manifest, loaded) };
    if (loaded.outcome === 'different-archive') {
      return { outcome: loaded.outcome, message: say.differentArchive(manifest, loaded.found, archive.archiveId) };
    }
    const writer = makeWriter(folder, manifest, loaded.checkpoint, loaded.held, loaded.usedOriginalStems, lock.close);
    keepLock = true;
    return { outcome: 'writer-opened', writer };
  } catch (error) {
    const code = systemFailure(error);
    if (folder === undefined && (code === 'ENOENT' || code === 'ENOTDIR')) {
      return { outcome: 'evidence-missing', message: evidenceMessages.evidenceMissing(archive.folder) };
    }
    return { outcome: 'manifest-unavailable', message: say.manifestUnavailable(manifest, code) };
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
  let stop: Extract<SaveOriginalResult, { outcome: 'writer-stopped' }> | undefined;

  return {
    async saveOriginal(value) {
      if (closing) return { outcome: 'writer-closed', message: say.closed(folder) };
      if (stop) return stop;
      const checked = readCapturedRecord(value);
      // The caller can reuse its buffer as soon as it hands the record over.
      const prepared = checked.outcome === 'record' ? { ...checked, payload: Buffer.from(checked.record.payload) } : checked;
      const pending = queue.then((): SaveOriginalResult | Promise<SaveOriginalResult> => {
        if (stop) return stop;
        if (prepared.outcome === 'invalid-record') return { ...prepared, message: say.invalidRecord(manifest) };
        if (prepared.outcome === 'unknown-record-version') return { ...prepared, message: say.unknownRecordVersion(manifest, prepared.version) };
        return save(prepared.record, prepared.payload);
      });
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
    const id = sha256(record.source_id);
    try {
      const check = await openManifest(manifest, 'read');
      try {
        if (!(await manifestMatches(manifest, check, checkpoint))) return await changed(step);
      } finally {
        await check.close();
      }
      const existing = held.get(record.source_id);
      if (existing) return repeat(folder, existing, payload);

      const location = originalLocation(id, record.media_type);
      if (usedOriginalStems.has(`${location.shard}/${location.stem}`)) {
        return { outcome: 'file-name-in-use', message: say.stemInUse(id) };
      }
      if (checkpoint.completeSize !== checkpoint.size) {
        step = 'removing the unfinished manifest tail';
        const tail = await openManifest(manifest, 'truncate');
        try {
          if (!(await manifestMatches(manifest, tail, checkpoint))) return await changed(step);
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
        if (!(await manifestMatches(manifest, append, checkpoint))) return await changed(step);
        step = 'appending the manifest entry';
        appendStarted = true;
        await append.writeFile(line);
        step = 'flushing the manifest';
        await append.sync();
        step = 'checking the appended entry';
        if (!(await manifestMatches(manifest, append, added))) return await changedAfterAppend(entry, added, step);
      } finally {
        try {
          await append.close();
        } catch (error) {
          step = 'closing the manifest';
          throw error;
        }
      }
      return saved(entry, added);
    } catch (error) {
      const onManifest = step !== 'placing the original file';
      if (onManifest) stopAt(step);
      const code = systemFailure(error);
      if (appendStarted && entry && added) {
        const status = await readBack(added);
        if (status === 'unchanged') return saved(entry, added, say.appendFailure(id, step, code));
        if (status === 'entry-present') return saved(entry, added, say.heldAfterChange(id, manifest, { step, code }));
      }
      if (onManifest && (code === 'MANIFEST_REPLACED' || code === 'ENOENT' || code === 'ENOTDIR' || code === 'NOT_REGULAR_FILE')) {
        return changed(step);
      }
      return { outcome: 'save-unavailable', message: say.saveFailed(id, step, code) };
    }
  }

  function stopAt(step: string) {
    stop = { outcome: 'writer-stopped', step, message: say.stopped(manifest, step) };
  }

  async function changed(step: string): Promise<SaveOriginalResult> {
    stopAt(step);
    try {
      await lstat(folder);
    } catch (error) {
      const code = systemFailure(error);
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        return { outcome: 'evidence-missing', message: evidenceMessages.evidenceMissing(folder) };
      }
    }
    return { outcome: 'manifest-changed', message: say.manifestChanged(manifest) };
  }

  async function changedAfterAppend(entry: OriginalEntry, added: Checkpoint, step: string): Promise<SaveOriginalResult> {
    stopAt(step);
    if (await readBack(added) === 'unconfirmed') return changed(step);
    return saved(entry, added, say.heldAfterChange(entry.record_id, manifest));
  }

  function saved(entry: OriginalEntry, next: Checkpoint, notice?: string): SaveOriginalResult {
    checkpoint = next;
    held.set(entry.source_id, entry);
    const { shard, stem } = originalLocation(entry.record_id, entry.media_type);
    usedOriginalStems.add(`${shard}/${stem}`);
    return { outcome: 'saved-original', recordId: entry.record_id, message: say.saved(entry.record_id), ...(notice ? { notice } : {}) };
  }

  async function readBack(expected: Checkpoint): Promise<'unchanged' | 'entry-present' | 'unconfirmed'> {
    try {
      const handle = await openManifest(manifest, 'read');
      try {
        if (await manifestMatches(manifest, handle, expected)) return 'unchanged';
        const begin = expected.size - expected.lastLine.length;
        return (await containsAppendedLine(manifest, handle, begin, expected.lastLine)) ? 'entry-present' : 'unconfirmed';
      } finally {
        await handle.close();
      }
    } catch (error) {
      systemFailure(error);
      return 'unconfirmed';
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
      message: say.comparisonUnavailable(recordId, path.join(folder, entry.path), systemFailure(error)),
    };
  }
}
