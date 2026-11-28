---
build_step: 1
status: draft
consumes: ["../host/CONTEXT.md", "../operations/CONTEXT.md", "../../contracts/CONTEXT.md#answer", "../../contracts/CONTEXT.md#operation"]
produces: ["The bare screen: a form for every operation"]
---
# app — The screens

One job: the screens the person sees.

## What it owns

Layout, wording, the advice shown beside a result, and the screens of the first-run walk.

## What it never does

It never talks to the database or to Google, and it never calls a model. It never runs a command: it only calls operations.

## Slice 1: the door (complete)

### Inputs

- Working: `public/index.html`, `public/app.js`, `public/app.css`, `public/_headers`
- Reference: [host](../host/CONTEXT.md)
- Reference: [operations](../operations/CONTEXT.md)
- Reference: [Answer](../../contracts/CONTEXT.md#answer)
- Reference: [Operation](../../contracts/CONTEXT.md#operation)

### Process

In this slice the screen is bare: enough to set the password, sign in and run the operations.

1. The screen is plain files in `public/`: one page, one script, one stylesheet. There is no build step. The [host](../host/CONTEXT.md) serves them to anyone, and they say nothing about the install.
2. The page has a form for every entry in the [operations list](../operations/CONTEXT.md). A form takes the inputs its operation takes. A secret is typed into a field that hides it.
3. A button sends its form as one call to the operation's address, as the host describes. For an operation that takes a request ID, the script makes one up and sends the same one again until an answer arrives.
4. The script shows what the operation returned: the result's name, its description, and its other fields. Beside it the script shows the screen's own advice for that result, from one list in `app.js`. A result says what was found. The advice is the screen's.
5. The page's own rules, in `_headers`, let it load only its own script and stylesheet and call only its own install. The page holds no script of its own, and nothing an operation returns is ever written into the page as HTML.
6. The look starts from GitHub's Primer design tokens. The values in `app.css` are copied from `@primer/primitives` 11.10.0 (MIT), with its licence notice in `LICENSE-PRIMER`. Nothing is styled beyond the tokens.

### Outputs

- The bare screen: a form for every operation

### Check

`npm test` passes, and each hard rule below has a test in `test/screen.test.ts` that fails when the rule is broken. A person also looks at the screen in a browser at phone width.

| Hard rule | Test |
| --- | --- |
| Every operation has a form, and a form takes only what its operation takes | "the screen has a form for every operation" |
| The screen only calls operations, at their addresses | "the screen calls an operation at its address" |
| The advice is the screen's own, and every result that refuses has some | "the advice beside a result is the screen's own" |
| The page loads only its own files | "the install serves the screen to anyone" |
| The look uses the Primer tokens, with the licence notice beside them | "the stylesheet uses the Primer tokens" |
| The screen's request gives the same answer as the other ways in | [operations](../operations/CONTEXT.md)' `test/three-ways.test.ts`, which sends the request `app.js` builds |

## Still to come in piece one (draft)

Draft. The Brief, a matter, a person, settings and the first-run walk are not written. The [target map](../../map/target.md#the-parts) is the plan for them.

### Open

- No test runs the page in a browser. The tests send the request the page's script builds and read the page's HTML.
