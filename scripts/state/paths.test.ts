import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  forRun,
  forState,
  toDate,
  toIndex,
  toSlug,
  statePath,
  dashboardPath,
  PathEscapeError,
  ROOT,
} from './paths.ts';
import { CONTRACT_VERSION, type RunState } from './contract.ts';

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
    contractVersion: CONTRACT_VERSION,
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
