import { accessTables, openAccess } from '../../access/src/access.ts';
import { AGENT_CONNECTION_PATH } from '../../mcp/src/address.ts';
import { answerAgent } from '../../mcp/src/connection.ts';
import { toolsCalledIn } from '../../mcp/src/tools.ts';
import { openDoor, operationsTables, refusal } from '../../operations/src/door.ts';
import type { Ran } from '../../operations/src/door.ts';
import { storeTables, storeWork } from '../../store/src/activity.ts';
import { openStore } from '../../store/src/store.ts';
import type { Answer } from '../../../contracts/operation.ts';
import { OPERATION_PATH, SESSION_COOKIE, THIS_PC } from './addresses.ts';
import { BODY_LIMIT, readBody } from './body.ts';

// The session cookie outlives the session's own idle limit, which access
// keeps. 400 days is the longest a browser keeps a cookie.
const COOKIE_SECONDS = 400 * 86_400;

const TOO_LARGE = `The body must be at most ${BODY_LIMIT.toLocaleString('en-US')} bytes.`;

function json(status: number, answer: Answer, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(answer), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

function bearer(request: Request): string | null {
  const match = /^Bearer ([^\s]+)$/.exec(request.headers.get('authorization') ?? '');
  return match?.[1] ?? null;
}

function sessionCookie(request: Request): string | null {
  for (const pair of (request.headers.get('cookie') ?? '').split(';')) {
    const [name, ...value] = pair.trim().split('=');
    if (name === SESSION_COOKIE) {
      return value.join('=');
    }
  }
  return null;
}

// The cookie that begins or ends a session on the calling device. It is
// hidden from page scripts, never sent with a request another site started,
// and sent only over HTTPS except on the PC's own address.
function cookieHeader(session: NonNullable<Ran['session']>, url: URL): string {
  const value = 'begin' in session ? session.begin : '';
  const age = 'begin' in session ? COOKIE_SECONDS : 0;
  const secure = THIS_PC.includes(url.hostname) ? '' : '; Secure';
  return `${SESSION_COOKIE}=${value}; Path=/; Max-Age=${age}; HttpOnly; SameSite=Strict${secure}`;
}

// A browser says where a request started. A request another site started is
// refused before anything else looks at it. A caller that is not a browser,
// such as the command line or an agent, sends neither header.
function fromAnotherSite(request: Request, url: URL): boolean {
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  return (origin !== null && origin !== url.origin) || (site !== null && site !== 'same-origin' && site !== 'none');
}

async function readInput(request: Request): Promise<unknown> {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return undefined;
  }
  const text = await readBody(request);
  if (text === null) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function answer(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const isAgentConnection = url.pathname === AGENT_CONNECTION_PATH;
  if (!isAgentConnection && !url.pathname.startsWith(OPERATION_PATH)) {
    return new Response('Not found.\n', { status: 404 });
  }
  if (fromAnotherSite(request, url)) {
    return json(403, refusal('not_allowed', 'The request came from another site.'));
  }

  const store = await openStore(env.DB, [storeTables, operationsTables, accessTables]);
  const access = openAccess({ store, setupCode: env.SETUP_CODE });
  const door = openDoor({ store, work: { ...access.work, ...storeWork(store) } });

  if (isAgentConnection) {
    // The agent connection accepts agent sign-ins only, and a request without
    // one is refused before the protocol handler reads it.
    const { caller, seen } = await access.identify({ session: null, token: bearer(request) });
    if (caller.kind !== 'agent') {
      return json(401, refusal('not_signed_in', 'The agent connection needs an agent sign-in on every request.'), {
        'www-authenticate': 'Bearer',
      });
    }
    // The body is read here, once, up to the one size limit, for every agent.
    // So a call a working agent could make is a call the host can read.
    const body = request.method === 'POST' ? await readBody(request) : '';
    // Every request from an agent that is switched off is refused too, the
    // handshake and the tool list included. An agent is often switched off
    // because its token may have leaked, so nothing that token sends reaches
    // the handler. The host reads the tool calls the request makes, and the
    // door refuses them as it refuses the same calls on the operation
    // address: each one that would change something leaves one line.
    if (!caller.on) {
      return json(403, await door.refuseSwitchedOff(caller, body === null ? [] : toolsCalledIn(body), seen));
    }
    if (body === null) {
      return json(400, refusal('invalid_input', TOO_LARGE));
    }
    // The handler is handed the body that was read, and nothing longer.
    let read = request;
    if (request.method === 'POST') {
      const headers = new Headers(request.headers);
      headers.delete('content-length');
      headers.delete('transfer-encoding');
      read = new Request(request.url, { method: 'POST', headers, body });
    }
    return answerAgent(read, env, ctx, async (name, input) => (await door.run(caller, name, input, seen)).answer);
  }

  // Every operation is a POST to its own address, a read included, so no
  // operation can be called by following a link.
  if (request.method !== 'POST') {
    return json(405, refusal('invalid_input', 'An operation is called with POST.'), { allow: 'POST' });
  }
  const input = await readInput(request);
  if (input === undefined) {
    return json(400, refusal('invalid_input', `The input must be JSON, sent as application/json. ${TOO_LARGE}`));
  }
  const { caller, seen } = await access.identify({ session: sessionCookie(request), token: bearer(request) });
  const ran = await door.run(caller, url.pathname.slice(OPERATION_PATH.length), input, seen);
  return json(200, ran.answer, ran.session === undefined ? {} : { 'set-cookie': cookieHeader(ran.session, url) });
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    try {
      return await answer(request, env, ctx);
    } catch {
      // The failure is not logged or returned: it could hold what was sent.
      return json(503, refusal('unavailable'));
    }
  },
} satisfies ExportedHandler<Env>;
