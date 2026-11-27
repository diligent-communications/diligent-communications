---
build_step: 1 to 2
status: draft
consumes: ["../archive/CONTEXT.md","../capture/CONTEXT.md","../connections/CONTEXT.md","../state/CONTEXT.md","../../contracts/command-list.md","../../contracts/saved-decision.md","../../contracts/action-receipt.md","../../contracts/capture-progress.md","../../contracts/connection-status.md","../../contracts/mail-commands.md","../attachments/CONTEXT.md","../brief/CONTEXT.md","../calendar/CONTEXT.md","../contacts/CONTEXT.md","../effects/CONTEXT.md"]
produces: ["Write command catalog","Write previews","Command receipts","Backup list for setup","Capture and restore progress for state","Restored decisions and receipts for state"]
writes: ["../archive/CONTEXT.md","../capture/CONTEXT.md","../connections/CONTEXT.md","../state/CONTEXT.md","../brief/CONTEXT.md","../effects/CONTEXT.md"]
---
# commands — Preview and make changes

## Step 1 (complete)

### Inputs

- Working: Who is asking, from the surface. The capture outcome and progress reports from capture. The write-block answer from state. Connection status from connections. The backup list, restore preview, and restored decisions and receipts from archive, and the restore result from state.
- Reference: [archive](../archive/CONTEXT.md)
- Reference: [capture](../capture/CONTEXT.md)
- Reference: [connections](../connections/CONTEXT.md)
- Reference: [state](../state/CONTEXT.md)
- Reference: [Command list](../../contracts/command-list.md)
- Reference: [Saved decision](../../contracts/saved-decision.md)
- Reference: [Action receipt](../../contracts/action-receipt.md)
- Reference: [Capture progress](../../contracts/capture-progress.md)
- Reference: [Connection status](../../contracts/connection-status.md)
- Reference: [Mail commands](../../contracts/mail-commands.md)

### Process

1. Use the evidence folder through archive. Before any write, ask state whether writes are blocked. Until restore is joined to that question, the answer is no. The unfinished-restore block below is unchanged. At setup's request, set the evidence and backup folder locations in archive, and connect the mailbox through connections. Connecting does not write to the archive. Refuse Connect mailbox while a capture run is active. Learn the current connection from connection status. The surface tells who is asking. Refuse Start mail capture from an agent, and then list, fetch and save nothing and record no run. For a person's start, including a later catch-up, open the archive writer first. Only then tell state the run has started. Pass the connection ID, the requested set and the writer to capture, without folder settings. Pass each progress report from capture to state. If state reports `progress-not-recorded`, stop the run, leave saved originals saved, and say on the receipt that progress could not be recorded. Close the writer in every ending. A preview uses folder status, writes nothing, and does not open the archive. The receipt carries the capture outcome and any archive notice or refusal message, beside one another. The progress record's fields stay as the capture progress shape defines them.
2. In step 1, run setup's backup and restore requests through archive. Back up to the second folder the person picks. Run restore in the order the command list gives: list, pick, preview that backup, confirm, receipt. Return the backup list from archive to setup as the first part of the restore preview. This is the one stated exception to reads going through queries. If the evidence folder location is neither empty nor a matching retry, setup supplies a new empty folder through the set folder locations command before the preview.
3. Read the saved decisions and receipts that archive returns and hand them to state. Record restore progress in state and complete the restore only after state reports that it accepted those records. Until then, block capture and other archive writes. Do not block a retry of that restore or setting the folder locations, so the person can always pick a new empty folder. A restore copies beside the destination and moves the copy into place only when it is complete, so a stopped copy never leaves the destination partly filled. A leftover from a stopped copy is reported and left alone.
4. Show a preview before each write and return a command receipt afterward, as the command list defines. A preview writes nothing. A command receipt is shown to the person and is not saved in the archive. Neither holds a token, client secret, sign-in code, or message body. When setup passes a stop, pass it to capture, then close the writer.

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

A contributor runs setup, mail capture, backup, and restore with synthetic data. Each write shows a preview and returns a command receipt. The preview changes no file. Setup receives the backup list as the first part of the restore preview. State receives a progress report at the start, during the run and at the end, and the decisions and receipts returned by archive. Capture and other archive writes are refused until state accepts the restored records. A connect leaves the archive unchanged, and a connect during a run is refused. A start from an agent lists, fetches and saves nothing and records no run. The writer is opened here before state is told the run has started, folder settings are not passed to capture, and the writer is closed in every ending. The write-block question is asked before a write, and until restore is joined the answer is no. A later catch-up uses the same capture command. A preview and a receipt hold no token, client secret, sign-in code, or message body.

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
