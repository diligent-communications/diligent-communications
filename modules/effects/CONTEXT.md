---
build_step: 2
status: draft
consumes: ["../operations/CONTEXT.md","../connections/CONTEXT.md","../store/CONTEXT.md"]
produces: ["Prepared actions"]
---
# effects — What leaves, after a tap

Draft. The seam below is what other parts may rely on. The inner behaviour is written with this part's code. Piece 2 completes a reply. Piece 3 adds a text reply. Piece 6 adds an event and a contact change. Nothing leaves in piece 1.

One job: anything that leaves this install, or that changes Gmail, Calendar or Contacts.

## What it owns

Prepared actions, the person's acceptance of each, the sending, and the receipt. A prepared action holds the exact reply, event or contact change, who prepared it, the acceptance, and the provider's receipt.

## What it never does

It never acts without a recorded acceptance by the person. It never calls a model. It never holds a Google sign-in. It asks connections to send. It never stores a mail body beyond the reply the person is about to send.

## Operations

| Operation | Meaning | Level | Named results |
| --- | --- | --- | --- |
| `action_prepare` | Prepare a reply, an event or a contact change. Nothing is sent | Prepare | `prepared` |
| `action_list` | What is waiting for a tap | Read | `listed` |
| `action_get` | One prepared action, with the exact change | Read | `action` |
| `action_edit` | Change a prepared action | You | `changed` |
| `action_discard` | Drop a prepared action | You | `discarded` |
| `action_accept` | The person's tap. It is carried out once | You | `done`, `failed`, `outcome_unknown`, `needs_sign_in` |

## Hard rules

1. An accepted action is carried out at most once.
2. An unknown outcome is checked with the provider before any retry.
3. An event that invites or notifies someone shows who gets notified before the person taps.
4. A send uses connections. A network failure does not change the account's lasting state. A rejected sign-in is `needs_sign_in`.

## Inputs

- Working: None yet.
- Reference: [Operations](../operations/CONTEXT.md)
- Reference: [Connections](../connections/CONTEXT.md)
- Reference: [Store](../store/CONTEXT.md)

## Process

1. Store the prepared action. Send nothing.
2. On `action_accept`, ask connections to carry it out once, then store the receipt.

## Outputs

- Prepared actions

## Check

When piece 2's code is written, a contributor prepares a reply and sees that nothing was sent, then accepts it and sees one send. A second accept does not send again.

## Lanes

### Reply · Piece 2 (draft)

#### Inputs

- Working: None yet.

#### Process

1. Prepare and, after a tap, send one mail reply.

#### Outputs

- Reply sent or waiting

#### Check

Piece 2 checks `action_accept` for a reply.

### Text reply · Piece 3 (draft)

#### Inputs

- Working: None yet.

#### Process

1. Prepare a reply to a text. Send it only after a tap.

#### Outputs

- Text reply sent or waiting

#### Check

Piece 3 checks that a text reply uses the same acceptance rule.

### Events and contacts · Piece 6 (draft)

#### Inputs

- Working: None yet.

#### Process

1. Prepare an event or a contact change. Show who would be notified before the tap.

#### Outputs

- Event or contact change sent or waiting

#### Check

Piece 6 checks the notice-before-tap rule.
