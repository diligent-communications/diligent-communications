---
build_step: 1
status: draft
consumes: ["../host/CONTEXT.md", "../operations/CONTEXT.md", "../../contracts/CONTEXT.md#answer", "../../contracts/CONTEXT.md#operation"]
produces: ["The `diligent` command: one operation per command"]
---
# cli — The command line

One job: `diligent` on the person's PC.

## What it owns

Nothing about mail or matters. It owns its session file on that PC.

## What it never does

It never holds a Google sign-in, it never writes the database, and it never keeps the password.

## Slice 1: the door (complete)

### Inputs

- Working: `src/diligent.ts`, `src/bin.ts`
- Reference: [host](../host/CONTEXT.md)
- Reference: [operations](../operations/CONTEXT.md)
- Reference: [Answer](../../contracts/CONTEXT.md#answer)
- Reference: [Operation](../../contracts/CONTEXT.md#operation)

### Process

A command is an operation: `diligent <operation> --<input> <value>`. Run it from the repository root as `node modules/cli/src/bin.ts`, or as `diligent` after `npm link`.

1. The operation's name and inputs come from the [operations list](../operations/CONTEXT.md). An unknown operation or input is refused here and nothing is sent. What was typed is never said or printed back where it could be a secret typed in the wrong place: not an input's value, not a name the list does not hold, and not an address that is refused. One typed thing is said back: an address the command line accepted, which is a scheme, name and port and nothing more, when the install there does not answer.
2. A secret input is never a command-line argument. It is asked for without being shown, or read as one line from a pipe. One given as an argument is refused and nothing is sent. An optional secret is asked for when it is named without a value, such as `--code` or `--current`.
3. For an operation that takes a request ID, one is made up unless `--request_id` gives one. Give the same one again to repeat safely.
4. The call goes to the install as the [host](../host/CONTEXT.md) describes, with the session as a cookie. An install's address is its scheme, name and port. A plain `http://` address is refused unless it is this PC's own, before a secret is asked for, so neither a session nor a typed password travels in the clear. A redirect is an error and is never followed.
5. It prints what the operation returned and adds nothing of its own. Anything it says itself, such as a question or a failure, goes to standard error. It ends with 0 when an answer was printed and with 1 when there is none to print.
6. The session file is `session.json` in the folder `DILIGENT_HOME` names. With that unset it is in the PC account's own settings folder: `%APPDATA%\diligent` on Windows, and `$XDG_CONFIG_HOME/diligent` or `~/.config/diligent` elsewhere. It holds the install's address, given once with `--install`, and the session. It never holds the password. A session belongs to the address that issued it: it is sent nowhere else, and it is dropped at once when `--install` names another address. The new address is remembered only after it has answered as an install does, so a mistyped one that fails is never where a later command sends a typed password. A session the install answers `not_signed_in` to is dropped too.

The command line stays signed in as the person, once per device. The limit that comes with that is [rule 6](../../map/target.md#rules-every-part-keeps).

### Outputs

- The `diligent` command: one operation per command

### Check

`npm test` passes, and each hard rule below has a test in `test/command-line.test.ts` that fails when the rule is broken.

| Hard rule | Test |
| --- | --- |
| It keeps its session on that PC and never the password | "the command line stays signed in on that PC" |
| It prints what the operation returned and adds nothing of its own | "it prints what the operation returned" |
| A secret is never a command-line argument | "a secret is never a command-line argument" |
| With no answer it prints nothing and ends with 1 | "when there is no answer to print" |
| No value, unknown name or refused address typed on the line is said or printed back. An accepted address is, when it does not answer | "nothing typed on the line that could be a secret is ever said or printed back", and "when there is no answer to print" for the address |
| A session is sent only to the address that issued it, and dropped when the address changes | "a session is sent only to the address that issued it" |
| A new address is remembered only after it answers as an install | "a new address is remembered only after it answers as an install" |
| A plain `http://` address is refused unless it is this PC's own | "a plain http address is refused" |
| A redirect is an error and is never followed | "a redirect is an error and is never followed" |
| A session the install no longer knows is dropped | "a session the install no longer knows" |
| The session file goes where `DILIGENT_HOME` says | "the program itself runs" |
| It prints a new agent token once and no other sign-in | [store](../store/CONTEXT.md)'s `test/nothing-secret.test.ts` |

## Still to come in piece one (draft)

Draft. The local bridge an agent can start, `diligent mcp`, is not written. The [target map](../../map/target.md#the-parts) is the plan for it.

### Open

- Counted as characters divided by four, this contract with its references and working files is about 8,700 tokens, just above the 8,000-token guide for one read, because it reads the host contract whole.
- On Windows the session file is protected by the PC account's own folder, not by a rule on the file.
- Typing a secret at a keyboard without it being shown is not covered by a test, because a test has no keyboard. The piped line is.
