import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SIGNAL_KINDS, type RunState } from '../state/contract.ts';
import { STATE_FILE } from '../state/paths.ts';
import { parseStateSource } from '../state/read.ts';
import { validateState } from '../state/validate.ts';
import { serializeState } from '../state/write.ts';
import { batchAttempts, bootstrapDenied, correctedReadiness, retrospectiveState } from '../state/fixtures/retrospective.ts';
import {
  CAPTURES, CONTROL_CAPTURES, SOURCE_MANIFEST, defect, repairContract7State, sourceVerifiedState, verifiedState,
} from '../state/fixtures/verification.ts';
import { main } from './measure.ts';
import { SIGNAL_CLASSES, retrospect, type SignalClassId, type SignalGroup } from './signals.ts';

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/assets');

const group = (groups: SignalGroup[], id: SignalClassId): SignalGroup => {
  const found = groups.find(item => item.class === id);
  assert.ok(found, `no group ${id}`);
  return found;
};

/**
 * A recorded state, parsed but not validated: both were written under contract
 * 2, before today's stage rules, and `readState` refuses them. The
 * retrospective takes a state already read, so what it is held to here is what
 * those runs actually wrote.
 */
async function recordedState(fixture: string): Promise<RunState> {
  return parseStateSource(await readFile(path.join(ASSETS, fixture), 'utf8')) as RunState;
}

const NOT_RECORDED: Omit<SignalGroup, 'class' | 'label'> = { status: 'not recorded', count: 0, recordIds: [], proposal: null };

test('the five classes come out in a fixed order, each labelled mechanical or judgement', () => {
  const groups = retrospect(verifiedState());
  assert.deepEqual(groups.map(item => [item.class, item.label]), [
    ['withheld-requests', 'judgement'],
    ['briefs-exceeded', 'judgement'],
    ['writes-outside-files', 'mechanical'],
    ['superseded-readiness', 'mechanical'],
    ['repeated-defect-causes', 'judgement'],
  ]);
});

test('each signal kind is read by exactly one of the classes that read signals', () => {
  const kinds = SIGNAL_CLASSES.flatMap(item => item.kind === undefined ? [] : [item.kind]);
  assert.deepEqual([...kinds].sort(), [...SIGNAL_KINDS].sort());
});

for (const fixture of ['state-finished.fixture.js', 'state-running.fixture.js']) {
  test(`a recorded contract-2 прогон (${fixture}) reports every class as not recorded, never as none`, async () => {
    const groups = retrospect(await recordedState(fixture));
    assert.equal(groups.length, 5);
    for (const item of groups) {
      assert.deepEqual({ ...item, class: undefined, label: undefined },
        { ...NOT_RECORDED, class: undefined, label: undefined }, item.class);
    }
  });
}

test('a verification record older than version 3 leaves readiness and defect causes not recorded', () => {
  for (const state of [verifiedState(), sourceVerifiedState()]) {
    const groups = retrospect(state);
    assert.equal(group(groups, 'superseded-readiness').status, 'not recorded');
    assert.equal(group(groups, 'repeated-defect-causes').status, 'not recorded');
  }
});

test('a state with no signals list leaves the three signal classes not recorded', () => {
  const groups = retrospect(retrospectiveState());
  for (const id of ['withheld-requests', 'briefs-exceeded', 'writes-outside-files'] as const) {
    assert.equal(group(groups, id).status, 'not recorded', id);
  }
});

test('an empty signals list is recorded with nothing in it, and proposes nothing', () => {
  const groups = retrospect({ ...repairContract7State(), signals: [] });
  for (const id of ['withheld-requests', 'briefs-exceeded', 'writes-outside-files'] as const) {
    assert.deepEqual(group(groups, id), { ...group(groups, id), status: 'recorded', count: 0, recordIds: [], proposal: null });
  }
});

test('signals lines are cited under their own class in state order, and a class with any proposes something', () => {
  const groups = retrospect({
    ...repairContract7State(),
    signals: [
      'SIG-1 withheld-request — spec.md — executor 01',
      'SIG-2 out-of-zone-write — src/shared/db.ts — 01 abcdef0 F-1',
      'SIG-3 brief-exceeded — patch instead of finding — reviewer 01',
      'SIG-4 withheld-request — brief.md — acceptance-reader G4',
    ],
  });
  assert.deepEqual(group(groups, 'withheld-requests').recordIds, ['SIG-1', 'SIG-4']);
  assert.deepEqual(group(groups, 'briefs-exceeded').recordIds, ['SIG-3']);
  assert.deepEqual(group(groups, 'writes-outside-files').recordIds, ['SIG-2']);
  for (const id of ['withheld-requests', 'briefs-exceeded', 'writes-outside-files'] as const) {
    assert.equal(group(groups, id).count, group(groups, id).recordIds.length);
    assert.ok(group(groups, id).proposal, id);
  }
});

test('a signals line that does not parse is skipped rather than counted', () => {
  const groups = retrospect({
    ...repairContract7State(),
    signals: ['SIG-1 withheld-request — spec.md — executor 01', 'asked for the spec again'],
  });
  assert.deepEqual(group(groups, 'withheld-requests').recordIds, ['SIG-1']);
  assert.equal(group(groups, 'withheld-requests').count, 1);
});

test('a readiness record superseded after a setup failure is cited with its successor and the probe that failed', () => {
  const state = retrospectiveState();
  state.verification!.readiness[0]!.probes.push(bootstrapDenied);
  correctedReadiness(state);
  const readiness = group(retrospect(state), 'superseded-readiness');
  assert.equal(readiness.status, 'recorded');
  assert.equal(readiness.count, 1);
  assert.deepEqual(readiness.recordIds, ['RD-1→RD-2 bootstrap:setup_failed']);
  assert.ok(readiness.proposal);
});

test('readiness that was never superseded is recorded with nothing to cite', () => {
  const readiness = group(retrospect(retrospectiveState()), 'superseded-readiness');
  assert.deepEqual(readiness, { ...readiness, status: 'recorded', count: 0, recordIds: [], proposal: null });
});

test('a repair attempt that repeated a cause is cited with its defect, and a first attempt is not', () => {
  const state = retrospectiveState();
  const attempts = batchAttempts(3);
  attempts[1]!.repeatKind = 'same_action_failed';
  attempts[2]!.repeatKind = 'different_action_same_cause';
  state.verification!.repairAttempts = attempts;
  const repeated = group(retrospect(state), 'repeated-defect-causes');
  assert.deepEqual(repeated.recordIds, ['RA-2 (DF-7)', 'RA-3 (DF-8)']);
  assert.equal(repeated.count, 2);
  assert.ok(repeated.proposal);
});

test('product defects across many таски are the work repair exists for, and are not cited as a repeated cause', () => {
  const repeated = group(retrospect(retrospectiveState()), 'repeated-defect-causes');
  assert.deepEqual(repeated, { ...repeated, status: 'recorded', count: 0, recordIds: [], proposal: null });
});

test('a non-product cause shared by defects of two таски cites both, but not a superseded one or a single таск\'s', () => {
  const state = repairContract7State();
  state.verification!.defects = [
    defect('DF-1', 'F-1', { causeClass: 'contract' }),
    defect('DF-2', 'F-1', { causeClass: 'contract', parentTaskId: '02' }),
    defect('DF-3', 'F-1', { causeClass: 'contract', parentTaskId: '03', status: 'superseded' }),
    defect('DF-4', 'F-1', { causeClass: 'test' }),
    defect('DF-5', 'F-1', { causeClass: 'test' }),
  ];
  const repeated = group(retrospect(state), 'repeated-defect-causes');
  assert.deepEqual(repeated.recordIds, ['DF-1 (contract)', 'DF-2 (contract)']);
  assert.equal(repeated.count, 2);
});

// --- end to end: the lines the phases prescribe, through the validator and main

/** What `main` printed, with stdout put back however the body ends. */
async function printed(body: () => Promise<number>): Promise<{ code: number; out: string }> {
  const write = process.stdout.write.bind(process.stdout);
  let out = '';
  process.stdout.write = ((chunk: string | Uint8Array): boolean => { out += String(chunk); return true; }) as typeof process.stdout.write;
  try {
    return { code: await body(), out };
  } finally {
    process.stdout.write = write;
  }
}

test('the lines the phases prescribe pass the validator and come out of main under their classes', async () => {
  const state = {
    ...repairContract7State(),
    signals: [
      'SIG-1 withheld-request — spec.md — executor 01',
      'SIG-2 out-of-zone-write — src/shared/db.ts — 01 abcdef0 F-1',
      'SIG-3 brief-exceeded — patch instead of finding — reviewer 01',
      'SIG-4 withheld-request — brief.md — acceptance-reader G4',
      'SIG-5 withheld-request — manifest.md — polish-reader round 2',
    ],
  };
  assert.deepEqual(validateState(state), []);

  // A contract-7 read checks the evidence on disk, so `.maestro/` is laid out as
  // a прогон leaves it: `state.js` beside the run directory, and the captures
  // and the манифест inside it.
  const root = await mkdtemp(path.join(tmpdir(), 'signals-'));
  const maestro = path.join(root, '.maestro');
  try {
    for (const [relative, body] of Object.entries({ ...CAPTURES, ...CONTROL_CAPTURES, 'manifest.md': SOURCE_MANIFEST })) {
      await mkdir(path.dirname(path.join(maestro, state.dir!, relative)), { recursive: true });
      await writeFile(path.join(maestro, state.dir!, relative), body);
    }
    await writeFile(path.join(maestro, STATE_FILE), serializeState(state), 'utf8');
    const { code, out } = await printed(() => main(maestro, true));
    assert.equal(code, 0);
    const groups = (JSON.parse(out) as { retrospective: SignalGroup[] }).retrospective;
    assert.deepEqual(group(groups, 'withheld-requests').recordIds, ['SIG-1', 'SIG-4', 'SIG-5']);
    assert.deepEqual(group(groups, 'briefs-exceeded').recordIds, ['SIG-3']);
    assert.deepEqual(group(groups, 'writes-outside-files').recordIds, ['SIG-2']);
    assert.equal(group(groups, 'superseded-readiness').status, 'recorded');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
