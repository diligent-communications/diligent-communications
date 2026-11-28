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

Nothing about mail or matters. The command line stays signed in as the person, once per device, like the screens. It sends an operation to the install through [host](../host/CONTEXT.md) and prints the result. It never keeps the password. It keeps its session on that PC, and the install keeps only a hash of it.

Any program that can run commands on that PC, an agent included, can act through a signed-in command line at the person's level. The Prepare level and the person's tap limit an agent that uses its own sign-in; they do not limit a program on the same PC as a signed-in command line, and nothing says the bridge rule does.

It also runs as a local bridge an agent can start (`diligent mcp`), for an agent that cannot hold a token itself. The bridge uses an agent sign-in of its own, which the person makes and gives it, and nothing else. It never uses the person's password.

## What it never does

It never holds a Google sign-in, never calls a model, and never writes the database. Signing in to Google happens in a browser, on Google's own page. This program can start that step and can show its state. It cannot finish it.

## Operations

This part adds no operation. Each command is an operation the door already names. The printed text is the result's name and its plain description.

## Hard rules

1. The command line stays signed in as the person and never keeps the password. It keeps its session on that PC. The bridge stores only the agent sign-in it was given.
2. Printed output contains no Google sign-in and no mail body. The command line prints a new agent token once and holds no other sign-in in its output.
3. A command uses the same operation name as the screen and the agent.

## Inputs

- Working: None yet.
- Reference: [Host](../host/CONTEXT.md)
- Reference: [Operations](../operations/CONTEXT.md)

## Process

1. Send the operation. Send a request ID only when the operation changes something.
2. Print the named result. Do not add advice. A new agent token is printed once.

## Outputs

- Printed results

## Check

When this part's code is written, a contributor runs one operation from the command line and sees the same named result as the door. A new agent token is printed once. No other sign-in is printed. No command asks for the password again.
