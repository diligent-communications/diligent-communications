---
build_step: 2
consumes: ["../attachments/CONTEXT.md","../brief/CONTEXT.md","../calendar/CONTEXT.md","../capture/CONTEXT.md","../contacts/CONTEXT.md","../effects/CONTEXT.md"]
produces: ["Write command catalog","Write previews","Write receipts"]
---
# commands

Publish one list of changes a person or agent can make.

## Inputs

- Working: None in this planning repository.
- Reference: `../attachments/CONTEXT.md`, `../brief/CONTEXT.md`, `../calendar/CONTEXT.md`, `../capture/CONTEXT.md`, `../contacts/CONTEXT.md`, `../effects/CONTEXT.md`.

## Process

1. Give every write a preview and a receipt. Route changes through the working modules and send approved external actions through effects.

## Outputs

- Write command catalog.
- Write previews.
- Write receipts.

## Check

A contributor exercises every write command on synthetic data and verifies a preview before execution and a receipt afterward.
