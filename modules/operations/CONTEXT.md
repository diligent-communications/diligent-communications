---
build_step: 1
status: draft
consumes: ["../store/CONTEXT.md","../../contracts/CONTEXT.md#who-did-it"]
produces: ["Checked calls"]
---
# operations — The one door

Draft. The seam below is what other parts may rely on. The inner behaviour is written with this part's code. Piece 1 completes the door. Later pieces add operations in the part that owns them. They do not change a shipped operation without changing its shared shape first.

One job: every change and every read enters here.

## What it owns

The list of operations is the operations named in the other part contracts. This part owns the level check, the request ID, and the record of who did what. It writes that record through [store](../store/CONTEXT.md). It never contains the work itself.

## What it never does

It never calls a model, never stores a mail body, and never sends mail or changes Google. It never tells the caller what to do next.

## Operations

This part adds no operation of its own. A call names an operation from a part contract. The level on that operation is the lowest level that may call it. Levels are Read, Prepare and You. What a caller may do depends on its sign-in, never on the way in. The screen, the command line and the agent connection use this one check. The agent connection accepts agent sign-ins only, so an operation at the person's level answers `not_allowed` there. An agent's level stops at Prepare. A `device` caller is named for the phone app. Its sign-in is defined in piece three. Until then the seam names the caller kind `device`.

Only an operation that changes something takes a request ID, and only that answer is kept. `sort_next` and every other read take none, so no kept answer ever holds a message's words. The same ID with the same input returns the same answer and changes nothing twice, except `agent_create`: the kept answer and a repeat return `created` without the token. The same ID with a different input returns `request_id_reused`.

Any operation can also return `not_signed_in`, `not_allowed`, `switched_off`, `invalid_input`, `request_id_reused`, `changed_since` or `unavailable`.

Every result has a name and a plain description that names what it is about. The description says what was found. It never says what to do. The screen gives the advice.

## Hard rules

1. Results say what was found, never what to do.
2. A repeat is safe. One operation's changes land together or not at all.
3. Not reachable, gone and empty are three different results. A part does not use one name for another.
4. Who did it is `you`, `agent:<id>`, `device:<id>` or `diligent`, as [Who did it](../../contracts/CONTEXT.md#who-did-it) says.

## Inputs

- Working: None yet.
- Reference: [Store](../store/CONTEXT.md)
- Reference: [Who did it](../../contracts/CONTEXT.md#who-did-it)

## Process

1. Refuse a caller who is not signed in, whose level is too low, or whose agent is switched off.
2. If the operation changes something and the request ID was used before, return the earlier answer or `request_id_reused`. A repeat of `agent_create` returns `created` without the token.
3. Do the named operation in the part that owns it, then record who did it.

## Outputs

- Checked calls

## Check

When this part's code is written, a contributor calls one operation twice with the same request ID and the same input and sees one change. A second call with the same ID and a different input returns `request_id_reused`. No result text tells the caller what to do.
