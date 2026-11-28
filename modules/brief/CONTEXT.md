---
build_step: 1
status: draft
consumes: ["../operations/CONTEXT.md","../links/CONTEXT.md","../store/CONTEXT.md","../../contracts/CONTEXT.md#matter"]
produces: ["Matters"]
---
# brief — The matters on the Brief

Draft. The seam below is what other parts may rely on. The inner behaviour is written with this part's code. Piece 1 completes it.

One job: the matters. One matter is one line on the Brief, however many messages are behind it.

## What it owns

Each matter's fields, state and dated history, and how the Brief is grouped and filtered. The freshness line is sorting's. This part does not read sorting. The caller asks `sort_status`.

## What it never does

It never reads mail and never stores a mail body. It never calls a model. It never sends anything.

## Operations

| Operation | Meaning | Level | Named results |
| --- | --- | --- | --- |
| `brief_list` | The Brief, grouped by kind. The caller asks `sort_status` for the freshness line | Read | `brief` |
| `matter_get` | One matter with its sources, the person id and history. The caller asks people for the page | Read | `matter`, `unknown_matter` |
| `matter_search` | Find matters, including closed ones | Read | `found` |
| `matter_edit` | Change title, notes, due date, kind or lane | You | `changed` |
| `matter_set_state` | Done, Waiting, snooze, dismiss or reopen. This stays the person's | You | `changed`, `already_so` |

## Hard rules

1. A matter's ID never changes and is never reused.
2. Every change adds a history line, including who did it.
3. When the message being recorded shows the matter is finished, `sort_record` may carry a close with the link. `matter_set_state` stays the person's. `sort_record` can make no other state change. The link that carries a close does not reopen the matter. A later linked message reopens a done matter, never a dismissed one. That reopen is part of the `sort_record` that links the message, and it is recorded under its caller. State is not one of the fields "what you set stays yours" covers, so an agent may close again on a later message. The person reopens with one tap. sorting states the same rule. This part does not read sorting. The caller asks `sort_status` for the freshness line.
4. A field the person has edited is not overwritten by an agent. The field list is `set_by_you` on the [matter](../../contracts/CONTEXT.md#matter) shape. State is not one of those fields.

## Inputs

- Working: None yet.
- Reference: [Operations](../operations/CONTEXT.md)
- Reference: [Links](../links/CONTEXT.md)
- Reference: [Store](../store/CONTEXT.md)
- Reference: [Matter](../../contracts/CONTEXT.md#matter)

## Process

1. Return the Brief or one matter.
2. Apply an edit or a state change from the person, and append history.

## Outputs

- Matters

## Check

When this part's code is written, a contributor edits a field, then an agent sort leaves that field as the person set it. A new link to a done matter reopens it.
