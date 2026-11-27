# Mail commands

Part of the [command list](command-list.md), version 2. Connect mailbox and Start mail capture.

## Connect mailbox

Connecting stores a sign-in through connections. It does not open the archive and it does not write an original. Step 1 connects Gmail with read-only access. A successful connect makes a new connection ID. Connecting again replaces the one connection, and the receipt names the account label that was replaced. A failed connect keeps the earlier connection and its ID. Saved mail is left as it is. Commands refuses this command while a capture run is active.

| Refusal | What was found | Passes when |
| --- | --- | --- |
| `provider-unsupported` | The provider is not `gmail`. Nothing was connected | The receipt is this name, and the earlier connection is unchanged |
| `client-file-unavailable` | The client file could not be read. Nothing was connected | The receipt is this name, and the earlier connection is unchanged |
| `vault-unavailable` | The credential vault could not be read or written. Nothing was stored in a file | The receipt is this name, no new file exists, and the earlier connection is unchanged |
| `sign-in-refused` | Read-only access was not granted. Nothing was connected | The receipt is this name, and the earlier connection is unchanged |
| `capture-active` | A capture run is active. Nothing was connected | The receipt is this name, and the current connection ID is unchanged |

## Start mail capture

The same command starts the first capture and any later catch-up. The surface tells commands who is asking: a person or an agent. Commands refuses a start from an agent. A refused start lists nothing, fetches nothing, saves nothing, and records no run. Commands learns the current connection from connection status. It asks state whether writes are blocked before it runs. It opens the archive writer first. Only then does it tell state that a run has started, and it passes the connection ID, the requested set, and the writer to capture. Capture is not given folder settings. Commands passes each progress report from capture to state. Commands closes the writer in every ending. If the archive or the writer does not open, capture does not start, and the receipt returns the archive's result name and message. A damaged or newer progress file is not overwritten. A new capture is refused until the person chooses to replace a damaged file. That choice keeps the old file beside the new one under another name. If writing progress fails during a run, what is saved stays saved, the run stops, and the receipt says progress could not be recorded.

The person stops a run from setup. Setup passes the stop to commands, and commands passes it to capture. Stopping is part of this command, not a separate command. The receipt is then the capture outcome with status `stopped`, plus any archive notice. Originals already saved stay saved. Commands closes the writer.

| Refusal | What was found | Passes when |
| --- | --- | --- |
| `capture-set-invalid` | The input was not exactly one of a limit, an after-date, or all | The receipt is this name, and no run is recorded |
| `connection-not-connected` | That connection is not the current one, or its state is not `connected` | The receipt is this name, and no run is recorded |
| `not-started-by-person` | The asker is an agent | Nothing is listed, fetched or saved, and no run is recorded |
| `writes-blocked` | State answered that writes are blocked | The receipt is this name, and no run is recorded |
| `progress-damaged` | The progress file is damaged, and the person has not chosen to replace it | The file is unchanged, and no run is recorded |
| `progress-newer` | The progress file is a newer version | The file is unchanged, and no run is recorded |

Until restore is joined to the write-block question, state answers no, so `writes-blocked` is not returned. The unfinished-restore block in the command list is unchanged. The result `progress-not-recorded` is not a refusal before the start. It is the receipt when a progress write fails during the run.

| Rule | Passes when |
| --- | --- |
| **Connect writes nothing in the archive.** | A refused or completed connect leaves the evidence folder unchanged, and a vault failure leaves no new file. |
| **New connection ID.** | A successful connect returns a new connection ID. A failed connect keeps the earlier connection and its ID. |
| **No connect during a run.** | Connect mailbox during an active run returns `capture-active`, and the connection ID is unchanged. |
| **One set.** | Start mail capture is refused with `capture-set-invalid` unless the input is exactly one of a limit, an after-date, or all. |
| **A person starts it.** | A start from an agent is refused with `not-started-by-person`. Nothing is listed, fetched or saved, and no run is recorded. |
| **Stop.** | Setup passes the person's stop to commands, commands passes it to capture, the receipt status is `stopped`, and originals saved before the stop are still held. |
| **Writer.** | Commands opens the writer before it tells state the run has started. Capture starts only with that writer. Commands closes the writer in every ending. When the archive or the writer does not open, the receipt uses the archive's result name and message. |
| **Receipt beside the outcome.** | A capture receipt carries the outcome and any notice from opening or from a save, and the progress record's fields are unchanged. |
