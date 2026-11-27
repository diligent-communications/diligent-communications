---
build_step: 4
consumes: ["../connections/CONTEXT.md","../state/CONTEXT.md","../../contracts/CONTEXT.md#saved-decision","../../contracts/CONTEXT.md#action-receipt"]
produces: ["External action receipts"]
writes: ["../state/CONTEXT.md"]
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
3. After restore, never automatically send an approved action that has no receipt. Check it with the provider or put it back for approval.

## Outputs

- External action receipts
- Handoff: [state](../state/CONTEXT.md)

## Check

A contributor tries unapproved, approved, retried, and restored actions with a test provider and verifies that approved actions are sent at most once and unapproved actions are never sent. The contributor also restores an approval without its receipt and verifies that the action is checked with the provider or returned for approval without an automatic send.
