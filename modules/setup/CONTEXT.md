---
build_step: 1
consumes: ["../commands/CONTEXT.md","../queries/CONTEXT.md","../../contracts/command-list.md","../../contracts/query-list.md","../../contracts/connection-status.md"]
produces: ["First-run setup flow"]
---
# setup — Guide first run

## Inputs

- Working: The backup list, previews, and command receipts from commands.
- Reference: [commands](../commands/CONTEXT.md)
- Reference: [queries](../queries/CONTEXT.md)
- Reference: [Command list](../../contracts/command-list.md)
- Reference: [Query list](../../contracts/query-list.md)
- Reference: [Connection status](../../contracts/connection-status.md)

## Process

1. Own the first-run flow. Its first form is a terminal tool. The tool uses only commands for changes and queries for reads. The in-app Setup screen belongs to app and calls the same commands.
2. Ask the person for the evidence folder and a separate backup folder, then set both locations through commands. Archive keeps them as local settings outside the evidence folder and out of backups. Use commands to connect the mailbox and to start a capture when the person asks, including a later catch-up. A capture is started only by a person. Use queries to show the folder choice, connection status, and capture and restore progress.
3. In step 1, setup requests backups and restores through commands. When restoring, show the backup list that commands returns as the first part of the restore preview, not through queries. Let the person pick a backup, show that backup's preview, and ask the person to confirm.
4. When a restore needs a new empty folder, ask the person for one and set it through commands. While a restore is unfinished, capture and other archive writes are blocked. Retrying that restore and setting the folder locations are not blocked, so the person can always pick a new empty folder. A restore copies beside the destination and moves the copy into place only when it is complete, so a stopped copy never leaves the destination partly filled. A leftover from a stopped copy is reported and left alone.
5. Show the preview and command receipt that commands returns.

## Outputs

- First-run setup flow

## Check

A second person starts with a fresh install and reaches first capture without help. They use the terminal tool, which reaches the archive and the mailbox only through commands and queries, and a later catch-up uses the same commands.
