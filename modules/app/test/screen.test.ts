import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';
import { ANY_OPERATION_RESULTS } from '../../../contracts/operation.ts';
import type { InputField } from '../../../contracts/operation.ts';
import { OPERATION_PATH } from '../../host/src/addresses.ts';
import { startInstall } from '../../host/test/helpers/local-install.ts';
import type { Install } from '../../host/test/helpers/local-install.ts';
import { PASSWORD_LENGTH } from '../../access/src/limits.ts';
import { operationList } from '../../operations/src/list.ts';

type ScreenScript = {
  OPERATION_PATH: string;
  ADVICE: Record<string, string>;
  requestFor(operation: string, input: unknown): { path: string; init: { method: string; headers: Record<string, string>; body: string } };
  inputOf(fields: { name: string; value: string; kind: string }[]): Record<string, unknown>;
};

const publicFolder = path.join(import.meta.dirname, '..', 'public');
let script: ScreenScript;
let page: string;
let install: Install;

type Form = { operation: string; takesRequestId: boolean; fields: { name: string; kind: string; required: boolean }[] };

// The forms on the page, read from its HTML.
function formsOf(html: string): Form[] {
  const forms: Form[] = [];
  for (const [, attributes, body] of html.matchAll(/<form([^>]*)>([\s\S]*?)<\/form>/g)) {
    const operation = /data-operation="([^"]+)"/.exec(attributes!)?.[1];
    assert.ok(operation, 'every form names its operation');
    const fields = Array.from(body!.matchAll(/<(?:input|select)\s([^>]*)>/g), ([, field]) => ({
      name: /name="([^"]+)"/.exec(field!)?.[1] ?? '',
      kind: /data-kind="([^"]+)"/.exec(field!)?.[1] ?? 'text',
      required: /\srequired/.test(` ${field}`),
    }));
    forms.push({ operation, takesRequestId: attributes!.includes('data-request-id'), fields });
  }
  return forms;
}

function kindOnScreen(field: InputField): string {
  return field.kind === 'yes_no' || field.kind === 'count' ? field.kind : 'text';
}

before(async () => {
  script = (await import(pathToFileURL(path.join(publicFolder, 'app.js')).href)) as ScreenScript;
  page = await readFile(path.join(publicFolder, 'index.html'), 'utf8');
  install = await startInstall();
});

after(async () => {
  await install?.close();
});

test('the screen has a form for every operation, and each form takes inputs its operation takes', () => {
  const forms = formsOf(page);
  for (const operation of operationList) {
    const mine = forms.filter((form) => form.operation === operation.name);
    assert.ok(mine.length >= 1, `${operation.name} has a form`);
    for (const form of mine) {
      assert.equal(form.takesRequestId, operation.request_id, `${operation.name} request ID`);
      for (const field of form.fields) {
        const input = operation.input[field.name];
        assert.ok(input, `${operation.name} takes ${field.name}`);
        assert.equal(field.kind, kindOnScreen(input), `${operation.name}.${field.name} kind`);
      }
      // Every input the operation requires can be given.
      for (const [name, input] of Object.entries(operation.input)) {
        if (input.required) {
          assert.ok(form.fields.some((field) => field.name === name && field.required), `${operation.name} asks for ${name}`);
        }
      }
    }
  }
  for (const form of forms) {
    assert.ok(operationList.some((operation) => operation.name === form.operation), `${form.operation} is an operation`);
  }
  // A new password's shortest length is the one access sets.
  const lengths = Array.from(page.matchAll(/autocomplete="new-password" minlength="(\d+)"/g), ([, length]) => Number(length));
  assert.deepEqual(lengths, [PASSWORD_LENGTH.min, PASSWORD_LENGTH.min]);
  // A secret is typed into a field that hides it.
  for (const [, field] of page.matchAll(/<input\s([^>]*)>/g)) {
    const name = /name="([^"]+)"/.exec(field!)?.[1];
    if (name === 'password' || name === 'code' || name === 'current') {
      assert.ok(field!.includes('type="password"'), `${name} is hidden as it is typed`);
    }
  }
});

test('the screen calls an operation at its address, as JSON, and never runs anything else', () => {
  assert.equal(script.OPERATION_PATH, OPERATION_PATH);
  assert.deepEqual(script.requestFor('agent_set', { agent: 'abc', on: false }), {
    path: '/api/agent_set',
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: '{"agent":"abc","on":false}',
    },
  });
  // No script in the page itself, and no handler attribute: the page's rules
  // for its own content allow only its one script file.
  assert.equal(/<script(?![^>]*\ssrc=)/.test(page), false);
  assert.equal(/\son[a-z]+=/.test(page), false);
});

test('a form sends each filled field as the kind its operation takes and leaves an empty one out', () => {
  assert.deepEqual(
    script.inputOf([
      { name: 'agent', value: 'abc', kind: 'text' },
      { name: 'level', value: '', kind: 'text' },
      { name: 'on', value: 'false', kind: 'yes_no' },
      { name: 'limit', value: '20', kind: 'count' },
      { name: '', value: 'ignored', kind: 'text' },
    ]),
    { agent: 'abc', on: false, limit: 20 },
  );
  assert.deepEqual(script.inputOf([{ name: 'on', value: 'true', kind: 'yes_no' }]), { on: true });
});

test('the advice beside a result is the screen\'s own, and every result that refuses has some', () => {
  const named = new Set<string>(Object.keys(ANY_OPERATION_RESULTS));
  for (const operation of operationList) {
    for (const result of Object.keys(operation.results)) {
      named.add(result);
    }
  }
  for (const result of Object.keys(script.ADVICE)) {
    assert.ok(named.has(result), `${result} is a result some operation returns`);
  }
  const needsAdvice = [...Object.keys(ANY_OPERATION_RESULTS), 'wrong_code', 'wrong_password', 'locked_out', 'name_taken', 'unknown_agent', 'created', 'set'];
  for (const result of needsAdvice) {
    assert.ok(script.ADVICE[result], `${result} has advice`);
  }
});

test('the install serves the screen to anyone, with rules that let it load only its own files', async () => {
  const served = await install.fetch('/');
  assert.equal(served.status, 200);
  // The file is served as it is on disk, whatever line endings a checkout gave it.
  assert.equal(await served.text(), page);
  const rules = served.headers.get('content-security-policy') ?? '';
  for (const rule of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'self'", "frame-ancestors 'none'", "form-action 'none'"]) {
    assert.ok(rules.includes(rule), rule);
  }
  assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
  // The page sets no cookie and says nothing about the install.
  assert.deepEqual(served.headers.getSetCookie(), []);

  for (const [file, type] of [['/app.js', 'text/javascript'], ['/app.css', 'text/css']] as const) {
    const response = await install.fetch(file);
    assert.equal(response.status, 200, file);
    assert.ok((response.headers.get('content-type') ?? '').startsWith(type), file);
  }
});

test('the stylesheet uses the Primer tokens and carries its licence notice beside it', async () => {
  const css = await readFile(path.join(publicFolder, 'app.css'), 'utf8');
  assert.ok(css.includes('@primer/primitives 11.10.0'));
  const notice = await readFile(path.join(publicFolder, '..', 'LICENSE-PRIMER'), 'utf8');
  assert.ok(notice.includes('The MIT License (MIT)') && notice.includes('GitHub Inc.'));
  // Every colour is a token: none is written straight into a rule.
  const rules = css.slice(css.indexOf('body {'));
  assert.equal(/#[0-9a-f]{3,8}\b/i.test(rules), false);
  assert.equal(/\brgb|hsl\(/.test(rules), false);
});
