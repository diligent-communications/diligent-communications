# Backup and restore

Part of the commands seam. The archive's own operations are [archive](../archive/CONTEXT.md).

In step 1, run setup's backup and restore requests through archive. Back up to the second folder the person picks. Run restore in the order the command list gives: list, pick, preview that backup, confirm, receipt. Return the backup list from archive to setup as the first part of the restore preview. This is the one stated exception to reads going through queries. If the evidence folder location is neither empty nor a matching retry, setup supplies a new empty folder through the set folder locations command before the preview.

Read the saved decisions and receipts that archive returns and hand them to state. Record restore progress in state and complete the restore only after state reports that it accepted those records. Until then, block capture and other archive writes. Do not block a retry of that restore or setting the folder locations, so the person can always pick a new empty folder. A restore copies beside the destination and moves the copy into place only when it is complete, so a stopped copy never leaves the destination partly filled. A leftover from a stopped copy is reported and left alone.

| Rule | Passes when |
| --- | --- |
| **Restore progress.** | State receives the restore progress and the decisions and receipts returned by archive before the restore is complete. |
| **Writes wait.** | Capture and other archive writes are refused until state accepts the restored records. Retrying that restore and setting the folder locations are not refused. |
