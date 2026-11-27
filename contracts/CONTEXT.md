---
consumes: []
produces: ["Versioned handoff specifications"]
---
# contracts — Define shared handoff shapes

## Inputs

- Working: None at this stage.
- Reference: None.

## Process

1. Publish each shared shape with a version. A shape in its own file is listed here and is not copied here. Update a shape before changing any module interface that uses it.

## Outputs

- Versioned handoff specifications

## Check

A contributor verifies that both sides of each handoff use the same fields and version.

## Version rule

Each shape that has a version number has its own whole number, starting at 1. Any change to its fields raises it. A reader accepts the versions it knows and refuses a newer one with a clear message, without rewriting it. All times are UTC.

## Shapes

### Captured record

[captured-record.md](captured-record.md)

### Archive manifest

[archive-manifest.md](archive-manifest.md)

### Saved decision

[saved-decision.md](saved-decision.md)

### Action receipt

[action-receipt.md](action-receipt.md)

### Attachment export

The published package layout and file information that let another app take an export.

### Command list

[command-list.md](command-list.md)

### Query list

[query-list.md](query-list.md)

### Connection status

[connection-status.md](connection-status.md)

### Capture progress

[capture-progress.md](capture-progress.md)

## Open

- Assign a version to the attachment export before its first publication.
- Decide whether a saved decision or action receipt keeps the approved content, such as reply text or event details.
