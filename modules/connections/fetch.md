Draft. Finished with this module's code. The named results and the hard rules are on the connections seam. Where this page disagrees with a hard rule, the hard rule stands.

# Fetch

`connections` offers these two operations to capture. Both take the run's connection ID. Once that connection is no longer the current one, both return `connection-not-current` and do nothing else.

## fetchMail

The caller passes the run's connection ID and an address. Use HTTPS only, and the provider's mail API host only. Attach the sign-in here. Refuse any other address, including a redirect elsewhere, with `refused-address`, and do not attach the sign-in. The caller receives no sign-in material.

A connection has two lasting states, `connected` and `needs-sign-in`. Only `needs-sign-in` changes the state, and only when the provider rejects the sign-in. `unavailable` is a result of this fetch when the network or the provider failed. It does not change the connection's state. A vault that cannot be read is `vault-unavailable`, the same name as everywhere else, and it does not change the connection's state.

| Result | What was found |
| --- | --- |
| `fetched` | The response bytes. The raw message is decoded from this response, not taken as the response body |
| `gone` | The provider no longer has that message |
| `rate-limited` | The provider asked the caller to wait. The result includes that wait when the provider gives one |
| `needs-sign-in` | The sign-in was rejected. The connection state becomes `needs-sign-in` |
| `unavailable` | The network or the provider failed. The connection state is unchanged |
| `vault-unavailable` | The vault could not be read. The connection state is unchanged |
| `refused-address` | The address was not HTTPS on the provider's mail API host |
| `connection-not-current` | That connection is no longer the current one |

What each result does to the run, including how many times a request is tried, is stated once in the [mail lane](../capture/mail.md).

## Account number

The caller passes the run's connection ID. The result is the account number in capture's source-ID rule, or `connection-not-current`, or `vault-unavailable`. The number contains no mail address and is not a field of connection status.

| Rule | Passes when |
| --- | --- |
| **Tied to the run.** | A fetch or an account-number call without the run's current connection ID returns `connection-not-current` and no bytes and no number. |
| **HTTPS and host.** | An address that is not HTTPS on the provider's mail API host is `refused-address`, including a redirect, and the sign-in is not attached. |
| **Named results.** | A fetch result is one of the names in the table above. Only `needs-sign-in` changes the connection state. `unavailable` and `vault-unavailable` leave it unchanged. |
| **No sign-in in the result.** | The bytes, the wait, the number and the refusal contain no token or client secret. |
