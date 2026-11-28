---
build_step: 1
status: draft
consumes: ["../access/CONTEXT.md", "../app/CONTEXT.md", "../mcp/CONTEXT.md", "../operations/CONTEXT.md", "../store/CONTEXT.md", "../../contracts/CONTEXT.md#answer", "../../contracts/CONTEXT.md#caller"]
produces: ["The running program", "The address of each operation, and the session cookie"]
---
# host — The running program

One job: take each request, send it to the right place, and run the schedule.

## What it owns

The routes and the timer.

## What it never does

It never decides a message, a matter or a send. It never keeps a sign-in, and it never runs a database query: it hands the database to [store](../store/CONTEXT.md).

## Slice 1: the door (complete)

### Inputs

- Working: `src/worker.ts`, `src/body.ts`, `src/addresses.ts`, `../../wrangler.jsonc`
- Reference: [access](../access/CONTEXT.md)
- Reference: [app](../app/CONTEXT.md)
- Reference: [mcp](../mcp/CONTEXT.md)
- Reference: [operations](../operations/CONTEXT.md)
- Reference: [store](../store/CONTEXT.md)
- Reference: [Answer](../../contracts/CONTEXT.md#answer)
- Reference: [Caller](../../contracts/CONTEXT.md#caller)

### Process

The program is one Cloudflare Worker, set up by `wrangler.jsonc` at the repository root. The same code runs on Cloudflare and on Cloudflare's local runtime on a PC, where the database is one local file. It is bound to the database and to one secret, the set-up code, and to nothing else.

For each request:

1. The screen's own files are served to anyone, as plain files. They say nothing about the install.
2. Any other address that is not an operation's or the agent connection's answers 404.
3. A request that a page on another site started is refused, before anything else looks at it. A browser says where a request started, in its `Origin` and `Sec-Fetch-Site` headers. A caller that is not a browser sends neither.
4. On the agent connection, [access](../access/CONTEXT.md) identifies the caller from the token after `Bearer`. A request with no agent sign-in answers `not_signed_in` before the protocol handler reads it. The host then reads the body itself, once, up to the size limit in step 5, for every agent. A body over the limit is refused before the handler, and a working agent is answered `invalid_input`. So there is no call a working agent could make that the host could not read.

   Every request from an agent that is switched off is refused here too, the handshake and the tool list included. It answers `switched_off`, and nothing that token sent reaches the handler, because an agent is often switched off when its token may have leaked.

   What that refused request records is said here and nowhere else. The host reads the tool calls in the body as plain JSON, without the protocol library: one request, or each request in an array of up to 100, which is what the handler takes. For each tool call that names an operation that changes something, the [door](../operations/CONTEXT.md) records one refusal, as it does for the same call on the operation address: one line each, by that agent, all landed together. Nothing else is recorded: not a connect, a handshake, a tool list, a read, a tool that is no operation, a body over the limit, an array of more than 100, or a body that cannot be understood. The reading errs toward recording. It does not repeat the handler's other checks, so a call the handler would have turned away for another reason, such as a missing header or a broken neighbour in the same array, is still recorded.

   Otherwise [mcp](../mcp/CONTEXT.md) answers, and is handed the body that was read.
5. An operation is a POST of JSON, of at most 65,536 bytes, to `/api/` followed by its name. A body is read from the stream with a hard stop: the length a request declares is neither needed nor trusted, the bytes are counted as they arrive, and nothing past the limit is read. The agent connection uses the same reader and the same limit. A read is a POST too, so no operation can be called by following a link. Access identifies the caller from the session cookie or the token, and the [door](../operations/CONTEXT.md) runs the call. Every outside request is identified before the door runs it.

   A request that carries an `Authorization` header at all presents a token, here and on the agent connection, and is judged by that header alone: the word `Bearer` in any case, one space, and one token. A header that cannot be read that way is a token no install made. So such a request is a caller with no sign-in, whatever session cookie comes with it.
6. The answer goes back as JSON, marked not to be stored. When the door hands back a session to begin or end, it travels in the cookie `diligent_session`, never in the answer. The cookie is hidden from page scripts, is never sent with a request another site started, and is sent only over HTTPS, except on the PC's own address (`localhost`, `127.0.0.1`, `[::1]`).
7. If anything fails, the answer is `unavailable`. The failure is not logged or returned, because it could hold what was sent. A failure inside a tool call on the agent connection answers the same: see [mcp](../mcp/CONTEXT.md).

### Outputs

- The running program
- The address of each operation, and the session cookie

### Check

`npm test` passes, and each hard rule below has a test that fails when the rule is broken.

| Hard rule | Test |
| --- | --- |
| A request another site's page started is refused, even with the person's cookie | [access](../access/CONTEXT.md)'s `test/sign-in.test.ts`: "a request another site's page started is refused" |
| The session cookie is hidden from scripts, kept from other sites, and HTTPS-only off the PC's own address | the same file: "the session cookie is hidden from page scripts" |
| A request that carries an `Authorization` header is judged by that header alone, never by a session cookie beside it | [access](../access/CONTEXT.md)'s `test/levels.test.ts`: "a request that carries an Authorization header" |
| The agent connection refuses a request with no agent sign-in before the protocol handler reads it | [access](../access/CONTEXT.md)'s `test/levels.test.ts`: "the agent connection refuses a request" |
| The agent connection refuses every request from a switched-off agent the same way, with `switched_off` | the same file: "a switched-off agent is refused everything" |
| Every changing tool call the handler would run for a working agent is one recorded refusal for a switched-off one, and nothing else is recorded | `test/agent-connection.test.ts`: one test for each request shape in its table, each sent as both agents. The table holds both forms of the agent protocol that the handler runs |
| One size limit for every body, read with a hard stop, on both addresses | `test/agent-connection.test.ts`: "a body is read up to the limit and no further", "a body over the size limit is refused for a working agent", "a body far over the size limit is never handled". `test/routes.test.ts`: "the host reads a request body in one place only" |
| An operation is called only by a POST of JSON to its own address | `test/routes.test.ts`: "an operation is called with a POST of JSON" |
| The database is the only binding, besides the one secret | `test/routes.test.ts`: "the database is the only thing the program is bound to" |
| A failure answers `unavailable` and says nothing about what failed | `test/routes.test.ts`: "when the install cannot finish", and "when the install cannot finish a tool call" for both forms of the agent protocol |
| The same code runs on a PC with the database as a local file, which outlives a restart and holds no sign-in | `test/local-file.test.ts` |
| The binding types file matches the settings file | `test/routes.test.ts`: "the binding types file matches the settings file" |

## Still to come in piece one (draft)

Draft. The schedule is not written, because no operation in this slice is called on a schedule. Anything scheduled will only call an ordinary operation, as `diligent`. Deployment to Cloudflare is not part of this slice. The [target map](../../map/target.md#the-parts) is the plan.

### Open

- Counted as characters divided by four, this contract with its references and working files is about 12,500 tokens, above the 8,000-token guide for one read, because it reads five other contracts whole.
- On the local runtime, when the program stops reading a body far over the limit, the tooling in front of it can drop the connection instead of passing on the refusal. The request is refused either way, and nothing is recorded. What Cloudflare itself does then is not known here.
- On a custom address, the agent protocol handler needs the install's own host name named in its settings. That is settled with deployment.
- Cloudflare's local runtime is a development tool and is not a hardened sandbox. Running an install on a PC for real use is not settled.
