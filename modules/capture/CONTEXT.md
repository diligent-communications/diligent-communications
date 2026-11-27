---
build_step: 1
consumes: ["../connections/CONTEXT.md","../archive/CONTEXT.md","../archive/saving-originals.md","../../contracts/captured-record.md","../../contracts/capture-progress.md"]
produces: ["Captured records with stable source IDs","Capture outcome for commands"]
writes: ["../archive/CONTEXT.md"]
---
# capture — Bring in communications and imports

All incoming communications and imports enter through capture.

## Inputs

- Working: None in this planning repository.
- Reference: [connections](../connections/CONTEXT.md)
- Reference: [archive](../archive/CONTEXT.md)
- Reference: [Saving originals](../archive/saving-originals.md)
- Reference: [Captured record](../../contracts/captured-record.md)
- Reference: [Capture progress](../../contracts/capture-progress.md)

## Process

1. Commands starts a capture when a person asks, including a later catch-up. It opens the archive writer and passes that writer here. Do not read folder settings. Give each item a stable source ID and preserve its original payload in the captured record shape. Ask the writer `sourceHeld` before treating the item as new, and hand a new record to the writer with `saveOriginal`. The archive manifest refuses IDs it already holds.
2. Return the capture outcome to commands so it can record capture progress in state. The outcome is the [capture progress](../../contracts/capture-progress.md) record. Whether an item is held does not depend on that record.

## Outputs

- Captured records with stable source IDs
- Capture outcome for commands
- Handoff: [archive](../archive/CONTEXT.md)

## Check

A contributor captures the same synthetic item twice and verifies that the archive holds one record for its source ID. The second run does not depend on a saved bookmark. A start that is not from a person is not accepted here.

## Lanes

### Mail · Step 1 (decided)

#### Inputs

- Working: None in this planning repository.
- Reference: [connections](../connections/CONTEXT.md)
- Reference: [archive](../archive/CONTEXT.md)
- Reference: [Saving originals](../archive/saving-originals.md)
- Reference: [Captured record](../../contracts/captured-record.md)
- Reference: [Capture progress](../../contracts/capture-progress.md)

#### Process

1. Commands starts mail capture when a person asks, including a later catch-up, and passes the open archive writer. Do not read folder settings. Run only where the archive can open a writer.
2. The source ID is the exact text `mail:gmail:`, then the account number connections provides, then `:`, then the message ID. Nothing is trimmed or folded. The account number is not a mail address, and the source ID holds no mail address.
3. Take received, sent and archived mail. Do not take Spam, Trash, drafts or chat messages. A listed item of a kind that is left out is skipped.
4. On every run, list the mailbox from the top. Save no bookmark. For each listed item, call `sourceHeld`. If the result is `held`, count it in `already_held` and do not download it. Otherwise save the payload as exactly the bytes the provider returned for the raw message, with media type `message/rfc822`.
5. Ask connections for each provider read through `fetchMail`. Do not take a token or any other sign-in material.
6. A run is complete only when it reached the end of its requested list and every listed item was saved, already held, deliberately skipped, or gone from the mailbox. That is status `complete` on the capture progress record. Fill the counts as that record defines. Do not use the progress record to decide what is held. When the person stops the run, return status `stopped`. Originals already saved stay saved.

#### Outputs

- Captured mail records

#### Check

A contributor imports the same message twice and verifies that the archive holds one record. The second run does not download it. The source ID holds no mail address. The saved bytes are the bytes the provider returned. An excluded kind is skipped. A listed item that was not saved, already held, skipped or gone leaves the run not complete. No token is received.

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
