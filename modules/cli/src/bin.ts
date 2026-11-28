#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import { run } from './diligent.ts';

// The session file lives in DILIGENT_HOME when that is set. Otherwise it is in
// the PC account's own settings folder.
function homeFolder(): string {
  if (process.env.DILIGENT_HOME !== undefined && process.env.DILIGENT_HOME !== '') {
    return path.resolve(process.env.DILIGENT_HOME);
  }
  if (process.platform === 'win32' && process.env.APPDATA !== undefined) {
    return path.join(process.env.APPDATA, 'diligent');
  }
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), 'diligent');
}

// Lines waiting on standard input when it is not a keyboard, such as a pipe.
let piped: Promise<string[]> | undefined;

async function pipedLines(): Promise<string[]> {
  let text = '';
  for await (const chunk of process.stdin) {
    text += String(chunk);
  }
  return text.split(/\r?\n/);
}

// Asks for one secret. At a keyboard the typing is not shown. From a pipe,
// each secret is one line, in the order they are asked for.
async function ask(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    piped ??= pipedLines();
    return (await piped).shift() ?? '';
  }
  process.stderr.write(question);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  try {
    return await new Promise<string>((resolve, reject) => {
      let typed = '';
      const onData = (chunk: Buffer): void => {
        for (const key of chunk.toString('utf8')) {
          if (key === '\r' || key === '\n') {
            process.stdin.off('data', onData);
            resolve(typed);
            return;
          }
          if (key === '\u0003') {
            process.stdin.off('data', onData);
            reject(new Error('Stopped.'));
            return;
          }
          if (key === '\u007f' || key === '\b') {
            typed = typed.slice(0, -1);
          } else {
            typed += key;
          }
        }
      };
      process.stdin.on('data', onData);
    });
  } finally {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stderr.write('\n');
  }
}

try {
  process.exitCode = await run({
    args: process.argv.slice(2),
    home: homeFolder(),
    ask,
    print: (text) => process.stdout.write(`${text}\n`),
    say: (text) => process.stderr.write(`${text}\n`),
    fetch,
  });
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'Stopped.'}\n`);
  process.exitCode = 1;
}
