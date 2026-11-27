---
build_step: 1
consumes: []
produces: []
writes: []
---
# {Module name} — {One job}

{Set build_step to 1, 2, 3, 4, or 1 to 2 for a module that spans those steps.}

## Inputs

- Working: {List exact paths relative to this file, or say none.}
- Reference: [{Contract or exact shared shape}]({Relative path with section anchor for a shared shape})

## Process

1. {Describe the first action.}

## Outputs

- {Short result name}
- Handoff: [{Receiving module}]({Relative path to its contract})

## Check

{Say who checks the outputs and what result passes.}

{List one reference per line, or say None. Include lane references in consumes. Match output names to produces and handoff paths to writes. Omit Handoff and writes when there is no write handoff to draw.}
