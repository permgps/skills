// The closing publish rewrites `.maestro/PROGRESS.md`, and no other publish does.
//
// Driven through the copied `sync.mts` inside a real temporary project, the way
// relocation.test.ts drives it, because what is under test is what a прогон
// leaves behind: the file the next preflight reads, the commit its header
// names, and a publish that stands even when that file cannot be written.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  CAPTURES, SOURCE_MANIFEST, activeContract6State, asContract10, contract6State, deferredScopeState,
} from '../state/fixtures/verification.ts';
import type { RunState } from '../state/contract.ts';
import { PROGRESS_FILE, parseProgress } from '../memory/progress.ts';

const SYNC = 'skills/maestro/tools/sync.mts';
const PAGE = 'skills/maestro/assets/dashboard.html';
const WIP = '2026-09-29-synthetic-menu--wip';
const LANDED = '2026-09-29-synthetic-menu';

type Outcome = Record<string, unknown> & { code: number; stderr: string };

interface Project {
  root: string;
  maestro: string;
  publish(state: RunState, expect?: string): Outcome;
  git(...args: string[]): string;
  dispose(): Promise<void>;
}

async function project(options: { git: boolean }): Promise<Project> {
  const root = await mkdtemp(path.join(tmpdir(), 'maestro-progress-'));
  const maestro = path.join(root, '.maestro');
  await mkdir(maestro);
  await copyFile(SYNC, path.join(maestro, 'sync.mts'));
  await cp('skills/maestro/tools/runtime', path.join(maestro, 'runtime'), { recursive: true });
  await copyFile(PAGE, path.join(maestro, 'dashboard.html'));
  const git = (...args: string[]): string => {
    const done = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
    if (done.status !== 0) throw new Error(`git ${args.join(' ')}: ${done.stderr}`);
    return done.stdout;
  };
  if (options.git) {
    git('init', '-q');
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'user.name', 'Progress Test');
  }
  return {
    root, maestro, git,
    publish(state, expect) {
      const candidate = path.join(root, 'candidate.json');
      writeFileSync(candidate, JSON.stringify(state));
      const args = [path.join(maestro, 'sync.mts'), '--publish', candidate, '--no-open', ...(expect ? ['--expect', expect] : [])];
      const done = spawnSync(process.execPath, args, { encoding: 'utf8', env: { ...process.env, MAESTRO_SYNC_NO_OPEN: '1' } });
      return { ...JSON.parse(done.stdout.split('\n')[0] || '{}') as Record<string, unknown>, code: done.status ?? -1, stderr: done.stderr };
    },
    async dispose() { await rm(root, { recursive: true, force: true }); },
  };
}

/** The run's files, as preflight and the build would have left them. */
async function seed(maestro: string, folder: string): Promise<void> {
  for (const [relative, body] of Object.entries({ ...CAPTURES, 'manifest.md': SOURCE_MANIFEST })) {
    await mkdir(path.dirname(path.join(maestro, folder, relative)), { recursive: true });
    await writeFile(path.join(maestro, folder, relative), body);
  }
}

/** The contract-10 run with R19 and R20 deferred, while it builds. */
const building = (): RunState => asContract10(activeContract6State(deferredScopeState()));

/** The same run's closing write: a later stamp, the lifecycle closed, the suffix off. */
const closing = (extra: Partial<RunState> = {}): RunState =>
  ({ ...asContract10(contract6State(deferredScopeState())), updatedAt: '2026-09-29T09:30:00Z', ...extra });

const exists = async (file: string): Promise<boolean> => {
  try { await stat(file); return true; } catch { return false; }
};

const progressOf = async (target: Project): Promise<string> => readFile(path.join(target.maestro, PROGRESS_FILE), 'utf8');

test('a closing publish writes the progress file, its header naming the commit HEAD was at', async () => {
  const target = await project({ git: true });
  try {
    await seed(target.maestro, WIP);
    assert.equal(target.publish(building()).code, 0);
    target.git('add', '.');
    target.git('commit', '-q', '-m', 'run opened');
    const head = target.git('rev-parse', 'HEAD').trim();

    const closed = target.publish(closing(), building().updatedAt);
    assert.equal(closed.code, 0, JSON.stringify(closed));
    assert.equal(closed['progress'], 'written');
    const parsed = parseProgress(await progressOf(target));
    assert.deepEqual(parsed.header, { dir: LANDED, closedAt: '2026-09-29T09:20:00Z', outcome: 'completed', commit: head });
    assert.deepEqual(parsed.notDone.map(item => item.key), [`${LANDED}#R19`, `${LANDED}#R20`]);
  } finally { await target.dispose(); }
});

test('a publish that does not close the run leaves the progress file alone', async () => {
  const target = await project({ git: true });
  try {
    await seed(target.maestro, WIP);
    const opened = target.publish(building());
    assert.equal(opened.code, 0, JSON.stringify(opened));
    assert.equal('progress' in opened, false);
    assert.equal(await exists(path.join(target.maestro, PROGRESS_FILE)), false);
  } finally { await target.dispose(); }
});

test('a reopened run that closes again regenerates its own items and lists none twice', async () => {
  const target = await project({ git: true });
  try {
    await seed(target.maestro, WIP);
    assert.equal(target.publish(building()).code, 0);
    assert.equal(target.publish(closing(), building().updatedAt).code, 0);

    const reopened: RunState = { ...closing(), lifecycle: 'active', dir: WIP, updatedAt: '2026-09-29T10:00:00Z' };
    delete reopened.outcome; delete reopened.finishedAt; delete reopened.result;
    const back = target.publish(reopened, closing().updatedAt);
    assert.equal(back.code, 0, JSON.stringify(back));
    assert.equal('progress' in back, false);

    const again = closing({ updatedAt: '2026-09-29T10:30:00Z' });
    again.tasks = [...again.tasks, { ...again.tasks[0]!, id: '02', title: 'Build export', requirementIds: ['R18'], status: 'failed', commits: [] }];
    const reclosed = target.publish(again, reopened.updatedAt);
    assert.equal(reclosed.code, 0, JSON.stringify(reclosed));
    assert.equal(reclosed['progress'], 'written');
    const keys = parseProgress(await progressOf(target)).notDone.map(item => item.key);
    assert.deepEqual(keys, [`${LANDED}#R19`, `${LANDED}#R20`, `${LANDED}#T02`]);
  } finally { await target.dispose(); }
});

test('a run stopped incomplete writes the progress file too', async () => {
  const target = await project({ git: true });
  try {
    await seed(target.maestro, WIP);
    assert.equal(target.publish(building()).code, 0);
    const stopped = target.publish(closing({ outcome: 'stopped_incomplete', stopReason: 'the user stopped the run' }), building().updatedAt);
    assert.equal(stopped.code, 0, JSON.stringify(stopped));
    assert.equal(stopped['progress'], 'written');
    assert.match(await progressOf(target), /outcome stopped_incomplete, at commit none\./);
  } finally { await target.dispose(); }
});

test('a closure outside a git repository records at commit none', async () => {
  const target = await project({ git: false });
  try {
    await seed(target.maestro, WIP);
    assert.equal(target.publish(building()).code, 0);
    const closed = target.publish(closing(), building().updatedAt);
    assert.equal(closed['progress'], 'written');
    assert.equal(parseProgress(await progressOf(target)).header?.commit, null);
  } finally { await target.dispose(); }
});

test('a progress file that cannot be written leaves the publish standing and says failed', async () => {
  const target = await project({ git: false });
  try {
    await seed(target.maestro, WIP);
    assert.equal(target.publish(building()).code, 0);
    await mkdir(path.join(target.maestro, PROGRESS_FILE, 'in-the-way'), { recursive: true });
    const closed = target.publish(closing(), building().updatedAt);
    assert.equal(closed.code, 0, JSON.stringify(closed));
    assert.equal(closed['status'], 'published');
    assert.equal(closed['progress'], 'failed');
    assert.match(closed.stderr, /WARN \[sync\.progress\]/);
    await rm(path.join(target.maestro, PROGRESS_FILE), { recursive: true });
    const retried = target.publish(closing(), closing().updatedAt);
    assert.equal(retried.code, 0, JSON.stringify(retried));
    assert.equal(retried['progress'], 'written');
    assert.equal(parseProgress(await progressOf(target)).header?.dir, LANDED);
  } finally { await target.dispose(); }
});

test('repeating a successful closure keeps its commit and user fixes after HEAD moves', async () => {
  const target = await project({ git: true });
  try {
    await seed(target.maestro, WIP);
    assert.equal(target.publish(building()).code, 0);
    target.git('add', '.');
    target.git('commit', '-q', '-m', 'before closure');
    const head = target.git('rev-parse', 'HEAD').trim();
    assert.equal(target.publish(closing(), building().updatedAt).code, 0);
    const text = (await progressOf(target)).replace(/## Fixes Without Maestro\n/, '## Fixes Without Maestro\n\n- User fixed navigation.\n');
    await writeFile(path.join(target.maestro, PROGRESS_FILE), text);
    target.git('commit', '--allow-empty', '-q', '-m', 'after closure');
    const retried = target.publish(closing(), closing().updatedAt);
    assert.equal(retried.code, 0, JSON.stringify(retried));
    assert.equal(await progressOf(target), text);
    assert.equal(parseProgress(await progressOf(target)).header?.commit, head);
  } finally { await target.dispose(); }
});
