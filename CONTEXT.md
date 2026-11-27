# Repository guide

[Repository map](map/README.md) · [Project status and decisions](README.md)

| Task | Folder contract |
| --- | --- |
| Capture communications with stable source IDs | [capture](modules/capture/CONTEXT.md) |
| Keep original evidence recoverable | [archive](modules/archive/CONTEXT.md) |
| Keep workflow state consistent | [state](modules/state/CONTEXT.md) |
| Review captured items and produce the Brief | [brief](modules/brief/CONTEXT.md) |
| Find, preview, and export attachments | [attachments](modules/attachments/CONTEXT.md) |
| Provide one command surface for people and agents | [commands](modules/commands/CONTEXT.md) |
| Present the application screens | [app](modules/app/CONTEXT.md) |
| Expose the commands to agent hosts | [mcp](modules/mcp/CONTEXT.md) |
| Change a shape shared by modules | [contracts](contracts/CONTEXT.md) |

## Working across folders

Start with the target contract and load the inputs it names. Keep module work inside that module and use published interfaces at folder boundaries. Update the shared contract first when changing what modules hand each other. The map describes which contracts a folder may read. Runtime callers use the command surface for screens and agents.

To refresh the map, run `python -I _tools/map.py` from the repository root and commit the generated file. Run `python -I _tools/links.py` to check local links and `python -I _tools/map.py --check` to check the map and module folders.
