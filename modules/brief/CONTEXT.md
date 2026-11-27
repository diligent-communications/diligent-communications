---
build_step: 2
status: draft
consumes: ["../archive/CONTEXT.md","../state/CONTEXT.md","../../contracts/captured-record.md","../../contracts/saved-decision.md"]
produces: ["Source-linked Brief"]
writes: ["../state/CONTEXT.md"]
---
# brief — Show items that need attention

## Inputs

- Working: None in this planning repository.
- Reference: [archive](../archive/CONTEXT.md)
- Reference: [state](../state/CONTEXT.md)
- Reference: [Captured record](../../contracts/captured-record.md)
- Reference: [Saved decision](../../contracts/saved-decision.md)

## Process

1. Commands calls brief for review. Use archived originals and live review progress to produce the Brief. Give each row a link to its original.
2. Keep review choices in state. State saves those choices to archive so the Brief can be rebuilt after restore.

## Outputs

- Source-linked Brief
- Handoff: [state](../state/CONTEXT.md)

## Check

A contributor opens every row in a synthetic Brief and verifies that it opens the expected original.
