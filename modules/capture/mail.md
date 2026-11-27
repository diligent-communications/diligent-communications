# Mail

The mail lane of capture. Commands passes the connection ID, the requested set and the open archive writer. This lane holds no rule about who started the run. Do not read folder settings. Do not close the writer. Run only where the archive can open a writer.

1. Ask connections for the account number of that connection ID, as [fetch](../connections/fetch.md) defines. The source ID is the exact text `mail:gmail:`, then that account number, then `:`, then the message ID. Nothing is trimmed or folded. The account number is not a mail address, and the source ID holds no mail address. `connection-not-current` ends the run as `failed` with that name.
2. Take received, sent and archived mail. Do not take Spam, Trash, drafts or chat messages. A listed item of a kind that is left out is skipped. The requested set is the form in the [capture progress](../../contracts/capture-progress.md) record. An after-date includes that UTC day and uses the date the provider records for the message.
3. On every run, list the mailbox from the top. Save no bookmark. `listed` counts items taken from the list so far. For each listed item, call `sourceHeld`. Fill the counts from the table below.
4. Ask connections for each provider read through `fetchMail`, passing the run's connection ID. Do not take a token or any other sign-in material. When the result is `rate-limited` and it carries a wait, wait that long before the next fetch. The payload is the raw message decoded exactly from the response, not the response body, with media type `message/rfc822`.
5. A run is complete only when it reached the end of its requested list and every listed item was saved, already held, deliberately skipped, or gone from the mailbox. That is status `complete`. Do not use the progress record to decide what is held. When commands passes a stop, return status `stopped`. Originals already saved stay saved. Report progress to commands at the start, at intervals and at the end.

| Result | What the count does |
| --- | --- |
| Lookup `not-held` | The only lookup result that leads to a download |
| Lookup `held` | Count `already_held`. Do not download |
| Any other lookup result | Do not download. End the run as `failed` with that result's name |
| Save `saved-original` | Count `saved` |
| Save `already-held` | Count `already_held`, and also `differing` when the bytes differ |
| Any other save result | End the run as `failed` with that result's name |
| Fetch `fetched` | Decode the raw message from the response and save it |
| Fetch `gone` | Count `gone` and go on |
| Fetch or decode failure | Count `failed` and go on. Five listed items in a row end the run as `failed` |
| `connection-not-current` | End the run as `failed` with that name. Fetch nothing further |

| Rule | Passes when |
| --- | --- |
| **Only not held downloads.** | `held` counts `already_held` and downloads nothing. Any other lookup result downloads nothing and the run is `failed` with that name. |
| **Save counts.** | `saved-original` counts `saved`. `already-held` counts `already_held`, and `differing` only when the bytes differ. Any other save result ends the run as `failed` with that name. |
| **Decoded payload.** | The saved bytes are the raw message decoded exactly from the response, not the response body. |
| **Five in a row.** | One item that cannot be fetched or decoded counts `failed` and the run goes on. The fifth in a row ends the run. |
| **The provider's wait.** | A `rate-limited` result that carries a wait is the wait used before the next fetch. A result with no wait adds none. |
| **Where it runs.** | A system where the archive cannot open a writer starts no run and saves nothing. |
| **Reports during the run.** | Commands receives a progress report at the start, at an interval and at the end. |
