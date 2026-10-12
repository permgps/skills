// `sync.mts --commits-check`: on resume, which recorded commits `HEAD` lost.
//
// Driven through the copied `sync.mts` inside a real temporary project, the way
// progress-sync.test.ts drives it, over a real repository whose commits carry
// the real trailers. Each test is one row of the "what the check reports" table
// in the plan "A Resumed Прогон Checks Its Commits Are Still There": a reset, a
// rebase, a checkout, a missing object, a git that cannot answer. The check is
// read-only, so every test also holds `state.js` byte for byte.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { CAPTURES, SOURCE_MANIFEST, activeContract10State } from '../state/fixtures/verification.ts';
import type { RunState } from '../state/contract.ts';

const SYNC = 'skills/maestro/tools/sync.mts';
const PAGE = 'skills/maestro/assets/dashboard.html';
const WIP = '2026-09-29-synthetic-menu--wip';
const RUN = '2026-09-29-synthetic-menu';
const HOLDER = 'session-resume';

const hasGit = spawnSync('git', ['--version']).status === 0;
const needsGit = { skip: hasGit ? false : 'git is not on PATH' };

type Outcome = Record<string, unknown> & { code: number; stderr: string };

interface LostCommit { sha: string; state: string; rewritten?: string; branches?: string[] }
interface LostTask { taskId: string; status: string; commits: LostCommit[] }

interface Project {
  root: string;
  maestro: string;
  git(...args: string[]): string;
  /** A таск commit as Разработка makes it: `<id> <title>`, then both trailers. */
  taskCommit(id: string, title: string, run?: string): string;
  publish(state: RunState, expect?: string): Outcome;
  check(env?: NodeJS.ProcessEnv): Outcome;
  stateText(): Promise<string>;
  dispose(): Promise<void>;
}

async function project(options: { git: boolean } = { git: true }): Promise<Project> {
  const root = await mkdtemp(path.join(tmpdir(), 'maestro-commits-check-'));
  const maestro = path.join(root, '.maestro');
  await mkdir(maestro);
  await copyFile(SYNC, path.join(maestro, 'sync.mts'));
  await cp('skills/maestro/tools/runtime', path.join(maestro, 'runtime'), { recursive: true });
  await copyFile(PAGE, path.join(maestro, 'dashboard.html'));
  for (const [relative, body] of Object.entries({ ...CAPTURES, 'manifest.md': SOURCE_MANIFEST })) {
    await mkdir(path.dirname(path.join(maestro, WIP, relative)), { recursive: true });
    await writeFile(path.join(maestro, WIP, relative), body);
  }
  let tick = 0;
  const git = (...args: string[]): string => {
    // Distinct dates, so "newest first" never ties.
    const date = `2026-09-29T10:${String(tick++).padStart(2, '0')}:00Z`;
    const done = spawnSync('git', ['-C', root, ...args], {
      encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    });
    if (done.status !== 0) throw new Error(`git ${args.join(' ')}: ${done.stderr}`);
    return done.stdout;
  };
  if (options.git) {
    git('init', '-q');
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'user.name', 'Commits Check Test');
    // The run directory is not the code: a reset must not take state.js back with it.
    appendFileSync(path.join(root, '.git', 'info', 'exclude'), '.maestro/\ncandidate.json\n');
  }
  const run = (args: string[], env: NodeJS.ProcessEnv = process.env): Outcome => {
    const done = spawnSync(process.execPath, [path.join(maestro, 'sync.mts'), ...args],
      { encoding: 'utf8', env: { ...env, MAESTRO_SYNC_NO_OPEN: '1' } });
    return { ...JSON.parse(done.stdout.split('\n')[0] || '{}') as Record<string, unknown>, code: done.status ?? -1, stderr: done.stderr };
  };
  return {
    root, maestro, git,
    taskCommit(id, title, runDir = RUN) {
      const file = path.join(root, 'src', `${id}-${tick}.ts`);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, `export const task = '${id}';\n`);
      git('add', '-A');
      git('commit', '-q', '-m', `${id} ${title}`, '-m', `Maestro-Run: ${runDir}\nRequirements: R01`);
      return git('rev-parse', 'HEAD').trim();
    },
    publish(state, expect) {
      const candidate = path.join(root, 'candidate.json');
      writeFileSync(candidate, JSON.stringify(state));
      return run(['--publish', candidate, '--no-open', '--holder', HOLDER, ...(expect ? ['--expect', expect] : [])]);
    },
    check(env) { return run(['--commits-check'], env); },
    stateText() { return readFile(path.join(maestro, 'state.js'), 'utf8'); },
    async dispose() {
      // A publish starts the viewer; stop it, so the suite leaves no listener behind.
      try {
        const { pid } = JSON.parse(await readFile(path.join(maestro, 'serve.json'), 'utf8')) as { pid?: number };
        if (typeof pid === 'number') process.kill(pid, 'SIGTERM');
      } catch { /* no viewer was started */ }
      await rm(root, { recursive: true, force: true });
    },
  };
}

/** The active contract-10 run, held, with each таск's commits as given and a second таск when asked for. */
function building(commits: string[], second?: { commits: string[]; status?: RunState['tasks'][number]['status'] }): RunState {
  const state = activeContract10State();
  state.heldBy = { token: HOLDER, since: state.startedAt };
  state.tasks[0] = { ...state.tasks[0]!, commits };
  if (second) {
    state.tasks.push({
      ...state.tasks[0]!, id: '02', title: 'Implement footer', status: second.status ?? 'done',
      files: ['src/footer.js'], commits: second.commits,
    });
  }
  return state;
}

/** Publish, call the check, and hold state.js unchanged across the call. */
async function checked(target: Project, state: RunState, env?: NodeJS.ProcessEnv): Promise<Outcome> {
  const published = target.publish(state);
  assert.equal(published.code, 0, JSON.stringify(published));
  const before = await target.stateText();
  const outcome = target.check(env);
  assert.equal(await target.stateText(), before, 'the check must never write state.js');
  return outcome;
}

const lostOf = (outcome: Outcome): LostTask[] => outcome['lost'] as LostTask[];

test('with every recorded commit on HEAD\'s history nothing is lost, and the exit is 0', needsGit, async () => {
  const target = await project();
  try {
    const sha = target.taskCommit('01', 'Implement menu');
    target.taskCommit('99', 'later work');
    const outcome = await checked(target, building([sha]));
    assert.equal(outcome.code, 0, outcome.stderr);
    assert.deepEqual({ result: outcome['result'], run: outcome['run'], checked: outcome['checked'], lost: outcome['lost'] },
      { result: 'checked', run: RUN, checked: 1, lost: [] });
    assert.equal(outcome['head'], target.git('rev-parse', 'HEAD').trim());
    assert.equal('onBranch' in outcome, false);
  } finally { await target.dispose(); }
});

test('a hard reset below a таск commit reports it not-ancestor on no branch, and the exit is 1', needsGit, async () => {
  const target = await project();
  try {
    const base = target.taskCommit('00', 'base');
    const sha = target.taskCommit('01', 'Implement menu');
    target.git('reset', '-q', '--hard', base);
    const outcome = await checked(target, building([base, sha]));
    assert.equal(outcome.code, 1, outcome.stderr);
    assert.equal(outcome['checked'], 2);
    assert.deepEqual(lostOf(outcome), [{ taskId: '01', status: 'done', commits: [{ sha, state: 'not-ancestor', branches: [] }] }]);
    assert.equal('onBranch' in outcome, false);
  } finally { await target.dispose(); }
});

test('a rebase that rewrote a таск commit names its twin, found by subject and run trailer', needsGit, async () => {
  const target = await project();
  try {
    const root = target.taskCommit('00', 'base');
    const sha = target.taskCommit('01', 'Implement menu');
    const branch = target.git('symbolic-ref', '--short', 'HEAD').trim();
    target.git('checkout', '-q', '--detach', root);
    target.git('commit', '-q', '--amend', '-m', '00 base, reworded');
    const reworded = target.git('rev-parse', 'HEAD').trim();
    target.git('rebase', '-q', '--onto', reworded, root, branch);
    const twin = target.git('rev-parse', 'HEAD').trim();
    const outcome = await checked(target, building([sha]));
    assert.equal(outcome.code, 1, outcome.stderr);
    assert.deepEqual(lostOf(outcome), [{ taskId: '01', status: 'done', commits: [{ sha, state: 'not-ancestor', rewritten: twin, branches: [] }] }]);
  } finally { await target.dispose(); }
});

test('a checkout that left every lost commit on one branch names that branch as onBranch', needsGit, async () => {
  const target = await project();
  try {
    const base = target.taskCommit('00', 'base');
    const branch = target.git('symbolic-ref', '--short', 'HEAD').trim();
    const sha = target.taskCommit('01', 'Implement menu');
    target.git('checkout', '-q', '-b', 'elsewhere', base);
    const outcome = await checked(target, building([sha]));
    assert.equal(outcome.code, 1, outcome.stderr);
    assert.deepEqual(lostOf(outcome)[0]!.commits, [{ sha, state: 'not-ancestor', branches: [branch] }]);
    assert.equal(outcome['onBranch'], branch);
  } finally { await target.dispose(); }
});

test('lost commits split across two branches name no single branch', needsGit, async () => {
  const target = await project();
  try {
    const base = target.taskCommit('00', 'base');
    target.git('checkout', '-q', '-b', 'left');
    const first = target.taskCommit('01', 'Implement menu');
    target.git('checkout', '-q', '-b', 'right', base);
    const second = target.taskCommit('02', 'Implement footer');
    target.git('checkout', '-q', '-b', 'third', base);
    const outcome = await checked(target, building([first], { commits: [second] }));
    assert.equal(outcome.code, 1, outcome.stderr);
    assert.deepEqual(lostOf(outcome).map(task => [task.taskId, task.commits[0]!.branches]), [['01', ['left']], ['02', ['right']]]);
    assert.equal('onBranch' in outcome, false);
  } finally { await target.dispose(); }
});

test('a recorded sha that never existed, or an entry that is not a sha, is missing', needsGit, async () => {
  const target = await project();
  try {
    const kept = target.taskCommit('01', 'Implement menu');
    const outcome = await checked(target, building([kept, 'f'.repeat(40), 'not-a-sha']));
    assert.equal(outcome.code, 1, outcome.stderr);
    assert.deepEqual(lostOf(outcome), [{ taskId: '01', status: 'done', commits: [
      { sha: 'f'.repeat(40), state: 'missing' }, { sha: 'not-a-sha', state: 'missing' },
    ] }]);
    assert.equal('onBranch' in outcome, false);
  } finally { await target.dispose(); }
});

test('a missing commit beside one left on a branch names no branch, since the missing one sits on none', needsGit, async () => {
  const target = await project();
  try {
    const base = target.taskCommit('00', 'base');
    const sha = target.taskCommit('01', 'Implement menu');
    target.git('checkout', '-q', '-b', 'elsewhere', base);
    const outcome = await checked(target, building([sha, 'e'.repeat(40)]));
    assert.equal(outcome.code, 1, outcome.stderr);
    assert.equal('onBranch' in outcome, false);
  } finally { await target.dispose(); }
});

test('commits already declared lost are not checked again', needsGit, async () => {
  const target = await project();
  try {
    const sha = target.taskCommit('01', 'Implement menu');
    const state = building([sha]);
    state.tasks[0]!.lostCommits = ['d'.repeat(40)];
    const outcome = await checked(target, state);
    assert.equal(outcome.code, 0, outcome.stderr);
    assert.deepEqual({ checked: outcome['checked'], lost: outcome['lost'] }, { checked: 1, lost: [] });
  } finally { await target.dispose(); }
});

test('a git that is not on PATH makes the result unavailable, resets nothing, and exits 0', needsGit, async () => {
  const target = await project();
  try {
    const sha = target.taskCommit('01', 'Implement menu');
    const outcome = await checked(target, building([sha]), { ...process.env, PATH: '' });
    assert.equal(outcome.code, 0, outcome.stderr);
    assert.equal(outcome['result'], 'unavailable');
    assert.match(String(outcome['reason']), /ENOENT/);
    assert.equal('lost' in outcome, false);
  } finally { await target.dispose(); }
});

test('an unborn HEAD makes the result unavailable, never a list of lost commits', needsGit, async () => {
  const target = await project();
  try {
    const outcome = await checked(target, building(['a'.repeat(40)]));
    assert.equal(outcome.code, 0, outcome.stderr);
    assert.equal(outcome['result'], 'unavailable');
  } finally { await target.dispose(); }
});

test('with no state.js beside the helper the check exits 2 and says so', async () => {
  const target = await project({ git: false });
  try {
    const outcome = target.check();
    assert.equal(outcome.code, 2);
    assert.match(String(outcome['error']), /state\.js/);
  } finally { await target.dispose(); }
});

test('when no таск recorded a commit there is nothing to check, and nothing is lost', needsGit, async () => {
  const target = await project();
  try {
    target.taskCommit('00', 'base');
    const outcome = await checked(target, building([]));
    assert.equal(outcome.code, 0, outcome.stderr);
    assert.deepEqual({ result: outcome['result'], checked: outcome['checked'], lost: outcome['lost'] }, { result: 'checked', checked: 0, lost: [] });
  } finally { await target.dispose(); }
});

test('the reset built from the answer publishes, and a second check finds nothing lost', needsGit, async () => {
  const target = await project();
  try {
    const base = target.taskCommit('00', 'base');
    const sha = target.taskCommit('01', 'Implement menu');
    const state = building([base, sha]);
    target.git('reset', '-q', '--hard', base);
    const first = await checked(target, state);
    assert.equal(first.code, 1, first.stderr);
    const lost = lostOf(first)[0]!.commits.map(commit => commit.sha);

    // The reset, by the table: the sha moved, timing and files cleared, counters kept.
    const reset = structuredClone(state);
    const task = reset.tasks[0]!;
    task.commits = task.commits!.filter(entry => !lost.includes(entry));
    task.lostCommits = lost;
    task.status = 'queued';
    task.files = [];
    delete task.startedAt; delete task.finishedAt; delete task.tests;
    reset.updatedAt = '2026-09-29T09:30:00Z';
    const published = target.publish(reset, state.updatedAt);
    assert.equal(published.code, 0, JSON.stringify(published));

    const second = target.check();
    assert.equal(second.code, 0, second.stderr);
    assert.deepEqual({ checked: second['checked'], lost: second['lost'] }, { checked: 1, lost: [] });
  } finally { await target.dispose(); }
});
