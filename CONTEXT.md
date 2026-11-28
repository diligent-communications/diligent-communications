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

The checks run on Node.js 24.12.0 or later. Run `npm ci --ignore-scripts`, `npm test`, and `npm run typecheck` from the root. Node runs TypeScript directly. Use only erasable TypeScript syntax, so removing the types leaves valid JavaScript. Include the `.ts` extension when importing a TypeScript file by relative path and use `import type` for type-only imports. The program itself runs on Cloudflare's runtime, with screens in a browser. `wrangler.jsonc` at the root sets it up, and [host](modules/host/CONTEXT.md) is its entry. The screen's own files, in `modules/app/public/`, are plain JavaScript, CSS and HTML with no build step, and are not type-checked.

A test that needs the running program starts it on Cloudflare's local runtime with `modules/host/test/helpers/local-install.ts`, and reaches it by one of the three ways in with `modules/host/test/helpers/ways.ts`. Such a test uses made-up data, reaches no network and leaves no program running. It writes in two places and no other. One is the temporary folder that helper makes under the system temporary folder, and removes when the run ends. If the system still holds one of its files open at that moment, the folder is left there. The other is the checkout's own `.wrangler/` folder, where Cloudflare's tooling builds the program for each run and clears its own older build folders. Git ignores `.wrangler/`. No test may write to the home folder.

`worker-configuration.d.ts` is generated from `wrangler.jsonc`. After changing that file, run `npx wrangler types --include-runtime=false` and commit the result. A test fails when the two disagree.

## Working across folders

Until a piece writes a part's contract together with its code and tests, the [target map](map/target.md) is the plan. When that contract is written, it holds. If it differs from the target map, the map is corrected in the same change.

No received mail body is stored. The rule is in the [target map](map/target.md#rules-every-part-keeps).

`map/` holds the generated map and the hand-written target. `_tools/` holds the map tools. `guides/` holds recipes. `map/` and `_tools/` carry no contract. Update the [target map](map/target.md) when a part is added or removed or its edges change.

Use Python 3.10 or later. From the root, run `python -I _tools/map.py` and commit the output. Check with `python -I _tools/links.py`, `python -I _tools/map.py --check`, and `python -I _tools/test_map.py`.

The map check rejects any frontmatter key the [template](_templates/module-CONTEXT.md) does not list. Under `## Lanes`, each lane is a `###` heading, and its only allowed sub-headings are Inputs, Process, Outputs, Check, and Open. Any other lane sub-heading is rejected.
