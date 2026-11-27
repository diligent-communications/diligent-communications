---
consumes: ["../../contracts/CONTEXT.md"]
produces: ["Readable originals","Versioned manifest","Backup and restore result"]
---
# archive

Keep original evidence recoverable.

## Inputs

- Working: None in this planning repository.
- Reference: `../../contracts/CONTEXT.md`.

## Process

1. Store originals as readable files in the user’s evidence folder and index them with a versioned manifest.
2. Back up the originals and manifest together and restore them by their recorded IDs.

## Outputs

- Readable originals.
- Versioned manifest.
- Backup and restore result.

## Check

A contributor backs up a synthetic archive, empties the disposable test archive, restores it, and compares every file and ID with the baseline.
