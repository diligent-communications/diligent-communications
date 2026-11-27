# Diligent Communications

Diligent Communications will bring mail, texts, and optional calls together for review and keep the original evidence available. The project is at the planning stage.

- The [generated map](map/README.md) shows the current folder contracts, reading dependencies, write handoffs, and build steps. Open a contract from the table below the diagram.
- The [target map](map/target.md) shows how evidence, reads, and approved actions will move through the finished app.
- The [repository guide](CONTEXT.md) routes tasks and explains how to work across folders.

## Run the checks

Use Node.js 24 or later with npm, and Python 3.10 or later. From the repository root, run:

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
- The app is written in TypeScript on Node.js. It starts on Node 24, and tests and type checks run on Node 24 and 26, on Windows and Linux.
- Backups go to a second folder you pick. Every backup is a full, separate copy, and the program never deletes old backups.
- In step 1, the evidence folder and backups are not encrypted, so their files open without the program. Anyone who can open the evidence folder or a backup can read what is in it.
- To restore, you pick from the list of backups, see a preview of that backup, and confirm.
- The receipt a change returns is shown to you. Only approved actions leave a receipt in the archive.
- In step 1, nothing yet makes decisions or action receipts. The archive's handling of them is tested with made-up records.
