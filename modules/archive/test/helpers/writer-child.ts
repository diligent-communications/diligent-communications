// Runs only in a disposable workspace. Stops at real file operations so the
// parent can terminate this process without unwinding the save.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import fsp, { type FileHandle } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { mock } from 'node:test';
import { openArchiveWriter, type ArchiveInfo } from '../../src/archive.ts';

const archive: ArchiveInfo = JSON.parse(process.argv[2]);
const root = await fsp.realpath(process.cwd());
const manifest = path.join(await fsp.realpath(archive.folder), 'manifest.jsonl');
const relative = path.relative(root, manifest);
assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));

async function mark(step: string) {
  const resume = once(process, 'message');
  process.send?.(step);
  await resume;
}

const stop = process.argv[3];
if (stop) {
  const realOpen = fsp.open;
  mock.method(fsp, 'open', async (file: string, flags: string | number) => {
    const handle: FileHandle = await realOpen(file, flags);
    const temporary = path.basename(file).startsWith('.original-');
    const manifestAppend = file === manifest && typeof flags === 'number' &&
      (flags & fsp.constants.O_APPEND) !== 0;
    if (temporary && stop === 'temp-open') await mark(stop);
    const write = handle.writeFile.bind(handle);
    const sync = handle.sync.bind(handle);
    handle.writeFile = async (...args: Parameters<FileHandle['writeFile']>) => {
      if (temporary && stop === 'temp-partial' || manifestAppend && stop === 'entry-partial') {
        assert.ok(Buffer.isBuffer(args[0]));
        await write(args[0].subarray(0, Math.floor(args[0].length / 2)));
        await mark(stop);
        return;
      }
      if (manifestAppend && stop === 'before-entry') await mark(stop);
      await write(...args);
      if (temporary && stop === 'temp-written' || manifestAppend && stop === 'entry-complete') await mark(stop);
    };
    handle.sync = async () => {
      await sync();
      if (temporary && stop === 'temp-flushed' || manifestAppend && stop === 'entry-flushed') await mark(stop);
    };
    return handle;
  });
  const realLink = fsp.link;
  mock.method(fsp, 'link', async (from: string, to: string) => {
    await realLink(from, to);
    if (stop === 'final-name' && path.basename(from).startsWith('.original-')) await mark(stop);
  });
  syncBuiltinESMExports();
}

const opened = await openArchiveWriter(archive);
process.send?.(opened.outcome);
if (opened.outcome === 'writer-opened') {
  const [command] = await once(process, 'message');
  if (command === 'save') {
    const result = await opened.writer.saveOriginal({
      record_version: 1, source_id: 'child-original', source_kind: 'import',
      media_type: 'text/plain', captured_at: '2026-01-01T00:00:00.000Z',
      payload: Buffer.from('sample\r\n'),
    });
    process.send?.(result.outcome);
  }
  await opened.writer.close();
}
process.disconnect?.();
