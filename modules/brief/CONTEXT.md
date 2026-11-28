---
build_step: 1
status: draft
consumes: ["../operations/CONTEXT.md","../links/CONTEXT.md","../sorting/CONTEXT.md","../store/CONTEXT.md","../../contracts/CONTEXT.md#matter"]
produces: ["Matters"]
---
# brief — The matters on the Brief

Draft. The seam below is what other parts may rely on. The inner behaviour is written with this part's code. Piece 1 completes it.

One job: the matters. One matter is one line on the Brief, however many messages are behind it.

## What it owns

Each matter's fields, state and dated history, and how the Brief is grouped and filtered. The freshness line at the top is sorting's counts. This part shows them and does not compute them.

## What it never does

It never reads mail and never stores a mail body. It never calls a model. It never sends anything.

## Operations

| Operation | Meaning | Level | Named results |
| --- | --- | --- | --- |
| `brief_list` | The Brief, grouped by kind, with the freshness line | Read | `brief` |
| `matter_get` | One matter with its sources, person and history | Read | `matter`, `unknown_matter` |
| `matter_search` | Find matters, including closed ones | Read | `found` |
| `matter_edit` | Change title, notes, due date, kind or lane | You | `changed` |
| `matter_set_state` | Done, Waiting, snooze, dismiss or reopen. Prepare may set `done` when a message being sorted shows the matter is finished | You, and Prepare for that done | `changed`, `already_so` |

## Hard rules

1. A matter's ID never changes and is never reused.
2. Every change adds a history line, including who did it.
3. A new linked message reopens a done matter. A dismissed matter is reopened only by the person. The person reopens a done matter with one tap.
4. An agent at Prepare may set `done` only in that sorting case. The history line names the agent. Waiting, snooze, dismiss and every other state change stay the person's.
5. A field the person has edited is not overwritten by an agent. The field list is `set_by_you` on the [matter](../../contracts/CONTEXT.md#matter) shape.

## Inputs

- Working: None yet.
- Reference: [Operations](../operations/CONTEXT.md)
- Reference: [Links](../links/CONTEXT.md)
- Reference: [Sorting](../sorting/CONTEXT.md)
- Reference: [Store](../store/CONTEXT.md)
- Reference: [Matter](../../contracts/CONTEXT.md#matter)

## Process

1. Return the Brief or one matter.
2. Apply an edit or a state change from the person, and append history.

## Outputs

- Matters

## Check

When this part's code is written, a contributor edits a field, then an agent sort leaves that field as the person set it. A new link to a done matter reopens it.
