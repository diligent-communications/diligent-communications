# Diligent Communications

This repository is building an app that shows one Brief of what needs a person, built from their mail, texts and calls. An outside agent sorts and prepares, and the person accepts with a tap. Mail is read when it is needed and is not kept.

The first slice of the first piece is written: the door, with three ways in. A person can set a password, sign in, make sign-ins for agents and see who did what, from a bare screen, from a command line and from an agent connection. There is no mail and no Brief yet. The project is not ready for use with real mail by other people.

The finished app is planned to run in the person's own Cloudflare account and also on a PC. Today it runs on a PC only, on Cloudflare's local runtime. Nothing here is deployed.

- The [generated map](map/README.md) shows the current folder contracts and the build piece of each part. An arrow there means a written contract reads another part. Open a contract from the table below the diagram.
- The [target map](map/target.md) is the plan for the finished app until a piece writes a contract.
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

The tests start the program on Cloudflare's local runtime on this PC, with made-up data. What they write, and where, is in the [repository guide](CONTEXT.md#code-and-tests).

## Run it on a PC

1. Install what it needs:

   ```sh
   npm ci --ignore-scripts
   ```

2. Make a set-up code. This one command writes a random one to `.dev.vars`, Cloudflare's local secrets file, which git ignores. It will not overwrite a code that is already there.

   ```sh
   node -e "require('node:fs').writeFileSync('.dev.vars', 'SETUP_CODE=' + require('node:crypto').randomBytes(32).toString('base64url') + '\n', { flag: 'wx' })"
   ```

3. Start it:

   ```sh
   npx wrangler dev
   ```

   It prints the address it answers on, usually `http://localhost:8787`. The database is a local file under `.wrangler/`, which git also ignores.

4. Open that address in a browser. Copy the set-up code from `.dev.vars` and set a password of 16 characters or more. That signs this browser in. A set-up code works once. If the password is ever forgotten, put a new code in `.dev.vars` and set the password again.

5. From a command line, the same operations are commands. The password is asked for, never typed as an argument:

   ```sh
   node modules/cli/src/bin.ts --install http://localhost:8787 sign_in
   node modules/cli/src/bin.ts whoami
   node modules/cli/src/bin.ts agent_create --name sorter --level read
   ```

6. An agent connects to `http://localhost:8787/mcp` with the token `agent_create` returned, sent as `Authorization: Bearer <token>`. The token is shown once.

Each part's contract says what it does: start from the [repository guide](CONTEXT.md).

## Decisions

- Diligent keeps no copy of mail. A matter may hold a short quote and a summary, and a way to open the original.
- No part of Diligent calls a model. Any outside agent can connect. Each agent has its own sign-in and a level. The person accepts with a tap, and nothing is sent without that tap, except that a program on the same PC as a signed-in command line is not limited by that tap ([rule 6](map/target.md#rules-every-part-keeps)).
- One install belongs to one person. The screens are planned phone first. The same program is planned so it can run on a PC.
- The build has six pieces: mail to Brief, a reply, texts, calls, projects and goals, then calendar and contacts. Until a piece writes a part's contract, the target map is the plan.
