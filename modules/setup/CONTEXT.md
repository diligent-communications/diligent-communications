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
2. Ask the person for the evidence folder and a separate backup folder, then set both locations through commands. Archive keeps them as local settings outside the evidence folder and out of backups. Use commands to connect the mailbox and start the first capture. Use queries to show the folder choice, connection status, and capture and restore progress.
3. In step 1, setup requests backups and restores through commands. When restoring, show the backups found in the backup folder and let the person pick one.
4. Show the preview and receipt that commands returns.

## Outputs

- First-run setup flow

## Check

A second person starts with a fresh install and reaches first capture without help.
