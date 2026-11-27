---
build_step: 4
consumes: ["../archive/CONTEXT.md","../state/CONTEXT.md","../../contracts/CONTEXT.md#action-receipt"]
produces: ["Proposed events","Booked event views"]
---
# calendar — Show proposed and booked events

## Inputs

- Working: None in this planning repository.
- Reference: [archive](../archive/CONTEXT.md)
- Reference: [state](../state/CONTEXT.md)
- Reference: [Action receipt](../../contracts/CONTEXT.md#action-receipt)

## Process

1. Show proposed events and booked-event receipts from the archive and live state. Effects creates the receipt, state holds the live copy, and archive stores the lasting copy.
2. Keep the last known bookings visible during a provider outage.

## Outputs

- Proposed events
- Booked event views

## Check

A contributor starts with a populated calendar, simulates a provider outage, and verifies that known bookings remain visible.
