# Archive manifest

Follow the [version rule](CONTEXT.md#version-rule).

The index of everything in the evidence folder: originals, saved decisions and action receipts. It is a text file with one JSON record per line, added to only at the end.

Version 1. The first line is a header: `line: "header"`, `manifest_version: 1`, `archive_id` (random, and kept through restore) and `created_at`. Each later line:

| Field | Meaning |
| --- | --- |
| `line` | `"entry"` |
| `kind` | `original`, `decision` or `receipt` |
| `record_id` | Permanent ID, unique within its kind. For an original, derived from the source ID |
| `record_version` | Version of the record |
| `path` | Location inside the evidence folder, with `/` separators |
| `size_bytes`, `sha256` | For checking the file |
| `archived_at` | When saved |
| `source_id`, `source_kind`, `media_type`, `captured_at` | Originals only |

The archive refuses a source ID the manifest already holds.

The code forms and readers are in [manifest-header.ts](manifest-header.ts) and [manifest-entry.ts](manifest-entry.ts).
