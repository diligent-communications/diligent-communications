---
build_step: 1
consumes: ["../connections/CONTEXT.md","../../contracts/CONTEXT.md#captured-record","../../contracts/CONTEXT.md#archive-manifest","../../contracts/CONTEXT.md#saved-decision","../../contracts/CONTEXT.md#action-receipt"]
produces: ["Readable originals","Readable saved decisions and receipts","Versioned manifest","Backups and restored records","Evidence folder access","Restored decisions and receipts for commands"]
---
# archive — Keep originals and lasting records

## Inputs

- Working: None in this planning repository.
- Reference: [connections for the storage lane](../connections/CONTEXT.md)
- Reference: [Captured record](../../contracts/CONTEXT.md#captured-record)
- Reference: [Archive manifest](../../contracts/CONTEXT.md#archive-manifest)
- Reference: [Saved decision](../../contracts/CONTEXT.md#saved-decision)
- Reference: [Action receipt](../../contracts/CONTEXT.md#action-receipt)

## Process

1. Accept only the captured record shape from capture. Preserve the original payload as received and refuse a source ID already in the manifest.
2. Accept the evidence folder and the separate backup folder locations from commands. Keep both as local settings outside the evidence folder and out of the archive and backups. Use the evidence folder setting to resolve the folder for commands and queries.
3. Accept saved decisions and receipts from state as readable archive records. In step 1, handle setup's backup and restore requests through commands. Back up originals, decisions, receipts, and the manifest together to the second folder the person picks. For restore, list the backups in that folder and restore the one the person picks. Give the restored decisions and receipts to the restore command for delivery to state.

## Outputs

- Readable originals
- Readable saved decisions and receipts
- Versioned manifest
- Backups and restored records
- Evidence folder access
- Restored decisions and receipts for commands

## Check

A contributor backs up a synthetic archive with originals, decisions, and receipts, empties the disposable test copy, restores it, and verifies every file and ID against the baseline.
The contributor also verifies that backups appear in the selected backup folder, that restore lists and uses the selected backup, and that archive still resolves both local settings after restart without including either location in the backup.

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
