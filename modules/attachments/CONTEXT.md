---
build_step: 3
status: draft
consumes: ["../archive/CONTEXT.md","../../contracts/captured-record.md","../../contracts/archive-manifest.md","../../contracts/CONTEXT.md#attachment-export"]
produces: ["Attachment previews","Attachment export"]
---
# attachments — Find and export attachments

## Inputs

- Working: None in this planning repository.
- Reference: [archive](../archive/CONTEXT.md)
- Reference: [Captured record](../../contracts/captured-record.md)
- Reference: [Archive manifest](../../contracts/archive-manifest.md)
- Reference: [Attachment export](../../contracts/CONTEXT.md#attachment-export)

## Process

1. Apply a mail filter to archived mail and find matching PDFs and images.
2. Preview and deduplicate matches, then create a local export in the published format for other apps to pick up.

## Outputs

- Attachment previews
- Attachment export

## Check

A contributor runs a synthetic export and compares its contents and layout with the published attachment export shape.

## Open

- Decide where a person's mail filter is saved.
