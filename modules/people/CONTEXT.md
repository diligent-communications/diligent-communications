---
build_step: 1
status: draft
consumes: ["../store/CONTEXT.md", "../../contracts/CONTEXT.md#operation", "../../contracts/CONTEXT.md#person", "../../contracts/CONTEXT.md#work"]
produces: ["A person's name, for a matter"]
---
# people — A page per person

One job: a page per person.

## What it owns

Person records.

## What it never does

It never becomes the address book, and it reads no other part.

## Slice 2: the Brief, shown from made-up matters (complete)

In this slice people holds only what a matter needs to show a name.

### Inputs

- Working: `src/people.ts`
- Reference: [store](../store/CONTEXT.md)
- Reference: [Person](../../contracts/CONTEXT.md#person)
- Reference: [Operation](../../contracts/CONTEXT.md#operation)
- Reference: [Work](../../contracts/CONTEXT.md#work)

### Process

Operation, from the [operations table](../../map/target.md#operations):

| Operation | Input | Level | Named results |
| --- | --- | --- | --- |
| `person_get` | `person` | Read | `person` with `person`: its `id`, `name` and `confirmed`; `unknown_person` |

1. Each person is one row in the [Person](../../contracts/CONTEXT.md#person) shape. The table refuses a name over its limit there. No operation in this slice changes or removes one.
2. `personWrite` makes the write for a new person and refuses anything that is not exactly a person. In this slice only the tests' made-up Brief calls it.
3. `person_get` returns one person. A matter's page asks it for the name of each person on the matter.

### Outputs

- A person's name, for a matter

### Check

`npm test` passes, and the rule below has a test that fails when it is broken.

| Hard rule | Test |
| --- | --- |
| `person_get` gives the same person from the screen, the command line and an agent at either level, and an unknown ID answers `unknown_person` | [links](../links/CONTEXT.md)' `test/links.test.ts`: "a person on a matter is shown by name" |

## Still to come (draft)

Draft. The person's page, `person_list` and `person_edit`, ways to reach a person, and a match with Google Contacts are later pieces. The [target map](../../map/target.md#the-parts) is the plan.
