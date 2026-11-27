---
build_step: 1
consumes: ["../connections/CONTEXT.md","../../contracts/CONTEXT.md#captured-record"]
produces: ["Captured records with stable source IDs","Capture outcome for commands"]
writes: ["../archive/CONTEXT.md"]
---
# capture — Bring in communications and imports

All incoming communications and imports enter through capture.

## Inputs

- Working: None in this planning repository.
- Reference: [connections](../connections/CONTEXT.md)
- Reference: [Captured record](../../contracts/CONTEXT.md#captured-record)

## Process

1. Give each item a stable source ID and preserve its original payload in the captured record shape. Hand that record to archive. The archive manifest refuses IDs it already holds.
2. Return the capture outcome to commands so it can record capture progress in state.

## Outputs

- Captured records with stable source IDs
- Capture outcome for commands
- Handoff: [archive](../archive/CONTEXT.md)

## Check

A contributor captures the same synthetic item twice and verifies that the archive holds one record for its source ID.

## Lanes

### Mail · Step 1 (decided)

#### Inputs

- Working: None in this planning repository.
- Reference: [connections](../connections/CONTEXT.md)
- Reference: [Captured record](../../contracts/CONTEXT.md#captured-record)

#### Process

1. Import mail using a stable ID for each message.

#### Outputs

- Captured mail records

#### Check

A contributor imports the same message twice and verifies that the archive holds one record.

### Text · Step 3 (draft)

#### Inputs

- Working: None in this planning repository.
- Reference: [connections](../connections/CONTEXT.md)
- Reference: [Captured record](../../contracts/CONTEXT.md#captured-record)

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
- Reference: [Captured record](../../contracts/CONTEXT.md#captured-record)

#### Process

1. Bring in optional calls, voicemail, and transcripts.

#### Outputs

- Captured call records

#### Check

A contributor turns off calls and verifies that every other primary workflow still works.

### Import · Step 3 (draft)

#### Inputs

- Working: None in this planning repository.
- Reference: [Captured record](../../contracts/CONTEXT.md#captured-record)

#### Process

1. Accept items from a device or agent.

#### Outputs

- Captured import records

#### Check

A contributor imports the same source ID twice and verifies that both imports resolve to the same record.
