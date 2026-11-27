Draft. Finished with this module's code. The capture seam states the operations and the hard rules. Where this page disagrees with a hard rule, the hard rule stands.

# Mail

The mail lane of capture. Commands passes the connection ID, the requested set and the open archive writer. This lane holds no rule about who started the run. Do not read folder settings. Do not close the writer. Run only where the archive can open a writer.

1. Ask connections for the account number of that connection ID, as [fetch](../connections/fetch.md) defines. The source ID is the exact text `mail:gmail:`, then that account number, then `:`, then the message ID. Nothing is trimmed or folded. The account number is not a mail address, and the source ID holds no mail address.
2. Take received, sent and archived mail. Do not take Spam, Trash, drafts or chat messages. A listed item of a kind that is left out is skipped. The requested set, including what a limit counts, is defined in the [capture progress](../../contracts/capture-progress.md) record. An after-date includes that UTC day and uses the date the provider records for the message.
3. On every run, list the mailbox from the top. Save no bookmark. Read the list and each message through `fetchMail`, passing the run's connection ID. Do not take a token or any other sign-in material. Apply each fetch result as the table below says. The payload is the raw message decoded exactly from the response, not the response body, with media type `message/rfc822`.
4. For each message whose handling continues, call `sourceHeld`. Only `not-held` leads to a download. Count an item only when its handling ends, in exactly one of the six counts. An item still in hand when the run stops or fails is not counted. `listed` is the sum of those counts.
5. Hand commands, beside the outcome, any notice a save returned. The progress record does not gain a field for it. Report progress to commands at the start, at intervals and at the end.
6. A stop from commands carries its reason. When the person asked, finish or cancel the item in hand, count only items whose handling ended, and return status `stopped`. When progress could not be recorded, return status `failed` with that cause. Originals already saved stay saved.
7. A run is complete only when it reached the end of its requested list and every counted item was saved, already held, differing, deliberately skipped, or gone. That is status `complete`. Do not use the progress record to decide what is held.

## Tries and waits

This is the only place that states how many times a request is tried, and the waits. It applies to reading the list and to reading a message.

A `rate-limited` or `unavailable` result is tried again for the same request, up to three tries. When the result carries a wait, that is the wait before the next try. When it does not, wait one second before the second try and two seconds before the third. If the third try is still `rate-limited` or `unavailable`, the run ends as `incomplete`.

## What each fetch result does

| Result | List read | Message |
| --- | --- | --- |
| `fetched` | The list is handled | The message is decoded and then looked up |
| `gone` | The run ends `failed` with that name. A list is not an item, so nothing is counted | Count `gone` and go on |
| `rate-limited` | Retried as above, then `incomplete` | Retried as above, then `incomplete` |
| `unavailable` | Retried as above, then `incomplete`. The connection state is unchanged | The same |
| `vault-unavailable` | The run ends `failed` with that name. The connection state is unchanged | The same |
| `needs-sign-in` | The run ends `failed` with that name | The same |
| `connection-not-current` | The run ends `failed` with that name | The same |
| `refused-address` | The run ends `failed` with that name | The same |

A message that is fetched but cannot be decoded counts as `failed`, and the run goes on. Five such messages in a row end the run as `failed`.

| Result | What the count does |
| --- | --- |
| Lookup `not-held` | The only lookup result that leads to a download |
| Lookup `held` | Count `already_held`. Do not download |
| Any other lookup result | Do not download and do not count the item. End the run as `failed` with that result's name |
| Save `saved-original` | Count `saved`. Hand commands any notice on the result |
| Save `already-held`, bytes differ | Count `differing` only |
| Save `already-held`, bytes do not differ or could not be compared | Count `already_held` only |
| Any other save result | Do not count the item. End the run as `failed` with that result's name |

| Rule | Passes when |
| --- | --- |
| **Only not held downloads.** | `held` counts `already_held` and downloads nothing. Any other lookup result downloads nothing, counts nothing, and the run is `failed` with that name. |
| **Save counts.** | `saved-original` counts `saved`. `already-held` counts `differing` when the bytes differ, and `already_held` otherwise, never both. Any other save result counts nothing and ends the run as `failed` with that name. |
| **Decoded payload.** | The saved bytes are the raw message decoded exactly from the response, not the response body. |
| **Tries and waits.** | The third `rate-limited` or `unavailable` try of the same request ends the run as `incomplete`. The waits are the ones stated above and nowhere else. |
| **Five in a row.** | One fetched message that cannot be decoded counts `failed` and the run goes on. The fifth in a row ends the run. |
| **Where it runs.** | A system where the archive cannot open a writer starts no run and saves nothing. |
| **Reports during the run.** | Commands receives a progress report at the start, at an interval and at the end, and any notice a save returned, beside the outcome. |
| **Stop reason.** | A stop because the person asked returns `stopped`. A stop because progress could not be recorded returns `failed` with that cause. The item in hand is not counted. |

## Kept starting point

These decisions stay here until the code. They are not the seam.

An item is counted when its handling ends, in exactly one of `saved`, `already_held`, `differing`, `skipped`, `gone` or `failed`. `listed` is the sum of those six. An item still in hand when a run stops or fails is not counted. `already_held` and `differing` never both count one item: bytes that differ count only as `differing`, and bytes that do not differ, or could not be compared, count only as `already_held`.

Items that are already held, skipped or gone use up a limit. `limit:10` stops after ten items whose handling ended, including items that were already held, skipped or gone. It does not continue in order to save ten new ones. A date that appears only in the message text does not select an after-date.

| Status | When it is used |
| --- | --- |
| `running` | The run has started and has not ended |
| `complete` | The run reached the end of its requested list, and `failed` is zero |
| `incomplete` | The run reached the end of its requested list and `failed` is not zero, or the same request was still `rate-limited` or `unavailable` after its tries |
| `stopped` | The person asked to stop the run |
| `failed` | The run ended for a named cause other than the person asking: a lookup or save result that stops the run, a fetch result that stops the run, five messages in a row that could not be decoded, or progress that could not be recorded |
| `interrupted` | A new run, already holding the writer, found this record still `running` |
