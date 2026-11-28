---
build_step: 1
status: draft
consumes: ["../operations/CONTEXT.md","../sources/CONTEXT.md","../brief/CONTEXT.md","../links/CONTEXT.md","../store/CONTEXT.md","../../contracts/CONTEXT.md#source-message","../../contracts/CONTEXT.md#sort-run","../../contracts/CONTEXT.md#matter","../../contracts/CONTEXT.md#link"]
produces: ["Outcomes and receipts"]
---
# sorting — One outcome for every message

Draft. The seam below is what other parts may rely on. The inner behaviour is written with this part's code. Piece 1 completes sorting mail. Texts and calls use the same rules when those pieces add them.

One job: every source message ends with exactly one outcome.

## What it owns

Outcomes, sort runs, receipts, and the honest numbers at the top of the Brief. It never decides a message. The agent or the person decides, and this part records the decision.

## What it never does

It never calls a model. It never stores a mail body. It never sends anything. It never starts or wakes an agent.

## Operations

| Operation | Meaning | Level | Named results |
| --- | --- | --- | --- |
| `sort_status` | Per account: last check, waiting, held, last complete sort, last attempt | Read | `status` |
| `sort_start` | Open a sort run, or pick up the caller's own open run | Prepare | `started`, `resumed`, `run_open_elsewhere`, `nothing_waiting` |
| `sort_next` | The next few messages to sort, oldest first | Prepare | `messages`, `none_left`, `run_ended` |
| `sort_record` | Record one message's outcome. A close sets `done`, and only from `open`, `waiting` or `snoozed` | Prepare | `recorded`, `not_in_run`, `unknown_matter`, `owner_field`, `too_long` |
| `sort_finish` | Close the run and return its receipt | Prepare | `receipt` |
| `sort_stop` | Stop a run | You, or the agent that owns the run | `receipt` |
| `sort_receipt` | The same receipt again | Read | `receipt`, `unknown_run` |
| `held_list` | See held messages | Read | `listed` |
| `held_release` | Send one held message back to be sorted | You | `released` |

`sort_next` offers messages oldest first. It hands each message at the setting `handover_level`, which is `full` or `reference`. It is `full` unless the person changes it. The setting is in [store](../store/CONTEXT.md). `full` means this install reads the mail and passes the words through. `reference` means no request to Google is made because an agent asked: this install passes only the message's IDs, and the agent reads the mail through Google's own connection. `sort_next` is a read. It takes no request ID.

A close in `sort_record` sets `done`, and only from `open`, `waiting` or `snoozed`. It never changes a dismissed matter; only the person reopens a dismissed matter. `matter_set_state` stays the person's. `sort_record` can make no other state change. The link that carries a close does not reopen the matter. A linked message reopens a done matter only when the message happened after the matter was closed. That reopen is part of the `sort_record` that links the message, and it is recorded under its caller. State is not one of the fields "what you set stays yours" covers, so an agent may close again on a later message, and the person reopens a done matter with one tap. [brief](../brief/CONTEXT.md) states the same rule.

`too_long` means a quote or a summary is over the limit on the [link](../../contracts/CONTEXT.md#link) or the [matter](../../contracts/CONTEXT.md#matter). `owner_field` means the person has edited that field, as `set_by_you` on the matter. State is not one of those fields.

## Hard rules

1. A source message has one current outcome. Earlier outcomes stay in its history.
2. One sort run is open at a time. A run with no activity for 30 minutes ends as `timed_out`, the word on the [sort run](../../contracts/CONTEXT.md#sort-run) shape.
3. A message whose account cannot be read is left waiting, and the run's receipt counts it as left waiting.
4. A receipt never changes once given. Its word is `complete` only when every listed message is accounted for. Otherwise it is `partial`.
5. "Last complete sort" for an account moves only when a run ends with nothing left waiting for that account.
6. A message that vanished before it was sorted is recorded as no action, reason "gone before sorting", by Diligent.
7. A message-to-matter link made here is in force at once. [links](../links/CONTEXT.md) owns the link. The close path above is the only state change this part records.

## Inputs

- Working: None yet.
- Reference: [Operations](../operations/CONTEXT.md)
- Reference: [Sources](../sources/CONTEXT.md)
- Reference: [Brief](../brief/CONTEXT.md)
- Reference: [Links](../links/CONTEXT.md)
- Reference: [Store](../store/CONTEXT.md)
- Reference: [Source message](../../contracts/CONTEXT.md#source-message)
- Reference: [Sort run](../../contracts/CONTEXT.md#sort-run)
- Reference: [Matter](../../contracts/CONTEXT.md#matter)
- Reference: [Link](../../contracts/CONTEXT.md#link)

## Process

1. Open or resume one run for the caller.
2. Hand the next messages at the level the setting names, then record the outcome the caller returns.
3. Close the run and return the receipt.

## Outputs

- Outcomes and receipts

## Check

When this part's code is written, a contributor finishes a run where every listed message has an outcome and the receipt says `complete`. A second open run returns `run_open_elsewhere`. A receipt read again is unchanged.
