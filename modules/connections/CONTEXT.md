---
build_step: 1
consumes: ["../../contracts/connection-status.md","../../contracts/command-list.md","../../contracts/mail-commands.md","fetch.md"]
produces: ["Account connection status","Authorized connection access"]
---
# connections — Keep account sign-ins in one place

## Inputs

- Working: None in this planning repository.
- Reference: [Connection status](../../contracts/connection-status.md)
- Reference: [Command list](../../contracts/command-list.md)
- Reference: [Mail commands](../../contracts/mail-commands.md)
- Reference: [Fetch](fetch.md)

## Process

1. Connect the mailbox when a person asks through commands. Inputs are the provider, `gmail`, and the client file the person downloaded. A successful connect returns a new connection ID and the account label. Connecting again replaces that connection, and the receipt names the account label that was replaced. A failed connect keeps the earlier connection and its ID and returns one of `provider-unsupported`, `client-file-unavailable`, `vault-unavailable` or `sign-in-refused`, as [mail commands](../../contracts/mail-commands.md) names them. Saved mail is left as it is. Connecting does not write to the archive. A connect is not refused while a capture is running. Step 1 keeps one connection, with read-only access. Each person uses a Google project they create. This module does not ship a shared sign-in identity.
2. Keep the sign-in in Windows Credential Manager. A pinned package will be added, and only this module will use it. No other module imports that package. If the vault cannot be read or written, the result is `vault-unavailable` and nothing is written to a file. There is no plain-file fallback. Another operating system's vault is not part of this step.
3. Only this module holds or reads a sign-in. Capture never receives a token. Nothing secret is placed in status, progress, a preview, a receipt, a log or an error message. The connection record that holds no secret (the connection ID, provider and account label) follows [state's rule](../state/CONTEXT.md) for records that only describe what the program is doing.
4. Offer capture two operations. Both take the run's connection ID. Once that connection is no longer the current one, both return `connection-not-current` and do nothing else. Capture's rule says that ends the run as failed. `fetchMail` also takes an address and returns one of `fetched` (the response bytes), `gone`, `rate-limited` (and the provider's wait when it gives one), `needs-sign-in`, `unavailable`, `vault-unavailable`, `refused-address` or `connection-not-current`. Mail is read with read-only permission, over HTTPS, from the provider's mail API host only. Any other address, including a redirect, is `refused-address`, and the sign-in is not attached. The account-number operation returns the account number in [capture's source-ID rule](../capture/CONTEXT.md), or `connection-not-current`, or `vault-unavailable`. The number contains no mail address. Only `needs-sign-in` changes connection state, and only when the provider rejects the sign-in. `unavailable` is a network or provider failure and leaves the state unchanged. How many times a fetch is tried is drafted in [fetch](fetch.md).
5. Expose connection status to commands and to queries, without the sign-in. The lasting states are `connected` and `needs-sign-in`, as [connection status](../../contracts/connection-status.md) says. Commands uses it to learn the current connection.

## Outputs

- Account connection status
- Authorized connection access

## Check

A contributor traces sign-in setup and use and verifies that only connections stores sign-in details. A second successful connect leaves one current connection, with a new ID, and names the replaced account label. A failed connect keeps the earlier connection and its ID. A vault that cannot be read or written writes no file. `fetchMail` takes the run's connection ID, uses HTTPS and the provider's host only, and returns no sign-in material. The account number given to capture contains no mail address.

| Rule | Passes when |
| --- | --- |
| **One connection.** | A successful second connect leaves one current connection with a new ID, the receipt names the replaced account label, and saved mail is unchanged. A failed connect keeps the earlier ID. A connect during a capture is not refused. |
| **Vault only.** | Sign-in material is found only in the vault. A vault failure leaves no new file. No other module imports the package. The connection record follows state's rule for records that only describe what the program is doing. |
| **Sign-in stays here.** | Only this module holds or reads a sign-in. Capture receives no token. A vault failure writes no file and uses no plain-file fallback. Connection status, capture progress, a preview, a receipt, a log and an error message contain no token, client secret or sign-in code. |
| **Read only, HTTPS, provider host.** | `fetchMail` uses read-only permission, HTTPS, and the provider's mail API host only. Any other address, including a redirect, is `refused-address`, and the sign-in is not attached. |
| **One name for the vault.** | A vault that cannot be read or written is `vault-unavailable` on connect, on `fetchMail` and on the account-number call. No other name is used for it. |
| **fetchMail.** | The call takes the run's connection ID. The result is one of the names in the process above, and it contains no sign-in material. |
