import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { ActivityEntry } from '../../../contracts/activity.ts';
import { madeUp, startInstall } from '../../host/test/helpers/local-install.ts';
import type { Install } from '../../host/test/helpers/local-install.ts';
import { agentConnection, commandLine, post, screen } from '../../host/test/helpers/ways.ts';
import { LOCK_MINUTES, SESSION_IDLE_DAYS, WRONG_TRIES } from '../src/limits.ts';

// Each test starts its own install, so each has an empty database.
const installs: Install[] = [];

async function fresh(options: { setupCode?: string } = {}): Promise<Install> {
  const install = await startInstall(options);
  installs.push(install);
  return install;
}

// An install with a password, and one device signed in.
async function withPassword(): Promise<{ install: Install; password: string; device: ReturnType<typeof screen> }> {
  const install = await fresh();
  const password = madeUp('password');
  const device = screen(install);
  assert.equal((await device.call('password_set', { code: install.setupCode, password })).result, 'set');
  assert.equal((await device.call('sign_in', { password })).result, 'signed_in');
  return { install, password, device };
}

async function activity(device: ReturnType<typeof screen>): Promise<ActivityEntry[]> {
  return (await device.call('activity_list', { limit: 200 })).entries as ActivityEntry[];
}

before(() => undefined);

after(async () => {
  await Promise.all(installs.map((install) => install.close()));
});

test('the first password needs the set-up code, a wrong code is refused however often it is tried, and a used code is refused', async () => {
  const install = await fresh();
  const stranger = screen(install);
  const password = madeUp('password');

  // A wrong code is refused every time and never locks the way in.
  for (let tries = 0; tries < WRONG_TRIES + 3; tries += 1) {
    const refused = await stranger.call('password_set', { code: madeUp('wrong-code'), password });
    assert.equal(refused.result, 'wrong_code');
  }
  assert.equal((await stranger.call('sign_in', { password })).result, 'wrong_password');

  const set = await stranger.call('password_set', { code: install.setupCode, password });
  assert.equal(set.result, 'set');
  assert.equal((await stranger.call('sign_in', { password })).result, 'signed_in');

  // The code is used up: it does not set a second password.
  const again = await screen(install).call('password_set', { code: install.setupCode, password: madeUp('password') });
  assert.equal(again.result, 'wrong_code');
  assert.equal((await screen(install).call('sign_in', { password })).result, 'signed_in');

  // Setting the password is recorded under the person. The wrong tries are not.
  const lines = (await activity(stranger)).filter((entry) => entry.operation === 'password_set');
  assert.deepEqual(lines.map((entry) => [entry.who, entry.result]), [['you', 'set']]);
});

test('an install with no set-up code, or one too short to be a secret, refuses every code', async () => {
  const none = await fresh({ setupCode: '' });
  assert.equal((await screen(none).call('password_set', { code: '', password: madeUp('password') })).result, 'invalid_input');
  assert.equal((await screen(none).call('password_set', { code: 'anything', password: madeUp('password') })).result, 'wrong_code');

  const short = 'only-thirty-one-characters-long';
  assert.equal(short.length, 31);
  const weak = await fresh({ setupCode: short });
  assert.equal((await screen(weak).call('password_set', { code: short, password: madeUp('password') })).result, 'wrong_code');
});

test('a password must be long, and one that is not is refused before anything is set', async () => {
  const install = await fresh();
  const device = screen(install);
  const refused = await device.call('password_set', { code: install.setupCode, password: 'fifteen chars..' });
  assert.equal(refused.result, 'invalid_input');
  assert.equal(JSON.stringify(refused).includes('fifteen chars..'), false);
  // The code was not used up by the refused try.
  assert.equal((await device.call('password_set', { code: install.setupCode, password: 'sixteen chars...' })).result, 'set');
});

test('once a password exists, setting it without a session and without a code is refused', async () => {
  const { install, password } = await withPassword();
  const stranger = screen(install);
  const refused = await stranger.call('password_set', { password: madeUp('password') });
  assert.equal(refused.result, 'not_allowed');
  assert.equal((await stranger.call('password_set', { current: password, password: madeUp('password') })).result, 'not_allowed');
  assert.equal((await stranger.call('sign_in', { password })).result, 'signed_in');
});

test('a wrong password is refused, repeated wrong tries lock the password, and the lock ends by itself', async () => {
  const { install, password, device } = await withPassword();
  const stranger = screen(install);

  for (let tries = 1; tries < WRONG_TRIES; tries += 1) {
    const wrong = await stranger.call('sign_in', { password: madeUp('guess') });
    assert.equal(wrong.result, 'wrong_password');
  }
  const started = Date.now();
  const locked = await stranger.call('sign_in', { password: madeUp('guess') });
  assert.equal(locked.result, 'locked_out');
  const until = Date.parse(String(locked.until));
  assert.ok(Math.abs(until - (started + LOCK_MINUTES * 60_000)) < 60_000);

  // During the lock even the right password is refused, unchecked, and the
  // lock is not made longer.
  const during = await stranger.call('sign_in', { password });
  assert.equal(during.result, 'locked_out');
  assert.equal(during.until, locked.until);
  assert.equal(stranger.cookies.size, 0);

  // A device that was already signed in keeps working.
  assert.equal((await device.call('whoami')).result, 'you');

  // One line says the lock started, by the install itself. A stranger's wrong
  // tries leave none.
  const lines = (await activity(device)).filter((entry) => entry.operation === 'sign_in');
  assert.deepEqual(lines.map((entry) => [entry.who, entry.result]), [
    ['diligent', 'locked_out'],
    ['you', 'signed_in'],
  ]);

  // The lock ends by itself: move its end into the past.
  const database = await install.database();
  await database.prepare("UPDATE access_tries SET locked_until = ? WHERE kind = 'password'").bind(new Date(Date.now() - 1000).toISOString()).run();
  assert.equal((await stranger.call('sign_in', { password })).result, 'signed_in');

  // A right password starts the count again.
  for (let tries = 1; tries < WRONG_TRIES; tries += 1) {
    assert.equal((await screen(install).call('sign_in', { password: madeUp('guess') })).result, 'wrong_password');
  }
  assert.equal((await screen(install).call('sign_in', { password })).result, 'signed_in');
  for (let tries = 1; tries < WRONG_TRIES; tries += 1) {
    assert.equal((await screen(install).call('sign_in', { password: madeUp('guess') })).result, 'wrong_password');
  }
});

test('sign_out ends the session on that device and on no other', async () => {
  const { install, password, device } = await withPassword();
  const second = screen(install);
  const third = commandLine(install);
  assert.equal((await second.call('sign_in', { password })).result, 'signed_in');
  assert.equal((await third.call('sign_in', { password })).result, 'signed_in');

  const out = await second.call('sign_out');
  assert.equal(out.result, 'signed_out');
  assert.equal(second.cookies.size, 0);
  assert.equal((await second.call('whoami')).result, 'not_signed_in');
  assert.equal((await device.call('whoami')).result, 'you');
  assert.equal((await third.call('whoami')).result, 'you');

  // A copy of the ended session no longer works either.
  const ended = second.setCookies[0]!.split(';')[0]!;
  assert.equal((await post(install, 'whoami', {}, { cookie: ended })).answer.result, 'not_signed_in');
});

test('a session ends by itself when it is not used, and using it keeps it', async () => {
  const { install, device } = await withPassword();
  const database = await install.database();
  const daysAgo = (days: number): string => new Date(Date.now() - days * 86_400_000).toISOString();

  await database.prepare('UPDATE access_sessions SET used_at = ?').bind(daysAgo(SESSION_IDLE_DAYS - 1)).run();
  assert.equal((await device.call('whoami')).result, 'you');
  // Using it started the wait again.
  const used = await database.prepare('SELECT used_at FROM access_sessions').all<{ used_at: string }>();
  assert.ok(used.results[0]!.used_at > daysAgo(1));

  await database.prepare('UPDATE access_sessions SET used_at = ?').bind(daysAgo(SESSION_IDLE_DAYS + 1)).run();
  assert.equal((await device.call('whoami')).result, 'not_signed_in');
});

test('changing the password while signed in needs the current one, and ends every other session', async () => {
  const { install, password, device } = await withPassword();
  const other = screen(install);
  assert.equal((await other.call('sign_in', { password })).result, 'signed_in');
  const next = madeUp('password');

  assert.equal((await device.call('password_set', { password: next })).result, 'invalid_input');
  const wrong = await device.call('password_set', { current: madeUp('guess'), password: next });
  assert.equal(wrong.result, 'wrong_password');
  assert.equal((await screen(install).call('sign_in', { password })).result, 'signed_in');

  const set = await device.call('password_set', { current: password, password: next });
  assert.equal(set.result, 'set');
  assert.equal((await device.call('whoami')).result, 'you');
  assert.equal((await other.call('whoami')).result, 'not_signed_in');
  assert.equal((await screen(install).call('sign_in', { password })).result, 'wrong_password');
  assert.equal((await screen(install).call('sign_in', { password: next })).result, 'signed_in');

  const lines = (await activity(device)).filter((entry) => entry.operation === 'password_set');
  assert.deepEqual(lines.map((entry) => [entry.who, entry.result]), [
    ['you', 'set'],
    ['you', 'wrong_password'],
    ['you', 'invalid_input'],
    ['you', 'set'],
  ]);
});

test('a wrong current password counts toward the lock, and a borrowed session cannot change the password', async () => {
  const { password, device } = await withPassword();
  for (let tries = 1; tries < WRONG_TRIES; tries += 1) {
    assert.equal((await device.call('password_set', { current: madeUp('guess'), password: madeUp('password') })).result, 'wrong_password');
  }
  const locked = await device.call('password_set', { current: madeUp('guess'), password: madeUp('password') });
  assert.equal(locked.result, 'locked_out');
  assert.equal((await device.call('password_set', { current: password, password: madeUp('password') })).result, 'locked_out');
  // The session itself still works.
  assert.equal((await device.call('whoami')).result, 'you');
});

test('a new set-up code is the way back from a forgotten password: it ends every session and leaves agents as they are', async () => {
  const { install, password, device } = await withPassword();
  const created = await device.call('agent_create', { name: 'sorter', level: 'prepare' });
  const agent = await agentConnection(install, String(created.token));
  try {
    const first = install.setupCode;
    const second = madeUp('setup-code');
    await install.changeSetupCode(second);

    const stranger = screen(install);
    const next = madeUp('password');
    // The used code stays used, and the new one works once without a session.
    assert.equal((await stranger.call('password_set', { code: first, password: next })).result, 'wrong_code');
    assert.equal((await stranger.call('password_set', { code: second, password: next })).result, 'set');
    assert.equal((await stranger.call('password_set', { code: second, password: madeUp('password') })).result, 'wrong_code');

    assert.equal((await device.call('whoami')).result, 'not_signed_in');
    assert.equal((await stranger.call('sign_in', { password })).result, 'wrong_password');
    assert.equal((await stranger.call('sign_in', { password: next })).result, 'signed_in');
    assert.equal((await agent.call('whoami')).result, 'agent');
  } finally {
    await agent.close();
  }
});

test("the session cookie is hidden from page scripts, kept from other sites, and sent only over HTTPS except on the PC's own address", async () => {
  const { install, password, device } = await withPassword();
  const local = device.setCookies.at(-1)!;
  const attributes = local.split(';').map((part) => part.trim().toLowerCase());
  assert.ok(attributes[0]!.startsWith('diligent_session=dls_'));
  for (const wanted of ['httponly', 'samesite=strict', 'path=/']) {
    assert.ok(attributes.includes(wanted), wanted);
  }
  assert.equal(attributes.includes('secure'), false);

  // On any other address the cookie is marked for HTTPS only.
  const elsewhere = await install.arriveAt('https://diligent.example/api/sign_in', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const secure = elsewhere.headers.getSetCookie()[0]!.split(';').map((part) => part.trim().toLowerCase());
  for (const wanted of ['httponly', 'samesite=strict', 'path=/', 'secure']) {
    assert.ok(secure.includes(wanted), wanted);
  }
});

test("a request another site's page started is refused, even with the person's cookie", async () => {
  const { install, device } = await withPassword();
  const cookie = device.setCookies.at(-1)!.split(';')[0]!;
  const change = { request_id: crypto.randomUUID(), name: 'planted', level: 'prepare' };

  const fromOtherOrigin = await post(install, 'agent_create', change, { cookie, origin: 'https://other.example' });
  assert.equal(fromOtherOrigin.status, 403);
  assert.equal(fromOtherOrigin.answer.result, 'not_allowed');

  const markedCrossSite = await post(install, 'agent_create', change, { cookie, 'sec-fetch-site': 'cross-site' });
  assert.equal(markedCrossSite.status, 403);

  const sameSiteOtherOrigin = await post(install, 'agent_create', change, { cookie, 'sec-fetch-site': 'same-site' });
  assert.equal(sameSiteOtherOrigin.status, 403);

  const read = await post(install, 'whoami', {}, { cookie, origin: 'https://other.example' });
  assert.equal(read.status, 403);

  // Nothing was made, and the same request from the install's own page works.
  assert.deepEqual((await device.call('agent_list')).agents, []);
  const own = await post(install, 'agent_create', change, { cookie, origin: install.origin, 'sec-fetch-site': 'same-origin' });
  assert.equal(own.answer.result, 'created');

  // An operation is never called by following a link.
  const followed = await install.fetch('/api/sign_out', { headers: { cookie } });
  assert.equal(followed.status, 405);
  assert.equal((await device.call('whoami')).result, 'you');
});
