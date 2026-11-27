---
build_step: 1
consumes: ["../connections/CONTEXT.md","../../contracts/CONTEXT.md#captured-record","../../contracts/CONTEXT.md#archive-manifest","../../contracts/CONTEXT.md#saved-decision","../../contracts/CONTEXT.md#action-receipt"]
produces: ["Readable originals","Readable saved decisions and receipts","Versioned manifest","Backups and restored records"]
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
2. Accept saved decisions and receipts from state as readable archive records. Back up and restore originals, decisions, receipts, and the manifest together so state can be rebuilt.

## Outputs

- Readable originals
- Readable saved decisions and receipts
- Versioned manifest
- Backups and restored records

## Check

A contributor backs up a synthetic archive with originals, decisions, and receipts, empties the disposable test copy, restores it, and verifies every file and ID against the baseline.

## Lanes

### Storage · Step 4 (proposed)

#### Inputs

- Working: None in this planning repository.
- Reference: [connections](../connections/CONTEXT.md)

#### Process

1. Use Google Drive as a second place to keep the evidence folder.

#### Outputs

- Drive backup and restored archive

#### Check

A contributor restores the same backup from Drive and from local storage and compares every file and ID.
