// Completion regressions keep defect copies outside production evidence and root budgets stable.

import test from 'node:test';
import assert from 'node:assert/strict';
import { controlledState, sourceVerifiedState } from './fixtures/verification.ts';
import { validateState } from './validate.ts';
import { deriveVerification, validateVerificationTransition } from './verification.ts';
import { checkG3 } from '../gates/check-g3.ts';
import { checkG4 } from '../gates/check-g4.ts';

const active = (state: ReturnType<typeof sourceVerifiedState>) => {
  state.lifecycle = 'active'; delete state.outcome; delete state.finishedAt;
  state.gates[3]!.status = 'pending'; state.verification!.acceptanceRounds = [];
  return state;
};

test('healthy production remains passed when an isolated defect fails the unchanged assertion', () => {
  const state = controlledState();
  assert.deepEqual(validateState(state), []);
  assert.equal(deriveVerification(state).checkResults['C-1'], 'passed');
  assert.equal(deriveVerification(state).g4, 'passed');
  assert.deepEqual(checkG4(state), []);
});

test('an always-passing detector cannot claim a successful negative control', () => {
  const state = controlledState();
  const mutated = state.verification!.negativeControls[0]!.runs[1]!;
  mutated.result = 'passed'; mutated.assertions[0]!.result = 'passed';
  assert.ok(validateState(state).some(item => item.message.includes('detect the expected assertion')));
});

test('missed detection yields a blocking check-quality finding despite healthy production', () => {
  const state = active(controlledState());
  const record = state.verification!;
  const control = record.negativeControls[0]!;
  control.result = 'failed'; control.findingId = 'F-quality';
  control.runs[1]!.result = 'passed'; control.runs[1]!.assertions[0]!.result = 'passed';
  record.findings.push({ id: 'F-quality', requirementIds: ['R01'], obligationIds: ['O-1'],
    checkIds: ['C-1'], evidenceIds: ['ENC-2'], origin: 'coordinator', description: 'Detector missed disabled handler', status: 'open' });
  state.gates[3]!.status = 'failed';
  assert.deepEqual(validateState(state), []);
  assert.equal(deriveVerification(state).checkResults['C-1'], 'passed');
  assert.equal(deriveVerification(state).g4, 'failed');
  assert.ok(checkG4(state).some(item => item.requirementId === 'R01'));
});

test('a selected unavailable control leaves only affected verification incomplete', () => {
  const state = active(controlledState());
  const control = state.verification!.negativeControls[0]!;
  control.result = 'unavailable'; control.runs = []; control.limitation = 'Isolated browser unavailable';
  assert.deepEqual(validateState(state), []);
  assert.equal(deriveVerification(state).obligationResults['O-1'], 'incomplete');
  assert.equal(deriveVerification(state).g4, 'pending');
});

test('a stale control is not reused after the integrated build changes', () => {
  const state = active(controlledState());
  state.verification!.checks[0]!.currentFingerprint.build = 'new-build';
  assert.equal(deriveVerification(state).g4, 'pending');
});

test('unit passes cannot replace a journey with an unobserved restart transition', () => {
  const state = active(sourceVerifiedState());
  const record = state.verification!;
  record.checks[0]!.procedure = ['Save record', 'Restart', 'Reopen'];
  record.journeys.push({ id: 'J-1', requirementIds: ['R01'], obligationIds: ['O-1'], checkIds: ['C-1'],
    fixture: 'Three saved entries', variantIds: ['desktop'],
    steps: [{ action: 'Save record', assertion: 'Saved' }, { action: 'Restart', assertion: 'Still saved after restart' },
      { action: 'Reopen', assertion: 'Entries visible' }], integrationDependencies: ['01'], executionTaskId: '01',
    targetRevision: 1, reset: 'Empty local disposable data', cleanup: 'Remove test data' });
  assert.deepEqual(validateState(state), []);
  assert.deepEqual(checkG3(state), []);
  assert.equal(deriveVerification(state).requirementResults['R01'], 'incomplete');
  record.executions[0]!.result = 'failed';
  record.executions[0]!.assertions.push({ name: 'Still saved after restart', result: 'failed', evidenceIds: ['E-1'] });
  state.gates[3]!.status = 'failed';
  assert.equal(deriveVerification(state).requirementResults['R01'], 'failed');
});

test('empty journeys and invalid control isolation cannot establish completion', () => {
  const state = controlledState();
  state.verification!.negativeControls[0]!.isolationFingerprint = state.verification!.negativeControls[0]!.mainFingerprint.build;
  assert.ok(validateState(state).some(item => item.message.includes('disposable workspace')));
});

test('renaming a finding or omitting predecessor cannot reset repair identity', () => {
  const state = active(sourceVerifiedState());
  const record = state.verification!;
  record.findings.push({ id: 'F-root', requirementIds: ['R01'], obligationIds: ['O-1'], checkIds: ['C-1'],
    evidenceIds: ['E-1'], origin: 'coordinator', description: 'Startup fails', status: 'open' },
    { id: 'F-renamed', supersedes: 'F-root', requirementIds: ['R01'], obligationIds: ['O-1'], checkIds: ['C-1'],
      evidenceIds: ['E-1'], origin: 'coordinator', description: 'Renamed startup failure', status: 'open' });
  state.gates[3]!.status = 'failed';
  const first = { id: 'RA-1', findingId: 'F-root', rootFindingId: 'F-root', taskId: '01',
    at: state.updatedAt!, outcome: 'still_failing' as const, hypothesis: 'Wrong import', diagnosis: 'Launch error',
    evidenceIds: ['E-1'], strategy: 'minimal_reproduction' as const, action: 'Reproduce startup', followUpCheckIds: ['C-1'] };
  record.repairAttempts.push(first, { ...first, id: 'RA-2', findingId: 'F-renamed', rootFindingId: 'F-renamed' });
  assert.ok(validateState(state).some(item => item.message.includes('stable root')));
  record.repairAttempts[1]!.rootFindingId = 'F-root';
  assert.ok(validateState(state).some(item => item.message.includes('predecessor')));
  record.repairAttempts[1]!.predecessorId = 'RA-1';
  assert.ok(validateState(state).some(item => item.message.includes('independent accepted diagnosis')));
  Object.assign(record.repairAttempts[1]!, { diagnosisDispatchId: 'actual-dispatch-2', diagnosisReturnId: 'actual-return-2', novelty: 'accepted' });
  assert.deepEqual(validateState(state), []);
  record.repairAttempts.push({ ...record.repairAttempts[1]!, id: 'RA-3', predecessorId: 'RA-2' });
  assert.ok(validateState(state).some(item => item.message.includes('budget exceeded for stable failure')));
});

test('published repair budgets and selected controls cannot be erased to escape failure', () => {
  const before = controlledState();
  const next = structuredClone(before);
  next.verification!.negativeControls = [];
  next.verification!.repairLimits.total += 1;
  const errors = validateVerificationTransition(before, next);
  assert.ok(errors.some(item => item.field === 'verification.repairLimits'));
  assert.ok(errors.some(item => item.field.startsWith('verification.negativeControls')));
});
