---
build_step: 1
consumes: ["../../contracts/connection-status.md","../../contracts/command-list.md"]
produces: ["Account connection status","Authorized connection access"]
---
# connections — Keep account sign-ins in one place

## Inputs

- Working: None in this planning repository.
- Reference: [Connection status](../../contracts/connection-status.md)
- Reference: [Command list](../../contracts/command-list.md)

## Process

1. Connect the mailbox when a person asks through commands. Step 1 keeps one connection, for Gmail, with read-only access. Each person uses a Google project they create. This module does not ship a shared sign-in identity. Connecting again replaces that connection. The command receipt names the account label that was replaced, as the command list says. Saved mail is left as it is. Connecting does not write to the archive.
2. Keep the sign-in in Windows Credential Manager, through one small pinned package that only this module uses. No other module imports that package. If the vault cannot be read or written, report `vault-unavailable` and write nothing to a file. There is no plain-file fallback. Another operating system's vault is not part of this step.
3. Only this module reads the sign-in. It is not placed in the archive, a backup, folder settings, capture progress, a command receipt, or [connection status](../../contracts/connection-status.md). Capture never receives a token.
4. Offer `fetchMail` to other modules. The caller passes an address. This module attaches the sign-in itself and refuses any address other than the provider's mail API, including when the response would redirect elsewhere. The caller receives the response bytes and no sign-in material.
5. Give capture the account number for the connected mailbox. That number contains no mail address and is not a field of connection status.
6. Expose connection status to queries without the sign-in.

## Outputs

- Account connection status
- Authorized connection access

## Check

A contributor traces sign-in setup and use and verifies that only connections stores sign-in details. A second connect leaves one current connection and names the replaced account label. A vault that cannot be read or written writes no file. `fetchMail` refuses any other address, including a redirect, and returns no sign-in material. The account number given to capture contains no mail address.

| Rule | Passes when |
| --- | --- |
| **One connection.** | After a second connect, one connection is current, the receipt names the replaced account label, and saved mail is unchanged. |
| **Vault only.** | Sign-in material is found only in the vault. A vault failure leaves no new file. No other module imports the package. |
| **fetchMail.** | An address other than the provider's mail API is refused, including a redirect elsewhere, and the sign-in is not attached. |
| **No token for capture.** | Capture's result from `fetchMail` contains no sign-in material. |
