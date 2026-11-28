---
consumes: []
produces: ["Shared shapes"]
---
# contracts — Define the shapes parts share

## Inputs

- Working: None yet.
- Reference: None.

## Process

1. Keep each shared shape here. A part links the heading it uses. It does not copy the fields.

## Outputs

- Shared shapes

## Check

A contributor checks that both sides of a handoff use the same fields. A draft shape below has no version number until code reads it. The first code that reads it publishes version 1, and the version rule then applies.

## Version rule

Each shape that has a version number has its own whole number, starting at 1. Any change to its fields raises it. A reader accepts the versions it knows and refuses a newer one with a clear message, without rewriting it. All times are UTC.

## Shared shapes

These headings are the seam. They are draft: the fields are what other parts may rely on, and the code that reads and writes them is not written yet. A quote is at most 300 characters and a summary is at most 1,200. Those two limits are proposals, not a decision by the owner.

### Prepared reply

Draft. No received mail body is stored. A prepared reply is stored with its matter and holds only the new words, never the quoted original.

### Matter

Draft.

| Field | Meaning |
| --- | --- |
| `id`, `version` | Permanent random ID. A counter that goes up with every change. The ID never changes and is never reused |
| `kind` | `money`, `do` or `reply` |
| `lane` | One of the person's lanes |
| `title`, `next_action`, `owed_by`, `summary`, `latest_update`, `timing` | What the line says. `owed_by` is the person, the other party, or a name. `summary` is at most 1,200 characters |
| `state` | `open`, `waiting`, `snoozed` (until a date), `done` or `dismissed` |
| `main_action` | `reply`, `schedule`, `contact` or `none` |
| `notes`, `due` | The person's only |
| `set_by_you` | Which fields the person has edited. An agent does not overwrite those. State is not one of these fields |

### Source message

Draft. There is no field for a mail body, a subject or a sender.

| Field | Meaning |
| --- | --- |
| `kind`, `account`, `provider_id` | Identity. `kind` is `mail`, `text` or `call`. `account` is this install's ID for the account or phone. `provider_id` is the provider's own ID. The same Google account keeps the same `account` after a new sign-in |
| `thread`, `happened_at`, `noticed_at`, `hints` | The provider's thread, the two UTC times, and label IDs. Labels from the mail client arrive in `hints` |
| `reachable` | `yes`, `gone` or `not_reachable`. Those are three different values |
| `outcome` | None yet (waiting), `no_action`, `linked`, or `held` with a reason |
| `outcome_by`, `outcome_at`, `run` | Who recorded it, when (UTC), and in which run |

### Person

Draft. `id`, `name`, ways to reach them, and `confirmed` (`yes` or `no`). A later piece may add the matching Google contact. A name found in a message is not a confirmed person.

### Link

Draft. `id`. `kind` is message to matter, matter to person, or later matter to project. The two ends. `state` is `proposed`, `active` or `removed`. Who made it and when, who accepted it and when, who removed it and when. A link is never deleted, only marked `removed`.

A message-to-matter link also carries a quote of at most 300 characters, the sender's name and the date. The quote is not a stored mail body.

### Agent

Draft. `id`, `name`, `level` (`read` or `prepare`), on or off, when made, and when last used. `prepare` is the highest level an agent can hold.

### Sort run

Draft. `run`, the agent, started, last activity, ended, and how it ended (`finished`, `stopped` or `timed_out`). The receipt, once given, never changes. Per account it counts offered, no action, linked, held, gone and left waiting, and one word, `complete` or `partial`. `complete` means every listed message is in those counts and none are left waiting.

### Who did it

Draft. `you`, `agent:<id>`, `device:<id>`, or `diligent`. Every change records one of these. `device:<id>` is the phone app. Its sign-in is defined in piece three.
