Draft. Finished with this module's code. The state seam states the operations and the hard rules. Where this page disagrees with a hard rule, the hard rule stands.

# Progress

Write each run to its own file, named by the run ID commands creates, and never overwrite another run's file. Each file uses the capture progress shape. Commands tells state a run has started only after the writer is open, then passes each later report. Mark a record `interrupted` only when a new run, already holding the writer, finds that record still `running`. A damaged file, or a newer version, is reported and left unchanged. It never blocks a capture, and there is no choice to replace it. If writing progress fails during a run, tell commands that progress could not be recorded (`progress-not-recorded`). What is saved stays saved.

The capture progress query answers `none-recorded` when no run has been recorded. Otherwise it returns the latest readable record and the one before it, plus a note for any file that is damaged or from a newer version. A damaged or newer file is left unchanged and does not block a capture.

| Rule | Passes when |
| --- | --- |
| **Left alone.** | A damaged file, or a newer version, is named in the query's note and its bytes are unchanged. A capture is not refused because of it. |
| **Two records.** | The query returns `none-recorded`, or the latest readable record and the one before it. |
| **Interrupted.** | A record becomes `interrupted` only when a new run, already holding the writer, finds it still `running`. |
| **Progress write failed.** | A failed progress write during a run reports `progress-not-recorded`. Saved originals stay saved. |
