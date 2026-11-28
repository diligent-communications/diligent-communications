import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PASSWORD_HASH_COST } from '../src/limits.ts';
import { SESSION_PREFIX, TOKEN_PREFIX, fingerprint, hashPassword, newId, newSignIn, passwordMatches, sameSecret } from '../src/secrets.ts';

test('a password is kept as a salted slow hash that carries its own settings', async () => {
  const password = 'a made-up password, long enough';
  const stored = await hashPassword(password);
  const [method, settings, salt, hash] = stored.split('$');
  assert.equal(method, 'scrypt');
  assert.equal(settings, `N=${PASSWORD_HASH_COST.N},r=${PASSWORD_HASH_COST.r},p=${PASSWORD_HASH_COST.p}`);
  assert.equal(Buffer.from(salt!, 'base64url').length, 16);
  assert.equal(Buffer.from(hash!, 'base64url').length, 32);
  assert.equal(stored.includes(password), false);

  assert.equal(await passwordMatches(password, stored), true);
  assert.equal(await passwordMatches(`${password} `, stored), false);
  assert.equal(await passwordMatches('', stored), false);

  // The same password hashed twice gives two different stored values.
  assert.notEqual(await hashPassword(password), stored);
});

test('a stored hash is checked with the settings stored with it, so the cost can change later', async () => {
  // A hash made at a lower cost than today's still checks.
  const { scryptSync } = await import('node:crypto');
  const salt = Buffer.from('0123456789abcdef');
  const key = scryptSync('an older password, still long', salt, 32, { N: 1024, r: 8, p: 1 });
  const older = ['scrypt', 'N=1024,r=8,p=1', salt.toString('base64url'), key.toString('base64url')].join('$');
  assert.equal(await passwordMatches('an older password, still long', older), true);
  assert.equal(await passwordMatches('another password, also long', older), false);

  await assert.rejects(passwordMatches('anything', 'not a stored hash'));
  await assert.rejects(passwordMatches('anything', 'md5$x$y$z'));
});

test('the same password typed as different code points is the same password', async () => {
  // "é" as one code point, and as "e" followed by a combining accent.
  const composed = 'café au lait, every morning';
  const decomposed = 'café au lait, every morning';
  assert.notEqual(composed, decomposed);
  assert.equal(await passwordMatches(decomposed, await hashPassword(composed)), true);
});

test('a session and a token are 32 random bytes with a prefix, and are kept as a fingerprint', async () => {
  const session = newSignIn(SESSION_PREFIX);
  const token = newSignIn(TOKEN_PREFIX);
  assert.match(session, /^dls_[A-Za-z0-9_-]{43}$/);
  assert.match(token, /^dla_[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(session.slice(4), 'base64url').length, 32);
  assert.equal(new Set(Array.from({ length: 50 }, () => newSignIn(TOKEN_PREFIX))).size, 50);

  const print = await fingerprint(token);
  assert.match(print, /^[0-9a-f]{64}$/);
  assert.equal(await fingerprint(token), print);
  assert.notEqual(await fingerprint(session), print);
  assert.equal(print.includes(token.slice(4)), false);

  assert.match(newId(), /^[0-9a-f]{16}$/);
});

test('two secrets are the same only when every character is', async () => {
  assert.equal(await sameSecret('a made-up set-up code', 'a made-up set-up code'), true);
  assert.equal(await sameSecret('a made-up set-up code', 'a made-up set-up codf'), false);
  assert.equal(await sameSecret('a made-up set-up code', 'a made-up set-up cod'), false);
  assert.equal(await sameSecret('', 'a made-up set-up code'), false);
});
