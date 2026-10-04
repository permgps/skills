import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { checkG1, checkG1Answers, type GateFinding } from './check-g1.ts';
import { runGate } from './cli.ts';
import { readState, parseStateSource, UnreadableStateError } from '../state/read.ts';
import { writeState } from '../state/write.ts';
import { InvalidStateError } from '../state/validate.ts';
import { STATE_FILE } from '../state/paths.ts';
import { type RequirementEntry, type RunState } from '../state/contract.ts';

function stateWith(requirements: RequirementEntry[]): RunState {
  return {
    contractVersion: 3,
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

// --- the answers half: answers.md of the run the state describes -------------

const DELEGATED = [
  '### R01 — способ оплаты',
  'Asked: Как гость платит за заказ?',
  'Options:',
  '1. Оплата картой на сайте (recommended — деньги приходят до отправки)',
  '2. Оплата при получении',
  'Answer: как советуешь',
  '',
].join('\n');
const CHOSEN = `${DELEGATED}Chosen: Оплата картой на сайте\n`;

/** A run root holding a written state and, when given, its answers.md. */
async function withRun(answers: string | null, body: (dir: string, state: RunState) => Promise<void>): Promise<void> {
  await withDir(async dir => {
    const state = stateWith([{ id: 'R01', status: 'in-spec' }]);
    await writeState(dir, state);
    if (answers !== null) {
      await mkdir(path.join(dir, state.slug), { recursive: true });
      await writeFile(path.join(dir, state.slug, 'answers.md'), answers, 'utf8');
    }
    await body(dir, state);
  });
}

async function gateExit(dir: string): Promise<number> {
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (() => true) as typeof process.stdout.write;
  try {
    return await runGate('check-g1', checkG1, dir, checkG1Answers);
  } finally {
    process.stdout.write = original;
  }
}

test('a delegated answer recorded without its chosen option fails G1 on its требование', async () => {
  await withRun(DELEGATED, async (dir, state) => {
    assert.deepEqual(ids(await checkG1Answers(state, dir)), ['R01']);
    assert.equal(await gateExit(dir), 1);
  });
});

test('the same answers.md with the chosen option written out passes G1', async () => {
  await withRun(CHOSEN, async (dir, state) => {
    assert.deepEqual(await checkG1Answers(state, dir), []);
    assert.equal(await gateExit(dir), 0);
  });
});

test('a run with no answers.md passes the answers half, because a бриф may open no forks', async () => {
  await withRun(null, async (dir, state) => {
    assert.deepEqual(await checkG1Answers(state, dir), []);
    assert.equal(await gateExit(dir), 0);
  });
});

test('an answers.md that cannot be read exits 2 instead of passing', async () => {
  await withDir(async dir => {
    const state = stateWith([{ id: 'R01', status: 'in-spec' }]);
    await writeState(dir, state);
    await mkdir(path.join(dir, state.slug, 'answers.md'), { recursive: true });
    await assert.rejects(() => checkG1Answers(state, dir));
    assert.equal(await gateExit(dir), 2);
  });
});
