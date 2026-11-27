# Connection status

Follow the [version rule](CONTEXT.md#version-rule).

What a surface needs in order to say whether a mailbox is connected. Version 1. Sign-in material stays with connections. This record never holds a token, a client secret, the client file, or any other sign-in material.

Step 1 has one connection. The result is `none-connected`, or that one connection:

| Field | Meaning |
| --- | --- |
| `connection_id` | ID of this connection |
| `provider` | `gmail` |
| `account_label` | Label shown to the person. Not a secret |
| `state` | `connected`, `needs-sign-in` or `unavailable` |
| `reason` | A reason name. Omitted when there is nothing to report |
| `checked_at` | When this status was produced. UTC |
| `basis` | `live-check` if this came from a live check, or `last-use` if it is from the last use |

`account_label` is not the account number capture puts in a source ID.

| Rule | Passes when |
| --- | --- |
| **No secret.** | A status result contains none of the sign-in material above. |
| **None or one.** | With no connection the result is `none-connected`. With a connection it has the fields above and no second connection. |
| **Where it came from.** | `basis` is `live-check` or `last-use`, and `checked_at` is present. |
