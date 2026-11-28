---
build_step: 1
status: draft
consumes: ["../store/CONTEXT.md", "../../contracts/CONTEXT.md#history-line", "../../contracts/CONTEXT.md#link", "../../contracts/CONTEXT.md#operation", "../../contracts/CONTEXT.md#who-did-it", "../../contracts/CONTEXT.md#work"]
produces: ["Every link, and its undo", "A person accepted on a matter, or taken off it"]
---
# links — What belongs to what

One job: record what belongs to what.

## What it owns

Every link, who made it, who accepted it, who removed it, and the undo.

## What it never does

It never reads mail, and it never sends. It never deletes a link. It reads no other part: a part that needs links reads them here.

## Slice 2: the Brief, shown from made-up matters (complete)

### Inputs

- Working: `src/links.ts`
- Reference: [store](../store/CONTEXT.md)
- Reference: [Link](../../contracts/CONTEXT.md#link)
- Reference: [History line](../../contracts/CONTEXT.md#history-line)
- Reference: [Operation](../../contracts/CONTEXT.md#operation)
- Reference: [Who did it](../../contracts/CONTEXT.md#who-did-it)
- Reference: [Work](../../contracts/CONTEXT.md#work)

### Process

Operations, from the [operations table](../../map/target.md#operations). `link_move_message` is listed under [brief](../brief/CONTEXT.md), which does its work with `moveWrites` below.

| Operation | Input | Level | Named results |
| --- | --- | --- | --- |
| `link_accept_person` | `request_id`, `link` | You | `accepted` with `link`; `already_so`; `unknown_link` |
| `link_remove_person` | `request_id`, `link` | You | `removed` with `link`; `already_so`; `unknown_link` |

1. **Rows.** Every link is one row of one table, in the [Link](../../contracts/CONTEXT.md#link) shape. The table refuses a quote over 300 characters or a sender's name over 100, whoever writes it, and a row whose ends do not match its kind. A message is in force on at most one matter, and a person at most once on a matter: two indexes refuse a second row in force.
2. **Writes other parts use.** `linkWrite` makes the write for a new link and refuses anything that is not exactly a link within its limits. `moveWrites` makes the writes that move a message link: the old link is marked removed by the caller, and a new link in force, made by the caller, carries the same message, quote, sender and time to the other matter. Both land only while the old link is as it was read. In this slice the tests' made-up Brief calls `linkWrite`, and [brief](../brief/CONTEXT.md)'s `link_move_message` calls `moveWrites`.
3. **Reads other parts use.** `linksOfMatter` gives every link of one matter, removed ones included, oldest first. `linkById` gives one link. `linkHistory` turns links into dated [history lines](../../contracts/CONTEXT.md#history-line) from what each row records: one when it was made, one when it was accepted, and one when it was removed. A person link made by an agent reads "was proposed"; one the person made reads "was added".
4. **Accepting a person.** `link_accept_person` takes a person link that is proposed and marks it accepted by the caller. One already accepted answers `already_so`. One already removed answers `changed_since`. A link that is not a person link answers `unknown_link`.
5. **Removing a person.** `link_remove_person` marks a proposed or accepted person link removed by the caller. The row stays. One already removed answers `already_so`.
6. **Two changes at once.** Each change's writes begin with [store](../store/CONTEXT.md)'s `stillTrue` on the link's matter and state as they were read, so a change that landed first is never written over. The [door](../operations/CONTEXT.md) then runs the work once more and answers how the link is now. A message moved twice at once is moved once, and the index on messages in force refuses a second.
7. **Who.** Every change and refused change is recorded by the [door](../operations/CONTEXT.md), on `matter:<id>` of the link's matter. Both operations are the person's: an agent is answered `not_allowed`, so a proposed person stays unconfirmed until the person accepts it.

### Outputs

- Every link, and its undo
- A person accepted on a matter, or taken off it

### Check

`npm test` passes, and each hard rule below has a test in `test/links.test.ts` that fails when the rule is broken.

| Hard rule | Test |
| --- | --- |
| Moving a message works, leaves a history line on both matters, and deletes nothing | "moving a message to another matter works" |
| A bad move is refused and changes nothing | "a move to where the message already is" |
| One message moved twice at once is moved once, and is in force on one matter only | "the same message moved twice at once" |
| A proposed person shows as unconfirmed until accepted, and accepting adds a history line | "a person an agent proposed shows as unconfirmed" |
| Removing a person adds a history line and deletes nothing; a removed person cannot be accepted from a stale page | "removing a person works" |
| An accept and a removal sent at once never write over each other | "accepting and removing one person at once" |
| An agent is refused every link change, and each refusal is recorded | [brief](../brief/CONTEXT.md)'s `test/brief.test.ts`: "every change by an agent" |
| A quote over 300 characters is refused, by `linkWrite` and by the table | [brief](../brief/CONTEXT.md)'s `test/limits.test.ts`: the first two tests |

## Still to come in piece one (draft)

Draft. Sorting makes message links and proposes person links in slice 3. `matter_merge` and `matter_split`, and project links, are later. The [target map](../../map/target.md#rules-that-belong-to-one-part) is the plan.

### Open

- A message link holds the sender's name as the message gave it. A name in a message is not a verified contact.
