import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { checkG1, type GateFinding } from './check-g1.ts';
import { readState, parseStateSource, UnreadableStateError } from '../state/read.ts';
import { writeState } from '../state/write.ts';
import { InvalidStateError } from '../state/validate.ts';
import { STATE_FILE } from '../state/paths.ts';
import { CONTRACT_VERSION, type RequirementEntry, type RunState } from '../state/contract.ts';

function stateWith(requirements: RequirementEntry[]): RunState {
  return {
    contractVersion: CONTRACT_VERSION,
    runId: 'run-1',
    slug: 'landing-page',
    startedAt: '2026-08-19T09:00:00Z',
    mode: 'semi',
    depth: 'normal',
    polish: false,
    dialChanges: [],
    stages: [{ id: 'briefing', status: 'done',
      startedAt: '2026-08-19T09:00:00Z', finishedAt: '2026-08-19T09:03:40Z' }],
    currentStage: 'spec',
    tasks: [],
    requirements,
    gates: [{ id: 'G1', status: 'pending', findings: [] }],
    updatedAt: '2026-08-19T09:12:00Z',
    debt: { placeholders: [], assumptions: [], emptyEnv: [] },
    additions: [],
  };
}

const ids = (findings: GateFinding[]): string[] => findings.map(f => f.requirementId);

test('a manifest whose requirements are all answered passes', () => {
  assert.deepEqual(checkG1(stateWith([
    { id: 'R01', status: 'in-spec' },
    { id: 'R02', status: 'deferred', reason: 'no pricing supplied yet' },
    { id: 'R03', status: 'dropped', reason: 'the user withdrew it in their own words' },
  ])), []);
});

test('an open requirement without a reason fails the gate', () => {
  const findings = checkG1(stateWith([
    { id: 'R01', status: 'in-spec' },
    { id: 'R02', status: 'open' },
  ]));
  assert.deepEqual(ids(findings), ['R02']);
  assert.match(findings[0]?.message ?? '', /"open" with no recorded reason/);
});

test('an open requirement with a reason passes — G1 checks the reason exists', () => {
  assert.deepEqual(checkG1(stateWith([
    { id: 'R01', status: 'open', reason: 'waiting on the client to choose a supplier' },
  ])), []);
});

test('deferred and dropped both need a reason', () => {
  assert.deepEqual(
    ids(checkG1(stateWith([
      { id: 'R01', status: 'deferred' },
      { id: 'R02', status: 'dropped' },
    ]))),
    ['R01', 'R02'],
  );
});

test('a whitespace reason is not a reason', () => {
  assert.deepEqual(
    ids(checkG1(stateWith([{ id: 'R01', status: 'open', reason: '  \n ' }]))),
    ['R01'],
  );
});

test('an empty manifest fails, because nothing was recorded from the бриф', () => {
  const findings = checkG1(stateWith([]));
  assert.equal(findings.length, 1);
  assert.match(findings[0]?.message ?? '', /no требования/);
});

test('a duplicated requirement id is reported', () => {
  const findings = checkG1(stateWith([
    { id: 'R01', status: 'in-spec' },
    { id: 'R01', status: 'in-spec' },
  ]));
  assert.deepEqual(ids(findings), ['R01']);
  assert.match(findings[0]?.message ?? '', /appears more than once/);
});

test('every offending requirement is reported, not just the first', () => {
  assert.deepEqual(
    ids(checkG1(stateWith([
      { id: 'R01', status: 'open' },
      { id: 'R02', status: 'in-spec' },
      { id: 'R03', status: 'deferred' },
    ]))),
    ['R01', 'R03'],
  );
});

// --- reading the state the gate runs against --------------------------------

async function withDir(body: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'check-g1-'));
  try {
    await body(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('a state written by the writer reads back and passes the gate', async () => {
  await withDir(async dir => {
    const state = stateWith([{ id: 'R01', status: 'in-spec' }]);
    await writeState(dir, state);

    const read = await readState(dir);
    assert.deepEqual(read, state);
    assert.deepEqual(checkG1(read), []);
  });
});

test('the state file is parsed, never evaluated', () => {
  // If this were run instead of parsed, the property would be set.
  const hostile = 'globalThis.MAESTRO_STATE = {"runId": "r"};\nglobalThis.pwned = true;\n';
  assert.deepEqual(parseStateSource(hostile), { runId: 'r' });
  assert.equal('pwned' in globalThis, false);
});

test('a file that is not a state file is refused with a readable message', () => {
  assert.throws(() => parseStateSource('# not javascript\n'), UnreadableStateError);
  assert.throws(() => parseStateSource('globalThis.MAESTRO_STATE = {oops;\n'), UnreadableStateError);
});

test('an invalid state on disk throws rather than being gated', async () => {
  await withDir(async dir => {
    await writeFile(
      path.join(dir, STATE_FILE),
      'globalThis.MAESTRO_STATE = {"contractVersion": 1, "runId": "r"};\n',
      'utf8',
    );
    await assert.rejects(() => readState(dir), InvalidStateError);
  });
});
