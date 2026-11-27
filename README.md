# Diligent Communications

Diligent Communications will bring mail, texts, and optional calls together for review and keep the original evidence available. The project is at the planning stage.

- The [generated map](map/README.md) shows the current folder contracts, reading dependencies, write handoffs, and build steps. Open a contract from the table below the diagram.
- The [target map](map/target.md) shows how evidence, reads, and approved actions will move through the finished app.
- The [repository guide](CONTEXT.md) routes tasks and explains how to work across folders.

## Run the checks

Use Node.js 24.12.0 or later with npm, and Python 3.10 or later. From the repository root, run:

```sh
npm ci --ignore-scripts
npm test
npm run typecheck
python -I _tools/links.py
python -I _tools/map.py --check
python -I _tools/test_map.py
```

## Decisions

- The first version runs on your own computer and uses your own evidence folder. Hosting can come later.
- Step 1 starts with the archive, then mail capture, then backup and restore. Steps 2 through 4 are proposed.
- Every primary workflow works with calls switched off.
- The app is written in TypeScript on Node.js. The minimum is Node 24.12.0. Tests and type checks run on exactly that version and on the latest Node 24 and 26, on Windows and Linux.
- Step 1 mail capture reads Gmail with read-only access. Each person creates their own Google project. This repository does not contain a shared sign-in identity.
- The running program adds one pinned package, and only the connections module uses it, to keep the sign-in in Windows Credential Manager. If that vault cannot be read or written, that is reported, and nothing is stored in a file.
- A person starts a capture from a terminal tool. That tool is the first form of setup. It uses commands for changes and queries for reads. The same command does a later catch-up.
- Capture progress is kept in the program's local data folder, outside the evidence folder and the backup folder.
- Backups go to a second folder you pick. Every backup is a full, separate copy, and the program never deletes old backups.
- In step 1, the evidence folder and backups are not encrypted, so their files open without the program. Anyone who can open the evidence folder or a backup can read what is in it.
- To restore, you pick from the list of backups, see a preview of that backup, and confirm.
- The receipt a change returns is shown to you. Only approved actions leave a receipt in the archive.
- In step 1, nothing yet makes decisions or action receipts. The archive's handling of them is tested with made-up records.
