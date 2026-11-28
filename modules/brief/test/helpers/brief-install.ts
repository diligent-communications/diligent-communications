// A test install with a made-up Brief loaded, the person signed in on the
// screen and at the command line, and one agent at each level connected.
import assert from 'node:assert/strict';
import type { ActivityEntry } from '../../../../contracts/activity.ts';
import type { Agent } from '../../../../contracts/agent.ts';
import { madeUp, startInstall } from '../../../host/test/helpers/local-install.ts';
import type { Install } from '../../../host/test/helpers/local-install.ts';
import { agentConnection, commandLine, post, screen } from '../../../host/test/helpers/ways.ts';
import type { AgentConnection, CommandLine, Screen } from '../../../host/test/helpers/ways.ts';
import { loadMadeUpBrief } from './made-up.ts';
import type { MadeUpBrief } from './made-up.ts';

export type BriefInstall = {
  install: Install;
  onScreen: Screen;
  atCommandLine: CommandLine;
  reader: AgentConnection;
  preparer: AgentConnection;
  readerAgent: Agent;
  preparerAgent: Agent;
  brief: MadeUpBrief;
  activity(): Promise<ActivityEntry[]>;
  close(): Promise<void>;
};

export async function startBriefInstall(): Promise<BriefInstall> {
  const install = await startInstall();
  const password = madeUp('password');
  const onScreen = screen(install);
  const atCommandLine = commandLine(install);
  assert.equal((await onScreen.call('password_set', { code: install.setupCode, password })).result, 'set');
  assert.equal((await onScreen.call('sign_in', { password })).result, 'signed_in');
  assert.equal((await atCommandLine.call('sign_in', { password })).result, 'signed_in');
  const madeReader = await onScreen.call('agent_create', { name: 'reader', level: 'read' });
  const madePreparer = await onScreen.call('agent_create', { name: 'sorter', level: 'prepare' });
  const readerAgent = madeReader.agent as Agent;
  const preparerAgent = madePreparer.agent as Agent;
  // The install's tables are made by its first request, which has been made.
  const brief = await loadMadeUpBrief(await install.database(), `agent:${preparerAgent.id}`);
  const reader = await agentConnection(install, String(madeReader.token));
  const preparer = await agentConnection(install, String(madePreparer.token), 'newer');
  // A plain call, to be sure the made-up rows are read by the install.
  assert.equal((await post(install, 'brief_list', {}, { authorization: `Bearer ${String(madeReader.token)}` })).answer.result, 'brief');
  return {
    install,
    onScreen,
    atCommandLine,
    reader,
    preparer,
    readerAgent,
    preparerAgent,
    brief,
    async activity() {
      return (await onScreen.call('activity_list', { limit: 200 })).entries as ActivityEntry[];
    },
    async close() {
      await reader.close();
      await preparer.close();
      await install.close();
    },
  };
}
