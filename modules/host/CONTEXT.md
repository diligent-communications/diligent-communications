---
build_step: 1
status: draft
consumes: ["../access/CONTEXT.md","../operations/CONTEXT.md"]
produces: ["Routed requests"]
---
# host — The running program

Draft. The seam below is what other parts may rely on. The inner behaviour is written with this part's code. Piece 1 completes the routes and the mail-check schedule. Later pieces add routes for the operations they add.

One job: take each request, send it to the right place, and run the schedule.

## What it owns

The routes and the timer. The screen, the command line and the agent connection all arrive here, then pass through [access](../access/CONTEXT.md) to the [door](../operations/CONTEXT.md).

## What it never does

It makes no decisions about a message, a matter or a send. It never calls a model. It never holds a sign-in. It never talks to the database itself.

## Operations

This part adds no operation. On the schedule it calls `mail_check`. The person can call the same operation. A scheduled call is recorded as `diligent`.

## Hard rules

1. Every outside request is identified by access before the door runs it.
2. The schedule does not start or wake an agent.
3. A route that does not name an operation returns `invalid_input`.

## Inputs

- Working: None yet.
- Reference: [Access](../access/CONTEXT.md)
- Reference: [Operations](../operations/CONTEXT.md)

## Process

1. Accept a request from the screen, the command line or an agent.
2. Ask access who is calling, then hand the call to the door.
3. When the schedule fires, call `mail_check` as `diligent`.

## Outputs

- Routed requests

## Check

When this part's code is written, a contributor reaches one operation from a test request and sees the same named result the door defines. A scheduled run does not start an agent.
