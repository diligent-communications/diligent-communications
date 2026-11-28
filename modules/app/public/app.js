// The screen: the Brief, a matter's page, and Settings. Every control calls
// one operation and shows what it returned. The screen never talks to the
// database and never runs a command: it only calls operations. Nothing an
// operation returns is ever written into the page as HTML: every word is set
// as text.

export const OPERATION_PATH = '/api/';

// The request the screen sends for one operation. The session travels as a
// cookie the browser keeps, which this script cannot read.
export function requestFor(operation, input) {
  return {
    path: OPERATION_PATH + operation,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(input),
    },
  };
}

// What to do about a result. A result says what was found, and the advice is
// the screen's. A result with no advice here needs none.
export const ADVICE = {
  not_signed_in: 'Sign in with the password first.',
  not_allowed: 'This needs a sign-in at a higher level.',
  switched_off: 'Switch the agent on again from a signed-in device.',
  invalid_input: 'Check what was typed and try again.',
  request_id_reused: 'Load the page again and repeat the step.',
  changed_since: 'Load the page again to see the change, then repeat the step.',
  unavailable: 'Try again in a moment. Nothing was changed.',
  set: 'Every other device needs to sign in again, with the new password.',
  wrong_code: 'Check the set-up code. A code works once. To set the password again, put a new set-up code in the install first.',
  wrong_password: 'Check the password and try again. Too many wrong tries in a row lock the password for a while.',
  locked_out: 'Wait until the time shown, then try again. A device that is already signed in keeps working.',
  signed_out: 'Sign in again to carry on from this device.',
  created: 'Copy the token now and give it to the agent. It is not shown again. A lost token is replaced by making a new agent.',
  name_taken: 'Choose another name.',
  unknown_agent: 'List the agents and copy the ID from there.',
  unknown_matter: 'Go back to the Brief and open the matter again.',
  unknown_link: 'Load the matter again to see what it holds now.',
  unknown_person: 'Load the matter again to see who is on it now.',
  same_matter: 'Pick a different matter to move it to.',
};

// The input of one form: each filled field, as the kind the operation takes.
// An empty field is left out.
export function inputOf(fields) {
  const input = {};
  for (const { name, value, kind } of fields) {
    if (name === '' || value === '') {
      continue;
    }
    if (kind === 'yes_no') {
      input[name] = value === 'true';
    } else if (kind === 'count') {
      input[name] = Number(value);
    } else {
      input[name] = value;
    }
  }
  return input;
}

// The operations the Brief and a matter's page call that change something.
// Each takes a request ID, made up once per change and sent again unchanged
// if the change is tried again.
export const CHANGES = ['matter_edit', 'matter_set_state', 'link_move_message', 'link_accept_person', 'link_remove_person'];

export const KIND_NAMES = { money: 'Money', do: 'Do', reply: 'Reply' };
export const MAIN_ACTION_NAMES = { reply: 'Reply', schedule: 'Schedule', contact: 'Contact' };
// What the quiet line under a matter's heading says, when its main action
// opened it. Preparing these comes with a later piece.
export const MAIN_ACTION_LATER = {
  reply: 'Preparing a reply comes with a later piece. The messages are below.',
  schedule: 'Preparing an event comes with a later piece. The messages are below.',
  contact: 'Preparing a contact change comes with a later piece. The messages are below.',
};
const STATE_NAMES = { open: 'Open', waiting: 'Waiting', snoozed: 'Snoozed', done: 'Done', dismissed: 'Dismissed' };

// A lane as the screen shows it: a capital first letter, dashes as spaces.
export function laneName(lane) {
  const words = lane.replaceAll('-', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// A lane as it is stored, from what the person typed.
export function laneOf(typed) {
  return typed.trim().toLowerCase().replace(/\s+/g, '-');
}

function dayName(date) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// The parts of a line's second row: the next action, its timing (the due date
// when the person set one), who owes it, and the lane.
export function lineParts(matter) {
  const parts = [];
  if (matter.next_action !== '') {
    parts.push(matter.next_action);
  }
  if (matter.due !== null) {
    // The person's due date reads the way a timing does.
    parts.push(`due ${dayName(matter.due)}`);
  } else if (matter.timing !== '') {
    parts.push(matter.timing);
  }
  if (matter.owed_by !== '') {
    parts.push(matter.owed_by === 'you' ? 'you' : `waiting on ${matter.owed_by}`);
  }
  return parts;
}

// The times a snooze offers, in the person's own time zone: tomorrow at 8,
// next Monday at 8, or 8 on a day picked.
export function snoozeTimes(now) {
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 8);
  const toMonday = ((8 - now.getDay()) % 7) || 7;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + toMonday, 8);
  return { tomorrow: tomorrow.toISOString(), 'next-week': monday.toISOString() };
}

export function snoozeOnDay(day) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date, 8).toISOString();
}

function whenName(at) {
  return new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ---------------------------------------------------------------------------
// Calling operations.

async function call(operation, input = {}) {
  const sent = CHANGES.includes(operation) && input.request_id === undefined ? { ...input, request_id: crypto.randomUUID() } : input;
  const { path, init } = requestFor(operation, sent);
  try {
    const response = await fetch(path, init);
    return await response.json();
  } catch {
    // The install did not answer as it should. Whether anything changed is not known.
    return { result: 'unavailable', description: 'The install did not answer.' };
  }
}

// Calls a change, and if the install did not answer, sends it once more with
// the same request ID, so the change is made at most once.
async function change(operation, input) {
  const sent = { ...input, request_id: crypto.randomUUID() };
  const first = await call(operation, sent);
  return first.result === 'unavailable' ? call(operation, sent) : first;
}

// ---------------------------------------------------------------------------
// Building the page from data. Every word is set as text.

function el(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === false || value === undefined || value === null) {
      continue;
    }
    if (name === 'text') {
      node.textContent = value;
    } else if (name.startsWith('on')) {
      node.addEventListener(name.slice(2), value);
    } else if (value === true) {
      node.setAttribute(name, '');
    } else {
      node.setAttribute(name, String(value));
    }
  }
  node.append(...children.filter((child) => child !== null && child !== undefined));
  return node;
}

const SVG = 'http://www.w3.org/2000/svg';

// The screen's own icons, drawn as plain shapes: three dots for more, and
// a check for Done.
function icon(name) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icon');
  if (name === 'more') {
    for (const x of [3, 8, 13]) {
      const dot = document.createElementNS(SVG, 'circle');
      dot.setAttribute('cx', String(x));
      dot.setAttribute('cy', '8');
      dot.setAttribute('r', '1.4');
      dot.setAttribute('fill', 'currentColor');
      svg.append(dot);
    }
    return svg;
  }
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.5');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('d', 'M3 8.5 6.5 12 13 4.5');
  svg.append(path);
  return svg;
}

function say(target, answer) {
  const words = [answer.description, ADVICE[answer.result]].filter(Boolean).join(' ');
  target.textContent = words;
  target.hidden = words === '';
}

const notice = { timer: 0 };

// A short notice at the foot of the screen, with an Undo when one is given.
function showNotice(text, undo) {
  const box = document.querySelector('[data-notice]');
  const button = box.querySelector('[data-notice-undo]');
  box.querySelector('[data-notice-text]').textContent = text;
  button.hidden = undo === undefined;
  button.onclick = undo === undefined ? null : () => {
    box.hidden = true;
    void undo();
  };
  box.hidden = false;
  clearTimeout(notice.timer);
  notice.timer = setTimeout(() => {
    box.hidden = true;
  }, 8000);
}

function showAnswer(answer) {
  showNotice([answer.description, ADVICE[answer.result]].filter(Boolean).join(' '));
}

// ---------------------------------------------------------------------------
// The Brief.

const view = { lane: '', waiting: false, lanes: [], agents: null };

function readRoute() {
  const [path, query = ''] = location.hash.replace(/^#/, '').split('?');
  return { path: path || '/', params: new URLSearchParams(query) };
}

function briefHash(lane, waiting) {
  const params = new URLSearchParams();
  if (lane !== '') {
    params.set('lane', lane);
  }
  if (waiting) {
    params.set('show', 'waiting');
  }
  const query = params.toString();
  return query === '' ? '#/' : `#/?${query}`;
}

function lineOf(matter) {
  const main = MAIN_ACTION_NAMES[matter.main_action];
  const meta = el('p', { class: 'meta' });
  for (const part of lineParts(matter)) {
    meta.append(el('span', { text: part }));
  }
  const page = `#/matter/${matter.id}`;
  return el(
    'li',
    { class: 'line' },
    el('div', { class: 'line-head' }, el('a', { class: 'line-title', href: page, text: matter.title }), el('span', { class: 'lane', text: laneName(matter.lane) })),
    meta,
    el(
      'div',
      { class: 'controls' },
      main === undefined
        ? el('span', { class: 'control-gap' })
        : el('a', { class: 'button button-main', href: `${page}?from=${matter.main_action}`, text: main }),
      el(
        'button',
        { type: 'button', class: 'button button-plain', 'aria-label': `Done: ${matter.title}`, onclick: () => void markDone(matter) },
        icon('done'),
        el('span', { text: 'Done' }),
      ),
      el('a', { class: 'button button-plain', href: `${page}?at=messages`, 'aria-label': `Source: ${matter.title}`, text: 'Source' }),
      el(
        'button',
        { type: 'button', class: 'button button-plain button-icon', 'aria-label': `More for ${matter.title}`, 'aria-haspopup': 'true', onclick: () => openMore(matter) },
        icon('more'),
      ),
    ),
  );
}

async function markDone(matter) {
  const answer = await change('matter_set_state', { matter: matter.id, to: 'done' });
  if (answer.result !== 'changed' && answer.result !== 'already_so') {
    showAnswer(answer);
    return;
  }
  await renderBrief();
  // Undo is the ordinary change of state back, recorded like any other change.
  showNotice(`Done: ${matter.title}.`, async () => {
    const back = await change('matter_set_state', { matter: matter.id, to: stateBefore(matter) });
    if (back.result !== 'changed' && back.result !== 'already_so') {
      showAnswer(back);
    }
    await rerender();
  });
}

// The state Undo puts a matter back to. A line on the Brief is open, or
// snoozed with its time come, which Undo leaves open; a line under Waiting
// is waiting.
export function stateBefore(matter) {
  return matter.state === 'waiting' ? 'waiting' : 'open';
}

// How a matter's page shows its state: the badge, whether its main control
// is Done or Reopen, and whether "more" offers the way back to the Brief. A
// snoozed matter whose time has come is on the Brief, and says so.
export function pageState(matter, now) {
  if (matter.state === 'done' || matter.state === 'dismissed') {
    return { badge: STATE_NAMES[matter.state], kind: matter.state, main: 'reopen', offerBack: false };
  }
  if (matter.state === 'snoozed') {
    return new Date(matter.snoozed_until) > now
      ? { badge: `Snoozed until ${whenName(matter.snoozed_until)}`, kind: 'snoozed', main: 'done', offerBack: true }
      : { badge: 'On the Brief', kind: 'open', main: 'done', offerBack: false };
  }
  return { badge: STATE_NAMES[matter.state], kind: matter.state, main: 'done', offerBack: matter.state === 'waiting' };
}

// The line an empty Brief shows, about the filter that is chosen.
export function emptyLine(lane, waiting) {
  if (lane === '') {
    return waiting ? 'Nothing is marked waiting.' : 'Nothing needs you right now.';
  }
  return waiting ? `Nothing in ${laneName(lane)} is marked waiting.` : `Nothing in ${laneName(lane)} needs you right now.`;
}

// A person's name as a matter's page shows it. A person that could not be
// loaded is not shown as gone.
export function personName(found) {
  if (found.result === 'person') {
    return found.person.name;
  }
  return found.result === 'unknown_person' ? 'A person no longer on record' : 'A name that could not be loaded';
}

let moreFor = null;

function openMore(matter) {
  moreFor = matter;
  const sheet = document.getElementById('more');
  sheet.querySelector('[data-more-title]').textContent = matter.title;
  // A matter that is off the Brief is offered the way back instead.
  const back = pageState(matter, new Date()).offerBack;
  const waiting = sheet.querySelector('[data-more="waiting"], [data-more="open"]');
  waiting.dataset.more = back ? 'open' : 'waiting';
  waiting.textContent = back ? 'Back on the Brief' : 'Mark waiting';
  const day = sheet.querySelector('[data-more-day]');
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  day.min = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  day.value = '';
  sheet.showPopover();
  sheet.querySelector('.sheet-item').focus();
}

async function chooseMore(choice) {
  const sheet = document.getElementById('more');
  const matter = moreFor;
  if (choice === 'cancel' || matter === null) {
    sheet.hidePopover();
    return;
  }
  let input;
  let words;
  if (choice === 'waiting' || choice === 'dismissed' || choice === 'open') {
    input = { matter: matter.id, to: choice };
    words = { waiting: `Marked waiting: ${matter.title}.`, dismissed: `Dismissed: ${matter.title}.`, open: `Back on the Brief: ${matter.title}.` }[choice];
  } else {
    const day = sheet.querySelector('[data-more-day]').value;
    if (choice === 'day' && day === '') {
      sheet.querySelector('[data-more-day]').focus();
      return;
    }
    const until = choice === 'day' ? snoozeOnDay(day) : snoozeTimes(new Date())[choice];
    input = { matter: matter.id, to: 'snoozed', until };
    words = `Snoozed until ${whenName(until)}: ${matter.title}.`;
  }
  sheet.hidePopover();
  const answer = await change('matter_set_state', input);
  if (answer.result !== 'changed' && answer.result !== 'already_so') {
    showAnswer(answer);
    return;
  }
  await rerender();
  showNotice(words, async () => {
    const back = await change('matter_set_state', { matter: matter.id, to: stateBefore(matter) });
    if (back.result !== 'changed' && back.result !== 'already_so') {
      showAnswer(back);
    }
    await rerender();
  });
}

function renderChips(answer) {
  const lanes = document.querySelector('[data-lanes]');
  lanes.replaceChildren(
    ...answer.lanes.map((lane) =>
      el('button', { type: 'button', class: 'chip', 'data-lane': lane, 'aria-pressed': String(view.lane === lane), text: laneName(lane) }),
    ),
  );
  document.querySelector('.chip[data-lane=""]').setAttribute('aria-pressed', String(view.lane === ''));
  const waiting = document.querySelector('[data-waiting]');
  waiting.setAttribute('aria-pressed', String(view.waiting));
  document.querySelector('[data-waiting-count]').textContent = String(answer.counts.waiting);
  // A chosen chip the row has scrolled past is brought into view.
  for (const chip of document.querySelectorAll('.chip[aria-pressed="true"]')) {
    chip.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

async function renderBrief() {
  const state = document.querySelector('[data-brief-state]');
  const retry = document.querySelector('[data-retry]');
  const groups = document.querySelector('[data-groups]');
  const input = {};
  if (view.lane !== '') {
    input.lane = view.lane;
  }
  if (view.waiting) {
    input.show = 'waiting';
  }
  const answer = await call('brief_list', input);
  retry.hidden = true;
  if (answer.result === 'not_signed_in') {
    location.hash = '#/settings?signin=1';
    return;
  }
  if (answer.result !== 'brief') {
    state.textContent = 'The Brief could not be loaded.';
    state.hidden = false;
    retry.hidden = false;
    groups.replaceChildren();
    return;
  }
  view.lanes = answer.lanes;
  renderChips(answer);
  const shown = answer.groups.filter((group) => group.count > 0);
  if (shown.length === 0) {
    state.textContent = emptyLine(view.lane, view.waiting);
    state.hidden = false;
  } else {
    state.hidden = true;
  }
  groups.replaceChildren(
    ...shown.map((group) =>
      el(
        'section',
        { class: 'group', 'aria-labelledby': `group-${group.kind}` },
        el('h2', { id: `group-${group.kind}`, class: 'group-title' }, el('span', { text: KIND_NAMES[group.kind] }), el('span', { class: 'count', text: String(group.count) })),
        el('ul', { class: 'lines' }, ...group.matters.map(lineOf)),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// A matter's page.

// The agents' names, or null when they could not be loaded. Only a list that
// loaded is kept.
async function agentNames() {
  if (view.agents === null) {
    const listed = await call('agent_list');
    if (listed.result !== 'listed') {
      return null;
    }
    view.agents = new Map(listed.agents.map((agent) => [`agent:${agent.id}`, agent.name]));
  }
  return view.agents;
}

// Who made a change, as the history shows it. `agents` is null when their
// names could not be loaded.
export function whoName(who, agents) {
  if (who === 'you') {
    return 'You';
  }
  if (who === 'diligent') {
    return 'Diligent';
  }
  if (agents === null) {
    return 'An agent whose name could not be loaded';
  }
  const name = agents.get(who);
  return name === undefined ? 'An agent no longer listed' : `Agent ${name}`;
}

// One field edited in place: its value, and an Edit button that turns it
// into a control with Save and Cancel.
function editable({ label, shown, control, save, empty }) {
  const value = el('p', { class: shown === '' ? 'field-value muted' : 'field-value', text: shown === '' ? empty : shown });
  const row = el('div', { class: 'field' });
  const edit = el('button', { type: 'button', class: 'button button-quiet field-button', 'aria-label': `Edit ${label.toLowerCase()}`, text: 'Edit' });
  // One row: the label, the value, and Edit at the right.
  row.append(el('span', { class: 'field-label', text: label }), value, edit);
  edit.addEventListener('click', () => {
    const form = el('form', { class: 'field-edit' });
    const field = control();
    field.setAttribute('aria-label', label);
    const cancel = el('button', { type: 'button', class: 'button', text: 'Cancel' });
    form.append(field, el('div', { class: 'field-actions' }, el('button', { type: 'submit', class: 'button button-main', text: 'Save' }), cancel));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void save(field.value);
    });
    cancel.addEventListener('click', () => form.replaceWith(value));
    value.replaceWith(form);
    edit.hidden = true;
    cancel.addEventListener('click', () => {
      edit.hidden = false;
    });
    field.focus();
  });
  return row;
}

async function renderMatter(id, params) {
  const box = document.querySelector('[data-matter]');
  const state = document.querySelector('[data-matter-state]');
  const got = await call('matter_get', { matter: id });
  if (got.result === 'not_signed_in') {
    location.hash = '#/settings?signin=1';
    return;
  }
  if (got.result !== 'matter') {
    say(state, got.result === 'unknown_matter' ? got : { result: '', description: 'The matter could not be loaded.' });
    box.replaceChildren(el('button', { type: 'button', class: 'button', text: 'Try again', onclick: () => void rerender() }));
    return;
  }
  const { matter } = got;
  const [agents, others, people] = await Promise.all([
    agentNames(),
    otherMatters(matter.id),
    Promise.all(got.people.map(async (link) => ({ ...link, found: await call('person_get', { person: link.person }) }))),
  ]);

  // Saves one field, and shows the matter as it now is.
  async function save(field, value) {
    const answer = await change('matter_edit', { matter: matter.id, version: matter.version, [field]: value });
    if (answer.result === 'changed_since') {
      showNotice('Someone changed this matter first. This is how it is now.');
    } else if (answer.result !== 'changed' && answer.result !== 'already_so') {
      showAnswer(answer);
      return;
    }
    await rerender();
  }

  async function setState(to, until) {
    const answer = await change('matter_set_state', until === undefined ? { matter: matter.id, to } : { matter: matter.id, to, until });
    if (answer.result !== 'changed' && answer.result !== 'already_so') {
      showAnswer(answer);
      return;
    }
    await rerender();
  }

  const later = MAIN_ACTION_LATER[params.get('from') ?? ''];
  const shown = pageState(matter, new Date());
  const stateRow = el(
    'div',
    { class: 'state-row' },
    el('span', { class: `badge badge-${shown.kind}`, text: shown.badge }),
    shown.main === 'reopen'
      ? el('button', { type: 'button', class: 'button', text: 'Reopen', onclick: () => void setState('open') })
      : el('button', { type: 'button', class: 'button', onclick: () => void setState('done') }, icon('done'), el('span', { text: 'Done' })),
    shown.main === 'reopen'
      ? null
      : el('button', { type: 'button', class: 'button button-icon', 'aria-label': 'More for this matter', 'aria-haspopup': 'true', onclick: () => openMore(matter) }, icon('more')),
  );

  const title = editable({
    label: 'Title',
    shown: matter.title,
    empty: '',
    control: () => el('input', { type: 'text', value: matter.title, maxlength: 200, required: true }),
    save: (value) => save('title', value.trim()),
  });
  title.classList.add('field-title');
  title.querySelector('.field-value').setAttribute('role', 'heading');
  title.querySelector('.field-value').setAttribute('aria-level', '1');

  const kind = editable({
    label: 'Kind',
    shown: KIND_NAMES[matter.kind],
    empty: '',
    control: () => {
      const select = el('select', {});
      for (const [value, name] of Object.entries(KIND_NAMES)) {
        select.append(el('option', { value, selected: value === matter.kind, text: name }));
      }
      return select;
    },
    save: (value) => save('kind', value),
  });
  const lane = editable({
    label: 'Lane',
    shown: laneName(matter.lane),
    empty: '',
    control: () => {
      const list = el('datalist', { id: 'lanes-in-use' }, ...view.lanes.map((name) => el('option', { value: laneName(name) })));
      document.body.append(list);
      return el('input', { type: 'text', value: laneName(matter.lane), list: 'lanes-in-use', maxlength: 40, required: true, autocomplete: 'off' });
    },
    save: (value) => save('lane', laneOf(value)),
  });
  const due = editable({
    label: 'Due',
    shown: matter.due === null ? '' : dayName(matter.due),
    empty: 'No due date',
    control: () => el('input', { type: 'date', value: matter.due ?? '' }),
    save: (value) => save('due', value),
  });
  const notes = editable({
    label: 'Notes',
    shown: matter.notes,
    empty: 'No notes',
    control: () => {
      const area = el('textarea', { rows: 4, maxlength: 2000 });
      area.value = matter.notes;
      return area;
    },
    save: (value) => save('notes', value.trim()),
  });

  const whoList = el(
    'ul',
    { class: 'people' },
    ...people.map((link) => {
      const name = personName(link.found);
      const proposed = link.state === 'proposed';
      return el(
        'li',
        { class: 'person' },
        el('span', { class: 'person-name', text: name }),
        proposed ? el('span', { class: 'badge badge-proposed', text: 'Unconfirmed' }) : null,
        el(
          'span',
          { class: 'person-actions' },
          proposed
            ? el('button', {
                type: 'button',
                class: 'button',
                'aria-label': `Accept ${name}`,
                text: 'Accept',
                onclick: async () => {
                  const answer = await change('link_accept_person', { link: link.link });
                  if (answer.result !== 'accepted' && answer.result !== 'already_so') showAnswer(answer);
                  await rerender();
                },
              })
            : null,
          el('button', {
            type: 'button',
            class: 'button',
            'aria-label': `Remove ${name}`,
            text: 'Remove',
            onclick: async () => {
              const answer = await change('link_remove_person', { link: link.link });
              if (answer.result !== 'removed' && answer.result !== 'already_so') {
                showAnswer(answer);
              } else {
                showNotice(`${name} was taken off this matter.`);
              }
              await rerender();
            },
          }),
        ),
      );
    }),
  );

  const messages = el(
    'ol',
    { class: 'messages' },
    ...got.messages.map((message) => {
      const item = el(
        'li',
        { class: 'message' },
        el('p', { class: 'message-head' }, el('span', { class: 'message-sender', text: message.sender }), el('time', { datetime: message.sent_at, text: whenName(message.sent_at) })),
        el('blockquote', { text: message.quote }),
      );
      const move = el('button', { type: 'button', class: 'button button-quiet', text: 'Move to another matter' });
      move.addEventListener('click', () => {
        const select = el('select', { 'aria-label': 'Move this message to', required: true }, el('option', { value: '', text: 'Pick a matter' }), ...others.map((other) => el('option', { value: other.id, text: other.title })));
        const form = el('form', { class: 'field-edit' }, select, el('div', { class: 'field-actions' }, el('button', { type: 'submit', class: 'button button-main', text: 'Move' }), el('button', { type: 'button', class: 'button', text: 'Cancel', onclick: () => form.replaceWith(move) })));
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          if (select.value === '') {
            select.focus();
            return;
          }
          const answer = await change('link_move_message', { link: message.link, to: select.value });
          if (answer.result === 'moved') {
            showNotice(answer.description);
          } else {
            showAnswer(answer);
          }
          await rerender();
        });
        move.replaceWith(form);
        select.focus();
      });
      item.append(move);
      return item;
    }),
  );

  const history = el(
    'ol',
    { class: 'history' },
    ...got.history.map((line) =>
      el('li', {}, el('time', { datetime: line.at, text: whenName(line.at) }), el('span', { class: 'history-who', text: whoName(line.who, agents) }), el('span', { text: line.what })),
    ),
  );

  const parts = [
    title,
    later === undefined ? null : el('p', { class: 'later muted', text: later }),
    stateRow,
    el('section', { class: 'part', 'aria-labelledby': 'summary' }, el('h2', { id: 'summary', text: 'Summary' }), el('p', { text: matter.summary || 'No summary yet.' }), matter.latest_update === '' ? null : el('p', { class: 'latest' }, el('span', { class: 'field-label', text: 'Latest ' }), el('span', { text: matter.latest_update }))),
    el('section', { class: 'part fields', 'aria-label': 'Details' }, kind, lane, due, notes),
    el('section', { class: 'part', 'aria-labelledby': 'with' }, el('h2', { id: 'with', text: 'With' }), people.length === 0 ? el('p', { class: 'muted', text: 'No one is on this matter yet.' }) : whoList),
    el('section', { class: 'part', id: 'messages', 'aria-labelledby': 'messages-title' }, el('h2', { id: 'messages-title', text: 'Messages' }), got.messages.length === 0 ? el('p', { class: 'muted', text: 'No messages are behind this matter now.' }) : messages),
    el('section', { class: 'part', 'aria-labelledby': 'history-title' }, el('h2', { id: 'history-title', text: 'History' }), history),
  ];
  box.replaceChildren(...parts.filter((part) => part !== null));
  state.hidden = true;
  if (params.get('at') === 'messages') {
    document.getElementById('messages').scrollIntoView();
  }
}

// The other matters a message can move to: those on the Brief and those
// marked waiting.
async function otherMatters(id) {
  const [onBrief, waiting] = await Promise.all([call('brief_list'), call('brief_list', { show: 'waiting' })]);
  const all = [onBrief, waiting].filter((answer) => answer.result === 'brief').flatMap((answer) => answer.groups.flatMap((group) => group.matters));
  return all.filter((matter) => matter.id !== id);
}

// ---------------------------------------------------------------------------
// Search: matters in any state, done and dismissed included.

async function renderSearch(words) {
  const input = document.getElementById('search-words');
  const state = document.querySelector('[data-search-state]');
  const found = document.querySelector('[data-found]');
  input.value = words;
  found.replaceChildren();
  if (words === '') {
    state.hidden = true;
    input.focus();
    return;
  }
  const answer = await call('matter_search', { words });
  if (answer.result === 'not_signed_in') {
    location.hash = '#/settings?signin=1';
    return;
  }
  if (answer.result !== 'found') {
    say(state, answer);
    return;
  }
  state.textContent = answer.matters.length === 0 ? 'No matter holds those words.' : '';
  state.hidden = answer.matters.length !== 0;
  found.replaceChildren(
    ...answer.matters.map((matter) =>
      el(
        'li',
        { class: 'line' },
        el('a', { class: 'line-title', href: `#/matter/${matter.id}`, text: matter.title }),
        el(
          'p',
          { class: 'meta' },
          el('span', { class: `badge badge-${matter.state}`, text: STATE_NAMES[matter.state] }),
          el('span', { text: KIND_NAMES[matter.kind] }),
          el('span', { class: 'lane', text: laneName(matter.lane) }),
        ),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Settings: the forms of the first slice, each sending its form as one call.

function show(output, answer) {
  const result = document.createElement('strong');
  result.textContent = answer.result;
  const description = document.createElement('p');
  description.textContent = answer.description;
  const parts = [result, description];
  const advice = ADVICE[answer.result];
  if (advice !== undefined) {
    const line = document.createElement('p');
    line.className = 'muted';
    line.textContent = advice;
    parts.push(line);
  }
  const { result: _result, description: _description, ...fields } = answer;
  if (Object.keys(fields).length > 0) {
    const details = document.createElement('pre');
    details.textContent = JSON.stringify(fields, null, 2);
    parts.push(details);
  }
  output.replaceChildren(...parts);
}

async function submit(form) {
  const output = form.querySelector('output');
  const fields = Array.from(form.elements)
    .filter((element) => element.name)
    .map((element) => ({ name: element.name, value: element.value, kind: element.dataset.kind ?? 'text' }));
  const input = inputOf(fields);
  if ('requestId' in form.dataset) {
    // The same ID is sent again until an answer arrives, so a repeat is safe.
    form.dataset.requestId ||= crypto.randomUUID();
    input.request_id = form.dataset.requestId;
  }
  const { path, init } = requestFor(form.dataset.operation, input);
  let answer;
  try {
    const response = await fetch(path, init);
    answer = await response.json();
  } catch {
    // The install did not answer as it should. Nothing is known to have changed.
    show(output, { result: 'unavailable', description: 'The install did not answer.' });
    return;
  }
  if ('requestId' in form.dataset) {
    form.dataset.requestId = '';
  }
  for (const element of form.elements) {
    if (element.type === 'password') {
      element.value = '';
    }
  }
  show(output, answer);
  // Once the person is signed in, the Brief is the next thing to see.
  if (answer.result === 'signed_in' || (answer.result === 'set' && form.querySelector('[name="code"]') !== null)) {
    view.agents = null;
    location.hash = '#/';
  }
}

// ---------------------------------------------------------------------------
// Which view is shown.

async function rerender() {
  const { path, params } = readRoute();
  const views = { brief: path === '/', matter: path.startsWith('/matter/'), search: path === '/search', settings: path === '/settings' };
  if (!Object.values(views).some(Boolean)) {
    location.hash = '#/';
    return;
  }
  for (const [name, shown] of Object.entries(views)) {
    document.querySelector(`[data-view="${name}"]`).hidden = !shown;
  }
  if (views.brief) {
    view.lane = params.get('lane') ?? '';
    view.waiting = params.get('show') === 'waiting';
    await renderBrief();
  } else if (views.matter) {
    await renderMatter(path.slice('/matter/'.length), params);
  } else if (views.search) {
    await renderSearch(params.get('words') ?? '');
  } else {
    const state = document.querySelector('[data-settings-state]');
    state.textContent = params.get('signin') === '1' ? 'Sign in to see the Brief.' : '';
    state.hidden = state.textContent === '';
  }
}

if (typeof document !== 'undefined') {
  for (const form of document.querySelectorAll('[data-view="settings"] form[data-operation]')) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void submit(form);
    });
  }
  document.querySelector('.chips').addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (chip === null) {
      return;
    }
    if (chip.hasAttribute('data-waiting')) {
      location.hash = briefHash(view.lane, !view.waiting);
    } else {
      location.hash = briefHash(chip.dataset.lane, view.waiting);
    }
  });
  document.querySelector('[data-retry]').addEventListener('click', () => void rerender());
  document.querySelector('[data-search]').addEventListener('submit', (event) => {
    event.preventDefault();
    const words = document.getElementById('search-words').value.trim();
    location.hash = `#/search?${new URLSearchParams({ words })}`;
  });
  document.getElementById('more').addEventListener('click', (event) => {
    const choice = event.target.closest('[data-more]');
    if (choice !== null) {
      void chooseMore(choice.dataset.more);
    }
  });
  window.addEventListener('hashchange', () => {
    window.scrollTo(0, 0);
    void rerender();
  });
  void rerender();
}
