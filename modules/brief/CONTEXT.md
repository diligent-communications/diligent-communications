---
build_step: 2
consumes: ["../archive/CONTEXT.md","../state/CONTEXT.md"]
produces: ["Source-linked Brief"]
---
# brief

Review captured items and produce the Brief.

## Inputs

- Working: None in this planning repository.
- Reference: `../archive/CONTEXT.md`, `../state/CONTEXT.md`.

## Process

1. Use archived originals and review state to assemble the list of items that need attention.
2. Give every Brief line a link to the original that supports it.

## Outputs

- Source-linked Brief.

## Check

A contributor opens the link on every line in a synthetic Brief and compares it with the expected original.
