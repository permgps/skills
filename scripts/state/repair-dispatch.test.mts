// Reservation/return protocol must survive compaction and omitted prose-only results.
import test from 'node:test';
import assert from 'node:assert/strict';
import { repairContract6State, v3Attempt, finding, defect, strategyReview } from './fixtures/verification.ts';
import { validateState } from './validate.ts';
import { validateStateTransition } from './closure.ts';
import type { RepairDispatch } from './contract.ts';

function fixture() {
  const state = repairContract6State();
  state.verification!.repairDispatches = [];
  state.verification!.repairAccounting = { status: 'complete', reviewedAt: state.updatedAt!, evidenceIds: [], note: 'Fresh run' };
  return state;
}
function reservation(id = 'RDSP-1', attemptId = 'RA-1'): RepairDispatch {
  const { at, outcome: _outcome, ...proposal } = v3Attempt(attemptId, 'F-1', 'DF-1', '2026-09-29T09:21:00Z');
  return { id, at, base: 'abcdef0', status: 'reserved', proposal };
}

test('pending reservations consume budget even before any RA returns', () => {
  const state = fixture();
  state.verification!.repairLimits.total = 1;
  state.verification!.repairDispatches = [reservation(), reservation('RDSP-2', 'RA-2')];
  assert.ok(validateState(state).some(e => e.field.includes('repairDispatches')));
});

test('a returned reservation without an actual RA and executions is refused', () => {
  const state = fixture();
  state.verification!.repairDispatches = [{ ...reservation(), status: 'returned', settledAt: '2026-09-29T09:22:00Z', executionIds: [] }];
  assert.ok(validateState(state).some(e => e.field.includes('repairDispatches')));
});

test('an enabled ledger cannot be removed or a dispatched attempt cancelled', () => {
  const prior = fixture();
  prior.verification!.repairDispatches = [{ ...reservation(), status: 'dispatched' }];
  const next = structuredClone(prior);
  delete next.verification!.repairDispatches;
  assert.ok(validateStateTransition(prior, next).some(e => e.field.includes('repairDispatches')));
  next.verification!.repairDispatches = [{ ...prior.verification!.repairDispatches[0]!, status: 'cancelled', settledAt: '2026-09-29T09:22:00Z', cancellationReason: 'Lost context' }];
  assert.ok(validateStateTransition(prior, next).some(e => e.field.includes('repairDispatches')));
});

test('a legal reservation survives resume, dispatches, and settles a failed result exactly once', () => {
  const before = fixture();
  const reserved = structuredClone(before);
  reserved.verification!.repairDispatches = [reservation()];
  assert.deepEqual(validateState(reserved), []);
  assert.deepEqual(validateStateTransition(before, reserved), []);
  assert.deepEqual(validateStateTransition(reserved, structuredClone(reserved)), []);
  const dispatched = structuredClone(reserved);
  dispatched.verification!.repairDispatches![0]!.status = 'dispatched';
  assert.deepEqual(validateStateTransition(reserved, dispatched), []);
  const returned = structuredClone(dispatched);
  const record = returned.verification!;
  record.repairDispatches![0] = { ...record.repairDispatches![0]!, status: 'returned', settledAt: '2026-09-29T09:24:00Z', executionIds: ['X-return'] };
  record.repairAttempts.push(v3Attempt('RA-1', 'F-1', 'DF-1', '2026-09-29T09:22:00Z'));
  record.executions.push({ ...record.executions[0]!, id: 'X-return', executedAt: '2026-09-29T09:23:00Z', result: 'failed', failureCause: 'product', assertions: [{ name: 'panel opens', result: 'failed', evidenceIds: ['E-return'] }], evidenceIds: ['E-return'] });
  record.evidence.push({ ...record.evidence[1]!, id: 'E-return', path: 'evidence/X-return/pointer.txt' });
  record.repairLimits.total = 1;
  dispatched.verification!.repairLimits.total = 1;
  assert.deepEqual(validateState(returned), []);
  assert.deepEqual(validateStateTransition(dispatched, returned), []);
  assert.deepEqual(validateStateTransition(returned, structuredClone(returned)), []);
});

test('cancelling undispatched work frees capacity; legacy missing accounting does not', () => {
  const before = fixture();
  before.verification!.repairDispatches = [reservation()];
  const cancelled = structuredClone(before);
  cancelled.verification!.repairDispatches![0] = { ...reservation(), status: 'cancelled', settledAt: '2026-09-29T09:22:00Z', cancellationReason: 'Executor never started' };
  assert.deepEqual(validateStateTransition(before, cancelled), []);
  const legacy = repairContract6State();
  assert.ok(validateStateTransition(legacy, fixture()).some(e => e.message.includes('inventory')));
  const incomplete = fixture();
  incomplete.verification!.repairAccounting!.status = 'incomplete';
  assert.deepEqual(validateStateTransition(legacy, incomplete), []);
  incomplete.verification!.repairDispatches = [reservation()];
  assert.ok(validateState(incomplete).some(e => e.message.includes('unknown')));
});

test('reservation admission reuses attempt readiness, diagnosis and predecessor gates', () => {
  const before = fixture();
  const next = structuredClone(before);
  const bad = reservation();
  bad.proposal.repeatKind = 'different_action_same_cause';
  bad.proposal.predecessorId = 'RA-missing';
  next.verification!.repairDispatches = [bad];
  assert.ok(validateStateTransition(before, next).length > 0);
});

test('legacy recovery imports preserved actual returns before completing accounting without inventing dispatches', () => {
  const prior = repairContract6State();
  prior.updatedAt = '2026-09-29T09:30:00Z';
  const next = structuredClone(prior);
  next.verification!.repairDispatches = [];
  next.verification!.repairAccounting = { status: 'complete', reviewedAt: prior.updatedAt, evidenceIds: ['E-1'], note: 'Preserved original return and follow-up capture' };
  next.verification!.repairAttempts.push(v3Attempt('RA-1', 'F-1', 'DF-1', '2026-09-29T09:14:00Z'));
  assert.deepEqual(validateStateTransition(prior, next), []);
  next.verification!.repairAccounting!.evidenceIds = ['E-RD-1'];
  assert.ok(validateStateTransition(prior, next).some(e => e.message.includes('previously dispatched')));
});

test('prose-only advancement and newly fabricated initial returned reservations are refused', () => {
  const prior = fixture();
  const next = structuredClone(prior);
  next.tasks[0]!.status = 'review';
  assert.ok(validateStateTransition(prior, next).some(e => e.message.includes('receipt')));
  const newAttempt = structuredClone(prior);
  newAttempt.verification!.repairAttempts.push(v3Attempt('RA-1', 'F-1', 'DF-1', '2026-09-29T09:21:00Z'));
  assert.ok(validateStateTransition(prior, newAttempt).some(e => e.message.includes('previously dispatched')));
});

test('outstanding repairs count toward the strategy batch and a stop blocks new reservations', () => {
  const prior = fixture();
  const next = structuredClone(prior);
  for (let i = 1; i <= 3; i++) {
    if (i > 1) {
      next.verification!.findings.push(finding(`F-${i}`));
      next.verification!.defects.push(defect(`DF-${i}`, `F-${i}`));
    }
    const d = reservation(`RDSP-${i}`, `RA-${i}`);
    d.at = `2026-09-29T09:2${i}:00Z`;
    d.proposal.findingId = d.proposal.rootFindingId = `F-${i}`;
    d.proposal.defectId = `DF-${i}`;
    next.verification!.repairDispatches!.push(d);
  }
  assert.ok(validateStateTransition(prior, next).some(e => e.message.includes('strategy review')));
  const stopped = fixture();
  stopped.verification!.strategyReviews.push(strategyReview('SR-1', '2026-09-29T09:20:00Z', { decision: 'stop_incomplete' }));
  const candidate = structuredClone(stopped);
  candidate.verification!.repairDispatches = [reservation()];
  assert.ok(validateStateTransition(stopped, candidate).some(e => e.message.includes('decided to stop')));
});

test('renaming a superseding finding cannot free the stable-root budget', () => {
  const prior = fixture();
  prior.verification!.repairLimits.perFinding = 1;
  prior.verification!.repairAttempts.push(v3Attempt('RA-1', 'F-1', 'DF-1', '2026-09-29T09:20:00Z'));
  const next = structuredClone(prior);
  next.verification!.findings.push(finding('F-2', { supersedes: 'F-1' }));
  const d = reservation('RDSP-2', 'RA-2');
  d.proposal.findingId = 'F-2';
  d.proposal.predecessorId = 'RA-1';
  d.proposal.repeatKind = 'different_action_same_cause';
  next.verification!.repairDispatches = [d];
  assert.ok(validateState(next).some(e => e.message.includes('budget for F-1')));
});
