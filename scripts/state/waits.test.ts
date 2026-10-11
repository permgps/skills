import test from 'node:test';
import assert from 'node:assert/strict';

import { keepWaits, transitioned, validateWaitsTransition } from './waits.ts';
import { validateStateTransition } from './closure.ts';
import type { RunState } from './contract.ts';
import { activeContract8State, activeContract9State } from './fixtures/verification.ts';

// One row of the publication table in the plan per test: the published state
// is P, the candidate C, both of one run at contract 9 unless a test says so.

const ASKED = '2026-09-29T09:15:00Z';
const REPLIED = '2026-09-29T09:30:00Z';
const EARLIER = { since: '2026-09-29T09:11:00Z', until: '2026-09-29T09:12:00Z' };

/** The published прогон, waiting since 09:15 when `asking`, with the closed waits given. */
function published(asking: boolean, waits: RunState['waits'] = [EARLIER]): RunState {
  const state: RunState = { ...activeContract9State(), updatedAt: ASKED };
  if (waits.length) state.waits = waits;
  if (asking) state.awaiting = { kind: 'answer', since: ASKED };
  return state;
}

/** The candidate written after it: same прогон, restamped at 09:30, `waits` carried as read. */
function candidate(from: RunState, patch: Partial<RunState> = {}): RunState {
  const next: RunState = structuredClone(from);
  next.updatedAt = REPLIED;
  delete next.awaiting;
  return { ...next, ...patch };
}

test('no wait before and none now carries the closed waits as published', () => {
  const previous = published(false);
  const kept = keepWaits(previous, candidate(previous));
  assert.deepEqual(kept.violations, []);
  assert.equal(kept.closed, null);
  assert.deepEqual(kept.state.waits, [EARLIER]);
  assert.equal(kept.state.awaiting, undefined);
});

test('a first question is published open and closes nothing', () => {
  const previous = published(false);
  const awaiting = { kind: 'spec-gate' as const, since: REPLIED };
  const kept = keepWaits(previous, candidate(previous, { awaiting }));
  assert.deepEqual(kept.violations, []);
  assert.equal(kept.closed, null);
  assert.deepEqual(kept.state.awaiting, awaiting);
  assert.deepEqual(kept.state.waits, [EARLIER]);
});

test('a cleared wait is appended, closing at the candidate\'s own stamp', () => {
  const previous = published(true);
  const kept = keepWaits(previous, candidate(previous));
  assert.deepEqual(kept.violations, []);
  assert.deepEqual(kept.closed, { since: ASKED, until: REPLIED, by: 'cleared' });
  assert.deepEqual(kept.state.waits, [EARLIER, { since: ASKED, until: REPLIED }]);
  assert.equal(kept.state.awaiting, undefined);
});

test('the same question with no transition stays open and closes nothing', () => {
  const previous = published(true);
  const kept = keepWaits(previous, candidate(previous, { awaiting: { kind: 'answer', since: ASKED } }));
  assert.deepEqual(kept.violations, []);
  assert.equal(kept.closed, null);
  assert.deepEqual(kept.state.awaiting, { kind: 'answer', since: ASKED });
  assert.deepEqual(kept.state.waits, [EARLIER]);
});

test('a transition under the same question is a forgotten clear: the wait closes and awaiting is dropped', () => {
  const previous = published(true);
  const next = candidate(previous, { awaiting: { kind: 'answer', since: ASKED } });
  next.stages = next.stages.map(stage => ({ ...stage, status: 'done', finishedAt: REPLIED }));
  const kept = keepWaits(previous, next);
  assert.deepEqual(kept.violations, []);
  assert.deepEqual(kept.closed, { since: ASKED, until: REPLIED, by: 'transition' });
  assert.deepEqual(kept.state.waits, [EARLIER, { since: ASKED, until: REPLIED }]);
  assert.equal(kept.state.awaiting, undefined);
});

test('a new question over an open one closes the old one where the new one began', () => {
  const previous = published(true);
  const asked = '2026-09-29T09:25:00Z';
  const kept = keepWaits(previous, candidate(previous, { awaiting: { kind: 'plan-gate', since: asked } }));
  assert.deepEqual(kept.violations, []);
  assert.deepEqual(kept.closed, { since: ASKED, until: asked, by: 'new-question' });
  assert.deepEqual(kept.state.waits, [EARLIER, { since: ASKED, until: asked }]);
  assert.deepEqual(kept.state.awaiting, { kind: 'plan-gate', since: asked });
});

test('a new question stamped after its write closes the old one at the write', () => {
  const previous = published(true);
  const kept = keepWaits(previous, candidate(previous, { awaiting: { kind: 'plan-gate', since: '2026-09-29T09:40:00Z' } }));
  assert.deepEqual(kept.closed, { since: ASKED, until: REPLIED, by: 'new-question' });
});

test('a candidate that rewrites the closed waits is refused, and one that carries either list is not', () => {
  const previous = published(true);
  const rewritten = keepWaits(previous, candidate(previous, { waits: [{ since: '2026-09-29T09:01:00Z', until: '2026-09-29T09:02:00Z' }] }));
  assert.deepEqual(rewritten.violations.map(v => v.field), ['waits']);
  assert.match(rewritten.violations[0]!.message, /kept by sync\.mts/);

  const asRead = keepWaits(previous, candidate(previous, { waits: [EARLIER] }));
  assert.deepEqual(asRead.violations, []);
  const computed = [EARLIER, { since: ASKED, until: REPLIED }];
  const asComputed = keepWaits(previous, candidate(previous, { waits: computed }));
  assert.deepEqual(asComputed.violations, []);
  assert.deepEqual(asComputed.state.waits, computed);
});

test('a new run, or nothing published, starts with no closed waits', () => {
  const previous = published(true);
  const other = candidate(previous, { runId: 'run-synthetic-2' });
  delete other.waits;
  const kept = keepWaits(previous, other);
  assert.deepEqual(kept.violations, []);
  assert.equal(kept.closed, null);
  assert.equal('waits' in kept.state, false);

  const first = keepWaits(null, candidate(published(false, [])));
  assert.equal(first.closed, null);
  assert.equal('waits' in first.state, false);

  const carried = keepWaits(previous, candidate(previous, { runId: 'run-synthetic-2' }));
  assert.deepEqual(carried.violations.map(v => v.field), ['waits']);
});

test('a contract-8 candidate is returned untouched, open awaiting and all', () => {
  const previous: RunState = { ...activeContract8State(), awaiting: { kind: 'answer', since: ASKED } };
  const next = candidate(previous);
  const kept = keepWaits(previous, next);
  assert.equal(kept.state, next);
  assert.equal(kept.closed, null);
  assert.deepEqual(kept.violations, []);
});

test('a wait never closes before it began, whatever the candidate\'s stamp says', () => {
  const previous = published(true);
  const kept = keepWaits(previous, candidate(previous, { updatedAt: '2026-09-29T09:14:00Z' }));
  assert.deepEqual(kept.closed, { since: ASKED, until: ASKED, by: 'cleared' });
});

test('closing is idempotent: publishing the computed state again changes nothing', () => {
  for (const patch of [{}, { awaiting: { kind: 'plan-gate' as const, since: '2026-09-29T09:25:00Z' } }]) {
    const previous = published(true);
    const once = keepWaits(previous, candidate(previous, patch)).state;
    const twice = keepWaits(once, structuredClone(once));
    assert.equal(twice.closed, null);
    assert.deepEqual(twice.violations, []);
    assert.deepEqual(twice.state, once);
  }
});

test('a таск added under an open wait is a transition, and a requirement or gate change is not', () => {
  const previous = published(true);
  const added = structuredClone(previous);
  added.tasks.push({ ...added.tasks[0]!, id: '02', status: 'queued' });
  assert.equal(transitioned(previous, added), true);

  const settled = structuredClone(previous);
  settled.requirements[0] = { ...settled.requirements[0]!, status: 'deferred', reason: 'later' };
  settled.gates[0] = { ...settled.gates[0]!, status: 'failed' };
  assert.equal(transitioned(previous, settled), false);

  const moved = structuredClone(previous);
  moved.currentStage = 'review';
  assert.equal(transitioned(previous, moved), true);
});

test('a later state that dropped or rewrote an earlier wait is refused, here and by the transition check', () => {
  const previous = published(false, [EARLIER, { since: ASKED, until: REPLIED }]);
  const dropped = candidate(previous, { waits: [EARLIER] });
  assert.deepEqual(validateWaitsTransition(previous, dropped).map(v => v.field), ['waits']);
  const rewritten = candidate(previous, { waits: [EARLIER, { since: ASKED, until: '2026-09-29T09:31:00Z' }] });
  assert.deepEqual(validateWaitsTransition(previous, rewritten).map(v => v.field), ['waits']);
  assert.ok(validateStateTransition(previous, rewritten).some(v => v.field === 'waits'));

  const extended = candidate(previous, { waits: [EARLIER, { since: ASKED, until: REPLIED }, { since: REPLIED, until: REPLIED }] });
  assert.deepEqual(validateWaitsTransition(previous, extended), []);
  assert.deepEqual(validateWaitsTransition(previous, candidate(previous, { runId: 'run-synthetic-2', waits: [] })), []);
});
