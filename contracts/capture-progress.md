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

`requested_set` is written as exactly one of `limit:<whole number>`, `after-date:<YYYY-MM-DD>`, or `all`. The number is greater than zero. A limit is that many items taken from the list, in the provider's order. `all` is the whole list. An after-date includes that UTC day and uses the date the provider records for the message. What a limit counts beyond items taken from that list, and which count an item lands in, are drafted in the [mail lane](../modules/capture/mail.md).

`status` is `running`, `complete`, `incomplete`, `stopped`, `failed` or `interrupted`. `complete` is capture's rule: the run reached the end of its requested list and every item was saved, already held, deliberately skipped, or gone. What leads to the other statuses is drafted in that same page.

Progress shows what happened. Whether an item is held does not depend on this record.

| Rule | Passes when |
| --- | --- |
| **No message content.** | The record has no subject, sender, body, or token. |
| **One set.** | `requested_set` is exactly one of the three forms above. A limit is items taken from the list in the provider's order. |
| **Complete.** | Status is `complete` only when capture's rule says the run is complete. |
| **Not a source of truth.** | An item is not treated as held, or skipped, because of this record alone. |
