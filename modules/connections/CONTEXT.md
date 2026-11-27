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

1. Connect the mailbox when a person asks through commands. Step 1 keeps one connection, for Gmail, with read-only access. Each person uses a Google project they create. This module does not ship a shared sign-in identity. A successful connect makes a new connection ID. Connecting again replaces that connection. The command receipt names the account label that was replaced, as the command list says. A failed connect keeps the earlier connection and its ID. Saved mail is left as it is. Connecting does not write to the archive. A connect is not refused while a capture is running. The replaced connection makes that run's next fetch return `connection-not-current`.
2. Keep the sign-in in Windows Credential Manager. A pinned package will be added, and only this module will use it. No other module imports that package. If the vault cannot be read or written, report `vault-unavailable` and write nothing to a file. There is no plain-file fallback. Another operating system's vault is not part of this step.
3. Only this module reads the sign-in. It is not placed in the archive, a backup, folder settings, capture progress, a command receipt, or [connection status](../../contracts/connection-status.md). Capture never receives a token. The connection record that holds no secret (the connection ID, provider and account label) lives in the program's local data folder, never in the archive or a backup.
4. Offer capture `fetchMail` and the account number, both tied to the run's connection ID. The results, the HTTPS rule and the pass conditions are in [fetch](fetch.md).
5. Expose connection status to commands and to queries, without the sign-in. Commands uses it to learn the current connection.

## Outputs

- Account connection status
- Authorized connection access

## Check

A contributor traces sign-in setup and use and verifies that only connections stores sign-in details. A second successful connect leaves one current connection, with a new ID, and names the replaced account label. A failed connect keeps the earlier connection and its ID. A vault that cannot be read or written writes no file. `fetchMail` takes the run's connection ID, uses HTTPS and the provider's host only, and returns no sign-in material. The account number given to capture contains no mail address.

| Rule | Passes when |
| --- | --- |
| **One connection.** | A successful second connect leaves one current connection with a new ID, the receipt names the replaced account label, and saved mail is unchanged. A failed connect keeps the earlier ID. A connect during a capture is not refused. |
| **Vault only.** | Sign-in material is found only in the vault. A vault failure leaves no new file. No other module imports the package. The connection record that holds no secret is in the local data folder, not in the archive or a backup. |
| **fetchMail.** | The call takes the run's connection ID. The pass conditions in [fetch](fetch.md) hold, and the result contains no sign-in material. |
