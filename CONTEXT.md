# Repository guide

[Generated map](map/README.md) · [Finished application target](map/target.md) · [Project status and decisions](README.md)

| Task | Folder contract |
| --- | --- |
| Capture mail, texts, calls, or imports | [capture](modules/capture/CONTEXT.md) |
| Keep originals, back up, or restore | [archive](modules/archive/CONTEXT.md) |
| Manage account sign-ins | [connections](modules/connections/CONTEXT.md) |
| Guide first run | [setup](modules/setup/CONTEXT.md) |
| Keep workflow state consistent | [state](modules/state/CONTEXT.md) |
| Review captured items and produce the Brief | [brief](modules/brief/CONTEXT.md) |
| Find, preview, and export attachments | [attachments](modules/attachments/CONTEXT.md) |
| Preview or make a change | [commands](modules/commands/CONTEXT.md) |
| Read, search, or show a saved view | [queries](modules/queries/CONTEXT.md) |
| Link items to a person | [contacts](modules/contacts/CONTEXT.md) |
| Show proposed and booked events | [calendar](modules/calendar/CONTEXT.md) |
| Send a reply or write a calendar event | [effects](modules/effects/CONTEXT.md) |
| Present the application screens | [app](modules/app/CONTEXT.md) |
| Give agent hosts access | [mcp](modules/mcp/CONTEXT.md) |
| Change a shape shared by modules | [contracts](contracts/CONTEXT.md) |

## Code and tests

Put code in `modules/<name>/src/` and tests in `modules/<name>/test/`, beside the module's `CONTEXT.md`. Put code for shared shapes in `contracts/`.

Use Node.js 24 or later. Run `npm ci --ignore-scripts`, `npm test`, and `npm run typecheck` from the root. Node runs TypeScript directly. Use only erasable TypeScript syntax, so removing the types leaves valid JavaScript. Include the `.ts` extension when importing a TypeScript file by relative path and use `import type` for type-only imports.

## Working across folders

Things come in through capture only and go out through effects only. App, MCP, and setup use the same door, with commands for changes and queries for reads. There is one stated exception: the backup list is the first part of the restore preview, so setup gets it from commands, not from queries. A module may read only the folders its contract lists and the exact shapes it names in [contracts](contracts/CONTEXT.md). Change shared shapes there first.

One owner carries cross-folder features end to end. Review every contract edge they touch.

Step 1 contracts are complete. Work in steps 2 through 4 is draft. A draft can name an open handoff and is finished when its step starts.

Anything that cannot be rebuilt from originals is saved into the archive, with two exceptions that stay on the computer and never enter the archive or a backup: account sign-ins, which `connections` owns, and the evidence and backup folder locations, which `archive` keeps as local settings outside the evidence folder. Setup asks for both locations and sets them through commands.

Step 1 backups go to the second folder the person picks. Each backup is a full, separate copy, and the program never deletes one. Setup requests backups and restores through commands. A restore runs as list, pick, preview that backup, confirm, receipt, as the [command list](contracts/CONTEXT.md#command-list) describes.

`map/` holds generated output and the hand-written target map. `_tools/` holds tooling. These support folders carry no contract. Update the [target map](map/target.md) whenever a module is added or removed or its edges change.

Use Python 3.10 or later. From the root, run `python -I _tools/map.py` and commit the output. Check with `python -I _tools/links.py`, `python -I _tools/map.py --check`, and `python -I _tools/test_map.py`.

The map check rejects any frontmatter key the [template](_templates/module-CONTEXT.md) does not list. Under `## Lanes`, each lane is a `###` heading, and its only allowed sub-headings are Inputs, Process, Outputs, Check, and Open. Any other lane sub-heading is rejected.
