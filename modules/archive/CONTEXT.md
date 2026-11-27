---
build_step: 1
consumes: ["../../contracts/CONTEXT.md"]
produces: ["Readable originals","Versioned manifest","Backup and restore results"]
---
# archive

Keep original evidence recoverable.

## Inputs

- Working: None in this planning repository.
- Reference: `../../contracts/CONTEXT.md`.

## Process

1. Store originals as readable files and leave them as received. Back up the files and their versioned manifest together, then restore them with their recorded IDs.

## Outputs

- Readable originals.
- Versioned manifest.
- Backup and restore results.

## Check

A contributor backs up a synthetic archive, empties the disposable test copy, restores it, and compares every file and ID with the baseline.

## Lanes

### Storage · Step 4 (proposed)

#### Inputs

- Working: None in this planning repository.
- Reference: `../connections/CONTEXT.md`.

Use Google Drive as a second place to keep the evidence folder. Restoring from Drive yields the same files and IDs as restoring from the local copy.
