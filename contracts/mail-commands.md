# Mail commands

Part of the [command list](command-list.md), version 2. Connect mailbox and Start mail capture.

## Connect mailbox

Connecting stores a sign-in through connections. It does not open the archive and it does not write an original. Step 1 connects Gmail with read-only access. A successful connect makes a new connection ID. Connecting again replaces the one connection, and the receipt names the account label that was replaced. A failed connect keeps the earlier connection and its ID. Saved mail is left as it is. A connect is not refused while a capture is running.

| Refusal | What was found | Passes when |
| --- | --- | --- |
| `provider-unsupported` | The provider is not `gmail`. Nothing was connected | The receipt is this name, and the earlier connection is unchanged |
| `client-file-unavailable` | The client file could not be read. Nothing was connected | The receipt is this name, and the earlier connection is unchanged |
| `vault-unavailable` | The credential vault could not be read or written. Nothing was stored in a file | The receipt is this name, no new file exists, and the earlier connection is unchanged |
| `sign-in-refused` | Read-only access was not granted. Nothing was connected | The receipt is this name, and the earlier connection is unchanged |

## Start mail capture

The same command starts the first capture and any later catch-up. The surface tells commands who is asking: a person or an agent. Commands refuses a start from an agent. A refused start lists nothing, fetches nothing, saves nothing, and records no run. Commands learns the current connection from connection status. It refuses a start when there is no connection or the state is `needs-sign-in`. A connection that is `connected` is not refused because an earlier fetch was `unavailable`.

Commands asks state whether writes are blocked before it runs. It opens the archive writer first. Only then does it tell state that a run has started, and it passes the connection ID, the requested set, and the writer to capture. Capture is not given folder settings. Commands passes each progress report from capture to state. Commands closes the writer only after capture has returned its final outcome, in every ending. If the archive or the writer does not open, capture does not start, and the receipt returns the archive's result name and message.

The run ID and the start time are the ones the [commands](../modules/commands/CONTEXT.md) contract creates, and the same values are given to state and to capture. Stopping is part of this command, not a separate command. The outcome is a capture progress status. How a stop is handled is drafted in the [mail run](../modules/commands/mail-run.md). The receipt carries the outcome, any notice capture hands over from a save, and any notice from opening the archive.

| Refusal | What was found | Passes when |
| --- | --- | --- |
| `capture-set-invalid` | The input was not exactly one of a limit, an after-date, or all | The receipt is this name, and no run is recorded |
| `connection-not-connected` | There is no connection, the state is `needs-sign-in`, or that connection is not the current one | The receipt is this name, and no run is recorded. A `connected` connection is not refused after a fetch returned `unavailable` |
| `not-started-by-person` | The asker is an agent | Nothing is listed, fetched or saved, and no run is recorded |
| `writes-blocked` | State answered that writes are blocked | The receipt is this name, and no run is recorded |

Until restore is joined to the write-block question, state answers no, so `writes-blocked` is not returned. The unfinished-restore block in the command list is unchanged.

| Rule | Passes when |
| --- | --- |
| **Connect writes nothing in the archive.** | A refused or completed connect leaves the evidence folder unchanged, and a vault failure leaves no new file. |
| **New connection ID.** | A successful connect returns a new connection ID. A failed connect keeps the earlier connection and its ID. |
| **Not refused during a run.** | Connect mailbox while a capture is running is not refused. That run's next fetch returns `connection-not-current`, and the run ends `failed`. |
| **One set.** | Start mail capture is refused with `capture-set-invalid` unless the input is exactly one of a limit, an after-date, or all. |
| **A person starts it.** | Follows the commands rule. A start from an agent is refused with `not-started-by-person`. Nothing is listed, fetched or saved, and no run is recorded. |
| **Writer.** | Follows the commands rule. The writer is opened before state is told the run has started, and closed only after capture returns its final outcome. When the archive or the writer does not open, the receipt uses the archive's result name and message. |
| **Receipt beside the outcome.** | The receipt carries the outcome, any notice capture handed over from a save, and any notice from opening. The progress record's fields are unchanged. |
