import test from 'node:test';
import assert from 'node:assert/strict';

import { validateState, isValidState, type StateViolation } from './validate.ts';
import { CONTRACT_VERSION, type RunState } from './contract.ts';

/** A state that passes every rule; each test bends exactly one thing. */
function baseline(): RunState {
  return {
    contractVersion: CONTRACT_VERSION,
    runId: 'run-2026-08-19-01',
    slug: 'landing-page',
    startedAt: '2026-08-19T09:00:00Z',
    mode: 'semi',
    depth: 'normal',
    polish: false,
    dialChanges: [{ dial: 'depth', from: 'normal', to: 'deep', atPhase: 'spec' }],
    stages: [
      { id: 'preflight', status: 'done', startedAt: '2026-08-19T09:00:00Z' },
      { id: 'manifest', status: 'active' },
    ],
    currentStage: 'manifest',
    tasks: [
      { id: '01', title: 'Build the hero section', requirementIds: ['R01'], status: 'queued', blockedBy: [] },
    ],
    requirements: [
      { id: 'R01', status: 'in-spec' },
      { id: 'R02', status: 'deferred', reason: 'no pricing supplied yet' },
    ],
    gates: [{ id: 'G1', status: 'pending', findings: [] }],
  };
}

/** Apply an override to a copy of the baseline, escaping the type on purpose. */
function withPatch(patch: Record<string, unknown>): unknown {
  return { ...baseline(), ...patch };
}

const fields = (violations: StateViolation[]): string[] => violations.map(v => v.field);

test('a valid state produces no violations', () => {
  assert.deepEqual(validateState(baseline()), []);
  assert.equal(isValidState(baseline()), true);
});

test('a non-object is rejected without crashing', () => {
  for (const input of [null, undefined, 42, 'state', [], true]) {
    const violations = validateState(input);
    assert.equal(violations.length, 1);
    assert.match(violations[0]?.message ?? '', /not an object/);
  }
});

test('a missing required scalar is reported by name', () => {
  const state: Record<string, unknown> = { ...baseline() };
  delete state['slug'];
  assert.deepEqual(fields(validateState(state)), ['slug']);
});

test('an unknown mode is reported with the allowed set', () => {
  const violations = validateState(withPatch({ mode: 'autopilot' }));
  assert.deepEqual(fields(violations), ['mode']);
  assert.match(violations[0]?.message ?? '', /full, semi, interview, manual/);
});

test('an unknown depth, stage status and task status are each reported', () => {
  assert.deepEqual(fields(validateState(withPatch({ depth: 'shallow' }))), ['depth']);
  assert.deepEqual(
    fields(validateState(withPatch({ stages: [{ id: 'preflight', status: 'skipped' }] }))),
    ['stages[0].status'],
  );
  assert.deepEqual(
    fields(validateState(withPatch({
      tasks: [{ id: '01', title: 't', requirementIds: ['R01'], status: 'paused', blockedBy: [] }],
    }))),
    ['tasks[0].status'],
  );
});

test('a stage id outside the phase set is reported', () => {
  assert.deepEqual(
    fields(validateState(withPatch({ stages: [{ id: 'bootstrap', status: 'done' }] }))),
    ['stages[0].id'],
  );
});

test('polish must be a boolean, not a truthy string', () => {
  assert.deepEqual(fields(validateState(withPatch({ polish: 'yes' }))), ['polish']);
});

test('a future contract version is refused rather than guessed at', () => {
  const violations = validateState(withPatch({ contractVersion: CONTRACT_VERSION + 1 }));
  assert.deepEqual(fields(violations), ['contractVersion']);
  assert.match(violations[0]?.message ?? '', /newer than this build knows/);
});

test('a non-integer contract version is reported', () => {
  assert.deepEqual(fields(validateState(withPatch({ contractVersion: '1' }))), ['contractVersion']);
  assert.deepEqual(fields(validateState(withPatch({ contractVersion: 1.5 }))), ['contractVersion']);
  assert.deepEqual(fields(validateState(withPatch({ contractVersion: 0 }))), ['contractVersion']);
});

test('a deferred requirement without a reason is reported', () => {
  const violations = validateState(withPatch({
    requirements: [{ id: 'R01', status: 'deferred' }],
  }));
  assert.deepEqual(fields(violations), ['requirements[0].reason']);
  assert.match(violations[0]?.message ?? '', /has no recorded reason/);
});

test('a dropped requirement without a reason is reported', () => {
  assert.deepEqual(
    fields(validateState(withPatch({ requirements: [{ id: 'R01', status: 'dropped' }] }))),
    ['requirements[0].reason'],
  );
});

test('an open requirement without a reason is reported', () => {
  assert.deepEqual(
    fields(validateState(withPatch({ requirements: [{ id: 'R01', status: 'open' }] }))),
    ['requirements[0].reason'],
  );
});

test('a whitespace-only reason does not count as a reason', () => {
  assert.deepEqual(
    fields(validateState(withPatch({
      requirements: [{ id: 'R01', status: 'deferred', reason: '   ' }],
    }))),
    ['requirements[0].reason'],
  );
});

test('an in-spec requirement needs no reason', () => {
  assert.deepEqual(
    validateState(withPatch({ requirements: [{ id: 'R01', status: 'in-spec' }] })),
    [],
  );
});

test('a task tracing to no requirement is reported', () => {
  const violations = validateState(withPatch({
    tasks: [{ id: '01', title: 't', requirementIds: [], status: 'queued', blockedBy: [] }],
  }));
  assert.deepEqual(fields(violations), ['tasks[0].requirementIds']);
  assert.match(violations[0]?.message ?? '', /traces to no/);
});

test('a non-string requirement id inside a task is reported by position', () => {
  assert.deepEqual(
    fields(validateState(withPatch({
      tasks: [{ id: '01', title: 't', requirementIds: ['R01', 7], status: 'queued', blockedBy: [] }],
    }))),
    ['tasks[0].requirementIds[1]'],
  );
});

test('a list field given a non-list is reported once', () => {
  assert.deepEqual(fields(validateState(withPatch({ stages: {} }))), ['stages']);
  assert.deepEqual(fields(validateState(withPatch({ gates: 'none' }))), ['gates']);
});

test('an unknown gate id is reported', () => {
  assert.deepEqual(
    fields(validateState(withPatch({ gates: [{ id: 'G9', status: 'pending', findings: [] }] }))),
    ['gates[0].id'],
  );
});

test('a dial change pointing at an unknown phase is reported', () => {
  assert.deepEqual(
    fields(validateState(withPatch({
      dialChanges: [{ dial: 'mode', from: 'semi', to: 'full', atPhase: 'bootstrap' }],
    }))),
    ['dialChanges[0].atPhase'],
  );
});

test('optional timestamps are optional but must be strings when present', () => {
  assert.deepEqual(validateState(withPatch({ finishedAt: '2026-08-19T18:00:00Z' })), []);
  assert.deepEqual(fields(validateState(withPatch({ interruptedAt: 1 }))), ['interruptedAt']);
});

test('every violation is reported, not just the first', () => {
  const violations = validateState(withPatch({
    mode: 'autopilot',
    depth: 'shallow',
    polish: 'yes',
  }));
  assert.deepEqual(fields(violations).sort(), ['depth', 'mode', 'polish']);
});
