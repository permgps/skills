import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  checkStateMatchesSpec,
  parseRunStateFields,
  parseUnionCell,
  parseStringArrayConst,
  parsePythonListConst,
  type Violation,
} from './state-matches-spec.ts';

// The fixtures mirror the real documents closely enough to drift the same way,
// and are small enough that the defect under test is the only difference.
const SPEC = `# Run-State Contract

| Field | Type | Written in | Read by |
|---|---|---|---|
| \`runId\` | string | preflight | dashboard |
| \`mode\` | \`full\` \\| \`semi\` | preflight | dashboard |
| \`stages[]\` | list of \`{ id, status }\` | preflight | dashboard |

## Value Sets

| Field | Values |
|---|---|
| \`stages[].status\` | \`pending\`, \`active\` |
`;

const PHASES = `# Phases

| Id | Name | Stage | Reads | Produces |
|---|---|---|---|---|
| preflight | Preflight | yes | arguments | state |
| build | Build | yes | tasks | code |
| memory | Memory | no | code | memory |
`;

const CONTRACT = `export const MODES = ['full', 'semi'];
export const STAGE_STATUSES = ['pending', 'active'];
export const STAGE_IDS: readonly StageId[] = ['preflight', 'build'];

export interface RunState {
  runId: string;
  mode: Mode;
  stages: StageEntry[];
}
`;

// The Python side carries the same set under the same name. It is a fixture
// for the same reason the others are: a checker that reads the real file can
// only ever agree with it, and could not be shown to catch anything.
const SYNC = `STAGE_STATUSES = ['pending', 'active']
`;

type Overrides = {
  spec?: string;
  phases?: string;
  contract?: string;
  sync?: string;
  /** Write no sync.py at all, so the checker is handed a path that is not there. */
  dropSync?: boolean;
};

async function violationsFor(overrides: Overrides = {}): Promise<Violation[]> {
  const root = await mkdtemp(path.join(tmpdir(), 'state-spec-'));
  try {
    const specDir = path.join(root, 'spec');
    await mkdir(specDir, { recursive: true });
    await writeFile(path.join(specDir, 'state-contract.md'), overrides.spec ?? SPEC, 'utf8');
    await writeFile(path.join(specDir, 'phases.md'), overrides.phases ?? PHASES, 'utf8');

    const contractFile = path.join(root, 'contract.ts');
    await writeFile(contractFile, overrides.contract ?? CONTRACT, 'utf8');

    const syncFile = path.join(root, 'sync.py');
    if (overrides.dropSync !== true) {
      await writeFile(syncFile, overrides.sync ?? SYNC, 'utf8');
    }

    return await checkStateMatchesSpec({
      specDir,
      contractFile,
      syncFile,
      phasesFile: path.join(specDir, 'phases.md'),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('parseStringArrayConst reads an exported array, typed or not', () => {
  assert.deepEqual(parseStringArrayConst(CONTRACT, 'MODES'), ['full', 'semi']);
  assert.deepEqual(parseStringArrayConst(CONTRACT, 'STAGE_IDS'), ['preflight', 'build']);
  assert.equal(parseStringArrayConst(CONTRACT, 'DEPTHS'), null);
});

test('parsePythonListConst reads a module-level list', () => {
  assert.deepEqual(parsePythonListConst(SYNC, 'STAGE_STATUSES'), ['pending', 'active']);
  assert.equal(parsePythonListConst(SYNC, 'TASK_STATUSES'), null);
});

test('parsePythonListConst refuses a list that is not at module level', () => {
  // An indented assignment is a local, and a local is not the copy the прогон
  // carries — reading it would report agreement the run does not have.
  assert.equal(parsePythonListConst('    STAGE_STATUSES = [\'pending\']\n', 'STAGE_STATUSES'), null);
});

test('parseUnionCell reads a union of backticked literals', () => {
  assert.deepEqual(parseUnionCell('`full` | `semi` | `in-spec`'), ['full', 'semi', 'in-spec']);
});

test('parseUnionCell refuses prose and single values', () => {
  assert.equal(parseUnionCell('string'), null);
  assert.equal(parseUnionCell('`full`'), null);
  assert.equal(parseUnionCell('list of `{ id, status }`'), null);
});

test('parseRunStateFields reads declaration order and ignores nested types', () => {
  assert.deepEqual(parseRunStateFields(CONTRACT), ['runId', 'mode', 'stages']);
});

test('parseRunStateFields sees optional fields', () => {
  const source = 'export interface RunState {\n  runId: string;\n  finishedAt?: string;\n}\n';
  assert.deepEqual(parseRunStateFields(source), ['runId', 'finishedAt']);
});

test('parseRunStateFields returns nothing when there is no RunState', () => {
  assert.deepEqual(parseRunStateFields('export interface Other { a: string }\n'), []);
});

// --- the real comparison -----------------------------------------------------

test('a contract that matches its specification produces no violations', async () => {
  assert.deepEqual(await violationsFor(), []);
});

test('a field the contract states but the code lacks is reported', async () => {
  const violations = await violationsFor({
    spec: SPEC.replace('| `runId` | string | preflight | dashboard |',
      '| `runId` | string | preflight | dashboard |\n| `slug` | string | preflight | dashboard |'),
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'fields');
  assert.match(violations[0]?.message ?? '', /"slug" is specified but absent from RunState/);
});

test('a field the code declares but the contract omits is reported', async () => {
  const violations = await violationsFor({
    contract: CONTRACT.replace('  runId: string;', '  runId: string;\n  slug: string;'),
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'fields');
  assert.match(violations[0]?.message ?? '', /declares "slug"/);
});

test('a value set that differs is reported with both sides', async () => {
  const violations = await violationsFor({
    contract: CONTRACT.replace(
      "export const STAGE_STATUSES = ['pending', 'active'];",
      "export const STAGE_STATUSES = ['pending', 'active', 'done'];"),
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'values');
  assert.match(violations[0]?.message ?? '', /contract \[pending, active\], code \[pending, active, done\]/);
});

test('a scalar union in the Type column is compared too', async () => {
  const violations = await violationsFor({
    spec: SPEC.replace('| `mode` | `full` \\| `semi` |', '| `mode` | `full` \\| `manual` |'),
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'values');
  assert.match(violations[0]?.message ?? '', /value set for "mode" differs/);
});

// A value set now has three homes — the contract, the shipped TypeScript, and
// the copy sync.py runs inside a прогон — so a set present in one of them and
// missing from the others is reported once per silent side, not once in total.
test('a value set stated only in the contract is reported on both silent sides', async () => {
  const violations = await violationsFor({
    spec: SPEC.replace('| `stages[].status` | `pending`, `active` |',
      '| `stages[].status` | `pending`, `active` |\n| `tasks[].status` | `queued`, `done` |'),
  });
  assert.equal(violations.length, 2);
  assert.match(violations[0]?.message ?? '', /no constant in contract\.ts carries/);
  assert.equal(violations[1]?.check, 'sync');
  assert.match(violations[1]?.message ?? '', /TASK_STATUSES is absent/);
});

test('a value set carried only in code is reported on both sides that state it', async () => {
  const violations = await violationsFor({
    spec: SPEC.replace('| `stages[].status` | `pending`, `active` |\n', ''),
  });
  assert.equal(violations.length, 2);
  assert.match(violations[0]?.message ?? '', /the contract does not state/);
  assert.equal(violations[1]?.check, 'sync');
  assert.match(violations[1]?.message ?? '', /carries STAGE_STATUSES/);
});

test('a set sync.py drifts on is reported against the specification', async () => {
  const violations = await violationsFor({
    sync: "STAGE_STATUSES = ['pending', 'active', 'paused']\n",
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'sync');
  assert.match(violations[0]?.message ?? '', /differs — contract \[pending, active\]/);
});

test('a sync.py that cannot be read is reported rather than skipped', async () => {
  // The failure this guards against is silence: a checker that quietly stops
  // reading one of its three sides looks exactly like one that agrees.
  const violations = await violationsFor({ dropSync: true });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'sync');
  assert.match(violations[0]?.message ?? '', /could not be read/);
});

test('a stage added to phases.md but not to the code is reported', async () => {
  const violations = await violationsFor({
    phases: PHASES.replace('| build | Build | yes | tasks | code |',
      '| build | Build | yes | tasks | code |\n| review | Review | yes | code | reviews |'),
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'stages');
  assert.match(violations[0]?.message ?? '', /stage ids differ/);
});

test('a non-stage phase is not expected to appear in the code', async () => {
  // `memory` is a phase but not a stage, and the baseline already proves this;
  // adding a second non-stage phase must stay silent for the same reason.
  const violations = await violationsFor({
    phases: PHASES.replace('| memory | Memory | no | code | memory |',
      '| memory | Memory | no | code | memory |\n| repair | Repair | no | result | retry |'),
  });
  assert.deepEqual(violations, []);
});

test('a missing RunState interface is reported once, not as every field', async () => {
  const violations = await violationsFor({
    contract: "export const MODES = ['full', 'semi'];\n",
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0]?.message ?? '', /no RunState interface found/);
});

// The real documents, not a fixture. Every test above proves the machinery on
// a small pair; this one proves the pair this repository actually ships still
// agrees — a field added to one side and forgotten on the other is the whole
// defect, and it is cheapest to catch in the same run as the unit tests.
test('the shipped contract and its specification agree on every field', async () => {
  assert.deepEqual(await checkStateMatchesSpec(), []);
});
