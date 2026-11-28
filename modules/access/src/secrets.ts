import { Buffer } from 'node:buffer';
import { scrypt, timingSafeEqual } from 'node:crypto';
import { PASSWORD_HASH_BYTES, PASSWORD_HASH_COST, PASSWORD_SALT_BYTES, SIGN_IN_BYTES } from './limits.ts';

// A session starts with `dls_` and an agent token with `dla_`, so access can
// tell which one a caller presents without looking either up.
export const SESSION_PREFIX = 'dls_';
export const TOKEN_PREFIX = 'dla_';

function randomBytes(count: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(count));
}

// A new sign-in: random bytes from the runtime's own generator.
export function newSignIn(prefix: typeof SESSION_PREFIX | typeof TOKEN_PREFIX): string {
  return prefix + Buffer.from(randomBytes(SIGN_IN_BYTES)).toString('base64url');
}

// A new ID for a row. It is not a secret.
export function newId(): string {
  return Buffer.from(randomBytes(8)).toString('hex');
}

async function digest(text: string): Promise<Buffer> {
  return Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

// The SHA-256 fingerprint a long random sign-in is kept as. It is enough for
// a value that long, and it is not used for the password.
export async function fingerprint(secret: string): Promise<string> {
  return (await digest(secret)).toString('hex');
}

// Compares two secrets without the time taken saying where they differ.
export async function sameSecret(given: string, kept: string): Promise<boolean> {
  return timingSafeEqual(await digest(given), await digest(kept));
}

type Cost = { N: number; r: number; p: number };

function derive(password: string, salt: Uint8Array, cost: Cost, bytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // The same password typed on two devices can arrive as different code
    // points. NFKC makes them the same before hashing.
    scrypt(password.normalize('NFKC'), salt, bytes, { ...cost, maxmem: 256 * cost.N * cost.r }, (error, key) => {
      if (error === null) {
        resolve(key);
      } else {
        reject(error);
      }
    });
  });
}

// The slow hash a password is kept as, with its settings and salt in front.
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(PASSWORD_SALT_BYTES);
  const { N, r, p } = PASSWORD_HASH_COST;
  const key = await derive(password, salt, PASSWORD_HASH_COST, PASSWORD_HASH_BYTES);
  return ['scrypt', `N=${N},r=${r},p=${p}`, Buffer.from(salt).toString('base64url'), key.toString('base64url')].join('$');
}

// Checks a password against a stored hash, using the settings stored with it.
export async function passwordMatches(password: string, stored: string): Promise<boolean> {
  const [method, settings, salt, hash] = stored.split('$');
  const match = /^N=(\d+),r=(\d+),p=(\d+)$/.exec(settings ?? '');
  if (method !== 'scrypt' || match === null || salt === undefined || hash === undefined) {
    throw new Error('The stored password hash is not one this install can read.');
  }
  const kept = Buffer.from(hash, 'base64url');
  const cost = { N: Number(match[1]), r: Number(match[2]), p: Number(match[3]) };
  const given = await derive(password, Buffer.from(salt, 'base64url'), cost, kept.length);
  return timingSafeEqual(given, kept);
}
