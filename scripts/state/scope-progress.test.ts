// Frozen requested scope and current authorized scope share one pure derivation.

import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceVerifiedState, verifiedState, deferredScopeState } from './fixtures/verification.ts';
import { deriveScopeProgress, validateVerificationTransition } from './verification.ts';
import { projectAcceptanceReport, projectState, prepareLegacyResume } from './projection.ts';
import { validateState } from './validate.ts';
import { measure, render } from '../metrics/measure.ts';


test('two authorized deferrals preserve original 18/20 alongside current 18/18', () => {
  const state = deferredScopeState();
  const progress = deriveScopeProgress(state);
  assert.equal(progress.original.passed, 18); assert.equal(progress.original.total, 20);
  assert.equal(progress.current.passed, 18); assert.equal(progress.current.total, 18);
  assert.deepEqual(progress.deferredIds, ['R19', 'R20']);
  assert.deepEqual(projectAcceptanceReport(state).scopeProgress, progress);
  assert.deepEqual(projectState(state).scopeProgress, progress);
  assert.deepEqual(measure(state).scopeProgress, progress);
  assert.match(render(measure(state)), /original scope\s+18\/20/);
});

test('a relaxed replacement can pass current scope while original evidence remains unproved', () => {
  const state = sourceVerifiedState();
  const record = state.verification!;
  record.scopeMappings.push({ id: 'SM-1', originalRequirementId: 'R01', currentRequirementIds: ['R01'],
    relation: 'changed', originalCheckIds: [], targetRevision: 1, decisionId: 'D-change' });
  assert.equal(deriveScopeProgress(state).current.passed, 1);
  assert.equal(deriveScopeProgress(state).original.passed, 0);
  record.scopeMappings[0]!.originalCheckIds = ['C-1'];
  assert.equal(deriveScopeProgress(state).original.passed, 1);
  record.checks[0]!.currentFingerprint.build = 'changed';
  assert.equal(deriveScopeProgress(state).original.passed, 0);
});

test('added and split requirement IDs cannot multiply original numerator', () => {
  const state = sourceVerifiedState(); const record = state.verification!;
  state.requirements.push({ id: 'R02', status: 'in-spec' });
  record.obligations.push({ ...record.obligations[0]!, id: 'O-2', requirementIds: ['R02'] });
  record.coverageReviews.push({ ...record.coverageReviews[0]!, id: 'CR-2', requirementId: 'R02' });
  record.scopeMappings.push({ id: 'SM-1', originalRequirementId: 'R01', currentRequirementIds: ['R01', 'R02'],
    relation: 'split', originalCheckIds: ['C-1'], targetRevision: 1, decisionId: 'D-split' });
  const progress = deriveScopeProgress(state);
  assert.equal(progress.original.passed, 1); assert.equal(progress.original.total, 1);
  assert.equal(progress.current.passed, 2); assert.deepEqual(progress.addedIds, ['R02']);
});

test('withdrawal and accepted exception never become a verified original pass', () => {
  const state = sourceVerifiedState();
  state.requirements[0]!.status = 'dropped'; state.requirements[0]!.reason = 'User withdraws';
  state.verification!.decisions.push({ id: 'D-exception', kind: 'accepted_exception', authorizedBy: 'user',
    authorization: 'Accept residual defect', authorizedAt: state.updatedAt!, presentedFindingIds: [],
    presentedObligationIds: ['O-1'], selectedFindingIds: [], selectedObligationIds: ['O-1'] });
  const progress = deriveScopeProgress(state);
  assert.equal(progress.original.total, 1); assert.equal(progress.original.passed, 0);
  assert.equal(progress.current.status, 'not-applicable');
  assert.deepEqual(progress.exceptionDecisionIds, ['D-exception']);
});

test('historical v4 keeps conformance while its original scope remains not-established', () => {
  const state = verifiedState();
  assert.equal(projectState(state).verificationEstablished, true);
  const progress = deriveScopeProgress(state);
  assert.equal(progress.original.status, 'not-established');
  assert.equal(progress.current.passed, 1);
  assert.equal(projectState(state).completionSafeguards, 'not-established');
});

test('empty baseline yields not-applicable rather than invented full completion', () => {
  const state = sourceVerifiedState(); state.requirements = [];
  state.verification!.scopeBaseline!.requirementIds = [];
  state.verification!.scopeBaseline!.expectations = [];
  const progress = deriveScopeProgress(state);
  assert.equal(progress.original.status, 'not-applicable');
  assert.equal(progress.current.status, 'not-applicable');
  assert.equal(progress.original.passed, 0);
});

test('an amended target without explicit original mapping cannot reuse weaker coverage', () => {
  const state = sourceVerifiedState(); state.verification!.targetRevision = 2;
  state.verification!.obligations[0]!.targetRevision = 2;
  state.verification!.coverageReviews[0]!.targetRevision = 2;
  assert.equal(deriveScopeProgress(state).original.passed, 0);
});

test('explicit v4-to-v5 resume reconstructs missing safeguards without inherited passes', () => {
  const old = verifiedState(); const candidate = sourceVerifiedState().verification!;
  candidate.acceptanceInputDigest = 'fresh-resume-source-input';
  candidate.manifestAudits = []; delete candidate.scopeBaseline;
  const resumed = prepareLegacyResume(old, candidate);
  assert.equal(resumed.contractVersion, 5);
  assert.equal(resumed.gates.find(item => item.id === 'G1')!.status, 'pending');
  assert.equal(projectState(resumed).g4, 'pending');
  assert.equal(projectState(resumed).completionSafeguards, 'not-established');
  assert.deepEqual(validateState(resumed), []);
  assert.deepEqual(validateVerificationTransition(old, resumed), []);
  assert.equal(resumed.verification!.executions.length, old.verification!.executions.length);
  candidate.scopeBaseline = sourceVerifiedState().verification!.scopeBaseline!;
  assert.throws(() => prepareLegacyResume(old, candidate), /fresh independent audit/);
});
