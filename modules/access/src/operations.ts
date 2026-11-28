import type { Operation } from '../../../contracts/operation.ts';
import { AGENT_LEVELS } from '../../../contracts/who.ts';
import { PASSWORD_LENGTH } from './limits.ts';

const password = {
  kind: 'text',
  meaning: `The password, ${PASSWORD_LENGTH.min} to ${PASSWORD_LENGTH.max} characters.`,
  required: true,
  min: PASSWORD_LENGTH.min,
  max: PASSWORD_LENGTH.max,
  secret: true,
} as const;

// The operations access offers in this slice, as the operations list shows them.
export const accessOperations: readonly Operation[] = [
  {
    name: 'password_set',
    part: 'access',
    meaning:
      'Set the password. With an unused set-up code it needs no session and ends every session. Without one it needs the person\'s session and the current password.',
    level: 'none',
    changes: true,
    request_id: false,
    input: {
      // The order is the order the command line asks in.
      code: { kind: 'text', meaning: 'The set-up code, when setting the password without a session.', required: false, max: 1024, secret: true },
      current: { kind: 'text', meaning: 'The current password, when changing it while signed in.', required: false, max: PASSWORD_LENGTH.max, secret: true },
      password: { ...password, meaning: `The new password, ${PASSWORD_LENGTH.min} to ${PASSWORD_LENGTH.max} characters.` },
    },
    results: {
      set: 'The password was set.',
      wrong_code: 'That is not an unused set-up code of this install.',
      not_allowed: 'Setting the password needs an unused set-up code, or the person\'s session and the current password.',
      wrong_password: 'The current password given is not the password.',
      locked_out: 'The password is locked for a while after too many wrong tries.',
    },
  },
  {
    name: 'sign_in',
    part: 'access',
    meaning: 'The person signs in with the password. The session is kept on the calling device.',
    level: 'none',
    changes: true,
    request_id: false,
    input: {
      // A wrong password of any length is answered `wrong_password`.
      password: { ...password, meaning: 'The password.', min: 1 },
    },
    results: {
      signed_in: 'The password was right, and this device now has a session.',
      wrong_password: 'That is not the password.',
      locked_out: 'The password is locked for a while after too many wrong tries.',
    },
  },
  {
    name: 'sign_out',
    part: 'access',
    meaning: 'End the session on this device. Other devices stay signed in.',
    level: 'you',
    changes: true,
    request_id: false,
    input: {},
    results: { signed_out: 'The session on this device was ended.' },
  },
  {
    name: 'whoami',
    part: 'access',
    meaning: 'Who the caller is and its level.',
    level: 'read',
    changes: false,
    request_id: false,
    input: {},
    results: {
      you: 'The caller is the person.',
      agent: 'The caller is an agent.',
    },
  },
  {
    name: 'agent_create',
    part: 'access',
    meaning: 'Make an agent sign-in. Its token is in the first answer only.',
    level: 'you',
    changes: true,
    request_id: true,
    input: {
      name: { kind: 'text', meaning: 'A name for the agent, not used by another agent.', required: true, max: 64 },
      level: { kind: 'choice', meaning: 'The level the agent holds.', required: true, choices: AGENT_LEVELS },
    },
    results: {
      created: 'The agent sign-in was made.',
      name_taken: 'Another agent already has that name.',
    },
    shown_once: ['token'],
  },
  {
    name: 'agent_list',
    part: 'access',
    meaning: 'Agents, their levels, whether each is on, and when each was last used.',
    level: 'you',
    changes: false,
    request_id: false,
    input: {},
    results: { listed: 'The agent sign-ins of this install.' },
  },
  {
    name: 'agent_set',
    part: 'access',
    meaning: 'Change an agent\'s level, or switch it off or on.',
    level: 'you',
    changes: true,
    request_id: true,
    input: {
      agent: { kind: 'text', meaning: 'The ID of the agent.', required: true, max: 64 },
      level: { kind: 'choice', meaning: 'The level the agent holds from now on.', required: false, choices: AGENT_LEVELS },
      on: { kind: 'yes_no', meaning: 'True to switch the agent on, false to switch it off.', required: false },
    },
    results: {
      changed: 'The agent was changed.',
      unknown_agent: 'No agent has that ID.',
    },
  },
];
