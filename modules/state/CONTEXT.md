---
build_step: 1 to 2
status: draft
consumes: ["../../contracts/CONTEXT.md#saved-decision","../../contracts/CONTEXT.md#action-receipt"]
produces: ["Capture and restore progress","Restored workflow state","Committed workflow state","Saved decisions and action receipts"]
writes: ["../archive/CONTEXT.md"]
---
# state — Hold live workflow state

## Step 1 (complete)

### Inputs

- Working: Capture and restore progress from commands, and saved decisions and receipts passed in by the restore command.
- Reference: [Saved decision](../../contracts/CONTEXT.md#saved-decision)
- Reference: [Action receipt](../../contracts/CONTEXT.md#action-receipt)

### Process

1. Record the capture and restore progress that commands sends. Make it available to queries.
2. Receive saved decisions and receipts from the restore command and rebuild live state from them transactionally. During restore, keep an approval without a receipt out of automatic dispatch. Hold it for a provider check or return it for approval.

### Outputs

- Capture and restore progress
- Restored workflow state

### Check

A contributor records synthetic capture and restore progress and verifies that queries receives it. The contributor restores a backup and verifies that state accepts the passed-in decisions and receipts, rebuilds them without a partial update, and holds approvals without receipts.

## Step 2 (draft)

### Process

1. Hold the queue, approvals, review progress, proposed events, and live receipts transactionally. Save lasting choices, including reviews, contact merges and their reversals, approvals, saved views, and calendar accept or decline decisions, as readable decision records in archive. Save action receipts there too.
2. Preserve completed actions and reconcile uncertain outcomes before retrying.

### Outputs

- Committed workflow state
- Saved decisions and action receipts
- Handoff: [archive](../archive/CONTEXT.md)

### Check

A contributor interrupts a synthetic queue update and verifies after restart that nothing is half done.
