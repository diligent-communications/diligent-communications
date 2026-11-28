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
  CHANGES: string[];
  MAIN_ACTION_NAMES: Record<string, string>;
  MAIN_ACTION_LATER: Record<string, string>;
  lineParts(matter: Record<string, unknown>): string[];
  laneName(lane: string): string;
  laneOf(typed: string): string;
  snoozeTimes(now: Date): Record<string, string>;
  snoozeOnDay(day: string): string;
  stateBefore(matter: { state: string }): string;
  pageState(matter: { state: string; snoozed_until: string | null }, now: Date): { badge: string; kind: string; main: string; offerBack: boolean };
  emptyLine(lane: string, waiting: boolean): string;
  personName(found: Record<string, unknown>): string;
  whoName(who: string, agents: Map<string, string> | null): string;
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

// The operations the script calls by name, read from its source.
function calledByScript(source: string): Set<string> {
  return new Set(Array.from(source.matchAll(/\b(?:call|change)\('([a-z_]+)'/g), ([, name]) => name!));
}

test('every operation is called from the screen, by a form or by the script, and each form takes inputs its operation takes', async () => {
  const forms = formsOf(page);
  const source = await readFile(path.join(publicFolder, 'app.js'), 'utf8');
  const called = calledByScript(source);
  for (const operation of operationList) {
    const mine = forms.filter((form) => form.operation === operation.name);
    assert.ok(mine.length >= 1 || called.has(operation.name), `${operation.name} can be called from the screen`);
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
  for (const name of called) {
    assert.ok(operationList.some((operation) => operation.name === name), `${name} is an operation`);
  }
  // The script makes up a request ID for exactly the operations it calls that take one.
  assert.deepEqual(
    [...script.CHANGES].sort(),
    operationList.filter((operation) => operation.request_id && called.has(operation.name)).map((operation) => operation.name).sort(),
  );
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

test('nothing an operation returns is written into the page as HTML', async () => {
  const source = await readFile(path.join(publicFolder, 'app.js'), 'utf8');
  for (const way of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'createContextualFragment', 'DOMParser', 'srcdoc']) {
    assert.equal(source.includes(way), false, `app.js uses ${way}`);
  }
});

test('a line shows its next action, timing or due date, and who owes it; a lane is shown with a capital and stored in lowercase', () => {
  const matter = { next_action: 'Pay the invoice', timing: 'by Friday', owed_by: 'you', due: null };
  assert.deepEqual(script.lineParts(matter), ['Pay the invoice', 'by Friday', 'you']);
  assert.deepEqual(script.lineParts({ ...matter, owed_by: 'A made-up supplier' }), ['Pay the invoice', 'by Friday', 'waiting on A made-up supplier']);
  const due = script.lineParts({ ...matter, due: '2026-12-12' });
  assert.equal(due.length, 3);
  assert.match(due[1]!, /^due /);
  assert.deepEqual(script.lineParts({ next_action: '', timing: '', owed_by: '', due: null }), []);
  assert.equal(script.laneName('job-114'), 'Job 114');
  assert.equal(script.laneName('work'), 'Work');
  assert.equal(script.laneOf(' Home Office '), 'home-office');
  // The three main actions have a button, and none has no word for later.
  assert.deepEqual(Object.keys(script.MAIN_ACTION_NAMES).sort(), ['contact', 'reply', 'schedule']);
  assert.deepEqual(Object.keys(script.MAIN_ACTION_LATER).sort(), ['contact', 'reply', 'schedule']);
});

test('Undo puts a line back on the Brief, or under Waiting for a matter that was waiting', () => {
  assert.equal(script.stateBefore({ state: 'open' }), 'open');
  // A snoozed line on the Brief is one whose time has come: Undo leaves it open.
  assert.equal(script.stateBefore({ state: 'snoozed' }), 'open');
  assert.equal(script.stateBefore({ state: 'waiting' }), 'waiting');
});

test("a matter's page has Done unless the matter is done or dismissed, and never shows a snooze whose time has gone", () => {
  const now = new Date('2026-12-02T12:00:00Z');
  const later = '2026-12-03T08:00:00Z';
  const gone = '2026-12-01T08:00:00Z';
  for (const state of ['open', 'waiting'] as const) {
    assert.equal(script.pageState({ state, snoozed_until: null }, now).main, 'done', state);
  }
  assert.equal(script.pageState({ state: 'open', snoozed_until: null }, now).offerBack, false);
  assert.equal(script.pageState({ state: 'waiting', snoozed_until: null }, now).offerBack, true);
  const snoozed = script.pageState({ state: 'snoozed', snoozed_until: later }, now);
  assert.deepEqual([snoozed.main, snoozed.offerBack], ['done', true]);
  assert.match(snoozed.badge, /^Snoozed until /);
  // Its time has come: it is on the Brief, and the page says so.
  assert.deepEqual(script.pageState({ state: 'snoozed', snoozed_until: gone }, now), { badge: 'On the Brief', kind: 'open', main: 'done', offerBack: false });
  for (const state of ['done', 'dismissed'] as const) {
    const shown = script.pageState({ state, snoozed_until: null }, now);
    assert.deepEqual([shown.main, shown.offerBack], ['reopen', false], state);
  }
});

test('an empty Brief says so about the filter chosen', () => {
  assert.equal(script.emptyLine('', false), 'Nothing needs you right now.');
  assert.equal(script.emptyLine('', true), 'Nothing is marked waiting.');
  assert.equal(script.emptyLine('job-114', false), 'Nothing in Job 114 needs you right now.');
  assert.equal(script.emptyLine('work', true), 'Nothing in Work is marked waiting.');
});

test('a name that could not be loaded is not shown as gone', () => {
  assert.equal(script.personName({ result: 'person', person: { id: 'p1', name: 'A made-up neighbour', confirmed: 'no' } }), 'A made-up neighbour');
  assert.equal(script.personName({ result: 'unknown_person' }), 'A person no longer on record');
  for (const result of ['unavailable', 'not_signed_in', 'not_allowed']) {
    assert.equal(script.personName({ result }), 'A name that could not be loaded', result);
  }
  const agents = new Map([['agent:a1', 'sorter']]);
  assert.equal(script.whoName('agent:a1', agents), 'Agent sorter');
  assert.equal(script.whoName('agent:a2', agents), 'An agent no longer listed');
  assert.equal(script.whoName('agent:a1', null), 'An agent whose name could not be loaded');
  assert.equal(script.whoName('you', null), 'You');
});

test('a title link takes a tap at least 44 px tall without changing the layout', async () => {
  const css = await readFile(path.join(publicFolder, 'app.css'), 'utf8');
  const rule = css.slice(css.indexOf('.line-title::after {'), css.indexOf('}', css.indexOf('.line-title::after {')));
  assert.ok(rule.length > 0, 'the title has a tap area');
  assert.ok(rule.includes('position: absolute'));
  assert.ok(rule.includes('inset-block: min(0px, calc((100% - var(--base-size-44)) / 2))'));
  assert.ok(/\.line-title \{[^}]*position: relative/.test(css));
});

test('a snooze comes back at 8 in the morning, tomorrow, on the next Monday, or on a day picked', () => {
  // A Wednesday afternoon.
  const now = new Date(2026, 11, 2, 15, 30);
  const times = script.snoozeTimes(now);
  assert.equal(new Date(times.tomorrow).getTime(), new Date(2026, 11, 3, 8).getTime());
  assert.equal(new Date(times['next-week']).getTime(), new Date(2026, 11, 7, 8).getTime());
  // On a Monday, the next Monday is a week on.
  assert.equal(new Date(script.snoozeTimes(new Date(2026, 11, 7, 9))['next-week']).getTime(), new Date(2026, 11, 14, 8).getTime());
  assert.equal(new Date(script.snoozeOnDay('2026-12-20')).getTime(), new Date(2026, 11, 20, 8).getTime());
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
  const needsAdvice = [
    ...Object.keys(ANY_OPERATION_RESULTS),
    'wrong_code',
    'wrong_password',
    'locked_out',
    'name_taken',
    'unknown_agent',
    'created',
    'set',
    'unknown_matter',
    'unknown_link',
    'unknown_person',
    'same_matter',
  ];
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
