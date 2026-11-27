import assert from 'node:assert/strict';
import { test } from 'node:test';
import { add } from '../src/smoke.ts';

test('Node runs the TypeScript module directly', () => {
  assert.equal(add(2, 3), 5);
});
