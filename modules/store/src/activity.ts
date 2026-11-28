import { isActivityEntry } from '../../../contracts/activity.ts';
import type { ActivityEntry } from '../../../contracts/activity.ts';
import type { Work, Write } from '../../../contracts/operation.ts';
import { ACTIVITY_LIMIT } from './operations.ts';
import { GUARD_TABLE } from './store.ts';
import type { Store, Tables } from './store.ts';

// The activity table has a column for each field of an activity line and no
// other, so it has nowhere to put message content or a secret.
export const storeTables: Tables = {
  part: 'store',
  steps: [
    'CREATE TABLE activity (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, who TEXT NOT NULL, operation TEXT NOT NULL, on_what TEXT, result TEXT NOT NULL) STRICT',
    GUARD_TABLE,
  ],
};

// The write that adds one line to the activity record. A line that is not
// exactly an activity line is refused here, before it can be written.
export function activityWrite(entry: ActivityEntry): Write {
  if (!isActivityEntry(entry)) {
    throw new TypeError('An activity line must be exactly: at, who, operation, on, result.');
  }
  return {
    sql: 'INSERT INTO activity (at, who, operation, on_what, result) VALUES (?, ?, ?, ?, ?)',
    values: [entry.at, entry.who, entry.operation, entry.on, entry.result],
  };
}

// The writes that add several lines at once. A statement holds at most 20
// lines, so that many lines stay few statements and each stays well inside
// the database's limit on values in one statement.
const LINES_PER_STATEMENT = 20;

export function activityWrites(entries: readonly ActivityEntry[]): Write[] {
  const writes: Write[] = [];
  for (let start = 0; start < entries.length; start += LINES_PER_STATEMENT) {
    const lines = entries.slice(start, start + LINES_PER_STATEMENT).map(activityWrite);
    writes.push({
      sql: `INSERT INTO activity (at, who, operation, on_what, result) VALUES ${lines.map(() => '(?, ?, ?, ?, ?)').join(', ')}`,
      values: lines.flatMap((line) => line.values),
    });
  }
  return writes;
}

export function storeWork(store: Store): Readonly<Record<string, Work>> {
  return {
    async activity_list({ input }) {
      const limit = typeof input.limit === 'number' ? input.limit : ACTIVITY_LIMIT.default;
      const entries = await store.rows<ActivityEntry>(
        'SELECT at, who, operation, on_what AS "on", result FROM activity ORDER BY id DESC LIMIT ?',
        limit,
      );
      return {
        answer: {
          result: 'listed',
          description: `The activity record, newest first: ${entries.length} of its lines.`,
          entries,
        },
      };
    },
  };
}
