import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ANY_OPERATION_RESULTS, checkInput, isAnswer, isOperation } from '../operation.ts';
import type { Operation } from '../operation.ts';

const sample: Operation = {
  name: 'sample_make',
  part: 'sample',
  meaning: 'Make a sample.',
  level: 'you',
  changes: true,
  request_id: true,
  input: {
    name: { kind: 'text', meaning: 'Its name.', required: true, max: 10 },
    words: { kind: 'text', meaning: 'A secret.', required: false, min: 4, max: 20, secret: true },
    level: { kind: 'choice', meaning: 'Its level.', required: false, choices: ['read', 'prepare'] },
    on: { kind: 'yes_no', meaning: 'On or off.', required: false },
    limit: { kind: 'count', meaning: 'How many.', required: false, min: 1, max: 5 },
  },
  results: { made: 'The sample was made.' },
  shown_once: ['token'],
};

test('an operation description is complete, and only a change takes a request ID', () => {
  assert.equal(isOperation(sample), true);
  assert.equal(isOperation({ ...sample, level: 'none' }), true);
  assert.equal(isOperation({ ...sample, name: 'Sample.Make' }), false);
  assert.equal(isOperation({ ...sample, level: 'act' }), false);
  assert.equal(isOperation({ ...sample, results: {} }), false);
  assert.equal(isOperation({ ...sample, changes: false }), false);
  assert.equal(isOperation({ ...sample, input: { request_id: sample.input.name } }), false);
  assert.equal(isOperation({ ...sample, input: { name: { kind: 'file', meaning: 'x', required: true } } }), false);
  assert.equal(isOperation({ ...sample, shown_once: ['Not A Name'] }), false);
});

test('an input is accepted only when it is exactly what the operation takes', () => {
  const good = { request_id: 'request-0001', name: 'one' };
  assert.deepEqual(checkInput(sample, good), { ok: true, input: good });
  assert.equal(checkInput(sample, { ...good, words: ' any thing ', level: 'read', on: false, limit: 5 }).ok, true);

  const refused: [unknown, string][] = [
    [null, 'the input must be one object'],
    [['a'], 'the input must be one object'],
    [{ name: 'one' }, '`request_id` is missing'],
    [{ ...good, request_id: 'short' }, '`request_id` must be 8 to 100 letters, digits, dots, colons, dashes or underscores'],
    [{ request_id: 'request-0001' }, '`name` is missing'],
    [{ ...good, extra: 1 }, '`extra` is not an input of `sample_make`'],
    [{ ...good, name: '' }, '`name` must be 1 to 10 characters'],
    [{ ...good, name: 'much too long' }, '`name` must be 1 to 10 characters'],
    [{ ...good, name: ' one' }, '`name` must not start or end with a space, or hold a control character'],
    [{ ...good, name: 'o\nne' }, '`name` must not start or end with a space, or hold a control character'],
    [{ ...good, name: 7 }, '`name` must be text'],
    [{ ...good, name: null }, '`name` must be text'],
    [{ ...good, words: 'abc' }, '`words` must be 4 to 20 characters'],
    [{ ...good, level: 'you' }, '`level` must be one of: read, prepare'],
    [{ ...good, on: 'yes' }, '`on` must be true or false'],
    [{ ...good, limit: 0 }, '`limit` must be a whole number from 1 to 5'],
    [{ ...good, limit: 1.5 }, '`limit` must be a whole number from 1 to 5'],
  ];
  for (const [input, about] of refused) {
    assert.deepEqual(checkInput(sample, input), { ok: false, about });
  }
});

test('a refusal names the field and never repeats the value', () => {
  const secret = 'a value nobody should see again';
  const check = checkInput(sample, { request_id: 'request-0001', name: 'one', words: secret, level: secret });
  assert.equal(check.ok, false);
  assert.equal(JSON.stringify(check).includes(secret), false);
});

test('an operation that takes no request ID refuses one', () => {
  const read: Operation = { ...sample, name: 'sample_list', changes: false, request_id: false, input: {} };
  assert.deepEqual(checkInput(read, {}), { ok: true, input: {} });
  assert.deepEqual(checkInput(read, { request_id: 'request-0001' }), {
    ok: false,
    about: '`request_id` is not an input of `sample_list`',
  });
});

test('an answer has a result name and a description, and the shared results each have one', () => {
  assert.equal(isAnswer({ result: 'made', description: 'The sample was made.', id: '1' }), true);
  assert.equal(isAnswer({ result: 'made' }), false);
  assert.equal(isAnswer({ result: 'Made it', description: 'x' }), false);
  assert.equal(isAnswer({ result: 'made', description: '' }), false);
  assert.deepEqual(Object.keys(ANY_OPERATION_RESULTS).sort(), [
    'changed_since',
    'invalid_input',
    'not_allowed',
    'not_signed_in',
    'request_id_reused',
    'switched_off',
    'unavailable',
  ]);
  for (const meaning of Object.values(ANY_OPERATION_RESULTS)) {
    assert.equal(meaning.length > 0, true);
  }
});

test('only a text declared many-lined accepts a line break, written as a plain one, and its limit counts what is kept', () => {
  const noting: Operation = {
    ...sample,
    input: {
      name: { kind: 'text', meaning: 'Its name.', required: true, max: 10 },
      notes: { kind: 'text', meaning: 'Notes.', required: false, min: 0, max: 9, lines: 'many' },
    },
  };
  assert.equal(isOperation(noting), true);
  assert.equal(isOperation({ ...noting, input: { notes: { kind: 'text', meaning: 'x', required: false, max: 9, lines: 'few' } } }), false);
  const base = { request_id: 'request-0001', name: 'one' };

  assert.deepEqual(checkInput(noting, { ...base, notes: 'one\ntwo' }), { ok: true, input: { ...base, notes: 'one\ntwo' } });
  // A Windows line ending is kept as a plain line break, and the limit counts that.
  // Sent, it is ten characters; kept, nine, which is the limit.
  assert.deepEqual(checkInput(noting, { ...base, notes: 'four\r\nfive' }), { ok: true, input: { ...base, notes: 'four\nfive' } });
  assert.equal(checkInput(noting, { ...base, notes: 'four\r\nfive!' }).ok, false);
  for (const notes of ['one\ttwo', 'one\rtwo', 'one\u0000', 'one\u000btwo', '\none', 'one\n', ' one']) {
    assert.deepEqual(
      checkInput(noting, { ...base, notes }),
      { ok: false, about: '`notes` must not start or end with a space or a line break, or hold any other control character' },
      JSON.stringify(notes),
    );
  }
  // An input not declared many-lined still refuses a line break, of either kind.
  for (const name of ['o\nne', 'o\r\nne']) {
    assert.deepEqual(checkInput(noting, { ...base, name }), { ok: false, about: '`name` must not start or end with a space, or hold a control character' });
  }
});
