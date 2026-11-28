// Starts a local install with the made-up Brief, to look at the screen in a
// browser. It is not a test and not part of the program: run it from the
// repository root with
//
//   node modules/app/test/look.ts
//
// It makes a new random password each run and prints it with the address.
// The install answers on this PC's own address only. Its database lives in
// memory and its files in one temporary folder, which is removed when it
// stops. Stop it with Ctrl+C: the install and the runtime it started stop
// with it, and nothing is left running. It also stops by itself after an
// hour, so a forgotten one does not keep running.
import { THIS_PC } from '../../host/src/addresses.ts';
import { madeUp, startInstall } from '../../host/test/helpers/local-install.ts';
import { screen } from '../../host/test/helpers/ways.ts';
import type { Agent } from '../../../contracts/agent.ts';
import { loadMadeUpBrief } from '../../brief/test/helpers/made-up.ts';

const install = await startInstall();
let stopping = false;

async function stop(code: number): Promise<never> {
  if (!stopping) {
    stopping = true;
    try {
      await install.close();
    } finally {
      process.exit(code);
    }
  }
  return new Promise(() => {});
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'] as const) {
  process.on(signal, () => void stop(0));
}
setTimeout(() => void stop(0), 60 * 60_000).unref();

try {
  const address = new URL(install.origin);
  if (!THIS_PC.includes(address.hostname)) {
    throw new Error('The install is not on this PC\'s own address.');
  }
  const password = madeUp('look');
  const person = screen(install);
  await person.call('password_set', { code: install.setupCode, password });
  const made = await person.call('agent_create', { name: 'sorter', level: 'prepare' });
  await loadMadeUpBrief(await install.database(), `agent:${(made.agent as Agent).id}`);
  process.stdout.write(`The made-up Brief is at ${install.origin}/\nSign in with this password, made for this run only:\n${password}\nStop with Ctrl+C.\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'The install did not start.'}\n`);
  await stop(1);
}
