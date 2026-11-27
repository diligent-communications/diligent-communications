---
build_step: 1
consumes: ["../connections/CONTEXT.md","../../contracts/CONTEXT.md"]
produces: ["Captured records with stable source IDs"]
---
# capture

Bring all incoming communications and imports into the app.

## Inputs

- Working: None in this planning repository.
- Reference: `../connections/CONTEXT.md`, `../../contracts/CONTEXT.md`.

## Process

1. Give each item a stable source ID and preserve its original payload for the archive. Use the input paths specified in each lane below.

## Outputs

- Captured records with stable source IDs.

## Check

A contributor captures the same synthetic item twice and verifies that its source ID resolves to one record.

## Lanes

### Mail · Step 1 (decided)

#### Inputs

- Working: None in this planning repository.
- Reference: `../connections/CONTEXT.md`, `../../contracts/CONTEXT.md`.

Import mail using a stable ID for each message. Importing the same message twice yields one record.

### Text · Step 3 (proposed)

#### Inputs

- Working: None in this planning repository.
- Reference: `../connections/CONTEXT.md`, `../../contracts/CONTEXT.md`.

Bring in texts from a phone or import. Offline capture reconnects without duplicates.

### Calls · Step 4 (proposed)

#### Inputs

- Working: None in this planning repository.
- Reference: `../connections/CONTEXT.md`, `../../contracts/CONTEXT.md`.

Bring in optional calls, voicemail, and transcripts. Every primary workflow works with this lane turned off.

### Import · Step 3 (proposed)

#### Inputs

- Working: None in this planning repository.
- Reference: `../../contracts/CONTEXT.md`.

Accept items from a device or agent. The same source ID resolves to the same record.
