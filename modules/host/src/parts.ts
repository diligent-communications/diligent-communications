// The parts the program is made of: each part's tables, and the work behind
// each operation. Stated once, for the running program and for tests that
// open the door themselves.
import type { Access } from '../../access/src/access.ts';
import { accessTables } from '../../access/src/access.ts';
import { briefTables, briefWork } from '../../brief/src/brief.ts';
import { linksTables, linksWork } from '../../links/src/links.ts';
import { operationsTables } from '../../operations/src/door.ts';
import { peopleTables, peopleWork } from '../../people/src/people.ts';
import { storeTables, storeWork } from '../../store/src/activity.ts';
import type { Store, Tables } from '../../store/src/store.ts';
import type { Work } from '../../../contracts/operation.ts';

export const PART_TABLES: readonly Tables[] = [storeTables, operationsTables, accessTables, briefTables, linksTables, peopleTables];

// The work of every listed operation, with access's own as given.
export function partsWork(store: Store, access: Access): Readonly<Record<string, Work>> {
  return { ...access.work, ...storeWork(store), ...briefWork(store), ...linksWork(store), ...peopleWork(store) };
}
