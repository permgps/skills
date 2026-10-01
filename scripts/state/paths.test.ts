import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  forDir,
  forRun,
  forState,
  parseRunDir,
  runDirName,
  toRunDir,
  toDate,
  toIndex,
  toSlug,
  statePath,
  dashboardPath,
  worktree,
  PathEscapeError,
  ROOT,
} from './paths.ts';
import type { RunState } from './contract.ts';

const p = forRun('landing-page');

test('project-level artifacts sit directly under the run root', () => {
  assert.equal(statePath(), path.join(ROOT, 'state.js'));
  assert.equal(dashboardPath(), path.join(ROOT, 'dashboard.html'));
});

test('every feature artifact lands in the slug directory', () => {
  assert.equal(p.dir, path.join(ROOT, 'landing-page'));
  assert.equal(p.manifest(), path.join(ROOT, 'landing-page', 'manifest.md'));
  assert.equal(p.answers(), path.join(ROOT, 'landing-page', 'answers.md'));
  assert.equal(p.reference(), path.join(ROOT, 'landing-page', 'reference.md'));
  assert.equal(p.spec(), path.join(ROOT, 'landing-page', 'spec.md'));
  assert.equal(p.interfaces(), path.join(ROOT, 'landing-page', 'interfaces.md'));
  assert.equal(
    p.discoveredInterfaces(),
    path.join(ROOT, 'landing-page', 'discovered-interfaces.md'),
  );
  assert.equal(p.report(), path.join(ROOT, 'landing-page', 'report.md'));
});

test('evidence paths stay inside their named execution directory', () => {
  assert.equal(p.evidenceDir('X-1'), path.join(ROOT, 'landing-page', 'evidence', 'X-1'));
  assert.equal(p.evidence('X-1', 'pointer.png'),
    path.join(ROOT, 'landing-page', 'evidence', 'X-1', 'pointer.png'));
  assert.throws(() => p.evidence('../X-1', 'pointer.png'), PathEscapeError);
  assert.throws(() => p.evidence('X-1', '../pointer.png'), PathEscapeError);
});

test('the brief carries the date it was taken', () => {
  assert.equal(
    p.brief(new Date('2026-08-19T21:30:00Z')),
    path.join(ROOT, 'landing-page', '2026-08-19-brief.md'),
  );
});

test('the date comes from the argument, never from the clock', () => {
  const first = p.brief(new Date('2026-01-02T00:00:00Z'));
  const second = p.brief(new Date('2026-01-02T23:59:59Z'));
  assert.equal(first, second);
  assert.match(first, /2026-01-02-brief\.md$/);
});

test('an invalid date is refused rather than rendered as NaN', () => {
  assert.throws(() => toDate(new Date('not a date')), RangeError);
});

test('task and review indexes are zero-padded to two digits', () => {
  assert.equal(toIndex(0), '00');
  assert.equal(toIndex(7), '07');
  assert.equal(toIndex(42), '42');
  // A run with a hundred таски widens rather than wrapping.
  assert.equal(toIndex(120), '120');
});

test('a negative or fractional index is refused', () => {
  assert.throws(() => toIndex(-1), RangeError);
  assert.throws(() => toIndex(1.5), RangeError);
});

test('task and review files pair by index and slug', () => {
  assert.equal(p.task(3, 'Hero section'), path.join(ROOT, 'landing-page', 'tasks', '03-hero-section.md'));
  assert.equal(p.review(3, 'Hero section'), path.join(ROOT, 'landing-page', 'reviews', '03-hero-section.md'));
  assert.equal(p.tasksDir(), path.join(ROOT, 'landing-page', 'tasks'));
  assert.equal(p.reviewsDir(), path.join(ROOT, 'landing-page', 'reviews'));
});

test('a handoff sits beside the task file it continues', () => {
  assert.equal(
    p.handoff(3, 'Hero section'),
    path.join(ROOT, 'landing-page', 'tasks', '03-hero-section-handoff.md'),
  );
  assert.equal(path.dirname(p.handoff(3, 'Hero section')), path.dirname(p.task(3, 'Hero section')));
});

test('a handoff name that would climb out is flattened like a task name', () => {
  assert.throws(() => p.handoff(1, '///'), PathEscapeError);
  assert.equal(
    p.handoff(1, '../../etc/passwd'),
    path.join(ROOT, 'landing-page', 'tasks', '01-etc-passwd-handoff.md'),
  );
});

test('a worktree is a sibling of the project, never a path inside the run', () => {
  const dir = worktree('my-project', 'landing-page', 3);
  assert.equal(dir, path.join('..', 'my-project-maestro-landing-page-03'));
  // The one builder that leaves the run root — it must not land back inside it.
  assert.ok(!path.normalize(dir).startsWith(ROOT));
  assert.ok(!path.normalize(dir).includes(`${path.sep}${ROOT}${path.sep}`));
});

test('a worktree name is derived, so two calls agree without anything stored', () => {
  assert.equal(
    worktree('My Project', 'Landing Page', 3),
    worktree('my-project', 'landing-page', 3),
  );
  assert.notEqual(worktree('p', 'landing-page', 3), worktree('p', 'landing-page', 4));
});

test('a worktree refuses an unslugifiable project or slug', () => {
  assert.throws(() => worktree('   ', 'landing-page', 1), PathEscapeError);
  assert.throws(() => worktree('my-project', '../..', 1), PathEscapeError);
  assert.throws(() => worktree('my-project', 'landing-page', -1), RangeError);
});

test('slugs are lowercased, collapsed and trimmed', () => {
  assert.equal(toSlug('Landing Page'), 'landing-page');
  assert.equal(toSlug('  Pricing — v2!!  '), 'pricing-v2');
  assert.equal(toSlug('a/b/c'), 'a-b-c');
});

test('a slug that would escape the run directory is refused', () => {
  // "../../etc" contains no slug characters at all once separators are stripped.
  assert.throws(() => forRun('../..'), PathEscapeError);
  assert.throws(() => forRun('   '), PathEscapeError);
  assert.throws(() => forRun(''), PathEscapeError);
});

test('a task name full of separators cannot climb out either', () => {
  assert.throws(() => p.task(1, '../../etc/passwd'.replace(/[a-z]/g, '')), PathEscapeError);
  // A traversal attempt that does contain letters is flattened, not honoured.
  assert.equal(
    p.task(1, '../../etc/passwd'),
    path.join(ROOT, 'landing-page', 'tasks', '01-etc-passwd.md'),
  );
});

test('forState uses the slug the state carries', () => {
  const state: RunState = {
    contractVersion: 3,
    runId: 'r1',
    slug: 'Checkout Flow',
    startedAt: '2026-08-19T09:00:00Z',
    mode: 'semi',
    depth: 'normal',
    polish: false,
    dialChanges: [],
    stages: [],
    currentStage: 'preflight',
    tasks: [],
    requirements: [],
    gates: [],
  };
  assert.equal(forState(state).dir, path.join(ROOT, 'checkout-flow'));
});

test('a run directory is named by the UTC day the run started, never by the clock', () => {
  assert.equal(toRunDir('2026-09-29T23:30:00Z', 'landing-page', true), '2026-09-29-landing-page--wip');
  // 01:30 in Moscow is still the previous UTC day, as it is for the brief's date.
  assert.equal(toRunDir('2026-09-29T22:30:00-03:00', 'landing-page', true), '2026-09-30-landing-page--wip');
  assert.equal(toRunDir('2026-09-29T23:30:00Z', 'landing-page', true).slice(0, 10),
    p.brief(new Date('2026-09-29T23:30:00Z')).split(path.sep).at(-1)!.slice(0, 10));
});

test('an active run directory ends in --wip and a closed one does not', () => {
  assert.equal(toRunDir('2026-09-29T09:00:00Z', 'landing-page', true), '2026-09-29-landing-page--wip');
  assert.equal(toRunDir('2026-09-29T09:00:00Z', 'landing-page', false), '2026-09-29-landing-page');
});

test('a run directory name parses into its date, slug and suffix, and nothing else parses', () => {
  assert.deepEqual(parseRunDir('2026-09-29-landing-page--wip'), { date: '2026-09-29', slug: 'landing-page', wip: true });
  assert.deepEqual(parseRunDir('2026-09-29-landing-page-2'), { date: '2026-09-29', slug: 'landing-page-2', wip: false });
  for (const bad of ['landing-page', '2026-09-29-', '2026-09-29-Landing', '2026-09-29-a--b', '2026-09-29-a/b', '../2026-09-29-a']) {
    assert.equal(parseRunDir(bad), null, bad);
  }
});

test('a non-canonical slug cannot be turned into a run directory', () => {
  assert.throws(() => toRunDir('2026-09-29T09:00:00Z', 'Landing Page', true), PathEscapeError);
});

test('a contract-7 state resolves its artifacts from dir, not from slug', () => {
  const state = { contractVersion: 7, slug: 'checkout-flow', dir: '2026-09-29-checkout-flow--wip' } as RunState;
  assert.equal(runDirName(state), '2026-09-29-checkout-flow--wip');
  assert.equal(forState(state).dir, path.join(ROOT, '2026-09-29-checkout-flow--wip'));
  assert.equal(forState(state).slug, 'checkout-flow');
  assert.equal(forState(state).report(), path.join(ROOT, '2026-09-29-checkout-flow--wip', 'report.md'));
  assert.equal(forDir('2026-09-29-checkout-flow').manifest(), path.join(ROOT, '2026-09-29-checkout-flow', 'manifest.md'));
});

test('a contract-6 state still resolves its directory from the slug', () => {
  const state = { contractVersion: 6, slug: 'checkout-flow' } as RunState;
  assert.equal(runDirName(state), 'checkout-flow');
  assert.equal(forState(state).dir, path.join(ROOT, 'checkout-flow'));
});

test('a run directory that would leave the run root is refused', () => {
  assert.throws(() => runDirName({ contractVersion: 7, slug: 'a', dir: '../a' } as RunState), PathEscapeError);
  assert.throws(() => runDirName({ contractVersion: 7, slug: 'a' } as RunState), PathEscapeError);
  assert.throws(() => forDir('not-a-dated-name'), PathEscapeError);
});
