Draft. Finished with this module's code. The commands seam states the operations and the hard rules. Where this page disagrees with a hard rule, the hard rule stands.

# Mail run

How commands runs Connect mailbox and Start mail capture. The named refusals and their pass conditions are in [mail commands](../../contracts/mail-commands.md).

Connect the mailbox through [connections](../connections/CONTEXT.md). Connecting does not write to the archive. A connect is not refused because a capture is running. The run's connection ID is the protection: once a new connection replaces it, that run's next fetch returns `connection-not-current` and the run ends as `failed`.

Commands learns the current connection from [connection status](../../contracts/connection-status.md). The surface tells who is asking, a person or an agent. Commands refuses Start mail capture from an agent, and then nothing is listed, fetched or saved and no run is recorded. It also refuses a start when there is no connection or the state is `needs-sign-in`.

For a person's start, including a later catch-up, commands opens the archive writer first. Only then does it tell [state](../state/CONTEXT.md) that a run has started. It passes the connection ID, the requested set and the writer to [capture](../capture/CONTEXT.md), without folder settings. It passes each progress report from capture to state. It closes the writer only after capture has returned its final outcome, in every ending, including a stop.

A stop comes from setup with its reason: the person asked, or progress could not be recorded. Commands passes that reason to capture and waits for the outcome. When the person asked, the outcome status is `stopped`. When progress could not be recorded, the outcome status is `failed` with that cause. What is saved stays saved.

Capture hands commands, beside the outcome, any notice a save returned. The receipt carries those notices, any notice from opening the archive, and, when the archive would not open, the archive's result name and message. The progress record's fields do not change.

| Rule | Passes when |
| --- | --- |
| **Connect during a run.** | Connect mailbox is not refused while a capture is running. The running capture's next fetch then returns `connection-not-current`, and that run ends `failed`. |
| **Writer after the outcome.** | The writer is still open while capture is finishing a stop, and it is closed only after capture returns, including when progress could not be recorded. |
| **Save notices.** | A notice returned by a save is on the receipt beside the outcome, and the progress record has no notice field. |
