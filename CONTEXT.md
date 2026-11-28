# Repository guide

[Generated map](map/README.md) · [Finished application target](map/target.md) · [Project status and decisions](README.md)

| Task | Folder contract |
| --- | --- |
| Show the screens and the first-run walk | [app](modules/app/CONTEXT.md) |
| Run a command on the person's install | [cli](modules/cli/CONTEXT.md) |
| Connect an agent | [mcp](modules/mcp/CONTEXT.md) |
| Run the program and its schedule | [host](modules/host/CONTEXT.md) |
| Tell who is calling, and at what level | [access](modules/access/CONTEXT.md) |
| Call the one door | [operations](modules/operations/CONTEXT.md) |
| Give every message one outcome | [sorting](modules/sorting/CONTEXT.md) |
| Keep the matters on the Brief | [brief](modules/brief/CONTEXT.md) |
| Record what belongs to what | [links](modules/links/CONTEXT.md) |
| Keep a page per person | [people](modules/people/CONTEXT.md) |
| Keep projects and goals | [plans](modules/plans/CONTEXT.md) |
| Prepare something that leaves, and send it after a tap | [effects](modules/effects/CONTEXT.md) |
| See what mail, texts and calls exist | [sources](modules/sources/CONTEXT.md) |
| Sign in to Google | [connections](modules/connections/CONTEXT.md) |
| Keep the database | [store](modules/store/CONTEXT.md) |
| Read a set-up recipe or the sorting guide | [guides](guides/CONTEXT.md) |
| Change a shape parts share | [contracts](contracts/CONTEXT.md) |

## Code and tests

Put code in `modules/<name>/src/` and tests in `modules/<name>/test/`, beside the part's `CONTEXT.md`. Put code for shared shapes in `contracts/` and its tests in `contracts/test/`. Name tests `*.test.ts`.

Put files that must retain their exact bytes in a part's or the shared contracts' `test/fixtures/` folder, where Git preserves them byte for byte.

The checks run on Node.js 24.12.0 or later. Run `npm ci --ignore-scripts`, `npm test`, and `npm run typecheck` from the root. Node runs TypeScript directly. Use only erasable TypeScript syntax, so removing the types leaves valid JavaScript. Include the `.ts` extension when importing a TypeScript file by relative path and use `import type` for type-only imports. The program itself is for Cloudflare's runtime, with screens in a browser. That runtime is set up with the first piece of code, not in this repository yet.

## Working across folders

The screen, the command line and the agent connection are the three ways in. They reach the same operations through [host](modules/host/CONTEXT.md) and the [one door](modules/operations/CONTEXT.md). A part may read only the folders its contract lists, and the exact shapes it names in [contracts](contracts/CONTEXT.md).

The seam of a part is complete while the part is still draft: its operations, their named results, the shapes it shares and its hard rules. The inner step-by-step behaviour is written with that part's code. An inner page starts with the line `Draft.` and the map marks that page draft. Where an inner page disagrees with a hard rule, the hard rule stands.

Nothing comes in except through [sources](modules/sources/CONTEXT.md). Nothing leaves except through [effects](modules/effects/CONTEXT.md), and only after the person accepts. No part calls a model. No mail body is stored. Only [connections](modules/connections/CONTEXT.md) holds a sign-in to an outside account. Only [store](modules/store/CONTEXT.md) talks to the database.

The build has six pieces. Piece 1 is mail to Brief. A later piece may add operations and lanes. It does not change an operation an earlier piece shipped without changing the shared shape here first.

`map/` holds the generated map and the hand-written target. `_tools/` holds the map tools. `guides/` holds recipes. `map/` and `_tools/` carry no contract. Update the [target map](map/target.md) when a part is added or removed or its edges change.

Use Python 3.10 or later. From the root, run `python -I _tools/map.py` and commit the output. Check with `python -I _tools/links.py`, `python -I _tools/map.py --check`, and `python -I _tools/test_map.py`.

The map check rejects any frontmatter key the [template](_templates/module-CONTEXT.md) does not list. Under `## Lanes`, each lane is a `###` heading, and its only allowed sub-headings are Inputs, Process, Outputs, Check, and Open. Any other lane sub-heading is rejected.
