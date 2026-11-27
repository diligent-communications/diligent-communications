---
consumes: []
produces: ["Versioned handoff specifications"]
---
# Contracts

Define the shapes modules hand each other.

## Inputs

- Working: None at this stage.
- Reference: None.

## Process

1. Publish each shared shape here with a version. Start with the manifest, attachment export, and command list as those interfaces take shape.
2. Update a shared shape before changing module interfaces that use it.

## Outputs

- Versioned specifications for shared handoffs. This folder currently contains the folder contract.

## Check

A contributor compares a proposed handoff with the published version and verifies that the sending and receiving modules agree on its fields and version.
