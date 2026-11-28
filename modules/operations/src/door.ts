import { ANY_OPERATION_RESULTS, REQUEST_ID_FIELD, checkInput } from '../../../contracts/operation.ts';
import type { Answer, AnyOperationResult, Operation, Outcome, Work, Write } from '../../../contracts/operation.ts';
import { levelOf, levelReaches, whoOf } from '../../../contracts/who.ts';
import type { Caller, Who } from '../../../contracts/who.ts';
import { activityWrite, activityWrites } from '../../store/src/activity.ts';
import type { Store, Tables } from '../../store/src/store.ts';
import { operationList } from './list.ts';

// The kept answers that make a repeat safe. The answer is kept without the
// fields its operation shows once.
export const operationsTables: Tables = {
  part: 'operations',
  steps: [
    'CREATE TABLE operations_requests (request_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, answer TEXT NOT NULL, kept_at TEXT NOT NULL) STRICT',
  ],
};

// What the door hands back: the answer, and beside it a session to begin or
// end on the calling device.
export type Ran = { answer: Answer; session?: Outcome['session'] };

export type Door = {
  // `seen` are access's own writes that note the caller was seen. They land
  // with the call's other writes.
  run(caller: Caller, name: string, input: unknown, seen?: readonly Write[]): Promise<Ran>;
  // Refuses, in one landing, every call a switched-off agent made in one
  // request, and returns the one answer they all get. Each call that names an
  // operation that changes something leaves one line, as `run` would leave
  // for the same call. A read, or a name that is no operation, leaves none.
  refuseSwitchedOff(caller: Caller, names: readonly string[], seen?: readonly Write[]): Promise<Answer>;
};

export function refusal(result: AnyOperationResult, about?: string): Answer {
  const meaning = ANY_OPERATION_RESULTS[result];
  return { result, description: about === undefined ? meaning : `${meaning} ${about}` };
}

export function openDoor(options: { store: Store; work: Readonly<Record<string, Work>>; now?: () => Date }): Door {
  const { store, work } = options;
  const now = options.now ?? (() => new Date());
  const operations = new Map(operationList.map((operation) => [operation.name, operation]));
  for (const name of operations.keys()) {
    if (!Object.hasOwn(work, name)) {
      throw new Error(`The operation ${name} is listed but no part does its work.`);
    }
  }
  for (const name of Object.keys(work)) {
    if (!operations.has(name)) {
      throw new Error(`The work ${name} is not in the operations list.`);
    }
  }

  // The activity line for a call to an operation that changes something. A
  // read leaves none, and so does a caller nobody could name.
  function record(operation: Operation, who: Who | null, at: Date, result: string, on?: string): Write[] {
    if (!operation.changes || who === null) {
      return [];
    }
    return [activityWrite({ at: at.toISOString(), who, operation: operation.name, on: on ?? null, result })];
  }

  async function refuse(operation: Operation, who: Who | null, at: Date, answer: Answer, seen: readonly Write[]): Promise<Ran> {
    await store.land([...record(operation, who, at, answer.result), ...seen]);
    return { answer };
  }

  function switchedOff(name: string): Answer {
    return refusal('switched_off', `The agent "${name}" is switched off.`);
  }

  return {
    async refuseSwitchedOff(caller, names, seen = []) {
      if (caller.kind !== 'agent' || caller.on) {
        throw new Error('Only a switched-off agent is refused this way.');
      }
      const who = whoOf(caller);
      const answer = switchedOff(caller.name);
      const at = now().toISOString();
      const lines = names
        .map((name) => operations.get(name))
        .filter((operation) => operation !== undefined && operation.changes)
        .map((operation) => ({ at, who: who!, operation: operation!.name, on: null, result: answer.result }));
      await store.land([...activityWrites(lines), ...seen]);
      return answer;
    },

    async run(caller, name, input, seen = []) {
      const operation = operations.get(name);
      if (operation === undefined) {
        return { answer: refusal('invalid_input', 'There is no operation with that name.') };
      }
      const at = now();
      const who = whoOf(caller);
      const level = levelOf(caller);

      if (caller.kind === 'agent' && !caller.on) {
        return refuse(operation, who, at, switchedOff(caller.name), seen);
      }
      if (operation.level === 'none') {
        if (caller.kind === 'agent') {
          return refuse(operation, who, at, refusal('not_allowed', `\`${name}\` is the person's.`), seen);
        }
      } else if (level === null) {
        return { answer: refusal('not_signed_in', `\`${name}\` needs a sign-in.`) };
      } else if (!levelReaches(level, operation.level)) {
        return refuse(operation, who, at, refusal('not_allowed', `\`${name}\` needs the level ${operation.level}.`), seen);
      }

      const check = checkInput(operation, input);
      if (!check.ok) {
        return refuse(operation, who, at, refusal('invalid_input', `For \`${name}\`, ${check.about}.`), seen);
      }
      const requestId = operation.request_id ? String(check.input[REQUEST_ID_FIELD]) : null;
      const fingerprint = requestId === null ? null : await fingerprintOf(name, who, check.input);

      // A clash means another request landed first. The second pass then finds
      // what that request left, such as its kept answer.
      for (let pass = 0; pass < 2; pass += 1) {
        if (requestId !== null && fingerprint !== null) {
          const kept = await store.rows<{ fingerprint: string; answer: string }>(
            'SELECT fingerprint, answer FROM operations_requests WHERE request_id = ?',
            requestId,
          );
          if (kept[0] !== undefined) {
            if (kept[0].fingerprint !== fingerprint) {
              return refuse(operation, who, at, refusal('request_id_reused'), seen);
            }
            // The repeat: the same answer, and nothing is changed or recorded twice.
            await store.land(seen);
            return { answer: JSON.parse(kept[0].answer) as Answer };
          }
        }

        const outcome = await work[name]!({ caller, input: check.input, now: at });
        const { answer } = outcome;
        if (!Object.hasOwn(operation.results, answer.result) && !Object.hasOwn(ANY_OPERATION_RESULTS, answer.result)) {
          throw new Error(`${name} answered ${answer.result}, which is not one of its named results.`);
        }
        const writes: Write[] = [
          ...(outcome.writes ?? []),
          ...record(operation, outcome.as ?? who, at, answer.result, outcome.on),
          ...seen,
        ];
        if (requestId !== null && fingerprint !== null) {
          const kept: Answer = { ...answer };
          for (const field of operation.shown_once ?? []) {
            delete kept[field];
          }
          writes.push({
            sql: 'INSERT INTO operations_requests (request_id, fingerprint, answer, kept_at) VALUES (?, ?, ?, ?)',
            values: [requestId, fingerprint, JSON.stringify(kept), at.toISOString()],
          });
        }
        if ((await store.land(writes)) === 'landed') {
          return outcome.session === undefined ? { answer } : { answer, session: outcome.session };
        }
      }
      return { answer: refusal('unavailable') };
    },
  };
}

// A fingerprint of who asked for what. The same request ID with a different
// operation, caller or input has a different one.
async function fingerprintOf(name: string, who: Who | null, input: Record<string, unknown>): Promise<string> {
  const fields = Object.keys(input)
    .filter((field) => field !== REQUEST_ID_FIELD)
    .sort()
    .map((field) => [field, input[field]]);
  const bytes = new TextEncoder().encode(JSON.stringify([name, who, fields]));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
