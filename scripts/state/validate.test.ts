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
      { id: 'preflight', status: 'done', startedAt: '2026-08-19T09:00:00Z', finishedAt: '2026-08-19T09:03:40Z' },
      { id: 'manifest', status: 'active', startedAt: '2026-08-19T09:03:40Z' },
    ],
    currentStage: 'manifest',
    tasks: [
      {
        id: '01', title: 'Build the hero section', requirementIds: ['R01'],
        status: 'queued', blockedBy: [],
        wave: 1, zone: ['src/hero/'], retries: 0, repairs: 0, handoffs: 0, files: [],
        commits: [],
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

test('the register is optional, checked when present, and absent is not normal', () => {
  // Absent: every прогон finished before the register existed looks like this,
  // and calling one of those corrupt is the wrong sentence.
  assert.deepEqual(validateState(baseline()), []);
  assert.equal(baseline().explain, undefined);

  assert.deepEqual(validateState(withPatch({ explain: 'plain' })), []);
  assert.deepEqual(validateState(withPatch({ explain: 'normal' })), []);

  const violations = validateState(withPatch({ explain: 'simple' }));
  assert.deepEqual(fields(violations), ['explain']);
  assert.match(violations[0]?.message ?? '', /plain, normal/);

  // `null` is a pinned-nothing answer in the project's config file, never a
  // value of the field itself.
  assert.deepEqual(fields(validateState(withPatch({ explain: null }))), ['explain']);
});

test('the language is optional, checked when present, and absent is not ru', () => {
  // The register's own rule, inherited exactly: a state written before the
  // language dial existed carries none, and supplying one on the writer's
  // behalf would report a choice nobody made.
  assert.deepEqual(validateState(baseline()), []);
  assert.equal(baseline().language, undefined);

  assert.deepEqual(validateState(withPatch({ language: 'ru' })), []);
  assert.deepEqual(validateState(withPatch({ language: 'en' })), []);

  const violations = validateState(withPatch({ language: 'de' }));
  assert.deepEqual(fields(violations), ['language']);
  assert.match(violations[0]?.message ?? '', /ru, en/);

  assert.deepEqual(fields(validateState(withPatch({ language: null }))), ['language']);
});

test('a well-formed claim on the прогон passes, and absent is unclaimed', () => {
  // Absent means nobody claimed this прогон, not that it is free to take
  // silently: the field arrived after contract 2 was in use, so every state
  // written before it lacks one.
  assert.equal(baseline().heldBy, undefined);
  assert.deepEqual(validateState(baseline()), []);

  assert.deepEqual(
    validateState(withPatch({ heldBy: { token: 'k7f2', since: '2026-08-20T20:59:00Z' } })),
    [],
  );
});

test('a claim with no token names nobody and is reported', () => {
  const violations = validateState(withPatch({ heldBy: { since: '2026-08-20T20:59:00Z' } }));
  assert.deepEqual(fields(violations), ['heldBy.token']);
});

test('a claim whose since no reader can parse is its own finding', () => {
  // Said separately from a missing `since` because the repair differs: one
  // field has to be written, the other has to be corrected.
  const violations = validateState(withPatch({ heldBy: { token: 'k7f2', since: 'yesterday' } }));
  assert.deepEqual(fields(violations), ['heldBy.since']);
  assert.match(violations[0]?.message ?? '', /not a moment/);

  assert.deepEqual(
    fields(validateState(withPatch({ heldBy: { token: 'k7f2' } }))),
    ['heldBy.since'],
  );
  assert.deepEqual(fields(validateState(withPatch({ heldBy: 'k7f2' }))), ['heldBy']);
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
    fields(validateState(withPatch({ stages: [{ id: 'bootstrap', status: 'done',
      startedAt: '2026-08-19T09:00:00Z', finishedAt: '2026-08-19T09:03:40Z' }] }))),
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

test('a repaired таск carries both its commits, and an unfinished one carries none', () => {
  // Two commits is the case the field exists for: the таск landed, came back,
  // and landed again, and the first is what its original review was written
  // against.
  const twice = { ...baseline().tasks[0], commits: ['a1b2c3d', '9f8e7d6'] };
  assert.deepEqual(validateState(withPatch({ tasks: [twice] })), []);

  // Empty is the ordinary state of a таск that has not landed. The list is
  // written when the таск is cut, like every other list here, so nothing
  // downstream increments it from `undefined`.
  const none = { ...baseline().tasks[0], commits: [] };
  assert.deepEqual(validateState(withPatch({ tasks: [none] })), []);
});

test('a таск carrying no commits list at all is reported at contract 3', () => {
  const state: Record<string, unknown> = { ...baseline() };
  const task: Record<string, unknown> = { ...baseline().tasks[0] };
  delete task['commits'];
  state['tasks'] = [task];

  assert.deepEqual(fields(validateState(state)), ['tasks[0].commits']);
});

test('a commit that is not a non-empty string is reported by its own index', () => {
  const violations = validateState(withPatch({
    tasks: [{ ...baseline().tasks[0], commits: ['a1b2c3d', 7, ''] }],
  }));

  // Named one by one: a list reported as a whole makes the caller count the
  // elements to find the one that is wrong.
  assert.deepEqual(fields(violations), ['tasks[0].commits[1]', 'tasks[0].commits[2]']);
  assert.deepEqual(fields(validateState(withPatch({
    tasks: [{ ...baseline().tasks[0], commits: 'a1b2c3d' }],
  }))), ['tasks[0].commits']);
});

test('a таск written before the list existed is not a таск that lost it', () => {
  // Contract 2 named a single `commit`. Demanding the list of a прогон that
  // predates it would turn "this run is older" into "this run is corrupt" —
  // the same courtesy contract 1 is shown above.
  const state: Record<string, unknown> = { ...baseline(), contractVersion: 2 };
  const task: Record<string, unknown> = { ...baseline().tasks[0], commit: 'a1b2c3d' };
  delete task['commits'];
  state['tasks'] = [task];

  assert.deepEqual(validateState(state), []);
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

/**
 * The стадии of a прогон that ran without a hole, as far as `review`.
 *
 * Each entry closes exactly where the next one opens, which is what the state
 * contract asks of a стадия opened by the same write that closed the one before.
 */
function chain(): Record<string, unknown>[] {
  return [
    { id: 'preflight', status: 'done', startedAt: '2026-08-19T18:39:12Z', finishedAt: '2026-08-19T18:42:30Z' },
    { id: 'manifest', status: 'done', startedAt: '2026-08-19T18:42:30Z', finishedAt: '2026-08-19T18:52:40Z' },
    { id: 'briefing', status: 'done', startedAt: '2026-08-19T18:52:40Z', finishedAt: '2026-08-19T18:52:40Z' },
    { id: 'spec', status: 'done', startedAt: '2026-08-19T18:52:40Z', finishedAt: '2026-08-19T19:04:10Z' },
    { id: 'plan', status: 'done', startedAt: '2026-08-19T19:04:10Z', finishedAt: '2026-08-19T19:06:52Z' },
    { id: 'build', status: 'done', startedAt: '2026-08-19T19:06:52Z', finishedAt: '2026-08-19T19:56:51Z' },
    { id: 'review', status: 'active', startedAt: '2026-08-19T19:56:51Z' },
  ];
}

test('стадии that meet exactly are not a finding', () => {
  assert.deepEqual(
    validateState(withPatch({ stages: chain(), currentStage: 'review' })),
    [],
  );
});

test('an interval belonging to no стадия is reported with both ids and its length', () => {
  // The real hole, from the board-sizes прогон: build closed at 19:56:51 and
  // review did not open until 20:31:24. Nothing owned the 34 minutes between.
  const stages = chain();
  stages[6] = { id: 'review', status: 'active', startedAt: '2026-08-19T20:31:24Z' };

  const violations = validateState(withPatch({ stages, currentStage: 'review' }));
  assert.deepEqual(fields(violations), ['stages[review].startedAt']);
  assert.match(violations[0]!.message, /34m 33s/);
  assert.match(violations[0]!.message, /"build"/);
  assert.match(violations[0]!.message, /"review"/);
});

test('a skipped стадия is stepped over rather than breaking the chain', () => {
  const stages = chain();
  // Briefing asked nothing, so it was skipped rather than run: spec opens where
  // manifest closed, and the стадия between them owns no time at all.
  stages[2] = { id: 'briefing', status: 'skipped', note: 'no genuine fork to ask about' };

  assert.deepEqual(
    validateState(withPatch({ stages, currentStage: 'review' })),
    [],
  );

  // Stepping over it does not excuse the neighbours from meeting.
  stages[3] = { id: 'spec', status: 'done', startedAt: '2026-08-19T19:00:00Z', finishedAt: '2026-08-19T19:04:10Z' };
  assert.deepEqual(
    fields(validateState(withPatch({ stages, currentStage: 'review' }))),
    ['stages[spec].startedAt'],
  );
});

test('a стадия still running is compared against nothing', () => {
  // `review` is active and has no `finishedAt`; `acceptance` has not started.
  // There is no interval yet, so there is nothing to report.
  const stages = chain();
  stages.push({ id: 'acceptance', status: 'pending' });

  assert.deepEqual(
    validateState(withPatch({ stages, currentStage: 'review' })),
    [],
  );
});

test('стадии written out of order are reported as an overlap, not as a gap', () => {
  const stages = chain();
  stages[6] = { id: 'review', status: 'active', startedAt: '2026-08-19T19:50:51Z' };

  const violations = validateState(withPatch({ stages, currentStage: 'review' }));
  assert.deepEqual(fields(violations), ['stages[review].startedAt']);
  assert.match(violations[0]!.message, /overlap by 6m/);
});

// Closing the one that ended and opening the one that begins is a single write,
// and the half that gets forgotten is the closing one. It arrives on screen as a
// second lit стадия and a clock running on a phase that finished; downstream it
// arrives as an interval `scripts/metrics/` attributes to nobody.
test('two стадии active at once are reported, and both are named', () => {
  // `acceptance` was opened without a stamp, so the chain has nothing to
  // measure `review` against — this is the case the count exists for.
  //
  // The unstamped стадия is two findings, not one, and they are two sentences
  // rather than a repetition: `acceptance` carries no `startedAt`, and two
  // стадии are open at once. Either could be true without the other, and the
  // repair differs — one is a missing stamp, the other a missing close.
  const stages = chain();
  stages.push({ id: 'acceptance', status: 'active' });

  const violations = validateState(withPatch({ stages, currentStage: 'acceptance' }));
  assert.deepEqual(fields(violations), ['stages[7].startedAt', 'stages']);

  const counted = violations.find(violation => violation.field === 'stages')!;
  assert.match(counted.message, /2 стадии are active at once/);
  assert.match(counted.message, /"review"/);
  assert.match(counted.message, /"acceptance"/);
});

test('three стадии active at once are one finding, not two', () => {
  const stages = chain();
  stages[4] = { id: 'plan', status: 'active', startedAt: '2026-08-19T19:04:10Z' };
  stages[5] = { id: 'build', status: 'active' };

  const counted = validateState(withPatch({ stages, currentStage: 'build' }))
    .filter(violation => violation.field === 'stages');
  assert.equal(counted.length, 1);
  assert.match(counted[0]!.message, /3 стадии are active at once/);
  assert.match(counted[0]!.message, /"plan", "build", "review"/);
});

test('a прогон whose стадии are all closed says nothing about how many are open', () => {
  const stages = chain();
  stages[6] = { id: 'review', status: 'done', startedAt: '2026-08-19T19:56:51Z', finishedAt: '2026-08-19T20:10:00Z' };

  assert.deepEqual(validateState(withPatch({ stages, currentStage: 'review' })), []);
});

test('a стадия left open behind one that has already started is reported', () => {
  // The defect itself: `spec` never got its `finishedAt`, and the write that
  // was supposed to add it opened `plan` instead. Both timestamps used to be
  // unparseable on one side, and the chain gave up rather than reporting it.
  const stages = chain();
  stages[3] = { id: 'spec', status: 'active', startedAt: '2026-08-19T18:52:40Z' };
  stages[6] = { id: 'review', status: 'done', startedAt: '2026-08-19T19:56:51Z', finishedAt: '2026-08-19T20:10:00Z' };

  const violations = validateState(withPatch({ stages, currentStage: 'review' }));
  assert.deepEqual(fields(violations), ['stages[spec].finishedAt']);
  assert.match(violations[0]!.message, /"spec" is still open/);
  assert.match(violations[0]!.message, /"plan" has already started/);
});

test('an open стадия is overtaken across a skipped one just the same', () => {
  const stages = chain();
  stages[2] = { id: 'briefing', status: 'active', startedAt: '2026-08-19T18:52:40Z' };
  stages[3] = { id: 'spec', status: 'skipped', note: 'the бриф was already a specification' };
  stages[6] = { id: 'review', status: 'done', startedAt: '2026-08-19T19:56:51Z', finishedAt: '2026-08-19T20:10:00Z' };

  const violations = validateState(withPatch({ stages, currentStage: 'review' }));
  assert.deepEqual(fields(violations), ['stages[briefing].finishedAt']);
  assert.match(violations[0]!.message, /"plan" has already started/);
});

test('a стадия with no startedAt overtakes nothing', () => {
  // Two стадии missing the stamps their statuses claim. Each is a finding of
  // its own — that is the rule below this one — but neither has overtaken the
  // other, and the overtake rule must stay quiet: there is no stamp on the
  // later стадия to overtake the earlier one with. Reading this shape as an
  // overtake would name `stages[preflight].finishedAt` as the defect and send
  // the repair to the wrong стадия.
  const violations = validateState(withPatch({
    stages: [
      { id: 'preflight', status: 'done', startedAt: '2026-08-19T09:00:00Z' },
      { id: 'manifest', status: 'active' },
    ],
  }));

  assert.deepEqual(fields(violations), ['stages[0].finishedAt', 'stages[1].startedAt']);
});

// A стадия's status is a claim about its clock, and the two are written by the
// same hand. The chain rules above compare neighbours and need both sides
// stamped before they can speak; these speak about one стадия alone, which is
// what makes a half-written entry visible while it is still the only thing
// wrong with the прогон.
test('a done стадия with no finishedAt is reported', () => {
  const stages = chain();
  stages[6] = { id: 'review', status: 'done', startedAt: '2026-08-19T19:56:51Z' };

  const violations = validateState(withPatch({ stages, currentStage: 'review' }));
  assert.deepEqual(fields(violations), ['stages[6].finishedAt']);
  assert.match(violations[0]!.message, /"review" is done and carries no finishedAt/);
});

test('an active стадия with no startedAt is reported', () => {
  const stages = chain();
  stages[6] = { id: 'review', status: 'active' };

  const violations = validateState(withPatch({ stages, currentStage: 'review' }));
  assert.deepEqual(fields(violations), ['stages[6].startedAt']);
  assert.match(violations[0]!.message, /"review" is "active" and carries no startedAt/);
});

test('an active стадия that already carries a finishedAt is reported', () => {
  // The other half of the forgotten write, arriving the other way round: the
  // closing stamp was made and the status was never moved. On screen the clock
  // keeps running on a phase with a recorded end.
  const stages = chain();
  stages[6] = {
    id: 'review', status: 'active',
    startedAt: '2026-08-19T19:56:51Z', finishedAt: '2026-08-19T20:10:00Z',
  };

  const violations = validateState(withPatch({ stages, currentStage: 'review' }));
  assert.deepEqual(fields(violations), ['stages[6].finishedAt']);
  assert.match(violations[0]!.message, /still active and already carries a finishedAt/);
});

test('a стадия that has not begun carrying a clock is reported', () => {
  const stages = chain();
  stages[6] = {
    id: 'review', status: 'done',
    startedAt: '2026-08-19T19:56:51Z', finishedAt: '2026-08-19T20:10:00Z',
  };
  stages.push({ id: 'acceptance', status: 'pending', startedAt: '2026-08-19T20:10:00Z' });

  const violations = validateState(withPatch({ stages, currentStage: 'review' }));
  assert.deepEqual(fields(violations), ['stages[7].startedAt']);
  assert.match(violations[0]!.message, /"acceptance" has not begun and carries a startedAt/);
});

test('a failed стадия is asked for its startedAt and nothing more', () => {
  // Nothing in the bundle writes a failed стадия and the contract does not say
  // whether one closes, so `finishedAt` is not demanded of it. That it began
  // is not in question: a стадия cannot fail before it starts.
  const stages = chain();
  stages[6] = { id: 'review', status: 'failed' };
  assert.deepEqual(
    fields(validateState(withPatch({ stages, currentStage: 'review' }))),
    ['stages[6].startedAt'],
  );

  stages[6] = { id: 'review', status: 'failed', startedAt: '2026-08-19T19:56:51Z' };
  assert.deepEqual(validateState(withPatch({ stages, currentStage: 'review' })), []);
});

test('a stamp that is not a moment is reported as such, not as a missing one', () => {
  // The rules above take a present stamp for a clock. `Date.parse` is what
  // every reader of this state uses, so a string it returns NaN for is a стадия
  // with no readable clock — and saying "carries no startedAt" would send the
  // repair to a field that is already there.
  const stages = chain();
  stages[6] = { id: 'review', status: 'done', startedAt: 'вчера', finishedAt: 'потом' };

  const violations = validateState(withPatch({ stages, currentStage: 'review' }));
  assert.deepEqual(fields(violations), ['stages[6].startedAt', 'stages[6].finishedAt']);
  assert.match(violations[0]!.message, /carries a startedAt that is not a moment: "вчера"/);
  assert.match(violations[1]!.message, /carries a finishedAt that is not a moment: "потом"/);
});

test('a стадия that has not begun is told once, whatever its stamp says', () => {
  // Two findings on one field would be one finding too many: the стадия owns no
  // clock at all, so the repair is to drop the field rather than correct it.
  const stages = chain();
  stages[6] = {
    id: 'review', status: 'done',
    startedAt: '2026-08-19T19:56:51Z', finishedAt: '2026-08-19T20:10:00Z',
  };
  stages.push({ id: 'acceptance', status: 'pending', startedAt: 'скоро' });

  const violations = validateState(withPatch({ stages, currentStage: 'review' }));
  assert.deepEqual(fields(violations), ['stages[7].startedAt']);
  assert.match(violations[0]!.message, /has not begun and carries a startedAt/);
});

test('a стадия that only looks unstamped keeps the meeting rule honest', () => {
  // An empty string is not a stamp. Before this was said, it satisfied the
  // presence rules and then reached `Date.parse` as NaN, where the chain gave
  // up — so a стадия could claim to be closed and own no closing moment.
  const stages = chain();
  stages[5] = {
    id: 'build', status: 'done',
    startedAt: '2026-08-19T19:06:52Z', finishedAt: '',
  };

  const violations = validateState(withPatch({ stages, currentStage: 'review' }));
  assert.deepEqual(fields(violations), ['stages[5].finishedAt', 'stages[build].finishedAt']);
  assert.match(violations[0]!.message, /is done and carries no finishedAt/);
  assert.match(violations[1]!.message, /"build" is still open, and "review" has already started/);
});

test('a skipped стадия is asked for no stamps, and is allowed the ones it has', () => {
  // The contract says a skipped стадия needs no timestamps of its own. Needing
  // none is not the same as being forbidden them, and inventing the stricter
  // reading here would fail прогоны that recorded when they stepped over it.
  const stages = chain();
  stages[2] = {
    id: 'briefing', status: 'skipped', note: 'no genuine fork to ask about',
    startedAt: '2026-08-19T18:52:40Z', finishedAt: '2026-08-19T18:52:40Z',
  };

  assert.deepEqual(validateState(withPatch({ stages, currentStage: 'review' })), []);
});

// `currentStage` is what the page shows: `currentStage()` in `dashboard.html`
// takes the entry with this id and searches for the active стадия only when no
// entry has it. A value naming a стадия that has not begun therefore chooses
// the wrong phase on screen, and used to do it in silence.
test('currentStage naming a стадия that has not begun is reported', () => {
  const stages = chain();
  stages.push({ id: 'acceptance', status: 'pending' });

  const violations = validateState(withPatch({ stages, currentStage: 'acceptance' }));
  assert.deepEqual(fields(violations), ['currentStage']);
  assert.match(violations[0]!.message, /"acceptance", a стадия that has not begun/);
});

test('currentStage naming the стадия that is running, or one that is finished, is not', () => {
  const stages = chain();
  assert.deepEqual(validateState(withPatch({ stages, currentStage: 'review' })), []);

  // The shape of a прогон that reached the end: nothing is open, and the field
  // names the стадия it stopped at.
  const closed = chain();
  closed[6] = {
    id: 'review', status: 'done',
    startedAt: '2026-08-19T19:56:51Z', finishedAt: '2026-08-19T20:10:00Z',
  };
  assert.deepEqual(validateState(withPatch({ stages: closed, currentStage: 'review' })), []);
});

test('currentStage naming a стадия absent from the list says nothing', () => {
  // The same stance the chain takes on a стадия it cannot find: a record that
  // does not mention a стадия says nothing about it, and a fixture listing two
  // of the eight is not a прогон that lost six.
  assert.deepEqual(validateState(withPatch({ currentStage: 'build' })), []);
});

test('a стадия missing from the list breaks the chain rather than inventing a hole', () => {
  // A fixture that records preflight and build and nothing between them says
  // nothing about where the four стадии in the middle went. Reporting the span
  // as an interval owned by nobody would be a guess, and the wrong defect.
  assert.deepEqual(
    validateState(withPatch({
      stages: [
        { id: 'preflight', status: 'done', startedAt: '2026-08-19T09:00:00Z', finishedAt: '2026-08-19T09:02:00Z' },
        { id: 'build', status: 'done', startedAt: '2026-08-19T09:10:00Z', finishedAt: '2026-08-19T09:40:00Z' },
      ],
      currentStage: 'build',
    })),
    [],
  );
});
