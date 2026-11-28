// A made-up Brief, for tests and for looking at the screen.
//
// Every business, person and message here is invented. The rows are written
// straight into a test install's own local database, through the test
// harness's handle on it, with the row-making functions of brief, links and
// people. So loading it adds no operation, route or door: a real install has
// no way to do it.
import type { Link } from '../../../../contracts/link.ts';
import type { MainAction, Matter, MatterKind, MatterState } from '../../../../contracts/matter.ts';
import type { Write } from '../../../../contracts/operation.ts';
import type { Who } from '../../../../contracts/who.ts';
import type { Database } from '../../../host/test/helpers/local-install.ts';
import { linkWrite, newLinkId } from '../../../links/src/links.ts';
import { personWrite } from '../../../people/src/people.ts';
import { newMatterId, newMatterWrites } from '../../src/brief.ts';

type Message = { sender: string; quote: string; hoursAgo: number };

type MadeUpMatter = {
  label: string;
  kind: MatterKind;
  lane: string;
  title: string;
  next_action: string;
  owed_by: string;
  summary: string;
  latest_update: string;
  timing: string;
  main_action: MainAction;
  state?: MatterState;
  snoozedDays?: number;
  due?: string;
  messages: Message[];
  // People proposed by the agent, by their label in PEOPLE. A name followed
  // by `!` was already accepted by the person.
  people?: string[];
  hoursAgo: number;
};

export const PEOPLE = {
  halvik: 'Teodor Halvik',
  marrow: 'Ines Marrow',
  okafor: 'Bram Okafor',
  inspector: 'Della Prewitt',
} as const;

export type PersonLabel = keyof typeof PEOPLE;

export const MATTERS: readonly MadeUpMatter[] = [
  {
    label: 'lumber',
    kind: 'money',
    lane: 'work',
    title: 'Pellworth Lumber invoice 2093',
    next_action: 'Pay the invoice',
    owed_by: 'you',
    summary: 'Invoice 2093 for the cedar decking delivered to the Marrow job, net 15.',
    latest_update: 'A reminder came in this morning.',
    timing: 'by Friday',
    main_action: 'reply',
    messages: [
      { sender: 'Pellworth Lumber billing', quote: 'Attached is invoice 2093 for the cedar decking delivered Tuesday. Terms are net 15.', hoursAgo: 120 },
      { sender: 'Pellworth Lumber billing', quote: 'A friendly reminder that invoice 2093 is due this Friday.', hoursAgo: 5 },
    ],
    hoursAgo: 120,
  },
  {
    label: 'deposit',
    kind: 'money',
    lane: 'work',
    title: 'Deposit for the Halvik porch',
    next_action: 'Send the deposit request',
    owed_by: 'Teodor Halvik',
    summary: 'The porch rebuild is agreed. The deposit is a third of the estimate.',
    latest_update: 'He asked where to send the deposit.',
    timing: 'this week',
    main_action: 'contact',
    messages: [{ sender: 'Teodor Halvik', quote: 'We are happy with the estimate. Where should we send the deposit?', hoursAgo: 30 }],
    people: ['halvik'],
    hoursAgo: 30,
  },
  {
    label: 'water',
    kind: 'money',
    lane: 'home',
    title: 'Water bill for November',
    next_action: 'Pay online',
    owed_by: 'you',
    summary: 'The November water bill is ready to pay online.',
    latest_update: '',
    timing: 'due Dec 3',
    main_action: 'none',
    messages: [{ sender: 'Lower Tamsin Water District', quote: 'Your November statement is ready. Amount due by December 3.', hoursAgo: 60 }],
    hoursAgo: 60,
  },
  {
    label: 'registration',
    kind: 'do',
    lane: 'home',
    title: 'Renew the trailer registration',
    next_action: 'Renew it on the county site',
    owed_by: 'you',
    summary: 'The utility trailer registration runs out next month.',
    latest_update: '',
    timing: '',
    main_action: 'schedule',
    due: '2026-12-12',
    messages: [{ sender: 'Vehicle registration notices', quote: 'Your trailer registration expires on December 12. Renew online.', hoursAgo: 200 }],
    hoursAgo: 200,
  },
  {
    label: 'sealant',
    kind: 'do',
    lane: 'work',
    title: 'Order sealant for the Marrow deck',
    next_action: 'Order two gallons',
    owed_by: 'you',
    summary: 'The deck needs sealing before the rain next week. The owner picked the clear finish.',
    latest_update: 'She confirmed the clear finish.',
    timing: 'before Monday',
    main_action: 'contact',
    messages: [{ sender: 'Ines Marrow', quote: 'Clear finish is perfect. Thanks for checking before you ordered.', hoursAgo: 20 }],
    people: ['marrow!'],
    hoursAgo: 20,
  },
  {
    label: 'inspection',
    kind: 'reply',
    lane: 'work',
    title: 'Inspector asks: Tuesday or Wednesday?',
    next_action: 'Pick a day',
    owed_by: 'you',
    summary: 'The framing inspection for the Okafor addition can be Tuesday or Wednesday morning.',
    latest_update: 'She needs an answer today to hold the slot.',
    timing: 'today',
    main_action: 'reply',
    messages: [
      { sender: 'Della Prewitt', quote: 'I can do the framing inspection Tuesday or Wednesday morning. Which works?', hoursAgo: 8 },
      { sender: 'Bram Okafor', quote: 'Either day is fine for us, the gate code is the same.', hoursAgo: 6 },
    ],
    people: ['inspector', 'okafor'],
    hoursAgo: 8,
  },
  {
    label: 'pickup',
    kind: 'reply',
    lane: 'home',
    title: 'School pickup change next week',
    next_action: 'Say which days work',
    owed_by: 'you',
    summary: 'The carpool is moving pickup to 3:15 next week and asks which days you can drive.',
    latest_update: '',
    timing: 'by Sunday',
    main_action: 'reply',
    messages: [{ sender: 'Carpool group', quote: 'Pickup moves to 3:15 next week. Which days can you drive?', hoursAgo: 14 }],
    hoursAgo: 14,
  },
  {
    label: 'refund',
    kind: 'money',
    lane: 'work',
    title: 'Refund for the returned tile saw',
    next_action: 'Refund promised',
    owed_by: 'Quillmont Tool Rental',
    summary: 'The saw went back early. They said the refund takes five working days.',
    latest_update: '',
    timing: 'within a week',
    main_action: 'none',
    state: 'waiting',
    messages: [{ sender: 'Quillmont Tool Rental', quote: 'We received the saw. Your refund will post within five working days.', hoursAgo: 72 }],
    hoursAgo: 72,
  },
  {
    label: 'glass',
    kind: 'reply',
    lane: 'work',
    title: 'Quote for the shower glass',
    next_action: 'Quote promised',
    owed_by: 'Vellacott Glass',
    summary: 'Asked for a quote on a frameless panel for the Okafor bath.',
    latest_update: '',
    timing: '',
    main_action: 'reply',
    state: 'waiting',
    messages: [{ sender: 'Vellacott Glass', quote: 'We will measure Thursday and send the quote after.', hoursAgo: 50 }],
    hoursAgo: 50,
  },
  {
    label: 'gutters',
    kind: 'do',
    lane: 'home',
    title: 'Gutter cleaning estimate',
    next_action: 'Book after the leaves fall',
    owed_by: 'you',
    summary: 'An estimate for cleaning the gutters, best done after the last leaves.',
    latest_update: '',
    timing: '',
    main_action: 'schedule',
    state: 'snoozed',
    snoozedDays: 3,
    messages: [{ sender: 'Alder Gutter Co.', quote: 'Cleaning both levels would be a half day. Let us know when.', hoursAgo: 90 }],
    hoursAgo: 90,
  },
  {
    label: 'permit',
    kind: 'money',
    lane: 'work',
    title: 'Permit fee for the Okafor addition',
    next_action: 'Paid',
    owed_by: 'you',
    summary: 'The building permit fee was paid by card.',
    latest_update: 'Receipt received.',
    timing: '',
    main_action: 'none',
    state: 'done',
    messages: [{ sender: 'Permit counter', quote: 'Payment received for the addition permit. Your receipt is attached.', hoursAgo: 300 }],
    hoursAgo: 300,
  },
  {
    label: 'newsletter',
    kind: 'reply',
    lane: 'home',
    title: 'Hardware store survey',
    next_action: '',
    owed_by: 'you',
    summary: 'A survey about a recent visit.',
    latest_update: '',
    timing: '',
    main_action: 'none',
    state: 'dismissed',
    messages: [{ sender: 'Corner Hardware', quote: 'Tell us how we did on your last visit.', hoursAgo: 100 }],
    hoursAgo: 100,
  },
];

export type Label = (typeof MATTERS)[number]['label'];

export type MadeUpBrief = {
  writes: Write[];
  // The ID each made-up matter, message link, person link and person was given, by label.
  matters: Record<string, string>;
  messages: Record<string, string[]>;
  personLinks: Record<string, string[]>;
  people: Record<PersonLabel, string>;
};

function hoursBefore(now: Date, hours: number): Date {
  return new Date(now.getTime() - hours * 3_600_000);
}

// The writes of the made-up Brief, as made by the agent `agent`. Each call
// gives new IDs.
export function madeUpBrief(agent: Who, now: Date): MadeUpBrief {
  const brief: MadeUpBrief = { writes: [], matters: {}, messages: {}, personLinks: {}, people: {} as Record<PersonLabel, string> };
  for (const [label, name] of Object.entries(PEOPLE) as [PersonLabel, string][]) {
    const id = newMatterId();
    brief.people[label] = id;
    brief.writes.push(personWrite({ id, name, confirmed: 'no' }, hoursBefore(now, 400)));
  }
  for (const made of MATTERS) {
    const id = newMatterId();
    const at = hoursBefore(now, made.hoursAgo);
    brief.matters[made.label] = id;
    const state = made.state ?? 'open';
    const matter: Matter = {
      id,
      version: 1,
      kind: made.kind,
      lane: made.lane,
      title: made.title,
      next_action: made.next_action,
      owed_by: made.owed_by,
      summary: made.summary,
      latest_update: made.latest_update,
      timing: made.timing,
      state,
      snoozed_until: state === 'snoozed' ? new Date(now.getTime() + (made.snoozedDays ?? 1) * 86_400_000).toISOString() : null,
      main_action: made.main_action,
      notes: '',
      due: made.due ?? null,
      set_by_you: [],
    };
    brief.writes.push(...newMatterWrites(matter, agent, at));
    brief.messages[made.label] = [];
    for (const message of made.messages) {
      const link: Link = {
        id: newLinkId(),
        kind: 'message',
        matter: id,
        message: newLinkId(),
        person: null,
        state: 'active',
        made_by: agent,
        made_at: at.toISOString(),
        accepted_by: null,
        accepted_at: null,
        removed_by: null,
        removed_at: null,
        quote: message.quote,
        sender: message.sender,
        sent_at: hoursBefore(now, message.hoursAgo).toISOString(),
      };
      brief.messages[made.label]!.push(link.id);
      brief.writes.push(linkWrite(link));
    }
    brief.personLinks[made.label] = [];
    for (const named of made.people ?? []) {
      const accepted = named.endsWith('!');
      const person = brief.people[named.replace('!', '') as PersonLabel];
      const link: Link = {
        id: newLinkId(),
        kind: 'person',
        matter: id,
        message: null,
        person,
        state: accepted ? 'active' : 'proposed',
        made_by: agent,
        made_at: at.toISOString(),
        accepted_by: accepted ? 'you' : null,
        accepted_at: accepted ? hoursBefore(now, made.hoursAgo - 1).toISOString() : null,
        removed_by: null,
        removed_at: null,
        quote: null,
        sender: null,
        sent_at: null,
      };
      brief.personLinks[made.label]!.push(link.id);
      brief.writes.push(linkWrite(link));
    }
  }
  return brief;
}

// Writes the made-up Brief into a test install's database. The install's
// tables are made by its first request, so the caller makes one first.
export async function loadMadeUpBrief(database: Database, agent: Who, now: Date = new Date()): Promise<MadeUpBrief> {
  const brief = madeUpBrief(agent, now);
  for (const write of brief.writes) {
    await database.prepare(write.sql).bind(...write.values).run();
  }
  return brief;
}
