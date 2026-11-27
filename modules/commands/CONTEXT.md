---
build_step: 1 to 2
status: draft
consumes: ["backup.md","../state/CONTEXT.md","../../contracts/command-list.md","../../contracts/mail-commands.md","../../contracts/capture-progress.md","../../contracts/connection-status.md","../../contracts/saved-decision.md","../../contracts/action-receipt.md","mail-run.md","../attachments/CONTEXT.md","../brief/CONTEXT.md","../calendar/CONTEXT.md","../contacts/CONTEXT.md","../effects/CONTEXT.md"]
produces: ["Write command catalog","Write previews","Command receipts","Backup list for setup","Capture and restore progress for state","Restored decisions and receipts for state"]
writes: ["../archive/CONTEXT.md","../capture/CONTEXT.md","../connections/CONTEXT.md","../state/CONTEXT.md","../brief/CONTEXT.md","../effects/CONTEXT.md"]
---
# commands — Preview and make changes

## Step 1 (complete)

### Inputs

- Working: Who is asking, from the surface. The capture outcome, progress reports and save notices from capture. The write-block answer from state. The backup list, restore preview, and restored decisions and receipts from archive, and the restore result from state.
- Reference: [Backup and restore](backup.md)
- Reference: [state](../state/CONTEXT.md)
- Reference: [Command list](../../contracts/command-list.md)
- Reference: [Mail commands](../../contracts/mail-commands.md)
- Reference: [Capture progress](../../contracts/capture-progress.md)
- Reference: [Connection status](../../contracts/connection-status.md)
- Reference: [Saved decision](../../contracts/saved-decision.md)
- Reference: [Action receipt](../../contracts/action-receipt.md)
- Reference: [Mail run](mail-run.md)

### Process

1. The shapes this module handles are the [command list](../../contracts/command-list.md), [mail commands](../../contracts/mail-commands.md), [capture progress](../../contracts/capture-progress.md), [connection status](../../contracts/connection-status.md), the [saved decision](../../contracts/saved-decision.md) and the [action receipt](../../contracts/action-receipt.md). Before any write, ask state whether writes are blocked. Until restore is joined to that question, the answer is no. Backup and restore are in [Backup and restore](backup.md).
2. A capture is started only by a person. The surface tells commands who is asking, a person or an agent. An agent is refused with `not-started-by-person`: nothing is listed, fetched or saved, and no run is recorded. The other refusals for connect and start are the ones [mail commands](../../contracts/mail-commands.md) names.
3. Commands creates the run's ID and its start time and gives those same values to state and to capture. Neither of them creates a run ID or a start time.
4. Commands opens the archive writer before a run starts and closes it only after capture has returned its final outcome, in every ending. A preview writes nothing: it uses folder status and does not open the archive. A command receipt is shown to the person and is not saved in the archive. It carries the capture outcome, any notice from opening or from a save, and, when the archive would not open, the archive's result name and message. It follows [connections'](../connections/CONTEXT.md) rule that nothing secret is reported.
5. The order of the small steps inside a mail run is drafted in [Mail run](mail-run.md) and is finished with this module's code. A caller does not need that page for an input or a named result.

### Outputs

- Write command catalog
- Write previews
- Command receipts
- Backup list for setup
- Capture and restore progress for state
- Restored decisions and receipts for state
- Handoff: [archive](../archive/CONTEXT.md)
- Handoff: [capture](../capture/CONTEXT.md)
- Handoff: [connections](../connections/CONTEXT.md)
- Handoff: [state](../state/CONTEXT.md)

### Check

A contributor runs setup, mail capture, backup, and restore with synthetic data. Each write shows a preview and returns a command receipt. The preview changes no file. Setup receives the backup list as the first part of the restore preview. State receives capture and restore progress and the decisions and receipts returned by archive. Capture and other archive writes are refused until state accepts the restored records. A connect leaves the archive unchanged, and a connect during a run is not refused. A start from an agent lists, fetches and saves nothing and records no run. Commands creates one run ID and one start time and gives those same values to state and to capture. The writer is opened here before state is told the run has started, folder settings are not passed to capture, and the writer is closed only after capture returns. The write-block question is asked before a write, and until restore is joined the answer is no. A later catch-up uses the same capture command. A preview and a receipt hold no token, client secret, sign-in code, or message body.

| Rule | Passes when |
| --- | --- |
| **A person starts it.** | A start from an agent is `not-started-by-person`. Nothing is listed, fetched or saved, and no run is recorded. |
| **Run ID.** | State and capture are given one run ID and one start time. Both were created here. Neither module creates its own. |
| **Writer.** | The writer is opened before the run starts. It is closed only after capture has returned its final outcome. |
| **Preview writes nothing.** | A preview changes no file and does not open the archive. |
| **Restore progress.** | The check above still says state receives capture and restore progress and the decisions and receipts returned by archive. |

## Step 2 (draft)

### Inputs

- Working: None in this planning repository.
- Reference: [attachments](../attachments/CONTEXT.md)
- Reference: [brief](../brief/CONTEXT.md)
- Reference: [calendar](../calendar/CONTEXT.md)
- Reference: [contacts](../contacts/CONTEXT.md)
- Reference: [effects](../effects/CONTEXT.md)

### Process

1. Expand the command list to the remaining working modules. Call brief for review. Record each approval in state before passing an approved external action to effects. Record changes to saved views in state as decisions.

### Outputs

- Handoff: [brief](../brief/CONTEXT.md)
- Handoff: [effects](../effects/CONTEXT.md)

### Check

A contributor exercises each added write with synthetic data and verifies a preview before the write and a command receipt afterward.
