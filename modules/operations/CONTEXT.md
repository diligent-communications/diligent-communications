---
build_step: 1
status: draft
consumes: ["../access/CONTEXT.md", "../brief/CONTEXT.md", "../links/CONTEXT.md", "../people/CONTEXT.md", "../store/CONTEXT.md", "../../contracts/CONTEXT.md#activity-line", "../../contracts/CONTEXT.md#answer", "../../contracts/CONTEXT.md#caller", "../../contracts/CONTEXT.md#level", "../../contracts/CONTEXT.md#operation", "../../contracts/CONTEXT.md#who-did-it", "../../contracts/CONTEXT.md#work"]
produces: ["The operations list", "The door: one answer for one call"]
---
# operations — The one door

One job: every change and every read enters here.

## What it owns

The operations list, the level check, the request ID, and the record of who did what.

## What it never does

It never contains the work itself. The work of an operation belongs to the part that owns it.

## The door (complete for slices 1 and 2)

### Inputs

- Working: `src/door.ts`, `src/list.ts`
- Reference: [access](../access/CONTEXT.md)
- Reference: [brief](../brief/CONTEXT.md)
- Reference: [links](../links/CONTEXT.md)
- Reference: [people](../people/CONTEXT.md)
- Reference: [store](../store/CONTEXT.md)
- Reference: [Activity line](../../contracts/CONTEXT.md#activity-line)
- Reference: [Answer](../../contracts/CONTEXT.md#answer)
- Reference: [Caller](../../contracts/CONTEXT.md#caller)
- Reference: [Level](../../contracts/CONTEXT.md#level)
- Reference: [Operation](../../contracts/CONTEXT.md#operation)
- Reference: [Who did it](../../contracts/CONTEXT.md#who-did-it)
- Reference: [Work](../../contracts/CONTEXT.md#work)

### Process

The operations list is `src/list.ts`. Each part describes its own operations, and the list joins them. It holds [access](../access/CONTEXT.md)'s seven, [store](../store/CONTEXT.md)'s one, [brief](../brief/CONTEXT.md)'s six, [links](../links/CONTEXT.md)' two and [people](../people/CONTEXT.md)'s one. The screen's forms, the commands and the agent tools are all made from it.

`run` takes the caller, an operation's name and an input, and returns one answer. In order:

1. An unknown name answers `invalid_input`.
2. An agent that is switched off answers `switched_off`. On the agent connection the host has the door refuse every call of one request in one landing, with `refuseSwitchedOff`. What that records is in the [host](../host/CONTEXT.md) contract.
3. The level check. An operation at the level `none` runs for a caller with no sign-in and for the person, and answers `not_allowed` to an agent. Any other operation answers `not_signed_in` to a caller with no sign-in, and `not_allowed` to a caller whose level does not reach it. What a caller may do depends on its sign-in, never on the way in.
4. The input is checked against what the operation takes. Anything else answers `invalid_input`, which names the field and never repeats the value.
5. For an operation that takes a request ID: a request ID already kept with the same operation, caller and input returns the kept answer, and nothing is changed or recorded again. The same ID with anything different answers `request_id_reused`.
6. The owning part's work runs and hands back its [work](../../contracts/CONTEXT.md#work). An answer that is not one of the operation's named results, or one any operation can return, is an error and is never returned.
7. The work's writes, the activity line, and the kept answer land together through store, or none of them do. The kept answer leaves out the fields the operation shows once. A part may add a write that makes the landing clash unless what it read is still true. After a clash the work runs once more, so its answer is about how things are now. If the writes clash twice, the answer is `unavailable`.

What is recorded, one [activity line](../../contracts/CONTEXT.md#activity-line) each:

- Every call to an operation that changes something, by a caller with a sign-in, whatever the answer. That covers every change and every refused attempt at one.
- A call that proved the person by itself: a successful `sign_in`, or `password_set` with a set-up code, as `you`.
- A stranger's wrong try that starts a password lock, as `diligent`: one line for one lock. A stranger's other wrong tries leave no line, so a stranger cannot fill the record. A lock started by a signed-in caller's wrong try, the current password in `password_set` included, has no `diligent` line. It is that caller's refused change, recorded under that caller by the first rule here, as `locked_out`.
- A read leaves no line. Nor does a repeat that returns a kept answer.

### Outputs

- The operations list
- The door: one answer for one call

### Check

`npm test` passes, and each hard rule below has a test that fails when the rule is broken.

| Hard rule | Test |
| --- | --- |
| One door, three ways in: the same call gives the same answer whichever way it comes ([rule 3](../../map/target.md#rules-every-part-keeps)) | `test/three-ways.test.ts` |
| Every change, and every refused change by a known caller, leaves exactly one line under the right name, and a read leaves none ([rule 4](../../map/target.md#rules-every-part-keeps)) | `test/three-ways.test.ts`. For who a lock is recorded under, [access](../access/CONTEXT.md)'s `test/sign-in.test.ts`: "a wrong password is refused" for a stranger's, and "a lock started by a signed-in caller's wrong try" |
| A repeat is safe ([rule 5](../../map/target.md#rules-every-part-keeps)) | `test/repeat.test.ts` |
| `sign_in`, `sign_out` and `password_set` take no request ID, so no answer of theirs is kept | `test/door.test.ts`: "the levels, request IDs and named results" |
| Every answer is a named result with a description that says what was found, never what to do ([rule 9](../../map/target.md#rules-every-part-keeps)) | `test/door.test.ts`: "an answer that is not one of the named results", "a refusal says what was found" |
| The change and its record land together ([rule 11](../../map/target.md#rules-every-part-keeps)) | `test/door.test.ts`: "the door writes the record in the same landing as the change" |
| Several refused calls land together, one line for each that would change something | `test/door.test.ts`: "a switched-off agent is refused several calls in one landing" |
| Every listed operation has its work, and no work is unlisted | `test/door.test.ts`: "the door opens only when" |
| The levels and named results are the ones the operations table gives | `test/door.test.ts`: "the levels, request IDs and named results" |

## Still to come in piece one (draft)

Draft. The operations of the parts that are not built yet join the list with their parts. The [target map](../../map/target.md#operations) is the plan.

### Open

- Counted as characters divided by four, this contract with its references and working files is about 14,300 tokens, above the 8,000-token guide for one read, because it reads the contracts of the five parts whose operations it lists whole.
- A kept answer is kept for 30 days in the plan. Nothing removes one yet: see [store](../store/CONTEXT.md).
