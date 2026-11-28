import { Server } from '@modelcontextprotocol/server';
import { createMcpHandler } from 'agents/mcp/server';
import type { Answer } from '../../../contracts/operation.ts';
import { AGENT_CONNECTION_PATH } from './address.ts';
import { toolList } from './tools.ts';

// Answers one request on the agent connection. The agent protocol itself is
// the platform's maintained handler. This part only lists the operations as
// tools and passes each call to the door through `run`.
export function answerAgent(
  request: Request,
  env: unknown,
  ctx: ExecutionContext,
  run: (name: string, input: unknown) => Promise<Answer>,
): Promise<Response> {
  const handler = createMcpHandler(
    () => {
      const server = new Server({ name: 'diligent', version: '1' }, { capabilities: { tools: {} } });
      server.setRequestHandler('tools/list', () => ({ tools: toolList() }));
      server.setRequestHandler('tools/call', async (call) => {
        const answer = await run(call.params.name, call.params.arguments ?? {});
        // A named result is an answer, not a protocol error.
        return server.projectCallToolResult({ content: [{ type: 'text', text: JSON.stringify(answer) }], structuredContent: answer }, undefined);
      });
      return server;
    },
    // No page on another site has a reason to call the agent connection.
    { route: AGENT_CONNECTION_PATH, corsOptions: false },
  );
  return handler(request, env, ctx);
}
