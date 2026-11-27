---
build_step: 3
consumes: ["../archive/CONTEXT.md"]
produces: ["Attachment previews","Attachment export"]
---
# attachments

Find, preview, and export attachments.

## Inputs

- Working: None in this planning repository.
- Reference: `../archive/CONTEXT.md`.

## Process

1. Apply a mail filter to archived mail and find matching PDFs and images.
2. Preview and deduplicate the matches, then create a local export in the published format for other apps to pick up.

## Outputs

- Attachment previews.
- Attachment export.

## Check

A contributor runs a synthetic export and compares its contents and layout with the published export contract.
