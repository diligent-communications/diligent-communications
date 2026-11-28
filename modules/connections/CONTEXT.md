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

The sign-in for each connected account, and that account's lasting state. The lasting states are `connected` and `needs-sign-in`. Each outside sign-in is kept encrypted with a key that is not in the database. The encrypted sign-in lives only in this part's rows. A result, an activity line and a log hold no token. A backup does not include the sign-in.

## What it never does

It never calls a model. It never stores a mail body. It never puts a sign-in in a result. No other part reads the sign-in.

## Operations

| Operation | Meaning | Level | Named results |
| --- | --- | --- | --- |
| `account_connect_start` | Begin connecting a mailbox. Returns an address to open in a browser | You | `open_this`, `no_google_setup` |
| `account_list` | Connected accounts and their state | Read | `listed` |
| `account_disconnect` | Forget a sign-in. Matters stay | You | `disconnected`, `unknown_account` |

Signing in to Google happens on Google's own page in a browser. That step cannot be done from the command line or by an agent. `account_connect_start` and `account_disconnect` need the person's level, so on the agent connection they answer `not_allowed`. `account_list` is Read, so an agent may see the state.

Other parts ask this part to read Google. Those calls are not separate operations. A read returns `read`, `gone`, `needs_sign_in`, `not_reachable`, `rate_limited` (with the wait asked for, if any) or `refused_address`.

From piece two, a send returns `sent`, `failed`, `outcome_unknown` or `needs_sign_in`. This part does not check whether a send was accepted. It cannot know.

## Hard rules

1. Only this part holds or uses an outside sign-in. The encrypted sign-in lives only in this part's rows. A result, an activity line and a log hold no token.
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

1. Send when asked. This part does not know whether the person accepted the action. The result is `sent`, `failed`, `outcome_unknown` or `needs_sign_in`.

#### Outputs

- Send attempted

#### Check

Piece 2 checks the four send results. Whether a send was accepted is effects' rule.

### Calendar and contacts · Piece 6 (draft)

#### Inputs

- Working: None yet.

#### Process

1. Change Calendar or Contacts when asked. This part does not know whether the person accepted the action.

#### Outputs

- Calendar or contact change attempted

#### Check

Piece 6 checks that this part still does not decide whether the person accepted.
