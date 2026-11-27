// The first line of the archive manifest, as described under "Archive manifest"
// in contracts/CONTEXT.md. Version 1.

export const MANIFEST_VERSION = 1;

export type ManifestHeader = {
  line: 'header';
  manifest_version: 1;
  archive_id: string;
  created_at: string;
};

export type ManifestHeaderResult =
  | { outcome: 'header'; header: ManifestHeader }
  | { outcome: 'unknown-version'; version: number; message: string }
  | { outcome: 'not-a-header'; message: string };

export function newManifestHeader(archiveId: string, createdAt: Date): ManifestHeader {
  return {
    line: 'header',
    manifest_version: MANIFEST_VERSION,
    archive_id: archiveId,
    created_at: createdAt.toISOString(),
  };
}

// One JSON record followed by a line end, with the fields in the order the
// contract lists them.
export function formatManifestHeader(header: ManifestHeader): string {
  const ordered: ManifestHeader = {
    line: header.line,
    manifest_version: header.manifest_version,
    archive_id: header.archive_id,
    created_at: header.created_at,
  };
  return `${JSON.stringify(ordered)}\n`;
}

// Reads the text of the first manifest line, without its line end.
export function readManifestHeader(line: string): ManifestHeaderResult {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return notAHeader('The first line of the manifest is not a JSON record.');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return notAHeader('The first line of the manifest is not a JSON record.');
  }
  const record = value as Record<string, unknown>;
  if (record.line !== 'header') {
    return notAHeader('The first line of the manifest is not a header line.');
  }
  const version = record.manifest_version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return notAHeader('The manifest header has no valid manifest version.');
  }
  if (version !== MANIFEST_VERSION) {
    return {
      outcome: 'unknown-version',
      version,
      message: `The manifest is version ${version}. This program reads only version ${MANIFEST_VERSION}, so it leaves the archive as it is.`,
    };
  }
  if (typeof record.archive_id !== 'string' || record.archive_id === '') {
    return notAHeader('The manifest header has no archive ID.');
  }
  if (typeof record.created_at !== 'string' || !isUtcTime(record.created_at)) {
    return notAHeader('The manifest header has no valid UTC creation time.');
  }
  return {
    outcome: 'header',
    header: {
      line: 'header',
      manifest_version: MANIFEST_VERSION,
      archive_id: record.archive_id,
      created_at: record.created_at,
    },
  };
}

function notAHeader(message: string): ManifestHeaderResult {
  return { outcome: 'not-a-header', message };
}

// A time written as UTC, such as 2026-01-02T03:04:05.006Z, naming a real date.
function isUtcTime(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(text)) {
    return false;
  }
  const time = new Date(text);
  return !Number.isNaN(time.getTime()) && time.toISOString().slice(0, 19) === text.slice(0, 19);
}
