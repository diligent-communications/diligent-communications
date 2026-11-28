import type { Operation } from '../../../contracts/operation.ts';

export const ACTIVITY_LIMIT = { default: 50, most: 200 } as const;

// The operations store offers in this slice, as the operations list shows them.
export const storeOperations: readonly Operation[] = [
  {
    name: 'activity_list',
    part: 'store',
    meaning: 'Who did what, newest first.',
    level: 'you',
    changes: false,
    request_id: false,
    input: {
      limit: {
        kind: 'count',
        meaning: `How many lines to return. ${ACTIVITY_LIMIT.default} unless given.`,
        required: false,
        min: 1,
        max: ACTIVITY_LIMIT.most,
      },
    },
    results: { listed: 'The newest lines of the activity record.' },
  },
];
