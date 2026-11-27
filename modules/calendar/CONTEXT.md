---
build_step: 4
consumes: ["../archive/CONTEXT.md","../state/CONTEXT.md"]
produces: ["Proposed events","Booked event views"]
---
# calendar

Keep proposed events and show receipts for booked ones.

## Inputs

- Working: None in this planning repository.
- Reference: `../archive/CONTEXT.md`, `../state/CONTEXT.md`.

## Process

1. Build the calendar view from archived evidence and workflow state, including booked-event receipts. Keep the last known bookings visible during a provider outage.

## Outputs

- Proposed events.
- Booked event views.

## Check

A contributor starts with a populated calendar, simulates a provider outage, and verifies that the known bookings remain visible.
