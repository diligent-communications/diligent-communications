import { isRecord } from './record-fields.ts';

// The three levels. Each one includes the ones before it.
export const LEVELS = ['read', 'prepare', 'you'] as const;
export type Level = (typeof LEVELS)[number];

// Prepare is the most an agent can hold.
export const AGENT_LEVELS = ['read', 'prepare'] as const;
export type AgentLevel = (typeof AGENT_LEVELS)[number];

export function isLevel(value: unknown): value is Level {
  return LEVELS.some((level) => level === value);
}

export function isAgentLevel(value: unknown): value is AgentLevel {
  return AGENT_LEVELS.some((level) => level === value);
}

// True when a caller holding `has` may call an operation that needs `needs`.
export function levelReaches(has: Level, needs: Level): boolean {
  return LEVELS.indexOf(has) >= LEVELS.indexOf(needs);
}

// Who did something, as the activity record keeps it.
export type Who = 'you' | 'diligent' | `agent:${string}` | `device:${string}`;

const ID = /^[a-z0-9]{1,64}$/;

export function isId(value: unknown): value is string {
  return typeof value === 'string' && ID.test(value);
}

export function isWho(value: unknown): value is Who {
  if (value === 'you' || value === 'diligent') {
    return true;
  }
  if (typeof value !== 'string') {
    return false;
  }
  const [kind, id, ...rest] = value.split(':');
  return (kind === 'agent' || kind === 'device') && rest.length === 0 && isId(id);
}

// The caller of one request, as access identified it. `nobody` is a caller
// with no sign-in. `session` is the ID of the session row, never the session
// itself.
export type Caller =
  | { kind: 'nobody' }
  | { kind: 'you'; session: string }
  | { kind: 'agent'; id: string; name: string; level: AgentLevel; on: boolean };

export function isCaller(value: unknown): value is Caller {
  if (!isRecord(value)) {
    return false;
  }
  if (value.kind === 'nobody') {
    return Object.keys(value).length === 1;
  }
  if (value.kind === 'you') {
    return Object.keys(value).length === 2 && isId(value.session);
  }
  return (
    value.kind === 'agent' &&
    Object.keys(value).length === 5 &&
    isId(value.id) &&
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    isAgentLevel(value.level) &&
    typeof value.on === 'boolean'
  );
}

// The name a caller's actions are recorded under. A caller with no sign-in
// has none.
export function whoOf(caller: Caller): Who | null {
  if (caller.kind === 'you') {
    return 'you';
  }
  return caller.kind === 'agent' ? `agent:${caller.id}` : null;
}

// The level a caller holds. A caller with no sign-in holds none.
export function levelOf(caller: Caller): Level | null {
  if (caller.kind === 'you') {
    return 'you';
  }
  return caller.kind === 'agent' ? caller.level : null;
}
