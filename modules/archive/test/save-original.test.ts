import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import crypto, { createHash } from 'node:crypto';
import { once } from 'node:events';
import fsp, { appendFile, cp, mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import net, { createConnection, createServer } from 'node:net';
import { syncBuiltinESMExports } from 'node:module';
import { mock, test } from 'node:test';
import type { TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { openArchive, openArchiveWriter, setFolders } from '../src/archive.ts';
import type { ArchiveInfo } from '../src/archive.ts';
import { exists, folderLink, newWorkspace, snapshot } from './helpers/workspace.ts';

const captured = (source_id: string, media_type = 'text/plain', payload = Buffer.from('sample\r\n')) => ({
  record_version: 1,
  source_id,
  source_kind: 'import',
  media_type,
  payload,
  captured_at: '2026-01-01T01:02:03.000Z',
});
const digest = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');

async function archiveFor(t: TestContext) {
  const w = await newWorkspace(t);
  const set = await setFolders(w.settingsFile, { evidenceFolder: w.evidence, backupFolder: w.backup });
  assert.equal(set.outcome, 'saved');
  const opened = await openArchive(w.settingsFile);
  assert.ok(opened.outcome === 'opened');
  return { ...w, archive: opened.archive, manifest: path.join(w.evidence, 'manifest.jsonl') };
}

async function writerFor(t: TestContext, archive: ArchiveInfo) {
  const result = await openArchiveWriter(archive);
  assert.ok(result.outcome === 'writer-opened', JSON.stringify(result));
  t.after(() => result.writer.close());
  return result.writer;
}

function originalPath(folder: string, id: string, extension: string) {
  const name = digest(digest(id));
  return path.join(folder, 'originals', name.slice(0, 2), name + extension);
}

test('original fixtures are byte-exact, use media endings and are appended to the manifest', async (t) => {
  const w = await archiveFor(t);
  const writer = await writerFor(t, w.archive);
  let prefix = await readFile(w.manifest);
  for (const [fixture, type, extension] of [
    ['message.eml', 'message/rfc822', '.eml'],
    ['lines.txt', 'text/plain', '.txt'],
    ['data.json', 'application/json', '.json'],
    ['unusual.bin', 'application/octet-stream', '.bin'],
  ]) {
    const bytes = await readFile(new URL(`./fixtures/${fixture}`, import.meta.url));
    const record = captured(fixture, type, bytes);
    const saved = await writer.saveOriginal(record);
    assert.ok(saved.outcome === 'saved-original', JSON.stringify(saved));
    assert.equal(saved.recordId, digest(fixture));
    const file = originalPath(w.evidence, fixture, extension);
    assert.ok(await exists(file), `expected the original with the ${extension} ending`);
    assert.deepEqual(await readFile(file), bytes);
    const manifest = await readFile(w.manifest);
    assert.deepEqual(manifest.subarray(0, prefix.length), prefix);
    const tail = manifest.subarray(prefix.length).toString('utf8');
    assert.ok(tail.endsWith('\n') && tail.indexOf('\n') === tail.length - 1);
    const item = JSON.parse(tail);
    assert.deepEqual(item, {
      line: 'entry', kind: 'original', record_id: saved.recordId, record_version: 1,
      path: path.relative(w.evidence, file).split(path.sep).join('/'), size_bytes: bytes.length,
      sha256: digest(bytes), archived_at: item.archived_at,
      source_id: fixture, source_kind: record.source_kind, media_type: type, captured_at: record.captured_at,
    });
    assert.match(item.archived_at, /Z$/);
    prefix = manifest;
  }
});

test('invalid or newer records write nothing, including an unfinished manifest tail', async (t) => {
  const w = await archiveFor(t);
  await appendFile(w.manifest, '{"line":');
  const writer = await writerFor(t, w.archive);
  const before = await snapshot(w.root);
  const record = captured('message');
  for (const invalid of [
    { ...record, source_id: '' }, { ...record, unexpected: true },
    { ...record, payload: undefined }, { ...record, captured_at: 'today' },
    { ...record, media_type: undefined }, { ...record, source_kind: 'unknown' }, { payload: record.payload },
  ]) {
    assert.equal((await writer.saveOriginal(invalid)).outcome, 'invalid-record');
  }
  assert.equal((await writer.saveOriginal({ ...record, record_version: 2 })).outcome, 'unknown-record-version');
  assert.deepEqual(await snapshot(w.root), before);
});

test('source IDs are exact and filesystem names contain only a hash and the media ending', async (t) => {
  const w = await archiveFor(t);
  const writer = await writerFor(t, w.archive);
  for (const id of ['../../CON', 'NUL', 'ABC', 'abc', 'abc ', 'café', 'cafe\u0301', '🚧'.repeat(2048)]) {
    assert.equal((await writer.saveOriginal(captured(id))).outcome, 'saved-original', id);
    const file = originalPath(w.evidence, id, '.txt');
    assert.ok(await exists(file), 'expected a file at the path derived from the exact source ID');
    assert.deepEqual(await readFile(file), captured(id).payload);
  }
  assert.equal((await readFile(w.manifest, 'utf8')).trimEnd().split('\n').length, 9);
});

test('a held source ID returns the first record ID and compares bytes without writing after reopen', async (t) => {
  const w = await archiveFor(t);
  let writer = await writerFor(t, w.archive);
  const original = captured('repeat');
  assert.equal((await writer.saveOriginal(original)).outcome, 'saved-original');
  await writer.close();
  await appendFile(w.manifest, '{"unfinished":');
  writer = await writerFor(t, w.archive);
  const before = await snapshot(w.root);
  for (const payload of [original.payload, Buffer.from('changed')]) {
    const result = await writer.saveOriginal({ ...original, payload, media_type: 'application/json', source_kind: 'mail' });
    assert.ok(result.outcome === 'already-held');
    assert.equal(result.recordId, digest(original.source_id));
    assert.equal(result.bytesDiffer, payload !== original.payload);
  }
  assert.deepEqual(await snapshot(w.root), before);
});

test('a complete bad line blocks opening and preserves the entire manifest', async (t) => {
  const w = await archiveFor(t);
  for (const bad of [Buffer.from('not JSON\n'), Buffer.from('{}\n'), Buffer.from([0xff, 0x0a]), Buffer.from('\n')]) {
    const header = (await readFile(w.manifest)).subarray(0, (await readFile(w.manifest)).indexOf(10) + 1);
    await writeFile(w.manifest, Buffer.concat([header, bad, Buffer.from('{unfinished')]));
    const before = await snapshot(w.root);
    const result = await openArchiveWriter(w.archive);
    if (result.outcome === 'writer-opened') await result.writer.close();
    assert.ok(result.outcome === 'bad-manifest');
    assert.equal(result.line, 2);
    assert.deepEqual(await snapshot(w.root), before);
  }
});

test('opening leaves a partial line alone and saving trims only that unfinished tail', async (t) => {
  const w = await archiveFor(t);
  const header = await readFile(w.manifest);
  const unfinished = Buffer.from([0x7b, 0xf0, 0xff]);
  await appendFile(w.manifest, unfinished);
  const writer = await writerFor(t, w.archive);
  assert.deepEqual(await readFile(w.manifest), Buffer.concat([header, unfinished]));
  assert.equal((await writer.saveOriginal(captured('recover'))).outcome, 'saved-original');
  const manifest = await readFile(w.manifest);
  assert.deepEqual(manifest.subarray(0, header.length), header);
  assert.equal(JSON.parse(manifest.subarray(header.length).toString()).source_id, 'recover');
});

test('a manifest changed between two saves stops the writer for either size or last-line change', async (t) => {
  for (const edit of [
    (text: string) => `${text}{partial`,
    (text: string) => text.replace('"source_id":"first"', '"source_id":"other"'),
  ]) {
    const w = await archiveFor(t);
    const writer = await writerFor(t, w.archive);
    assert.equal((await writer.saveOriginal(captured('first'))).outcome, 'saved-original');
    await writeFile(w.manifest, edit(await readFile(w.manifest, 'utf8')));
    const before = await snapshot(w.root);
    assert.equal((await writer.saveOriginal(captured('next'))).outcome, 'manifest-changed');
    assert.equal((await writer.saveOriginal(captured('another'))).outcome, 'manifest-changed');
    assert.deepEqual(await snapshot(w.root), before);
  }
});

test('a manifest that disappears during an open write session is never recreated', async (t) => {
  const w = await archiveFor(t);
  const writer = await writerFor(t, w.archive);
  const original = await readFile(w.manifest);
  await unlink(w.manifest);
  assert.equal((await writer.saveOriginal(captured('missing manifest'))).outcome, 'manifest-changed');
  assert.equal(await exists(w.manifest), false);
  await writeFile(w.manifest, original);
  assert.equal((await writer.saveOriginal(captured('still stopped'))).outcome, 'manifest-changed');
  assert.deepEqual(await readFile(w.manifest), original);
});

test('the manifest is checked again after the original is placed and before appending', async (t) => {
  const w = await archiveFor(t);
  const writer = await writerFor(t, w.archive);
  const original = await readFile(w.manifest);
  const edit = Buffer.from('{an external edit');
  const record = captured('interleaved');
  const final = originalPath(w.evidence, record.source_id, '.txt');
  const originalLink = fsp.link;
  const mocked = mock.method(fsp, 'link', async (from: string, to: string) => {
    await originalLink(from, to);
    if (to === final) await appendFile(w.manifest, edit);
  });
  syncBuiltinESMExports();
  try {
    assert.equal((await writer.saveOriginal(record)).outcome, 'manifest-changed');
    assert.deepEqual(await readFile(w.manifest), Buffer.concat([original, edit]));
    assert.deepEqual(await readFile(final), record.payload);
  } finally {
    mocked.mock.restore();
    syncBuiltinESMExports();
  }
});

test('the final move cannot replace a file that appears during placement', async (t) => {
  const w = await archiveFor(t);
  const writer = await writerFor(t, w.archive);
  const original = await readFile(w.manifest);
  const record = captured('a name appears');
  const final = originalPath(w.evidence, record.source_id, '.txt');
  const open = fsp.open;
  const mocked = mock.method(fsp, 'open', async (file: string, flags: string | number) => {
    const handle = await open(file, flags);
    if (path.dirname(file) === path.dirname(final) && path.basename(file).startsWith('.original-')) {
      await writeFile(final, 'already here', { flag: 'wx' });
    }
    return handle;
  });
  syncBuiltinESMExports();
  try {
    assert.equal((await writer.saveOriginal(record)).outcome, 'save-unavailable');
    assert.deepEqual(await readFile(w.manifest), original);
    assert.equal(await readFile(final, 'utf8'), 'already here');
    assert.deepEqual(await readdir(path.dirname(final)), [path.basename(final)]);
  } finally {
    mocked.mock.restore();
    syncBuiltinESMExports();
  }
});

test('opening the temporary file is exclusive and keeps an existing file intact', async (t) => {
  const w = await archiveFor(t);
  const writer = await writerFor(t, w.archive);
  const record = captured('temporary clash');
  const final = originalPath(w.evidence, record.source_id, '.txt');
  const nonce = '7887554a-7ea6-476a-afcd-6d9dc43d9d0d';
  const existing = path.join(path.dirname(final), `.original-${nonce}.tmp`);
  await mkdir(path.dirname(final));
  await writeFile(existing, 'existing temporary bytes');
  const before = await snapshot(w.root);
  const mocked = mock.method(crypto, 'randomUUID', () => nonce);
  syncBuiltinESMExports();
  try {
    assert.equal((await writer.saveOriginal(record)).outcome, 'save-unavailable');
    assert.deepEqual(await snapshot(w.root), before);
  } finally {
    mocked.mock.restore();
    syncBuiltinESMExports();
  }
});

test('a lock error other than contention refuses all writing and does not disclose the endpoint', async (t) => {
  const w = await archiveFor(t);
  const before = await snapshot(w.root);
  const create = net.createServer;
  const mocked = mock.method(net, 'createServer', () => {
    const server = create();
    mock.method(server, 'listen', () => {
      queueMicrotask(() => server.emit('error', Object.assign(new Error('a private endpoint'), { code: 'EACCES' })));
      return server;
    });
    return server;
  });
  syncBuiltinESMExports();
  try {
    const result = await openArchiveWriter(w.archive);
    assert.ok(result.outcome === 'lock-unavailable');
    assert.match(result.message, /EACCES/);
    assert.doesNotMatch(result.message, /a private endpoint/);
    assert.deepEqual(await snapshot(w.root), before);
  } finally {
    mocked.mock.restore();
    syncBuiltinESMExports();
  }
});

test('opening waits for the listener to be ready before it starts reading the manifest', async (t) => {
  const w = await archiveFor(t);
  const create = net.createServer;
  const delayed = Promise.withResolvers<() => void>();
  const mocked = mock.method(net, 'createServer', (...args: Parameters<typeof create>) => {
    const server = Reflect.apply(create, net, args) as ReturnType<typeof create>;
    const listen = server.listen.bind(server);
    mock.method(server, 'listen', (...options: unknown[]) => {
      delayed.resolve(() => Reflect.apply(listen, server, options));
      return server;
    });
    return server;
  });
  const open = fsp.open;
  let openedManifest = false;
  const reads = mock.method(fsp, 'open', async (file: string, flags: string | number) => {
    if (file === w.manifest) openedManifest = true;
    return open(file, flags);
  });
  syncBuiltinESMExports();
  const pending = openArchiveWriter(w.archive);
  let finish: (() => void) | undefined;
  try {
    finish = await delayed.promise;
    // Let other file-system work finish while the listener is still held back.
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(openedManifest, false);
  } finally {
    finish?.();
    const outcome = await pending;
    if (outcome.outcome === 'writer-opened') await outcome.writer.close();
    mocked.mock.restore();
    reads.mock.restore();
    syncBuiltinESMExports();
  }
  assert.equal(openedManifest, true);
});

test('a complete entry remains held when its flush reports an error', async (t) => {
  const w = await archiveFor(t);
  const writer = await writerFor(t, w.archive);
  const record = captured('flush error');
  const open = fsp.open;
  const mocked = mock.method(fsp, 'open', async (file: string, flags: string | number) => {
    const handle = await open(file, flags);
    if (file === w.manifest && typeof flags === 'number' && (flags & fsp.constants.O_APPEND) !== 0) {
      handle.sync = async () => { throw Object.assign(new Error('synthetic write error'), { code: 'EIO' }); };
    }
    return handle;
  });
  syncBuiltinESMExports();
  try {
    const result = await writer.saveOriginal(record);
    assert.ok(result.outcome === 'saved-original');
    assert.match(result.notice ?? '', /flushing the manifest \(EIO\)/);
    assert.equal((await writer.saveOriginal(record)).outcome, 'already-held');
    assert.equal((await readFile(w.manifest, 'utf8')).trimEnd().split('\n').length, 2);
  } finally {
    mocked.mock.restore();
    syncBuiltinESMExports();
  }
});

test('when a held original cannot be read, the repeat reports only that and writes nothing', async (t) => {
  const w = await archiveFor(t);
  const writer = await writerFor(t, w.archive);
  const record = captured('unreadable original');
  const saved = await writer.saveOriginal(record);
  assert.ok(saved.outcome === 'saved-original');
  await unlink(originalPath(w.evidence, record.source_id, '.txt'));
  const before = await snapshot(w.root);
  const result = await writer.saveOriginal(record);
  assert.ok(result.outcome === 'already-held');
  assert.equal(result.recordId, saved.recordId);
  assert.equal(result.bytesDiffer, null);
  assert.match(result.message, /could not be read for comparison/);
  assert.deepEqual(await snapshot(w.root), before);
});

test('an identical leftover with the exact file name is adopted without replacing it', async (t) => {
  const w = await archiveFor(t);
  const record = captured('leftover');
  const file = originalPath(w.evidence, record.source_id, '.txt');
  await mkdir(path.dirname(file));
  await writeFile(file, record.payload);
  const before = await stat(file, { bigint: true });
  const writer = await writerFor(t, w.archive);
  assert.equal((await writer.saveOriginal(record)).outcome, 'saved-original');
  const after = await stat(file, { bigint: true });
  assert.equal(after.ino, before.ino);
  assert.equal(after.mtimeNs, before.mtimeNs);
  assert.deepEqual(await readFile(file), record.payload);
  assert.deepEqual((await readdir(w.evidence)).filter((name) => name === 'leftovers'), []);
});

test('an exact matching leftover can be adopted while other endings with the same hash are kept', async (t) => {
  const w = await archiveFor(t);
  const record = captured('adopt one');
  const wanted = originalPath(w.evidence, record.source_id, '.txt');
  const other = originalPath(w.evidence, record.source_id, '.json');
  await mkdir(path.dirname(wanted));
  await writeFile(wanted, record.payload);
  await writeFile(other, record.payload);
  const before = await stat(wanted, { bigint: true });
  const writer = await writerFor(t, w.archive);
  assert.equal((await writer.saveOriginal(record)).outcome, 'saved-original');
  assert.equal((await stat(wanted, { bigint: true })).ino, before.ino);
  assert.equal(await exists(other), false);
  assert.deepEqual(await readFile(path.join(w.evidence, 'leftovers', path.basename(other))), record.payload);
});

test('every differing leftover is kept, including identical bytes with a different ending and an occupied leftovers name', async (t) => {
  const w = await archiveFor(t);
  const record = captured('multiple');
  const file = originalPath(w.evidence, record.source_id, '.txt');
  const variants = [
    [file, Buffer.from('changed!')],
    [originalPath(w.evidence, record.source_id, '.eml'), record.payload],
    [originalPath(w.evidence, record.source_id, '.bin'), Buffer.from([0, 255])],
  ] as const;
  const kept = path.join(w.evidence, 'leftovers');
  await mkdir(path.dirname(file));
  await mkdir(kept);
  await writeFile(path.join(kept, path.basename(file)), 'occupied');
  for (const [candidate, bytes] of variants) await writeFile(candidate, bytes);
  const writer = await writerFor(t, w.archive);
  assert.equal((await writer.saveOriginal(record)).outcome, 'saved-original');
  assert.ok(await exists(file), 'the current media type has its own file');
  assert.deepEqual(await readFile(file), record.payload);
  assert.deepEqual(await readdir(path.dirname(file)), [path.basename(file)]);
  assert.equal(await readFile(path.join(kept, path.basename(file)), 'utf8'), 'occupied');
  const actual = await Promise.all((await readdir(kept)).map((name) => readFile(path.join(kept, name), 'hex')));
  assert.deepEqual(actual.sort(), [Buffer.from('occupied'), ...variants.map(([, bytes]) => bytes)].map((bytes) => bytes.toString('hex')).sort());
});

function writerChild(root: string, archive: ArchiveInfo, stop?: string) {
  const script = fileURLToPath(new URL('./helpers/writer-child.ts', import.meta.url));
  const child = fork(script, [JSON.stringify(archive), ...(stop ? [stop] : [])], { cwd: root, execArgv: [] });
  const exit = once(child, 'exit');
  void exit.catch(() => undefined);
  return {
    first: () => message(),
    command: (command: string) => {
      const response = message();
      child.send(command);
      return response;
    },
    async kill() {
      if (child.exitCode === null && child.signalCode === null) assert.ok(child.kill('SIGKILL'));
      return exit;
    },
    exit,
  };

  function message() {
    return Promise.race([
      once(child, 'message', { signal: AbortSignal.timeout(8_000) }).then(([value]) => value),
      exit.then(([code, signal]) => { throw new Error(`Writer exited without replying (${code ?? signal})`); }),
    ]);
  }
}

test('two real processes contend even before saving and the lock releases immediately after a kill', async (t) => {
  const w = await archiveFor(t);
  const alias = path.join(w.root, 'evidence-alias');
  await folderLink(w, w.evidence, alias);
  const before = await snapshot(w.evidence);
  const first = writerChild(w.root, w.archive);
  try {
    assert.equal(await first.first(), 'writer-opened');
    const second = writerChild(w.root, { ...w.archive, folder: alias });
    try {
      assert.equal(await second.first(), 'archive-in-use');
      assert.deepEqual(await second.exit, [0, null]);
    } finally {
      await second.kill();
    }
    assert.deepEqual(await snapshot(w.evidence), before);
    const name = 'diligent-archive-' + digest(w.archive.archiveId);
    const endpoint = process.platform === 'win32' ? '\\\\?\\pipe\\' + name : '\0' + name;
    const competingListener = createServer();
    try {
      const bound = new Promise<void>((resolve, reject) => {
        competingListener.once('error', reject);
        competingListener.listen(endpoint, resolve);
      });
      await assert.rejects(bound, { code: 'EADDRINUSE' });
    } finally {
      if (competingListener.listening) await new Promise<void>((resolve) => competingListener.close(() => resolve()));
    }
    const socket = createConnection(endpoint);
    try {
      let received = 0;
      socket.on('data', (bytes: Buffer) => { received += bytes.length; });
      await once(socket, 'close', { signal: AbortSignal.timeout(8_000) });
      assert.equal(received, 0);
    } finally {
      socket.destroy();
    }
    assert.deepEqual(await first.kill(), [null, 'SIGKILL']);
    const next = writerChild(w.root, w.archive);
    try {
      assert.equal(await next.first(), 'writer-opened');
      assert.equal(await next.command('save'), 'saved-original');
      assert.deepEqual(await next.exit, [0, null]);
    } finally {
      await next.kill();
    }
    assert.deepEqual(await readdir(w.backup), []);
  } finally {
    await first.kill();
  }
});

test('physical copies with the same archive ID share the lock, and closing waits for queued saves', async (t) => {
  const w = await archiveFor(t);
  const copy = path.join(w.root, 'copied-evidence');
  await cp(w.evidence, copy, { recursive: true });
  const writer = await writerFor(t, w.archive);
  const other = { ...w.archive, folder: copy };
  const competing = await openArchiveWriter(other);
  if (competing.outcome === 'writer-opened') await competing.writer.close();
  assert.equal(competing.outcome, 'archive-in-use');
  const started = Promise.withResolvers<void>();
  const finish = Promise.withResolvers<void>();
  const realOpen = fsp.open;
  const mocked = mock.method(fsp, 'open', async (file: string, flags: string | number) => {
    const handle = await realOpen(file, flags);
    if (path.basename(file).startsWith('.original-')) {
      started.resolve();
      await finish.promise;
    }
    return handle;
  });
  syncBuiltinESMExports();
  const first = writer.saveOriginal(captured('queued first'));
  const second = writer.saveOriginal(captured('queued second'));
  try {
    await started.promise;
    void writer.close();
    const duringClose = await openArchiveWriter(other);
    if (duringClose.outcome === 'writer-opened') await duringClose.writer.close();
    assert.equal(duringClose.outcome, 'archive-in-use');
  } finally {
    finish.resolve();
    await writer.close();
    mocked.mock.restore();
    syncBuiltinESMExports();
  }
  assert.equal((await first).outcome, 'saved-original');
  assert.equal((await second).outcome, 'saved-original');
  assert.equal((await writer.saveOriginal(captured('closed'))).outcome, 'writer-closed');
  assert.equal((await readFile(w.manifest, 'utf8')).trimEnd().split('\n').length, 3);
  const copyWriter = await writerFor(t, other);
  assert.equal((await copyWriter.saveOriginal(captured('on the copy'))).outcome, 'saved-original');
});

for (const [step, finalExists, held] of [
  ['temp-open', false, false],
  ['temp-partial', false, false],
  ['temp-written', false, false],
  ['temp-flushed', false, false],
  ['final-name', true, false],
  ['before-entry', true, false],
  ['entry-partial', true, false],
  ['entry-complete', true, true],
  ['entry-flushed', true, true],
] as const) {
  test(`killing a real writer at ${step} leaves a recoverable archive`, async (t) => {
    const w = await archiveFor(t);
    const record = captured('child-original');
    const final = originalPath(w.evidence, record.source_id, '.txt');
    const before = await readFile(w.manifest);
    const child = writerChild(w.root, w.archive, step);
    try {
      assert.equal(await child.first(), 'writer-opened');
      assert.equal(await child.command('save'), step);
      assert.deepEqual(await child.kill(), [null, 'SIGKILL']);
    } finally {
      await child.kill();
    }
    assert.equal(await exists(final), finalExists);
    if (finalExists) assert.deepEqual(await readFile(final), record.payload);
    const stopped = await readFile(w.manifest);
    assert.deepEqual(stopped.subarray(0, before.length), before);
    const tail = stopped.subarray(before.length);
    if (step === 'entry-partial') {
      assert.ok(tail.length > 0 && !tail.includes(10));
    } else if (held) {
      assert.equal(JSON.parse(tail.toString()).source_id, record.source_id);
      assert.equal(tail.at(-1), 10);
    } else {
      assert.equal(tail.length, 0);
    }
    const restarted = await writerFor(t, w.archive);
    assert.equal((await restarted.saveOriginal(record)).outcome, held ? 'already-held' : 'saved-original');
    const manifest = await readFile(w.manifest);
    assert.equal(manifest.toString().trimEnd().split('\n').length, 2);
    assert.deepEqual(await readFile(final), record.payload);
    if (held) assert.deepEqual(manifest, stopped);
  });
}
