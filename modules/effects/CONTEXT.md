---
build_step: 4
consumes: ["../connections/CONTEXT.md","../state/CONTEXT.md","../../contracts/CONTEXT.md#saved-decision","../../contracts/CONTEXT.md#action-receipt"]
produces: ["External action receipts"]
---
# effects — Carry out approved external actions

## Inputs

- Working: None in this planning repository.
- Reference: [connections](../connections/CONTEXT.md)
- Reference: [state](../state/CONTEXT.md)
- Reference: [Saved decision](../../contracts/CONTEXT.md#saved-decision)
- Reference: [Action receipt](../../contracts/CONTEXT.md#action-receipt)

## Process

1. Confirm the recorded approval in state before using the relevant account connection to send a reply or write a calendar event.
2. Create a receipt and hand it to state. State holds the live copy and saves the lasting copy into archive. Check a restored receipt before acting and verify uncertain delivery before retrying.

## Outputs

- External action receipts

## Check

A contributor tries unapproved, approved, retried, and restored actions with a test provider and verifies that each approved action is sent once and no unapproved action is sent.
