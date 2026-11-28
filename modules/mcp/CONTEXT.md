---
build_step: 1
status: draft
consumes: ["../operations/CONTEXT.md", "../../contracts/CONTEXT.md#answer", "../../contracts/CONTEXT.md#operation"]
produces: ["The agent connection: every operation as a tool"]
---
# mcp — The agent connection

One job: the connection an outside agent uses.

## What it owns

No behaviour of its own. A tool is an operation.

## What it never does

It never holds a Google sign-in, and it never calls a model. It never writes the agent protocol by hand.

## Slice 1: the door (complete)

### Inputs

- Working: `src/connection.ts`, `src/tools.ts`, `src/address.ts`
- Reference: [operations](../operations/CONTEXT.md)
- Reference: [Answer](../../contracts/CONTEXT.md#answer)
- Reference: [Operation](../../contracts/CONTEXT.md#operation)

### Process

1. The agent connection answers at `/mcp`. The agent protocol (MCP) is spoken by the platform's maintained handler, `createMcpHandler` from the `agents` package, with the protocol's own `Server`. Nothing of the protocol is written here. The pinned handler speaks two forms of the protocol and runs each on its own path: the older, which begins with a handshake, and the newer, revision 2026-07-28, in which every request names its revision in its body and its headers. A tool call in either form reaches the same tool handler.
2. `toolList` makes one tool from each entry in the [operations list](../operations/CONTEXT.md): the same name, the operation's meaning, and exactly the inputs the operation takes, as a JSON schema. Every operation is offered. One that needs the person answers `not_allowed`.
3. A tool call is passed to the door with the caller the [host](../host/CONTEXT.md) identified. The door's answer goes back unchanged. A named result is an answer, not a protocol error. If the door fails, the tool call answers `unavailable` and nothing else, as the operation address does: the protocol would otherwise hand the failure's own words to the agent.
4. The connection accepts agent sign-ins only. The [host](../host/CONTEXT.md) refuses a request with no agent sign-in, or from an agent that is switched off, before this part sees it. For the second, `toolsCalledIn` gives the host the tools a request calls, read as plain JSON: one request, or each request in an array. What is then recorded is in the host contract.
5. The handler keeps nothing between requests: no session of the protocol, no Durable Object.

### Outputs

- The agent connection: every operation as a tool

### Check

`npm test` passes, and each hard rule below has a test that fails when the rule is broken.

| Hard rule | Test |
| --- | --- |
| The tool list is made from the operations list, with nothing added | `test/tools.test.ts` |
| Every operation is offered, and one that needs the person answers `not_allowed` | [operations](../operations/CONTEXT.md)' `test/three-ways.test.ts`: "every operation is offered as a tool", and [access](../access/CONTEXT.md)'s `test/levels.test.ts` |
| A real client of the agent protocol gets the same answer as the other ways in, in the protocol's older form and in its newer one | [operations](../operations/CONTEXT.md)' `test/three-ways.test.ts` |
| A failure inside a tool call answers `unavailable` and says nothing of what failed, in either form | [host](../host/CONTEXT.md)'s `test/routes.test.ts`: "when the install cannot finish a tool call" |
| The tools a request calls are read as plain JSON, from one request or from each in an array, and anything else calls nothing | `test/tools.test.ts`: "the tools a request calls are read as plain JSON", "what is not a tool call, or cannot be understood, calls nothing" |
| A switched-off agent cannot complete the handshake, list the tools or call one, on an open connection or a new one | [access](../access/CONTEXT.md)'s `test/levels.test.ts`: "a switched-off agent is refused everything" |

## Still to come in piece one (draft)

Draft. The tools of the parts that are not built yet appear when their operations join the list. Nothing is added here for them.

### Open

- Chat apps that accept only the protocol's own sign-in flow cannot connect with a token. That is later.
