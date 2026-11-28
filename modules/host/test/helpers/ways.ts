// The three ways in, as a test uses them. Each one goes through the real
// thing: the screen's own request code, the command line's own program, and a
// real client of the agent protocol.
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { isAnswer } from '../../../../contracts/operation.ts';
import type { Answer } from '../../../../contracts/operation.ts';
import { run } from '../../../cli/src/diligent.ts';
import { AGENT_CONNECTION_PATH } from '../../../mcp/src/address.ts';
import { findOperation } from '../../../operations/src/list.ts';
import { newFolder } from './local-install.ts';
import type { Install } from './local-install.ts';

type Input = Record<string, unknown>;

// What a way in needs from an install: where it is, and how to reach it.
export type Reachable = Pick<Install, 'origin' | 'fetch'>;

export type Way = { call(operation: string, input?: Input): Promise<Answer> };

type ScreenScript = { requestFor(operation: string, input: Input): { path: string; init: RequestInit } };

const screenScript: Promise<ScreenScript> = import(new URL('../../../app/public/app.js', import.meta.url).href);

function withRequestId(operation: string, input: Input): Input {
  return findOperation(operation)?.request_id === true && input.request_id === undefined
    ? { ...input, request_id: crypto.randomUUID() }
    : input;
}

async function answerOf(response: Response): Promise<Answer> {
  const answer: unknown = await response.json();
  if (!isAnswer(answer)) {
    throw new Error(`Not an answer: ${JSON.stringify(answer)}`);
  }
  return answer;
}

export type Screen = Way & {
  // The cookies the browser would hold, by name.
  cookies: Map<string, string>;
  // Each Set-Cookie header the install sent, as sent.
  setCookies: string[];
};

// The screen: the page's own request code, plus what a browser adds by itself
// to a request from the install's own page: its origin and its cookies.
export function screen(install: Reachable): Screen {
  const cookies = new Map<string, string>();
  const setCookies: string[] = [];
  return {
    cookies,
    setCookies,
    async call(operation, input = {}) {
      const { requestFor } = await screenScript;
      const { path, init } = requestFor(operation, withRequestId(operation, input));
      const response = await install.fetch(path, {
        ...init,
        headers: {
          ...(init.headers as Record<string, string>),
          origin: install.origin,
          'sec-fetch-site': 'same-origin',
          ...(cookies.size === 0 ? {} : { cookie: Array.from(cookies, ([name, value]) => `${name}=${value}`).join('; ') }),
        },
      });
      for (const header of response.headers.getSetCookie()) {
        setCookies.push(header);
        const [pair, ...attributes] = header.split(';').map((part) => part.trim());
        const [name, ...value] = (pair ?? '').split('=');
        if (attributes.some((attribute) => attribute.toLowerCase() === 'max-age=0')) {
          cookies.delete(name!);
        } else {
          cookies.set(name!, value.join('='));
        }
      }
      return answerOf(response);
    },
  };
}

export type CommandLine = Way & {
  // The folder that holds this command line's session file.
  home: string;
  // Everything the command line printed, and everything it said itself.
  printed: string[];
  said: string[];
  // Runs the program with these arguments and secrets and returns its exit code.
  run(args: string[], secrets?: string[]): Promise<number>;
};

// The command line: the real program, with its session file in a folder
// inside the test folder. A secret input is asked for, never an argument.
export function commandLine(install: Reachable): CommandLine {
  const home = newFolder('command-line-home');
  const printed: string[] = [];
  const said: string[] = [];
  const way: CommandLine = {
    home,
    printed,
    said,
    async run(args, secrets = []) {
      const waiting = [...secrets];
      return run({
        args,
        home,
        ask: async () => waiting.shift() ?? '',
        print: (text) => void printed.push(text),
        say: (text) => void said.push(text),
        fetch,
      });
    },
    async call(operation, input = {}) {
      const described = findOperation(operation);
      const args = ['--install', install.origin, operation];
      const secrets: string[] = [];
      // Secrets are asked for in the order the operation lists them.
      for (const [name, field] of Object.entries(described?.input ?? {})) {
        if (field.kind === 'text' && field.secret === true && input[name] !== undefined) {
          secrets.push(String(input[name]));
          if (!field.required) {
            args.push(`--${name}`);
          }
        }
      }
      for (const [name, value] of Object.entries(input)) {
        const field = described?.input[name];
        if (!(field?.kind === 'text' && field.secret === true)) {
          args.push(`--${name}`, String(value));
        }
      }
      const before = printed.length;
      const code = await way.run(args, secrets);
      if (code !== 0 || printed.length !== before + 1) {
        throw new Error(`The command line gave no answer: ${said.join(' ')}`);
      }
      const answer: unknown = JSON.parse(printed[before]!);
      if (!isAnswer(answer)) {
        throw new Error(`Not an answer: ${printed[before]}`);
      }
      return answer;
    },
  };
  return way;
}

export type AgentConnection = Way & {
  toolNames(): Promise<string[]>;
  close(): Promise<void>;
};

// The agent connection: a real client of the agent protocol, presenting the
// agent's token on every request.
export async function agentConnection(install: Reachable, token: string): Promise<AgentConnection> {
  const client = new Client({ name: 'test-agent', version: '1' });
  const transport = new StreamableHTTPClientTransport(new URL(AGENT_CONNECTION_PATH, install.origin), {
    authProvider: { token: async () => token },
  });
  await client.connect(transport);
  return {
    async call(operation, input = {}) {
      const result = await client.callTool({ name: operation, arguments: withRequestId(operation, input) });
      if (!isAnswer(result.structuredContent)) {
        throw new Error(`Not an answer: ${JSON.stringify(result)}`);
      }
      return result.structuredContent;
    },
    async toolNames() {
      return (await client.listTools()).tools.map((tool) => tool.name);
    },
    close: () => client.close(),
  };
}

// A plain call to an operation's address, for a caller that is none of the
// three: a stranger, another site's page, or an agent's token sent directly.
export async function post(install: Reachable, operation: string, input: unknown, headers: Record<string, string> = {}): Promise<{ status: number; answer: Answer; response: Response }> {
  const response = await install.fetch(`/api/${operation}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(input),
  });
  return { status: response.status, answer: await answerOf(response), response };
}
