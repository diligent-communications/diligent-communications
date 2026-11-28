// The bare screen. Every button calls one operation and shows what it
// returned, with the screen's own advice beside it. The screen never talks to
// the database and never runs a command: it only calls operations.

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
  set: 'Now sign in with the new password on each device.',
  wrong_code: 'Check the set-up code. A code works once. To set the password again, put a new set-up code in the install first.',
  wrong_password: 'Check the password and try again. Five wrong tries in a row lock the password for a while.',
  locked_out: 'Wait until the time shown, then try again. A device that is already signed in keeps working.',
  signed_out: 'Sign in again to carry on from this device.',
  created: 'Copy the token now and give it to the agent. It is not shown again. A lost token is replaced by making a new agent.',
  name_taken: 'Choose another name.',
  unknown_agent: 'List the agents and copy the ID from there.',
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
}

if (typeof document !== 'undefined') {
  for (const form of document.querySelectorAll('form[data-operation]')) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void submit(form);
    });
  }
}
