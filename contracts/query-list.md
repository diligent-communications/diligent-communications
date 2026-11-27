# Query list

Follow the [version rule](CONTEXT.md#version-rule).

The shared list of reads with their inputs and result shapes. Version 1. Adding or changing a query raises the version.

Version 1 is folder status, connection status, and capture progress. Reading restore progress stays as the queries and state contracts already describe. This version does not add a shape for it.

| Query | Inputs | Result |
| --- | --- | --- |
| Folder status | None. The saved folder locations are used | The folder status archive reports |
| Connection status | None | The [connection status](connection-status.md), or `none-connected` |
| Capture progress | None | `none-recorded` when no run has been recorded. Otherwise the latest readable [capture progress](capture-progress.md) record and the one before it, plus a note for any progress file that is damaged or from a newer version |

These reads do not start a capture and do not write to the archive.

| Rule | Passes when |
| --- | --- |
| **Same answers.** | Folder status, connection status, and capture progress match what archive, connections, and state report. |
| **Later runs.** | Capture progress is returned for a later run, not only the first. |
| **Reads only.** | None of the three starts a capture or writes an original. |
| **Always an answer.** | With no run the result is `none-recorded`. Otherwise it returns the latest readable record and the one before it. A damaged or newer file is named in a note and left unchanged, and it does not block a capture. |
