import test from 'node:test';
import assert from 'node:assert/strict';

import { checkG2, type GateFinding } from './check-g2.ts';
import {
  CONTRACT_VERSION,
  type GateEntry,
  type RequirementEntry,
  type RunState,
} from '../state/contract.ts';

function stateWith(requirements: RequirementEntry[], gates?: GateEntry[]): RunState {
  return {
    contractVersion: CONTRACT_VERSION,
    runId: 'run-1',
    slug: 'landing-page',
    startedAt: '2026-08-19T09:00:00Z',
    mode: 'semi',
    depth: 'normal',
    polish: false,
    dialChanges: [],
    stages: [{ id: 'spec', status: 'done' }],
    currentStage: 'plan',
    tasks: [],
    requirements,
    gates: gates ?? [
      { id: 'G1', status: 'passed', findings: [] },
      { id: 'G2', status: 'pending', findings: [] },
    ],
  };
}

const ids = (findings: GateFinding[]): string[] => findings.map(f => f.requirementId);

test('a manifest with every требование settled passes', () => {
  assert.deepEqual(checkG2(stateWith([
    { id: 'R01', status: 'in-spec' },
    { id: 'R02', status: 'deferred', reason: 'the user postponed the payment page' },
    { id: 'R03', status: 'dropped', reason: 'the user withdrew it in their own words' },
  ])), []);
});

test('a требование still open fails — the specification left it undecided', () => {
  const findings = checkG2(stateWith([
    { id: 'R01', status: 'in-spec' },
    { id: 'R02', status: 'open', reason: 'waiting on the client' },
  ]));
  assert.deepEqual(ids(findings), ['R02']);
  assert.match(findings[0]?.message ?? '', /still "open"/);
});

test('an open требование is not rescued by having a reason, unlike at G1', () => {
  // G1 accepts an open требование with a recorded reason; G2 does not accept one
  // at all. That difference is the whole distance between the two gates.
  assert.equal(checkG2(stateWith([
    { id: 'R01', status: 'open', reason: 'the client has not chosen a supplier' },
  ])).length, 1);
});

test('deferred and dropped each need the user reason to carry over', () => {
  assert.deepEqual(
    ids(checkG2(stateWith([
      { id: 'R01', status: 'deferred' },
      { id: 'R02', status: 'dropped', reason: '   ' },
      { id: 'R03', status: 'in-spec' },
    ]))),
    ['R01', 'R02'],
  );
});

test('an empty manifest fails', () => {
  const findings = checkG2(stateWith([]));
  assert.equal(findings.length, 1);
  assert.match(findings[0]?.message ?? '', /no требования/);
});

test('every offending требование is reported, not just the first', () => {
  assert.deepEqual(
    ids(checkG2(stateWith([
      { id: 'R01', status: 'open' },
      { id: 'R02', status: 'in-spec' },
      { id: 'R03', status: 'deferred' },
    ]))),
    ['R01', 'R03'],
  );
});

// --- the independent reader's verdict ---------------------------------------

test('G2 passed while carrying findings is refused — never passed with notes', () => {
  const findings = checkG2(stateWith(
    [{ id: 'R01', status: 'in-spec' }],
    [{ id: 'G2', status: 'passed', findings: ['the бриф asks for a printable invoice'] }],
  ));
  assert.equal(findings.length, 1);
  assert.match(findings[0]?.message ?? '', /never passed with notes/);
});

test('G2 passed with its findings cleared is the shape that passes', () => {
  assert.deepEqual(checkG2(stateWith(
    [{ id: 'R01', status: 'in-spec' }],
    [{ id: 'G2', status: 'passed', findings: [] }],
  )), []);
});

test('G2 failed while carrying findings is honest, not a violation', () => {
  // A failing gate is supposed to hold its findings — that is what the phase
  // runs again with. Only "passed" plus findings is the contradiction.
  assert.deepEqual(checkG2(stateWith(
    [{ id: 'R01', status: 'in-spec' }],
    [{ id: 'G2', status: 'failed', findings: ['the бриф asks for a printable invoice'] }],
  )), []);
});

test('a state with no G2 entry at all is reported', () => {
  const findings = checkG2(stateWith(
    [{ id: 'R01', status: 'in-spec' }],
    [{ id: 'G1', status: 'passed', findings: [] }],
  ));
  assert.equal(findings.length, 1);
  assert.match(findings[0]?.message ?? '', /no G2 entry/);
});

test('a requirement with no id is still reported, anchored to its index', () => {
  const findings = checkG2(stateWith([{ id: '', status: 'open' }]));
  assert.deepEqual(ids(findings), ['requirements[0]']);
});
