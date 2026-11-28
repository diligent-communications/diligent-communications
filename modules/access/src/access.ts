import type { Agent } from '../../../contracts/agent.ts';
import type { Outcome, Work, Write } from '../../../contracts/operation.ts';
import type { AgentLevel, Caller } from '../../../contracts/who.ts';
import { stillTrue } from '../../store/src/store.ts';
import type { Store, Tables } from '../../store/src/store.ts';
import {
  AGENT_SEEN_EVERY_SECONDS,
  LOCK_MINUTES,
  SESSION_IDLE_DAYS,
  SESSION_SEEN_EVERY_HOURS,
  SETUP_CODE_MIN,
  WRONG_TRIES,
} from './limits.ts';
import { SESSION_PREFIX, TOKEN_PREFIX, fingerprint, hashPassword, newId, newSignIn, passwordMatches, sameSecret } from './secrets.ts';

// Every sign-in is kept only as a hash or a fingerprint. No table here has a
// column for a password, a set-up code, a session or a token.
export const accessTables: Tables = {
  part: 'access',
  steps: [
    'CREATE TABLE access_password (one INTEGER PRIMARY KEY CHECK (one = 1), hash TEXT NOT NULL, set_at TEXT NOT NULL) STRICT',
    'CREATE TABLE access_setup_codes (fingerprint TEXT PRIMARY KEY, used_at TEXT NOT NULL) STRICT',
    'CREATE TABLE access_tries (kind TEXT PRIMARY KEY, wrong INTEGER NOT NULL, locked_until TEXT) STRICT',
    'CREATE TABLE access_sessions (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL UNIQUE, made_at TEXT NOT NULL, used_at TEXT NOT NULL) STRICT',
    'CREATE TABLE access_agents (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, level TEXT NOT NULL, is_on INTEGER NOT NULL, fingerprint TEXT NOT NULL UNIQUE, made_at TEXT NOT NULL, last_used_at TEXT) STRICT',
  ],
};

// What a request presents: the session cookie's value and the token after
// `Bearer`. Either may be missing.
export type Credentials = { session: string | null; token: string | null };

export type Access = {
  // Says who is calling. `seen` are the writes that note the caller was seen.
  identify(credentials: Credentials, now?: Date): Promise<{ caller: Caller; seen: Write[] }>;
  work: Readonly<Record<string, Work>>;
};

type AgentRow = { id: string; name: string; level: AgentLevel; is_on: number; made_at: string; last_used_at: string | null };

// What a password check found. `hash` is the stored hash the password was
// checked against, so a later write can depend on it still being the one.
type Tried = { right: true; hash: string; writes: Write[] } | { right: false; outcome: Outcome; startedLock: boolean };

const AGENT_COLUMNS = 'id, name, level, is_on, made_at, last_used_at';
const NOBODY: Caller = { kind: 'nobody' };

function agentOf(row: AgentRow): Agent {
  return { id: row.id, name: row.name, level: row.level, on: row.is_on === 1, made_at: row.made_at, last_used_at: row.last_used_at };
}

function before(now: Date, milliseconds: number): string {
  return new Date(now.getTime() - milliseconds).toISOString();
}

export function openAccess(options: { store: Store; setupCode: string | undefined }): Access {
  const { store, setupCode } = options;

  // Checks a password for `sign_in` and for changing it while signed in.
  //
  // The try is counted before it is checked, in one statement the database
  // runs whole. That statement lets the try through only while fewer than the
  // limit are counted and no lock is running, and the try that takes the last
  // one allowed starts the lock in the same statement. So tries sent together
  // cannot all be checked, each raises the count by one, and one lock has one
  // try that started it. A try the statement does not let through is refused
  // without being checked and changes nothing, so it cannot lengthen a lock.
  //
  // A wrong result writes nothing more. A right result clears the count, and
  // clears a lock only when this same try started it: a late result never
  // clears or shortens a lock another try started.
  async function tryPassword(given: string, now: Date): Promise<Tried> {
    const until = new Date(now.getTime() + LOCK_MINUTES * 60_000).toISOString();
    const counted = await store.landOne<{ locked_until: string | null }>({
      sql: `INSERT INTO access_tries (kind, wrong, locked_until) VALUES ('password', 1, CASE WHEN 1 >= ?1 THEN ?2 ELSE NULL END)
        ON CONFLICT (kind) DO UPDATE SET
          wrong = CASE WHEN locked_until IS NULL THEN wrong + 1 ELSE 1 END,
          locked_until = CASE WHEN (CASE WHEN locked_until IS NULL THEN wrong + 1 ELSE 1 END) >= ?1 THEN ?2 ELSE NULL END
        WHERE (locked_until IS NULL AND wrong < ?1) OR (locked_until IS NOT NULL AND locked_until <= ?3)
        RETURNING locked_until`,
      values: [WRONG_TRIES, until, now.toISOString()],
    });
    if (counted[0] === undefined) {
      const lock = (await store.rows<{ locked_until: string | null }>("SELECT locked_until FROM access_tries WHERE kind = 'password'"))[0];
      return { right: false, startedLock: false, outcome: { answer: lockedOut(lock?.locked_until ?? until) } };
    }
    // Set when this try took the last one allowed and so started the lock.
    const mine = counted[0].locked_until;
    const password = (await store.rows<{ hash: string }>('SELECT hash FROM access_password WHERE one = 1'))[0];
    if (password !== undefined && (await passwordMatches(given, password.hash))) {
      const clear: Write =
        mine === null
          ? { sql: "DELETE FROM access_tries WHERE kind = 'password' AND locked_until IS NULL", values: [] }
          : { sql: "DELETE FROM access_tries WHERE kind = 'password' AND (locked_until IS NULL OR locked_until = ?)", values: [mine] };
      return { right: true, hash: password.hash, writes: [clear] };
    }
    if (mine !== null) {
      return { right: false, startedLock: true, outcome: { answer: lockedOut(mine) } };
    }
    return { right: false, startedLock: false, outcome: { answer: { result: 'wrong_password', description: 'That is not the password.' } } };
  }

  // A new session for the calling device, and the write that keeps it.
  async function newSession(now: Date): Promise<{ id: string; session: string; write: Write }> {
    const session = newSignIn(SESSION_PREFIX);
    const id = newId();
    return {
      id,
      session,
      write: {
        sql: 'INSERT INTO access_sessions (id, fingerprint, made_at, used_at) VALUES (?, ?, ?, ?)',
        values: [id, await fingerprint(session), now.toISOString(), now.toISOString()],
      },
    };
  }

  const work: Record<string, Work> = {
    async password_set({ caller, input, now }) {
      const password = String(input.password);
      if (typeof input.code === 'string') {
        // The set-up code is compared in constant time, and its length is its
        // only limit on guessing: a lock here could block the one way back.
        const configured = typeof setupCode === 'string' && setupCode.length >= SETUP_CODE_MIN;
        const matches = (await sameSecret(input.code, configured ? setupCode : '')) && configured;
        const used = await fingerprint(input.code);
        const spent = (await store.rows('SELECT 1 FROM access_setup_codes WHERE fingerprint = ?', used)).length > 0;
        if (!matches || spent) {
          return { answer: { result: 'wrong_code', description: 'That is not an unused set-up code of this install.' } };
        }
        // The slow hash is made before anything is written, so a request that
        // is cut off here leaves nothing half-written.
        const hash = await hashPassword(password);
        // The way back gets the person in, whatever the password lock says:
        // the calling device is signed in, as `sign_in` would sign it in.
        const begun = await newSession(now);
        return {
          answer: {
            result: 'set',
            description: 'The password was set with the set-up code. Every other session was ended, this device is signed in, and that set-up code is now used up.',
          },
          as: 'you',
          on: `session:${begun.id}`,
          session: { begin: begun.session },
          writes: [
            {
              sql: 'INSERT INTO access_password (one, hash, set_at) VALUES (1, ?, ?) ON CONFLICT (one) DO UPDATE SET hash = excluded.hash, set_at = excluded.set_at',
              values: [hash, now.toISOString()],
            },
            { sql: 'INSERT INTO access_setup_codes (fingerprint, used_at) VALUES (?, ?)', values: [used, now.toISOString()] },
            { sql: 'DELETE FROM access_sessions', values: [] },
            begun.write,
            { sql: "DELETE FROM access_tries WHERE kind = 'password'", values: [] },
          ],
        };
      }
      if (caller.kind !== 'you') {
        return {
          answer: {
            result: 'not_allowed',
            description: "Setting the password needs an unused set-up code, or the person's session and the current password.",
          },
        };
      }
      if (typeof input.current !== 'string') {
        return {
          answer: { result: 'invalid_input', description: 'The input is not what this operation takes. For `password_set` while signed in, `current` is missing.' },
        };
      }
      // The session may have been ended since the caller was identified.
      if ((await store.rows('SELECT 1 FROM access_sessions WHERE id = ?', caller.session)).length === 0) {
        return {
          answer: { result: 'not_signed_in', description: 'The caller has no sign-in that this install knows. The session was ended while this was being done.' },
          session: { end: true },
        };
      }
      const tried = await tryPassword(input.current, now);
      if (!tried.right) {
        return tried.outcome;
      }
      const hash = await hashPassword(password);
      return {
        answer: { result: 'set', description: 'The password was changed. Every other session was ended.' },
        writes: [
          // Nothing is written if the password was replaced, or this session
          // ended, while this was being done.
          stillTrue('SELECT 1 FROM access_password, access_sessions WHERE access_password.one = 1 AND access_password.hash = ? AND access_sessions.id = ?', [
            tried.hash,
            caller.session,
          ]),
          ...tried.writes,
          { sql: 'UPDATE access_password SET hash = ?, set_at = ? WHERE one = 1', values: [hash, now.toISOString()] },
          { sql: 'DELETE FROM access_sessions WHERE id <> ?', values: [caller.session] },
        ],
      };
    },

    async sign_in({ caller, input, now }) {
      const tried = await tryPassword(String(input.password), now);
      if (!tried.right) {
        // A stranger's wrong try leaves no activity line, except the one
        // that starts a lock, which is recorded as the install's own doing.
        // A signed-in caller's wrong try is that caller's refused change,
        // here and in `password_set`, and the door records it under them.
        return tried.startedLock && caller.kind === 'nobody' ? { ...tried.outcome, as: 'diligent' } : tried.outcome;
      }
      const begun = await newSession(now);
      const writes: Write[] = [
        // No session is started if the password was changed or reset while
        // this one was being checked.
        stillTrue('SELECT 1 FROM access_password WHERE one = 1 AND hash = ?', [tried.hash]),
        ...tried.writes,
        begun.write,
      ];
      if (caller.kind === 'you') {
        // This device was already signed in. Its new session replaces the old one.
        writes.push({ sql: 'DELETE FROM access_sessions WHERE id = ?', values: [caller.session] });
      }
      return {
        answer: { result: 'signed_in', description: 'The password was right, and this device now has a session.' },
        as: 'you',
        on: `session:${begun.id}`,
        session: { begin: begun.session },
        writes,
      };
    },

    async sign_out({ caller }) {
      if (caller.kind !== 'you') {
        throw new Error('sign_out reached access without the person.');
      }
      return {
        answer: { result: 'signed_out', description: 'The session on this device was ended. Other devices stay signed in.' },
        on: `session:${caller.session}`,
        session: { end: true },
        writes: [{ sql: 'DELETE FROM access_sessions WHERE id = ?', values: [caller.session] }],
      };
    },

    async whoami({ caller }) {
      if (caller.kind === 'agent') {
        return {
          answer: {
            result: 'agent',
            description: `The caller is the agent "${caller.name}", at the level ${caller.level}.`,
            agent: { id: caller.id, name: caller.name, level: caller.level },
          },
        };
      }
      return { answer: { result: 'you', description: 'The caller is the person, at the level you.', level: 'you' } };
    },

    async agent_create({ input, now }) {
      const name = String(input.name);
      if ((await store.rows('SELECT 1 FROM access_agents WHERE name = ?', name)).length > 0) {
        return { answer: { result: 'name_taken', description: `Another agent is already named "${name}".` } };
      }
      const token = newSignIn(TOKEN_PREFIX);
      const agent: Agent = { id: newId(), name, level: input.level as AgentLevel, on: true, made_at: now.toISOString(), last_used_at: null };
      return {
        answer: {
          result: 'created',
          description: `The agent sign-in "${name}" was made at the level ${agent.level}. Its token is in this answer only the first time.`,
          agent,
          token,
        },
        on: `agent:${agent.id}`,
        writes: [
          {
            sql: 'INSERT INTO access_agents (id, name, level, is_on, fingerprint, made_at, last_used_at) VALUES (?, ?, ?, 1, ?, ?, NULL)',
            values: [agent.id, agent.name, agent.level, await fingerprint(token), agent.made_at],
          },
        ],
      };
    },

    async agent_list() {
      const rows = await store.rows<AgentRow>(`SELECT ${AGENT_COLUMNS} FROM access_agents ORDER BY made_at, id`);
      return {
        answer: { result: 'listed', description: rows.length === 1 ? "This install has 1 agent sign-in." : `This install has ${rows.length} agent sign-ins.`, agents: rows.map(agentOf) },
      };
    },

    async agent_set({ input }) {
      if (input.level === undefined && input.on === undefined) {
        return {
          answer: { result: 'invalid_input', description: 'The input is not what this operation takes. For `agent_set`, give `level`, `on` or both.' },
        };
      }
      const row = (await store.rows<AgentRow>(`SELECT ${AGENT_COLUMNS} FROM access_agents WHERE id = ?`, String(input.agent)))[0];
      if (row === undefined) {
        return { answer: { result: 'unknown_agent', description: 'No agent has that ID.' } };
      }
      const agent: Agent = {
        ...agentOf(row),
        level: input.level === undefined ? row.level : (input.level as AgentLevel),
        on: input.on === undefined ? row.is_on === 1 : input.on === true,
      };
      return {
        answer: {
          result: 'changed',
          description: `The agent "${agent.name}" is now at the level ${agent.level} and switched ${agent.on ? 'on' : 'off'}.`,
          agent,
        },
        on: `agent:${agent.id}`,
        writes: [
          // The answer says how the agent is now, so nothing is written if
          // the agent was changed since it was read.
          stillTrue('SELECT 1 FROM access_agents WHERE id = ? AND level = ? AND is_on = ?', [row.id, row.level, row.is_on]),
          // Only the fields given are written. A level change never touches
          // whether the agent is on.
          ...(input.level === undefined ? [] : [{ sql: 'UPDATE access_agents SET level = ? WHERE id = ?', values: [agent.level, agent.id] }]),
          ...(input.on === undefined ? [] : [{ sql: 'UPDATE access_agents SET is_on = ? WHERE id = ?', values: [agent.on ? 1 : 0, agent.id] }]),
        ],
      };
    },
  };

  return {
    work,
    async identify(credentials, now = new Date()) {
      const { token, session } = credentials;
      if (token !== null) {
        // A request that presents a token is that agent or nobody. It never
        // falls back to a session.
        if (!token.startsWith(TOKEN_PREFIX)) {
          return { caller: NOBODY, seen: [] };
        }
        const row = (await store.rows<AgentRow>(`SELECT ${AGENT_COLUMNS} FROM access_agents WHERE fingerprint = ?`, await fingerprint(token)))[0];
        if (row === undefined) {
          return { caller: NOBODY, seen: [] };
        }
        const stale = row.last_used_at === null || row.last_used_at < before(now, AGENT_SEEN_EVERY_SECONDS * 1000);
        return {
          caller: { kind: 'agent', id: row.id, name: row.name, level: row.level, on: row.is_on === 1 },
          seen: stale ? [{ sql: 'UPDATE access_agents SET last_used_at = ? WHERE id = ?', values: [now.toISOString(), row.id] }] : [],
        };
      }
      if (session === null || !session.startsWith(SESSION_PREFIX)) {
        return { caller: NOBODY, seen: [] };
      }
      const row = (await store.rows<{ id: string; used_at: string }>('SELECT id, used_at FROM access_sessions WHERE fingerprint = ?', await fingerprint(session)))[0];
      // A session not used for the idle limit has ended by itself.
      if (row === undefined || row.used_at < before(now, SESSION_IDLE_DAYS * 86_400_000)) {
        return { caller: NOBODY, seen: [] };
      }
      const stale = row.used_at < before(now, SESSION_SEEN_EVERY_HOURS * 3_600_000);
      return {
        caller: { kind: 'you', session: row.id },
        seen: stale ? [{ sql: 'UPDATE access_sessions SET used_at = ? WHERE id = ?', values: [now.toISOString(), row.id] }] : [],
      };
    },
  };
}

function lockedOut(until: string): Outcome['answer'] {
  return {
    result: 'locked_out',
    description: `The password is locked until ${until} after too many wrong tries. A try made before then is not checked.`,
    until,
  };
}
