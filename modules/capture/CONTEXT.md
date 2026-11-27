---
consumes: ["../../contracts/CONTEXT.md"]
produces: ["Captured records"]
---
# capture

Capture communications with stable source IDs.

## Inputs

- Working: None in this planning repository.
- Reference: `../../contracts/CONTEXT.md`. Synthetic fixtures are permitted once they exist in the repository.

## Process

1. Import mail and texts, and import calls when enabled.
2. Derive a stable source ID for each item and preserve the original payload in the record handed off to the caller.

## Outputs

- Captured records.

## Check

A contributor imports the same synthetic item twice and verifies that the handoff yields one logical record for its source ID.
