import { isPerson } from '../../../contracts/person.ts';
import type { Person } from '../../../contracts/person.ts';
import type { Operation, Work, Write } from '../../../contracts/operation.ts';
import type { Store, Tables } from '../../store/src/store.ts';

// A person's row holds as much as a matter needs to show a name. The name's
// limit is written out in the step, so a shipped step never changes.
export const peopleTables: Tables = {
  part: 'people',
  steps: [
    `CREATE TABLE people (id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100), confirmed TEXT NOT NULL CHECK (confirmed IN ('yes', 'no')), made_at TEXT NOT NULL) STRICT`,
  ],
};

// The write that adds one person. A value that is not exactly a person is
// refused here, before it can be written.
export function personWrite(person: Person, at: Date): Write {
  if (!isPerson(person)) {
    throw new TypeError('A person must be exactly: id, name, confirmed.');
  }
  return {
    sql: 'INSERT INTO people (id, name, confirmed, made_at) VALUES (?, ?, ?, ?)',
    values: [person.id, person.name, person.confirmed, at.toISOString()],
  };
}

// The operations people offers in this slice, as the operations list shows them.
export const peopleOperations: readonly Operation[] = [
  {
    name: 'person_get',
    part: 'people',
    meaning: 'One person: the name, and whether the record is confirmed.',
    level: 'read',
    changes: false,
    request_id: false,
    input: { person: { kind: 'text', meaning: 'The ID of the person.', required: true, max: 64 } },
    results: { person: 'The person with that ID.', unknown_person: 'No person has that ID.' },
  },
];

export function peopleWork(store: Store): Readonly<Record<string, Work>> {
  return {
    async person_get({ input }) {
      const [found] = await store.rows<Person>('SELECT id, name, confirmed FROM people WHERE id = ?', String(input.person));
      if (found === undefined) {
        return { answer: { result: 'unknown_person', description: 'No person has that ID.' } };
      }
      return { answer: { result: 'person', description: `The person "${found.name}".`, person: found } };
    },
  };
}
