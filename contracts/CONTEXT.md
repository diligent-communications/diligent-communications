---
consumes: []
produces: ["Versioned handoff specifications"]
---
# contracts — Define shared handoff shapes

## Inputs

- Working: None at this stage.
- Reference: None.

## Process

1. Publish each shared shape here with a version. Update it before changing any module interface that uses it.

## Outputs

- Versioned handoff specifications

## Check

A contributor verifies that both sides of each handoff use the same fields and version.

## Version rule

Each shape that has a version number has its own whole number, starting at 1. Any change to its fields raises it. A reader accepts the versions it knows and refuses a newer one with a clear message, without rewriting it. All times are UTC.

## First shapes

### Captured record

The record capture hands to archive. The archive uses the source ID to refuse repeat imports and saves the payload byte for byte.

Version 1:

| Field | Meaning |
| --- | --- |
| `record_version` | 1 |
| `source_id` | 1 to 2,048 characters of valid text |
| `payload` | The exact original bytes |
| `source_kind` | `mail`, `text`, `call` or `import` |
| `media_type` | File type, such as `message/rfc822` for email |
| `captured_at` | When capture received it |

A source ID is exact text: capitals, spaces and every other character count, and nothing is trimmed or folded. It is unique across the whole archive, not only within one kind of capture.

### Archive manifest

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

### Saved decision

A readable record of a person's choice, such as a review, contact merge or reversal, or approval. It identifies the choice and the item or action it applies to so state can rebuild it after restore.

Version 1 (minimum): `decision_version`, `decision_id`, `kind` (for example `approval` or `review`), `applies_to` (type and ID), `decided_at`, and optional `details`.

### Action receipt

A readable record that identifies an approved action, its outcome, and any confirmation needed to recognize it after restore or retry. The archive saves an action receipt only for an approved action. It is not the command receipt a write returns.

Version 1 (minimum): `receipt_version`, `receipt_id`, `action_id`, `approval_id` (the approval's `decision_id`), `outcome` (`succeeded`, `failed` or `unknown`), `confirmation`, and `recorded_at`.

### Attachment export

The published package layout and file information that let another app take an export.

### Command list

The shared list of writes with their inputs, previews, and receipts. Version 1. Adding or changing a command raises the version.

Each write shows a preview before it runs and returns a command receipt afterward: a result shown to the person, saying what was done or why it was refused. A command receipt is not an action receipt and is not saved in the archive. Confirm is a part of restore only.

Version 1 covers only the folder, backup and restore commands:

| Command | Preview shows | Command receipt returns |
| --- | --- | --- |
| Set folder locations | The evidence folder and backup folder chosen, whether the evidence folder is empty or already an archive, and any warning | The two locations saved, or the reason they were refused |
| Back up | The backup folder, the number of originals, decisions and receipts, the total size, and the free space | The new backup with its time, counts and size, or the reason it failed |
| Restore | The backup list, then the picked backup's time, counts, size and archive ID, and the destination evidence folder | The backup restored, its counts, and whether state accepted the restored decisions and receipts, or the reason it failed |

Restore runs in five parts: list, pick, preview that backup, confirm, receipt.

1. **List.** Commands returns the backup list from archive. It names each backup found in the backup folder with its time, counts, size and archive ID. A backup that is unfinished or cannot be read is listed with the reason and cannot be picked.
2. **Pick.** The person picks one backup from the list.
3. **Preview.** Archive checks the picked backup and returns its restore preview, which commands shows. The destination is the evidence folder location. It must be empty, or hold an unfinished restore of this same backup that matches it exactly. Otherwise setup asks for a new empty folder and sets it through Set folder locations first.
4. **Confirm.** The person confirms, and archive restores the backup.
5. **Receipt.** The restore is complete only after state accepts the restored decisions and receipts. Until then, capture and other archive writes are blocked. The block does not cover retrying that restore or setting the folder locations, so a person can always pick a new empty folder.

The backup list is the first part of the restore preview. It is the one stated exception to the rule that surfaces read through queries. Step 1 has no query for backups.

### Query list

The shared list of reads with their inputs and result shapes.

### Connection status

The information surfaces need to tell a person whether an account is connected. Sign-in details stay with connections.

## Open

- Assign versions to the attachment export, query list and connection status before their first publication.
- Add the other step 1 writes (connect the mailbox, start a capture) to the command list, and settle the inputs each command takes. The mail capture and sign-in plans settle these before their code.
- Decide whether a saved decision or action receipt keeps the approved content, such as reply text or event details.
