---
build_step: 1
status: draft
consumes: ["../../contracts/CONTEXT.md#activity-line", "../../contracts/CONTEXT.md#operation", "../../contracts/CONTEXT.md#work"]
produces: ["A store a part reads its own rows from and lands its writes through", "The activity record and `activity_list`"]
---
# store — The database

One job: the database. Only store talks to it.

## What it owns

The tables, their upgrades, and the activity record.

## What it never does

It never calls a model, and it never stores a received mail body.

## Slice 1: the door (complete)

### Inputs

- Working: `src/store.ts`, `src/activity.ts`, `src/operations.ts`
- Reference: [Activity line](../../contracts/CONTEXT.md#activity-line)
- Reference: [Operation](../../contracts/CONTEXT.md#operation)
- Reference: [Work](../../contracts/CONTEXT.md#work)

### Process

1. A part keeps its table definitions in its own folder as numbered steps, one SQL statement each. `openStore` applies every step that is not yet applied, in order, and records each one with the step it applied. A shipped step is never edited. A change is a new step.
2. A part reads its own rows with `rows` and hands its writes to the door, which lands them with `land`.
3. `land` lands every write of one call together or none of them. `clash` means a rule of the tables refused one, so nothing was written. Any other failure is an error.
4. `stillTrue` makes a write that changes nothing and makes the whole landing clash unless a query still finds a row. A part adds one when its writes rest on something it read earlier, so a change made in between is never written over.
5. `landOne` lands one write by itself, at once, and returns the rows it names. The database runs one statement whole, so a write that counts and decides in the same statement cannot be split by another request.
6. `activityWrite` makes the write for one activity line and refuses anything that is not exactly an [activity line](../../contracts/CONTEXT.md#activity-line). `activityWrites` does the same for many lines at once, at most 20 to a statement.

Operation, from the [operations table](../../map/target.md#operations):

| Operation | Input | Level | Named results |
| --- | --- | --- | --- |
| `activity_list` | `limit`, 1 to 200, 50 unless given | You | `listed`, with `entries`, newest first |

### Outputs

- A store a part reads its own rows from and lands its writes through
- The activity record and `activity_list`

### Check

`npm test` passes, and each hard rule below has a test that fails when the rule is broken.

| Hard rule | Test |
| --- | --- |
| One operation's changes land together or not at all ([rule 11](../../map/target.md#rules-every-part-keeps)) | `test/store.test.ts`: "one operation's writes land together or not at all" |
| Writes that rest on an earlier read land only while it is still true | `test/store.test.ts`: "writes that rest on something read earlier land only while it is still true" |
| One write landed by itself counts whole when many arrive together | `test/store.test.ts`: "one write landed by itself returns the rows it names" |
| A table step is applied once, and a failed step is not recorded | `test/store.test.ts`: the two tests about steps |
| The activity record holds time, who, which operation, on what and the result's name, and has nowhere to put anything else | `test/store.test.ts`: "an activity line is written only when it is exactly an activity line" |
| Many lines are written in few statements | `test/store.test.ts`: "many activity lines are written in few statements" |
| No sign-in is in any row | `test/nothing-secret.test.ts`, and [host](../host/CONTEXT.md)'s local-file test for the file on a PC |
| Reading the record adds no line to it | `test/store.test.ts`: "activity_list returns the newest lines first" |

## Still to come in piece one (draft)

Draft. Settings, the export file, the clean-out of rows whose kept period has ended, and their operations are not written. The [target map](../../map/target.md#what-is-stored-and-for-how-long) is the plan for them. Until the clean-out exists, no row is removed for age: the activity record and kept answers only grow.

### Open

- `activity_list` returns the newest lines only. Reading further back needs a second input, to be added with the screen that shows the record.
- The table steps are checked on every request, which costs one database query each time. Checking once per start is a hardening item.
