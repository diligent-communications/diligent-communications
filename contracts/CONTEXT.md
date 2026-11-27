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

## First shapes

### Captured record

The record capture hands to archive carries a shape version, a stable source ID, and the original payload. The archive uses the ID to detect repeat imports and keeps the payload unchanged.

### Archive manifest

A versioned index of archived originals, saved decisions, and action receipts. It identifies each file and its record ID and refuses a source ID already used by a captured record.

### Saved decision

A readable record of a person's choice, such as a review, contact merge or reversal, or approval. It identifies the choice and the item or action it applies to so state can rebuild it after restore.

### Action receipt

A readable record that identifies an approved action, its outcome, and any confirmation needed to recognize it after restore or retry.

### Attachment export

The published package layout and file information that let another app take an export.

### Command list

The shared list of writes with their inputs, previews, and receipts.

### Query list

The shared list of reads with their inputs and result shapes.

### Connection status

The information surfaces need to tell a person whether an account is connected. Sign-in details stay with connections.
