import { hasFields, isRecord, isText, isUtcTime } from './record-fields.ts';
import { isId, isWho } from './who.ts';
import type { Who } from './who.ts';

export const LINK_KINDS = ['message', 'person'] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export const LINK_STATES = ['proposed', 'active', 'removed'] as const;
export type LinkState = (typeof LINK_STATES)[number];

// The most characters a message link's quote and sender's name may hold. The
// quote's limit is the target map's proposal.
export const LINK_LIMITS = { quote: 300, sender: 100 } as const;

// One link: a message to a matter, or a matter to a person. A link is never
// deleted, only marked removed. It says who made it, accepted it and removed
// it, and when.
export type Link = {
  id: string;
  kind: LinkKind;
  matter: string;
  // The source message, for a message link. Null for a person link.
  message: string | null;
  // The person, for a person link. Null for a message link.
  person: string | null;
  state: LinkState;
  made_by: Who;
  made_at: string;
  accepted_by: Who | null;
  accepted_at: string | null;
  removed_by: Who | null;
  removed_at: string | null;
  // A message link's short quote, the sender's name and when the message
  // happened. All three are null for a person link.
  quote: string | null;
  sender: string | null;
  sent_at: string | null;
};

export const LINK_FIELDS = [
  'id',
  'kind',
  'matter',
  'message',
  'person',
  'state',
  'made_by',
  'made_at',
  'accepted_by',
  'accepted_at',
  'removed_by',
  'removed_at',
  'quote',
  'sender',
  'sent_at',
] as const;

function bothOrNeither(who: unknown, at: unknown): boolean {
  return (who === null && at === null) || (isWho(who) && isUtcTime(at));
}

function isLimited(value: unknown, max: number): value is string {
  return isText(value) && value.length <= max;
}

export function isLink(value: unknown): value is Link {
  if (!isRecord(value) || !hasFields(value, LINK_FIELDS)) {
    return false;
  }
  const ends =
    value.kind === 'message'
      ? isId(value.message) &&
        value.person === null &&
        isLimited(value.quote, LINK_LIMITS.quote) &&
        isLimited(value.sender, LINK_LIMITS.sender) &&
        isUtcTime(value.sent_at)
      : value.kind === 'person' &&
        isId(value.person) &&
        value.message === null &&
        value.quote === null &&
        value.sender === null &&
        value.sent_at === null;
  const removed = value.state === 'removed';
  return (
    ends &&
    isId(value.id) &&
    isId(value.matter) &&
    LINK_STATES.some((state) => state === value.state) &&
    isWho(value.made_by) &&
    isUtcTime(value.made_at) &&
    bothOrNeither(value.accepted_by, value.accepted_at) &&
    bothOrNeither(value.removed_by, value.removed_at) &&
    // A removed link says who removed it. A link in force does not.
    removed === (value.removed_by !== null)
  );
}
