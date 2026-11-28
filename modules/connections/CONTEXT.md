---
build_step: 1
status: draft
consumes: ["../operations/CONTEXT.md","../store/CONTEXT.md"]
produces: ["Account sign-ins"]
---
# connections — Sign-ins to outside accounts

Draft. The seam below is what other parts may rely on. The inner behaviour is written with this part's code. Piece 1 completes reading mail. Piece 2 adds sending. Piece 6 adds Calendar and Contacts.

One job: sign-ins to outside accounts, Google first. This is the only part that holds or uses those sign-ins. It makes calls to Google on behalf of other parts.

## What it owns

The sign-in for each connected account, and that account's lasting state. The lasting states are `connected` and `needs-sign-in`. Nothing secret appears in a result, a record or a log.

## What it never does

It never calls a model. It never stores a mail body. It never puts a sign-in in a result. No other part reads the sign-in.

## Operations

| Operation | Meaning | Level | Named results |
| --- | --- | --- | --- |
| `account_connect_start` | Begin connecting a mailbox. Returns an address to open in a browser | You | `open_this`, `no_google_setup` |
| `account_list` | Connected accounts and their state | Read | `listed` |
| `account_disconnect` | Forget a sign-in. Matters stay | You | `disconnected`, `unknown_account` |

Signing in to Google happens on Google's own page in a browser. That step cannot be done from the command line or by an agent. Starting it, seeing its state and disconnecting work from the screen, the command line and an agent.

Other parts ask this part to read or change Google. Those calls are not separate operations. They return the same kind of named result, and they obey the hard rules below.

## Hard rules

1. Only this part holds or uses an outside sign-in. A result, a record and a log contain no token, client secret or sign-in code.
2. Mail is read over HTTPS, from the provider's mail address only. A redirect to any other address is refused, and the sign-in is not attached.
3. A failure has one name. A sign-in Google rejects is the result `needs_sign_in`, and the lasting state becomes `needs-sign-in` until the person signs in again. A network failure is `not_reachable` and changes neither lasting state.
4. Reconnecting the same Google account keeps the same account ID.

## Inputs

- Working: None yet.
- Reference: [Operations](../operations/CONTEXT.md)
- Reference: [Store](../store/CONTEXT.md)

## Process

1. Start, list or disconnect an account when the door calls that operation.
2. On a call from another part, use the sign-in here and return a named result with no secret in it.

## Outputs

- Account sign-ins

## Check

When this part's code is written, a contributor finds the sign-in only in this part. A rejected sign-in becomes `needs-sign-in` and stays there. A network failure leaves the state unchanged. An address that is not the provider's mail address is refused, including a redirect.

## Lanes

### Mail · Piece 1 (draft)

#### Inputs

- Working: None yet.

#### Process

1. Read mail when sources asks. Read-only.

#### Outputs

- Mail read for sources

#### Check

Piece 1 checks a read against hard rules 2 and 3.

### Sending · Piece 2 (draft)

#### Inputs

- Working: None yet.

#### Process

1. Send only what effects has already had accepted.

#### Outputs

- Send attempted

#### Check

Piece 2 checks that a send without an acceptance does not leave this part.

### Calendar and contacts · Piece 6 (draft)

#### Inputs

- Working: None yet.

#### Process

1. Change Calendar or Contacts only for an accepted action.

#### Outputs

- Calendar or contact change attempted

#### Check

Piece 6 checks the same acceptance rule as sending.
