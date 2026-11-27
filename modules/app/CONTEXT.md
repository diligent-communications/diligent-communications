---
build_step: 2
status: draft
consumes: ["../commands/CONTEXT.md","../queries/CONTEXT.md","../../contracts/command-list.md","../../contracts/query-list.md"]
produces: ["Application screens"]
---
# app — Present application screens

## Inputs

- Working: None in this planning repository.
- Reference: [commands](../commands/CONTEXT.md)
- Reference: [queries](../queries/CONTEXT.md)
- Reference: [Command list](../../contracts/command-list.md)
- Reference: [Query list](../../contracts/query-list.md)

## Process

1. Use queries for Brief, Mail, Text, Calls, Attachments, Contacts, and Calendar. Use commands for changes and display their previews and receipts.
2. Own the in-app Setup screen. It calls the same commands as the first-run flow owned by setup.

## Outputs

- Application screens

## Check

A contributor exercises every screen with recording command and query interfaces and verifies that all data access goes through them.
