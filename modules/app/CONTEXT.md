---
build_step: 1
status: draft
consumes: ["../host/CONTEXT.md","../operations/CONTEXT.md","../../guides/CONTEXT.md"]
produces: ["Screens and advice"]
---
# app — The screens

Draft. The seam below is what other parts may rely on. The inner behaviour is written with this part's code. Piece 1 completes the Brief and the first-run walk. Later pieces add the screens they need.

One job: the screens the person sees.

## What it owns

Layout and wording, the advice shown beside a result, and the first-run walk. The written recipes live in [guides](../../guides/CONTEXT.md). This part owns the screens of that walk, not the recipe pages.

Screens are built phone first, on the Primer tokens published by GitHub (MIT).

## What it never does

It never talks to the database or to Google. It only calls operations, through [host](../host/CONTEXT.md). It never calls a model. It never decides an outcome.

## Operations

This part adds no operation. It calls the operations the other parts name, and it shows the named result. The advice next to a result is wording this part owns. The result text itself stays free of advice.

## Hard rules

1. A screen calls an operation. It does not read tables or call Google.
2. Advice lives here. A result the door returns is shown as it is.
3. The first-run walk can be skipped, step by step.

## Inputs

- Working: None yet.
- Reference: [Host](../host/CONTEXT.md)
- Reference: [Operations](../operations/CONTEXT.md)
- Reference: [Guides](../../guides/CONTEXT.md)

## Process

1. Show the Brief from `brief_list`.
2. Send each tap as the operation that matches it.
3. Show the named result, plus the advice this screen owns.

## Outputs

- Screens and advice

## Check

When this part's code is written, a contributor completes the first-run walk, skips a step, and opens the Brief without this part reading the database.
