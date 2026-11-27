---
consumes: ["../app/CONTEXT.md","../archive/CONTEXT.md","../attachments/CONTEXT.md","../brief/CONTEXT.md","../capture/CONTEXT.md","../mcp/CONTEXT.md","../state/CONTEXT.md"]
produces: ["Command catalog","Command results","Write previews","Write receipts"]
---
# commands

Provide one command surface for people and agents.

## Inputs

- Working: None in this planning repository.
- Reference: `../app/CONTEXT.md`, `../archive/CONTEXT.md`, `../attachments/CONTEXT.md`, `../brief/CONTEXT.md`, `../capture/CONTEXT.md`, `../mcp/CONTEXT.md`, `../state/CONTEXT.md`.

## Process

1. Use the module interfaces to define and run operations. Read the app and MCP contracts for caller needs.
2. Show a preview before executing any write and return a receipt for the completed write.

## Outputs

- Command catalog.
- Command results.
- Write previews.
- Write receipts.

## Check

A contributor exercises each write command with synthetic data and verifies a preview before execution and a receipt afterward.
