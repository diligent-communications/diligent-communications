import { hasFields, isRecord, isUtcTime } from './record-fields.ts';
import { isWho } from './who.ts';
import type { Who } from './who.ts';

// One line of the activity record: when, who, which operation, on what, and
// the name of the result. It has no field for message content or a secret.
export type ActivityEntry = {
  at: string;
  who: Who;
  operation: string;
  on: string | null;
  result: string;
};

export const ACTIVITY_FIELDS = ['at', 'who', 'operation', 'on', 'result'] as const;

const NAME = /^[a-z][a-z0-9_]{0,63}$/;
// What a change was made on: a kind and an ID, such as `agent:4f2a`.
const ON = /^[a-z]+:[a-z0-9]{1,64}$/;

export function isActivityEntry(value: unknown): value is ActivityEntry {
  return (
    isRecord(value) &&
    hasFields(value, ACTIVITY_FIELDS) &&
    isUtcTime(value.at) &&
    isWho(value.who) &&
    typeof value.operation === 'string' &&
    NAME.test(value.operation) &&
    (value.on === null || (typeof value.on === 'string' && ON.test(value.on))) &&
    typeof value.result === 'string' &&
    NAME.test(value.result)
  );
}
