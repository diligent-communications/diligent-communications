---
consumes: ["../commands/CONTEXT.md"]
produces: ["MCP command access"]
---
# mcp

Expose the commands to agent hosts.

## Inputs

- Working: None in this planning repository.
- Reference: `../commands/CONTEXT.md`.

## Process

1. Expose the command catalog over the Model Context Protocol.
2. Forward requests to commands and return their results, including previews and receipts.

## Outputs

- MCP command access.

## Check

A contributor connects with two different agent hosts and completes the same synthetic command workflow with each.
