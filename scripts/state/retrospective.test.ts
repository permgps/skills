// The retrospective as a regression: every exit the failed run took is refused
// by the contract-6 runtime, and the corrected path through the same run is
// accepted. The run itself is synthetic — see fixtures/retrospective.ts.

import test from 'node:test';
import assert from 'node:assert/strict';

import { validateStateTransition } from './closure.ts';
import { strategyReview, v3Attempt } from './fixtures/verification.ts';
import { batchAttempts, bootstrapDenied, correctedReadiness, minute, retrospectiveState } from './fixtures/retrospective.ts';
import { validateState } from './validate.ts';

const messages = (state: unknown): string => validateState(state).map(item => `${item.field}: ${item.message}`).join('\n');
const transition = (prior: unknown, next: unknown): string => validateStateTransition(prior as never, next as never)
  .map(item => `${item.field}: ${item.message}`).join('\n');

test('the synthetic run is a valid contract-6 snapshot: 22 tasks, five causes under one root', () => {
  const state = retrospectiveState();
  assert.equal(state.tasks.length, 22);
  assert.equal(state.verification!.defects.filter(item => item.rootFindingId === 'F-1').length, 5);
  assert.deepEqual(validateState(state), []);
});

test('refused: a broad run published as product failures behind a bootstrap that failed setup', () => {
  const state = retrospectiveState();
  const record = state.verification!;
  record.readiness[0]!.probes.push(bootstrapDenied);
  record.checks[0]!.readinessProbes = ['browser', 'bootstrap'];
  Object.assign(record.executions[0]!, { result: 'failed', failureCause: 'product',
    assertions: [{ name: 'panel opens', result: 'failed', evidenceIds: ['E-1'] }] });
  assert.match(messages(state), /bootstrap failed setup; correct the verification setup and supersede RD-1/);
});

test('accepted: the corrected copy supersedes the failed readiness and the run publishes with no attempt spent', () => {
  const state = retrospectiveState();
  const record = state.verification!;
  record.readiness[0]!.probes.push(bootstrapDenied);
  record.checks[0]!.readinessProbes = ['browser', 'bootstrap'];
  correctedReadiness(state);
  record.executions[0]!.readinessId = 'RD-2';
  assert.deepEqual(validateState(state), []);
  assert.equal(record.repairAttempts.length, 0);
});

test('refused: the batch of eight that closed no task, and a ninth with no review', () => {
  const state = retrospectiveState();
  state.verification!.repairAttempts = batchAttempts(8);
  assert.match(messages(state), /repairAttempts\[RA-3\]: 2 attempt\(s\) since the last strategy review closed 0 task\(s\)/);
  state.verification!.strategyReviews = [35, 55, 75].map((at, index) => strategyReview(`SR-${index + 1}`, minute(at)));
  assert.deepEqual(validateState(state), []);
  state.verification!.repairAttempts = batchAttempts(9);
  assert.match(messages(state), /repairAttempts\[RA-9\]: 2 attempt\(s\) since the last strategy review closed 0 task\(s\)/);
});

test('refused: the downstream orders screen leaves repair while its upstream schema is still open', () => {
  const prior = retrospectiveState();
  prior.verification!.repairAttempts = [v3Attempt('RA-1', 'F-11', 'DF-15', minute(20),
    { taskId: '04', outcome: 'prerequisite_blocked', blockingPrerequisites: ['02', 'DF-14'] })];
  assert.deepEqual(validateState(prior), []);
  const next = structuredClone(prior);
  next.tasks.find(item => item.id === '04')!.status = 'running';
  const found = transition(prior, next);
  assert.match(found, /task 04 cannot run while blocker 02 is repair/);
  assert.match(found, /repair of DF-15 waits on open prerequisite 02; route it to its owner first/);
});

test('accepted: upstream first — the schema defect is verified, then the orders screen relaunches', () => {
  const prior = retrospectiveState();
  const record = prior.verification!;
  record.repairAttempts = [v3Attempt('RA-1', 'F-11', 'DF-15', minute(20),
    { taskId: '04', outcome: 'prerequisite_blocked', blockingPrerequisites: ['02'] })];
  const schemaFixed = structuredClone(prior);
  schemaFixed.verification!.repairAttempts.push(v3Attempt('RA-2', 'F-10', 'DF-14', minute(30),
    { taskId: '02', outcome: 'defect_verified', commit: '0a0a0a0', unlocksTaskIds: ['04'] }));
  schemaFixed.verification!.defects.find(item => item.id === 'DF-14')!.status = 'verified';
  schemaFixed.verification!.defects.find(item => item.id === 'DF-14')!.verifiedExecutionIds = ['X-1'];
  schemaFixed.tasks.find(item => item.id === '02')!.status = 'review';
  assert.deepEqual(validateStateTransition(prior, schemaFixed), []);
  const relaunched = structuredClone(schemaFixed);
  relaunched.tasks.find(item => item.id === '04')!.status = 'running';
  assert.deepEqual(validateStateTransition(schemaFixed, relaunched), []);
});

test('refused: a larger limit proposed with no user authorization', () => {
  const prior = retrospectiveState();
  const next = structuredClone(prior);
  next.verification!.repairLimits.total = 28;
  assert.match(transition(prior, next), /a raised limit needs a user-authorized limit_increase/);
});

test('refused: a repair claimed verified whose commit review would never see', () => {
  const state = retrospectiveState();
  state.verification!.repairAttempts = [v3Attempt('RA-1', 'F-1', 'DF-1', minute(20),
    { outcome: 'defect_verified', commit: '9f9f9f9' })];
  state.verification!.defects[0] = { ...state.verification!.defects[0]!, status: 'verified', verifiedExecutionIds: ['X-1'] };
  assert.match(messages(state), /repair commit 9f9f9f9 is missing from task 01 commits; review would not see it/);
});

test('refused: an execution attributed to a check another task owns', () => {
  const state = retrospectiveState();
  state.verification!.executions[0]!.executor = '04';
  assert.match(messages(state), /execution by task 04 is attributed to check C-1, which task 01 owns/);
});

test('accepted: one cause of the broad root verified while its parent stays in repair with the rest open', () => {
  const state = retrospectiveState();
  const record = state.verification!;
  record.repairAttempts = [v3Attempt('RA-1', 'F-1', 'DF-1', minute(20), { outcome: 'defect_verified', commit: 'fedcba1' })];
  record.defects[0] = { ...record.defects[0]!, status: 'verified', verifiedExecutionIds: ['X-1'] };
  assert.deepEqual(validateState(state), []);
  assert.equal(state.tasks[0]!.status, 'repair');
  assert.equal(record.defects.filter(item => item.rootFindingId === 'F-1' && item.status === 'open').length, 4);
  const closed = structuredClone(state);
  closed.tasks[0]!.status = 'done';
  closed.tasks[0]!.finishedAt = minute(30);
  assert.match(messages(closed), /task 01 is done with open defects DF-2/);
});

test('refused: a downstream task forecast as closable while its schema prerequisite is still open', () => {
  const prior = retrospectiveState();
  const next = structuredClone(prior);
  next.verification!.repairAttempts = [v3Attempt('RA-1', 'F-11', 'DF-15', minute(20),
    { taskId: '04', expectedProgress: 'task_closure' })];
  assert.match(transition(prior, next), /task 04 is not closable while blocker 02 is repair; forecast the defect or scenario instead/);
  next.verification!.repairAttempts = [v3Attempt('RA-1', 'F-11', 'DF-15', minute(20), { taskId: '04' })];
  assert.deepEqual(validateStateTransition(prior, next), []);
});
