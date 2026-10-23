// `sync.mts --publish <candidate> --land <NN>`: a таск's commit verified
// against the таск and appended to its `commits` before validation.
//
// Driven through the copied `sync.mts` inside a real temporary project, over a
// real repository whose commits carry the real trailers, the way
// commits-check-sync.test.ts drives the resume check. Each test is one row of
// the `--land` input table in the plan "One Event, One Turn": the four cases
// the roadmap names, every refusal beside the legal inputs that must still
// land, and the order proof that the sha is in the state before it is judged.
// A refusal never writes, so every refused test also holds `state.js` byte for
// byte.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { CAPTURES, SOURCE_MANIFEST, activeContract10State } from '../state/fixtures/verification.ts';
import type { RunState } from '../state/contract.ts';
import { requirementsTrailer, subjectNamesTask } from '../../skills/maestro/tools/runtime/landing.mts';

const SYNC = 'skills/maestro/tools/sync.mts';
const PAGE = 'skills/maestro/assets/dashboard.html';
const WIP = '2026-09-29-synthetic-menu--wip';
const RUN = '2026-09-29-synthetic-menu';
const HOLDER = 'session-landing';

const hasGit = spawnSync('git', ['--version']).status === 0;
const needsGit = { skip: hasGit ? false : 'git is not on PATH' };

type Outcome = Record<string, unknown> & { code: number; stderr: string };
type Task = RunState['tasks'][number];

interface Commit { subject?: string; run?: string | null; requirements?: string | null; file?: string }

interface Project {
  root: string;
  git(...args: string[]): string;
  /** A таск commit by pathspec: the file written, added, committed with the subject and trailers given. */
  commit(options?: Commit): string;
  publish(state: RunState, options?: { land?: string; expect?: string | undefined; action?: string; env?: NodeJS.ProcessEnv }): Outcome;
  stateText(): Promise<string | null>;
  dispose(): Promise<void>;
}

async function project(): Promise<Project> {
  const root = await mkdtemp(path.join(tmpdir(), 'maestro-landing-'));
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
    const date = `2026-09-29T10:${String(tick++).padStart(2, '0')}:00Z`;
    const done = spawnSync('git', ['-C', root, ...args], {
      encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    });
    if (done.status !== 0) throw new Error(`git ${args.join(' ')}: ${done.stderr}`);
    return done.stdout;
  };
  git('init', '-q');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'Landing Test');
  appendFileSync(path.join(root, '.git', 'info', 'exclude'), 'candidate.json\n');
  const run = (args: string[], env: NodeJS.ProcessEnv = process.env): Outcome => {
    const done = spawnSync(process.execPath, [path.join(maestro, 'sync.mts'), ...args],
      { encoding: 'utf8', env: { ...env, MAESTRO_SYNC_NO_OPEN: '1' } });
    return { ...JSON.parse(done.stdout.split('\n')[0] || '{}') as Record<string, unknown>, code: done.status ?? -1, stderr: done.stderr };
  };
  return {
    root, git,
    commit({ subject = '01 Implement menu', run: runDir = RUN, requirements = 'R01', file = 'src/menu.js' } = {}) {
      const target = path.join(root, file);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, `export const tick = ${tick};\n`);
      git('add', '--', file);
      const trailers = [runDir === null ? null : `Maestro-Run: ${runDir}`, requirements === null ? null : `Requirements: ${requirements}`]
        .filter(line => line !== null).join('\n');
      git('commit', '-q', '-m', subject, ...(trailers ? ['-m', trailers] : []), '--', file);
      return git('rev-parse', 'HEAD').trim();
    },
    publish(state, { land, expect, action = '--publish', env } = {}) {
      const candidate = path.join(root, 'candidate.json');
      writeFileSync(candidate, JSON.stringify(state));
      return run([action, candidate, '--no-open', '--holder', HOLDER,
        ...(expect ? ['--expect', expect] : []), ...(land !== undefined ? ['--land', land] : [])], env);
    },
    async stateText() {
      try { return await readFile(path.join(maestro, 'state.js'), 'utf8'); } catch { return null; }
    },
    async dispose() {
      try {
        const { pid } = JSON.parse(await readFile(path.join(maestro, 'serve.json'), 'utf8')) as { pid?: number };
        if (typeof pid === 'number') process.kill(pid, 'SIGTERM');
      } catch { /* no viewer was started */ }
      await rm(root, { recursive: true, force: true });
    },
  };
}

/** The active contract-10 run, held, its таск 01 committed and waiting for review, at the moment given. */
function reviewing(commits: string[], minute: number, change: Partial<Task> = {}, second?: Partial<Task>): RunState {
  const state = activeContract10State();
  state.heldBy = { token: HOLDER, since: state.startedAt };
  state.updatedAt = `2026-09-29T09:${String(minute).padStart(2, '0')}:00Z`;
  state.tasks[0] = { ...state.tasks[0]!, status: 'review', zone: ['src/menu'], files: ['src/menu.js'], commits, ...change };
  if (second) {
    state.tasks.push({ ...state.tasks[0]!, id: '02', title: 'Implement footer', status: 'review',
      files: ['src/footer.js'], zone: ['src/footer.js'], commits: [], ...second });
  }
  return state;
}

/** Publish the baseline, then the landing candidate one minute later; the baseline's revision is expected. */
async function landed(target: Project, base: RunState, candidate: RunState, land = '01'): Promise<{ outcome: Outcome; before: string | null }> {
  const published = target.publish(base);
  assert.equal(published.code, 0, JSON.stringify(published));
  const before = await target.stateText();
  return { outcome: target.publish(candidate, { land, expect: base.updatedAt }), before };
}

const publishedCommits = async (target: Project, id = '01'): Promise<unknown> => {
  const text = (await target.stateText())!;
  const state = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as RunState;
  return state.tasks.find(task => task.id === id)?.commits;
};

/** A refusal names its rule, exits 1 and leaves `state.js` as it was. */
async function refused(target: Project, base: RunState, candidate: RunState, rule: string, land = '01'): Promise<void> {
  const { outcome, before } = await landed(target, base, candidate, land);
  assert.equal(outcome.code, 1, JSON.stringify(outcome));
  assert.equal(outcome['status'], 'rejected');
  const messages = (outcome['violations'] as { message: string }[]).map(violation => violation.message);
  assert.ok(messages.some(message => message.startsWith(`${rule}: `)), messages.join('\n'));
  assert.equal(await target.stateText(), before, 'a refused landing must never write state.js');
}

test('a fresh таск commit with clean paths and matching trailers is appended once', needsGit, async () => {
  const target = await project();
  try {
    target.commit({ subject: '00 base', file: 'README.md' });
    const sha = target.commit();
    const { outcome } = await landed(target, reviewing([], 20), reviewing([], 21));
    assert.equal(outcome.code, 0, outcome.stderr);
    assert.deepEqual(outcome['landed'], { taskId: '01', sha, appended: true });
    assert.deepEqual(await publishedCommits(target), [sha]);
  } finally { await target.dispose(); }
});

test('the same candidate and HEAD landed again publish an identical state and append nothing', needsGit, async () => {
  const target = await project();
  try {
    const sha = target.commit();
    const first = await landed(target, reviewing([], 20), reviewing([], 21));
    assert.equal(first.outcome.code, 0, first.outcome.stderr);
    const once = await target.stateText();
    // The command resent as it was: the candidate file still lacks the sha, so
    // it is appended to the candidate again and the published state is the same.
    const resent = target.publish(reviewing([], 21), { land: '01', expect: '2026-09-29T09:21:00Z' });
    assert.equal(resent.code, 0, resent.stderr);
    assert.equal(await target.stateText(), once);
    // A candidate that already carries the sha gets nothing appended.
    const carried = target.publish(reviewing([sha], 21), { land: '01', expect: '2026-09-29T09:21:00Z' });
    assert.equal(carried.code, 0, carried.stderr);
    assert.deepEqual(carried['landed'], { taskId: '01', sha, appended: false });
    assert.equal(await target.stateText(), once);
  } finally { await target.dispose(); }
});

test('a repaired таск\'s second commit lands after its first', needsGit, async () => {
  const target = await project();
  try {
    const first = target.commit();
    const repair = target.commit({ subject: '01 (repair): the menu closes on Escape' });
    const { outcome } = await landed(target, reviewing([first], 20), reviewing([first], 21));
    assert.equal(outcome.code, 0, outcome.stderr);
    assert.deepEqual(await publishedCommits(target), [first, repair]);
  } finally { await target.dispose(); }
});

for (const subject of ['01: Implement menu', '01 (repair): Implement menu', '01 Implement menu', '01']) {
  test(`a subject opening with the таск id as "${subject}" lands`, needsGit, async () => {
    const target = await project();
    try {
      const sha = target.commit({ subject });
      const { outcome } = await landed(target, reviewing([], 20), reviewing([], 21));
      assert.equal(outcome.code, 0, outcome.stderr);
      assert.deepEqual(await publishedCommits(target), [sha]);
    } finally { await target.dispose(); }
  });
}

for (const subject of ['02 Implement footer', '010 Implement menu', 'Implement menu 01']) {
  test(`a HEAD whose subject is "${subject}" does not name таск 01 and is refused`, needsGit, async () => {
    const target = await project();
    try {
      target.commit({ subject });
      await refused(target, reviewing([], 20), reviewing([], 21), 'land-subject');
    } finally { await target.dispose(); }
  });
}

test('a HEAD whose Maestro-Run: trailer names another run is refused', needsGit, async () => {
  const target = await project();
  try {
    target.commit({ run: '2026-09-28-another-run' });
    await refused(target, reviewing([], 20), reviewing([], 21), 'land-run');
  } finally { await target.dispose(); }
});

test('a HEAD with no Maestro-Run: trailer is refused', needsGit, async () => {
  const target = await project();
  try {
    target.commit({ run: null });
    await refused(target, reviewing([], 20), reviewing([], 21), 'land-run');
  } finally { await target.dispose(); }
});

test('the run trailer names the run without --wip, the way the build phase writes it', needsGit, async () => {
  const target = await project();
  try {
    target.commit({ run: WIP });
    await refused(target, reviewing([], 20), reviewing([], 21), 'land-run');
  } finally { await target.dispose(); }
});

for (const [label, requirements] of [
  ['another requirement', 'R02'],
  ['no requirement trailer', null],
  ['an id the таск does not trace to', 'R01, R02'],
] as const) {
  test(`a Requirements: trailer with ${label} is refused`, needsGit, async () => {
    const target = await project();
    try {
      target.commit({ requirements });
      await refused(target, reviewing([], 20), reviewing([], 21), 'land-requirements');
    } finally { await target.dispose(); }
  });
}

test('the Requirements: value is the таск\'s ids in id order, R2 before R10, whatever order the state lists them in', () => {
  assert.equal(requirementsTrailer(['R10', 'R01', 'R2']), 'R01, R2, R10');
  assert.equal(requirementsTrailer(['R01']), 'R01');
  assert.notEqual(requirementsTrailer(['R2', 'R10']), 'R10, R2');
});

test('a modified tracked file left in the таск\'s zone is refused, and the path is named', needsGit, async () => {
  const target = await project();
  try {
    target.commit({ file: 'src/menu/open.js' });
    writeFileSync(path.join(target.root, 'src/menu/open.js'), 'export const changed = true;\n');
    await refused(target, reviewing([], 20), reviewing([], 21), 'land-dirty');
  } finally { await target.dispose(); }
});

test('an untracked file in the таск\'s zone is refused: a commit by pathspec does not take it', needsGit, async () => {
  const target = await project();
  try {
    target.commit();
    mkdirSync(path.join(target.root, 'src/menu'), { recursive: true });
    writeFileSync(path.join(target.root, 'src/menu/close.js'), 'export const close = true;\n');
    const { outcome } = await landed(target, reviewing([], 20), reviewing([], 21));
    assert.equal(outcome.code, 1);
    const [violation] = outcome['violations'] as { message: string }[];
    assert.match(violation!.message, /^land-dirty: 1 path\(s\) of таск 01 .*src\/menu\/close\.js/);
  } finally { await target.dispose(); }
});

test('a dirty file outside the zone and a dirty .maestro/ are not the таск\'s, and the landing goes through', needsGit, async () => {
  const target = await project();
  try {
    const sha = target.commit();
    writeFileSync(path.join(target.root, 'notes.txt'), 'the user\'s own work\n');
    // .maestro/ is untracked in this repository, so state.js and the run folder are dirty throughout.
    assert.match(target.git('status', '--porcelain', '--untracked-files=all'), /^\?\? \.maestro\//m);
    const { outcome } = await landed(target, reviewing([], 20), reviewing([], 21));
    assert.equal(outcome.code, 0, outcome.stderr);
    assert.deepEqual(await publishedCommits(target), [sha]);
  } finally { await target.dispose(); }
});

test('a sha another таск already landed is refused', needsGit, async () => {
  const target = await project();
  try {
    const sha = target.commit();
    await refused(target, reviewing([], 20, {}, { commits: [sha] }), reviewing([], 21, {}, { commits: [sha] }), 'land-other-task');
  } finally { await target.dispose(); }
});

test('a sha recorded as lost never comes back into commits', needsGit, async () => {
  const target = await project();
  try {
    const sha = target.commit();
    const lost = { status: 'queued' as const, commits: [], lostCommits: [sha] };
    await refused(target, reviewing([], 20, {}, lost), reviewing([], 21, {}, lost), 'land-lost');
  } finally { await target.dispose(); }
});

test('a HEAD that is an earlier commit of the same таск means no new commit was made', needsGit, async () => {
  const target = await project();
  try {
    const first = target.commit();
    const second = target.commit({ subject: '01 (repair): Implement menu' });
    target.git('reset', '-q', '--hard', first);
    await refused(target, reviewing([first, second], 20), reviewing([first, second], 21), 'land-stale-head');
  } finally { await target.dispose(); }
});

test('a таск that is not review in the candidate is refused: a landed таск is committed, not accepted', needsGit, async () => {
  const target = await project();
  try {
    target.commit();
    await refused(target, reviewing([], 20, { status: 'running' }), reviewing([], 21, { status: 'running' }), 'land-not-review');
  } finally { await target.dispose(); }
});

test('an id the candidate does not carry is refused', needsGit, async () => {
  const target = await project();
  try {
    target.commit({ subject: '07 Unknown' });
    await refused(target, reviewing([], 20), reviewing([], 21), 'land-unknown-task', '07');
  } finally { await target.dispose(); }
});

test('a таск with no zone and no files is refused: nothing says what the commit had to take', needsGit, async () => {
  const target = await project();
  try {
    target.commit();
    // Both lists are required from contract 3, so "none" is two empty lists.
    const bare = (minute: number): RunState => reviewing([], minute, { zone: [], files: [] });
    await refused(target, bare(20), bare(21), 'land-no-paths');
  } finally { await target.dispose(); }
});

test('a zone path that climbs out of the project is refused before git sees it', needsGit, async () => {
  const target = await project();
  try {
    target.commit();
    const change = { zone: ['src/menu', '../elsewhere'] };
    await refused(target, reviewing([], 20, change), reviewing([], 21, change), 'land-path');
  } finally { await target.dispose(); }
});

test('the build phase\'s own commit command lands: by pathspec over files, trailers by --trailer, a zone directory never created', needsGit, async () => {
  const target = await project();
  try {
    target.commit({ subject: '00 base', file: 'README.md' });
    // The user's own staged work, which a commit by pathspec must leave staged.
    writeFileSync(path.join(target.root, 'notes.txt'), 'the user\'s own work\n');
    target.git('add', 'notes.txt');
    mkdirSync(path.join(target.root, 'src'), { recursive: true });
    writeFileSync(path.join(target.root, 'src/menu.js'), 'export const menu = true;\n');
    // Exactly the three lines of phases/5-build.md step 3; the zone src/menu does not exist.
    target.git('add', '--', 'src/menu.js');
    target.git('commit', '-q', '-m', '01 Implement menu', '--trailer', `Maestro-Run: ${RUN}`, '--trailer', 'Requirements: R01', '--', 'src/menu.js');
    const sha = target.git('rev-parse', 'HEAD').trim();
    const { outcome } = await landed(target, reviewing([], 20), reviewing([], 21));
    assert.equal(outcome.code, 0, JSON.stringify(outcome));
    assert.deepEqual(await publishedCommits(target), [sha]);
    assert.match(target.git('status', '--porcelain'), /^A  notes\.txt$/m, 'the user\'s staged file stays out of the таск commit');
  } finally { await target.dispose(); }
});

test('an absolute zone path is refused before git sees it', needsGit, async () => {
  const target = await project();
  try {
    target.commit();
    const change = { zone: ['/etc'] };
    await refused(target, reviewing([], 20, change), reviewing([], 21, change), 'land-path');
  } finally { await target.dispose(); }
});

test('a git that is not on PATH exits 2 and writes nothing', needsGit, async () => {
  const target = await project();
  try {
    target.commit();
    const base = reviewing([], 20);
    assert.equal(target.publish(base).code, 0);
    const before = await target.stateText();
    const outcome = target.publish(reviewing([], 21), { land: '01', expect: base.updatedAt, env: { ...process.env, PATH: '' } });
    assert.equal(outcome.code, 2, JSON.stringify(outcome));
    assert.equal(outcome['status'], 'unreadable');
    assert.equal(await target.stateText(), before);
  } finally { await target.dispose(); }
});

test('--land on --validate exits 2: a check that writes nothing has no state to land in', needsGit, async () => {
  const target = await project();
  try {
    target.commit();
    const outcome = target.publish(reviewing([], 20), { land: '01', action: '--validate' });
    assert.equal(outcome.code, 2, JSON.stringify(outcome));
    assert.match(String(outcome['reason']), /--publish only/);
  } finally { await target.dispose(); }
});

test('--land with no таск id exits 2', needsGit, async () => {
  const target = await project();
  try {
    target.commit();
    const outcome = target.publish(reviewing([], 20), { land: '--no-open' });
    assert.equal(outcome.code, 2, JSON.stringify(outcome));
  } finally { await target.dispose(); }
});

test('the sha is in the candidate before validation: a missing commits list publishes with --land and is refused without it', needsGit, async () => {
  const target = await project();
  try {
    const sha = target.commit();
    const base = reviewing([], 20);
    assert.equal(target.publish(base).code, 0);
    const bare = reviewing([], 21);
    delete bare.tasks[0]!.commits;
    const without = target.publish(bare, { expect: base.updatedAt });
    assert.equal(without.code, 1, JSON.stringify(without));
    assert.ok((without['violations'] as { field: string }[]).some(violation => violation.field.includes('commits')), JSON.stringify(without));
    const withLand = target.publish(bare, { land: '01', expect: base.updatedAt });
    assert.equal(withLand.code, 0, JSON.stringify(withLand));
    assert.deepEqual(await publishedCommits(target), [sha]);
  } finally { await target.dispose(); }
});

test('the subject check reads only the head of a 200 KB subject', () => {
  const subject = '01'.repeat(100_000);
  const started = performance.now();
  assert.equal(subjectNamesTask(subject, '01'), false);
  assert.equal(subjectNamesTask(`01 ${subject}`, '01'), true);
  assert.ok(performance.now() - started < 100, 'the subject check must not scan the whole subject');
});
