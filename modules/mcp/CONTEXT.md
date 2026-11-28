---
build_step: 1
status: draft
consumes: []
produces: []
---
# mcp — The agent connection

One job: the connection an outside agent uses.

## What it owns

No behaviour of its own. A tool is an operation.

## What it never does

It never holds a Google sign-in, and it never calls a model.

Piece 1 first builds it. Its seam is written together with its code and tests in that piece. Until then the [target map](../../map/target.md) is the plan for it.
