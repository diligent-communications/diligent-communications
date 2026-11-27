---
build_step: 1 to 2
status: draft
consumes: ["../archive/CONTEXT.md","../capture/CONTEXT.md","../connections/CONTEXT.md","../state/CONTEXT.md","../../contracts/command-list.md","../../contracts/saved-decision.md","../../contracts/action-receipt.md","../../contracts/capture-progress.md","../attachments/CONTEXT.md","../brief/CONTEXT.md","../calendar/CONTEXT.md","../contacts/CONTEXT.md","../effects/CONTEXT.md"]
produces: ["Write command catalog","Write previews","Command receipts","Backup list for setup","Capture and restore progress for state","Restored decisions and receipts for state"]
writes: ["../archive/CONTEXT.md","../capture/CONTEXT.md","../connections/CONTEXT.md","../state/CONTEXT.md","../brief/CONTEXT.md","../effects/CONTEXT.md"]
---
# commands — Preview and make changes

## Step 1 (complete)

### Inputs

- Working: The capture outcome from capture, the write-block answer from state, the backup list, restore preview, and restored decisions and receipts from archive, and the restore result from state.
- Reference: [archive](../archive/CONTEXT.md)
- Reference: [capture](../capture/CONTEXT.md)
- Reference: [connections](../connections/CONTEXT.md)
- Reference: [state](../state/CONTEXT.md)
- Reference: [Command list](../../contracts/command-list.md)
- Reference: [Saved decision](../../contracts/saved-decision.md)
- Reference: [Action receipt](../../contracts/action-receipt.md)
- Reference: [Capture progress](../../contracts/capture-progress.md)

### Process

1. Use the evidence folder through archive. Before any write, ask state whether writes are blocked. Until restore is joined to that question, the answer is no. The unfinished-restore block below is unchanged. At setup's request, set the evidence and backup folder locations in archive, and connect the mailbox through connections. Connecting does not write to the archive. When a person asks, start a mail capture through capture, including a later catch-up. Refuse a start that did not come from a person. Open the archive writer and pass it to capture without folder settings. Record capture progress in state from the outcome capture returns.
2. In step 1, run setup's backup and restore requests through archive. Back up to the second folder the person picks. Run restore in the order the command list gives: list, pick, preview that backup, confirm, receipt. Return the backup list from archive to setup as the first part of the restore preview. This is the one stated exception to reads going through queries. If the evidence folder location is neither empty nor a matching retry, setup supplies a new empty folder through the set folder locations command before the preview.
3. Read the saved decisions and receipts that archive returns and hand them to state. Record restore progress in state and complete the restore only after state reports that it accepted those records. Until then, block capture and other archive writes. Do not block a retry of that restore or setting the folder locations, so the person can always pick a new empty folder. A restore copies beside the destination and moves the copy into place only when it is complete, so a stopped copy never leaves the destination partly filled. A leftover from a stopped copy is reported and left alone.
4. Show a preview before each write and return a command receipt afterward, as the command list defines. A command receipt is shown to the person and is not saved in the archive.

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

A contributor runs setup, mail capture, backup, and restore with synthetic data. Each write shows a preview and returns a command receipt. Setup receives the backup list as the first part of the restore preview. State receives capture and restore progress and the decisions and receipts returned by archive. Capture and other archive writes are refused until state accepts the restored records. A connect leaves the archive unchanged. A capture start that did not come from a person is refused. The writer is opened here, and folder settings are not passed to capture. The write-block question is asked before a write, and until restore is joined the answer is no. A later catch-up uses the same capture command.

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
