# Finished application target

Three ways in, one door, six working modules, three foundations.

```mermaid
flowchart TB
  subgraph Surfaces
    app[app: the screens]
    mcp[mcp: AI agents]
    setup[setup: first run]
  end
  subgraph Door[One door]
    commands[commands: writes]
    queries[queries: reads]
  end
  subgraph Work[Working modules]
    capture[capture: mail, texts, calls, imports]
    brief[brief: what needs you]
    attachments
    contacts
    calendar
    effects[effects: anything sent outward]
  end
  subgraph Foundations
    archive[archive: evidence folder + manifest]
    state[state: queue, dedupe, approvals]
    connections[connections: sign-ins]
  end
  src([Mailbox, texts, calls, device or agent imports])
  out([People you write to, your calendar])
  store([Local folder or Google Drive])
  consumers([Other apps that take the export])

  app --> commands & queries
  mcp --> commands & queries
  setup --> commands & queries

  src == evidence ==> capture == evidence ==> archive
  archive == stores in ==> store

  queries -. reads .-> brief & attachments & contacts & calendar
  brief -. reads .-> archive
  attachments -. reads .-> archive
  contacts -. reads .-> archive
  calendar -. reads .-> archive

  commands -- approved --> effects -- sends --> out
  commands -- review --> brief
  attachments -- export --> consumers
  effects -- receipt --> state
  brief -- progress --> state
  capture -- dedupe --> state
  capture & effects --> connections
```

Thick arrows are evidence coming in. Dotted arrows are reads. Plain arrows are approved actions and their receipts.

Three owners of the truth:

- **What happened** lives in `archive`. Originals are never rewritten.
- **What it means** lives in `brief`, `contacts`, `calendar` and `attachments`, with progress in `state`. All of it can be rebuilt from the archive.
- **What was done about it** lives in `effects`. A sent reply or a calendar write happens once, after approval, and leaves a receipt. It is never replayed on restore or retry.

Screens and agents use the same door, so a person and an agent never do the same thing two different ways. Things come in through `capture` only and go out through `effects` only.
