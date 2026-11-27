# Query list

Follow the [version rule](CONTEXT.md#version-rule).

The shared list of reads with their inputs and result shapes. Version 1. Adding or changing a query raises the version.

Version 1 is folder status, connection status, and capture progress. Reading restore progress stays as the queries and state contracts already describe. This version does not add a shape for it.

| Query | Inputs | Result |
| --- | --- | --- |
| Folder status | None. The saved folder locations are used | The folder status archive reports |
| Connection status | None | The [connection status](connection-status.md), or `none-connected` |
| Capture progress | None | One of: `none-recorded`; the latest [capture progress](capture-progress.md) record; `progress-damaged`; or `progress-newer` |

These reads do not start a capture and do not write to the archive.

| Rule | Passes when |
| --- | --- |
| **Same answers.** | Folder status, connection status, and capture progress match what archive, connections, and state report. |
| **Later runs.** | Capture progress is returned for a later run, not only the first. |
| **Reads only.** | None of the three starts a capture or writes an original. |
| **Always an answer.** | With no run the result is `none-recorded`. A readable record returns the latest one. A damaged file returns `progress-damaged`. A newer version returns `progress-newer`. |
