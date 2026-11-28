---
build_step: 1
status: draft
consumes: ["../../contracts/CONTEXT.md#who-did-it"]
produces: ["Stored rows"]
---
# store — The database

Draft. The seam below is what other parts may rely on. The inner behaviour is written with this part's code. Piece 1 completes the tables piece 1 needs. Later pieces add their rows. Only this part talks to the database.

On Cloudflare the database is D1. On a PC it is one local file.

## What it owns

The tables, their upgrades, the yearly clean-out, and the export used for backup and restore. Each part's rows stay that part's. This part does not decide what the rows mean.

## What it never does

It never calls a model, never holds a Google sign-in, and never stores a mail body. There is no column for one.

## Operations

| Operation | Meaning | Level | Named results |
| --- | --- | --- | --- |
| `activity_list` | Who did what | You | `listed` |
| `settings_get` | Lanes, how long things are kept, how often mail is checked | Read | `settings` |
| `settings_set` | Change those settings | You | `changed` |
| `export_make` | A backup file of the Brief data | You | `made` |
| `export_restore` | Put a backup file back into an empty install | You | `restored`, `not_empty` |

Backup and restore are not one of the six build pieces. One tested backup and restore is part of the bar for retiring the earlier product. Until that exists, the host's database can be restored to an earlier minute for the period the host keeps.

## Hard rules

1. Only this part talks to the database.
2. A restore into an install that already has data returns `not_empty` and writes nothing.
3. Activity rows name the time, who, which operation, on what, and the result's name. They hold no message content.

## Inputs

- Working: None yet.
- Reference: [Who did it](../../contracts/CONTEXT.md#who-did-it)

## Process

1. Apply a table upgrade before serving a request that needs it.
2. Return one named result. Do not interpret a part's rows.

## Outputs

- Stored rows

## Check

When this part's code is written, a contributor searches a database that has sorted made-up mail and finds no mail body. A restore into an install that is not empty returns `not_empty`.
