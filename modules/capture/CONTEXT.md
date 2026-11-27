---
build_step: 1
consumes: ["../connections/CONTEXT.md","../connections/fetch.md","../archive/saving-originals.md","../../contracts/captured-record.md","../../contracts/capture-progress.md","mail.md"]
produces: ["Captured records with stable source IDs","Capture outcome for commands"]
writes: ["../archive/CONTEXT.md"]
---
# capture — Bring in communications and imports

All incoming communications and imports enter through capture.

## Inputs

- Working: None in this planning repository.
- Reference: [connections](../connections/CONTEXT.md)
- Reference: [Saving originals](../archive/saving-originals.md)
- Reference: [Captured record](../../contracts/captured-record.md)
- Reference: [Capture progress](../../contracts/capture-progress.md)

## Process

1. Commands starts a capture, including a later catch-up. It passes the connection ID, the requested set, and the open archive writer. Do not read folder settings. Do not close the writer; commands closes it. This module holds no rule about who started the run. Give each item a stable source ID and preserve its original payload in the captured record shape. Ask the writer `sourceHeld` before treating the item as new. Only `not-held` leads to a download. Hand a new record to the writer with `saveOriginal`. The archive manifest refuses IDs it already holds.
2. Report progress to commands at the start, at intervals and at the end. The report is the [capture progress](../../contracts/capture-progress.md) record. Commands passes each report to state. Whether an item is held does not depend on that record. When commands passes a stop, return status `stopped`.

## Outputs

- Captured records with stable source IDs
- Capture outcome for commands
- Handoff: [archive](../archive/CONTEXT.md)

## Check

A contributor captures the same synthetic item twice and verifies that the archive holds one record for its source ID. The second run does not depend on a saved bookmark. A lookup other than `not-held` does not download. This module does not refuse a start based on who asked.

## Lanes

### Mail · Step 1 (decided)

#### Inputs

- Working: None in this planning repository.
- Reference: [connections](../connections/CONTEXT.md)
- Reference: [Fetch](../connections/fetch.md)
- Reference: [Saving originals](../archive/saving-originals.md)
- Reference: [Captured record](../../contracts/captured-record.md)
- Reference: [Capture progress](../../contracts/capture-progress.md)
- Reference: [Mail](mail.md)

#### Process

1. Follow [Mail](mail.md). Commands passes the connection ID, the requested set and the open writer. This lane holds no rule about who started the run.

#### Outputs

- Captured mail records

#### Check

A contributor imports the same message twice and verifies that the archive holds one record. The second run does not download it. The source ID holds no mail address. The saved bytes are the raw message decoded exactly from the response. An excluded kind is skipped. A listed item that was not saved, already held, skipped or gone leaves the run not complete. No token is received. The pass conditions are in [Mail](mail.md).

### Text · Step 3 (draft)

#### Inputs

- Working: None in this planning repository.
- Reference: [connections](../connections/CONTEXT.md)
- Reference: [Captured record](../../contracts/captured-record.md)

#### Process

1. Bring in texts from a phone or import.

#### Outputs

- Captured text records

#### Check

A contributor captures texts offline, reconnects, and verifies that the archive has no duplicates.

### Calls · Step 4 (draft)

#### Inputs

- Working: None in this planning repository.
- Reference: [connections](../connections/CONTEXT.md)
- Reference: [Captured record](../../contracts/captured-record.md)

#### Process

1. Bring in optional calls, voicemail, and transcripts.

#### Outputs

- Captured call records

#### Check

A contributor turns off calls and verifies that every other primary workflow still works.

### Import · Step 3 (draft)

#### Inputs

- Working: None in this planning repository.
- Reference: [Captured record](../../contracts/captured-record.md)

#### Process

1. Accept items from a device or agent.

#### Outputs

- Captured import records

#### Check

A contributor imports the same source ID twice and verifies that both imports resolve to the same record.
