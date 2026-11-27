---
build_step: 3
status: draft
consumes: ["../commands/CONTEXT.md","../queries/CONTEXT.md","../../contracts/command-list.md","../../contracts/query-list.md"]
produces: ["Agent access to commands and queries"]
---
# mcp — Expose commands and queries to agents

## Inputs

- Working: None in this planning repository.
- Reference: [commands](../commands/CONTEXT.md)
- Reference: [queries](../queries/CONTEXT.md)
- Reference: [Command list](../../contracts/command-list.md)
- Reference: [Query list](../../contracts/query-list.md)

## Process

1. Expose commands and queries over the Model Context Protocol. Return read results, write previews, and receipts through that interface.

## Outputs

- Agent access to commands and queries

## Check

A contributor connects two different agent hosts and completes the same read and write workflow in each.
