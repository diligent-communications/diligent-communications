---
build_step: 1 to 2
status: draft
consumes: ["../archive/CONTEXT.md","../connections/CONTEXT.md","../state/CONTEXT.md","../../contracts/query-list.md","../../contracts/connection-status.md","../../contracts/capture-progress.md","../attachments/CONTEXT.md","../brief/CONTEXT.md","../calendar/CONTEXT.md","../capture/CONTEXT.md","../contacts/CONTEXT.md","../effects/CONTEXT.md"]
produces: ["Query catalog","Read results"]
---
# queries — Provide one way to read

## Step 1 (complete)

### Inputs

- Working: None in this planning repository.
- Reference: [archive](../archive/CONTEXT.md)
- Reference: [connections](../connections/CONTEXT.md)
- Reference: [state](../state/CONTEXT.md)
- Reference: [Query list](../../contracts/query-list.md)
- Reference: [Connection status](../../contracts/connection-status.md)
- Reference: [Capture progress](../../contracts/capture-progress.md)

### Process

1. Read the evidence folder through archive. Read mailbox connection status through connections and capture and restore progress through state, including progress from a later capture. Capture progress answers as the query list names. Give setup those results through the query catalog. Do not start a capture.
2. Do not list backups. The backup list is the first part of the restore preview, which commands returns. It is the one stated exception to reads going through queries.

### Outputs

- Query catalog
- Read results

### Check

A contributor compares the folder choice, connection status, and capture and restore progress shown in setup with the values returned by archive, connections, and state. The comparison includes a later capture, and the read does not start one.

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
