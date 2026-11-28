// The numbers access uses, each in one place. Those marked "proposal" were
// chosen while building and are not a decision by the owner.

// A password is this many characters. The lower limit is a proposal.
export const PASSWORD_LENGTH = { min: 16, max: 1024 } as const;

// The cost of the password hash: scrypt with these settings, a 16-byte random
// salt and a 32-byte result. It is one of the settings OWASP lists for scrypt
// and needs about 32 MB of memory. The settings are stored with each hash, so
// this can change without breaking a stored one.
export const PASSWORD_HASH_COST = { N: 32768, r: 8, p: 3 } as const;
export const PASSWORD_SALT_BYTES = 16;
export const PASSWORD_HASH_BYTES = 32;

// This many wrong passwords in a row start a lock of this many minutes. Both
// are proposals.
export const WRONG_TRIES = 5;
export const LOCK_MINUTES = 15;

// A session that is not used for this many days ends by itself. A proposal.
export const SESSION_IDLE_DAYS = 90;

// A set-up code shorter than this is treated as no set-up code at all. Its
// length is its only limit on guessing, so it has no lock.
export const SETUP_CODE_MIN = 32;

// A session and an agent token are this many random bytes.
export const SIGN_IN_BYTES = 32;

// How often "last used" is written again for a caller that keeps calling.
export const SESSION_SEEN_EVERY_HOURS = 24;
export const AGENT_SEEN_EVERY_SECONDS = 60;
