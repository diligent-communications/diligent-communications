import type { Write } from '../../../contracts/operation.ts';

// The numbered steps that make and upgrade one part's tables. Each part keeps
// its own steps in its own folder. A step is one SQL statement, and a step
// that has shipped is never edited: a change is a new step.
export type Tables = { part: string; steps: readonly string[] };

export type Value = string | number | null;

export interface Store {
  // Reads rows. A part reads only its own tables.
  rows<Row>(sql: string, ...values: Value[]): Promise<Row[]>;
  // Lands every write together or none of them. `clash` means a uniqueness
  // rule refused one of them, so nothing was written.
  land(writes: readonly Write[]): Promise<'landed' | 'clash'>;
}

const UPGRADES =
  'CREATE TABLE IF NOT EXISTS store_upgrades (part TEXT NOT NULL, step INTEGER NOT NULL, applied_at TEXT NOT NULL, PRIMARY KEY (part, step)) STRICT';

// Opens the database, first applying any table step that has not been applied.
export async function openStore(db: D1Database, tables: readonly Tables[], now: Date = new Date()): Promise<Store> {
  await upgrade(db, tables, now);
  return {
    async rows<Row>(sql: string, ...values: Value[]): Promise<Row[]> {
      const found = await db.prepare(sql).bind(...values).all<Row>();
      return found.results;
    },
    async land(writes: readonly Write[]): Promise<'landed' | 'clash'> {
      if (writes.length === 0) {
        return 'landed';
      }
      try {
        // A batch is one transaction: a failure rolls every statement back.
        await db.batch(writes.map((write) => db.prepare(write.sql).bind(...write.values)));
        return 'landed';
      } catch (error) {
        if (isClash(error)) {
          return 'clash';
        }
        throw error;
      }
    },
  };
}

function isClash(error: unknown): boolean {
  return error instanceof Error && error.message.includes('SQLITE_CONSTRAINT');
}

async function appliedSteps(db: D1Database): Promise<Set<string>> {
  const [, applied] = await db.batch<{ part: string; step: number }>([
    db.prepare(UPGRADES),
    db.prepare('SELECT part, step FROM store_upgrades'),
  ]);
  return new Set((applied?.results ?? []).map((row) => `${row.part}:${row.step}`));
}

async function upgrade(db: D1Database, tables: readonly Tables[], now: Date): Promise<void> {
  let done = await appliedSteps(db);
  for (const { part, steps } of tables) {
    for (const [index, sql] of steps.entries()) {
      const step = index + 1;
      if (done.has(`${part}:${step}`)) {
        continue;
      }
      try {
        // The step and its record land together.
        await db.batch([
          db.prepare(sql),
          db.prepare('INSERT INTO store_upgrades (part, step, applied_at) VALUES (?, ?, ?)').bind(part, step, now.toISOString()),
        ]);
      } catch (error) {
        // Another request may have applied this step first.
        done = await appliedSteps(db);
        if (!done.has(`${part}:${step}`)) {
          throw error;
        }
      }
    }
  }
}
