// Defects, contract-6 repair attempts and strategy reviews.
//
// The run these rules come from repaired five causes under one root, scheduled
// eight bounded repairs that closed no task, and proposed a larger limit with
// no causal review. Each test below holds one of those exits shut, and the
// valid path open beside it.

import test from 'node:test';
import assert from 'node:assert/strict';

import { validateStateTransition } from './closure.ts';
import { defect, finding, repairContract6State, repairContract7State, strategyReview, v3Attempt } from './fixtures/verification.ts';
import { validateState } from './validate.ts';

const messages = (state: unknown): string => validateState(state).map(item => `${item.field}: ${item.message}`).join('\n');
const minute = (value: number): string => `2026-09-29T10:${String(value).padStart(2, '0')}:00Z`;

/** Task 01 in repair with one defect per root, F-1 … F-n, and no attempts yet. */
function roots(count: number): ReturnType<typeof repairContract6State> {
  const state = repairContract6State();
  const record = state.verification!;
  record.findings = Array.from({ length: count }, (_, index) => finding(`F-${index + 1}`));
  record.defects = Array.from({ length: count }, (_, index) => defect(`DF-${index + 1}`, `F-${index + 1}`));
  return state;
}

test('C04: a bounded repair verifies its defect while the parent task stays in repair with residual criteria', () => {
  const state = repairContract6State();
  const record = state.verification!;
  record.defects[0] = { ...record.defects[0]!, status: 'verified', verifiedExecutionIds: ['X-1'] };
  record.repairAttempts = [v3Attempt('RA-1', 'F-1', 'DF-1', minute(0), { outcome: 'defect_verified', commit: 'fedcba1' })];
  assert.deepEqual(validateState(state), []);
  assert.equal(state.tasks[0]!.status, 'repair');
});

test('a task with an open defect is never done; it closes through review once its defects are verified', () => {
  const state = repairContract6State();
  state.tasks[0]!.status = 'done';
  state.tasks[0]!.finishedAt = minute(5);
  assert.match(messages(state), /task 01 is done with open defects DF-1/);
});

test('a defect is not verified by a check whose detector was never seen failing', () => {
  const state = repairContract6State();
  const record = state.verification!;
  record.negativeControls = [];
  record.defects[0] = { ...record.defects[0]!, status: 'verified', verifiedExecutionIds: ['X-1'] };
  assert.match(messages(state), /C-1 needs a passed negative control before it can verify a defect/);
});

test('a defect verified at a write is verified by the current passing run of its check', () => {
  const prior = repairContract6State();
  const next = structuredClone(prior);
  next.verification!.defects[0] = { ...next.verification!.defects[0]!, status: 'verified', verifiedExecutionIds: ['X-1'] };
  assert.deepEqual(validateStateTransition(prior, next), []);
  next.verification!.checks[0]!.currentFingerprint.build = 'integrated-build-2';
  assert.ok(validateStateTransition(prior, next).some(item => /X-1 is not the current passing result/.test(item.message)));
});

test('a defect keeps its cause and criteria; only its status moves, once', () => {
  const prior = repairContract6State();
  const rewritten = structuredClone(prior);
  rewritten.verification!.defects[0]!.residualParentCriteria = [];
  assert.ok(validateStateTransition(prior, rewritten).some(item => /only its status moves/.test(item.message)));
});

test('C05: a downstream repair blocked by an upstream gap names the open prerequisite and is routed to it', () => {
  const state = repairContract6State();
  state.tasks.push({ ...state.tasks[0]!, id: '02', title: 'Schema', status: 'repair', commits: ['0a0a0a0'] });
  const record = state.verification!;
  record.repairAttempts = [v3Attempt('RA-1', 'F-1', 'DF-1', minute(0), { outcome: 'prerequisite_blocked', blockingPrerequisites: ['02'] })];
  assert.deepEqual(validateState(state), []);
  record.repairAttempts[0] = v3Attempt('RA-1', 'F-1', 'DF-1', minute(0), { outcome: 'prerequisite_blocked' });
  assert.match(messages(state), /a blocked attempt names what blocked it/);
  const prior = structuredClone(state);
  prior.verification!.repairAttempts = [];
  const next = structuredClone(prior);
  next.tasks[1]!.status = 'done';
  next.verification!.repairAttempts = [v3Attempt('RA-1', 'F-1', 'DF-1', minute(0), { outcome: 'prerequisite_blocked', blockingPrerequisites: ['02'] })];
  assert.ok(validateStateTransition(prior, next).some(item => /prerequisite 02 is already closed/.test(item.message)));
});

test('a forecast never promises task closure while residual criteria remain', () => {
  const state = repairContract6State();
  state.verification!.repairAttempts = [v3Attempt('RA-1', 'F-1', 'DF-1', minute(0), { expectedProgress: 'task_closure' })];
  assert.match(messages(state), /cannot promise task closure while residual criteria or prerequisites remain/);
});

test('an environment defect is corrected at readiness and never spends a repair attempt', () => {
  const state = repairContract6State();
  state.verification!.defects[0]!.causeClass = 'environment';
  state.verification!.repairAttempts = [v3Attempt('RA-1', 'F-1', 'DF-1', minute(0))];
  assert.match(messages(state), /environment defect is corrected at readiness/);
});

test('C06: a third attempt after two that closed no task needs a strategy review between them', () => {
  const state = roots(3);
  const record = state.verification!;
  record.repairAttempts = [1, 2, 3].map(index => v3Attempt(`RA-${index}`, `F-${index}`, `DF-${index}`, minute(index * 10)));
  assert.match(messages(state), /2 attempt\(s\) since the last strategy review closed 0 task\(s\)/);
  record.strategyReviews = [strategyReview('SR-1', minute(25), { attemptIds: ['RA-1', 'RA-2'] })];
  assert.deepEqual(validateState(state), []);
});

test('C06: a batch that closed a task admits the next attempt without a review', () => {
  const state = roots(3);
  state.tasks.push({ ...state.tasks[0]!, id: '02', title: 'Footer', status: 'done', finishedAt: minute(15), commits: ['0b0b0b0'] });
  state.verification!.repairAttempts = [1, 2, 3].map(index => v3Attempt(`RA-${index}`, `F-${index}`, `DF-${index}`, minute(index * 10)));
  assert.deepEqual(validateState(state), []);
});

test('C06: a cause that survived a materially similar repair stops the next attempt until it is reviewed', () => {
  const state = roots(2);
  state.tasks.push({ ...state.tasks[0]!, id: '02', title: 'Footer', status: 'done', finishedAt: minute(25), commits: ['0b0b0b0'] });
  state.verification!.repairAttempts = [
    v3Attempt('RA-1', 'F-1', 'DF-1', minute(10)),
    v3Attempt('RA-2', 'F-1', 'DF-1', minute(20), { predecessorId: 'RA-1', repeatKind: 'different_action_same_cause',
      diagnosisDispatchId: 'diagnosis-1', diagnosisReturnId: 'diagnosis-return-1', novelty: 'accepted' }),
    v3Attempt('RA-3', 'F-2', 'DF-2', minute(30)),
  ];
  assert.match(messages(state), /a cause survived a similar repair; a returned strategy review must precede/);
});

test('eight attempts that closed no task do not admit a ninth without a strategy review', () => {
  const state = roots(9);
  const record = state.verification!;
  record.repairAttempts = Array.from({ length: 9 }, (_, index) =>
    v3Attempt(`RA-${index + 1}`, `F-${index + 1}`, `DF-${index + 1}`, minute((index + 1) * 5)));
  record.strategyReviews = [12, 22, 32].map((at, index) => strategyReview(`SR-${index + 1}`, minute(at)));
  assert.deepEqual(validateState({ ...state, verification: { ...record, repairAttempts: record.repairAttempts.slice(0, 8) } }), []);
  assert.match(messages(state), /repairAttempts\[RA-9\]: 2 attempt\(s\) since the last strategy review closed 0 task\(s\)/);
});

test('a strategy review that decided to stop admits no later attempt', () => {
  const state = roots(2);
  state.verification!.strategyReviews = [strategyReview('SR-1', minute(15), { decision: 'stop_incomplete' })];
  state.verification!.repairAttempts = [v3Attempt('RA-1', 'F-1', 'DF-1', minute(10)), v3Attempt('RA-2', 'F-2', 'DF-2', minute(20))];
  assert.match(messages(state), /decided to stop; no attempt follows it/);
});

test('a strategy review answers all seven questions and has its own dispatch and return', () => {
  const state = repairContract6State();
  const review = strategyReview('SR-1', minute(15));
  review.answers.taskClosable = '';
  state.verification!.strategyReviews = [review, strategyReview('SR-2', minute(16), { dispatchId: review.dispatchId })];
  const found = messages(state);
  assert.match(found, /answers\.taskClosable: nonempty string is required/);
  review.answers.taskClosable = 'No';
  assert.match(messages(state), /dispatch\/return identity cannot be reused/);
});

test('C07: a run stopped on an exhausted budget records its budget_exhausted review and never passes', () => {
  const state = roots(2);
  const record = state.verification!;
  record.repairLimits = { perFinding: 2, total: 2 };
  record.repairAttempts = [v3Attempt('RA-1', 'F-1', 'DF-1', minute(10)), v3Attempt('RA-2', 'F-2', 'DF-2', minute(20))];
  state.lifecycle = 'closed'; state.outcome = 'stopped_incomplete'; state.finishedAt = minute(40);
  state.stopReason = 'Repair budget exhausted with two open defects';
  state.gates[3]!.status = 'failed';
  assert.match(messages(state), /stopped on an exhausted budget records its budget_exhausted strategy review/);
  record.strategyReviews = [strategyReview('SR-1', minute(30), { trigger: 'budget_exhausted', decision: 'stop_incomplete' })];
  assert.deepEqual(validateState(state), []);
  record.strategyReviews[0]!.decision = 'change_strategy';
  assert.match(messages(state), /exhausted budget is answered by stop_incomplete or request_limit/);
});

test('C08: the total limit rises only by a user-authorized raise answering a request_limit review', () => {
  const prior = roots(2);
  prior.verification!.repairLimits = { perFinding: 2, total: 2 };
  prior.verification!.repairAttempts = [v3Attempt('RA-1', 'F-1', 'DF-1', minute(10)), v3Attempt('RA-2', 'F-2', 'DF-2', minute(20))];
  const silent = structuredClone(prior);
  silent.verification!.repairLimits.total = 4;
  assert.ok(validateStateTransition(prior, silent).some(item => /raised limit needs a user-authorized limit_increase/.test(item.message)));
  const raised = structuredClone(silent);
  raised.verification!.strategyReviews = [strategyReview('SR-1', minute(30), { trigger: 'budget_exhausted', decision: 'request_limit' })];
  raised.verification!.decisions = [{ id: 'D-1', kind: 'limit_increase', authorizedBy: 'user', authorizedAt: minute(35),
    authorization: 'Raise the total to four for the schema defects only', presentedFindingIds: [], presentedObligationIds: [],
    selectedFindingIds: [], selectedObligationIds: [], strategyReviewId: 'SR-1',
    previousLimits: { perFinding: 2, total: 2 }, limits: { perFinding: 2, total: 4 },
    forecast: 'Two schema defects become verified; task 02 becomes closable' }];
  assert.deepEqual(validateState(raised), []);
  assert.deepEqual(validateStateTransition(prior, raised), []);
  const perRoot = structuredClone(raised);
  perRoot.verification!.repairLimits.perFinding = 3;
  assert.ok(validateStateTransition(prior, perRoot).some(item => /per-root repair limit never changes/.test(item.message)));
  const lowered = structuredClone(prior);
  lowered.verification!.repairLimits.total = 1;
  assert.ok(validateStateTransition(prior, lowered).some(item => /not lowered/.test(item.message)));
});

test('a limit raise without the user, the review or the forecast is refused', () => {
  const state = repairContract6State();
  state.verification!.decisions = [{ id: 'D-1', kind: 'limit_increase', authorizedBy: 'coordinator', authorizedAt: minute(35),
    authorization: 'more attempts', presentedFindingIds: [], presentedObligationIds: [], selectedFindingIds: [],
    selectedObligationIds: [], previousLimits: { perFinding: 2, total: 20 }, limits: { perFinding: 2, total: 28 } }];
  const found = messages(state);
  assert.match(found, /answers a request_limit strategy review/);
  assert.match(found, /carries the closure forecast/);
  assert.match(found, /only the user authorizes a limit raise/);
});

test('splitting a defect or renaming its root never resets the per-root count', () => {
  const state = repairContract6State();
  const record = state.verification!;
  record.findings.push(finding('F-1b', { supersedes: 'F-1' }));
  record.defects = [defect('DF-1', 'F-1', { status: 'superseded' }), defect('DF-2', 'F-1', { supersedes: 'DF-1', findingIds: ['F-1b'] })];
  const diagnosed = { diagnosisDispatchId: 'diagnosis-1', diagnosisReturnId: 'return-1', novelty: 'accepted' as const };
  record.repairAttempts = [
    v3Attempt('RA-1', 'F-1', 'DF-2', minute(10), { findingId: 'F-1b' }),
    v3Attempt('RA-2', 'F-1', 'DF-2', minute(20), { findingId: 'F-1b', predecessorId: 'RA-1', repeatKind: 'new_cause_same_surface', ...diagnosed }),
  ];
  record.strategyReviews = [strategyReview('SR-1', minute(25))];
  assert.deepEqual(validateState(state), []);
  record.repairAttempts.push(v3Attempt('RA-3', 'F-1', 'DF-2', minute(30), { findingId: 'F-1b', predecessorId: 'RA-2',
    repeatKind: 'new_cause_same_surface', ...diagnosed, diagnosisDispatchId: 'diagnosis-2', diagnosisReturnId: 'return-2' }));
  assert.match(messages(state), /repair budget exceeded for stable failure F-1/);
});

test('a contract-6 attempt names a defect of its own root and task, and repeatKind matches its predecessor', () => {
  const state = roots(2);
  const record = state.verification!;
  record.repairAttempts = [v3Attempt('RA-1', 'F-1', 'DF-2', minute(10))];
  assert.match(messages(state), /attempt and defect must share the stable root/);
  record.repairAttempts = [v3Attempt('RA-1', 'F-1', 'DF-1', minute(10), { repeatKind: 'same_action_failed' })];
  assert.match(messages(state), /repeatKind is first exactly when the attempt has no predecessor/);
});

test('a contract-7 run keeps every contract-6 closure rule', () => {
  const state = repairContract7State();
  state.tasks[0]!.status = 'done';
  state.tasks[0]!.finishedAt = minute(5);
  assert.match(messages(state), /task 01 is done with open defects DF-1/);
});

test('a contract-7 defect verified at a write is held to the current passing run, as in contract 6', () => {
  const prior = repairContract7State();
  const next = structuredClone(prior);
  next.verification!.defects[0] = { ...next.verification!.defects[0]!, status: 'verified', verifiedExecutionIds: ['X-1'] };
  assert.deepEqual(validateStateTransition(prior, next), []);
  next.verification!.checks[0]!.currentFingerprint.build = 'integrated-build-2';
  assert.ok(validateStateTransition(prior, next).some(item => /X-1 is not the current passing result/.test(item.message)));
});

test('a published contract-6 run cannot be republished as contract 7', () => {
  const prior = repairContract6State();
  const next = { ...structuredClone(prior), contractVersion: 7, dir: '2026-09-29-synthetic-menu--wip' };
  assert.ok(validateStateTransition(prior, next).some(item => item.field === 'contractVersion'
    && /keeps its contract from 7 on/.test(item.message)));
});

test('a contract-7 run cannot fall back to contract 6', () => {
  const prior = repairContract7State();
  const { dir: _dir, ...rest } = structuredClone(prior);
  const next = { ...rest, contractVersion: 6 };
  assert.ok(validateStateTransition(prior, next).some(item => item.field === 'contractVersion'));
});
