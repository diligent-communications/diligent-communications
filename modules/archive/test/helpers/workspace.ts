// A new temporary folder for one test, removed when the test ends. Every path a
// test uses is inside it, including the settings file.

import { mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';

export type Workspace = {
  root: string;
  settingsFile: string;
  evidence: string;
  backup: string;
};

export async function newWorkspace(t: TestContext): Promise<Workspace> {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'dc-archive-test-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const evidence = path.join(root, 'evidence');
  const backup = path.join(root, 'backup');
  await mkdir(evidence);
  await mkdir(backup);
  return { root, settingsFile: path.join(root, 'local-data', 'archive-settings.json'), evidence, backup };
}

// A folder link: a junction on Windows, which needs no special rights, and a
// symbolic link elsewhere (Node ignores the type argument there).
//
// Both ends must be inside the test's own temporary folder, so the recursive
// clean-up can never reach anything the test did not make. This refuses a
// link to a drive root or to any other folder outside it.
export async function folderLink(w: Workspace, target: string, link: string): Promise<void> {
  for (const end of [target, link]) {
    const relative = path.relative(w.root, path.resolve(end));
    if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`A test link must stay inside its temporary folder: ${end}`);
    }
  }
  await symlink(target, link, 'junction');
}

// Two folder links inside the test's own folder that point at each other, so
// the system cannot follow them to a folder.
export async function linkLoop(w: Workspace, at: string): Promise<void> {
  const other = path.join(w.root, `loop-${path.basename(at)}`);
  await folderLink(w, other, at);
  await folderLink(w, at, other);
}

export async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

// Every file and folder under a folder, with each file's contents and change
// time, so a test can show that nothing changed.
export async function snapshot(folder: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const entry of await readdir(folder, { recursive: true, withFileTypes: true })) {
    const full = path.join(entry.parentPath, entry.name);
    const key = path.relative(folder, full);
    if (entry.isDirectory()) {
      result[key] = 'folder';
    } else {
      const info = await stat(full);
      result[key] = `${info.mtimeMs} ${(await readFile(full)).toString('base64')}`;
    }
  }
  return result;
}
