---
build_step: 1
status: draft
consumes: ["../operations/CONTEXT.md","../links/CONTEXT.md","../brief/CONTEXT.md","../plans/CONTEXT.md","../connections/CONTEXT.md","../store/CONTEXT.md","../../contracts/CONTEXT.md#person"]
produces: ["Person pages"]
---
# people — A page per person

Draft. The seam below is what other parts may rely on. The inner behaviour is written with this part's code. Piece 1 completes a name on the Brief line. Piece 5 completes the page. Piece 6 matches Google Contacts. Google Contacts stays the address book.

One job: the light record of a person. No pipelines and no marketing.

## What it owns

Person records, as the [person](../../contracts/CONTEXT.md#person) shape says. The page shows what was said, their open matters and their projects. What was said comes from [links](../links/CONTEXT.md). Open matters come from [brief](../brief/CONTEXT.md). Projects come from [plans](../plans/CONTEXT.md). This part does not copy them into a second store. brief returns a person id. The caller asks this part for the page. This part does not need brief to read it back.

## What it never does

It never calls a model. It never stores a mail body. It never becomes the address book. It does not treat a name found in a message as a confirmed person.

## Operations

| Operation | Meaning | Level | Named results |
| --- | --- | --- | --- |
| `person_list` | The people | Read | `listed` |
| `person_get` | One person's page | Read | `person` |
| `person_edit` | Change the person's record | You | `changed` |

## Hard rules

1. `confirmed` is `yes` only after the person accepts the link.
2. A Google contact match, when piece 6 adds it, is done through connections. This part never holds that sign-in.

## Inputs

- Working: None yet.
- Reference: [Operations](../operations/CONTEXT.md)
- Reference: [Links](../links/CONTEXT.md)
- Reference: [Brief](../brief/CONTEXT.md)
- Reference: [Plans](../plans/CONTEXT.md)
- Reference: [Connections](../connections/CONTEXT.md)
- Reference: [Store](../store/CONTEXT.md)
- Reference: [Person](../../contracts/CONTEXT.md#person)

## Process

1. List or show a person from the rows this part owns.
2. Apply an edit from the person.

## Outputs

- Person pages

## Check

When piece 1's code is written, a matter line can show a name. When piece 5's code is written, the page shows that person's open matters. A name taken from a message stays unconfirmed.

## Lanes

### Name on the line · Piece 1 (draft)

#### Inputs

- Working: None yet.

#### Process

1. Let a matter line name a person.

#### Outputs

- Name on a matter

#### Check

Piece 1 checks that the line can show a name.

### The page · Piece 5 (draft)

#### Inputs

- Working: None yet.

#### Process

1. Show the page: what was said, open matters and projects.

#### Outputs

- Person page

#### Check

Piece 5 checks `person_get`.

### Google Contacts · Piece 6 (draft)

#### Inputs

- Working: None yet.

#### Process

1. Match a person to a Google contact through connections.

#### Outputs

- Contact match

#### Check

Piece 6 checks that the sign-in stays in connections.
