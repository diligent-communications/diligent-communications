---
build_step: 1
consumes: ["../connections/CONTEXT.md","../../contracts/CONTEXT.md#captured-record","../../contracts/CONTEXT.md#archive-manifest","../../contracts/CONTEXT.md#saved-decision","../../contracts/CONTEXT.md#action-receipt","../../contracts/CONTEXT.md#command-list"]
produces: ["Readable originals","Readable saved decisions and receipts","Versioned manifest","Backups and restored records","Evidence folder access","Backup list for commands","Restored decisions and receipts for commands"]
---
# archive — Keep originals and lasting records

## Inputs

- Working: None in this planning repository.
- Reference: [Captured record](../../contracts/CONTEXT.md#captured-record)
- Reference: [Archive manifest](../../contracts/CONTEXT.md#archive-manifest)
- Reference: [Saved decision](../../contracts/CONTEXT.md#saved-decision)
- Reference: [Action receipt](../../contracts/CONTEXT.md#action-receipt)
- Reference: [Command list](../../contracts/CONTEXT.md#command-list)

## Process

1. Accept only the captured record shape from capture. Save the original payload byte for byte and refuse a source ID already in the manifest.
2. Keep the evidence folder in this layout: a read-me file, the manifest, and the folders `originals/`, `decisions/` and `receipts/`. Do not encrypt it in step 1, so its files open without the program. Anyone who can open the evidence folder or a backup can read what is in it.
3. Accept the evidence folder and the separate backup folder locations from commands. Keep both as local settings outside the evidence folder and out of the archive and backups. Use the evidence folder setting to resolve the folder for commands and queries. If a saved folder is missing, report it. Never replace it with a new empty archive.
4. Accept saved decisions and receipts from state as readable archive records. Step 1 has no live producer of them: state starts producing them in step 2. In step 1, prove that archive accepts them with made-up records.
5. In step 1, handle setup's backup and restore requests through commands. Make every backup a complete, separate copy of the evidence folder in the second folder the person picks. Never delete a backup.
6. For restore, give commands the backup list: the backups found in the backup folder, with each unfinished or unreadable one marked and not available to pick. Restore the one the person picks into the evidence folder location only if it is empty, or on a retry, if it already matches that backup exactly. Restore never overwrites or deletes an archive. Give the restored decisions and receipts to the restore command for delivery to state.

## Outputs

- Readable originals
- Readable saved decisions and receipts
- Versioned manifest
- Backups and restored records
- Evidence folder access
- Backup list for commands
- Restored decisions and receipts for commands

## Check

A contributor backs up a synthetic archive with originals, decisions, and receipts, empties the disposable test copy, restores it, and verifies every file and ID against the baseline.
The contributor also verifies that backups appear in the selected backup folder, that restore lists and uses the selected backup, and that archive still resolves both local settings after restart without including either location in the backup.
The contributor also verifies that restore refuses a destination that is neither empty nor a matching retry, that a missing folder is reported and not replaced, and that no backup is deleted.

## Lanes

### Storage · Step 4 (draft)

#### Inputs

- Working: None in this planning repository.
- Reference: [connections](../connections/CONTEXT.md)

#### Process

1. Use Google Drive as a second place to keep the evidence folder.

#### Outputs

- Drive backup and restored archive

#### Check

A contributor restores the same backup from Drive and from local storage and compares every file and ID.
