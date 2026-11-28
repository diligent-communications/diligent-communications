---
build_step: 1
status: draft
consumes: ["../host/CONTEXT.md","../operations/CONTEXT.md"]
produces: ["Agent tools"]
---
# mcp — The agent connection

Draft. The seam below is what other parts may rely on. The inner behaviour is written with this part's code. Piece 1 completes the tools piece 1 needs. Later pieces add tools for the operations they add. A capability is finished only when it also works here.

One job: the connection an outside agent uses. MCP is the open standard for that connection.

## What it owns

No behaviour of its own. A tool is an operation. The tool's name is the operation's name.

## What it never does

It never calls a model. Diligent does not start or wake the agent. This part never holds a Google sign-in and never stores a mail body. It does not add a tool the door does not name.

## Operations

This part adds no operation. It offers the door's operations as tools. This connection accepts agent sign-ins only, so an operation that needs the person's level answers `not_allowed`. An agent's level stops at Prepare.

## Hard rules

1. A tool name is an operation name.
2. The agent's level is checked by the door. This part does not raise it.
3. A tool result is the operation's named result, with no advice added.

## Inputs

- Working: None yet.
- Reference: [Host](../host/CONTEXT.md)
- Reference: [Operations](../operations/CONTEXT.md)

## Process

1. Offer every operation. One that needs the person answers `not_allowed`.
2. Pass the call through to the door and return the named result.

## Outputs

- Agent tools

## Check

When this part's code is written, a contributor lists the tools and finds every operation the door names. One that needs the person answers `not_allowed`.
