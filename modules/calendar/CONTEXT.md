---
build_step: 4
status: draft
consumes: ["../archive/CONTEXT.md","../state/CONTEXT.md","../../contracts/CONTEXT.md#action-receipt","../../contracts/CONTEXT.md#saved-decision"]
produces: ["Proposed events","Booked event views"]
writes: ["../state/CONTEXT.md"]
---
# calendar — Show proposed and booked events

## Inputs

- Working: None in this planning repository.
- Reference: [archive](../archive/CONTEXT.md)
- Reference: [state](../state/CONTEXT.md)
- Reference: [Action receipt](../../contracts/CONTEXT.md#action-receipt)
- Reference: [Saved decision](../../contracts/CONTEXT.md#saved-decision)

## Process

1. Own proposed events and keep them in state. Record a person's accept or decline in state, which saves that decision to archive.
2. Show booked-event receipts. Effects creates the receipt, state holds the live copy, and archive stores the lasting copy. Keep the last known bookings visible during a provider outage.

## Outputs

- Proposed events
- Booked event views
- Handoff: [state](../state/CONTEXT.md)

## Check

A contributor starts with a populated calendar, simulates a provider outage, and verifies that known bookings remain visible.

## Open

- Decide how proposed events are rebuilt from the archive.
