---
build_step: 1 to 2
status: draft
consumes: ["../../contracts/saved-decision.md","../../contracts/action-receipt.md","../../contracts/capture-progress.md","../../contracts/query-list.md"]
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
- Reference: [Query list](../../contracts/query-list.md)

### Process

1. Record the capture and restore progress that commands sends in transactions. Make it available to queries.
2. Receive saved decisions and receipts from the restore command and rebuild live state from them transactionally. Report acceptance or failure of those records back to commands. During restore, keep an approval without a receipt out of automatic dispatch. Hold it for a provider check or return it for approval.
3. Keep capture progress in the program's local data folder, outside the evidence folder and the backup folder. Write each run to its own file, named by the run ID, and never overwrite another run's file. Each file uses the capture progress shape. Commands tells state a run has started only after the writer is open, then passes each later report. Mark a record `interrupted` only when a new run, already holding the writer, finds that record still `running`. A damaged file, or a newer version, is reported and left unchanged. It never blocks a capture, and there is no choice to replace it. If writing progress fails during a run, tell commands that progress could not be recorded. What is saved stays saved. When commands asks whether writes are blocked, answer no until restore is joined to that question. The capture progress query answers as the query list says: `none-recorded`, or the latest readable record and the one before it, plus a note for any file that is damaged or from a newer version.

### Outputs

- Capture and restore progress
- Restored workflow state
- Restore result for commands
- Write block answer for commands

### Check

A contributor interrupts a synthetic progress write and a restore mid-write, restarting after each interruption to verify that no partial progress or restored records remain. The contributor also verifies that completed progress is available to queries, state reports the restore result to commands, and restored approvals without receipts are held. A damaged or newer progress file is left unchanged and does not block a capture. Each run has its own file. A previous `running` record becomes `interrupted` only when a new run already holds the writer. The write-block answer is no until restore is joined to the question.

| Rule | Passes when |
| --- | --- |
| **Outside the archive.** | Each run's file is in the local data folder, named by the run ID, and it is not in the evidence folder or the backup folder. A new run does not overwrite another run's file. |
| **Left alone.** | A damaged file, or a newer version, is named in the query's note and its bytes are unchanged. A capture is not refused because of it. |
| **Two records.** | The query returns `none-recorded`, or the latest readable record and the one before it. |
| **Interrupted.** | A record becomes `interrupted` only when a new run, already holding the writer, finds it still `running`. |
| **Writes blocked.** | The answer to commands is no until restore is joined to the question. |
| **Progress write failed.** | A failed progress write during a run reports `progress-not-recorded`. Saved originals stay saved. |

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
