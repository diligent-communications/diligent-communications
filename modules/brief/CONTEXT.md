---
build_step: 1
status: draft
consumes: ["../links/CONTEXT.md", "../store/CONTEXT.md", "../../contracts/CONTEXT.md#history-line", "../../contracts/CONTEXT.md#matter", "../../contracts/CONTEXT.md#operation", "../../contracts/CONTEXT.md#who-did-it", "../../contracts/CONTEXT.md#work"]
produces: ["The Brief, a matter and a search", "A matter's changes: edit in place and its state", "A message moved to another matter"]
---
# brief — The matters

One job: the matters on the Brief.

## What it owns

Each matter's fields, state and dated history, and how the Brief is grouped and filtered.

## What it never does

It never reads mail, and it never sends. It reads no other part's tables: what a matter's links hold comes from [links](../links/CONTEXT.md).

## Slice 2: the Brief, shown from made-up matters (complete)

### Inputs

- Working: `src/brief.ts`, `src/operations.ts`
- Reference: [links](../links/CONTEXT.md)
- Reference: [store](../store/CONTEXT.md)
- Reference: [Matter](../../contracts/CONTEXT.md#matter)
- Reference: [History line](../../contracts/CONTEXT.md#history-line)
- Reference: [Operation](../../contracts/CONTEXT.md#operation)
- Reference: [Who did it](../../contracts/CONTEXT.md#who-did-it)
- Reference: [Work](../../contracts/CONTEXT.md#work)

### Process

Operations, from the [operations table](../../map/target.md#operations):

| Operation | Input | Level | Named results |
| --- | --- | --- | --- |
| `brief_list` | `show` (`brief` or `waiting`, `brief` unless given), `lane` | Read | `brief` with `groups`, `lanes` and `counts` |
| `matter_get` | `matter` | Read | `matter` with `matter`, `messages`, `people` and `history`; `unknown_matter` |
| `matter_search` | `words`, 1 to 200 characters | Read | `found` with `matters` |
| `matter_edit` | `request_id`, `matter`, `version`, and any of `title`, `notes`, `due`, `kind`, `lane` | You | `changed` with `matter`; `already_so`; `unknown_matter` |
| `matter_set_state` | `request_id`, `matter`, `to` (`open`, `waiting`, `snoozed`, `done` or `dismissed`), `until` | You | `changed` with `matter`; `already_so`; `unknown_matter` |
| `link_move_message` | `request_id`, `link`, `to` | You | `moved` with `link`, `from` and `to`; `same_matter`; `unknown_link`; `unknown_matter` |

1. **Rows.** The matters are one table and their history another. A matter's row is never deleted: no operation removes one. Its ID is 16 random hexadecimal digits and is the row's key, so it never changes and is never used twice. The table refuses a field over its [limit](../../contracts/CONTEXT.md#matter), whoever writes it, and a snoozed matter without its time or another state with one.
2. **A new matter.** `newMatterWrites` makes the writes for a new matter and its first history line, "This matter was made.", under the name given. It refuses anything that is not exactly a matter within its limits. In this slice only the tests' made-up Brief calls it.
3. **The Brief.** `brief_list` shows the open matters, and the snoozed ones whose time has come, which stay snoozed until the person changes them. With `show` set to `waiting` it shows the matters marked waiting instead. A `lane` narrows either to that lane. The matters come in three groups, money, do and reply in that order, each with its count, even when it is empty. Within a group the matter that has waited longest is first: the owner's decision, stated once in `src/brief.ts`. In this slice a matter has waited since it was made. `lanes` lists the lanes of the matters on the Brief or marked waiting, whatever the filter, and `counts` gives how many are on the Brief and how many are waiting, in the lane given. Done and dismissed matters are not on it.
4. **A matter.** `matter_get` returns the matter; `messages`, its message links in force, newest first, each with its link ID, message, quote, sender and time; `people`, its person links that are proposed or accepted, each with its link ID, the person's ID and the link's state; and `history`, newest first. The person's name comes from [people](../people/CONTEXT.md)'s `person_get`, which the caller asks.
5. **History.** This part's changes add dated lines to its own table, under who made them: one for each field an edit changes, and one for each change of state. A link change is not written here: [links](../links/CONTEXT.md) keeps who made, accepted and removed each link and when, and `matter_get` shows those as dated lines on the matter each link belongs to. So a moved message shows on both matters.
6. **Search.** `matter_search` finds matters in any state whose title, next action, who owes it, summary, latest update, timing or notes hold the words, at most 50, newest made first. The words are bound as a value, never written into the query, and `%`, `_` and `\` in them are matched as themselves. Matching ignores the case of the letters A to Z.
7. **Edit in place.** `matter_edit` takes the `version` the caller was shown. A different current version answers `changed_since` with the matter as it is now. A field given its current value is not a change; when no field given differs, the answer is `already_so` and nothing is written. Each field that differs is changed, added to `set_by_you`, and given its own history line, and the version goes up by one. `notes` and `due` given empty clear them. A `due` that is not a real `YYYY-MM-DD` date, or a `lane` that is not a lane, answers `invalid_input`. What the person set stays theirs ([rule 12](../../map/target.md#rules-every-part-keeps)): this slice records the fields in `set_by_you`. Refusing an agent's change to one is proved where an agent can first write to a matter.
8. **State.** `matter_set_state` moves a matter to the state given; `open` is a reopen. `snoozed` needs `until`, a UTC time still to come, and no other state takes one. Asking for the state a matter already has, with the same time for a snooze, answers `already_so` and writes nothing. Otherwise the version goes up by one and one history line says what happened: "Marked done.", "Marked waiting.", "Snoozed until … UTC.", "Dismissed.", "Reopened." from done or dismissed, or "Back on the Brief." from waiting or snoozed.
9. **Moving a message.** `link_move_message`'s work is here, because only brief knows whether the matter a message goes to exists, and links reads no other part. A link that is not a message link answers `unknown_link`; one already moved or removed answers `changed_since`; a matter that does not exist answers `unknown_matter`; the matter the message is already on answers `same_matter`. Otherwise links' `moveWrites` marks the old link removed and adds the new one, and nothing is deleted.
10. **Two changes at once.** Each change rests on what its work read: the matter at a version, or a link in a state. Its writes begin with [store](../store/CONTEXT.md)'s `stillTrue` on exactly that, so if another change landed first the whole landing clashes and nothing is written. The [door](../operations/CONTEXT.md) then runs the work once more, and the answer is about how things are now: `changed_since` for an edit on the old version, `already_so` for a state already set, `changed_since` for a link already moved. A move also rests on the matter it goes to still being there.
11. **Who.** Every change and every refused change is recorded by the [door](../operations/CONTEXT.md), on `matter:<id>` when the matter is known. The history line names the caller as [who did it](../../contracts/CONTEXT.md#who-did-it). An agent is answered `not_allowed` on the three changes here, which are the person's.

### Outputs

- The Brief, a matter and a search
- A matter's changes: edit in place and its state
- A message moved to another matter

### Check

`npm test` passes, and each hard rule below has a test that fails when the rule is broken. The tests are in `test/brief.test.ts` unless another file is named. Each test loads the made-up Brief, which `test/helpers/made-up.ts` writes straight into a test install's own database. No operation, route or door loads it.

| Hard rule | Test |
| --- | --- |
| The Brief is grouped money, do, reply, each with its count, the longest waiting first, with no waiting, snoozed, done or dismissed matter | "the Brief is grouped by kind" |
| The lane is a filter, and the Waiting filter shows the matters marked waiting | "the lane is a filter" |
| A read gives the same answer from the screen, the command line and an agent at either level, and leaves no record ([rule 3](../../map/target.md#rules-every-part-keeps)) | "each read gives the same answer" |
| A matter's page holds its summary, latest update, people, messages and dated history | "a matter's page has" |
| Search finds matters in any state, and treats pattern characters as plain text | "search finds matters in any state" |
| A snoozed matter leaves the Brief until its time and returns | "a snoozed matter leaves the Brief" |
| A snooze needs a time still to come, and only a snooze takes one | "a snooze needs a time still to come" |
| Done, waiting, snooze, dismiss and reopen each add a history line; the state a matter has answers `already_so` and adds none; the ID never changes | "done, waiting, snooze, dismiss and reopen" |
| A done or dismissed matter leaves the Brief, is found by search, and one call reopens it | "a done or a dismissed matter leaves the Brief" |
| Each field edited in place changes, adds a history line and is recorded as set by the person | "each field edited in place" |
| A field given its own value changes nothing, and a bad value is refused | "several fields change in one edit" |
| A change on a stale copy answers `changed_since` | "a change made on a stale copy" |
| Changes sent at once never both land on the same copy | "two changes to one matter sent at once" |
| Every change by an agent answers `not_allowed` and is recorded under the agent ([rule 4](../../map/target.md#rules-every-part-keeps)) | "every change by an agent" |
| Every change by the person leaves one record under the person, on its matter | "each change by the person leaves one record" |
| Moving a message works, adds a line on both matters, deletes nothing, and refuses a bad move; one message moved twice at once is moved once | [links](../links/CONTEXT.md)' `test/links.test.ts`: the three tests about moving |
| A summary over 1,200 characters is refused, by `newMatterWrites` and by the table | `test/limits.test.ts`: the first two tests |
| The made-up Brief cannot reach a real install: no program code imports from a test folder | `test/limits.test.ts`: "no program code imports from a test folder" |

## Still to come in piece one (draft)

Draft. Sorting creates and updates matters from messages in slice 3, under the [sorting rules](../../map/target.md#rules-that-belong-to-one-part), including the refusal of an agent's change to a field the person set and the state changes a sort may make. "Source no longer available" for a message that is gone comes with mail.

### Open

- A matter has no time of last activity yet, so "waited longest" is "made earliest". Whether a later message moves a matter is settled with sorting.
- Counted as characters divided by four, this contract with its references and working files is about 9,500 tokens, above the 8,000-token guide for one read. Without the working files it is about 4,300.
