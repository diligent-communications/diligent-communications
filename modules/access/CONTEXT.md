---
build_step: 1
status: draft
consumes: ["../store/CONTEXT.md", "../../contracts/CONTEXT.md#agent", "../../contracts/CONTEXT.md#caller", "../../contracts/CONTEXT.md#level", "../../contracts/CONTEXT.md#operation", "../../contracts/CONTEXT.md#work"]
produces: ["The caller of a request", "The person's sign-in and the agent sign-ins"]
---
# access — Who is calling

One job: say who is calling, and at what level.

## What it owns

Sign-ins to this install, and the list of agents.

## What it never does

It never holds a Google sign-in.

## Slice 1: the door (complete)

### Inputs

- Working: `src/access.ts`, `src/secrets.ts`, `src/limits.ts`, `src/operations.ts`
- Reference: [store](../store/CONTEXT.md)
- Reference: [Agent](../../contracts/CONTEXT.md#agent)
- Reference: [Caller](../../contracts/CONTEXT.md#caller)
- Reference: [Level](../../contracts/CONTEXT.md#level)
- Reference: [Operation](../../contracts/CONTEXT.md#operation)
- Reference: [Work](../../contracts/CONTEXT.md#work)

### Process

1. `identify` takes what a request presents, a session or an agent token, and returns the [caller](../../contracts/CONTEXT.md#caller). A request that presents a token is that agent or nobody. It never falls back to a session. What counts as presenting a token is in step 5 of the [host](../host/CONTEXT.md) contract.
2. The door runs the work of the operations below. Each answer is one of the named results.

Operations, from the [operations table](../../map/target.md#operations). Secret inputs are marked (s).

| Operation | Input | Level | Named results |
| --- | --- | --- | --- |
| `password_set` | `password` (s), and `code` (s) or `current` (s) | — | `set`, `wrong_code`, `not_allowed`, `wrong_password`, `locked_out` |
| `sign_in` | `password` (s) | — | `signed_in`, `wrong_password`, `locked_out` with `until` |
| `sign_out` | none | You | `signed_out` |
| `whoami` | none | Read | `you` with `level`, `agent` with the agent's `id`, `name` and `level` |
| `agent_create` | `request_id`, `name`, `level` | You | `created` with `agent` and, the first time only, `token`; `name_taken` |
| `agent_list` | none | You | `listed` with `agents` |
| `agent_set` | `request_id`, `agent`, and `level` or `on` or both | You | `changed` with `agent`, `unknown_agent` |

The numbers below marked "proposal" were chosen while building. They are not decisions by the owner. Each is one constant in `src/limits.ts`.

**The set-up code.** The person who controls the install's hosting account makes it: a random value of at least 32 characters, kept as the install's secret `SETUP_CODE`. On Cloudflare only someone who controls that account can set a secret. On a PC it is a line in Cloudflare's local secrets file, `.dev.vars`, which git ignores, and the hosting account is whoever can write that file. The install never makes, shows or returns the code, and it is in no table. `password_set` with a code sets the password without a session, ends every other session, signs the calling device in as `sign_in` would, and uses the code up: the install keeps a SHA-256 fingerprint of it and refuses that code from then on. A new code in the secret is the way back from a forgotten password, and because it signs the device in, it gets the person in whatever the password lock says. Agent sign-ins stay as they are. No code set, or one shorter than 32 characters, means every code is answered `wrong_code`.

A wrong set-up code is not locked. A lock here would let a stranger who keeps trying block the one way back. A random code of that length cannot be guessed, so its length is the limit, and it is compared in constant time.

**Changing the password while signed in** needs the session and `current`, the current password, so a borrowed session cannot change it. It ends every other session. `password_set` with neither a code nor a session answers `not_allowed`.

**Wrong passwords.** 5 wrong tries in a row start a lock of 15 minutes (both proposals). It covers `sign_in` and the current password in `password_set`.

A try is counted before it is checked. The count is one statement that the database runs whole, and it lands apart from the rest of the call, so it stands even if the call does not finish. That statement lets a try through only while fewer than 5 are counted and no lock is running, and the try that takes the fifth place starts the lock in the same statement. So tries sent at once cannot all be checked, each raises the count by exactly one, and one lock has one try that started it. That try answers `locked_out` with the time the lock ends, unless it is right.

A try the statement does not let through is refused without being checked, right or wrong, and changes nothing, so it cannot lengthen the lock. A wrong answer writes nothing more. A right password clears the count, and clears a lock only when that same try started it: a late answer never clears or shortens a lock another try started. The lock ends by itself.

The lock stops new sign-ins only: a device that is already signed in keeps working. So a stranger can delay a new sign-in while they keep trying, and can never lock the person out for good, because the set-up code is never locked and signs the person in.

**Writes that rest on an earlier read.** A write is landed only while what it was decided on is still true, with [store](../store/CONTEXT.md)'s `stillTrue`. Otherwise the work runs again and answers about how things are now.

- `sign_in` starts a session only if the password it checked is still the password. One that was checking the old password while a change or a reset landed starts none.
- `password_set` with the current password writes only if that is still the password and the caller's session still stands. If the session was ended meanwhile it answers `not_signed_in`.
- `agent_set` writes only the fields it was given, and only if the agent is as it was read. A level change never switches an agent on or off, and the answer says how the agent is now.

**Sessions.** The password is typed once per device. A session ends at `sign_out` on that device, at a password change or reset as above, or by itself after 90 days without use (a proposal). Using it starts the 90 days again.

**Callers with no session.** `sign_in` and `password_set` are the only operations a caller with no sign-in may call. For such a caller `password_set` sets a password only with an unused set-up code. With any other code, or with none, it is answered as the paragraphs above say, never `not_signed_in`. Both operations are the person's: an agent sign-in is answered `not_allowed`. Beside them, [host](../host/CONTEXT.md) serves the screen's own files to anyone. Every other operation answers `not_signed_in`.

**How each sign-in is kept.** The password is kept as a slow hash: scrypt from the runtime's built-in `node:crypto`, with N=32768, r=8, p=3, a 16-byte random salt and a 32-byte result. That is one of the settings OWASP lists for scrypt, and it needs about 32 MB of memory. The settings are stored with the hash, so the cost can change later. A password is 16 to 1,024 characters (16 is a proposal). A session and an agent token are each 32 random bytes from the runtime's own generator, kept as a SHA-256 fingerprint, which is enough for a value that long.

### Outputs

- The caller of a request
- The person's sign-in and the agent sign-ins

### Check

`npm test` passes, and each hard rule below has a test that fails when the rule is broken. The tests are in `test/sign-in.test.ts` and `test/levels.test.ts` unless another file is named.

| Hard rule | Test |
| --- | --- |
| Every sign-in is kept only as a hash or a fingerprint, and none is in a result or a record, except the one answer that first shows a token | [store](../store/CONTEXT.md)'s `test/nothing-secret.test.ts` |
| The password is kept as a salted slow hash that carries its settings, and a session and a token are 32 random bytes | `test/secrets.test.ts` |
| The first password needs the set-up code, and a used code is refused | "the first password needs the set-up code" |
| A wrong set-up code is refused however often it is tried, and never locks | the same test |
| No set-up code, or a short one, refuses every code | "an install with no set-up code" |
| A new set-up code resets the password, ends every other session and leaves agents | "a new set-up code is the way back" |
| A reset by set-up code signs the calling device in, even while the password is locked | "with the password locked, a reset by set-up code still gets the person in" |
| Without a code, `password_set` needs the session and the current password | "once a password exists" and "changing the password while signed in" |
| Wrong tries lock the password, the lock ends by itself, and a signed-in device keeps working | "a wrong password is refused" and "a wrong current password counts toward the lock" |
| Tries sent at once cannot get past the lock, each raises the count by one, and one lock leaves one line | "wrong tries sent all at once cannot get past the lock", "each wrong try raises the count by one", "wrong current passwords sent all at once", and `test/overlap.test.ts`: "of many tries sent at once, the password is read and checked for only as many as are allowed" |
| A late answer never clears or shortens a lock another try started | `test/overlap.test.ts`: "a right password that lands late signs in, and does not clear a lock" |
| A sign-in that was checking the old password while it was changed or reset starts no session | `test/overlap.test.ts`: the two tests that begin "a sign-in that was checking the old password" |
| A password change whose session ended, or whose password was replaced, while it was in flight writes nothing | `test/overlap.test.ts`: the three tests about a password change |
| `agent_set` writes only the fields given, and a level change never switches an agent back on | `test/overlap.test.ts`: "a level change that overlaps a switch-off", "agent_set writes only the fields it was given" |
| `sign_out` ends that device's session and no other | "sign_out ends the session on that device" |
| A session ends by itself when unused | "a session ends by itself" |
| A caller with no sign-in may call `sign_in` and `password_set` only | "a caller with no sign-in" |
| An agent's level stops at Prepare, and a Read agent is refused a change | "a Read agent", "no agent, at either level" |
| A switched-off agent is refused on its very next call, on every operation and on the agent connection, and switching it off erases nothing | "a switched-off agent is refused everything" |
| A lost token is replaced by making a new agent: no operation shows a token again | "an agent is listed" and [operations](../operations/CONTEXT.md)' repeat test |

## Still to come in piece one (draft)

Draft. `device_list` and `device_remove`, and the first-run walk around these operations, are not written. The [target map](../../map/target.md#rules-that-belong-to-one-part) is the plan for them. A caller kind `device` is defined in piece three.

### Open

- What only a real install can show: Cloudflare's free plan allows 10 ms of processor time for a request, and the password hash costs more than that. It runs only in `sign_in` and `password_set`, and it is made before anything is written, so a request cut off there fails whole. Whether the free plan lets it finish, and what to do if it does not, is the owner's decision at the trial.
- A passkey can be added later. It is not how the person signs in now.
- Counted as characters divided by four, this contract with its references and working files is about 11,300 tokens, above the 8,000-token guide for one read. Without the working files it is about 4,600.
- Rows of sessions that have ended by themselves stay until the clean-out is written.
