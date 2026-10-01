// The run directory moves with its lifecycle, through publication and nothing else.
//
// Driven through the copied `sync.mts` inside a real temporary project, because
// what is under test is what a прогон's orchestrator sees: an exit code, one
// JSON line, the folder where the state says it is, and — when the folder is
// tracked — a rename git recorded rather than a deletion and an addition.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  CAPTURES, SOURCE_MANIFEST, activeContract6State, activeContract7State, contract6State, contract7State,
} from '../state/fixtures/verification.ts';
import type { RunState } from '../state/contract.ts';

const SYNC = 'skills/maestro/tools/sync.mts';
const PAGE = 'skills/maestro/assets/dashboard.html';
const WIP = '2026-09-29-synthetic-menu--wip';
const LANDED = '2026-09-29-synthetic-menu';

interface Project {
  root: string;
  maestro: string;
  publish(state: RunState, expect?: string): Record<string, unknown> & { code: number };
  validate(state: RunState): Record<string, unknown> & { code: number };
  git(...args: string[]): string;
  dispose(): Promise<void>;
}

const isDirectory = async (file: string): Promise<boolean> => {
  try { return (await stat(file)).isDirectory(); } catch { return false; }
};

async function project(options: { git: boolean }): Promise<Project> {
  const root = await mkdtemp(path.join(tmpdir(), 'maestro-relocation-'));
  const maestro = path.join(root, '.maestro');
  await mkdir(maestro);
  await copyFile(SYNC, path.join(maestro, 'sync.mts'));
  await cp('skills/maestro/tools/runtime', path.join(maestro, 'runtime'), { recursive: true });
  await copyFile(PAGE, path.join(maestro, 'dashboard.html'));
  const pids = new Set<number>();
  const git = (...args: string[]): string => {
    const done = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
    if (done.status !== 0) throw new Error(`git ${args.join(' ')}: ${done.stderr}`);
    return done.stdout;
  };
  if (options.git) {
    git('init', '-q');
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'user.name', 'Relocation Test');
  }
  const action = (verb: string, state: RunState, expect?: string): Record<string, unknown> & { code: number } => {
    const candidate = path.join(root, 'candidate.json');
    writeFileSync(candidate, JSON.stringify(state));
    const args = [path.join(maestro, 'sync.mts'), verb, candidate, '--no-open', ...(expect ? ['--expect', expect] : [])];
    const done = spawnSync(process.execPath, args, { encoding: 'utf8', env: { ...process.env, MAESTRO_SYNC_NO_OPEN: '1' } });
    try {
      const serve = JSON.parse(readFileSync(path.join(maestro, 'serve.json'), 'utf8')) as { pid: number };
      pids.add(serve.pid);
    } catch { /* no server was raised */ }
    return { code: done.status ?? -1, ...JSON.parse(done.stdout.split('\n')[0] || '{}') as Record<string, unknown> };
  };
  return {
    root, maestro, git,
    publish: (state, expect) => action('--publish', state, expect),
    validate: state => action('--validate', state),
    async dispose() {
      for (const pid of pids) { try { process.kill(pid, 'SIGTERM'); } catch { /* gone */ } }
      await rm(root, { recursive: true, force: true });
    },
  };
}

/** The run's files, as preflight and the build would have left them. */
async function seed(maestro: string, folder: string): Promise<void> {
  for (const [relative, body] of Object.entries({ ...CAPTURES, 'manifest.md': SOURCE_MANIFEST })) {
    await mkdir(path.dirname(path.join(maestro, folder, relative)), { recursive: true });
    await writeFile(path.join(maestro, folder, relative), body);
  }
}

/** The closing write of the same run: a later stamp, the lifecycle closed, the suffix off. */
function closing(): RunState {
  return { ...contract7State(), updatedAt: '2026-09-29T09:30:00Z' };
}

test('closing a run moves its folder off --wip with git mv, and git records a rename', async () => {
  const target = await project({ git: true });
  try {
    await seed(target.maestro, WIP);
    const opened = target.publish(activeContract7State());
    assert.equal(opened.code, 0, JSON.stringify(opened));
    target.git('add', '.maestro');
    target.git('commit', '-q', '-m', 'run opened');

    const closed = target.publish(closing(), activeContract7State().updatedAt);
    assert.equal(closed.code, 0, JSON.stringify(closed));
    assert.deepEqual(closed['relocated'], { from: WIP, to: LANDED, method: 'git' });
    assert.equal(await isDirectory(path.join(target.maestro, WIP)), false);
    assert.equal(await isDirectory(path.join(target.maestro, LANDED)), true);
    assert.match(target.git('status', '--porcelain'), new RegExp(`R  \\.maestro/${WIP}/manifest\\.md -> \\.maestro/${LANDED}/manifest\\.md`));
    assert.match(await readFile(path.join(target.maestro, 'state.js'), 'utf8'), new RegExp(`"dir":\\s*"${LANDED}"`));
  } finally { await target.dispose(); }
});

test('an untracked run folder is moved without git', async () => {
  const target = await project({ git: false });
  try {
    await seed(target.maestro, WIP);
    assert.equal(target.publish(activeContract7State()).code, 0);
    const closed = target.publish(closing(), activeContract7State().updatedAt);
    assert.equal(closed.code, 0, JSON.stringify(closed));
    assert.deepEqual(closed['relocated'], { from: WIP, to: LANDED, method: 'rename' });
    assert.equal(await isDirectory(path.join(target.maestro, LANDED)), true);
  } finally { await target.dispose(); }
});

test('reopening a closed run moves the folder back and its register row returns to in progress', async () => {
  const target = await project({ git: false });
  try {
    await seed(target.maestro, WIP);
    target.publish(activeContract7State());
    target.publish(closing(), activeContract7State().updatedAt);
    let register = await readFile(path.join(target.maestro, 'README.md'), 'utf8');
    assert.match(register, new RegExp(`\\[${LANDED}\\]\\(${LANDED}/\\) \\| completed \\| 2026-09-29`));

    // An explicit reopening keeps every published record and only opens the lifecycle again.
    const reopened: RunState = { ...closing(), lifecycle: 'active', dir: WIP, updatedAt: '2026-09-29T10:00:00Z' };
    delete reopened.outcome; delete reopened.finishedAt;
    const result = target.publish(reopened, closing().updatedAt);
    assert.equal(result.code, 0, JSON.stringify(result));
    assert.deepEqual(result['relocated'], { from: LANDED, to: WIP, method: 'rename' });
    register = await readFile(path.join(target.maestro, 'README.md'), 'utf8');
    assert.match(register, new RegExp(`\\[${WIP}\\]\\(${WIP}/\\) \\| in progress \\| —`));
    assert.equal(register.split('\n').filter(line => line.includes('<!-- run:')).length, 1);
  } finally { await target.dispose(); }
});

test('a relocation whose target exists is refused and nothing moves', async () => {
  const target = await project({ git: false });
  try {
    await seed(target.maestro, WIP);
    target.publish(activeContract7State());
    await mkdir(path.join(target.maestro, LANDED));
    const before = await readFile(path.join(target.maestro, 'state.js'), 'utf8');
    const refused = target.publish(closing(), activeContract7State().updatedAt);
    assert.equal(refused.code, 1, JSON.stringify(refused));
    assert.match(JSON.stringify(refused['violations']), /already exists/);
    assert.equal(await isDirectory(path.join(target.maestro, WIP)), true);
    assert.equal(await readFile(path.join(target.maestro, 'state.js'), 'utf8'), before);
  } finally { await target.dispose(); }
});

test('a candidate that fails evidence validation after the move is rolled back to the old name', async () => {
  const target = await project({ git: false });
  try {
    await seed(target.maestro, WIP);
    target.publish(activeContract7State());
    const tampered = closing();
    tampered.verification!.evidence[0]!.sha256 = '0'.repeat(64);
    const refused = target.publish(tampered, activeContract7State().updatedAt);
    assert.equal(refused.code, 1, JSON.stringify(refused));
    assert.equal(await isDirectory(path.join(target.maestro, WIP)), true);
    assert.equal(await isDirectory(path.join(target.maestro, LANDED)), false);
    const register = await readFile(path.join(target.maestro, 'README.md'), 'utf8');
    assert.match(register, /\| in progress \|/);
  } finally { await target.dispose(); }
});

test('--validate never moves a folder, and names the relocation a publish would make', async () => {
  const target = await project({ git: false });
  try {
    await seed(target.maestro, WIP);
    target.publish(activeContract7State());
    const checked = target.validate(closing());
    assert.equal(checked.code, 0, JSON.stringify(checked));
    assert.deepEqual(checked['relocationPending'], { from: WIP, to: LANDED });
    assert.equal(await isDirectory(path.join(target.maestro, WIP)), true);
    assert.equal(await isDirectory(path.join(target.maestro, LANDED)), false);
  } finally { await target.dispose(); }
});

test('a contract-6 publish never relocates and writes no register', async () => {
  const target = await project({ git: false });
  try {
    await seed(target.maestro, 'synthetic-menu');
    assert.equal(target.publish(activeContract6State()).code, 0);
    const closed = target.publish({ ...contract6State(), updatedAt: '2026-09-29T09:30:00Z' }, activeContract6State().updatedAt);
    assert.equal(closed.code, 0, JSON.stringify(closed));
    assert.equal(closed['relocated'], undefined);
    assert.equal(closed['register'], undefined);
    assert.equal(await isDirectory(path.join(target.maestro, 'synthetic-menu')), true);
    await assert.rejects(() => readFile(path.join(target.maestro, 'README.md'), 'utf8'));
  } finally { await target.dispose(); }
});
