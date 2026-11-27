// One file's line in a version 1 archive manifest.
import { hasCaptureSource, SOURCE_FIELDS } from './captured-record.ts';
import type { CaptureSource } from './captured-record.ts';
import { hasFields, isRecord, isText, isUtcTime } from './record-fields.ts';

type EntryFields = {
  line: 'entry';
  record_id: string;
  record_version: 1;
  path: string;
  size_bytes: number;
  sha256: string;
  archived_at: string;
};

export type OriginalEntry = EntryFields & { kind: 'original' } & CaptureSource;
export type ManifestEntry = OriginalEntry | (EntryFields & { kind: 'decision' | 'receipt' });

const COMMON_FIELDS = ['line', 'kind', 'record_id', 'record_version', 'path', 'size_bytes', 'sha256', 'archived_at'] as const;

export function formatManifestEntry(entry: ManifestEntry): string {
  return `${JSON.stringify(entry)}\n`;
}

export function readManifestEntry(line: string): { outcome: 'entry'; entry: ManifestEntry } | { outcome: 'invalid-entry' } {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return { outcome: 'invalid-entry' };
  }
  if (!isRecord(value) || !hasFields(value, value.kind === 'original' ? [...COMMON_FIELDS, ...SOURCE_FIELDS] : COMMON_FIELDS)) {
    return { outcome: 'invalid-entry' };
  }
  const { kind, record_id, path, size_bytes, sha256, archived_at } = value;
  if (
    value.line !== 'entry' || value.record_version !== 1 || !isText(record_id) ||
    !isText(path) || /[\\:\0]/.test(path) || path.split('/').some((part) => part === '' || part === '.' || part === '..') ||
    typeof size_bytes !== 'number' || !Number.isSafeInteger(size_bytes) || size_bytes < 0 ||
    typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256) || !isUtcTime(archived_at)
  ) {
    return { outcome: 'invalid-entry' };
  }
  const common: EntryFields = { line: 'entry', record_id, record_version: 1, path, size_bytes, sha256, archived_at };
  if (kind === 'original' && hasCaptureSource(value)) {
    const { source_id, source_kind, media_type, captured_at } = value;
    return { outcome: 'entry', entry: { ...common, kind, source_id, source_kind, media_type, captured_at } };
  }
  if (kind === 'decision' || kind === 'receipt') {
    return { outcome: 'entry', entry: { ...common, kind } };
  }
  return { outcome: 'invalid-entry' };
}
