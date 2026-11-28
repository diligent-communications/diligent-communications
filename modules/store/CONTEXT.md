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

The tables, their upgrades, removing what has aged out, and the export used for backup and restore. Each part's rows stay that part's. This part does not decide what the rows mean. sources does not own a clock.

## What it never does

It never calls a model, never holds a Google sign-in, and never stores a mail body. There is no column for one.

## Operations

| Operation | Meaning | Level | Named results |
| --- | --- | --- | --- |
| `activity_list` | Who did what | You | `listed` |
| `settings_get` | The settings listed below | Read | `settings` |
| `settings_set` | Change those settings | You | `changed` |
| `export_make` | A backup file of the Brief data | You | `made` |
| `export_restore` | Put a backup file back into an empty install | You | `restored`, `not_empty` |

The settings are the lanes, how long each kind of row is kept, how often mail is checked, `handover_level` (`full` or `reference`, `full` unless changed), and how far back a newly connected mailbox is sorted (14 days unless changed).

`export_make` leaves out outside sign-ins, the password hash and token hashes. After a restore the person sets a password and connects each account again.

Backup and restore are not one of the six build pieces. Until they exist, the host's database can be restored to an earlier minute for the period the host keeps.

How long each kind is kept:

| Record | Kept |
| --- | --- |
| Accounts, and the encrypted sign-in | Until the person disconnects. Then the sign-in is erased. The backup never holds it |
| Source messages | Linked ones as long as their matter. Others one year |
| Text and call words | One year. Audio is never kept once transcribed |
| Matters, people, projects, goals, steps | Until the person deletes them |
| Matter history, links, prepared actions | With the matter |
| Agents, devices, sessions | Until removed. The backup never holds a password hash or a token hash |
| Sort runs and receipts | One year |
| Request IDs | 30 days |
| Activity | One year. No message content and no token |
| Settings | Always |

The year for unlinked message IDs, the 30 days, and the size limits on a quote and a summary are proposals, not decisions by the owner. The year for text and call words is the period this design uses.

## Hard rules

1. Only this part talks to the database.
2. A restore into an install that already has data returns `not_empty` and writes nothing.
3. Activity rows name the time, who, which operation, on what, and the result's name. They hold no message content and no token.
4. This part removes a row when its kept period has ended. The periods are the table above.

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
