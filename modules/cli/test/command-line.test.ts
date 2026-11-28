import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
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
  assert.match(terminal.said.at(-1)!, /There is no operation named no_such_operation/);
  assert.equal(await terminal.run(['--install', install.origin, 'agent_set', '--colour', 'blue']), 1);
  assert.match(terminal.said.at(-1)!, /`colour` is not an input of `agent_set`/);
  assert.equal(await terminal.run(['--install', install.origin, 'agent_set', '--agent']), 1);
  assert.match(terminal.said.at(-1)!, /--agent needs a value/);
  // A port on this PC where nothing is listening.
  assert.equal(await terminal.run(['--install', 'http://127.0.0.1:9', 'whoami']), 1);
  assert.match(terminal.said.at(-1)!, /did not answer/);
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
        // The child gets a home of its own, inside the test folder.
        { env: { ...process.env, DILIGENT_HOME: home }, timeout: 60_000 },
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
