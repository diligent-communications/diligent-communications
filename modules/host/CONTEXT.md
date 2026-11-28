---
build_step: 1
status: draft
consumes: []
produces: []
---
# host — The running program

One job: take each request, send it to the right place, and run the schedule.

## What it owns

The routes and the timer.

## What it never does

It never decides a message, a matter or a send. It never holds a sign-in, and it never talks to the database.

Piece 1 first builds it. Its seam is written together with its code and tests in that piece. Until then the [target map](../../map/target.md) is the plan for it.
