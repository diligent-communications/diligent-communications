import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { isAnswer } from '../../../contracts/operation.ts';
import { AGENT_CONNECTION_PATH } from '../../mcp/src/address.ts';
import { OPERATION_PATH, SESSION_COOKIE } from '../src/addresses.ts';
import { REPOSITORY, madeUp, startInstall } from './helpers/local-install.ts';
import type { Install } from './helpers/local-install.ts';
import { agentConnection, newerCall, post, screen } from './helpers/ways.ts';

let install: Install;

before(async () => {
  install = await startInstall();
});

after(async () => {
  await install?.close();
});

test('an operation is called with a POST of JSON to its own address, and anything else is refused before the door', async () => {
  assert.equal(OPERATION_PATH, '/api/');
  assert.equal(AGENT_CONNECTION_PATH, '/mcp');
  assert.equal(SESSION_COOKIE, 'diligent_session');

  const get = await install.fetch('/api/whoami');
  assert.equal(get.status, 405);
  assert.equal(((await get.json()) as { result: string }).result, 'invalid_input');

  const notJson = await install.fetch('/api/whoami', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'not json {' });
  assert.equal(notJson.status, 400);
  assert.equal(((await notJson.json()) as { result: string }).result, 'invalid_input');

  const asForm = await install.fetch('/api/sign_in', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'password=anything' });
  assert.equal(asForm.status, 400);

  const tooBig = await install.fetch('/api/sign_in', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'x'.repeat(70_000) }) });
  assert.equal(tooBig.status, 400);

  // The limit is on what arrives, not on what a request says: a stream with
  // no declared length is refused the same way, and one within the limit is read.
  const stream = (text: string): RequestInit & { duplex: 'half' } => ({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    duplex: 'half',
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        const bytes = new TextEncoder().encode(text);
        controller.enqueue(bytes.slice(0, 10));
        controller.enqueue(bytes.slice(10));
        controller.close();
      },
    }) as unknown as BodyInit,
  });
  const streamedTooBig = await install.fetch('/api/sign_in', stream(JSON.stringify({ password: 'x'.repeat(70_000) })));
  assert.equal(streamedTooBig.status, 400);
  assert.equal(((await streamedTooBig.json()) as { description: string }).description.includes('at most 65,536 bytes'), true);
  const streamed = await install.fetch('/api/whoami', stream('{}'));
  assert.equal(streamed.status, 200);
  assert.equal(((await streamed.json()) as { result: string }).result, 'not_signed_in');

  const unknown = await post(install, 'no_such_operation', {});
  assert.equal(unknown.status, 200);
  assert.equal(unknown.answer.result, 'invalid_input');

  const elsewhere = await install.fetch('/somewhere-else', { method: 'POST', body: '{}' });
  assert.equal(elsewhere.status, 404);
});

test('every answer is a named result with a description, and is never stored by a browser or a go-between', async () => {
  const { response, answer } = await post(install, 'whoami', {});
  assert.equal(isAnswer(answer), true);
  assert.equal(answer.result, 'not_signed_in');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok((response.headers.get('content-type') ?? '').startsWith('application/json'));
});

test('the database is the only thing the program is bound to, besides its one secret', async () => {
  // Read from the settings file as written. Comments are whole lines there.
  const text = await readFile(path.join(REPOSITORY, 'wrangler.jsonc'), 'utf8');
  const settings = JSON.parse(text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n')) as Record<string, unknown>;
  assert.deepEqual(Object.keys(settings).sort(), ['$schema', 'assets', 'compatibility_date', 'd1_databases', 'main', 'name', 'secrets', 'send_metrics']);
  assert.deepEqual(settings.d1_databases, [{ binding: 'DB', database_name: 'diligent' }]);
  assert.deepEqual(settings.secrets, { required: ['SETUP_CODE'] });
  assert.deepEqual(settings.assets, { directory: 'modules/app/public' });
  assert.equal(settings.send_metrics, false);
});

test('the binding types file matches the settings file', async () => {
  const { experimental_generateTypes } = await import('wrangler');
  const generated = await experimental_generateTypes({ config: path.join(REPOSITORY, 'wrangler.jsonc'), includeRuntime: false });
  const committed = await readFile(path.join(REPOSITORY, 'worker-configuration.d.ts'), 'utf8');
  // The line that says how the file was generated names the command used,
  // which differs here. Everything else must be the same.
  const plain = (text: string): string =>
    text
      .replaceAll('\r\n', '\n')
      .split('\n')
      .filter((line) => !line.startsWith('// Generated by Wrangler'))
      .join('\n')
      .trim();
  assert.equal(plain(committed), plain(generated.content), 'Run `npx wrangler types --include-runtime=false` and commit the result.');
});

test('when the install cannot finish, it answers unavailable and says nothing about what failed', async () => {
  const broken = await startInstall();
  try {
    const person = screen(broken);
    const password = madeUp('password');
    await person.call('password_set', { code: broken.setupCode, password });
    await person.call('sign_in', { password });
    // The database loses a table it needs, as if it had been damaged.
    const database = await broken.database();
    await database.prepare('DROP TABLE access_agents').run();

    const cookie = person.setCookies.at(-1)!.split(';')[0]!;
    const response = await broken.fetch('/api/agent_list', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: '{}' });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { result: 'unavailable', description: 'The install could not finish this now. Nothing was changed.' });
  } finally {
    await broken.close();
  }
});

test('when the install cannot finish a tool call, the agent gets unavailable and nothing about what failed', async () => {
  const broken = await startInstall();
  const person = screen(broken);
  await person.call('password_set', { code: broken.setupCode, password: madeUp('password') });
  const created = await person.call('agent_create', { name: 'caller', level: 'read' });
  const token = String(created.token);
  const connection = await agentConnection(broken, token);
  const inNewerForm = await agentConnection(broken, token, 'newer');
  try {
    assert.equal((await connection.call('agent_set', { agent: 'abc', on: true })).result, 'not_allowed');
    assert.equal((await inNewerForm.call('agent_set', { agent: 'abc', on: true })).result, 'not_allowed');
    // The database loses the table the record is kept in, as if damaged, so
    // recording the next refused change fails inside the door.
    const database = await broken.database();
    await database.prepare('DROP TABLE activity').run();

    const expected = { result: 'unavailable', description: 'The install could not finish this now. Nothing was changed.' };
    assert.deepEqual(await connection.call('agent_set', { agent: 'abc', on: true }), expected);
    assert.deepEqual(await inNewerForm.call('agent_set', { agent: 'abc', on: true }), expected);

    // The whole reply, as sent, says nothing of the failure, in either form
    // of the protocol.
    const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${token}` };
    const input = { request_id: crypto.randomUUID(), agent: 'abc', on: true };
    const newer = newerCall(2, 'agent_set', input);
    const calls = [
      { headers, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'agent_set', arguments: input } }) },
      { headers: { ...headers, ...newer.headers }, body: newer.body },
    ];
    for (const call of calls) {
      const response = await broken.fetch('/mcp', { method: 'POST', ...call });
      assert.equal(response.status, 200);
      const sent = await response.text();
      assert.ok(sent.includes('unavailable'));
      for (const leaked of ['D1_ERROR', 'no such table', 'activity', 'SQLITE', 'INSERT']) {
        assert.equal(sent.includes(leaked), false, leaked);
      }
    }
    // The same call on the operation address answers the same.
    const onAddress = await post(broken, 'agent_set', { request_id: crypto.randomUUID(), agent: 'abc', on: true }, { authorization: `Bearer ${token}` });
    assert.deepEqual(onAddress.answer, expected);
  } finally {
    await connection.close();
    await inNewerForm.close();
    await broken.close();
  }
});

test('the host reads a request body in one place only, the reader that stops at the limit', async () => {
  // Whether a read stopped early cannot be seen from outside the program, so
  // this checks the code: no other way of reading a body is used in the host.
  const source = async (file: string): Promise<string> => readFile(path.join(REPOSITORY, 'modules', 'host', 'src', file), 'utf8');
  const worker = await source('worker.ts');
  for (const other of ['.text()', '.json()', '.arrayBuffer()', '.formData()', '.blob()', '.bytes()', 'getReader', 'request.body']) {
    assert.equal(worker.includes(other), false, `worker.ts reads a body with ${other}`);
  }
  assert.equal(worker.split('readBody(request)').length - 1, 2);
  assert.ok((await source('body.ts')).includes('received > limit'));
});
