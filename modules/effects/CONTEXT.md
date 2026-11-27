---
build_step: 4
consumes: ["../connections/CONTEXT.md","../state/CONTEXT.md"]
produces: ["External action receipts"]
---
# effects

Perform approved actions outside the app, such as sending a reply or writing a calendar event.

## Inputs

- Working: None in this planning repository.
- Reference: `../connections/CONTEXT.md`, `../state/CONTEXT.md`.

## Process

1. Use the appropriate connection after confirming approval in state, then record a receipt. After uncertain delivery, verify the original outcome before retrying. Preserve receipts through restore so completed actions stay completed.

## Outputs

- External action receipts.

## Check

A contributor exercises unapproved, approved, retried, and restored synthetic actions and verifies that only approved actions are sent and each is sent once.
