---
build_step: 2
consumes: ["../../contracts/CONTEXT.md"]
produces: ["Committed workflow state"]
---
# state

Keep workflow state consistent.

## Inputs

- Working: None in this planning repository.
- Reference: `../../contracts/CONTEXT.md`.

## Process

1. Apply changes to the queue, deduplication records, approvals, progress, and action receipts in transactions.
2. Return the committed result to the caller.

## Outputs

- Committed workflow state.

## Check

A contributor interrupts a synthetic write between updates and verifies after restart that the entire transaction rolled back.
