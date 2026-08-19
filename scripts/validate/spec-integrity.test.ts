import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { checkSpec, parseTables, type Violation } from './spec-integrity.ts';

// Fixtures are generated per test rather than committed: each one differs from
// the passing baseline by exactly the defect under test, which is easier to
// read as a diff in code than as a tree of near-identical directories.
const BASELINE: Record<string, string> = {
  'vocabulary.md': `# Vocabulary

| Stage id | Label |
|---|---|
| preflight | Подготовка |
| build | Разработка |

| Banned | Use instead |
|---|---|
| сборка | прогон |
`,
  'phases.md': `# Phases

| Id | Name | Stage | Reads | Produces |
|---|---|---|---|---|
| preflight | Preflight | yes | arguments | state |
| build | Build | yes | tasks | code |
| memory | Memory | no | code | memory file |

| Phase | full | semi |
|---|---|---|
| preflight | auto | auto |
| build | auto | auto |
`,
  'gates.md': `# Gates

| Gate | After phase | Pass condition |
|---|---|---|
| G1 | build | every таск is done |
`,
  'artifacts.md': `# Run Artifacts

| Artifact | Writer | Readers | Mutable |
|---|---|---|---|
| \`state.js\` | preflight | dashboard | yes |
`,
  'README.md': `# Behavior Specification

Index.
`,
  'safety.md': `# Safety Rules

| Id | Rule | On violation |\n|---|---|---|\n| S1 | x | y |
`,
  'dials.md': `# Dials

| Mode | Human gates |
|---|---|
| \`full\` | none |
| \`semi\` | genuine forks only |
`,
  'dashboard.md': `# Dashboard

Renders the run state.
`,
  'state-contract.md': `# Run-State Contract

| Field | Type | Written in | Read by |
|---|---|---|---|
| \`runId\` | string | preflight | dashboard |
| \`mode\` | \`full\` \\| \`semi\` | preflight | dashboard |
`,
};

/** `null` removes a baseline document; a string replaces or adds one. */
type Overrides = Record<string, string | null>;

async function makeSpec(overrides: Overrides = {}): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'spec-integrity-'));
  const files: Overrides = { ...BASELINE, ...overrides };
  await mkdir(dir, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    if (body === null) continue;
    await writeFile(path.join(dir, name), body, 'utf8');
  }
  return dir;
}

async function violationsFor(overrides: Overrides): Promise<Violation[]> {
  const dir = await makeSpec(overrides);
  try {
    return await checkSpec(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('parseTables keeps escaped pipes inside a cell', () => {
  const [table] = parseTables('| Field | Type |\n|---|---|\n| `mode` | `full` \\| `semi` |\n');
  assert.equal(table?.rows[0]?.['Type'], '`full` | `semi`');
});

test('a consistent specification produces no violations', async () => {
  assert.deepEqual(await violationsFor({}), []);
});

test('a missing required document is reported', async () => {
  const violations = await violationsFor({ 'gates.md': null });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'documents');
  assert.match(violations[0]?.message ?? '', /gates\.md/);
});

test('a gate pointing at an unknown phase is reported', async () => {
  const violations = await violationsFor({
    'gates.md': `| Gate | After phase | Pass condition |\n|---|---|---|\n| G1 | briefing | x |\n`,
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'gates');
  assert.match(violations[0]?.message ?? '', /unknown phase "briefing"/);
});

test('an artifact with two writers is reported', async () => {
  const violations = await violationsFor({
    'artifacts.md': `| Artifact | Writer | Readers | Mutable |\n|---|---|---|---|\n| \`state.js\` | preflight, build | dashboard | yes |\n`,
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'artifacts');
  assert.match(violations[0]?.message ?? '', /more than one writer/);
});

test('an artifact with no writer is reported', async () => {
  const violations = await violationsFor({
    'artifacts.md': `| Artifact | Writer | Readers | Mutable |\n|---|---|---|---|\n| \`state.js\` |  | dashboard | yes |\n`,
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0]?.message ?? '', /has no writer/);
});

test('a state field with no reader is reported', async () => {
  const violations = await violationsFor({
    'state-contract.md': `| Field | Type | Written in | Read by |\n|---|---|---|---|\n| \`runId\` | string | preflight |  |\n`,
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'state');
  assert.match(violations[0]?.message ?? '', /has no reader/);
});

test('a state field written in an unknown phase is reported', async () => {
  const violations = await violationsFor({
    'state-contract.md': `| Field | Type | Written in | Read by |\n|---|---|---|---|\n| \`runId\` | string | bootstrap | dashboard |\n`,
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0]?.message ?? '', /unknown phase "bootstrap"/);
});

test('a stage without a label is reported', async () => {
  const violations = await violationsFor({
    'vocabulary.md': `| Stage id | Label |\n|---|---|\n| preflight | Подготовка |\n\n| Banned | Use instead |\n|---|---|\n| сборка | прогон |\n`,
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'labels');
  assert.match(violations[0]?.message ?? '', /stage "build" has no label/);
});

test('a label for a phase that is not a stage is reported', async () => {
  const violations = await violationsFor({
    'vocabulary.md': `| Stage id | Label |\n|---|---|\n| preflight | Подготовка |\n| build | Разработка |\n| memory | Память |\n\n| Banned | Use instead |\n|---|---|\n| сборка | прогон |\n`,
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0]?.message ?? '', /not a stage in phases\.md/);
});

test('a banned term inside a label is reported', async () => {
  const violations = await violationsFor({
    'vocabulary.md': `| Stage id | Label |\n|---|---|\n| preflight | Подготовка |\n| build | Сборка |\n\n| Banned | Use instead |\n|---|---|\n| сборка | прогон |\n`,
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'banned');
  assert.match(violations[0]?.message ?? '', /banned term "сборка"/);
});

test('a specification missing safety.md is rejected', async () => {
  const violations = await violationsFor({ 'safety.md': null });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'documents');
  assert.match(violations[0]?.message ?? '', /safety\.md/);
});

test('a banned term is caught in a label defined outside the core documents', async () => {
  const violations = await violationsFor({
    'dashboard.md': `# Dashboard\n\n| Region | Label |\n|---|---|\n| header | Сборка |\n`,
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'banned');
  assert.match(violations[0]?.message ?? '', /banned term "сборка"/);
});

test('a document beyond the required set is still parsed', async () => {
  const violations = await violationsFor({
    'appendix.md': `# Appendix\n\n| Region | Label |\n|---|---|\n| footer | Сборка |\n`,
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'banned');
  assert.equal(violations[0]?.file, 'appendix.md');
});

test('several missing documents are all reported', async () => {
  const violations = await violationsFor({ 'safety.md': null, 'dials.md': null });
  assert.equal(violations.length, 2);
  assert.deepEqual(
    violations.map(v => v.file).sort(),
    ['dials.md', 'safety.md'],
  );
});

test('a stage missing from the mode matrix is reported', async () => {
  const violations = await violationsFor({
    'phases.md': `# Phases

| Id | Name | Stage | Reads | Produces |
|---|---|---|---|---|
| preflight | Preflight | yes | arguments | state |
| build | Build | yes | tasks | code |

| Phase | full | semi |
|---|---|---|
| preflight | auto | auto |
`,
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'modes');
  assert.match(violations[0]?.message ?? '', /stage "build" has no row/);
});

test('a mode matrix row naming something that is not a stage is reported', async () => {
  const violations = await violationsFor({
    'phases.md': `# Phases

| Id | Name | Stage | Reads | Produces |
|---|---|---|---|---|
| preflight | Preflight | yes | arguments | state |
| build | Build | yes | tasks | code |
| memory | Memory | no | code | memory file |

| Phase | full | semi |
|---|---|---|
| preflight | auto | auto |
| build | auto | auto |
| memory | auto | auto |
`,
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0]?.message ?? '', /row for "memory", which is not a stage/);
});

test('a mode column the dials do not define is reported', async () => {
  const violations = await violationsFor({
    'phases.md': `# Phases

| Id | Name | Stage | Reads | Produces |
|---|---|---|---|---|
| preflight | Preflight | yes | arguments | state |
| build | Build | yes | tasks | code |

| Phase | full | halfway |
|---|---|---|
| preflight | auto | auto |
| build | auto | auto |
`,
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0]?.message ?? '', /columns are "full, halfway"/);
});

test('an empty cell in the mode matrix is reported', async () => {
  const violations = await violationsFor({
    'phases.md': `# Phases

| Id | Name | Stage | Reads | Produces |
|---|---|---|---|---|
| preflight | Preflight | yes | arguments | state |
| build | Build | yes | tasks | code |

| Phase | full | semi |
|---|---|---|
| preflight | auto |  |
| build | auto | auto |
`,
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0]?.message ?? '', /stage "preflight" records no behavior for mode "semi"/);
});

test('dials with no mode table is reported', async () => {
  const violations = await violationsFor({ 'dials.md': '# Dials\n\nModes and depths.\n' });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.file, 'dials.md');
  assert.match(violations[0]?.message ?? '', /no table with columns Mode and Human gates/);
});
