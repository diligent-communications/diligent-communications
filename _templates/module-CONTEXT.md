---
build_step: 1
consumes: []
produces: []
writes: []
---
# {Module name} — {One job}

{Set build_step to 1, 2, 3, 4, or 1 to 2 for a module that spans those steps.}

{A contract has two layers, as the root guide says. The seam is complete: operations, their inputs and named results, the shared shapes, and the hard rules, each with a pass condition. An inner page, the step-by-step behaviour, starts with the line Draft. and is finished with that module's code. For a contract that is not finished, add status: draft to the frontmatter. In a mixed contract, label the complete and draft sections and give each its own process and check.}

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

{The map check rejects frontmatter keys other than the ones above and status. For lanes, add ## Lanes and a ### {Name} · Step {N} (decided or draft) heading for each lane. A lane may use only the sub-headings #### Inputs, #### Process, #### Outputs, #### Check, and #### Open. Any other is rejected.}
