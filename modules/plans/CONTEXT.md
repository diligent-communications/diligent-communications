---
build_step: 5
status: draft
consumes: ["../operations/CONTEXT.md","../links/CONTEXT.md","../store/CONTEXT.md"]
produces: ["Projects and goals"]
---
# plans — Projects and goals

Draft. The seam below is what other parts may rely on. The inner behaviour is written with this part's code. Piece 5 completes it. Nothing in pieces 1 to 4 depends on this part.

One job: projects and goals. Both stand alone. Both are built from one block: steps with dates. The person starts them. This part holds the conversation side only. Estimates, costs and bills stay in the person's other apps, linked, not copied.

## What it owns

Projects, goals and steps.

## What it never does

It never calls a model, never stores a mail body, and never keeps a cost or a bill. It never sends anything.

## Operations

| Operation | Meaning | Level | Named results |
| --- | --- | --- | --- |
| `project_*` | Make, list, edit and close projects | Read or You. Prepare may suggest steps | `listed`, `changed`, `suggested` |
| `goal_*` | Make, list, edit and close goals | Read or You. Prepare may suggest steps | `listed`, `changed`, `suggested` |
| `step_*` | Make, list, edit and close steps | Read or You. Prepare may suggest steps | `listed`, `changed`, `suggested` |

The names above are the seam. The individual names are fixed when this part's code is written, in this contract, before other parts call them.

## Hard rules

1. A project and a goal are not the same record. Each has its own ID.
2. Prepare may suggest a step. It does not create, edit or close one. That takes You.
3. A link from a matter to a project is owned by links, added in piece 5.

## Inputs

- Working: None yet.
- Reference: [Operations](../operations/CONTEXT.md)
- Reference: [Links](../links/CONTEXT.md)
- Reference: [Store](../store/CONTEXT.md)

## Process

1. List or change a project, a goal or a step at the caller's level.
2. A suggestion returns `suggested` and writes no step until the person accepts.

## Outputs

- Projects and goals

## Check

When this part's code is written, a contributor creates a project and a goal that do not share an ID. An agent at Prepare receives `suggested` and does not see a new step until the person accepts.
