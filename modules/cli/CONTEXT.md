---
build_step: 1
status: draft
consumes: ["../host/CONTEXT.md","../operations/CONTEXT.md"]
produces: ["Printed results"]
---
# cli — The command line

Draft. The seam below is what other parts may rely on. The inner behaviour is written with this part's code. Piece 1 completes the commands piece 1 needs. Later pieces add their commands. A capability is finished only when it also works here.

One job: a small program on the person's PC, called `diligent`.

## What it owns

Nothing about mail or matters. It signs in as the person with the password, sends an operation to the install through [host](../host/CONTEXT.md), and prints the result.

It also runs as a local bridge an agent can start (`diligent mcp`), for an agent that cannot hold a token itself. The bridge uses an agent sign-in of its own, which the person makes and gives it, and nothing else. It never uses the person's password.

## What it never does

It never holds a Google sign-in, never calls a model, and never writes the database. Signing in to Google happens in a browser, on Google's own page. This program can start that step and can show its state. It cannot finish it.

## Operations

This part adds no operation. Each command is an operation the door already names. The printed text is the result's name and its plain description.

## Hard rules

1. The command line signs in as the person with the password. The bridge stores only the agent sign-in it was given.
2. Printed output contains no Google sign-in and no mail body.
3. A command uses the same operation name as the screen and the agent.

## Inputs

- Working: None yet.
- Reference: [Host](../host/CONTEXT.md)
- Reference: [Operations](../operations/CONTEXT.md)

## Process

1. Send the operation and the request ID to the install.
2. Print the named result. Do not add advice.

## Outputs

- Printed results

## Check

When this part's code is written, a contributor runs one operation from the command line and sees the same named result as the door. The output does not contain a sign-in.
