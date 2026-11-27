---
build_step: 1 to 2
status: draft
consumes: ["../archive/CONTEXT.md","../capture/CONTEXT.md","../connections/CONTEXT.md","../state/CONTEXT.md","../../contracts/CONTEXT.md#command-list","../../contracts/CONTEXT.md#saved-decision","../../contracts/CONTEXT.md#action-receipt","../attachments/CONTEXT.md","../brief/CONTEXT.md","../calendar/CONTEXT.md","../contacts/CONTEXT.md","../effects/CONTEXT.md"]
produces: ["Write command catalog","Write previews","Write receipts","Capture and restore progress for state","Restored decisions and receipts for state"]
writes: ["../archive/CONTEXT.md","../capture/CONTEXT.md","../connections/CONTEXT.md","../state/CONTEXT.md","../effects/CONTEXT.md"]
---
# commands — Preview and make changes

## Step 1 (complete)

### Inputs

- Working: None in this planning repository.
- Reference: [archive](../archive/CONTEXT.md)
- Reference: [capture](../capture/CONTEXT.md)
- Reference: [connections](../connections/CONTEXT.md)
- Reference: [state](../state/CONTEXT.md)
- Reference: [Command list](../../contracts/CONTEXT.md#command-list)
- Reference: [Saved decision](../../contracts/CONTEXT.md#saved-decision)
- Reference: [Action receipt](../../contracts/CONTEXT.md#action-receipt)

### Process

1. Use the evidence folder through archive. Set its location in archive when setup asks, connect the mailbox through connections, and start mail capture through capture. Record capture progress in state from the outcome capture returns.
2. Run backup and restore through archive. On restore, read the saved decisions and receipts that archive returns and hand them to state. Record restore progress in state and complete the restore only after state accepts those records.
3. Show a preview before each write and return a receipt afterward.

### Outputs

- Write command catalog
- Write previews
- Write receipts
- Capture and restore progress for state
- Restored decisions and receipts for state
- Handoff: [archive](../archive/CONTEXT.md)
- Handoff: [capture](../capture/CONTEXT.md)
- Handoff: [connections](../connections/CONTEXT.md)
- Handoff: [state](../state/CONTEXT.md)

### Check

A contributor runs setup, mail capture, backup, and restore with synthetic data. Each write shows a preview and leaves a receipt. State receives capture and restore progress and the decisions and receipts returned by archive.

## Step 2 (draft)

### Inputs

- Working: None in this planning repository.
- Reference: [attachments](../attachments/CONTEXT.md)
- Reference: [brief](../brief/CONTEXT.md)
- Reference: [calendar](../calendar/CONTEXT.md)
- Reference: [contacts](../contacts/CONTEXT.md)
- Reference: [effects](../effects/CONTEXT.md)

### Process

1. Expand the command list to the remaining working modules. Record each approval in state before passing an approved external action to effects. Record changes to saved views in state as decisions.

### Outputs

- Handoff: [effects](../effects/CONTEXT.md)

### Check

A contributor exercises each added write with synthetic data and verifies a preview before the write and a receipt afterward.
