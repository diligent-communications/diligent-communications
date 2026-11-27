// The record shared by capture and archive, version 1.
import { hasFields, isRecord, isText, isUtcTime } from './record-fields.ts';

export type SourceKind = 'mail' | 'text' | 'call' | 'import';

export type CaptureSource = {
  source_id: string;
  source_kind: SourceKind;
  media_type: string;
  captured_at: string;
};

export type CapturedRecord = CaptureSource & {
  record_version: 1;
  payload: Uint8Array;
};

export const SOURCE_FIELDS = ['source_id', 'source_kind', 'media_type', 'captured_at'] as const;

export function hasCaptureSource(record: Record<string, unknown>): record is Record<string, unknown> & CaptureSource {
  const { source_id, source_kind, media_type, captured_at } = record;
  return isText(source_id) &&
    source_id.length <= 4096 && [...source_id].length <= 2048 &&
    (source_kind === 'mail' || source_kind === 'text' || source_kind === 'call' || source_kind === 'import') &&
    isText(media_type) && isUtcTime(captured_at);
}

export type CapturedRecordResult =
  | { outcome: 'record'; record: CapturedRecord }
  | { outcome: 'unknown-record-version'; version: number }
  | { outcome: 'invalid-record' };

export function readCapturedRecord(value: unknown): CapturedRecordResult {
  if (!isRecord(value)) {
    return { outcome: 'invalid-record' };
  }
  const version: unknown = Object.getOwnPropertyDescriptor(value, 'record_version')?.value;
  if (typeof version === 'number' && Number.isSafeInteger(version) && version > 1) {
    return { outcome: 'unknown-record-version', version };
  }
  if (version !== 1 || !hasFields(value, ['record_version', 'payload', ...SOURCE_FIELDS]) ||
      !(value.payload instanceof Uint8Array) || !hasCaptureSource(value)) {
    return { outcome: 'invalid-record' };
  }
  const { payload, source_id, source_kind, media_type, captured_at } = value;
  return { outcome: 'record', record: { record_version: 1, payload, source_id, source_kind, media_type, captured_at } };
}
