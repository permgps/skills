import test from 'node:test';
import assert from 'node:assert/strict';

import { checkG3, type GateFinding } from './check-g3.ts';
import {
  CONTRACT_VERSION,
  type RequirementEntry,
  type RunState,
  type TaskEntry,
} from '../state/contract.ts';

function task(id: string, requirementIds: string[]): TaskEntry {
  return { id, title: `build ${id}`, requirementIds, status: 'queued', blockedBy: [] };
}

function stateWith(requirements: RequirementEntry[], tasks: TaskEntry[]): RunState {
  return {
    contractVersion: CONTRACT_VERSION,
    runId: 'run-1',
    slug: 'landing-page',
    startedAt: '2026-08-19T09:00:00Z',
    mode: 'semi',
    depth: 'normal',
    polish: false,
    dialChanges: [],
    stages: [{ id: 'plan', status: 'done' }],
    currentStage: 'build',
    tasks,
    requirements,
    gates: [{ id: 'G3', status: 'pending', findings: [] }],
  };
}

const ids = (findings: GateFinding[]): string[] => findings.map(f => f.requirementId);

test('a map that holds in both directions passes', () => {
  assert.deepEqual(checkG3(stateWith(
    [
      { id: 'R01', status: 'in-spec' },
      { id: 'R02', status: 'in-spec' },
      { id: 'R03', status: 'deferred', reason: 'the user postponed it' },
    ],
    [task('01', ['R01']), task('02', ['R01', 'R02'])],
  )), []);
});

test('an in-spec требование no таск builds is reported', () => {
  const findings = checkG3(stateWith(
    [{ id: 'R01', status: 'in-spec' }, { id: 'R02', status: 'in-spec' }],
    [task('01', ['R01'])],
  ));
  assert.deepEqual(ids(findings), ['R02']);
  assert.match(findings[0]?.message ?? '', /dropped between the specification and the cut/);
});

test('a таск tracing to a требование that is not in the манифест is reported', () => {
  const findings = checkG3(stateWith(
    [{ id: 'R01', status: 'in-spec' }],
    [task('01', ['R01']), task('02', ['R99'])],
  ));
  assert.deepEqual(ids(findings), ['R99']);
  assert.match(findings[0]?.message ?? '', /not in the манифест/);
});

test('a таск building a deferred требование is work nobody asked for', () => {
  const findings = checkG3(stateWith(
    [
      { id: 'R01', status: 'in-spec' },
      { id: 'R02', status: 'deferred', reason: 'the user postponed it' },
    ],
    [task('01', ['R01']), task('02', ['R02'])],
  ));
  assert.deepEqual(ids(findings), ['R02']);
  assert.match(findings[0]?.message ?? '', /work nobody asked for/);
});

test('a таск building a dropped требование is reported the same way', () => {
  const findings = checkG3(stateWith(
    [
      { id: 'R01', status: 'in-spec' },
      { id: 'R02', status: 'dropped', reason: 'the user withdrew it' },
    ],
    [task('01', ['R01']), task('02', ['R02'])],
  ));
  assert.deepEqual(ids(findings), ['R02']);
});

test('a deferred требование reached by no таск is not a finding', () => {
  // Only in-spec требования must reach a таск. A deferred one reaching none is
  // exactly what deferring it meant.
  assert.deepEqual(checkG3(stateWith(
    [
      { id: 'R01', status: 'in-spec' },
      { id: 'R02', status: 'deferred', reason: 'the user postponed it' },
    ],
    [task('01', ['R01'])],
  )), []);
});

test('a duplicated таск id is reported', () => {
  const findings = checkG3(stateWith(
    [{ id: 'R01', status: 'in-spec' }],
    [task('01', ['R01']), task('01', ['R01'])],
  ));
  assert.deepEqual(ids(findings), ['01']);
  assert.match(findings[0]?.message ?? '', /appears more than once/);
});

test('one таск may serve several требования, and several таски one требование', () => {
  assert.deepEqual(checkG3(stateWith(
    [{ id: 'R01', status: 'in-spec' }, { id: 'R02', status: 'in-spec' }],
    [task('01', ['R01', 'R02']), task('02', ['R01'])],
  )), []);
});

test('a tiny plan is one таск carrying every in-spec требование', () => {
  // The smallest valid plan: one таск, no decomposition, still traceable.
  assert.deepEqual(checkG3(stateWith(
    [{ id: 'R01', status: 'in-spec' }, { id: 'R02', status: 'in-spec' }],
    [task('01', ['R01', 'R02'])],
  )), []);
});

test('zero таски against a live требование fails — it reached nobody', () => {
  const findings = checkG3(stateWith([{ id: 'R01', status: 'in-spec' }], []));
  assert.deepEqual(ids(findings), ['R01']);
});

test('a манифест with nothing in-spec and no таски passes', () => {
  // Every требование deferred or dropped is G2's business, not G3's. With
  // nothing live, an empty cut is the correct cut.
  assert.deepEqual(checkG3(stateWith(
    [{ id: 'R01', status: 'deferred', reason: 'the user postponed the whole thing' }],
    [],
  )), []);
});

test('every unmatched entry is reported, on both sides at once', () => {
  const findings = checkG3(stateWith(
    [{ id: 'R01', status: 'in-spec' }, { id: 'R02', status: 'in-spec' }],
    [task('01', ['R99'])],
  ));
  assert.deepEqual(ids(findings).sort(), ['R01', 'R02', 'R99']);
});

test('a таск with no id is named by its index in the finding it causes', () => {
  // Two unnamed таски are not duplicates of each other — they are two таски
  // each missing an id, which the state validator refuses before a gate runs.
  // What the gate owes them is a finding that can still be located.
  const findings = checkG3(stateWith(
    [{ id: 'R01', status: 'in-spec' }],
    [task('', ['R01']), task('', ['R99'])],
  ));
  assert.deepEqual(ids(findings), ['R99']);
  assert.match(findings[0]?.message ?? '', /таск tasks\[1\]/);
});
