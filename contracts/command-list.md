# Command list

Follow the [version rule](CONTEXT.md#version-rule).

The shared list of writes with their inputs, previews, and receipts. Version 2. Adding or changing a command raises the version.

Each write shows a preview before it runs and returns a command receipt afterward: a result shown to the person, saying what was done or why it was refused. A command receipt is not an action receipt and is not saved in the archive. Confirm is a part of restore only. A receipt holds no token, client secret, or message body.

Version 2 adds Connect mailbox and Start mail capture, records the inputs version 1 left open, and describes stopping a run. The preview and receipt of Set folder locations, Back up, and Restore are unchanged.

| Command | Inputs | Preview shows | Command receipt returns |
| --- | --- | --- | --- |
| Set folder locations | The evidence folder and the backup folder. When the person has chosen to replace a damaged settings file, that choice is an input too | The evidence folder and backup folder chosen, whether the evidence folder is empty or already an archive, and any warning | The two locations saved, or the reason they were refused |
| Back up | None. The saved folder locations are used | The backup folder, the number of originals, decisions and receipts, the total size, and the free space | The new backup with its time, counts and size, or the reason it failed |
| Restore | The backup the person picks, then confirmation | The backup list, then the picked backup's time, counts, size and archive ID, and the destination evidence folder | The backup restored, its counts, and whether state accepted the restored decisions and receipts, or the reason it failed |
| Connect mailbox | Provider `gmail`, and the path of the client file the person downloaded | The provider, that access is read only, that the sign-in will be kept in Windows Credential Manager, and the current connection if there is one | The connection ID and account label, and the account label that was replaced if a connection was replaced, or a named refusal and that nothing was connected |
| Start mail capture | The connection ID, and exactly one of a limit, an after-date, or all | The account label, the evidence folder and whether an archive would be created there, the requested set, and the kinds left out | The [capture outcome](capture-progress.md) |

A limit is a whole number of listed items, greater than zero. An after-date is a UTC date. All is the whole list. The provider's list order is kept. The kinds left out by the mail lane are still left out.

Restore runs in five parts: list, pick, preview that backup, confirm, receipt.

1. **List.** Commands returns the backup list from archive. It names each backup found in the backup folder with its time, counts, size and archive ID. A backup that is unfinished or cannot be read is listed with the reason and cannot be picked.
2. **Pick.** The person picks one backup from the list.
3. **Preview.** Archive checks the picked backup and returns its restore preview, which commands shows. The destination is the evidence folder location. It must be empty, or hold an unfinished restore of this same backup that matches it exactly. Otherwise setup asks for a new empty folder and sets it through Set folder locations first.
4. **Confirm.** The person confirms, and archive restores the backup.
5. **Receipt.** The restore is complete only after state accepts the restored decisions and receipts. Until then, capture and other archive writes are blocked. The block does not cover retrying that restore or setting the folder locations, so a person can always pick a new empty folder.

The backup list is the first part of the restore preview. It is the one stated exception to the rule that surfaces read through queries. Step 1 has no query for backups.

## Connect mailbox

Connecting stores a sign-in through connections. It does not open the archive and it does not write an original. Step 1 connects Gmail with read-only access. Connecting again replaces the one connection, and the receipt names the account label that was replaced. Saved mail is left as it is.

| Refusal | What was found |
| --- | --- |
| `provider-unsupported` | The provider is not `gmail`. Nothing was connected |
| `client-file-unavailable` | The client file could not be read. Nothing was connected |
| `vault-unavailable` | The credential vault could not be read or written. Nothing was stored in a file |
| `sign-in-refused` | Read-only access was not granted. Nothing was connected |

## Start mail capture

The same command starts the first capture and any later catch-up. It runs only when a person starts it. A start that did not come from a person, including a start from agent access, is refused. Commands asks state whether writes are blocked before it runs, opens the archive writer, and passes that writer to capture. Capture is not given folder settings. If the archive or the writer does not open, capture does not start, and the receipt returns the archive's result name.

The person can stop a run. Stopping is part of this command, not a separate command. The receipt is then the capture outcome with status `stopped`. Originals already saved stay saved.

| Refusal | What was found |
| --- | --- |
| `capture-set-invalid` | The input was not exactly one of a limit, an after-date, or all |
| `connection-not-connected` | That connection is not the current one, or its state is not `connected` |
| `not-started-by-person` | The start did not come from a person |
| `writes-blocked` | State answered that writes are blocked |

Until restore is joined to the write-block question, state answers no, so `writes-blocked` is not returned. The unfinished-restore block already stated above is unchanged.

| Rule | Passes when |
| --- | --- |
| **Old commands.** | Set folder locations, Back up, and Restore take the inputs recorded here, and the preview and receipt text in the table is unchanged. |
| **Connect writes nothing in the archive.** | A refused or completed connect leaves the evidence folder unchanged, and a vault failure leaves no new file. |
| **One set.** | Start mail capture is refused with `capture-set-invalid` unless the input is exactly one of a limit, an after-date, or all. |
| **A person starts it.** | A start that did not come from a person is refused with `not-started-by-person`, and no run is recorded as complete. |
| **Stop.** | After the person stops a run, the receipt status is `stopped`, and originals saved before the stop are still held. |
| **Writer.** | Capture starts only with the writer commands opened. When the archive or the writer does not open, the receipt uses the archive's result name. |
