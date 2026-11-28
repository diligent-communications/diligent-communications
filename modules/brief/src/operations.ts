import { MATTER_KINDS, MATTER_LIMITS, MATTER_STATES } from '../../../contracts/matter.ts';
import type { Operation } from '../../../contracts/operation.ts';

// How many matters `matter_search` returns at most.
export const SEARCH_LIMIT = 50;
export const WORDS_LIMIT = 200;

const matterInput = { kind: 'text', meaning: 'The ID of the matter.', required: true, max: 64 } as const;

const unknownMatter = 'No matter has that ID.';

// The operations brief offers in this slice, as the operations list shows them.
export const briefOperations: readonly Operation[] = [
  {
    name: 'brief_list',
    part: 'brief',
    meaning:
      'The Brief, grouped by kind: money, do, reply, each with its count, the matter that has waited longest first. Open matters, and snoozed ones whose time has come, or with show set to waiting the matters marked waiting. A lane narrows it to that lane.',
    level: 'read',
    changes: false,
    request_id: false,
    input: {
      show: { kind: 'choice', meaning: 'brief for the Brief, waiting for the matters marked waiting. brief unless given.', required: false, choices: ['brief', 'waiting'] },
      lane: { kind: 'text', meaning: 'Only the matters in this lane.', required: false, max: MATTER_LIMITS.lane },
    },
    results: { brief: 'The matters on the Brief, grouped by kind.' },
  },
  {
    name: 'matter_get',
    part: 'brief',
    meaning: 'One matter, with the messages behind it, the people on it and its dated history, newest first.',
    level: 'read',
    changes: false,
    request_id: false,
    input: { matter: matterInput },
    results: { matter: 'The matter with that ID.', unknown_matter: unknownMatter },
  },
  {
    name: 'matter_search',
    part: 'brief',
    meaning: `Find matters in any state, done and dismissed included, whose words hold these words. At most ${SEARCH_LIMIT}, newest first.`,
    level: 'read',
    changes: false,
    request_id: false,
    input: { words: { kind: 'text', meaning: 'The words to find.', required: true, max: WORDS_LIMIT } },
    results: { found: 'The matters whose words hold the words given.' },
  },
  {
    name: 'matter_edit',
    part: 'brief',
    meaning:
      'Change the title, notes, due date, kind or lane of a matter. Give the version of the matter that was shown. Each field changed is then the person\'s.',
    level: 'you',
    changes: true,
    request_id: true,
    input: {
      matter: matterInput,
      version: { kind: 'count', meaning: 'The version of the matter that was shown.', required: true, min: 1, max: 2_147_483_647 },
      title: { kind: 'text', meaning: `The title, 1 to ${MATTER_LIMITS.title} characters.`, required: false, max: MATTER_LIMITS.title },
      notes: { kind: 'text', meaning: `Notes, at most ${MATTER_LIMITS.notes} characters. Empty clears them.`, required: false, min: 0, max: MATTER_LIMITS.notes },
      due: { kind: 'text', meaning: 'The due date, as YYYY-MM-DD. Empty clears it.', required: false, min: 0, max: 10 },
      kind: { kind: 'choice', meaning: 'The kind of matter.', required: false, choices: MATTER_KINDS },
      lane: { kind: 'text', meaning: 'The lane: lowercase letters, digits and dashes.', required: false, max: MATTER_LIMITS.lane },
    },
    results: {
      changed: 'The matter was changed.',
      already_so: 'Every field given already had that value. Nothing was changed.',
      unknown_matter: unknownMatter,
    },
  },
  {
    name: 'matter_set_state',
    part: 'brief',
    meaning: 'Mark a matter done, waiting, snoozed until a time, or dismissed, or reopen it with open.',
    level: 'you',
    changes: true,
    request_id: true,
    input: {
      matter: matterInput,
      to: { kind: 'choice', meaning: 'The state: open reopens it.', required: true, choices: MATTER_STATES },
      until: { kind: 'text', meaning: 'With snoozed only: the UTC time it comes back, such as 2026-12-01T08:00:00Z.', required: false, max: 30 },
    },
    results: {
      changed: 'The matter is now in that state.',
      already_so: 'The matter was already in that state. Nothing was changed.',
      unknown_matter: unknownMatter,
    },
  },
  {
    // The work is brief's: it knows whether the matter the message goes to
    // exists, and links reads no other part.
    name: 'link_move_message',
    part: 'brief',
    meaning: 'Move a message from its matter to another. The old link is marked removed and kept.',
    level: 'you',
    changes: true,
    request_id: true,
    input: {
      link: { kind: 'text', meaning: 'The ID of the message link.', required: true, max: 64 },
      to: { kind: 'text', meaning: 'The ID of the matter it goes to.', required: true, max: 64 },
    },
    results: {
      moved: 'The message now belongs to the other matter.',
      same_matter: 'The message already belongs to that matter.',
      unknown_link: 'No message link has that ID.',
      unknown_matter: 'No matter has the ID it was to go to.',
    },
  },
];
