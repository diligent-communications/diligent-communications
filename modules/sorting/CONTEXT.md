---
build_step: 1
status: draft
consumes: []
produces: []
---
# sorting — One outcome for every message

One job: every source message ends with exactly one outcome.

## What it owns

Outcomes, sort runs and receipts.

## What it never does

It never decides a message, and it never calls a model.

Piece 1 first builds it. Its seam is written together with its code and tests in that piece. Until then the [target map](../../map/target.md) is the plan for it.
