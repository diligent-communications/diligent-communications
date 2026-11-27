# Command list

Follow the [version rule](CONTEXT.md#version-rule).

The shared list of writes with their inputs, previews, and receipts. Version 2. Adding or changing a command raises the version.

Each write shows a preview before it runs and returns a command receipt afterward: a result shown to the person, saying what was done or why it was refused. A command receipt is not an action receipt and is not saved in the archive. Confirm is a part of restore only. A preview and a receipt hold no token, client secret, sign-in code, or message body. A preview writes nothing.

Version 2 adds Connect mailbox and Start mail capture, records the inputs version 1 left open, and describes stopping a run. The preview and receipt of Set folder locations, Back up, and Restore are unchanged.

| Command | Inputs | Preview shows | Command receipt returns |
| --- | --- | --- | --- |
| Set folder locations | The evidence folder and the backup folder. When the person has chosen to replace a damaged settings file, that choice is an input too | The evidence folder and backup folder chosen, whether the evidence folder is empty or already an archive, and any warning | The two locations saved, or the reason they were refused |
| Back up | None. The saved folder locations are used | The backup folder, the number of originals, decisions and receipts, the total size, and the free space | The new backup with its time, counts and size, or the reason it failed |
| Restore | The backup the person picks, then confirmation | The backup list, then the picked backup's time, counts, size and archive ID, and the destination evidence folder | The backup restored, its counts, and whether state accepted the restored decisions and receipts, or the reason it failed |
| Connect mailbox | Provider `gmail`, and the path of the client file the person downloaded | The provider, that access is read only, that the sign-in will be kept in Windows Credential Manager, and the current connection if there is one | The new connection ID and account label, and the account label that was replaced if a connection was replaced, or a named refusal and that nothing was connected |
| Start mail capture | Who is asking, a person or an agent; the connection ID; and exactly one of a limit, an after-date, or all. Replacing a damaged progress file is an input only when the person has chosen it | The account label, the evidence folder and whether an archive would be created there, the requested set, and the kinds left out | The [capture outcome](capture-progress.md), any notice from opening the archive or from a save, and, when the archive would not open, the archive's result name and message |

The requested set is written as the [capture progress](capture-progress.md) record defines: `limit:<whole number>`, `after-date:<YYYY-MM-DD>`, or `all`. An after-date includes that UTC day and uses the date the provider records for the message. The provider's list order is kept. The kinds left out by the mail lane are still left out.

A preview reports folder status and does not open the archive, because opening an empty folder creates one. When that status says the evidence folder is empty and no archive is remembered, the preview says an archive would be created. The preview changes no file.

Restore runs in five parts: list, pick, preview that backup, confirm, receipt.

1. **List.** Commands returns the backup list from archive. It names each backup found in the backup folder with its time, counts, size and archive ID. A backup that is unfinished or cannot be read is listed with the reason and cannot be picked.
2. **Pick.** The person picks one backup from the list.
3. **Preview.** Archive checks the picked backup and returns its restore preview, which commands shows. The destination is the evidence folder location. It must be empty, or hold an unfinished restore of this same backup that matches it exactly. Otherwise setup asks for a new empty folder and sets it through Set folder locations first.
4. **Confirm.** The person confirms, and archive restores the backup.
5. **Receipt.** The restore is complete only after state accepts the restored decisions and receipts. Until then, capture and other archive writes are blocked. The block does not cover retrying that restore or setting the folder locations, so a person can always pick a new empty folder.

The backup list is the first part of the restore preview. It is the one stated exception to the rule that surfaces read through queries. Step 1 has no query for backups.

Connect mailbox and Start mail capture, their refusals and their pass conditions are in [mail commands](mail-commands.md).

| Rule | Passes when |
| --- | --- |
| **Old commands.** | Set folder locations, Back up, and Restore take the inputs recorded here, and the preview and receipt text in the table is unchanged. |
| **No secret.** | A preview and a receipt contain no token, client secret, sign-in code, or message body. |
| **Preview writes nothing.** | A preview uses folder status, does not open the archive, and changes no file. When the folder is empty and no archive ID is remembered, the preview says an archive would be created. |
