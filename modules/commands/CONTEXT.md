---
build_step: 1 to 2
consumes: ["../archive/CONTEXT.md","../attachments/CONTEXT.md","../brief/CONTEXT.md","../calendar/CONTEXT.md","../capture/CONTEXT.md","../connections/CONTEXT.md","../contacts/CONTEXT.md","../effects/CONTEXT.md","../state/CONTEXT.md","../../contracts/CONTEXT.md#command-list","../../contracts/CONTEXT.md#saved-decision","../../contracts/CONTEXT.md#action-receipt"]
produces: ["Write command catalog","Write previews","Write receipts"]
---
# commands — Preview and make changes

## Inputs

- Working: None in this planning repository.
- Reference: [archive](../archive/CONTEXT.md)
- Reference: [attachments](../attachments/CONTEXT.md)
- Reference: [brief](../brief/CONTEXT.md)
- Reference: [calendar](../calendar/CONTEXT.md)
- Reference: [capture](../capture/CONTEXT.md)
- Reference: [connections](../connections/CONTEXT.md)
- Reference: [contacts](../contacts/CONTEXT.md)
- Reference: [effects](../effects/CONTEXT.md)
- Reference: [state](../state/CONTEXT.md)
- Reference: [Command list](../../contracts/CONTEXT.md#command-list)
- Reference: [Saved decision](../../contracts/CONTEXT.md#saved-decision)
- Reference: [Action receipt](../../contracts/CONTEXT.md#action-receipt)

## Process

1. Start in step 1 with commands to choose the evidence folder, connect the mailbox, capture mail, back up, and restore. Expand the command list in step 2.
2. Give each write a preview and a receipt. Record each approval in state before passing an approved external action to effects.

## Outputs

- Write command catalog
- Write previews
- Write receipts

## Check

A contributor exercises every write command with synthetic data and verifies a preview before the write and a receipt afterward.
