---
build_step: 3
consumes: ["../archive/CONTEXT.md","../state/CONTEXT.md"]
produces: ["Contact links","Contact views"]
---
# contacts

Tie mail, texts, and calls to one person.

## Inputs

- Working: None in this planning repository.
- Reference: `../archive/CONTEXT.md`, `../state/CONTEXT.md`.

## Process

1. Rebuild contact views from archived evidence. Keep merge and undo progress in state and preserve links to original items.

## Outputs

- Contact links.
- Contact views.

## Check

A contributor merges two synthetic contacts, undoes the merge, and verifies that both retain all their history.
