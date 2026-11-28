import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { after, test } from 'node:test';
import type { Answer } from '../../../contracts/operation.ts';
import { madeUp, startInstall } from '../../host/test/helpers/local-install.ts';
import type { Install } from '../../host/test/helpers/local-install.ts';
import { agentConnection, commandLine, post, screen } from '../../host/test/helpers/ways.ts';
import type { Way } from '../../host/test/helpers/ways.ts';

let install: Install | undefined;

after(async () => {
  await install?.close();
});

// Every row of every table, as text.
async function wholeDatabase(running: Install): Promise<{ text: string; tables: string[] }> {
  const database = await running.database();
  const tables = (await database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all<{ name: string }>()).results.map((row) => row.name);
  const parts: string[] = [];
  for (const table of tables) {
    const rows = (await database.prepare(`SELECT * FROM "${table}"`).all<Record<string, unknown>>()).results;
    parts.push(JSON.stringify({ table, rows }));
  }
  return { text: parts.join('\n'), tables };
}

test('after every kind of sign-in has been made and used, none is in the database, a kept answer, a result or a record, except the one answer that first showed each token', async () => {
  install = await startInstall();
  const running = install;
  const answers: Answer[] = [];
  // Every answer any way in returns is kept for the search.
  const watched = (way: Way): Way => ({
    async call(operation, input) {
      const answer = await way.call(operation, input);
      answers.push(answer);
      return answer;
    },
  });

  const firstCode = running.setupCode;
  const firstPassword = madeUp('password');
  const secondPassword = madeUp('password');
  const thirdPassword = madeUp('password');
  const guess = madeUp('guess');
  const wrongCode = madeUp('wrong-code');

  const browser = screen(running);
  const onScreen = watched(browser);
  const terminal = commandLine(running);
  const atCommandLine = watched(terminal);

  // The first password, wrong tries, and two devices signed in.
  await onScreen.call('password_set', { code: wrongCode, password: firstPassword });
  assert.equal((await onScreen.call('password_set', { code: firstCode, password: firstPassword })).result, 'set');
  // Setting the password with the set-up code signed this device in.
  const setupSession = browser.cookies.get('diligent_session')!;
  await onScreen.call('sign_in', { password: guess });
  assert.equal((await onScreen.call('sign_in', { password: firstPassword })).result, 'signed_in');
  assert.equal((await atCommandLine.call('sign_in', { password: firstPassword })).result, 'signed_in');
  const firstSession = browser.cookies.get('diligent_session')!;
  const terminalSession = (JSON.parse(await readFile(path.join(terminal.home, 'session.json'), 'utf8')) as { session: string }).session;

  // Two agents, one made on the screen and one at the command line, a repeat
  // of each, and each agent used.
  const screenRequest = { request_id: madeUp('request'), name: 'made-on-screen', level: 'read' };
  const screenToken = String((await onScreen.call('agent_create', screenRequest)).token);
  await onScreen.call('agent_create', screenRequest);
  const terminalRequest = { request_id: madeUp('request'), name: 'made-at-command-line', level: 'prepare' };
  const terminalToken = String((await atCommandLine.call('agent_create', terminalRequest)).token);
  await atCommandLine.call('agent_create', terminalRequest);
  for (const token of [screenToken, terminalToken]) {
    const connection = await agentConnection(running, token);
    try {
      const asAgent = watched(connection);
      await asAgent.call('whoami');
      await asAgent.call('agent_list');
      await asAgent.call('sign_in', { password: firstPassword });
    } finally {
      await connection.close();
    }
    answers.push((await post(running, 'whoami', {}, { authorization: `Bearer ${token}` })).answer);
  }

  // The password changed while signed in, then reset with a new set-up code.
  await onScreen.call('password_set', { current: guess, password: secondPassword });
  assert.equal((await onScreen.call('password_set', { current: firstPassword, password: secondPassword })).result, 'set');
  const secondCode = madeUp('setup-code');
  await running.changeSetupCode(secondCode);
  assert.equal((await onScreen.call('password_set', { code: secondCode, password: thirdPassword })).result, 'set');
  const resetSession = browser.cookies.get('diligent_session')!;
  assert.equal((await onScreen.call('sign_in', { password: thirdPassword })).result, 'signed_in');
  const secondSession = browser.cookies.get('diligent_session')!;
  assert.equal(new Set([setupSession, firstSession, resetSession, secondSession]).size, 4);
  await onScreen.call('agent_list');
  await onScreen.call('activity_list', { limit: 200 });
  await onScreen.call('sign_out');
  assert.equal((await onScreen.call('sign_in', { password: thirdPassword })).result, 'signed_in');
  const thirdSession = browser.cookies.get('diligent_session')!;
  const record = await onScreen.call('activity_list', { limit: 200 });

  const secrets: Record<string, string> = {
    firstCode,
    secondCode,
    wrongCode,
    firstPassword,
    secondPassword,
    thirdPassword,
    guess,
    setupSession,
    firstSession,
    resetSession,
    secondSession,
    thirdSession,
    terminalSession,
    screenToken,
    terminalToken,
  };
  for (const [name, secret] of Object.entries(secrets)) {
    assert.ok(secret.length >= 32, `${name} was made`);
  }

  // The database: every row of every table.
  const { text, tables } = await wholeDatabase(running);
  assert.deepEqual(tables.sort(), [
    'access_agents',
    'access_password',
    'access_sessions',
    'access_setup_codes',
    'access_tries',
    'activity',
    'brief_history',
    'brief_matters',
    'links',
    'operations_requests',
    'people',
    'store_guard',
    'store_upgrades',
  ]);
  // The guard table never holds a row.
  assert.ok(text.includes('{"table":"store_guard","rows":[]}'));
  // The search would find plain text: these are there.
  for (const present of ['made-on-screen', 'made-at-command-line', 'scrypt$N=32768,r=8,p=3$', screenRequest.request_id, '"result":"created"']) {
    assert.ok(text.includes(present), `${present} is in the database`);
  }
  for (const [name, secret] of Object.entries(secrets)) {
    assert.equal(text.includes(secret), false, `the ${name} is in the database`);
  }

  // Every result. A session or a password is in none. A token is in exactly
  // one: the answer that first showed it.
  const shown = (secret: string): number => answers.filter((answer) => JSON.stringify(answer).includes(secret)).length;
  for (const [name, secret] of Object.entries(secrets)) {
    const expected = name === 'screenToken' || name === 'terminalToken' ? 1 : 0;
    assert.equal(shown(secret), expected, `the ${name} is in ${shown(secret)} answers`);
  }
  assert.equal(answers.filter((answer) => 'token' in answer).length, 2);

  // Every record, as the person reads it.
  for (const [name, secret] of Object.entries(secrets)) {
    assert.equal(JSON.stringify(record).includes(secret), false, `the ${name} is in the activity record`);
  }

  // The command line printed its new token once and no other sign-in, and it
  // kept its session and never the password.
  const printed = terminal.printed.join('\n') + terminal.said.join('\n');
  assert.equal(printed.split(terminalToken).length - 1, 1);
  for (const name of ['firstPassword', 'terminalSession', 'firstCode']) {
    assert.equal(printed.includes(secrets[name]!), false, `the command line printed the ${name}`);
  }
  const kept = await readFile(path.join(terminal.home, 'session.json'), 'utf8');
  assert.equal(kept.includes(firstPassword), false);
});
