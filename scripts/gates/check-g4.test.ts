import test from 'node:test';
import assert from 'node:assert/strict';

import { checkG4, type GateFinding } from './check-g4.ts';
import { contract6State, defect, finding, strategyReview, v3Attempt, verifiedState } from '../state/fixtures/verification.ts';
import {
  CONTRACT_VERSION,
  type GateEntry,
  type RequirementEntry,
  type RunState,
  type TaskEntry,
} from '../state/contract.ts';

function task(id: string, status: TaskEntry['status'] = 'done'): TaskEntry {
  return { id, title: `build ${id}`, requirementIds: ['R01'], status, blockedBy: [] };
}

function stateWith(
  gate: GateEntry | undefined,
  requirements: RequirementEntry[] = [{ id: 'R01', status: 'in-spec' }],
  tasks: TaskEntry[] = [task('01')],
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
    stages: [{ id: 'acceptance', status: 'done' }],
    currentStage: 'acceptance',
    tasks,
    requirements,
    gates: gate === undefined ? [] : [gate],
  };
}

const messages = (findings: GateFinding[]): string => findings.map(f => f.message).join('\n');

test('V14: a structured failed check remains failed after exception closure', () => {
  const state = verifiedState();
  state.outcome = 'closed_with_exceptions';
  state.verification!.executions[0]!.result = 'failed';
  state.gates[3]!.status = 'failed';
  assert.match(messages(checkG4(state)), /R01 has a current failed verification result/);
});

test('V15: a promised acceptance round blocks completed closure', () => {
  const state = verifiedState();
  state.verification!.promisedWork.push({ id: 'P-1', description: 'Repeat acceptance', status: 'open' });
  assert.match(messages(checkG4(state)), /completed closure requires current passing G4/);
  assert.match(messages(checkG4(state)), /open promised work blocks closure/);
});

test('a прогон accepted with nothing disagreeing passes', () => {
  assert.deepEqual(checkG4(stateWith({ id: 'G4', status: 'passed', findings: [] })), []);
});

test('a прогон stopped by приёмка passes this gate when its findings name требования', () => {
  assert.deepEqual(checkG4(stateWith(
    { id: 'G4', status: 'failed', findings: ['R01 — the build has no export button'] },
  )), []);
});

test('a state with no G4 entry is reported', () => {
  const findings = checkG4(stateWith(undefined));
  assert.match(messages(findings), /no G4 entry/);
});

test('a G4 still pending is reported', () => {
  const findings = checkG4(stateWith({ id: 'G4', status: 'pending', findings: [] }));
  assert.match(messages(findings), /still pending/);
});

test('a G4 passed while carrying findings is reported', () => {
  const findings = checkG4(stateWith(
    { id: 'G4', status: 'passed', findings: ['R01 — the build has no export button'] },
  ));
  assert.match(messages(findings), /never passed with notes/);
});

test('a G4 failed while naming nothing is reported', () => {
  const findings = checkG4(stateWith({ id: 'G4', status: 'failed', findings: [] }));
  assert.match(messages(findings), /names nothing/);
});

test('a finding naming no требование is reported', () => {
  const findings = checkG4(stateWith(
    { id: 'G4', status: 'failed', findings: ['the build feels unfinished'] },
  ));
  assert.match(messages(findings), /names no требование/);
});

test('a finding naming a требование that is not in the манифест is reported', () => {
  const findings = checkG4(stateWith(
    { id: 'G4', status: 'failed', findings: ['R99 — nothing satisfies it'] },
  ));
  assert.deepEqual(findings.map(f => f.requirementId), ['R99']);
  assert.match(messages(findings), /not in the манифест/);
});

test('a таск left anywhere but done is reported', () => {
  const findings = checkG4(stateWith(
    { id: 'G4', status: 'passed', findings: [] },
    [{ id: 'R01', status: 'in-spec' }],
    [task('01'), task('02', 'review')],
  ));
  assert.deepEqual(findings.map(f => f.requirementId), ['02']);
  assert.match(messages(findings), /is "review" at приёмка/);
});

test('one finding may name more than one требование', () => {
  assert.deepEqual(checkG4(stateWith(
    { id: 'G4', status: 'failed', findings: ['R01 and R02 are both missing'] },
    [{ id: 'R01', status: 'in-spec' }, { id: 'R02', status: 'in-spec' }],
  )), []);
});

test('C09: a contract-6 run with an open defect cannot close as completed', () => {
  const state = contract6State();
  state.verification!.findings = [finding('F-1', { status: 'resolved' })];
  state.verification!.defects = [defect('DF-1', 'F-1')];
  assert.ok(checkG4(state).some(item => /completed closure leaves defect DF-1 open/.test(item.message)));
  state.verification!.defects[0]!.status = 'superseded';
  assert.ok(!checkG4(state).some(item => /leaves defect/.test(item.message)));
});

test('C09: a run stopped on an exhausted budget needs its budget_exhausted review', () => {
  const state = contract6State();
  state.outcome = 'stopped_incomplete';
  state.verification!.repairLimits = { perFinding: 2, total: 1 };
  state.verification!.repairAttempts = [v3Attempt('RA-1', 'F-1', 'DF-1', '2026-09-29T09:20:00Z')];
  assert.ok(checkG4(state).some(item => /no budget_exhausted strategy review/.test(item.message)));
  state.verification!.strategyReviews = [strategyReview('SR-1', '2026-09-29T09:30:00Z',
    { trigger: 'budget_exhausted', decision: 'stop_incomplete', attemptIds: ['RA-1'] })];
  assert.ok(!checkG4(state).some(item => /budget_exhausted/.test(item.message)));
});
