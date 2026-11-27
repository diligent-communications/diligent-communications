---
build_step: 3
status: draft
consumes: ["../archive/CONTEXT.md","../state/CONTEXT.md","../../contracts/CONTEXT.md#captured-record","../../contracts/CONTEXT.md#saved-decision"]
produces: ["Contact links","Contact views"]
writes: ["../state/CONTEXT.md"]
---
# contacts — Link communications to people

## Inputs

- Working: None in this planning repository.
- Reference: [archive](../archive/CONTEXT.md)
- Reference: [state](../state/CONTEXT.md)
- Reference: [Captured record](../../contracts/CONTEXT.md#captured-record)
- Reference: [Saved decision](../../contracts/CONTEXT.md#saved-decision)

## Process

1. Link mail, texts, and calls to a person while preserving links to originals.
2. Record merges and reversals in state. State saves both decisions to archive so contact views can be rebuilt without losing history.

## Outputs

- Contact links
- Contact views
- Handoff: [state](../state/CONTEXT.md)

## Check

A contributor merges two synthetic contacts, undoes the merge, and verifies that both retain all their history.
