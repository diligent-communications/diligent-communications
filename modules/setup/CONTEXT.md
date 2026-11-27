---
build_step: 1
consumes: ["../commands/CONTEXT.md","../queries/CONTEXT.md","../../contracts/CONTEXT.md#command-list","../../contracts/CONTEXT.md#query-list","../../contracts/CONTEXT.md#connection-status"]
produces: ["First-run setup flow"]
---
# setup — Guide first run

## Inputs

- Working: None in this planning repository.
- Reference: [commands](../commands/CONTEXT.md)
- Reference: [queries](../queries/CONTEXT.md)
- Reference: [Command list](../../contracts/CONTEXT.md#command-list)
- Reference: [Query list](../../contracts/CONTEXT.md#query-list)
- Reference: [Connection status](../../contracts/CONTEXT.md#connection-status)

## Process

1. Own the first-run flow. The in-app Setup screen belongs to app and calls the same commands.
2. Ask the person for the evidence folder location and set it through a command. The archive keeps the location as a local setting. Use commands to connect the mailbox and restore a backup when requested. Use queries to show the folder choice, connection status, and capture and restore progress.

## Outputs

- First-run setup flow

## Check

A second person starts with a fresh install and reaches first capture without help.
