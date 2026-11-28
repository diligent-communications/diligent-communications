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

- Working: `src/worker.ts`, `src/addresses.ts`, `../../wrangler.jsonc`
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
4. On the agent connection, [access](../access/CONTEXT.md) identifies the caller from the token after `Bearer`. A request with no agent sign-in answers `not_signed_in` before the protocol handler reads it. So does every request from an agent that is switched off, the handshake and the tool list included: it answers `switched_off`. An agent is often switched off because its token may have leaked, so nothing that token sends reaches the handler. Because the request is not read, it leaves no activity line. Otherwise [mcp](../mcp/CONTEXT.md) answers.
5. An operation is a POST of JSON, of at most 65,536 characters, to `/api/` followed by its name. A read is a POST too, so no operation can be called by following a link. Access identifies the caller from the session cookie or the token, and the [door](../operations/CONTEXT.md) runs the call. Every outside request is identified before the door runs it.
6. The answer goes back as JSON, marked not to be stored. When the door hands back a session to begin or end, it travels in the cookie `diligent_session`, never in the answer. The cookie is hidden from page scripts, is never sent with a request another site started, and is sent only over HTTPS, except on the PC's own address (`localhost`, `127.0.0.1`).
7. If anything fails, the answer is `unavailable`. The failure is not logged or returned, because it could hold what was sent.

### Outputs

- The running program
- The address of each operation, and the session cookie

### Check

`npm test` passes, and each hard rule below has a test that fails when the rule is broken.

| Hard rule | Test |
| --- | --- |
| A request another site's page started is refused, even with the person's cookie | [access](../access/CONTEXT.md)'s `test/sign-in.test.ts`: "a request another site's page started is refused" |
| The session cookie is hidden from scripts, kept from other sites, and HTTPS-only off the PC's own address | the same file: "the session cookie is hidden from page scripts" |
| The agent connection refuses a request with no agent sign-in before the protocol handler reads it | [access](../access/CONTEXT.md)'s `test/levels.test.ts`: "the agent connection refuses a request" |
| The agent connection refuses every request from a switched-off agent the same way, with `switched_off` and no activity line | the same file: "a switched-off agent is refused everything" |
| An operation is called only by a POST of JSON to its own address | `test/routes.test.ts`: "an operation is called with a POST of JSON" |
| The database is the only binding, besides the one secret | `test/routes.test.ts`: "the database is the only thing the program is bound to" |
| A failure answers `unavailable` and says nothing about what failed | `test/routes.test.ts`: "when the install cannot finish" |
| The same code runs on a PC with the database as a local file, which outlives a restart and holds no sign-in | `test/local-file.test.ts` |
| The binding types file matches the settings file | `test/routes.test.ts`: "the binding types file matches the settings file" |

## Still to come in piece one (draft)

Draft. The schedule is not written, because no operation in this slice is called on a schedule. Anything scheduled will only call an ordinary operation, as `diligent`. Deployment to Cloudflare is not part of this slice. The [target map](../../map/target.md#the-parts) is the plan.

### Open

- Counted as characters divided by four, this contract with its references and working files is about 9,000 tokens, above the 8,000-token guide for one read, because it reads five other contracts whole.
- On a custom address, the agent protocol handler needs the install's own host name named in its settings. That is settled with deployment.
- Cloudflare's local runtime is a development tool and is not a hardened sandbox. Running an install on a PC for real use is not settled.
