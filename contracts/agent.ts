import { hasFields, isRecord, isText, isUtcTime } from './record-fields.ts';
import { isAgentLevel, isId } from './who.ts';
import type { AgentLevel } from './who.ts';

// An agent's sign-in, as `agent_list` shows it. It never holds the token.
export type Agent = {
  id: string;
  name: string;
  level: AgentLevel;
  on: boolean;
  made_at: string;
  last_used_at: string | null;
};

export const AGENT_FIELDS = ['id', 'name', 'level', 'on', 'made_at', 'last_used_at'] as const;

export function isAgent(value: unknown): value is Agent {
  return (
    isRecord(value) &&
    hasFields(value, AGENT_FIELDS) &&
    isId(value.id) &&
    isText(value.name) &&
    isAgentLevel(value.level) &&
    typeof value.on === 'boolean' &&
    isUtcTime(value.made_at) &&
    (value.last_used_at === null || isUtcTime(value.last_used_at))
  );
}
