---
build_step: 1 to 2
status: draft
consumes: ["../archive/CONTEXT.md","../connections/CONTEXT.md","../state/CONTEXT.md","../../contracts/CONTEXT.md#query-list","../../contracts/CONTEXT.md#connection-status","../attachments/CONTEXT.md","../brief/CONTEXT.md","../calendar/CONTEXT.md","../capture/CONTEXT.md","../contacts/CONTEXT.md","../effects/CONTEXT.md"]
produces: ["Query catalog","Read results"]
---
# queries — Provide one way to read

## Step 1 (complete)

### Inputs

- Working: None in this planning repository.
- Reference: [archive](../archive/CONTEXT.md)
- Reference: [connections](../connections/CONTEXT.md)
- Reference: [state](../state/CONTEXT.md)
- Reference: [Query list](../../contracts/CONTEXT.md#query-list)
- Reference: [Connection status](../../contracts/CONTEXT.md#connection-status)

### Process

1. Read the evidence folder through archive. Read mailbox connection status through connections and capture and restore progress through state. Give setup those results through the query catalog.

### Outputs

- Query catalog
- Read results

### Check

A contributor compares the folder choice, connection status, and capture and restore progress shown in setup with the values returned by archive, connections, and state.

## Step 2 (draft)

### Inputs

- Working: None in this planning repository.
- Reference: [attachments](../attachments/CONTEXT.md)
- Reference: [brief](../brief/CONTEXT.md)
- Reference: [calendar](../calendar/CONTEXT.md)
- Reference: [capture](../capture/CONTEXT.md)
- Reference: [contacts](../contacts/CONTEXT.md)
- Reference: [effects](../effects/CONTEXT.md)

### Process

1. Expand to lists, search, and saved views. Read through the working modules and foundations, applying the same query behavior from every surface.
2. Read saved views from state. Changes to a saved view are a person's choice. They go through commands to state and are saved into the archive like other decisions.

### Check

A contributor submits the same read request through the screens and an agent host and compares their answers.
