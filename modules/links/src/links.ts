import { isLink, LINK_LIMITS } from '../../../contracts/link.ts';
import type { Link } from '../../../contracts/link.ts';
import type { HistoryLine } from '../../../contracts/matter.ts';
import type { Operation, Outcome, Work, Write } from '../../../contracts/operation.ts';
import { whoOf } from '../../../contracts/who.ts';
import type { Who } from '../../../contracts/who.ts';
import { stillTrue } from '../../store/src/store.ts';
import type { Store, Tables } from '../../store/src/store.ts';

// Every link, in one table. A link is never deleted: removing one marks it
// removed and keeps the row. A message is in force on one matter at most,
// and a person once on a matter at most, which the two indexes hold.
export const linksTables: Tables = {
  part: 'links',
  steps: [
    `CREATE TABLE links (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('message', 'person')),
      matter TEXT NOT NULL,
      message TEXT,
      person TEXT,
      state TEXT NOT NULL CHECK (state IN ('proposed', 'active', 'removed')),
      made_by TEXT NOT NULL,
      made_at TEXT NOT NULL,
      accepted_by TEXT,
      accepted_at TEXT,
      removed_by TEXT,
      removed_at TEXT,
      quote TEXT CHECK (quote IS NULL OR length(quote) <= ${LINK_LIMITS.quote}),
      sender TEXT CHECK (sender IS NULL OR length(sender) <= ${LINK_LIMITS.sender}),
      sent_at TEXT,
      CHECK ((kind = 'message') = (message IS NOT NULL AND person IS NULL AND quote IS NOT NULL)),
      CHECK ((kind = 'person') = (person IS NOT NULL AND message IS NULL AND quote IS NULL))
    ) STRICT`,
    "CREATE UNIQUE INDEX links_message_in_force ON links (message) WHERE kind = 'message' AND state <> 'removed'",
    "CREATE UNIQUE INDEX links_person_in_force ON links (matter, person) WHERE kind = 'person' AND state <> 'removed'",
    'CREATE INDEX links_by_matter ON links (matter)',
  ],
};

const COLUMNS =
  'id, kind, matter, message, person, state, made_by, made_at, accepted_by, accepted_at, removed_by, removed_at, quote, sender, sent_at';

// The write that adds one link. A value that is not exactly a link is
// refused here, before it can be written.
export function linkWrite(link: Link): Write {
  if (!isLink(link)) {
    throw new TypeError('A link must be exactly a link, within its limits.');
  }
  return {
    sql: `INSERT INTO links (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    values: [
      link.id,
      link.kind,
      link.matter,
      link.message,
      link.person,
      link.state,
      link.made_by,
      link.made_at,
      link.accepted_by,
      link.accepted_at,
      link.removed_by,
      link.removed_at,
      link.quote,
      link.sender,
      link.sent_at,
    ],
  };
}

// A new ID for a link: 16 lowercase hex digits from the runtime's own random
// generator.
export function newLinkId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Every link of one matter, removed ones included, oldest first, and in the
// order they were written when made at the same time.
export async function linksOfMatter(store: Store, matter: string): Promise<Link[]> {
  return store.rows<Link>(`SELECT ${COLUMNS} FROM links WHERE matter = ? ORDER BY made_at, rowid`, matter);
}

export async function linkById(store: Store, id: string): Promise<Link | undefined> {
  const [found] = await store.rows<Link>(`SELECT ${COLUMNS} FROM links WHERE id = ?`, id);
  return found;
}

// A write that makes the landing clash unless the link is still as it was read.
function unchanged(link: Link): Write {
  return stillTrue('SELECT 1 FROM links WHERE id = ? AND matter = ? AND state = ?', [link.id, link.matter, link.state]);
}

// The writes that move a message link to another matter: the old link is
// marked removed and kept, and a new link in force carries the same message,
// quote, sender and time. They land only while the old link is as it was read.
export function moveWrites(link: Link, to: string, id: string, who: Who, at: Date): Write[] {
  if (link.kind !== 'message' || link.state === 'removed') {
    throw new TypeError('Only a message link in force can be moved.');
  }
  const when = at.toISOString();
  return [
    unchanged(link),
    { sql: "UPDATE links SET state = 'removed', removed_by = ?, removed_at = ? WHERE id = ?", values: [who, when, link.id] },
    linkWrite({
      ...link,
      id,
      matter: to,
      state: 'active',
      made_by: who,
      made_at: when,
      accepted_by: null,
      accepted_at: null,
      removed_by: null,
      removed_at: null,
    }),
  ];
}

// The dated lines a matter's links add to its history. Each change to a link
// is already in its own row: who made it, accepted it and removed it, and when.
export function linkHistory(links: readonly Link[]): HistoryLine[] {
  const lines: HistoryLine[] = [];
  for (const link of links) {
    const about = link.kind === 'message' ? `A message from ${link.sender}` : 'A person';
    // A person link an agent makes starts as proposed. One the person makes is
    // in force at once.
    const made = link.kind === 'message' ? 'was linked to this matter.' : link.made_by.startsWith('agent:') ? 'was proposed for this matter.' : 'was added to this matter.';
    lines.push({ at: link.made_at, who: link.made_by, what: `${about} ${made}` });
    if (link.accepted_by !== null && link.accepted_at !== null) {
      lines.push({ at: link.accepted_at, who: link.accepted_by, what: `${about} was accepted on this matter.` });
    }
    if (link.removed_by !== null && link.removed_at !== null) {
      lines.push({ at: link.removed_at, who: link.removed_by, what: `${about} was taken off this matter.` });
    }
  }
  return lines;
}

const linkInput = { link: { kind: 'text', meaning: 'The ID of the person link.', required: true, max: 64 } } as const;

// The operations links offers in this slice, as the operations list shows
// them. Moving a message is `link_move_message`, whose work is brief's,
// because brief knows whether the matter it goes to exists.
export const linksOperations: readonly Operation[] = [
  {
    name: 'link_accept_person',
    part: 'links',
    meaning: 'Accept a person proposed for a matter.',
    level: 'you',
    changes: true,
    request_id: true,
    input: linkInput,
    results: {
      accepted: 'The person link was accepted.',
      already_so: 'The person link was already accepted.',
      unknown_link: 'No person link has that ID.',
    },
  },
  {
    name: 'link_remove_person',
    part: 'links',
    meaning: 'Take a person off a matter. The link is marked removed and kept.',
    level: 'you',
    changes: true,
    request_id: true,
    input: linkInput,
    results: {
      removed: 'The person link was marked removed.',
      already_so: 'The person link was already removed.',
      unknown_link: 'No person link has that ID.',
    },
  },
];

export function linksWork(store: Store): Readonly<Record<string, Work>> {
  async function personLink(id: string): Promise<Link | Outcome> {
    const link = await linkById(store, id);
    if (link === undefined || link.kind !== 'person') {
      return { answer: { result: 'unknown_link', description: 'No person link has that ID.' } };
    }
    return link;
  }

  return {
    async link_accept_person({ caller, input, now }) {
      const link = await personLink(String(input.link));
      if (!('kind' in link)) {
        return link;
      }
      const on = `matter:${link.matter}`;
      if (link.state === 'active') {
        return { on, answer: { result: 'already_so', description: 'That person link was already accepted.', link } };
      }
      if (link.state === 'removed') {
        return { on, answer: { result: 'changed_since', description: 'Someone changed this first. That person link was removed.', link } };
      }
      const who = whoOf(caller)!;
      const accepted: Link = { ...link, state: 'active', accepted_by: who, accepted_at: now.toISOString() };
      return {
        on,
        answer: { result: 'accepted', description: 'The person link was accepted.', link: accepted },
        writes: [
          unchanged(link),
          { sql: "UPDATE links SET state = 'active', accepted_by = ?, accepted_at = ? WHERE id = ?", values: [who, accepted.accepted_at, link.id] },
        ],
      };
    },

    async link_remove_person({ caller, input, now }) {
      const link = await personLink(String(input.link));
      if (!('kind' in link)) {
        return link;
      }
      const on = `matter:${link.matter}`;
      if (link.state === 'removed') {
        return { on, answer: { result: 'already_so', description: 'That person link was already removed.', link } };
      }
      const who = whoOf(caller)!;
      const removed: Link = { ...link, state: 'removed', removed_by: who, removed_at: now.toISOString() };
      return {
        on,
        answer: { result: 'removed', description: 'The person link was marked removed. It is kept.', link: removed },
        writes: [
          unchanged(link),
          { sql: "UPDATE links SET state = 'removed', removed_by = ?, removed_at = ? WHERE id = ?", values: [who, removed.removed_at, link.id] },
        ],
      };
    },
  };
}
