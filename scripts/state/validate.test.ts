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
      {
        id: '01', title: 'Build the hero section', requirementIds: ['R01'],
        status: 'queued', blockedBy: [],
        wave: 1, zone: ['src/hero/'], retries: 0, repairs: 0, handoffs: 0, files: [],
      },
    ],
    requirements: [
      { id: 'R01', status: 'in-spec' },
      { id: 'R02', status: 'deferred', reason: 'no pricing supplied yet' },
    ],
    gates: [{ id: 'G1', status: 'pending', findings: [] }],
    updatedAt: '2026-08-19T09:12:00Z',
    debt: { placeholders: [], assumptions: [], emptyEnv: [] },
    additions: [],
  };
}

/** The same прогон as it would have been written before contract 2 existed. */
function contractOne(): Record<string, unknown> {
  const state: Record<string, unknown> = { ...baseline(), contractVersion: 1 };
  for (const field of ['updatedAt', 'debt', 'additions']) delete state[field];
  state['tasks'] = [
    { id: '01', title: 'Build the hero section', requirementIds: ['R01'], status: 'queued', blockedBy: [] },
  ];
  return state;
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
    // `skipped` used to stand here as the unknown value. Contract 2 made it a
    // real one, so the example moved rather than the rule.
    fields(validateState(withPatch({ stages: [{ id: 'preflight', status: 'paused' }] }))),
    ['stages[0].status'],
  );
  assert.deepEqual(
    fields(validateState(withPatch({
      tasks: [{ ...baseline().tasks[0], status: 'paused' }],
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
    tasks: [{ ...baseline().tasks[0], requirementIds: [] }],
  }));
  assert.deepEqual(fields(violations), ['tasks[0].requirementIds']);
  assert.match(violations[0]?.message ?? '', /traces to no/);
});

test('a non-string requirement id inside a task is reported by position', () => {
  assert.deepEqual(
    fields(validateState(withPatch({
      tasks: [{ ...baseline().tasks[0], requirementIds: ['R01', 7] }],
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

// --- what contract 2 added ---------------------------------------------------

test('a state written under contract 1 is still valid without any contract 2 field', () => {
  // The finished прогон this repository can measure predates every one of them.
  // Reporting it as corrupt would be the wrong sentence about a run nobody can redo.
  assert.deepEqual(validateState(contractOne()), []);
});

test('a contract 2 state missing what contract 2 promised is reported', () => {
  const state: Record<string, unknown> = { ...baseline() };
  for (const field of ['updatedAt', 'debt', 'additions']) delete state[field];
  assert.deepEqual(fields(validateState(state)).sort(), ['additions', 'debt', 'updatedAt']);
});

test('a таск without a wave is reported, and a wave of zero is not a layer', () => {
  const noWave: Record<string, unknown> = { ...baseline().tasks[0] };
  delete noWave['wave'];
  assert.deepEqual(fields(validateState(withPatch({ tasks: [noWave] }))), ['tasks[0].wave']);
  assert.deepEqual(
    fields(validateState(withPatch({ tasks: [{ ...baseline().tasks[0], wave: 0 }] }))),
    ['tasks[0].wave'],
  );
});

test('the three counters must be non-negative integers', () => {
  assert.deepEqual(
    fields(validateState(withPatch({
      tasks: [{ ...baseline().tasks[0], retries: -1, repairs: 1.5, handoffs: 'two' }],
    }))).sort(),
    ['tasks[0].handoffs', 'tasks[0].repairs', 'tasks[0].retries'],
  );
});

test('a skipped stage with no note is reported', () => {
  assert.deepEqual(
    fields(validateState(withPatch({ stages: [{ id: 'briefing', status: 'skipped' }] }))),
    ['stages[0].note'],
  );
  assert.deepEqual(
    validateState(withPatch({
      stages: [{ id: 'briefing', status: 'skipped', note: 'полный автомат — самобрифинг' }],
    })),
    [],
  );
});

test('a placeholder requirement carries what is still missing', () => {
  assert.deepEqual(
    fields(validateState(withPatch({ requirements: [{ id: 'R01', status: 'placeholder' }] }))),
    ['requirements[0].reason'],
  );
  assert.deepEqual(
    validateState(withPatch({
      requirements: [{ id: 'R01', status: 'placeholder', reason: 'awaiting the brand colours' }],
    })),
    [],
  );
});

test('debt.emptyEnv holding a value rather than a name is reported', () => {
  // S2 is never broken on purpose. This is the shape it gets broken by accident.
  assert.deepEqual(
    fields(validateState(withPatch({
      debt: { placeholders: [], assumptions: [], emptyEnv: ['TELEGRAM_BOT_TOKEN=8123:AAF'] },
    }))),
    ['debt.emptyEnv[0]'],
  );
  assert.deepEqual(
    validateState(withPatch({
      debt: { placeholders: [], assumptions: [], emptyEnv: ['TELEGRAM_BOT_TOKEN'] },
    })),
    [],
  );
});

test('a suite result is optional, null, or two counts', () => {
  assert.deepEqual(validateState(withPatch({ tests: null })), []);
  assert.deepEqual(validateState(withPatch({ tests: { passed: 41, failed: 0 } })), []);
  assert.deepEqual(
    fields(validateState(withPatch({ tests: { passed: '41', failed: 0 } }))),
    ['tests.passed'],
  );
});
