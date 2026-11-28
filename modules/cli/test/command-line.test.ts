import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { after, before, test } from 'node:test';
import type { Agent } from '../../../contracts/agent.ts';
import { REPOSITORY, madeUp, newFolder, startInstall } from '../../host/test/helpers/local-install.ts';
import type { Install } from '../../host/test/helpers/local-install.ts';
import { commandLine, screen } from '../../host/test/helpers/ways.ts';
import { operationList } from '../../operations/src/list.ts';
import { run } from '../src/diligent.ts';

let install: Install;
const password = madeUp('password');

type Kept = { install?: string; session?: string };

async function kept(home: string): Promise<Kept> {
  return JSON.parse(await readFile(path.join(home, 'session.json'), 'utf8')) as Kept;
}

type Seen = { path: string; cookie: string | undefined; body: string };

// A made-up server on this PC's own address, for a test to see exactly what
// the command line sends somewhere. It is closed when the test ends.
async function listener(reply: () => { status: number; headers?: Record<string, string>; body?: string }): Promise<{ origin: string; seen: Seen[]; close(): Promise<void> }> {
  const seen: Seen[] = [];
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => (body += String(chunk)));
    request.on('end', () => {
      seen.push({ path: request.url ?? '', cookie: request.headers.cookie, body });
      const { status, headers, body: text } = reply();
      response.writeHead(status, { 'content-type': 'application/json', ...headers });
      response.end(text ?? '');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('The made-up server has no port.');
  }
  return {
    origin: `http://127.0.0.1:${address.port}`,
    seen,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

// The command line with nothing real behind it: what it asks, says, prints
// and sends is kept for the test to read.
function watched(home: string, reply?: () => Response): { asked: string[]; said: string[]; printed: string[]; sent: { url: string; init: RequestInit }[]; run(args: string[]): Promise<number> } {
  const asked: string[] = [];
  const said: string[] = [];
  const printed: string[] = [];
  const sent: { url: string; init: RequestInit }[] = [];
  return {
    asked,
    said,
    printed,
    sent,
    run: (args) =>
      run({
        args,
        home,
        ask: async (question) => {
          asked.push(question);
          return 'a made-up answer to a question';
        },
        print: (text) => void printed.push(text),
        say: (text) => void said.push(text),
        fetch: (async (url: string, init: RequestInit) => {
          sent.push({ url, init });
          if (reply === undefined) {
            throw new Error('nothing should be sent');
          }
          return reply();
        }) as typeof fetch,
      }),
  };
}

before(async () => {
  install = await startInstall();
  assert.equal((await screen(install).call('password_set', { code: install.setupCode, password })).result, 'set');
});

after(async () => {
  await install?.close();
});

test('the command line stays signed in on that PC: it keeps its session and the address, and never the password', async () => {
  const terminal = commandLine(install);
  assert.equal(await terminal.run(['--install', install.origin, 'sign_in'], [password]), 0);
  assert.deepEqual(JSON.parse(terminal.printed[0]!), {
    result: 'signed_in',
    description: 'The password was right, and this device now has a session.',
  });

  const file = await kept(terminal.home);
  assert.equal(file.install, install.origin);
  assert.match(file.session ?? '', /^dls_[A-Za-z0-9_-]{43}$/);
  const text = await readFile(path.join(terminal.home, 'session.json'), 'utf8');
  assert.equal(text.includes(password), false);
  if (process.platform !== 'win32') {
    // Readable by this PC account only, where the system has such a rule.
    assert.equal((await stat(path.join(terminal.home, 'session.json'))).mode & 0o077, 0);
  }

  // The address and the session are remembered: the next command needs neither.
  assert.equal(await terminal.run(['whoami']), 0);
  assert.equal((JSON.parse(terminal.printed[1]!) as { result: string }).result, 'you');
  // The session was never printed.
  assert.equal(terminal.printed.join('\n').includes(file.session!), false);

  assert.equal(await terminal.run(['sign_out']), 0);
  assert.equal((JSON.parse(terminal.printed[2]!) as { result: string }).result, 'signed_out');
  assert.deepEqual(await kept(terminal.home), { install: install.origin });
  assert.equal(await terminal.run(['whoami']), 0);
  assert.equal((JSON.parse(terminal.printed[3]!) as { result: string }).result, 'not_signed_in');
});

test('it prints what the operation returned and adds nothing of its own', async () => {
  const terminal = commandLine(install);
  await terminal.call('sign_in', { password });
  const said = terminal.said.length;
  const created = await terminal.call('agent_create', { name: 'from-the-command-line', level: 'read' });
  assert.equal(created.result, 'created');
  assert.match(String(created.token), /^dla_/);
  // One printed answer per command, and nothing said beside it.
  assert.equal(terminal.printed.length, 2);
  assert.equal(terminal.said.length, said);
  assert.deepEqual(Object.keys(JSON.parse(terminal.printed[1]!) as object), ['result', 'description', 'agent', 'token']);

  // A yes or no, and a count, reach the operation as what they are.
  const id = (created.agent as Agent).id;
  const off = await terminal.call('agent_set', { agent: id, on: false });
  assert.equal((off.agent as Agent).on, false);
  const listed = await terminal.call('activity_list', { limit: 2 });
  assert.equal((listed.entries as unknown[]).length, 2);
});

test('a repeat with the same request ID is safe from the command line too', async () => {
  const terminal = commandLine(install);
  await terminal.call('sign_in', { password });
  const request = { request_id: madeUp('request'), name: 'made-once', level: 'prepare' };
  const first = await terminal.call('agent_create', request);
  const second = await terminal.call('agent_create', request);
  assert.equal('token' in first, true);
  assert.equal('token' in second, false);
  assert.deepEqual((second.agent as Agent).id, (first.agent as Agent).id);
  // Without one given, it makes up a new request ID each time.
  assert.equal((await terminal.call('agent_create', { name: 'made-twice', level: 'read' })).result, 'created');
  assert.equal((await terminal.call('agent_create', { name: 'made-twice', level: 'read' })).result, 'name_taken');
});

test('a secret is never a command-line argument: given as one, nothing is sent', async () => {
  const sent: unknown[] = [];
  const said: string[] = [];
  const printed: string[] = [];
  const code = await run({
    args: ['--install', install.origin, 'sign_in', '--password', password],
    home: newFolder('command-line-home'),
    ask: async () => '',
    print: (text) => void printed.push(text),
    say: (text) => void said.push(text),
    fetch: (async (...request: unknown[]) => {
      sent.push(request);
      throw new Error('nothing should be sent');
    }) as typeof fetch,
  });
  assert.equal(code, 1);
  assert.deepEqual(sent, []);
  assert.deepEqual(printed, []);
  assert.equal(said.join(' ').includes(password), false);
  assert.match(said.join(' '), /`password` is a secret/);

  for (const field of ['code', 'current']) {
    const terminal = commandLine(install);
    assert.equal(await terminal.run(['--install', install.origin, 'password_set', `--${field}=${madeUp('typed')}`]), 1);
    assert.deepEqual(terminal.printed, []);
  }
});

test('when there is no answer to print it prints nothing, says why, and ends with 1', async () => {
  const terminal = commandLine(install);
  assert.equal(await terminal.run(['whoami']), 1);
  assert.match(terminal.said.at(-1)!, /--install <address>/);
  assert.equal(await terminal.run(['--install', install.origin, 'no_such_operation']), 1);
  assert.match(terminal.said.at(-1)!, /There is no operation with that name/);
  assert.equal(await terminal.run(['--install', install.origin, 'agent_set', '--colour', 'blue']), 1);
  assert.match(terminal.said.at(-1)!, /An input given is not one `agent_set` takes/);
  assert.equal(await terminal.run(['--install', install.origin, 'agent_set', '--agent']), 1);
  assert.match(terminal.said.at(-1)!, /--agent needs a value/);
  // A port on this PC where nothing is listening.
  assert.equal(await terminal.run(['--install', 'http://127.0.0.1:9/', 'whoami']), 1);
  // The address it accepted is the one typed thing it says back.
  assert.equal(terminal.said.at(-1), 'The install at http://127.0.0.1:9 did not answer.');
  assert.deepEqual(terminal.printed, []);

  assert.equal(await terminal.run([]), 1);
  assert.equal(await terminal.run(['--help']), 0);
  for (const operation of operationList) {
    assert.ok(terminal.said.at(-1)!.includes(operation.name), operation.name);
  }
  assert.deepEqual(terminal.printed, []);
});

test('a session the install no longer knows is dropped from the PC', async () => {
  const fresh = await startInstall();
  try {
    const secret = madeUp('password');
    const browser = screen(fresh);
    await browser.call('password_set', { code: fresh.setupCode, password: secret });
    const terminal = commandLine(fresh);
    await terminal.call('sign_in', { password: secret });
    assert.ok((await kept(terminal.home)).session);

    // The password is reset with a new set-up code, which ends every session.
    const code = madeUp('setup-code');
    await fresh.changeSetupCode(code);
    assert.equal((await browser.call('password_set', { code, password: madeUp('password') })).result, 'set');

    assert.equal((await terminal.call('whoami')).result, 'not_signed_in');
    assert.deepEqual(await kept(terminal.home), { install: fresh.origin });
  } finally {
    await fresh.close();
  }
});

test('the program itself runs: a password comes in as a line, and the session file goes where DILIGENT_HOME says', async () => {
  const home = newFolder('program-home');
  const program = path.join(REPOSITORY, 'modules', 'cli', 'src', 'bin.ts');
  const runProgram = (args: string[], input: string): Promise<{ code: number; stdout: string; stderr: string }> =>
    new Promise((resolve) => {
      const child = execFile(
        process.execPath,
        [program, ...args],
        // The child gets a home of its own, inside the test folder. Every
        // name the program could take a home folder from points there too, so
        // a mistake in the program can never reach the real session file.
        { env: { ...process.env, DILIGENT_HOME: home, APPDATA: home, XDG_CONFIG_HOME: home, HOME: home, USERPROFILE: home }, timeout: 60_000 },
        (error, stdout, stderr) => resolve({ code: typeof error?.code === 'number' ? error.code : error ? 1 : 0, stdout, stderr }),
      );
      child.stdin?.end(input);
    });

  const signedIn = await runProgram(['--install', install.origin, 'sign_in'], `${password}\n`);
  assert.equal(signedIn.code, 0, signedIn.stderr);
  assert.equal((JSON.parse(signedIn.stdout) as { result: string }).result, 'signed_in');
  assert.equal(signedIn.stdout.includes(password), false);
  assert.match((await kept(home)).session ?? '', /^dls_/);

  const who = await runProgram(['whoami'], '');
  assert.equal(who.code, 0, who.stderr);
  assert.deepEqual(JSON.parse(who.stdout), { result: 'you', description: 'The caller is the person, at the level you.', level: 'you' });

  // Changing the password asks for the current one, then the new one.
  const next = madeUp('password');
  const changed = await runProgram(['password_set', '--current'], `${password}\n${next}\n`);
  assert.equal((JSON.parse(changed.stdout) as { result: string }).result, 'set');
  const back = await runProgram(['password_set', '--current'], `${next}\n${password}\n`);
  assert.equal((JSON.parse(back.stdout) as { result: string }).result, 'set');

  const refused = await runProgram(['sign_in', '--password', 'typed-as-an-argument'], '');
  assert.equal(refused.code, 1);
  assert.equal(refused.stdout, '');
});

test('a session is sent only to the address that issued it, and is dropped when the address changes', async () => {
  const terminal = commandLine(install);
  assert.equal((await terminal.call('sign_in', { password })).result, 'signed_in');
  const session = (await kept(terminal.home)).session!;
  assert.match(session, /^dls_/);

  // Another address, which answers as if all were well.
  const other = await listener(() => ({ status: 200, body: JSON.stringify({ result: 'you', description: 'A made-up answer.' }) }));
  try {
    assert.equal(await terminal.run(['--install', other.origin, 'whoami']), 0);
    // It was sent no session, and the session is gone from the PC.
    assert.equal(other.seen.length, 1);
    assert.equal(other.seen[0]!.cookie, undefined);
    assert.deepEqual(await kept(terminal.home), { install: other.origin });

    // The next command goes to the remembered address, still with no session.
    assert.equal(await terminal.run(['whoami']), 0);
    assert.equal(other.seen.length, 2);
    assert.equal(JSON.stringify(other.seen).includes(session), false);
  } finally {
    await other.close();
  }

  // Back at the first address the person signs in again: the session was dropped.
  const back = await terminal.call('whoami');
  assert.equal(back.result, 'not_signed_in');
  assert.deepEqual(await kept(terminal.home), { install: install.origin });
});

test("a plain http address is refused unless it is this PC's own, before a secret is asked for or anything is sent", async () => {
  for (const address of ['http://192.0.2.10:8787', 'http://diligent.example', 'http://localhost.example:8787', 'http://127.0.0.1.example']) {
    const terminal = watched(newFolder('command-line-home'));
    assert.equal(await terminal.run(['--install', address, 'sign_in']), 1, address);
    assert.match(terminal.said.join(' '), /plain http:\/\/ address is refused/, address);
    assert.deepEqual([terminal.asked, terminal.sent, terminal.printed], [[], [], []], address);
  }

  // A session file that names a plain address, however it got there, sends nothing.
  const home = newFolder('command-line-home');
  await mkdir(home, { recursive: true });
  await writeFile(path.join(home, 'session.json'), JSON.stringify({ install: 'http://192.0.2.10:8787', session: 'dls_a-made-up-session' }));
  const tampered = watched(home);
  assert.equal(await tampered.run(['whoami']), 1);
  assert.deepEqual([tampered.sent, tampered.printed], [[], []]);

  // Something that is not an install's address is refused the same way.
  for (const address of ['ftp://diligent.example', 'https://someone:secret@diligent.example', 'https://diligent.example/some/path', 'https://diligent.example/?a=b', 'diligent.example']) {
    const terminal = watched(newFolder('command-line-home'));
    assert.equal(await terminal.run(['--install', address, 'whoami']), 1, address);
    assert.deepEqual([terminal.asked, terminal.sent, terminal.printed], [[], [], []], address);
  }

  // An https address, and this PC's own plain address, are used.
  const answer = (): Response => new Response(JSON.stringify({ result: 'wrong_password', description: 'A made-up answer.' }), { headers: { 'content-type': 'application/json' } });
  for (const [address, sentTo] of [
    ['https://diligent.example', 'https://diligent.example/api/sign_in'],
    ['https://diligent.example/', 'https://diligent.example/api/sign_in'],
    ['http://localhost:8787', 'http://localhost:8787/api/sign_in'],
    ['http://127.0.0.1:8787/', 'http://127.0.0.1:8787/api/sign_in'],
    ['http://[::1]:8787', 'http://[::1]:8787/api/sign_in'],
  ] as const) {
    const terminal = watched(newFolder('command-line-home'), answer);
    assert.equal(await terminal.run(['--install', address, 'sign_in']), 0, address);
    assert.deepEqual(terminal.sent.map((request) => request.url), [sentTo]);
    // Every request refuses to be sent on somewhere else.
    assert.equal(terminal.sent[0]!.init.redirect, 'error');
  }
});

test('a redirect is an error and is never followed, so a password and a session go nowhere else', async () => {
  const elsewhere = await listener(() => ({ status: 200, body: JSON.stringify({ result: 'signed_in', description: 'A made-up answer.' }) }));
  let status = 307;
  const redirecting = await listener(() => ({ status, headers: { location: `${elsewhere.origin}/api/sign_in` } }));
  try {
    for (status of [301, 302, 303, 307, 308]) {
      const terminal = commandLine(install);
      const typed = madeUp('password');
      assert.equal(await terminal.run(['--install', redirecting.origin, 'sign_in'], [typed]), 1, String(status));
      assert.match(terminal.said.at(-1)!, /did not answer/);
      assert.deepEqual(terminal.printed, []);
      // Nothing was kept: no session, and not the address that failed.
      await assert.rejects(readFile(path.join(terminal.home, 'session.json'), 'utf8'));
    }
    // The first address was asked each time. The second was never reached.
    assert.equal(redirecting.seen.length, 5);
    assert.deepEqual(elsewhere.seen, []);
  } finally {
    await redirecting.close();
    await elsewhere.close();
  }
});

test('nothing typed on the line that could be a secret is ever said or printed back, wherever it sits', async () => {
  const secret = madeUp('typed-secret');
  const token = `dla_${madeUp('token')}`;
  const lines: string[][] = [
    ['--password', secret, 'sign_in'],
    ['sign_in', '--password', secret],
    ['sign_in', `--password=${secret}`],
    ['--code', secret, 'password_set'],
    ['password_set', '--code', secret],
    ['password_set', `--code=${secret}`],
    ['--current', secret, 'password_set'],
    ['password_set', '--current', secret],
    ['password_set', `--current=${secret}`, '--code'],
    [secret],
    ['whoami', secret],
    ['whoami', '--note', secret],
    [`--${secret}`, 'whoami'],
    ['whoami', `--${secret}`],
    ['agent_set', '--agent', 'abc', `--${secret}=x`],
    [token],
    ['whoami', token],
    ['--token', token, 'whoami'],
    ['whoami', '--token', token],
    ['whoami', `--token=${token}`],
    ['--install', secret, 'whoami'],
    ['--install', `https://diligent.example/${secret}`, 'whoami'],
    ['--install', `https://someone:${secret}@diligent.example`, 'whoami'],
  ];
  for (const line of lines) {
    // Once with no address known, and once with one, so each line gets as far as it can.
    for (const withAddress of [false, true]) {
      const terminal = watched(newFolder('command-line-home'));
      const args = withAddress && !line.includes('--install') ? ['--install', install.origin, ...line] : line;
      assert.equal(await terminal.run(args), 1, args.join(' '));
      const shown = [...terminal.said, ...terminal.printed, ...terminal.asked].join('\n');
      assert.equal(shown.includes(secret), false, args.join(' '));
      assert.equal(shown.includes(token), false, args.join(' '));
      assert.deepEqual(terminal.sent, [], args.join(' '));
    }
  }
});

test('a new address is remembered only after it answers as an install, so a mistyped one never gets a later password', async () => {
  const terminal = commandLine(install);
  assert.equal((await terminal.call('sign_in', { password })).result, 'signed_in');
  assert.ok((await kept(terminal.home)).session);

  // An address that answers, but not as an install does.
  const stranger = await listener(() => ({ status: 200, body: JSON.stringify({ hello: 'I am some other server' }) }));
  try {
    assert.equal(await terminal.run(['--install', stranger.origin, 'whoami']), 1);
    // The old session was dropped at once, and was not sent.
    assert.equal(stranger.seen[0]!.cookie, undefined);
    // The address that failed is not remembered. The one before it still is.
    assert.deepEqual(await kept(terminal.home), { install: install.origin });

    // A later sign-in with no address goes to the real install, password and all.
    const typed = madeUp('password');
    assert.equal(await terminal.run(['sign_in'], [typed]), 0);
    assert.equal((JSON.parse(terminal.printed.at(-1)!) as { result: string }).result, 'wrong_password');
    assert.equal(stranger.seen.length, 1);
    assert.equal(JSON.stringify(stranger.seen).includes(typed), false);
  } finally {
    await stranger.close();
  }

  // An address where nothing answers is not remembered either.
  assert.equal(await terminal.run(['--install', 'http://127.0.0.1:9', 'whoami']), 1);
  assert.deepEqual(await kept(terminal.home), { install: install.origin });

  // With nothing remembered yet, a failed address leaves nothing behind.
  const fresh = commandLine(install);
  assert.equal(await fresh.run(['--install', 'http://127.0.0.1:9', 'whoami']), 1);
  await assert.rejects(readFile(path.join(fresh.home, 'session.json'), 'utf8'));
  assert.equal(await fresh.run(['whoami']), 1);
  assert.match(fresh.said.at(-1)!, /--install <address>/);
});
