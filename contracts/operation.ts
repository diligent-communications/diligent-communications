import { isRecord } from './record-fields.ts';
import { isLevel } from './who.ts';
import type { Caller, Level, Who } from './who.ts';

// What an operation answers: the name of the result, a plain description that
// names what it is about, and the fields that result carries.
export type Answer = { result: string; description: string; [field: string]: unknown };

const NAME = /^[a-z][a-z0-9_]{0,63}$/;

export function isName(value: unknown): value is string {
  return typeof value === 'string' && NAME.test(value);
}

export function isAnswer(value: unknown): value is Answer {
  return (
    isRecord(value) &&
    isName(value.result) &&
    typeof value.description === 'string' &&
    value.description.length > 0
  );
}

// The results any operation can return, and what each one means.
export const ANY_OPERATION_RESULTS = {
  not_signed_in: 'The caller has no sign-in that this install knows.',
  not_allowed: "The caller's sign-in does not reach the level this operation needs.",
  switched_off: "The caller's agent sign-in is switched off.",
  invalid_input: 'The input is not what this operation takes.',
  request_id_reused: 'This request ID was already used with a different input.',
  changed_since: 'Someone changed this first.',
  unavailable: 'The install could not finish this now. Nothing was changed.',
} as const;

export type AnyOperationResult = keyof typeof ANY_OPERATION_RESULTS;

// One input an operation takes. A `secret` text is a sign-in the person
// types. It is never a command-line argument, never kept and never recorded.
// A text with `lines: 'many'` may hold line breaks; no other text may.
export type InputField =
  | { kind: 'text'; meaning: string; required: boolean; min?: number; max: number; secret?: true; lines?: 'many' }
  | { kind: 'choice'; meaning: string; required: boolean; choices: readonly string[] }
  | { kind: 'yes_no'; meaning: string; required: boolean }
  | { kind: 'count'; meaning: string; required: boolean; min: number; max: number };

// The level an operation needs. `none` means it needs no session, and it is
// the person's: an agent sign-in is answered `not_allowed`.
export type OperationLevel = Level | 'none';

// One entry in the operations list. The screen's buttons, the commands and the
// agent tools are all made from this.
export type Operation = {
  name: string;
  part: string;
  meaning: string;
  level: OperationLevel;
  // True when the operation changes something. A read is false.
  changes: boolean;
  // True when it takes a request ID and its answer is kept, so a repeat is safe.
  request_id: boolean;
  input: Readonly<Record<string, InputField>>;
  // Its own named results, and what each one means.
  results: Readonly<Record<string, string>>;
  // Answer fields shown once: left out of the kept answer and of a repeat.
  shown_once?: readonly string[];
};

export const REQUEST_ID_FIELD = 'request_id';
const REQUEST_ID = /^[A-Za-z0-9._:-]{8,100}$/;
// Characters a plain text input may not hold: control characters.
const CONTROL = /[\u0000-\u001f\u007f]/;
// Characters a many-lined text input may not hold: control characters other
// than the line break.
const CONTROL_BUT_LINE_BREAK = /[\u0000-\u0009\u000b-\u001f\u007f]/;

export function isOperation(value: unknown): value is Operation {
  if (!isRecord(value) || !isName(value.name) || !isName(value.part)) {
    return false;
  }
  if (typeof value.meaning !== 'string' || value.meaning.length === 0) {
    return false;
  }
  if (!(isLevel(value.level) || value.level === 'none')) {
    return false;
  }
  if (typeof value.changes !== 'boolean' || typeof value.request_id !== 'boolean') {
    return false;
  }
  // Only an operation that changes something takes a request ID.
  if (value.request_id && !value.changes) {
    return false;
  }
  if (!isRecord(value.input) || !isRecord(value.results)) {
    return false;
  }
  const inputs = Object.entries(value.input);
  if (inputs.some(([name, field]) => !isName(name) || name === REQUEST_ID_FIELD || !isInputField(field))) {
    return false;
  }
  const results = Object.entries(value.results);
  if (results.length === 0 || results.some(([name, meaning]) => !isName(name) || typeof meaning !== 'string' || meaning.length === 0)) {
    return false;
  }
  const once = value.shown_once;
  return once === undefined || (Array.isArray(once) && once.every((field) => isName(field)));
}

function isInputField(value: unknown): value is InputField {
  if (!isRecord(value) || typeof value.meaning !== 'string' || typeof value.required !== 'boolean') {
    return false;
  }
  if (value.kind === 'text') {
    return (
      Number.isInteger(value.max) &&
      (value.min === undefined || Number.isInteger(value.min)) &&
      (value.lines === undefined || value.lines === 'many')
    );
  }
  if (value.kind === 'choice') {
    return Array.isArray(value.choices) && value.choices.length > 0 && value.choices.every((choice) => typeof choice === 'string');
  }
  if (value.kind === 'count') {
    return Number.isInteger(value.min) && Number.isInteger(value.max);
  }
  return value.kind === 'yes_no';
}

export type InputCheck = { ok: true; input: Record<string, unknown> } | { ok: false; about: string };

// Checks an input against what the operation takes. A refusal names the field
// and the rule, never the value, because the value may be a secret. An
// accepted input comes back with each Windows line ending in a many-lined text
// written as a plain line break, which is what its limit counts.
export function checkInput(operation: Operation, input: unknown): InputCheck {
  if (!isRecord(input)) {
    return { ok: false, about: 'the input must be one object' };
  }
  const fields: Record<string, InputField> = { ...operation.input };
  if (operation.request_id) {
    fields[REQUEST_ID_FIELD] = { kind: 'text', meaning: 'A request ID the caller makes up.', required: true, max: 100 };
  }
  for (const name of Object.keys(input)) {
    if (!Object.hasOwn(fields, name)) {
      return { ok: false, about: `\`${name}\` is not an input of \`${operation.name}\`` };
    }
  }
  const checked: Record<string, unknown> = { ...input };
  for (const [name, field] of Object.entries(fields)) {
    let value = input[name];
    if (field.kind === 'text' && field.lines === 'many' && typeof value === 'string') {
      value = value.replaceAll('\r\n', '\n');
      checked[name] = value;
    }
    if (value === undefined) {
      if (field.required) {
        return { ok: false, about: `\`${name}\` is missing` };
      }
      continue;
    }
    const problem = name === REQUEST_ID_FIELD ? requestIdProblem(value) : fieldProblem(field, value);
    if (problem !== null) {
      return { ok: false, about: `\`${name}\` ${problem}` };
    }
  }
  return { ok: true, input: checked };
}

function requestIdProblem(value: unknown): string | null {
  return typeof value === 'string' && REQUEST_ID.test(value)
    ? null
    : 'must be 8 to 100 letters, digits, dots, colons, dashes or underscores';
}

function fieldProblem(field: InputField, value: unknown): string | null {
  if (field.kind === 'text') {
    const min = field.min ?? 1;
    if (typeof value !== 'string' || !value.isWellFormed()) {
      return 'must be text';
    }
    if (value.length < min || value.length > field.max) {
      return `must be ${min} to ${field.max} characters`;
    }
    const control = field.lines === 'many' ? CONTROL_BUT_LINE_BREAK : CONTROL;
    if (field.secret !== true && (control.test(value) || value !== value.trim())) {
      return field.lines === 'many'
        ? 'must not start or end with a space or a line break, or hold any other control character'
        : 'must not start or end with a space, or hold a control character';
    }
    return null;
  }
  if (field.kind === 'choice') {
    return typeof value === 'string' && field.choices.includes(value) ? null : `must be one of: ${field.choices.join(', ')}`;
  }
  if (field.kind === 'yes_no') {
    return typeof value === 'boolean' ? null : 'must be true or false';
  }
  return typeof value === 'number' && Number.isInteger(value) && value >= field.min && value <= field.max
    ? null
    : `must be a whole number from ${field.min} to ${field.max}`;
}

// One change to the database. A part hands its writes to the door, and store
// lands all of one operation's writes together or not at all.
export type Write = { sql: string; values: readonly (string | number | null)[] };

// What a part's work hands back to the door for one call.
export type Outcome = {
  answer: Answer;
  // What the change was made on, such as `agent:4f2a`.
  on?: string;
  writes?: readonly Write[];
  // Who this call is recorded under, when it is not the caller as identified:
  // `you` when the call itself proved the person, `diligent` when the install
  // acted by itself.
  as?: Who;
  // A session to begin or end on the calling device. It travels beside the
  // answer and is never part of it.
  session?: { begin: string } | { end: true };
};

export type Call = { caller: Caller; input: Record<string, unknown>; now: Date };

// The work behind one operation. It belongs to the part that owns the operation.
export type Work = (call: Call) => Promise<Outcome>;
