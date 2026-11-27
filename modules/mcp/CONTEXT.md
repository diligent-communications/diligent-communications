---
build_step: 3
consumes: ["../commands/CONTEXT.md","../queries/CONTEXT.md"]
produces: ["Agent access to commands and queries"]
---
# mcp

Give agent hosts the same access as the screens.

## Inputs

- Working: None in this planning repository.
- Reference: `../commands/CONTEXT.md`, `../queries/CONTEXT.md`.

## Process

1. Expose commands and queries over the Model Context Protocol. Return read results, write previews, and receipts through that interface.

## Outputs

- Agent access to commands and queries.

## Check

A contributor connects two different agent hosts and completes the same read and write workflow in each.
