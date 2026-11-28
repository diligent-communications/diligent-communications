import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { after, test } from 'node:test';
import type { Agent } from '../../../contracts/agent.ts';
import { madeUp, newFolder, startInstallOnDisk } from './helpers/local-install.ts';
import { agentConnection, post, screen } from './helpers/ways.ts';

type Running = Awaited<ReturnType<typeof startInstallOnDisk>>;

// The install that is running now, so it is stopped even when a test fails.
let running: Running | undefined;

async function stop(): Promise<void> {
  const install = running;
  running = undefined;
  await install?.close();
}

after(stop);

async function filesIn(folder: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await filesIn(full)));
    } else if (entry.isFile()) {
      found.push(full);
    }
  }
  return found;
}

test('on a PC the database is one local file: it outlives a restart, and it holds no sign-in', async () => {
  const folder = newFolder('pc-data');
  const setupCode = madeUp('setup-code');
  const password = madeUp('password');
  const guess = madeUp('guess');

  // First run: set the password, sign in, make an agent, use it.
  running = await startInstallOnDisk(folder, setupCode);
  const device = screen(running);
  assert.equal((await device.call('password_set', { code: setupCode, password })).result, 'set');
  assert.equal((await device.call('sign_in', { password: guess })).result, 'wrong_password');
  assert.equal((await device.call('sign_in', { password })).result, 'signed_in');
  const created = await device.call('agent_create', { name: 'kept-agent', level: 'read' });
  assert.equal(created.result, 'created');
  const token = String(created.token);
  const agent = created.agent as Agent;
  const session = device.cookies.get('diligent_session')!;
  await stop();

  const database = (await filesIn(folder)).filter((file) => file.includes(`${path.sep}d1${path.sep}`) && file.endsWith('.sqlite'));
  assert.ok(database.length >= 1, 'the database is a file in the data folder');

  // Second run, same folder: the session, the agent and the record are there.
  running = await startInstallOnDisk(folder, setupCode);
  const sameDevice = screen(running);
  sameDevice.cookies.set('diligent_session', session);
  assert.equal((await sameDevice.call('whoami')).result, 'you');
  const listed = (await sameDevice.call('agent_list')).agents as Agent[];
  assert.deepEqual(listed.map((row) => row.id), [agent.id]);
  const connection = await agentConnection(running, token);
  try {
    assert.equal((await connection.call('whoami')).result, 'agent');
  } finally {
    await connection.close();
  }
  // The used set-up code stayed used across the restart.
  assert.equal((await post(running, 'password_set', { code: setupCode, password: madeUp('password') })).answer.result, 'wrong_code');
  await stop();

  // Every file the local runtime kept is searched, as bytes, for each secret.
  const files = await filesIn(folder);
  const secrets = { setupCode, password, guess, session, token };
  let agentNameSeen = false;
  for (const file of files) {
    const bytes = await readFile(file);
    agentNameSeen ||= bytes.includes(Buffer.from('kept-agent', 'utf8'));
    for (const [name, secret] of Object.entries(secrets)) {
      for (const encoding of ['utf8', 'utf16le'] as const) {
        assert.equal(bytes.includes(Buffer.from(secret, encoding)), false, `the ${name} is in ${path.relative(folder, file)}`);
      }
    }
  }
  // The search would find plain text: the agent's name is there.
  assert.equal(agentNameSeen, true);
});
