import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { LINK_LIMITS } from '../../../contracts/link.ts';
import { MATTER_LIMITS } from '../../../contracts/matter.ts';
import { REPOSITORY } from '../../host/test/helpers/local-install.ts';
import { linkWrite } from '../../links/src/links.ts';
import { newMatterWrites } from '../src/brief.ts';
import { startBriefInstall } from './helpers/brief-install.ts';
import type { BriefInstall } from './helpers/brief-install.ts';
import { madeUpBrief } from './helpers/made-up.ts';

let it: BriefInstall;

before(async () => {
  it = await startBriefInstall();
});

after(async () => {
  await it?.close();
});

// One made-up matter and one of its message links, as the made-up Brief makes them.
function sample() {
  const made = madeUpBrief('diligent', new Date());
  const [matterInsert] = made.writes.filter((write) => write.sql.startsWith('INSERT INTO brief_matters'));
  const [linkInsert] = made.writes.filter((write) => write.sql.startsWith('INSERT INTO links') && write.values[1] === 'message');
  return { matterInsert: matterInsert!, linkInsert: linkInsert! };
}

test('a summary over 1,200 characters or a quote over 300 is refused before it is written', () => {
  const now = new Date();
  const matter = {
    id: 'm1',
    version: 1,
    kind: 'do',
    lane: 'work',
    title: 'A made-up matter',
    next_action: '',
    owed_by: 'you',
    summary: 'a'.repeat(MATTER_LIMITS.summary),
    latest_update: '',
    timing: '',
    state: 'open',
    snoozed_until: null,
    main_action: 'none',
    notes: '',
    due: null,
    set_by_you: [],
  } as const;
  assert.equal(newMatterWrites({ ...matter, set_by_you: [] }, 'diligent', now).length, 2);
  assert.throws(() => newMatterWrites({ ...matter, set_by_you: [], summary: 'a'.repeat(MATTER_LIMITS.summary + 1) }, 'diligent', now), TypeError);

  const link = {
    id: 'l1',
    kind: 'message',
    matter: 'm1',
    message: 's1',
    person: null,
    state: 'active',
    made_by: 'diligent',
    made_at: now.toISOString(),
    accepted_by: null,
    accepted_at: null,
    removed_by: null,
    removed_at: null,
    quote: 'a'.repeat(LINK_LIMITS.quote),
    sender: 'A made-up sender',
    sent_at: now.toISOString(),
  } as const;
  assert.equal(linkWrite(link).sql.startsWith('INSERT INTO links'), true);
  assert.throws(() => linkWrite({ ...link, quote: 'a'.repeat(LINK_LIMITS.quote + 1) }), TypeError);
});

test('the tables themselves refuse a summary over 1,200 characters or a quote over 300, whoever writes it', async () => {
  const database = await it.install.database();
  const { matterInsert, linkInsert } = sample();
  // Where the summary and the quote sit among the values each insert binds.
  const summary = 7;
  const quote = 12;

  const tooLong = [...matterInsert.values];
  tooLong[summary] = 'a'.repeat(MATTER_LIMITS.summary + 1);
  await assert.rejects(database.prepare(matterInsert.sql).bind(...tooLong).run(), /CHECK constraint failed/);
  const atLimit = [...matterInsert.values];
  atLimit[summary] = 'a'.repeat(MATTER_LIMITS.summary);
  await database.prepare(matterInsert.sql).bind(...atLimit).run();

  const longQuote = [...linkInsert.values];
  longQuote[quote] = 'a'.repeat(LINK_LIMITS.quote + 1);
  await assert.rejects(database.prepare(linkInsert.sql).bind(...longQuote).run(), /CHECK constraint failed/);
  const quoteAtLimit = [...linkInsert.values];
  quoteAtLimit[quote] = 'a'.repeat(LINK_LIMITS.quote);
  await database.prepare(linkInsert.sql).bind(...quoteAtLimit).run();
});

test('no program code imports from a test folder, so the made-up Brief cannot reach a real install', async () => {
  const folders = (await readdir(path.join(REPOSITORY, 'modules'))).map((name) => path.join(REPOSITORY, 'modules', name, 'src'));
  folders.push(path.join(REPOSITORY, 'contracts'));
  let files = 0;
  for (const folder of folders) {
    let names: string[];
    try {
      names = await readdir(folder, { recursive: true });
    } catch {
      continue;
    }
    for (const name of names.filter((file) => file.endsWith('.ts') && !file.startsWith('test'))) {
      const source = await readFile(path.join(folder, name), 'utf8');
      files += 1;
      for (const [, target] of source.matchAll(/(?:from|import)\s*\(?\s*'([^']+)'/g)) {
        assert.equal(/(^|\/)test(\/|$)/.test(target!), false, `${path.relative(REPOSITORY, path.join(folder, name))} imports ${target}`);
      }
    }
  }
  assert.ok(files > 20);
  // The screen's own files hold no made-up matter either.
  const script = await readFile(path.join(REPOSITORY, 'modules', 'app', 'public', 'app.js'), 'utf8');
  assert.equal(script.includes('Pellworth'), false);
});
