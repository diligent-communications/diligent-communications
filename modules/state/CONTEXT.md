---
build_step: 2
consumes: ["../../contracts/CONTEXT.md#saved-decision","../../contracts/CONTEXT.md#action-receipt"]
produces: ["Committed workflow state","Saved decisions and action receipts"]
writes: ["../archive/CONTEXT.md"]
---
# state — Hold live workflow state

## Inputs

- Working: None in this planning repository.
- Reference: [Saved decision](../../contracts/CONTEXT.md#saved-decision)
- Reference: [Action receipt](../../contracts/CONTEXT.md#action-receipt)

## Process

1. Hold the queue, approvals, review progress, and live receipts transactionally. Save lasting choices, including reviews, contact merges and their reversals, and approvals, as readable decision records in archive. Save action receipts there too.
2. After restore, rebuild live state from the archived decisions and receipts before resuming actions. Preserve completed actions and reconcile uncertain outcomes before retrying.

## Outputs

- Committed workflow state
- Saved decisions and action receipts
- Handoff: [archive](../archive/CONTEXT.md)

## Check

A contributor interrupts a synthetic write, verifies there is no partial live update after restart, then restores and verifies that saved decisions and receipts rebuild live state.
