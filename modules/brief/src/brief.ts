import { MATTER_KINDS, isDate, isHistoryLine, isLane, isMatter } from '../../../contracts/matter.ts';
import type { HistoryLine, Matter, MatterKind, MatterState, PersonField } from '../../../contracts/matter.ts';
import type { Answer, Outcome, Work, Write } from '../../../contracts/operation.ts';
import { isUtcTime } from '../../../contracts/record-fields.ts';
import { whoOf } from '../../../contracts/who.ts';
import type { Who } from '../../../contracts/who.ts';
import { linkById, linkHistory, linksOfMatter, moveWrites, newLinkId } from '../../links/src/links.ts';
import { stillTrue } from '../../store/src/store.ts';
import type { Store, Tables } from '../../store/src/store.ts';
import { SEARCH_LIMIT } from './operations.ts';

// The matters and their dated history. A matter's row is never deleted, and
// its ID is never used again. The limits of the text fields are also rules of
// the table, so no write of any part can store a longer one. They are written
// out here, not read from the limits in contracts: a step that has shipped
// never changes, even when a proposed limit does.
export const briefTables: Tables = {
  part: 'brief',
  steps: [
    `CREATE TABLE brief_matters (
      id TEXT PRIMARY KEY,
      version INTEGER NOT NULL CHECK (version >= 1),
      kind TEXT NOT NULL CHECK (kind IN ('money', 'do', 'reply')),
      lane TEXT NOT NULL CHECK (length(lane) BETWEEN 1 AND 40),
      title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
      next_action TEXT NOT NULL CHECK (length(next_action) <= 200),
      owed_by TEXT NOT NULL CHECK (length(owed_by) <= 100),
      summary TEXT NOT NULL CHECK (length(summary) <= 1200),
      latest_update TEXT NOT NULL CHECK (length(latest_update) <= 600),
      timing TEXT NOT NULL CHECK (length(timing) <= 100),
      state TEXT NOT NULL CHECK (state IN ('open', 'waiting', 'snoozed', 'done', 'dismissed')),
      snoozed_until TEXT,
      main_action TEXT NOT NULL CHECK (main_action IN ('reply', 'schedule', 'contact', 'none')),
      notes TEXT NOT NULL CHECK (length(notes) <= 2000),
      due TEXT,
      set_by_you TEXT NOT NULL,
      made_at TEXT NOT NULL,
      CHECK ((state = 'snoozed') = (snoozed_until IS NOT NULL))
    ) STRICT`,
    `CREATE TABLE brief_history (id INTEGER PRIMARY KEY AUTOINCREMENT, matter TEXT NOT NULL, at TEXT NOT NULL, who TEXT NOT NULL, what TEXT NOT NULL CHECK (length(what) BETWEEN 1 AND 300)) STRICT`,
    'CREATE INDEX brief_history_by_matter ON brief_history (matter)',
  ],
};

// The order of the matters within a group of the Brief: the one that has
// waited longest on top. That is the owner's decision. In this slice a
// matter has waited since it was made. It is not a ranking.
const BRIEF_ORDER = 'made_at ASC, id ASC';
// What a search finds: the newest made first.
const SEARCH_ORDER = 'made_at DESC, id DESC';

const COLUMNS =
  'id, version, kind, lane, title, next_action, owed_by, summary, latest_update, timing, state, snoozed_until, main_action, notes, due, set_by_you';

type MatterRow = Omit<Matter, 'set_by_you'> & { set_by_you: string };

function matterOf(row: MatterRow): Matter {
  return { ...row, set_by_you: JSON.parse(row.set_by_you) as PersonField[] };
}

// A new ID for a matter: 16 lowercase hex digits from the runtime's own
// random generator.
export function newMatterId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function historyWrite(matter: string, line: HistoryLine): Write {
  if (!isHistoryLine(line)) {
    throw new TypeError('A history line must be exactly: at, who, what.');
  }
  return { sql: 'INSERT INTO brief_history (matter, at, who, what) VALUES (?, ?, ?, ?)', values: [matter, line.at, line.who, line.what] };
}

// The writes that add a new matter, with its first history line. A value
// that is not exactly a matter, or holds a summary over its limit, is
// refused here, before it can be written.
export function newMatterWrites(matter: Matter, who: Who, at: Date): Write[] {
  if (!isMatter(matter)) {
    throw new TypeError('A matter must be exactly a matter, within its limits.');
  }
  const when = at.toISOString();
  return [
    {
      sql: `INSERT INTO brief_matters (${COLUMNS}, made_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      values: [
        matter.id,
        matter.version,
        matter.kind,
        matter.lane,
        matter.title,
        matter.next_action,
        matter.owed_by,
        matter.summary,
        matter.latest_update,
        matter.timing,
        matter.state,
        matter.snoozed_until,
        matter.main_action,
        matter.notes,
        matter.due,
        JSON.stringify(matter.set_by_you),
        when,
      ],
    },
    historyWrite(matter.id, { at: when, who, what: 'This matter was made.' }),
  ];
}

async function matterById(store: Store, id: string): Promise<Matter | undefined> {
  const [row] = await store.rows<MatterRow>(`SELECT ${COLUMNS} FROM brief_matters WHERE id = ?`, id);
  return row === undefined ? undefined : matterOf(row);
}

// A write that makes the landing clash unless the matter is still at the
// version that was read.
function stillAt(matter: Matter): Write {
  return stillTrue('SELECT 1 FROM brief_matters WHERE id = ? AND version = ?', [matter.id, matter.version]);
}

function unknownMatter(): Outcome {
  return { answer: { result: 'unknown_matter', description: 'No matter has that ID.' } };
}

function invalid(about: string): Outcome {
  return { answer: { result: 'invalid_input', description: `The input is not what this operation takes. ${about}` } };
}

const KIND_WORDS: Record<MatterKind, string> = { money: 'Money', do: 'Do', reply: 'Reply' };

// The history line for one field the person changed.
function editLine(field: PersonField, value: string): string {
  switch (field) {
    case 'title':
      return `The title was changed to "${value}".`;
    case 'notes':
      return value === '' ? 'The notes were cleared.' : 'The notes were changed.';
    case 'due':
      return value === '' ? 'The due date was cleared.' : `The due date was set to ${value}.`;
    case 'kind':
      return `The kind was changed to ${KIND_WORDS[value as MatterKind]}.`;
    case 'lane':
      return `The lane was changed to ${value}.`;
  }
}

function stateLine(from: MatterState, to: MatterState, until: string | null): string {
  switch (to) {
    case 'done':
      return 'Marked done.';
    case 'waiting':
      return 'Marked waiting.';
    case 'dismissed':
      return 'Dismissed.';
    case 'snoozed':
      return `Snoozed until ${until!.slice(0, 16).replace('T', ' ')} UTC.`;
    case 'open':
      return from === 'done' || from === 'dismissed' ? 'Reopened.' : 'Back on the Brief.';
  }
}

export function briefWork(store: Store): Readonly<Record<string, Work>> {
  return {
    async brief_list({ input, now }) {
      const show = input.show === 'waiting' ? 'waiting' : 'brief';
      const lane = typeof input.lane === 'string' ? input.lane : null;
      if (lane !== null && !isLane(lane)) {
        return invalid('`lane` must be lowercase letters, digits and dashes.');
      }
      const when = now.toISOString();
      // On the Brief: open matters, and snoozed ones whose time has come.
      const onBrief = "(state = 'open' OR (state = 'snoozed' AND snoozed_until <= ?1))";
      const inLane = lane === null ? '' : ' AND lane = ?2';
      const laneValues = lane === null ? [when] : [when, lane];
      // Every statement here names ?1, the time now, so each takes the same values.
      const which = show === 'brief' ? onBrief : "(state = 'waiting' AND ?1 IS NOT NULL)";
      const shown = await store.rows<MatterRow>(
        `SELECT ${COLUMNS} FROM brief_matters WHERE ${which}${inLane} ORDER BY ${BRIEF_ORDER}`,
        ...laneValues,
      );
      const [counts] = await store.rows<{ brief: number; waiting: number }>(
        `SELECT COALESCE(SUM(${onBrief}), 0) AS brief, COALESCE(SUM(state = 'waiting'), 0) AS waiting FROM brief_matters WHERE 1 = 1${inLane}`,
        ...laneValues,
      );
      const lanes = await store.rows<{ lane: string }>(
        `SELECT DISTINCT lane FROM brief_matters WHERE ${onBrief} OR state = 'waiting' ORDER BY lane`,
        when,
      );
      const matters = shown.map(matterOf);
      const groups = MATTER_KINDS.map((kind) => {
        const inGroup = matters.filter((matter) => matter.kind === kind);
        return { kind, count: inGroup.length, matters: inGroup };
      });
      const what = show === 'brief' ? 'The Brief' : 'The matters marked waiting';
      return {
        answer: {
          result: 'brief',
          description: `${what}${lane === null ? '' : ` in the lane ${lane}`}: ${matters.length} matters.`,
          show,
          lane,
          groups,
          lanes: lanes.map((row) => row.lane),
          counts: { brief: counts?.brief ?? 0, waiting: counts?.waiting ?? 0 },
        },
      };
    },

    async matter_get({ input }) {
      const matter = await matterById(store, String(input.matter));
      if (matter === undefined) {
        return unknownMatter();
      }
      const links = await linksOfMatter(store, matter.id);
      const own = await store.rows<HistoryLine>('SELECT at, who, what FROM brief_history WHERE matter = ? ORDER BY id', matter.id);
      // Oldest first, with the matter's own line before a link's at the same
      // time, then turned round: newest first.
      const history = [...own, ...linkHistory(links)].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)).reverse();
      // The messages, newest first.
      const messages = links
        .filter((link) => link.kind === 'message' && link.state !== 'removed')
        .sort((a, b) => (a.sent_at! < b.sent_at! ? 1 : a.sent_at! > b.sent_at! ? -1 : 0))
        .map(({ id, message, quote, sender, sent_at }) => ({ link: id, message, quote, sender, sent_at }));
      const people = links
        .filter((link) => link.kind === 'person' && link.state !== 'removed')
        .map(({ id, person, state }) => ({ link: id, person, state }));
      return {
        answer: { result: 'matter', description: `The matter "${matter.title}".`, matter, messages, people, history },
      };
    },

    async matter_search({ input }) {
      // No pattern: each field and the words are lower-cased (the letters A
      // to Z only) and the words looked for as they are, so no character in
      // them is special and their length has no other limit. The words are a
      // value, never part of the query.
      const fields = ['title', 'next_action', 'owed_by', 'summary', 'latest_update', 'timing', 'notes'];
      const found = await store.rows<MatterRow>(
        `SELECT ${COLUMNS} FROM brief_matters WHERE ${fields.map((field) => `instr(lower(${field}), lower(?1)) > 0`).join(' OR ')} ORDER BY ${SEARCH_ORDER} LIMIT ?2`,
        String(input.words),
        SEARCH_LIMIT,
      );
      const description =
        found.length === SEARCH_LIMIT
          ? `At least ${SEARCH_LIMIT} matters hold those words. These are the newest ${SEARCH_LIMIT}.`
          : `${found.length} matters hold those words.`;
      return { answer: { result: 'found', description, matters: found.map(matterOf) } };
    },

    async matter_edit({ caller, input, now }) {
      const matter = await matterById(store, String(input.matter));
      if (matter === undefined) {
        return unknownMatter();
      }
      const on = `matter:${matter.id}`;
      if (input.version !== matter.version) {
        return {
          on,
          answer: { result: 'changed_since', description: `Someone changed this first. The matter is now at version ${matter.version}.`, matter },
        };
      }
      if (typeof input.due === 'string' && input.due !== '' && !isDate(input.due)) {
        return { on, ...invalid('`due` must be a real date written YYYY-MM-DD, or empty.') };
      }
      if (typeof input.lane === 'string' && !isLane(input.lane)) {
        return { on, ...invalid('`lane` must be lowercase letters, digits and dashes.') };
      }
      const given: Partial<Record<PersonField, string>> = {};
      for (const field of ['title', 'notes', 'due', 'kind', 'lane'] as const) {
        if (typeof input[field] === 'string') {
          given[field] = input[field];
        }
      }
      if (Object.keys(given).length === 0) {
        return { on, ...invalid('Give at least one of `title`, `notes`, `due`, `kind` or `lane`.') };
      }
      const changed = (Object.entries(given) as [PersonField, string][]).filter(([field, value]) => (matter[field] ?? '') !== value);
      if (changed.length === 0) {
        return { on, answer: { result: 'already_so', description: 'Every field given already had that value.', matter } };
      }
      const who = whoOf(caller)!;
      const after: Matter = { ...matter, version: matter.version + 1 };
      for (const [field, value] of changed) {
        if (field === 'due') {
          after.due = value === '' ? null : value;
        } else if (field === 'kind') {
          after.kind = value as MatterKind;
        } else {
          after[field] = value;
        }
        if (!after.set_by_you.includes(field)) {
          after.set_by_you = [...after.set_by_you, field];
        }
      }
      const at = now.toISOString();
      return {
        on,
        answer: { result: 'changed', description: `The matter "${after.title}" was changed.`, matter: after },
        writes: [
          stillAt(matter),
          {
            sql: 'UPDATE brief_matters SET version = ?, kind = ?, lane = ?, title = ?, notes = ?, due = ?, set_by_you = ? WHERE id = ? AND version = ?',
            values: [after.version, after.kind, after.lane, after.title, after.notes, after.due, JSON.stringify(after.set_by_you), matter.id, matter.version],
          },
          ...changed.map(([field, value]) => historyWrite(matter.id, { at, who, what: editLine(field, value) })),
        ],
      };
    },

    async matter_set_state({ caller, input, now }) {
      const matter = await matterById(store, String(input.matter));
      if (matter === undefined) {
        return unknownMatter();
      }
      const on = `matter:${matter.id}`;
      const to = input.to as MatterState;
      let until: string | null = null;
      if (to === 'snoozed') {
        if (typeof input.until !== 'string' || !isUtcTime(input.until) || new Date(input.until) <= now) {
          return { on, ...invalid('With snoozed, `until` must be a UTC time still to come, such as 2026-12-01T08:00:00Z.') };
        }
        until = new Date(input.until).toISOString();
      } else if (input.until !== undefined) {
        return { on, ...invalid('`until` is given with snoozed only.') };
      }
      if (matter.state === to && matter.snoozed_until === until) {
        return { on, answer: { result: 'already_so', description: `The matter was already ${to}.`, matter } };
      }
      const who = whoOf(caller)!;
      const after: Matter = { ...matter, version: matter.version + 1, state: to, snoozed_until: until };
      return {
        on,
        answer: { result: 'changed', description: `The matter "${matter.title}" is now ${to}.`, matter: after },
        writes: [
          stillAt(matter),
          {
            sql: 'UPDATE brief_matters SET version = ?, state = ?, snoozed_until = ? WHERE id = ? AND version = ?',
            values: [after.version, to, until, matter.id, matter.version],
          },
          historyWrite(matter.id, { at: now.toISOString(), who, what: stateLine(matter.state, to, until) }),
        ],
      };
    },

    async link_move_message({ caller, input, now }) {
      const link = await linkById(store, String(input.link));
      if (link === undefined || link.kind !== 'message') {
        return { answer: { result: 'unknown_link', description: 'No message link has that ID.' } };
      }
      const on = `matter:${link.matter}`;
      if (link.state === 'removed') {
        return { on, answer: { result: 'changed_since', description: 'Someone changed this first. That message link was already moved or removed.' } };
      }
      const target = await matterById(store, String(input.to));
      if (target === undefined) {
        return { on, answer: { result: 'unknown_matter', description: 'No matter has the ID it was to go to.' } };
      }
      if (target.id === link.matter) {
        return { on, answer: { result: 'same_matter', description: `The message already belongs to the matter "${target.title}".` } };
      }
      const id = newLinkId();
      const writes = moveWrites(link, target.id, id, whoOf(caller)!, now);
      const moved: Answer = {
        result: 'moved',
        description: `The message from ${link.sender} now belongs to the matter "${target.title}".`,
        link: id,
        from: link.matter,
        to: target.id,
      };
      // No operation removes a matter, so the target stays. The guard makes
      // that a rule of this landing rather than a fact about the others.
      return { on, answer: moved, writes: [stillTrue('SELECT 1 FROM brief_matters WHERE id = ?', [target.id]), ...writes] };
    },
  };
}
