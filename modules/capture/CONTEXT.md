---
build_step: 1
consumes: ["../connections/CONTEXT.md","../connections/fetch.md","../archive/saving-originals.md","../../contracts/captured-record.md","../../contracts/capture-progress.md","mail.md"]
produces: ["Captured records with stable source IDs","Capture outcome for commands","Save notices for commands"]
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

1. Commands starts a capture, including a later catch-up. It passes the run ID and start time it created, the connection ID, the requested set, and the open archive writer. This module does not create the run ID or the start time, and it holds no rule about who started the run. Do not read folder settings. Do not close the writer. Commands closes it only after this module returns its final outcome. The outcome is a [capture progress](../../contracts/capture-progress.md) status. Beside the outcome, hand commands any notice a save returned. The progress record does not gain a field for that notice.
2. The source ID for mail is the exact text `mail:gmail:`, then the account number, then `:`, then the message ID. Nothing is trimmed or folded. The account number is the provider's lasting identifier for that account: the same after signing in again or after the mail address changes, and different for another account. It is not a mail address. Ask the writer `sourceHeld` with that source ID before anything is downloaded. Only `not-held` leads to a download. `held` does not. Hand a new record to the writer with `saveOriginal`. What is saved is the raw message, decoded exactly from the provider's response. The archive manifest refuses IDs it already holds.
3. A capture is tied to the connection it started with. When `fetchMail` or the account-number call returns `connection-not-current`, the run ends as `failed` with that name and nothing further is fetched. A run is complete only when it reached the end of its requested list and every item was saved, already held, deliberately skipped, or gone. The order of the small steps, what each fetch result does, the counts, and how a stop is handled are drafted in [Mail](mail.md).

## Outputs

- Captured records with stable source IDs
- Capture outcome for commands
- Save notices for commands
- Handoff: [archive](../archive/CONTEXT.md)

## Check

A contributor captures the same synthetic item twice and verifies that the archive holds one record for its source ID. The second run does not depend on a saved bookmark. A lookup other than `not-held` does not download. This module does not refuse a start based on who asked, and it does not create the run ID. A notice a save returned is handed to commands beside the outcome, and the progress record has no field for it.

| Rule | Passes when |
| --- | --- |
| **Tied to the connection.** | A `fetchMail` or account-number result of `connection-not-current` ends the run as `failed` with that name. Nothing further is fetched. |
| **Lasting account number.** | After signing in again to the same account, the account number is unchanged, so a source ID already held still matches `mail:gmail:` plus that number plus `:` plus the message ID. A second account has a different number. A mail address is in neither. |
| **Ask before download.** | `sourceHeld` is called before a download. `held` downloads nothing. Only `not-held` downloads. |
| **Raw message.** | The saved bytes are the raw message decoded exactly from the provider's response, not the response body. |
| **Complete.** | Status is `complete` only when the run reached the end of its requested list and every item was saved, already held, deliberately skipped, or gone. |

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

1. The inner steps are drafted in [Mail](mail.md) and are finished with this module's code. Commands passes the run ID and start time, the connection ID, the requested set and the open writer. This lane holds no rule about who started the run. The hard rules on this contract are the seam.

#### Outputs

- Captured mail records

#### Check

A contributor imports the same message twice and verifies that the archive holds one record. The second run does not download it. An excluded kind is skipped. No token is received. The source ID, the saved bytes, and when a run is complete follow the hard rules on this contract.

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
