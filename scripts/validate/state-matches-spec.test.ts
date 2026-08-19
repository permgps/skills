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

type Overrides = { spec?: string; phases?: string; contract?: string };

async function violationsFor(overrides: Overrides = {}): Promise<Violation[]> {
  const root = await mkdtemp(path.join(tmpdir(), 'state-spec-'));
  try {
    const specDir = path.join(root, 'spec');
    await mkdir(specDir, { recursive: true });
    await writeFile(path.join(specDir, 'state-contract.md'), overrides.spec ?? SPEC, 'utf8');
    await writeFile(path.join(specDir, 'phases.md'), overrides.phases ?? PHASES, 'utf8');

    const contractFile = path.join(root, 'contract.ts');
    await writeFile(contractFile, overrides.contract ?? CONTRACT, 'utf8');

    return await checkStateMatchesSpec({
      specDir,
      contractFile,
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

test('a value set stated only in the contract is reported', async () => {
  const violations = await violationsFor({
    spec: SPEC.replace('| `stages[].status` | `pending`, `active` |',
      '| `stages[].status` | `pending`, `active` |\n| `tasks[].status` | `queued`, `done` |'),
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0]?.message ?? '', /no constant in contract\.ts carries/);
});

test('a value set carried only in code is reported', async () => {
  const violations = await violationsFor({
    spec: SPEC.replace('| `stages[].status` | `pending`, `active` |\n', ''),
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0]?.message ?? '', /the contract does not state/);
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
