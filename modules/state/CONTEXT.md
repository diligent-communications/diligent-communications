---
build_step: 1 to 2
status: draft
consumes: ["../../contracts/saved-decision.md","../../contracts/action-receipt.md","../../contracts/capture-progress.md"]
produces: ["Capture and restore progress","Restored workflow state","Restore result for commands","Write block answer for commands","Committed workflow state","Saved decisions and action receipts"]
writes: ["../archive/CONTEXT.md"]
---
# state — Hold live workflow state

## Step 1 (complete)

Step 1 has no live producer of decisions or receipts. State starts producing them in step 2. In step 1, the archive's ability to accept them is proven with made-up records.

### Inputs

- Working: Capture and restore progress from commands, and saved decisions and receipts passed in by the restore command.
- Reference: [Saved decision](../../contracts/saved-decision.md)
- Reference: [Action receipt](../../contracts/action-receipt.md)
- Reference: [Capture progress](../../contracts/capture-progress.md)

### Process

1. Record the capture and restore progress that commands sends in transactions. Make it available to queries.
2. Receive saved decisions and receipts from the restore command and rebuild live state from them transactionally. Report acceptance or failure of those records back to commands. During restore, keep an approval without a receipt out of automatic dispatch. Hold it for a provider check or return it for approval.
3. Keep the capture progress record in the program's local data folder, outside the evidence folder and the backup folder. It uses the capture progress shape. A damaged file, or a newer version, is reported and left unchanged. When a new run is recorded and the previous record is still `running`, mark that previous record `interrupted`. When commands asks whether writes are blocked, answer no until restore is joined to that question.

### Outputs

- Capture and restore progress
- Restored workflow state
- Restore result for commands
- Write block answer for commands

### Check

A contributor interrupts a synthetic progress write and a restore mid-write, restarting after each interruption to verify that no partial progress or restored records remain. The contributor also verifies that completed progress is available to queries, state reports the restore result to commands, and restored approvals without receipts are held. A damaged or newer progress file is left unchanged. A previous `running` record becomes `interrupted` when a new run is recorded. The write-block answer is no.

| Rule | Passes when |
| --- | --- |
| **Outside the archive.** | The progress file is in the local data folder, and it is not in the evidence folder or the backup folder. |
| **Left alone.** | A damaged file, or a newer version, is reported and its bytes are unchanged. |
| **Interrupted.** | Recording a new run marks a previous `running` record `interrupted`. |
| **Writes blocked.** | The answer to commands is no until restore is joined to the question. |

## Step 2 (draft)

### Process

1. Hold the queue, approvals, review progress, proposed events, and live receipts transactionally. Save lasting choices, including reviews, contact merges and their reversals, approvals, saved views, and calendar accept or decline decisions, as readable decision records in archive. Save action receipts there too.
2. Preserve completed actions and reconcile uncertain outcomes before retrying.

### Outputs

- Committed workflow state
- Saved decisions and action receipts
- Handoff: [archive](../archive/CONTEXT.md)

### Check

A contributor interrupts a synthetic queue update and verifies after restart that nothing is half done.
