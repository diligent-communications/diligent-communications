---
build_step: 1
status: draft
consumes: ["../operations/CONTEXT.md","../store/CONTEXT.md","../../contracts/CONTEXT.md#link"]
produces: ["Links"]
---
# links — What belongs to what

Draft. The seam below is what other parts may rely on. The inner behaviour is written with this part's code. Piece 1 completes message-to-matter links, person links, `link_accept_person`, and the undo operations `link_move_message` and `link_remove_person`. `matter_merge` and `matter_split` are later and belong to no piece yet. Piece 5 adds a link from a matter to a project.

One job: record the link, who made it, who accepted it, and the undo.

## What it owns

Every link. A link is never deleted, only marked removed. The fields are the [link](../../contracts/CONTEXT.md#link) shape.

## What it never does

It never calls a model, never reads mail, and never sends anything. A name in a message is not a verified contact. This part does not turn that name into a confirmed person.

## Operations

| Operation | Meaning | Level | Named results |
| --- | --- | --- | --- |
| `link_move_message` | Move a message from one matter to another | You | `moved`, `same_matter` |
| `link_accept_person` | Accept a person on a matter | You | `accepted` |
| `link_remove_person` | Remove a person from a matter | You | `removed` |
| `matter_merge` | Join two matters | You | `merged` |
| `matter_split` | Part one matter into two | You | `split` |

Sorting may also create a message-to-matter link as part of `sort_record`. That link is in force at once. A person link an agent proposes stays `proposed` until the person accepts it.

## Hard rules

1. A link is marked `removed`. It is not deleted.
2. A message-to-matter link made by sorting is `active` at once.
3. A person link proposed by an agent stays unconfirmed until the person accepts it.
4. Piece 1's undo is `link_move_message` and `link_remove_person`, beside `link_accept_person`. `matter_merge` and `matter_split` belong to no piece yet. Undoing one of them, when they exist, is a new link change. It does not erase the earlier line.

## Inputs

- Working: None yet.
- Reference: [Operations](../operations/CONTEXT.md)
- Reference: [Store](../store/CONTEXT.md)
- Reference: [Link](../../contracts/CONTEXT.md#link)

## Process

1. Record the link change the operation names.
2. Return the named result. Do not remove the earlier row.

## Outputs

- Links

## Check

When this part's code is written, a contributor moves a message and still finds the earlier link, marked removed. An agent-proposed person is not confirmed until the person accepts.

## Lanes

### Projects · Piece 5 (draft)

#### Inputs

- Working: None yet.

#### Process

1. Add a link from a matter to a project when plans asks.

#### Outputs

- Project link

#### Check

Piece 5 checks that a project link follows the same removed-not-deleted rule.
