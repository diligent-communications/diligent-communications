# Capture progress

Follow the [version rule](CONTEXT.md#version-rule).

The capture outcome capture returns, and the progress record state keeps, are this shape. Version 1. It holds no subject, sender, body, or token.

| Field | Meaning |
| --- | --- |
| `progress_version` | 1 |
| `run_id` | ID of this run |
| `connection_id` | The connection the run used |
| `requested_set` | The set that was asked for. See below |
| `status` | `running`, `complete`, `incomplete`, `stopped`, `failed` or `interrupted` |
| `listed`, `saved`, `already_held`, `differing`, `skipped`, `gone`, `failed` | Counts. See below |
| `last_problem` | Name of the last problem. Omitted when there is none |
| `started_at`, `updated_at` | When the run started, and when this record was last written. UTC |
| `ended_at` | When the run ended. Omitted while `running` |

`requested_set` is exactly one of: `limit` with a whole number greater than zero, `after-date` with a UTC date, or `all`.

Each listed item is counted in exactly one of `saved`, `already_held`, `skipped`, `gone` or `failed`. `differing` counts items already inside `already_held` whose bytes were reported as different. It is not a sixth place for an item.

| Status | When it is used |
| --- | --- |
| `running` | The run has started and has not ended |
| `complete` | The run reached the end of its requested list, and `failed` is zero |
| `incomplete` | The run reached the end of its requested list, and `failed` is not zero |
| `stopped` | The person stopped the run |
| `failed` | The run stopped before the end of the list because the archive writer or the connection stopped it |
| `interrupted` | A later recording found this run still `running` |

A run is complete only when its status is `complete`: it reached the end of its requested list, and every listed item was saved, already held, deliberately skipped, or gone. That says nothing about mail that arrived during the run.

Progress shows what happened. Whether an item is held does not depend on this record.

| Rule | Passes when |
| --- | --- |
| **No message content.** | The record has no subject, sender, body, or token. |
| **One set.** | `requested_set` is exactly one of the three forms above. |
| **Complete.** | Status is `complete` only when the list ended and every listed item is saved, already held, skipped, or gone. |
| **Not a source of truth.** | An item is not treated as held, or skipped, because of this record alone. |
