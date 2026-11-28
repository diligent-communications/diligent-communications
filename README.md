# Diligent Communications

Diligent shows one Brief of what needs a person, built from their mail, texts and calls. An outside agent sorts and prepares, and the person accepts with a tap. Mail is read when it is needed and is not kept. The project is not ready for use with real mail by other people.

It runs in the person's own Cloudflare account and is written so it can also run on a PC.

- The [generated map](map/README.md) shows the current folder contracts, which contract reads which, and the build piece of each part. Open a contract from the table below the diagram.
- The [target map](map/target.md) is the picture of the finished app: the parts, the rules, and the order the pieces are built.
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

- Diligent keeps no copy of mail. A matter may hold a short quote and a summary, and a way to open the original.
- No part of Diligent calls a model. Any outside agent can connect. Each agent has its own sign-in and a level. The person accepts with a tap, and nothing is sent without that tap.
- One install belongs to one person. The screens are built phone first. The same program is written so it can run on a PC.
- The build has six pieces: mail to Brief, a reply, texts, calls, projects and goals, then calendar and contacts. The seam of each part is written first. What happens inside a part is written with that part's code.
