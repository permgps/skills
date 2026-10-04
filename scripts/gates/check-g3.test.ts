import test from 'node:test';
import assert from 'node:assert/strict';

import { checkG3, type GateFinding } from './check-g3.ts';
import { verifiedState } from '../state/fixtures/verification.ts';
import {
  CONTRACT_VERSION,
  type RequirementEntry,
  type RunState,
  type TaskEntry,
} from '../state/contract.ts';

function task(id: string, requirementIds: string[]): TaskEntry {
  return { id, title: `build ${id}`, requirementIds, status: 'queued', blockedBy: [] };
}

function stateWith(
  requirements: RequirementEntry[],
  tasks: TaskEntry[],
  gates: RunState['gates'] = [{ id: 'G3', status: 'pending', findings: [] }],
): RunState {
  return {
    contractVersion: CONTRACT_VERSION,
    runId: 'run-1',
    slug: 'landing-page',
    startedAt: '2026-08-19T09:00:00Z',
    mode: 'semi',
    depth: 'normal',
    polish: false,
    dialChanges: [],
    stages: [{ id: 'plan', status: 'done' }],
    currentStage: 'build',
    tasks,
    requirements,
    gates,
  };
}

const ids = (findings: GateFinding[]): string[] => findings.map(f => f.requirementId);

test('V03/V09: source signature cannot replace the required menu behavior check', () => {
  const state = verifiedState();
  state.verification!.checks[0]!.method = 'source-signature';
  assert.ok(checkG3(state).some(item => /source-only check C-1/.test(item.message)));
});

test('V05: a required check needs an execution owner and integration prerequisites', () => {
  const state = verifiedState();
  delete state.verification!.checks[0]!.executionTaskId;
  state.verification!.checks[0]!.integrationDependencies = [];
  const findings = checkG3(state);
  assert.ok(findings.some(item => /check C-1 has no matching execution owner/.test(item.message)));
  assert.ok(findings.some(item => /omits implementation prerequisite 01/.test(item.message)));
});

test('a verification-only task can own the check without implementation ownership', () => {
  const state = verifiedState();
  state.tasks.push({ ...state.tasks[0]!, id: '02', title: 'Verify menu', blockedBy: ['01'] });
  state.verification!.obligations[0]!.implementationTaskIds = [];
  state.verification!.checks[0]!.executionTaskId = '02';
  state.verification!.checks[0]!.integrationDependencies = ['01'];
  assert.deepEqual(checkG3(state), []);
});

test('a cyclic task graph is rejected at G3', () => {
  const state = verifiedState();
  state.tasks[0]!.blockedBy = ['01'];
  assert.ok(checkG3(state).some(item => /dependency cycle/.test(item.message)));
});

test('a map that holds in both directions passes', () => {
  assert.deepEqual(checkG3(stateWith(
    [
      { id: 'R01', status: 'in-spec' },
      { id: 'R02', status: 'in-spec' },
      { id: 'R03', status: 'deferred', reason: 'the user postponed it' },
    ],
    [task('01', ['R01']), task('02', ['R01', 'R02'])],
  )), []);
});

test('an in-spec требование no таск builds is reported', () => {
  const findings = checkG3(stateWith(
    [{ id: 'R01', status: 'in-spec' }, { id: 'R02', status: 'in-spec' }],
    [task('01', ['R01'])],
  ));
  assert.deepEqual(ids(findings), ['R02']);
  assert.match(findings[0]?.message ?? '', /dropped between the specification and the cut/);
});

test('a таск tracing to a требование that is not in the манифест is reported', () => {
  const findings = checkG3(stateWith(
    [{ id: 'R01', status: 'in-spec' }],
    [task('01', ['R01']), task('02', ['R99'])],
  ));
  assert.deepEqual(ids(findings), ['R99']);
  assert.match(findings[0]?.message ?? '', /not in the манифест/);
});

test('a таск building a deferred требование is work nobody asked for', () => {
  const findings = checkG3(stateWith(
    [
      { id: 'R01', status: 'in-spec' },
      { id: 'R02', status: 'deferred', reason: 'the user postponed it' },
    ],
    [task('01', ['R01']), task('02', ['R02'])],
  ));
  assert.deepEqual(ids(findings), ['R02']);
  assert.match(findings[0]?.message ?? '', /work nobody asked for/);
});

test('a таск building a dropped требование is reported the same way', () => {
  const findings = checkG3(stateWith(
    [
      { id: 'R01', status: 'in-spec' },
      { id: 'R02', status: 'dropped', reason: 'the user withdrew it' },
    ],
    [task('01', ['R01']), task('02', ['R02'])],
  ));
  assert.deepEqual(ids(findings), ['R02']);
});

test('a deferred требование reached by no таск is not a finding', () => {
  // Only in-spec требования must reach a таск. A deferred one reaching none is
  // exactly what deferring it meant.
  assert.deepEqual(checkG3(stateWith(
    [
      { id: 'R01', status: 'in-spec' },
      { id: 'R02', status: 'deferred', reason: 'the user postponed it' },
    ],
    [task('01', ['R01'])],
  )), []);
});

test('a duplicated таск id is reported', () => {
  const findings = checkG3(stateWith(
    [{ id: 'R01', status: 'in-spec' }],
    [task('01', ['R01']), task('01', ['R01'])],
  ));
  assert.deepEqual(ids(findings), ['01']);
  assert.match(findings[0]?.message ?? '', /appears more than once/);
});

test('one таск may serve several требования, and several таски one требование', () => {
  assert.deepEqual(checkG3(stateWith(
    [{ id: 'R01', status: 'in-spec' }, { id: 'R02', status: 'in-spec' }],
    [task('01', ['R01', 'R02']), task('02', ['R01'])],
  )), []);
});

test('a tiny plan is one таск carrying every in-spec требование', () => {
  // The smallest valid plan: one таск, no decomposition, still traceable.
  assert.deepEqual(checkG3(stateWith(
    [{ id: 'R01', status: 'in-spec' }, { id: 'R02', status: 'in-spec' }],
    [task('01', ['R01', 'R02'])],
  )), []);
});

test('zero таски against a live требование fails — it reached nobody', () => {
  const findings = checkG3(stateWith([{ id: 'R01', status: 'in-spec' }], []));
  assert.deepEqual(ids(findings), ['R01']);
});

test('a манифест with nothing in-spec and no таски passes', () => {
  // Every требование deferred or dropped is G2's business, not G3's. With
  // nothing live, an empty cut is the correct cut.
  assert.deepEqual(checkG3(stateWith(
    [{ id: 'R01', status: 'deferred', reason: 'the user postponed the whole thing' }],
    [],
  )), []);
});

test('every unmatched entry is reported, on both sides at once', () => {
  const findings = checkG3(stateWith(
    [{ id: 'R01', status: 'in-spec' }, { id: 'R02', status: 'in-spec' }],
    [task('01', ['R99'])],
  ));
  assert.deepEqual(ids(findings).sort(), ['R01', 'R02', 'R99']);
});

test('a таск with no id is named by its index in the finding it causes', () => {
  // Two unnamed таски are not duplicates of each other — they are two таски
  // each missing an id, which the state validator refuses before a gate runs.
  // What the gate owes them is a finding that can still be located.
  const findings = checkG3(stateWith(
    [{ id: 'R01', status: 'in-spec' }],
    [task('', ['R01']), task('', ['R99'])],
  ));
  assert.deepEqual(ids(findings), ['R99']);
  assert.match(findings[0]?.message ?? '', /таск tasks\[1\]/);
});

// G3's second half: the reader that is handed exactly what an executor will be
// handed. Its verdict leaves the same trace G2's does, and for the same reason
// — a gate recorded as passed while carrying findings has not been acted on.
const OK: RequirementEntry[] = [{ id: 'R01', status: 'in-spec' }];

test('a run state with no G3 entry is reported — the reader left no verdict', () => {
  const findings = checkG3(stateWith(OK, [task('01', ['R01'])], []));
  assert.equal(findings.length, 1);
  assert.match(findings[0]?.message ?? '', /no G3 entry/);
});

test('G3 passed while carrying findings is reported', () => {
  const findings = checkG3(stateWith(OK, [task('01', ['R01'])], [
    { id: 'G3', status: 'passed', findings: ['T05 does not say what the score counts'] },
  ]));
  assert.equal(findings.length, 1);
  assert.match(findings[0]?.message ?? '', /passed while carrying/);
});

test('G3 failed while carrying findings is honest, not a violation', () => {
  assert.deepEqual(checkG3(stateWith(OK, [task('01', ['R01'])], [
    { id: 'G3', status: 'failed', findings: ['T05 does not say what the score counts'] },
  ])), []);
});

test('C09: two таски writing one route file with no order between them collide', () => {
  const state = stateWith([{ id: 'R01', status: 'in-spec' }], [
    task('01', ['R01']),
    { ...task('08', ['R01']), blockedBy: ['01'], files: ['src/routes/orders.ts', 'src/orders/list.ts'] },
    { ...task('11', ['R01']), blockedBy: ['01'], zone: ['src/routes/orders.ts'] },
  ]);
  const findings = checkG3(state);
  assert.equal(findings.length, 1);
  assert.match(findings[0]!.message, /таски 08 and 11 both write src\/routes\/orders\.ts and neither waits/);
  assert.match(findings[0]!.message, /blockedBy/);
});

test('C09: the same overlap serialized through a third таск passes', () => {
  assert.deepEqual(checkG3(stateWith([{ id: 'R01', status: 'in-spec' }], [
    { ...task('08', ['R01']), files: ['src/routes/orders.ts'] },
    { ...task('09', ['R01']), blockedBy: ['08'] },
    { ...task('11', ['R01']), blockedBy: ['09'], files: ['src/routes/orders.ts'] },
  ])), []);
});

test('C09: an execution owner reaching its prerequisite through a chain passes', () => {
  const state = verifiedState();
  state.tasks.push({ ...state.tasks[0]!, id: '02', title: 'Wire menu', blockedBy: ['01'], files: [] },
    { ...state.tasks[0]!, id: '03', title: 'Verify menu', blockedBy: ['02'], files: [] });
  state.verification!.obligations[0]!.implementationTaskIds = [];
  state.verification!.checks[0]!.executionTaskId = '03';
  state.verification!.checks[0]!.integrationDependencies = ['01'];
  assert.deepEqual(checkG3(state), []);
});

test('C09: an execution owner that never waits for its prerequisite is reported', () => {
  const state = verifiedState();
  state.tasks.push({ ...state.tasks[0]!, id: '02', title: 'Verify menu', blockedBy: [], files: [] });
  state.verification!.obligations[0]!.implementationTaskIds = [];
  state.verification!.checks[0]!.executionTaskId = '02';
  state.verification!.checks[0]!.integrationDependencies = ['01'];
  assert.ok(checkG3(state).some(item =>
    /execution owner 02 of check C-1 does not transitively depend on integration prerequisite 01/.test(item.message)));
});

// A task reader's finding reaches this script only as a recorded string; the
// script never reads a task file. So the regression is that a G3 recorded as
// passed while carrying the stub finding is refused like any other, and a G3
// recorded as failed with it is the honest record.
const STUB_FINDING = 'T02 done means "the list renders the saved rows" — only a stub can meet it: '
  + 'T01, which saves the rows, is not in Depends on';

test('G3 passed while carrying a done means only a stub can meet is reported', () => {
  const findings = checkG3(stateWith(OK, [task('01', ['R01']), task('02', ['R01'])], [
    { id: 'G3', status: 'passed', findings: [STUB_FINDING] },
  ]));
  assert.equal(findings.length, 1);
  assert.match(findings[0]?.message ?? '', /passed while carrying 1 finding/);
});

test('G3 failed while carrying a done means only a stub can meet is honest, not a violation', () => {
  assert.deepEqual(checkG3(stateWith(OK, [task('01', ['R01']), task('02', ['R01'])], [
    { id: 'G3', status: 'failed', findings: [STUB_FINDING] },
  ])), []);
});
