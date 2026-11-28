import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { REQUEST_ID_FIELD, isAnswer } from '../../../contracts/operation.ts';
import type { InputField, Operation } from '../../../contracts/operation.ts';
import { OPERATION_PATH, SESSION_COOKIE, THIS_PC } from '../../host/src/addresses.ts';
import { findOperation, operationList } from '../../operations/src/list.ts';

const SESSION_FILE = 'session.json';

// Everything the command line touches outside itself. The real ones are in
// bin.ts. A test hands in its own, so it never touches a real home folder.
export type Surroundings = {
  args: readonly string[];
  // The folder that holds the session file.
  home: string;
  // Asks for one secret without showing it.
  ask(question: string): Promise<string>;
  // Prints what the operation returned.
  print(text: string): void;
  // Says something of the command line's own.
  say(text: string): void;
  fetch: typeof fetch;
};

type Kept = { install?: string; session?: string };

async function readKept(home: string): Promise<Kept> {
  try {
    const kept: unknown = JSON.parse(await readFile(path.join(home, SESSION_FILE), 'utf8'));
    if (typeof kept !== 'object' || kept === null) {
      return {};
    }
    const { install, session } = kept as Record<string, unknown>;
    return {
      ...(typeof install === 'string' ? { install } : {}),
      ...(typeof session === 'string' ? { session } : {}),
    };
  } catch {
    return {};
  }
}

// The session file is readable by this PC account only, where the system
// supports that.
async function writeKept(home: string, kept: Kept): Promise<void> {
  await mkdir(home, { recursive: true, mode: 0o700 });
  const file = path.join(home, SESSION_FILE);
  await writeFile(file, `${JSON.stringify(kept, null, 2)}\n`, { mode: 0o600 });
  await chmod(file, 0o600);
}

function usage(): string {
  const lines = [
    'Usage: diligent [--install <address>] <operation> [--<input> <value> ...]',
    '',
    'A secret is never typed as an argument. Name it without a value, such as --code, and it is asked for.',
    '',
    'Operations:',
    ...operationList.map((operation) => `  ${operation.name}  ${operation.meaning}`),
  ];
  return lines.join('\n');
}

function valueOf(field: InputField, text: string): unknown {
  if (field.kind === 'yes_no' && (text === 'true' || text === 'false')) {
    return text === 'true';
  }
  if (field.kind === 'count' && /^\d+$/.test(text)) {
    return Number(text);
  }
  return text;
}

type Parsed = { install?: string; operation?: string; given: Map<string, string | null> };

const NOT_AN_ADDRESS = '--install needs the address of the install, such as https://diligent.example or http://localhost:8787.';

// The address of an install: its scheme, name and port, and nothing after.
// A plain `http://` address is refused unless it is this PC's own, so a
// session or a typed password never travels where others can read it.
function addressOf(text: string): { address: string } | { refused: string } {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { refused: NOT_AN_ADDRESS };
  }
  const plain = url.protocol === 'http:';
  if ((!plain && url.protocol !== 'https:') || url.username !== '' || url.password !== '' || url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    return { refused: NOT_AN_ADDRESS };
  }
  if (plain && !THIS_PC.includes(url.hostname)) {
    return { refused: "A plain http:// address is refused unless it is this PC's own. Give the install's https:// address." };
  }
  return { address: url.origin };
}

function parse(args: readonly string[]): Parsed | string {
  const parsed: Parsed = { given: new Map() };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (!arg.startsWith('--')) {
      if (parsed.operation !== undefined) {
        // Nothing typed on the line is said back: it could be a secret.
        return 'There is a word too many. A command is one operation, then its inputs as --name value.';
      }
      parsed.operation = arg;
      continue;
    }
    const [name, ...rest] = arg.slice(2).split('=');
    let value: string | null = rest.length > 0 ? rest.join('=') : null;
    const next = args[index + 1];
    if (value === null && next !== undefined && !next.startsWith('--') && (parsed.operation !== undefined || name === 'install')) {
      value = next;
      index += 1;
    }
    if (name === 'install') {
      if (value === null) {
        return NOT_AN_ADDRESS;
      }
      parsed.install = value;
    } else {
      parsed.given.set(name!, value);
    }
  }
  return parsed;
}

// The input for one call. A secret is asked for, never taken from an argument.
async function inputFor(operation: Operation, given: Map<string, string | null>, surroundings: Surroundings): Promise<Record<string, unknown> | string> {
  const input: Record<string, unknown> = {};
  for (const [name, value] of given) {
    const field = operation.input[name];
    if (name === REQUEST_ID_FIELD && operation.request_id && value !== null) {
      input[name] = value;
    } else if (field === undefined) {
      return `An input given is not one \`${operation.name}\` takes. Run diligent --help for the list.`;
    } else if (field.kind === 'text' && field.secret === true) {
      if (value !== null) {
        return `\`${name}\` is a secret. Name it without a value and it is asked for.`;
      }
    } else if (value === null) {
      return `--${name} needs a value.`;
    } else {
      input[name] = valueOf(field, value);
    }
  }
  for (const [name, field] of Object.entries(operation.input)) {
    if (field.kind === 'text' && field.secret === true && (field.required || given.has(name))) {
      input[name] = await surroundings.ask(`${name}: `);
    }
  }
  if (operation.request_id && input[REQUEST_ID_FIELD] === undefined) {
    input[REQUEST_ID_FIELD] = crypto.randomUUID();
  }
  return input;
}

// The session a response begins or ends, from its cookie. Nothing when the
// response leaves the session as it is.
function sessionChange(response: Response): { session: string | null } | undefined {
  for (const cookie of response.headers.getSetCookie()) {
    const [pair] = cookie.split(';');
    const [name, ...value] = (pair ?? '').split('=');
    if (name?.trim() === SESSION_COOKIE) {
      const session = value.join('=').trim();
      return { session: session === '' ? null : session };
    }
  }
  return undefined;
}

// Runs one command and returns the exit code: 0 when the install answered and
// the answer was printed, 1 when there is no answer to print.
export async function run(surroundings: Surroundings): Promise<number> {
  const parsed = parse(surroundings.args);
  if (typeof parsed === 'string') {
    surroundings.say(parsed);
    return 1;
  }
  if (parsed.operation === undefined || parsed.given.has('help')) {
    surroundings.say(usage());
    return parsed.operation === undefined && !parsed.given.has('help') ? 1 : 0;
  }
  const operation = findOperation(parsed.operation);
  if (operation === undefined) {
    surroundings.say('There is no operation with that name. Run diligent --help for the list.');
    return 1;
  }
  let kept = await readKept(surroundings.home);
  const where = parsed.install ?? kept.install;
  if (where === undefined) {
    surroundings.say('Say where the install is with --install <address>. It is remembered after that.');
    return 1;
  }
  const checked = addressOf(where);
  if ('refused' in checked) {
    surroundings.say(checked.refused);
    return 1;
  }
  const install = checked.address;
  // A session belongs to the address that issued it. When the address
  // changes the session is dropped, at once, and is never sent to the new one.
  if (kept.install !== install) {
    kept = { install };
    await writeKept(surroundings.home, kept);
  }
  const input = await inputFor(operation, parsed.given, surroundings);
  if (typeof input === 'string') {
    surroundings.say(input);
    return 1;
  }

  let response: Response;
  let answer: unknown;
  try {
    response = await surroundings.fetch(`${install}${OPERATION_PATH}${operation.name}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(kept.session === undefined ? {} : { cookie: `${SESSION_COOKIE}=${kept.session}` }),
      },
      body: JSON.stringify(input),
      // A redirect would send the session and the input on to another
      // address. It is an error, never followed.
      redirect: 'error',
    });
    answer = await response.json();
  } catch {
    surroundings.say(`The install at ${install} did not answer.`);
    return 1;
  }
  if (!isAnswer(answer)) {
    surroundings.say(`The install at ${install} did not answer as Diligent does.`);
    return 1;
  }

  // The session is kept on this PC and never printed. The password is not kept.
  const change = sessionChange(response);
  const next: Kept = { install };
  const session = change === undefined ? kept.session : (change.session ?? undefined);
  if (session !== undefined && answer.result !== 'not_signed_in') {
    next.session = session;
  }
  if (next.install !== kept.install || next.session !== kept.session) {
    await writeKept(surroundings.home, next);
  }

  // It prints what the operation returned and adds nothing of its own.
  surroundings.print(JSON.stringify(answer, null, 2));
  return 0;
}
