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

`requested_set` is written as exactly one of `limit:<whole number>`, `after-date:<YYYY-MM-DD>`, or `all`. The number is greater than zero. A limit is that many items taken from the list, in the provider's order. Items that are already held, skipped or gone use up the limit. `all` is the whole list. An after-date includes that UTC day. The date used is the date the provider records for the message. A date that appears only in the message text does not select it.

An item is counted when its handling ends, in exactly one of `saved`, `already_held`, `differing`, `skipped`, `gone` or `failed`. `listed` is the sum of those six. An item still in hand when a run stops or fails is not counted. `already_held` and `differing` never both count one item: bytes that differ count only as `differing`, and bytes that do not differ, or could not be compared, count only as `already_held`. Which result leads to which count is specified in the [mail lane](../modules/capture/mail.md).

| Status | When it is used |
| --- | --- |
| `running` | The run has started and has not ended |
| `complete` | The run reached the end of its requested list, and `failed` is zero |
| `incomplete` | The run reached the end of its requested list and `failed` is not zero, or the same request was still `rate-limited` or `unavailable` after its tries |
| `stopped` | The person asked to stop the run |
| `failed` | The run ended for a named cause other than the person asking: a lookup or save result that stops the run, a fetch result that stops the run, five messages in a row that could not be decoded, or progress that could not be recorded |
| `interrupted` | A new run, already holding the writer, found this record still `running` |

A run is complete only when its status is `complete`: it reached the end of its requested list, `failed` is zero, and every listed item was saved, already held, differing, deliberately skipped, or gone. That says nothing about mail that arrived during the run.

Progress shows what happened. Whether an item is held does not depend on this record.

| Rule | Passes when |
| --- | --- |
| **No message content.** | The record has no subject, sender, body, or token. |
| **One set.** | `requested_set` is exactly one of the three forms above. |
| **Complete.** | Status is `complete` only when the list ended, `failed` is zero, and every listed item is saved, already held, differing, skipped, or gone. |
| **Not a source of truth.** | An item is not treated as held, or skipped, because of this record alone. |
| **Listed.** | `listed` is the sum of the six counts. No item is in two of them. An item still in hand when the run stops or fails is in none of them. |
| **Limit.** | `limit:10` stops after ten items whose handling ended, including items that were already held, skipped or gone. It does not continue in order to save ten new ones. |
| **After-date.** | A message the provider dates on that UTC day is included. A date that appears only in the message text does not select it. |
