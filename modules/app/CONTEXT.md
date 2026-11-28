---
build_step: 1
status: draft
consumes: ["../host/CONTEXT.md", "../operations/CONTEXT.md", "../../contracts/CONTEXT.md#answer", "../../contracts/CONTEXT.md#matter", "../../contracts/CONTEXT.md#operation"]
produces: ["The screen: the Brief, a matter, search and settings"]
---
# app — The screens

One job: the screens the person sees.

## What it owns

Layout, wording, the advice shown beside a result, and the screens of the first-run walk.

## What it never does

It never talks to the database or to Google, and it never calls a model. It never runs a command: it only calls operations.

## The screen (complete for slices 1 and 2)

### Inputs

- Working: `public/index.html`, `public/app.js`, `public/app.css`, `public/_headers`
- Reference: [host](../host/CONTEXT.md)
- Reference: [operations](../operations/CONTEXT.md)
- Reference: [Answer](../../contracts/CONTEXT.md#answer)
- Reference: [Matter](../../contracts/CONTEXT.md#matter)
- Reference: [Operation](../../contracts/CONTEXT.md#operation)

### Process

1. The screen is plain files in `public/`: one page, one script, one stylesheet. There is no build step. The [host](../host/CONTEXT.md) serves them to anyone, and they say nothing about the install.
2. Every control calls one operation, as one call to the operation's address as the host describes. The script never talks to anything else. For an operation that takes a request ID, the script makes one up for each change, and sends it once more with the same ID if the install did not answer, so the change is made at most once.
3. Nothing an operation returns is ever written into the page as HTML: the script sets every word as text. The page's own rules, in `_headers`, let it load only its own script and stylesheet and call only its own install. The page holds no script of its own.
4. A result says what was found. The advice beside it is the screen's own, from one list in `app.js`.
5. The page has four views, chosen by the address after `#`: the Brief, a matter's page, search, and settings. The bar at the top is the same on each: Diligent, Search and Settings. A view whose operation answers `not_signed_in` sends the person to settings to sign in.
6. **The Brief** is one page, from `brief_list`, designed for a phone first. One row of chips filters it: All, each lane in use, and Waiting with its count. The row scrolls sideways when it is full and never wraps. Below it, a place is kept empty for the freshness lines that come with sorting. The matters come in their groups, Money, Do and Reply, each with its count. Each line shows its title with its lane at the right, then one muted line of the next action, the timing (or the due date the person set, written the same way) and who owes it. Under that are the line's only controls, in the same places on every line: the main action at the left (Reply, Schedule or Contact, as the matter's `main_action` says, or nothing), and Done, Source and "more" at the right. The main action is the one thing on a line that looks like a button. "More" opens a sheet from the foot of the screen with Waiting (or Back on the Brief, for a matter marked waiting or snoozed to a time still to come), Snooze until tomorrow morning, until Monday morning or until a day picked, each at 8 in the person's own time, and Dismiss. Done and each choice in the sheet show a short notice. When the change was made, its Undo calls `matter_set_state` to put the matter back as it was: open, waiting, or snoozed until the same time when that time is still to come (a snooze whose time had come had put the matter on the Brief, so it goes back open). It is recorded like any other change. A notice offers no Undo when the change was not made or Undo would ask for what was just set. An empty Brief says so in one line, about the filter chosen: "Nothing in Work needs you right now." A Brief that cannot be loaded says so in one line, with Try again.
7. **A matter's page**, from `matter_get`: the title, the state with Done and "more" (or Reopen when it is done or dismissed). A snoozed matter whose time has come is on the Brief, and its page says so, not when it was snoozed until. Then the summary and latest update, then Kind, Lane, Due and Notes, one row each. Notes keep their line breaks. The title and those four are edited in place: Edit turns the value into a control with Save and Cancel, and Save calls `matter_edit` with the version shown. If the matter changed first, the page says so and shows it as it is now. Then who the matter is with, by name from `person_get`, a proposed person marked Unconfirmed with Accept and Remove. A name that could not be loaded says so, and is not shown as a person no longer on record. Then the messages behind it, each with the sender's name, the date and the quote, and "Move to another matter", which calls `link_move_message` with a matter picked from those on the Brief or marked waiting; and the dated history, naming who made each change. The agents' names are kept from the first page that loads them. No operation removes an agent, so a name the kept list lacks means it is old: it is loaded once more, and a name still missing, or a list that cannot be loaded, is shown as a name that could not be loaded. The main action opens this page with one quiet line under the title saying that preparing a reply, an event or a contact change comes with a later piece. Source opens it at its messages.
8. **Search** calls `matter_search`, and lists what it finds with each matter's state, done and dismissed ones included, each opening its page.
9. **Settings** holds the forms of the first slice, one form for each of `password_set` (with the set-up code, and changing it while signed in), `sign_in`, `whoami`, `sign_out`, `agent_create`, `agent_list`, `agent_set` and `activity_list`. A form takes the inputs its operation takes; a secret is typed into a field that hides it. Each form shows what its operation returned: the result's name, its description, its other fields, and the advice. Signing in, or setting the password with the set-up code, then opens the Brief.
10. Every control a thumb uses is at least 44 by 44 CSS pixels. A title link takes a tap over at least 44 px of height, beyond its text, without changing the layout. That area never reaches the line's controls: a line with nothing on its meta row leaves the row out, and its title row is 44 px tall and holds the tap area. Controls are real buttons, links and labelled fields, so the screen works with a keyboard and a screen reader, and keyboard focus shows a ring.
11. The look starts from GitHub's Primer design tokens, with one accent colour, Primer's accent blue. The values in `app.css` are copied from `@primer/primitives` 11.10.0 (MIT), with its licence notice in `LICENSE-PRIMER`. Light and dark follow the system setting. The icons are three plain shapes drawn in the script and the page. No other design system or component library is used.

### Outputs

- The screen: the Brief, a matter, search and settings

### Check

`npm test` passes, and each hard rule below has a test in `test/screen.test.ts` that fails when the rule is broken. A person also looks at the screen in a browser at phone width; that look is reported with each change, and is not a test.

| Hard rule | Test |
| --- | --- |
| Every operation can be called from the screen, by a form or by the script, and a form takes only what its operation takes | "every operation is called from the screen" |
| The script makes up a request ID for exactly the operations it calls that take one | the same test |
| The screen only calls operations, at their addresses | "the screen calls an operation at its address" |
| Nothing an operation returns is written into the page as HTML | "nothing an operation returns is written into the page as HTML" |
| A line shows its next action, timing or due date the same way, and who owes it; a lane is shown with a capital and stored in lowercase | "a line shows its next action" |
| A snooze comes back at 8 in the morning in the person's own time | "a snooze comes back at 8 in the morning" |
| Undo puts a matter back as it was, a snooze still to come included, and is never offered when it would change nothing | "Undo puts a matter back as it was" |
| A matter's page has Done unless the matter is done or dismissed, and never shows a snooze whose time has gone | "a matter's page has Done" |
| An empty Brief says so about the filter chosen | "an empty Brief says so about the filter chosen" |
| A name that could not be loaded is not shown as gone | "a name that could not be loaded is not shown as gone" |
| An agent name the kept list lacks is loaded again once, and if still missing could not be loaded | "an agent name the kept list lacks is loaded again once" |
| A title link takes a tap at least 44 px tall, and never over the line's controls | "a title link takes a tap" |
| The advice is the screen's own, and every result that refuses has some | "the advice beside a result is the screen's own" |
| The page loads only its own files | "the install serves the screen to anyone" |
| The look uses the Primer tokens, with the licence notice beside them | "the stylesheet uses the Primer tokens" |
| The screen's request gives the same answer as the other ways in | [operations](../operations/CONTEXT.md)' `test/three-ways.test.ts`, and [brief](../brief/CONTEXT.md)'s `test/brief.test.ts`, which send the request `app.js` builds |

## Still to come in piece one (draft)

Draft. The freshness lines at the top of the Brief, opening the original message, a person's page and the first-run walk are not written. The [target map](../../map/target.md#the-parts) is the plan for them.

### Open

- Counted as characters divided by four, this contract with its references and working files is about 23,700 tokens, far above the 8,000-token guide for one read, because the screen's own files are large. Without them it is about 7,600.
- No test runs the page in a browser. The tests send the request the page's script builds, read the page's HTML and script, and call the script's own functions. Those functions decide what the page shows; that the page's drawing code calls them, and draws what they decide, is not tested. What a person sees, the 44-pixel controls, the sheet, Undo, the edits in place and the move were looked at in a browser at phone width, not tested.
- To look at the screen with the made-up Brief: `node modules/app/test/look.ts` starts a local install that only this PC can reach, with a new password printed for that run. It stops with Ctrl+C, or by itself after an hour.
