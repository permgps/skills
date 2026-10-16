// Regression paths through the public state validator, transition and derivation.
// Samples execute real seeded/alternating assertions; no stochastic test flakiness.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateState } from './validate.ts';
import { validateStateTransition } from './closure.ts';
import { deriveVerification } from './verification.ts';
import { intermittentFixture, stamp } from './fixtures/intermittent.mts';
import { repairContract6State } from './fixtures/verification.ts';
import { validateIntermittentTransition } from '../../skills/maestro/tools/runtime/state/intermittent.mts';

const messages = (state: unknown) => validateState(state).map(e => e.message).join('\n');
const moves = (a: Parameters<typeof validateStateTransition>[0], b: Parameters<typeof validateStateTransition>[1]) => validateStateTransition(a,b).map(e=>e.message).join('\n');

for (const kind of ['alternating', 'seeded'] as const) test(`${kind} evidence closes only after both bounded workload series pass`, () => {
  const f = intermittentFixture(kind);
  assert.deepEqual(validateState(f.state), []);
  assert.deepEqual(validateStateTransition(f.beforePlan, f.state), []);
  const declared = structuredClone(f.state);
  f.append('baseline', 'faulty');
  assert.deepEqual(validateState(f.state), []);
  assert.deepEqual(validateStateTransition(declared, f.state), []);
  const baseline = structuredClone(f.state);
  f.append('candidate', 'fixed');
  assert.deepEqual(validateState(f.state), []);
  assert.deepEqual(validateStateTransition(baseline, f.state), []);
  f.close();
  assert.deepEqual(validateState(f.state), []);
  assert.equal(deriveVerification(f.state).checkResults['C-1'], 'passed');
  assert.deepEqual(validateIntermittentTransition(baseline, f.state), []);
});

test('a single lucky green and an incomplete series cannot resolve a finding or verify a defect', () => {
  const f = intermittentFixture(); f.append('baseline','faulty'); f.append('candidate','fixed',1); f.close();
  assert.match(messages(f.state), /intermittent resolution requires both complete/);
  assert.match(messages(f.state), /intermittent verification requires both complete/);
  assert.notEqual(deriveVerification(f.state).checkResults['C-1'], 'passed');
});

test('fixing only the minimized reproduction retains original failures and blocks closure', () => {
  const f = intermittentFixture('seeded'); f.append('baseline','faulty'); f.append('candidate','partial'); f.close();
  assert.match(messages(f.state), /intermittent resolution/);
  assert.equal(deriveVerification(f.state).checkResults['C-1'], 'failed');
  assert.ok(f.record.executions.some(e => e.intermittent?.scenario === 'original' && e.intermittent.phase === 'candidate' && e.result === 'failed'));
});

test('criteria cannot arrive with their samples and cannot be rewritten or deleted', () => {
  const f = intermittentFixture(); const declared = structuredClone(f.state); f.append('baseline','faulty');
  assert.match(moves(f.beforePlan, f.state), /publish the plan in a prior write/);
  const altered = structuredClone(declared); altered.verification!.intermittentRepairs![0]!.maxDurationMs++;
  assert.match(moves(declared, altered), /published plan is immutable/);
  delete altered.verification!.intermittentRepairs;
  assert.match(moves(declared, altered), /published plan is immutable/);
});

test('candidate samples require prior published baselines and failed samples cannot disappear', () => {
  const f = intermittentFixture(); const declared = structuredClone(f.state); f.append('baseline','faulty'); f.append('candidate','fixed');
  assert.match(moves(declared,f.state), /publish complete baseline series/);
  const before = structuredClone(f.state); f.record.executions = f.record.executions.filter(e => e.result !== 'failed');
  assert.match(moves(before,f.state), /published record must remain immutable/);
});

test('missing, duplicate, forged and mismatched sample attribution is rejected', () => {
  const f = intermittentFixture(); f.append('baseline','faulty'); f.append('candidate','fixed');
  const sample = f.record.executions.at(-1)!;
  sample.intermittent!.sample = 1;
  assert.match(messages(f.state), /sample ordinals/);
  sample.intermittent!.sample = 6; sample.invocation = 'other workload';
  assert.match(messages(f.state), /check\/invocation|comparable/);
  sample.invocation = f.plan.scenarios[0]!.invocation; sample.fingerprint.runtime = 'other-runtime';
  assert.match(messages(f.state), /fingerprint and conditions|comparable/);
  (sample as unknown as Record<string, unknown>)['intermittent'] = null;
  assert.match(messages(f.state), /verification-3 object/);
});

test('stale candidate samples block new closure but do not invalidate historical closure', () => {
  const f = intermittentFixture(); f.append('baseline','faulty'); f.append('candidate','fixed'); f.close();
  const closed = structuredClone(f.state);
  f.record.checks[0]!.currentFingerprint.build = 'later-build';
  assert.equal(deriveVerification(f.state).checkResults['C-1'], 'stale');
  assert.deepEqual(validateState(f.state), []);
  const open = structuredClone(closed); open.verification!.findings[0]!.status = 'open'; delete open.verification!.findings[0]!.resolutionExecutionId;
  open.verification!.defects[0]!.status='open'; open.verification!.defects[0]!.verifiedExecutionIds=[];
  assert.match(moves(open,f.state), /every sample on the current candidate/);
});

test('a final timed-out sample stays publishable as incomplete evidence', () => {
  const f = intermittentFixture();
  f.plan.maxDurationMs = 125;
  f.append('baseline', 'faulty');
  const baseline = structuredClone(f.state);
  f.append('candidate', 'fixed', 1);
  f.record.executions.pop();
  const timedOut = f.record.executions.at(-1)!;
  timedOut.result = 'unavailable';
  timedOut.limitation = 'Execution exceeded the remaining time budget';
  timedOut.failureCause = 'unavailable_capability';
  timedOut.assertions = [];
  assert.deepEqual(validateState(f.state), []);
  assert.deepEqual(validateStateTransition(baseline, f.state), []);
  assert.equal(deriveVerification(f.state).checkResults['C-2'], 'unavailable');
});

test('an exhausted budget blocks later sampling and closure', () => {
  const f = intermittentFixture(); f.plan.maxDurationMs=120; f.append('baseline','faulty');
  const baseline = structuredClone(f.state); f.append('candidate','fixed');
  assert.match(moves(baseline,f.state), /time budget exhausted/);
  f.close(); assert.match(messages(f.state), /intermittent resolution/);
});

test('ordinary previous-release states and a second run carry no implicit repeated-run requirement', () => {
  const prior = repairContract6State(); const next=structuredClone(prior); next.updatedAt=stamp(50);
  assert.deepEqual(validateState(prior), []); assert.deepEqual(validateStateTransition(prior,next), []);
  const second=repairContract6State(); second.runId='second-run';
  assert.deepEqual(validateState(second), []);
});

test('a later untagged failure is not erased by a later untagged green', () => {
  const f=intermittentFixture(); f.append('baseline','faulty'); f.append('candidate','fixed');
  const e=structuredClone(f.record.executions.at(-1)!); delete e.intermittent;
  e.id='late-failure'; e.executedAt=stamp(60); e.result='failed'; e.failureCause='product';
  e.assertions[0]!.result='failed';
  f.record.executions.push(e, { ...structuredClone(e), id:'late-green', executedAt:stamp(61), result:'passed', assertions:[{...e.assertions[0]!,result:'passed'}] });
  assert.equal(deriveVerification(f.state).checkResults['C-1'],'failed');
});

test('one publication batch cannot run more samples after the time budget expires', () => {
  const f=intermittentFixture(); f.plan.maxDurationMs=135; f.append('baseline','faulty'); f.append('candidate','fixed');
  assert.match(messages(f.state),/sample starts after the time budget/);
});

test('enum-shaped arrays are rejected without throwing at the untrusted boundary', () => {
  const f=intermittentFixture(); (f.plan.scenarios[0] as unknown as Record<string,unknown>)['role']=['original'];
  assert.match(messages(f.state),/unknown scenario role/);
});

test('both baseline workloads must use the observed triggering build', () => {
  const f = intermittentFixture();
  f.append('baseline', 'faulty');
  const readiness = structuredClone(f.record.readiness.find(r => r.targetFingerprint.build === 'faulty')!);
  readiness.id = 'RD-99';
  readiness.targetFingerprint.build = 'unrelated-build';
  const capture = structuredClone(f.record.evidence.find(e => e.id === readiness.probes[0]!.evidenceIds[0])!);
  capture.id = 'E-RD-99';
  capture.path = 'evidence/RD-99/capture.txt';
  f.record.evidence.push(capture);
  readiness.probes.forEach(p => { p.evidenceIds = [capture.id]; });
  f.record.readiness.push(readiness);
  for (const run of f.record.executions.filter(e => e.intermittent?.scenario === 'minimized')) {
    run.fingerprint.build = 'unrelated-build';
    run.readinessId = readiness.id;
  }
  assert.match(messages(f.state), /both baselines must retain the observed triggering build/);
});

test('the shipped intermittent label example is accepted alongside ordinary executor return fields', async () => {
  const { readFile } = await import('node:fs/promises');
  const { parseExecutionReturns, returnFindings } = await import('../../skills/maestro/tools/runtime/execution-return.mts');
  const prompt=await readFile('skills/maestro/prompts/executor.md','utf8');
  const procedure=await readFile('skills/maestro/references/intermittent-repairs.md','utf8');
  const labels=procedure.split('```text\n')[1]!.split('```')[0]!;
  assert.equal(labels.trim().split('\n').length,5);
  // The existing bundle suite validates the unchanged ordinary template. Here
  // use a concrete valid return so the conditional example is executable too.
  const concrete=['```text','format: maestro-execution-return/1','checkId: C-1','result: passed',
    'invocation: node check.mts','exitCode: 0','tool: node','host: test','readinessId: RD-1','fingerprint: build-1',
    'assertions:','- symptom absent: passed','red: not applicable — existing check check.mts','captures:',
    '- evidence/X-1/result.txt sha256 '+ 'a'.repeat(64),'commit: abcdef0',labels.trim(),'```'].join('\n');
  assert.ok(prompt.includes('all five intermittent labels'));
  assert.deepEqual(returnFindings(parseExecutionReturns(concrete)),[]);
});
