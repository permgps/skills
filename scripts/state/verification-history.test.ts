// What a later write may not do to the verification history a run published.
//
// A whole-project review (2026-10-14) closed a прогон `completed` three ways
// the helper is there to refuse: by deleting an open finding or an open
// promise, by rewriting an incomplete coverage review in place, and by
// resolving a finding with the very execution it contradicted. A fourth
// closed `closed_with_exceptions` over an incomplete требование nobody had
// accepted. Each test is one of those, against the contract-10 fixtures.

import test from 'node:test';
import assert from 'node:assert/strict';

import { activeContract10State, contract10State, finding } from './fixtures/verification.ts';
import { validateStateTransition } from './closure.ts';
import { TRANSITION_RULES, deriveVerification, deriveScopeProgress } from './verification.ts';
import { validateState } from './validate.ts';

const fields = (violations: Array<{ field: string }>): string[] => violations.map(item => item.field);

/** A later passing run of C-1, with its own capture, that can resolve a finding. */
function addResolvingRun(state: ReturnType<typeof contract10State>, result: 'passed' | 'failed' = 'passed'): void {
  const record = state.verification!;
  const first = record.executions[0]!;
  record.evidence.push({ ...structuredClone(record.evidence.find(item => item.id === 'E-1')!),
    id: 'E-2', path: 'evidence/X-2/pointer.txt' });
  record.executions.push({ ...structuredClone(first), id: 'X-2', supersedes: first.id, result,
    executedAt: '2026-09-29T09:30:00Z', evidenceIds: ['E-2'],
    assertions: first.assertions.map(item => ({ ...item, result, evidenceIds: ['E-2'] })) });
  const round = record.acceptanceRounds[0];
  if (round) round.executionIds = ['X-2'];
}

function withOpenFinding(): ReturnType<typeof activeContract10State> {
  const state = activeContract10State();
  state.verification!.findings.push(finding('F-1'));
  state.gates[3]!.status = 'failed';
  return state;
}

test('a published open finding cannot be deleted by the next write', () => {
  const next = contract10State();
  assert.deepEqual(validateState(next), []);
  assert.ok(fields(validateStateTransition(withOpenFinding(), next)).includes('verification.findings[F-1]'));
});

test('an open finding may move to resolved, and nothing else about it may change', () => {
  const prior = withOpenFinding();
  const reworded = structuredClone(prior);
  reworded.verification!.findings[0]!.description = 'A milder finding';
  assert.ok(fields(validateStateTransition(prior, reworded)).includes('verification.findings[F-1]'));
  const resolved = structuredClone(prior);
  addResolvingRun(resolved);
  resolved.verification!.findings[0] = finding('F-1', { status: 'resolved', resolutionExecutionId: 'X-2' });
  assert.ok(!fields(validateStateTransition(prior, resolved)).includes('verification.findings[F-1]'));
  const reopened = structuredClone(resolved);
  reopened.verification!.findings[0]!.status = 'open';
  delete reopened.verification!.findings[0]!.resolutionExecutionId;
  assert.ok(fields(validateStateTransition(resolved, reopened)).includes('verification.findings[F-1]'));
});

test('an open promise cannot be deleted, nor marked done with no acceptance round', () => {
  const prior = activeContract10State();
  prior.verification!.promisedWork.push({ id: 'P-1', description: 'Run acceptance again', status: 'open' });
  assert.ok(fields(validateStateTransition(prior, contract10State())).includes('verification.promisedWork[P-1]'));
  const done = contract10State();
  done.verification!.promisedWork.push({ id: 'P-1', description: 'Run acceptance again', status: 'done' });
  assert.ok(fields(validateStateTransition(prior, done)).includes('verification.promisedWork[P-1]'));
  const kept = contract10State();
  kept.verification!.promisedWork.push({ id: 'P-1', description: 'Run acceptance again', status: 'done',
    acceptanceRoundId: kept.verification!.acceptanceRounds[0]!.id });
  assert.ok(!fields(validateStateTransition(prior, kept)).includes('verification.promisedWork[P-1]'));
});

test('a published coverage review is never rewritten in place', () => {
  const prior = activeContract10State();
  const review = prior.verification!.coverageReviews[0]!;
  review.status = 'incomplete';
  review.uninspectedSurfaceIds = [...review.inspectedSurfaceIds];
  review.inspectedSurfaceIds = [];
  review.limitation = 'not looked at';
  assert.deepEqual(validateState(prior), []);
  assert.ok(fields(validateStateTransition(prior, contract10State()))
    .includes(`verification.coverageReviews[${review.id}]`));
});

test('a finding is not resolved by the execution its own evidence came from', () => {
  const next = contract10State();
  next.verification!.findings.push(finding('F-1', { status: 'resolved', resolutionExecutionId: 'X-1' }));
  assert.ok(fields(validateState(next)).includes('verification.findings[0].resolutionExecutionId'),
    JSON.stringify(validateState(next)));
});

test('historical unresolved resolutions remain readable without establishing a current pass', () => {
  const state = contract10State();
  state.verification!.findings.push(finding('F-old', { status: 'resolved', resolutionExecutionId: 'X-1' }));
  assert.deepEqual(validateState(state, { historical: true }), []);
  assert.equal(deriveVerification(state).g4, 'failed');
  assert.ok(validateState(state).some(item => item.field.includes('resolutionExecutionId')));
  assert.deepEqual(validateStateTransition(state, structuredClone(state)), []);
});

test('new resolutions cannot use historical-read tolerance, including their first appearance', () => {
  const prior = activeContract10State();
  const next = structuredClone(prior);
  next.verification!.findings.push(finding('F-new', { status: 'resolved', resolutionExecutionId: 'X-1' }));
  assert.ok(validateStateTransition(prior, next).some(item => item.field.includes('resolutionExecutionId')));
});

test('a truthful superseding finding repairs current confidence without rewriting the old resolution', () => {
  const prior = activeContract10State();
  prior.verification!.findings.push(finding('F-old', { status: 'resolved', resolutionExecutionId: 'X-1' }));
  const next = structuredClone(prior);
  addResolvingRun(next);
  next.verification!.findings.push(finding('F-new', {
    supersedes: 'F-old', status: 'resolved', resolutionExecutionId: 'X-2',
  }));
  assert.equal(deriveVerification(next).requirementResults.R01, 'passed');
  assert.deepEqual(validateStateTransition(prior, next), []);
  assert.deepEqual(next.verification!.findings[0], prior.verification!.findings[0]);
});

test('a resolved successor of an open finding permits historical closure without rewriting its predecessor', () => {
  const state = contract10State();
  addResolvingRun(state);
  state.verification!.findings.push(finding('F-1'), finding('F-2', {
    supersedes: 'F-1', status: 'resolved', resolutionExecutionId: 'X-2',
  }));
  assert.deepEqual(validateState(state), []);
  assert.deepEqual(validateState(state, { historical: true }), []);
  assert.equal(state.verification!.findings[0]!.status, 'open');
});

test('a resolved successor restores original scope progress as well as current scope progress', () => {
  const state = contract10State();
  addResolvingRun(state);
  state.verification!.findings.push(finding('F-1'), finding('F-2', {
    supersedes: 'F-1', status: 'resolved', resolutionExecutionId: 'X-2',
  }));
  const progress = deriveScopeProgress(state);
  assert.equal(progress.current.passed, 1);
  assert.equal(progress.original.passed, 1);
});

test('historical exception closure requires acceptance of the current finding only', () => {
  const state = contract10State();
  const record = state.verification!;
  record.findings.push(finding('F-1'), finding('F-2', { supersedes: 'F-1' }));
  record.decisions.push({ id: 'D-1', kind: 'accepted_exception', authorizedBy: 'user',
    authorizedAt: '2026-09-29T09:19:30Z', authorization: 'user accepted F-2',
    presentedFindingIds: ['F-2'], presentedObligationIds: ['O-1'],
    selectedFindingIds: ['F-2'], selectedObligationIds: ['O-1'] });
  record.acceptanceRounds[0]!.findingIds = ['F-2'];
  record.acceptanceRounds[0]!.requirementResults = { R01: 'failed' };
  record.acceptanceRounds[0]!.g4 = 'failed';
  state.gates[3]!.status = 'failed';
  state.outcome = 'closed_with_exceptions';
  assert.deepEqual(validateState(state), []);
  assert.deepEqual(validateState(state, { historical: true }), []);
});


test('closed_with_exceptions refuses an incomplete требование no decision covers', () => {
  const state = contract10State();
  const record = state.verification!;
  state.requirements.push({ id: 'R02', status: 'in-spec' });
  record.sourceClauses[0]!.requirementIds = ['R01', 'R02'];
  record.scopeBaseline!.requirementIds = ['R01', 'R02'];
  record.scopeBaseline!.expectations.push({ requirementId: 'R02', clauseIds: ['CL-1'], text: 'x', checkIds: ['C-1'] });
  record.findings.push(finding('F-1'));
  record.decisions.push({ id: 'D-1', kind: 'accepted_exception', authorizedBy: 'user',
    authorizedAt: '2026-09-29T09:19:30Z', authorization: 'user accepted F-1',
    presentedFindingIds: ['F-1'], presentedObligationIds: ['O-1'],
    selectedFindingIds: ['F-1'], selectedObligationIds: ['O-1'] });
  const derived = deriveVerification(state);
  assert.deepEqual(derived.incompleteIds, ['R02']);
  record.acceptanceRounds[0]!.requirementResults = derived.requirementResults;
  record.acceptanceRounds[0]!.g4 = derived.g4;
  record.acceptanceRounds[0]!.findingIds = ['F-1'];
  state.gates[3]!.status = derived.g4;
  state.outcome = 'closed_with_exceptions';
  assert.ok(fields(validateState(state)).includes('outcome'), JSON.stringify(validateState(state)));
});

test('a finding is resolved by a later passing run of a check it names, never by a run of another check', () => {
  const valid = contract10State();
  addResolvingRun(valid);
  valid.verification!.findings.push(finding('F-1', { status: 'resolved', resolutionExecutionId: 'X-2' }));
  assert.deepEqual(validateState(valid), [], 'the lawful resolution is accepted');

  const foreign = structuredClone(valid);
  foreign.verification!.findings[0]!.checkIds = [];
  foreign.verification!.findings[0]!.obligationIds = [];
  foreign.verification!.findings[0]!.evidenceIds = [];
  foreign.verification!.checks.push({ ...structuredClone(foreign.verification!.checks[0]!), id: 'C-9', required: false });
  foreign.verification!.findings[0]!.checkIds = ['C-9'];
  assert.ok(fields(validateState(foreign)).includes('verification.findings[0].resolutionExecutionId'),
    JSON.stringify(validateState(foreign)));
});

// The three holes above had one cause: the transition froze the collections it
// listed, and a collection nobody listed could change freely. Every key of the
// record now has a declared rule, and a key added to the contract without one
// fails here before it can be rewritten in a run.

test('every key of the verification record has a declared transition rule, and no rule names a key that is gone', () => {
  const keys = Object.keys({ ...contract10State().verification!, intermittentRepairs: [], repairDispatches: [], repairAccounting: {}, replayTools: [] }).sort();
  assert.deepEqual(Object.keys(TRANSITION_RULES).sort(), keys);
});

test('removing a published record from any collection whose rule keeps history is refused', () => {
  const prior = contract10State();
  const record = prior.verification! as unknown as Record<string, unknown>;
  const kept = Object.entries(TRANSITION_RULES)
    .filter(([key, rule]) => rule !== 'current' && rule !== 'guarded'
      && Array.isArray(record[key]) && (record[key] as unknown[]).length > 0)
    .map(([key]) => key);
  assert.ok(kept.length >= 8, `too few populated collections to prove anything: ${kept.join(', ')}`);
  for (const key of kept) {
    const next = structuredClone(prior);
    (next.verification as unknown as Record<string, unknown[]>)[key]!.shift();
    assert.ok(fields(validateStateTransition(prior, next)).some(field => field.startsWith(`verification.${key}`)),
      `${key}: removing a record was not refused`);
  }
});
