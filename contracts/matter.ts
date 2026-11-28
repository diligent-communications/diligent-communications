import { hasFields, isRecord, isText, isUtcTime } from './record-fields.ts';
import { isId, isWho } from './who.ts';
import type { Who } from './who.ts';

export const MATTER_KINDS = ['money', 'do', 'reply'] as const;
export type MatterKind = (typeof MATTER_KINDS)[number];

export const MATTER_STATES = ['open', 'waiting', 'snoozed', 'done', 'dismissed'] as const;
export type MatterState = (typeof MATTER_STATES)[number];

export const MAIN_ACTIONS = ['reply', 'schedule', 'contact', 'none'] as const;
export type MainAction = (typeof MAIN_ACTIONS)[number];

// The fields the person edits in place. Each one the person has edited is
// listed in `set_by_you`.
export const PERSON_FIELDS = ['title', 'notes', 'due', 'kind', 'lane'] as const;
export type PersonField = (typeof PERSON_FIELDS)[number];

// The most characters each text field of a matter may hold. The summary and
// the quote are the target map's proposals. The others are proposals made
// while building.
export const MATTER_LIMITS = {
  title: 200,
  next_action: 200,
  owed_by: 100,
  summary: 1_200,
  latest_update: 600,
  timing: 100,
  notes: 2_000,
  lane: 40,
} as const;

// A lane is a short tag: lowercase letters, digits and dashes.
const LANE = /^[a-z0-9][a-z0-9-]{0,39}$/;
// A calendar date with no time of day, such as 2026-12-12.
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isLane(value: unknown): value is string {
  return typeof value === 'string' && LANE.test(value);
}

// A real calendar date, written YYYY-MM-DD.
export function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE.test(value)) {
    return false;
  }
  const day = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === value;
}

// One matter: one line on the Brief, however many messages are behind it.
export type Matter = {
  id: string;
  version: number;
  kind: MatterKind;
  lane: string;
  title: string;
  next_action: string;
  owed_by: string;
  summary: string;
  latest_update: string;
  timing: string;
  state: MatterState;
  // When a snoozed matter comes back to the Brief. Null in any other state.
  snoozed_until: string | null;
  main_action: MainAction;
  notes: string;
  due: string | null;
  set_by_you: PersonField[];
};

export const MATTER_FIELDS = [
  'id',
  'version',
  'kind',
  'lane',
  'title',
  'next_action',
  'owed_by',
  'summary',
  'latest_update',
  'timing',
  'state',
  'snoozed_until',
  'main_action',
  'notes',
  'due',
  'set_by_you',
] as const;

function oneOf<T extends string>(choices: readonly T[], value: unknown): value is T {
  return choices.some((choice) => choice === value);
}

// Text that may be empty, is well formed, and is at most `max` characters.
function isShortText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length <= max && (value === '' || isText(value));
}

export function isMatter(value: unknown): value is Matter {
  if (!isRecord(value) || !hasFields(value, MATTER_FIELDS)) {
    return false;
  }
  const snoozed = value.state === 'snoozed';
  return (
    isId(value.id) &&
    Number.isInteger(value.version) &&
    (value.version as number) >= 1 &&
    oneOf(MATTER_KINDS, value.kind) &&
    isLane(value.lane) &&
    isText(value.title) &&
    isShortText(value.title, MATTER_LIMITS.title) &&
    isShortText(value.next_action, MATTER_LIMITS.next_action) &&
    isShortText(value.owed_by, MATTER_LIMITS.owed_by) &&
    isShortText(value.summary, MATTER_LIMITS.summary) &&
    isShortText(value.latest_update, MATTER_LIMITS.latest_update) &&
    isShortText(value.timing, MATTER_LIMITS.timing) &&
    oneOf(MATTER_STATES, value.state) &&
    (snoozed ? isUtcTime(value.snoozed_until) : value.snoozed_until === null) &&
    oneOf(MAIN_ACTIONS, value.main_action) &&
    isShortText(value.notes, MATTER_LIMITS.notes) &&
    (value.due === null || isDate(value.due)) &&
    Array.isArray(value.set_by_you) &&
    value.set_by_you.every((field) => oneOf(PERSON_FIELDS, field)) &&
    new Set(value.set_by_you).size === value.set_by_you.length
  );
}

// One dated line of a matter's history: when, who, and what changed.
export type HistoryLine = { at: string; who: Who; what: string };

export const HISTORY_FIELDS = ['at', 'who', 'what'] as const;
export const HISTORY_LIMIT = 300;

export function isHistoryLine(value: unknown): value is HistoryLine {
  return (
    isRecord(value) &&
    hasFields(value, HISTORY_FIELDS) &&
    isUtcTime(value.at) &&
    isWho(value.who) &&
    isText(value.what) &&
    value.what.length <= HISTORY_LIMIT
  );
}
