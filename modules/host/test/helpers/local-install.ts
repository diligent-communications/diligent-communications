// Starts the install on Cloudflare's local runtime for a test.
//
// Safety on the PC that runs the tests:
// - Everything a test writes goes into one temporary folder this file makes
//   under the system temporary folder. Wrangler's own log and registry files,
//   which it would otherwise keep in the home folder, are pointed there too.
// - The clean-up removes that one folder and nothing else. It refuses any
//   path that is not the folder made here.
// - No test reaches the network. Wrangler's usage reports and its look-up of
//   network details are switched off.
import { lstatSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PREFIX = 'diligent-test-';
const SYSTEM_TEMP = realpathSync(os.tmpdir());

// The one folder this test process may write to.
export const testFolder = mkdtempSync(path.join(SYSTEM_TEMP, PREFIX));

export const REPOSITORY = path.resolve(import.meta.dirname, '../../../..');

// These are read when wrangler loads, so they are set before it is imported.
process.env.WRANGLER_LOG_PATH = path.join(testFolder, 'wrangler-logs');
process.env.WRANGLER_REGISTRY_PATH = path.join(testFolder, 'wrangler-registry');
process.env.WRANGLER_SEND_METRICS = 'false';
process.env.CLOUDFLARE_CF_FETCH_ENABLED = 'false';
process.env.DO_NOT_TRACK = '1';

function removeTestFolder(): void {
  try {
    const isOurs =
      path.dirname(testFolder) === SYSTEM_TEMP &&
      path.basename(testFolder).startsWith(PREFIX) &&
      lstatSync(testFolder).isDirectory() &&
      !lstatSync(testFolder).isSymbolicLink();
    if (isOurs) {
      rmSync(testFolder, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  } catch {
    // A folder that cannot be removed is left in the system temporary folder.
  }
}

process.on('exit', removeTestFolder);

// A new empty folder inside the test folder.
export function newFolder(name: string): string {
  return mkdtempSync(path.join(testFolder, `${name}-`));
}

// A made-up secret for one test: a set-up code, a password. Each call makes a
// different one, so a search for it finds only what that test did.
export function madeUp(label: string): string {
  return `${label}-${crypto.randomUUID()}-${crypto.randomUUID()}`;
}

export type Database = {
  prepare(sql: string): {
    bind(...values: unknown[]): { all<Row>(): Promise<{ results: Row[] }>; run(): Promise<unknown> };
    all<Row>(): Promise<{ results: Row[] }>;
    run(): Promise<unknown>;
  };
};

export type Install = {
  // The address the install answers on, such as http://127.0.0.1:50123.
  origin: string;
  setupCode: string;
  fetch(path: string, init?: RequestInit): Promise<Response>;
  // Sends a request as if it had come in on another address, such as an
  // HTTPS one. It never leaves this PC.
  arriveAt(address: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<Response>;
  // Puts a different set-up code in the install, as the person who controls
  // the hosting account would. The database stays as it is.
  changeSetupCode(setupCode: string): Promise<void>;
  // The database itself, for a test to read every row or to move a stored
  // time into the past. Nothing but a test reaches it this way.
  database(): Promise<Database>;
  close(): Promise<void>;
};

// Starts the install from the repository's own settings file, with an empty
// database. The set-up code always comes from the test, never from a local
// secrets file. An empty one means "no set-up code".
export async function startInstall(options: { setupCode?: string } = {}): Promise<Install> {
  const { createTestHarness } = await import('wrangler');
  const setupCode = options.setupCode ?? madeUp('setup-code');
  const settings = (code: string) => ({
    root: REPOSITORY,
    workers: [{ configPath: 'wrangler.jsonc', secrets: { SETUP_CODE: code } }],
  });
  const server = createTestHarness(settings(setupCode));
  const { url } = await server.listen();
  const install: Install = {
    origin: url.origin,
    setupCode,
    fetch: (target, init) => fetch(new URL(target, url), init),
    arriveAt: (address, init) => server.fetch(address, init) as unknown as Promise<Response>,
    async changeSetupCode(code) {
      await server.update(settings(code));
      install.setupCode = code;
    },
    async database() {
      const env = await server.getWorker<{ DB: Database }>().getEnv();
      return env.DB;
    },
    close: () => server.close(),
  };
  return install;
}

// Starts the same install with its database kept as a file in `folder`, the
// way it runs on a PC. `unstable_startWorker` is wrangler's older call for
// this. It is documented but marked deprecated, and the call that replaces it
// for tests, `createTestHarness`, keeps the database in memory only. When a
// later wrangler drops the older call, this helper starts the local runtime
// as a child process with its data folder set, and stops it the same way.
export async function startInstallOnDisk(folder: string, setupCode: string): Promise<Pick<Install, 'origin' | 'setupCode' | 'fetch' | 'close'>> {
  if (!path.resolve(folder).startsWith(testFolder + path.sep)) {
    throw new Error('The database file must be kept inside the test folder.');
  }
  const { unstable_startWorker } = await import('wrangler');
  const worker = await unstable_startWorker({
    config: path.join(REPOSITORY, 'wrangler.jsonc'),
    bindings: { SETUP_CODE: { type: 'secret_text', value: setupCode } },
    dev: { persist: folder, server: { hostname: '127.0.0.1', port: 0 }, logLevel: 'none', watch: false, inspector: false },
  });
  try {
    await worker.ready;
    const url = await worker.url;
    return {
      origin: url.origin,
      setupCode,
      fetch: (target, init) => fetch(new URL(target, url), init),
      close: () => worker.dispose(),
    };
  } catch (error) {
    await worker.dispose();
    throw error;
  }
}
