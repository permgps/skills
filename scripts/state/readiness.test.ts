// Readiness: a broken verification setup is the coordinator's to correct, an
// unavailable capability is recorded, and neither is a product failure.
//
// The retrospective this guards: a verification copy denied its own root,
// the kernel could not bootstrap, and 2148 identical errors were published as
// a failed suite and fed to repair.

import test from 'node:test';
import assert from 'node:assert/strict';

import { validateStateTransition } from './closure.ts';
import type { ReadinessProbe } from './contract.ts';
import { activeContract6State, sha256 } from './fixtures/verification.ts';
import { validateState } from './validate.ts';

const messages = (state: unknown): string => validateState(state).map(item => `${item.field}: ${item.message}`).join('\n');

function withProbe(probe: ReadinessProbe, declared: ReadinessProbe['kind'][] = ['browser', probe.kind]): ReturnType<typeof activeContract6State> {
  const state = activeContract6State();
  state.verification!.readiness[0]!.probes.push(probe);
  state.verification!.checks[0]!.readinessProbes = declared;
  return state;
}

const bootstrapDenied: ReadinessProbe = { kind: 'bootstrap', result: 'setup_failed', evidenceIds: [],
  limitation: 'the copy root is denied by the file-access restriction; the kernel cannot resolve its base path' };

test('C01: a broad run against a readiness record whose required probes passed publishes', () => {
  const state = activeContract6State();
  assert.equal(state.verification!.executions[0]!.readinessId, 'RD-1');
  assert.deepEqual(validateState(state), []);
});

test('C02: a broad failed run published behind a bootstrap setup failure is refused', () => {
  const state = withProbe(bootstrapDenied);
  const execution = state.verification!.executions[0]!;
  execution.result = 'failed'; execution.failureCause = 'product';
  execution.assertions = [{ name: 'panel opens', result: 'failed', evidenceIds: ['E-1'] }];
  assert.match(messages(state), /bootstrap failed setup; correct the verification setup and supersede RD-1/);
});

test('C02: the corrected setup supersedes the failed record and the run publishes with no repair attempt', () => {
  const state = withProbe(bootstrapDenied);
  const record = state.verification!;
  record.evidence.push({ id: 'E-RD-2', path: 'evidence/RD-2/probes.txt', sha256: sha256('bootstrap:passed\n'),
    mediaType: 'text/plain', capturedAt: '2026-09-29T09:14:30Z', origin: 'execution' });
  record.readiness.push({ ...record.readiness[0]!, id: 'RD-2', supersedes: 'RD-1', executedAt: '2026-09-29T09:14:30Z',
    probes: (['source_identity', 'secrets_excluded', 'browser', 'bootstrap'] as const)
      .map(kind => ({ kind, result: 'passed' as const, evidenceIds: ['E-RD-2'] })) });
  record.executions[0]!.readinessId = 'RD-2';
  assert.deepEqual(validateState(state), []);
  assert.equal(record.repairAttempts.length, 0);
});

test('C03: an unavailable database makes its dependent check unavailable and leaves a database-free check alone', () => {
  const refused: ReadinessProbe = { kind: 'database', result: 'unavailable', evidenceIds: [],
    limitation: 'EPERM connecting to the owned test database port' };
  assert.deepEqual(validateState(withProbe(refused, ['browser'])), []);
  const dependent = withProbe(refused);
  assert.match(messages(dependent), /database is unavailable; record this execution unavailable with cause unavailable_capability/);
  const execution = dependent.verification!.executions[0]!;
  execution.result = 'unavailable'; execution.failureCause = 'unavailable_capability';
  execution.limitation = 'database listener refused by the host sandbox';
  assert.deepEqual(validateState(dependent), []);
});

test('C10: a runtime label copied from history cannot be published against a fresh readiness record', () => {
  const state = activeContract6State();
  state.verification!.executions[0]!.fingerprint.runtime = 'historical-runtime-label';
  assert.match(messages(state), /build and runtime must be the ones its readiness record probed/);
});

test('a contract-6 execution names the readiness it ran against', () => {
  const state = activeContract6State();
  delete state.verification!.executions[0]!.readinessId;
  assert.match(messages(state), /needs the readiness record it ran against/);
});

test('a failed or unavailable execution names its cause, and a passed one names none', () => {
  const passed = activeContract6State();
  passed.verification!.executions[0]!.failureCause = 'product';
  assert.match(messages(passed), /passed execution carries no failure cause/);
  const failed = activeContract6State();
  const execution = failed.verification!.executions[0]!;
  execution.result = 'failed';
  execution.assertions = [{ name: 'panel opens', result: 'failed', evidenceIds: ['E-1'] }];
  assert.match(messages(failed), /failed execution names its cause/);
  execution.failureCause = 'unavailable_capability';
  assert.match(messages(failed), /failed execution names its cause/);
  execution.failureCause = 'test';
  assert.deepEqual(validateState(failed), []);
});

test('a probe that failed setup or was unavailable says what was tried, and a passed probe carries evidence', () => {
  assert.match(messages(withProbe({ kind: 'listener', result: 'unavailable', evidenceIds: [] }, ['browser'])),
    /probe listener is unavailable and needs a limitation/);
  assert.match(messages(withProbe({ kind: 'autoload', result: 'passed', evidenceIds: [] }, ['browser'])),
    /passed probe autoload needs captured evidence/);
  assert.match(messages(withProbe({ kind: 'autoload', result: 'passed', evidenceIds: ['E-1'] }, ['browser'])),
    /probe evidence E-1 must be an execution capture under evidence\/RD-1\//);
});

test('a required probe the record never established refuses the run rather than assuming it', () => {
  const state = activeContract6State();
  state.verification!.checks[0]!.readinessProbes = ['browser', 'listener'];
  assert.match(messages(state), /required readiness probe listener was not established/);
});

test('a published readiness record is immutable, and a new run against a superseded record is refused', () => {
  const prior = activeContract6State();
  const rewritten = structuredClone(prior);
  rewritten.verification!.readiness[0]!.probes[0]!.result = 'unavailable';
  assert.ok(validateStateTransition(prior, rewritten).some(item => /immutable/.test(item.message)));
  const next = structuredClone(prior);
  const record = next.verification!;
  record.readiness.push({ ...record.readiness[0]!, id: 'RD-2', supersedes: 'RD-1' });
  record.executions.push({ ...record.executions[0]!, id: 'X-2', supersedes: 'X-1', executedAt: '2026-09-29T09:16:00Z' });
  assert.ok(validateStateTransition(prior, next).some(item => /RD-1 was superseded/.test(item.message)));
  record.executions[1]!.readinessId = 'RD-2';
  assert.deepEqual(validateStateTransition(prior, next), []);
});
