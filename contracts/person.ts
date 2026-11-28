import { hasFields, isRecord, isText } from './record-fields.ts';
import { isId } from './who.ts';

export const PERSON_NAME_LIMIT = 100;

// A person, as much as a matter needs to show a name. `confirmed` is `yes`
// once the record is known to be that person, and `no` until then. The
// person's page and ways to reach them come in a later piece.
export type Person = { id: string; name: string; confirmed: 'yes' | 'no' };

export const PERSON_RECORD_FIELDS = ['id', 'name', 'confirmed'] as const;

export function isPerson(value: unknown): value is Person {
  return (
    isRecord(value) &&
    hasFields(value, PERSON_RECORD_FIELDS) &&
    isId(value.id) &&
    isText(value.name) &&
    value.name.length <= PERSON_NAME_LIMIT &&
    (value.confirmed === 'yes' || value.confirmed === 'no')
  );
}
