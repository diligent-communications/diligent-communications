---
build_step: 1
status: draft
consumes: ["../operations/CONTEXT.md","../connections/CONTEXT.md","../store/CONTEXT.md","../../contracts/CONTEXT.md#source-message"]
produces: ["Source messages"]
---
# sources — What exists at each source

Draft. The seam below is what other parts may rely on. The inner behaviour is written with this part's code. Piece 1 completes mail. Piece 3 adds texts. Piece 4 adds calls. Files a person brings in, which used to be a separate import lane, come in through the voice doorway in piece 4.

One job: say what exists at each source, and fetch it when asked.

## What it owns

The list of source messages, and the retention clock. For mail it notices new messages and reads one when asked, keeping nothing but its ID and the fields on the [source message](../../contracts/CONTEXT.md#source-message) shape. For texts and call transcripts it keeps the words for one year, because they live nowhere else. Audio is not kept once it has been transcribed.

## What it never does

It never stores a mail body, a subject or a sender. It never calls a model. It never holds a Google sign-in. It never decides the outcome of a message.

## Operations

| Operation | Meaning | Level | Named results |
| --- | --- | --- | --- |
| `mail_check` | Look for new mail in one account or all | You, and the schedule | `checked`, `needs_sign_in`, `not_reachable`, `rate_limited`, `already_checking` |
| `source_open` | Where to open the original, checked live | You | `open_this`, `gone`, `not_reachable` |
| `text_add` | The phone app brings in a text | Phone or You | `added`, `already_have` |
| `call_add` | The phone app or a file brings in a transcript | Phone or You | `added`, `already_have` |

## Hard rules

1. A message is identified by its kind, this install's account ID, and the provider's own message ID. Reconnecting the same Google account keeps the same account ID. That ID is not a mail address.
2. Mail is read from the provider's mail address only, by connections. This part never sees the sign-in.
3. A mailbox that cannot be read is `not_reachable`. That is not `gone`, and it is not an empty check. `gone` means the provider no longer has that message.
4. A run of work that reads mail is tied to the connection it began with. If that connection is no longer current, the run stops and does not keep reading.
5. `already_have` means this install already stored that text or transcript. It does not mean a mail body was stored.

## Inputs

- Working: None yet.
- Reference: [Operations](../operations/CONTEXT.md)
- Reference: [Connections](../connections/CONTEXT.md)
- Reference: [Store](../store/CONTEXT.md)
- Reference: [Source message](../../contracts/CONTEXT.md#source-message)

## Process

1. Notice new mail, or accept a text or a transcript.
2. Return one named result. Do not choose an outcome.

## Outputs

- Source messages

## Check

When this part's code is written, a contributor checks mail that contains a marker sentence and then finds that sentence nowhere in the database. An unreadable mailbox is `not_reachable`, not an empty list.

## Lanes

### Mail · Piece 1 (draft)

#### Inputs

- Working: None yet.

#### Process

1. Notice new mail and read one message when an operation asks. Keep the ID, not the body.

#### Outputs

- Mail noticed or read

#### Check

Piece 1 checks `mail_check` and `source_open` against the hard rules.

### Text · Piece 3 (draft)

#### Inputs

- Working: None yet.

#### Process

1. Take a text from the phone app and keep its words for one year.

#### Outputs

- Text kept

#### Check

A contributor brings in one text and verifies that a text is kept once.

### Calls · Piece 4 (draft)

#### Inputs

- Working: None yet.

#### Process

1. Take a transcript from the voice doorway, including a file the person brings. Do not keep the audio once it is transcribed.

#### Outputs

- Transcript kept

#### Check

A contributor turns calls off and verifies that mail still checks.
