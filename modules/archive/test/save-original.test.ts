import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import crypto, { createHash } from 'node:crypto';
import { once } from 'node:events';
import fsp, { appendFile, cp, mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import net, { createConnection, createServer } from 'node:net';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
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
  const newer = await writer.saveOriginal({ record_version: 2, envelope: { source_id: 'not quoted' } });
  assert.equal(newer.outcome, 'unknown-record-version');
  assert.ok('message' in newer && newer.message.includes(w.manifest) && !newer.message.includes('not quoted'));
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
    const firstAfterEdit = await writer.saveOriginal(captured('first'));
    assert.equal(firstAfterEdit.outcome, 'manifest-changed', 'even a repeat checks the manifest first');
    const later = await writer.saveOriginal(captured('another'));
    assert.equal(later.outcome, 'writer-stopped');
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
  assert.equal((await writer.saveOriginal(captured('still stopped'))).outcome, 'writer-stopped');
  assert.deepEqual(await readFile(w.manifest), original);
});

test('a missing evidence folder is reported as missing when checking the manifest', async (t) => {
  const w = await archiveFor(t);
  const writer = await writerFor(t, w.archive);
  await fsp.rename(w.evidence, path.join(w.root, 'moved-evidence'));
  const before = await snapshot(w.root);
  assert.deepEqual(await writer.saveOriginal(captured('unattempted record')), {
    outcome: 'evidence-missing', message: `The evidence folder ${w.evidence} cannot be found.`,
  });
  assert.equal((await writer.saveOriginal(null)).outcome, 'writer-stopped');
  assert.deepEqual(await snapshot(w.root), before);
});

const otherEntry = (record_id = 'fixture-decision', file = 'decisions/fixture.json') => ({
  line: 'entry', kind: 'decision', record_id, path: file, record_version: 1,
  size_bytes: 0, sha256: digest(''), archived_at: '2026-01-01T00:00:00Z',
});
const entryText = (entry: object) => JSON.stringify(entry) + '\n';

test('opening for writing names each manifest refusal without changing the file', async (t) => {
  const w = await archiveFor(t);
  const header = await readFile(w.manifest, 'utf8');
  const source = captured('private-incoming-label');
  const original = {
    ...otherEntry(digest(source.source_id), path.relative(w.evidence, originalPath(w.evidence, source.source_id, '.txt')).split(path.sep).join('/')),
    kind: 'original', source_id: source.source_id, source_kind: source.source_kind,
    media_type: source.media_type, captured_at: source.captured_at,
  };
  const decision = otherEntry();
  for (const [reason, lines, expectedLine] of [
    ['unknown-version', header.replace('"manifest_version":1', '"manifest_version":2'), 1],
    ['unknown-version', header + entryText({ line: 'entry', record_version: 2 }), 2],
    ['duplicate-record-id', header + entryText(decision) + entryText({ ...decision, path: 'decisions/other.json' }), 3],
    ['duplicate-path', header + entryText(decision) + entryText({ ...decision, record_id: 'other-decision' }), 3],
    ['duplicate-source-id', header + entryText(original) + entryText(original), 3],
    ['wrong-original-id', header + entryText({ ...original, record_id: 'wrong' }), 2],
    ['wrong-original-path', header + entryText({ ...original, path: 'originals/aa/other.txt' }), 2],
  ] as const) {
    await writeFile(w.manifest, lines);
    const before = await snapshot(w.root);
    const result = await openArchiveWriter(w.archive);
    if (result.outcome === 'writer-opened') await result.writer.close();
    assert.ok(result.outcome === 'bad-manifest', reason);
    assert.equal(result.reason, reason);
    assert.equal(result.line, expectedLine);
    assert.ok(result.message.includes(w.manifest) && !result.message.includes(source.source_id));
    assert.deepEqual(await snapshot(w.root), before);
  }
});

test('opening for writing checks archive identity and reports an unavailable manifest', async (t) => {
  const w = await archiveFor(t);
  const different = await openArchiveWriter({ ...w.archive, archiveId: 'another-archive' });
  if (different.outcome === 'writer-opened') await different.writer.close();
  assert.equal(different.outcome, 'different-archive');
  assert.ok('message' in different && different.message.includes(w.archive.archiveId));
  await unlink(w.manifest);
  const before = await snapshot(w.root);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const missing = await openArchiveWriter(w.archive);
    if (missing.outcome === 'writer-opened') await missing.writer.close();
    assert.equal(missing.outcome, 'manifest-unavailable');
    assert.ok('message' in missing && missing.message.includes(w.manifest));
  }
  assert.deepEqual(await snapshot(w.root), before);
});

test('a used file-name stem is refused even when the entry has a different ending', async (t) => {
  const w = await archiveFor(t);
  const record = captured('name already used');
  const file = path.relative(w.evidence, originalPath(w.evidence, record.source_id, '.json')).split(path.sep).join('/');
  await appendFile(w.manifest, entryText(otherEntry('fixture-entry', file)));
  const writer = await writerFor(t, w.archive);
  const before = await snapshot(w.root);
  const result = await writer.saveOriginal(record);
  assert.equal(result.outcome, 'file-name-in-use');
  assert.ok('message' in result && result.message.includes(digest(record.source_id)));
  assert.doesNotMatch(result.message, /name already used/);
  assert.deepEqual(await snapshot(w.root), before);
});

test('the writer owns a byte copy before the caller can reuse its buffer', async (t) => {
  const w = await archiveFor(t);
  const writer = await writerFor(t, w.archive);
  const record = captured('caller reuses bytes');
  const bytes = Buffer.from(record.payload);
  const saving = writer.saveOriginal(record);
  record.payload.fill(0);
  assert.equal((await saving).outcome, 'saved-original');
  assert.deepEqual(await readFile(originalPath(w.evidence, record.source_id, '.txt')), bytes);
  assert.match(await readFile(w.manifest, 'utf8'), new RegExp(digest(bytes)));
});

async function withFileHandle<T>(
  target: string,
  wantsFlags: (flags: string | number) => boolean,
  change: (handle: fsp.FileHandle) => void | Promise<void>,
  run: () => Promise<T>,
): Promise<T> {
  const original = fsp.open;
  const mocked = mock.method(fsp, 'open', async (file: string, flags: string | number) => {
    const handle = await original(file, flags);
    try {
      if (file === target && wantsFlags(flags)) await change(handle);
      return handle;
    } catch (error) {
      await handle.close();
      throw error;
    }
  });
  syncBuiltinESMExports();
  try {
    return await run();
  } finally {
    mocked.mock.restore();
    syncBuiltinESMExports();
  }
}

const canAppend = (flags: string | number) => typeof flags === 'number' && (flags & fsp.constants.O_APPEND) !== 0;

test('a failed incomplete append stops later saves without touching their records', async (t) => {
  const w = await archiveFor(t);
  const writer = await writerFor(t, w.archive);
  const record = captured('failed earlier append');
  const first = await withFileHandle(w.manifest, canAppend, (handle) => {
    const write = handle.writeFile.bind(handle);
    handle.writeFile = async (data) => {
      assert.ok(Buffer.isBuffer(data));
      await write(data.subarray(0, 30));
      throw Object.assign(new Error('short append'), { code: 'EIO' });
    };
  }, () => writer.saveOriginal(record));
  assert.equal(first.outcome, 'save-unavailable');
  assert.ok('message' in first && first.message.includes(digest(record.source_id)));
  assert.doesNotMatch(first.message, /failed earlier append/);
  const before = await snapshot(w.root);
  const later = await writer.saveOriginal(new Proxy({}, {
    getOwnPropertyDescriptor() { assert.fail('a stopped writer tried to inspect a new record'); },
  }));
  assert.deepEqual(later, {
    outcome: 'writer-stopped', step: 'appending the manifest entry',
    message: `The writer for manifest ${w.manifest} has stopped after an earlier problem while appending the manifest entry.`,
  });
  assert.deepEqual(await snapshot(w.root), before);
});

test('an outside append after a complete entry reports held and stops the writer', async (t) => {
  const w = await archiveFor(t);
  const writer = await writerFor(t, w.archive);
  const record = captured('held before outside append');
  const outside = entryText(otherEntry());
  const result = await withFileHandle(w.manifest, canAppend, (handle) => {
    const sync = handle.sync.bind(handle);
    handle.sync = async () => {
      await sync();
      await appendFile(w.manifest, outside);
    };
  }, () => writer.saveOriginal(record));
  assert.ok(result.outcome === 'saved-original');
  assert.equal(result.recordId, digest(record.source_id));
  assert.match(result.notice ?? '', /changed afterwards and the writer has stopped/);
  const before = await snapshot(w.root);
  const stopped = await writer.saveOriginal(captured('never attempted'));
  assert.ok(stopped.outcome === 'writer-stopped');
  assert.equal(stopped.step, 'checking the appended entry');
  assert.deepEqual(await snapshot(w.root), before);
  const lines = await readFile(w.manifest, 'utf8');
  assert.ok(lines.endsWith(outside));
  await writer.close();
  const restarted = await writerFor(t, w.archive);
  assert.equal((await restarted.saveOriginal(record)).outcome, 'already-held');
});

test('the manifest is rechecked immediately before removing an unfinished tail', async (t) => {
  const w = await archiveFor(t);
  const header = await readFile(w.manifest, 'utf8');
  await appendFile(w.manifest, '{incomplete');
  const writer = await writerFor(t, w.archive);
  const completedFromOutside = header + entryText(otherEntry());
  const record = captured('prevent mistaken trim');
  const result = await withFileHandle(w.manifest, (flags) => flags === fsp.constants.O_RDWR,
    async () => { await writeFile(w.manifest, completedFromOutside); },
    () => writer.saveOriginal(record));
  assert.equal(result.outcome, 'manifest-changed');
  assert.equal(await readFile(w.manifest, 'utf8'), completedFromOutside);
  assert.deepEqual(await readdir(path.join(w.evidence, 'originals')), []);
});

test('program faults during manifest I/O are raised unchanged', async (t) => {
  const w = await archiveFor(t);
  const writer = await writerFor(t, w.archive);
  const open = fsp.open;
  for (const fault of [new Error('program fault'), Object.assign(new TypeError('bad argument'), { code: 'ERR_INVALID_ARG_TYPE' })]) {
    const mocked = mock.method(fsp, 'open', async (file: string, flags: string | number) => {
      if (file === w.manifest) throw fault;
      return open(file, flags);
    });
    syncBuiltinESMExports();
    try {
      await assert.rejects(writer.saveOriginal(captured('fault probe')), (error) => error === fault);
    } finally {
      mocked.mock.restore();
      syncBuiltinESMExports();
    }
  }
});

test('an unsupported endpoint refuses the writing session before the evidence folder is checked', async (t) => {
  const w = await archiveFor(t);
  const before = await snapshot(w.root);
  const platform = mock.method(os, 'platform', () => 'darwin');
  const create = mock.method(net, 'createServer', () => assert.fail('unsupported system tried to open a listener'));
  syncBuiltinESMExports();
  try {
    const result = await openArchiveWriter(w.archive);
    assert.equal(result.outcome, 'lock-unavailable');
    assert.ok('message' in result && result.message.includes(w.archive.archiveId));
    assert.doesNotMatch(result.message, /evidence folder/);
    assert.deepEqual(await snapshot(w.root), before);
  } finally {
    platform.mock.restore();
    create.mock.restore();
    syncBuiltinESMExports();
  }
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
  const header = await readFile(w.manifest);
  let flushed = false;
  const saved = await withFileHandle(file, (flags) => flags === 'r+', (handle) => {
    const sync = handle.sync.bind(handle);
    handle.sync = async () => {
      assert.deepEqual(await readFile(w.manifest), header);
      await sync();
      flushed = true;
    };
  }, () => writer.saveOriginal(record));
  assert.equal(saved.outcome, 'saved-original');
  assert.equal(flushed, true, 'the adopted file was flushed before indexing');
  const after = await stat(file, { bigint: true });
  assert.equal(after.ino, before.ino);
  assert.equal(after.mtimeNs, before.mtimeNs);
  assert.deepEqual(await readFile(file), record.payload);
  assert.deepEqual((await readdir(w.evidence)).filter((name) => name === 'leftovers'), []);
});

test('directory names are flushed before indexing a new original or removing a kept leftover name', {
  skip: process.platform === 'win32' ? 'Windows has no directory flush step' : false,
}, async (t) => {
  const w = await archiveFor(t);
  const record = captured('directory flush order');
  const originals = path.join(w.evidence, 'originals');
  const final = originalPath(w.evidence, record.source_id, '.txt');
  const shard = path.dirname(final);
  const kept = path.join(w.evidence, 'leftovers');
  await mkdir(shard);
  await writeFile(final, 'different original');
  const writer = await writerFor(t, w.archive);
  const labels = new Map([[w.evidence, 'evidence'], [originals, 'originals'], [shard, 'shard'], [kept, 'leftovers']]);
  const steps: string[] = [];
  const open = fsp.open;
  const observedOpen = mock.method(fsp, 'open', async (file: string, flags: string | number) => {
    const handle = await open(file, flags);
    const label = labels.get(file);
    if (label && flags === 'r') {
      const sync = handle.sync.bind(handle);
      handle.sync = async () => { await sync(); steps.push(label); };
    } else if (file === w.manifest && canAppend(flags)) {
      const write = handle.writeFile.bind(handle);
      handle.writeFile = async (...args) => { steps.push('append'); await write(...args); };
    }
    return handle;
  });
  const remove = fsp.unlink;
  const observedUnlink = mock.method(fsp, 'unlink', async (file: string) => {
    if (file === final) steps.push('old name removed');
    return remove(file);
  });
  syncBuiltinESMExports();
  try {
    assert.equal((await writer.saveOriginal(record)).outcome, 'saved-original');
    assert.deepEqual(steps, ['originals', 'evidence', 'leftovers', 'old name removed', 'shard', 'shard', 'append']);
  } finally {
    observedOpen.mock.restore();
    observedUnlink.mock.restore();
    syncBuiltinESMExports();
  }
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
    disconnect() { child.disconnect(); },
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

test('the writer child exits and releases its lock when the parent IPC closes', async (t) => {
  const w = await archiveFor(t);
  const child = writerChild(w.root, w.archive);
  try {
    assert.equal(await child.first(), 'writer-opened');
    const exited = Promise.race([
      child.exit,
      new Promise<never>((_, reject) => {
        const timer = setTimeout(() => reject(new Error('writer did not exit when IPC closed')), 1500);
        timer.unref();
      }),
    ]);
    child.disconnect();
    assert.deepEqual(await exited, [0, null]);
    await writerFor(t, w.archive);
  } finally {
    await child.kill();
  }
});

test('another writer is refused after a completed save until the writing session closes', async (t) => {
  const w = await archiveFor(t);
  const writer = await writerFor(t, w.archive);
  assert.equal((await writer.saveOriginal(captured('first completed'))).outcome, 'saved-original');
  const child = writerChild(w.root, w.archive);
  try {
    assert.equal(await child.first(), 'archive-in-use');
    assert.deepEqual(await child.exit, [0, null]);
  } finally {
    await child.kill();
  }
  await writer.close();
  await writerFor(t, w.archive);
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
  assert.ok('message' in competing && competing.message.includes(w.archive.archiveId));
  assert.ok(!competing.message.includes(copy) && !competing.message.includes(w.evidence));
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
    // Drain the saves even if the close-order assertion failed.
    await Promise.allSettled([first, second, writer.close()]);
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

for (const step of ['before-tail-trim', 'after-tail-trim'] as const) {
  test(`killing a real writer at ${step} preserves every complete line and allows retry`, async (t) => {
    const w = await archiveFor(t);
    const header = await readFile(w.manifest, 'utf8');
    const complete = header + entryText(otherEntry());
    const partial = '{unfinished';
    await writeFile(w.manifest, complete + partial);
    const child = writerChild(w.root, w.archive, step);
    try {
      assert.equal(await child.first(), 'writer-opened');
      assert.equal(await child.command('save'), step);
      assert.deepEqual(await child.kill(), [null, 'SIGKILL']);
    } finally {
      await child.kill();
    }
    assert.equal(await readFile(w.manifest, 'utf8'), step === 'before-tail-trim' ? complete + partial : complete);
    assert.deepEqual(await readdir(path.join(w.evidence, 'originals')), []);
    const retry = await writerFor(t, w.archive);
    assert.equal((await retry.saveOriginal(captured('child-original'))).outcome, 'saved-original');
    assert.ok((await readFile(w.manifest, 'utf8')).startsWith(complete + '{"line":"entry"'));
  });
}

test('killing a real writer after linking a leftover preserves the old bytes and allows retry', async (t) => {
  const w = await archiveFor(t);
  const file = originalPath(w.evidence, 'child-original', '.txt');
  const kept = path.join(w.evidence, 'leftovers', path.basename(file));
  const earlier = Buffer.from('earlier bytes');
  const header = await readFile(w.manifest);
  await mkdir(path.dirname(file));
  await writeFile(file, earlier);
  const child = writerChild(w.root, w.archive, 'leftover-linked');
  try {
    assert.equal(await child.first(), 'writer-opened');
    assert.equal(await child.command('save'), 'leftover-linked');
    assert.deepEqual(await child.kill(), [null, 'SIGKILL']);
  } finally {
    await child.kill();
  }
  assert.deepEqual(await readFile(file), earlier);
  assert.deepEqual(await readFile(kept), earlier);
  assert.deepEqual(await readFile(w.manifest), header);
  const retry = await writerFor(t, w.archive);
  const record = captured('child-original');
  assert.equal((await retry.saveOriginal(record)).outcome, 'saved-original');
  assert.deepEqual(await readFile(kept), earlier);
  assert.deepEqual(await readFile(file), record.payload);
});
