import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  carries,
  checkSpec,
  MAESTRO_PROFILE,
  parseTables,
  profileFor,
  SCOUT_PROFILE,
  type Violation,
} from './spec-integrity.ts';

// Fixtures are generated per test rather than committed: each one differs from
// the passing baseline by exactly the defect under test, which is easier to
// read as a diff in code than as a tree of near-identical directories.
const BASELINE: Record<string, string> = {
  'vocabulary.md': `# Vocabulary

| Stage id | Label | Label (en) |
|---|---|---|
| preflight | Подготовка | Setup |
| build | Разработка | Development |

| Banned | Use instead |
|---|---|
| сборка | прогон |

| Banned (en) | Use instead (en) |
|---|---|
| build | run |
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
  'hosts.md': `# Hosts

| Capability | What a прогон uses it for | Without it |
|---|---|---|
| subagent fan-out | one executor per таск | waves narrow to one |
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
    'vocabulary.md': `| Stage id | Label | Label (en) |\n|---|---|---|\n| preflight | Подготовка | Setup |\n\n| Banned | Use instead |\n|---|---|\n| сборка | прогон |\n\n| Banned (en) | Use instead (en) |\n|---|---|\n| build | run |\n`,
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'labels');
  assert.match(violations[0]?.message ?? '', /stage "build" has no label/);
});

test('a label for a phase that is not a stage is reported', async () => {
  const violations = await violationsFor({
    'vocabulary.md': `| Stage id | Label | Label (en) |\n|---|---|---|\n| preflight | Подготовка | Setup |\n| build | Разработка | Development |\n| memory | Память | Memory |\n\n| Banned | Use instead |\n|---|---|\n| сборка | прогон |\n\n| Banned (en) | Use instead (en) |\n|---|---|\n| build | run |\n`,
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0]?.message ?? '', /not a stage in phases\.md/);
});

test('a banned term inside a label is reported', async () => {
  const violations = await violationsFor({
    'vocabulary.md': `| Stage id | Label | Label (en) |\n|---|---|---|\n| preflight | Подготовка | Setup |\n| build | Сборка | Development |\n\n| Banned | Use instead |\n|---|---|\n| сборка | прогон |\n\n| Banned (en) | Use instead (en) |\n|---|---|\n| build | run |\n`,
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
    'dashboard.md': `# Dashboard\n\n| Region | Label | Label (en) |\n|---|---|---|\n| header | Сборка | Run |\n`,
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'banned');
  assert.match(violations[0]?.message ?? '', /banned term "сборка"/);
});

test('a document beyond the required set is still parsed', async () => {
  const violations = await violationsFor({
    'appendix.md': `# Appendix\n\n| Region | Label | Label (en) |\n|---|---|---|\n| footer | Сборка | Run |\n`,
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


// --- the second label column ------------------------------------------------
//
// A column the scan does not know about is worse than a missing check: the
// English labels would ship unchecked while `spec-integrity: OK` was printed.

test('a banned English term inside an English label is reported', async () => {
  const violations = await violationsFor({
    'vocabulary.md': `| Stage id | Label | Label (en) |\n|---|---|---|\n`
      + `| preflight | Подготовка | Setup |\n| build | Разработка | Build |\n\n`
      + `| Banned | Use instead |\n|---|---|\n| сборка | прогон |\n\n`
      + `| Banned (en) | Use instead (en) |\n|---|---|\n| build | run |\n`,
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'banned');
  assert.match(violations[0]?.message ?? '', /label "Build" uses banned term "build"/);
});

// The reason the English list is matched on word boundaries: `Rebuilt` carries
// the letters of `build` and none of its meaning, and a substring match would
// report it while the Russian list needs a substring match to catch «сборки».
test('an English label that merely contains a banned term is left alone', async () => {
  const violations = await violationsFor({
    'vocabulary.md': `| Stage id | Label | Label (en) |\n|---|---|---|\n`
      + `| preflight | Подготовка | Setup |\n| build | Разработка | Rebuilt work |\n\n`
      + `| Banned | Use instead |\n|---|---|\n| сборка | прогон |\n\n`
      + `| Banned (en) | Use instead (en) |\n|---|---|\n| build | run |\n`,
  });
  assert.deepEqual(violations, []);
});

// The mirror of the test above, and the reason the two columns are matched
// differently: «Пересборка» carries «сборка» inside it and is caught, while
// `Rebuilt` carries `build` inside it and is not. Russian inflects and compounds
// onto the stem; English puts a different word around it.
test('a Russian label containing a banned stem is reported', async () => {
  const violations = await violationsFor({
    'vocabulary.md': `| Stage id | Label | Label (en) |\n|---|---|---|\n`
      + `| preflight | Подготовка | Setup |\n| build | Пересборка | Development |\n\n`
      + `| Banned | Use instead |\n|---|---|\n| сборка | прогон |\n\n`
      + `| Banned (en) | Use instead (en) |\n|---|---|\n| build | run |\n`,
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0]?.message ?? '', /banned term "сборка"/);
});

test('a row with one label and not the other is reported', async () => {
  const violations = await violationsFor({
    'vocabulary.md': `| Stage id | Label | Label (en) |\n|---|---|---|\n`
      + `| preflight | Подготовка | Setup |\n| build | Разработка | |\n\n`
      + `| Banned | Use instead |\n|---|---|\n| сборка | прогон |\n\n`
      + `| Banned (en) | Use instead (en) |\n|---|---|\n| build | run |\n`,
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'labels');
  assert.match(violations[0]?.message ?? '', /"Разработка" has no Label \(en\) beside it/);
});

test('a table of labels that carries only one language is reported once', async () => {
  // Once, not once per row: the column is what is missing, and every row would
  // otherwise report the same repair.
  const violations = await violationsFor({
    'appendix.md': `# Appendix\n\n| Region | Label |\n|---|---|\n`
      + `| footer | Долг |\n| header | Этапы |\n`,
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'labels');
  assert.match(violations[0]?.message ?? '', /carries no Label \(en\) column/);
});

test('a specification with no English banned list is reported', async () => {
  const violations = await violationsFor({
    'vocabulary.md': `| Stage id | Label | Label (en) |\n|---|---|---|\n`
      + `| preflight | Подготовка | Setup |\n| build | Разработка | Development |\n\n`
      + `| Banned | Use instead |\n|---|---|\n| сборка | прогон |\n`,
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'banned');
  assert.match(violations[0]?.message ?? '', /Banned \(en\) and Use instead \(en\)/);
});

test('carries matches a stem one way and a whole word the other', () => {
  assert.equal(carries('пересборка', 'сборка', false), true);
  assert.equal(carries('сборка кода', 'сборка', false), true);
  assert.equal(carries('rebuilt work', 'build', true), false);
  assert.equal(carries('the build', 'build', true), true);
  assert.equal(carries('build-time', 'build', true), true);
});

// --- the second specification directory ------------------------------------

const SCOUT_BASELINE: Record<string, string> = {
  'README.md': `# Scout

## Machine-Readable Tables

| Document | Table | Required columns |
|---|---|---|
| \`steps.md\` | Steps | \`Id\`, \`Name\`, \`Reads\`, \`Produces\` |
| \`steps.md\` | Degradation | \`Capability\`, \`Absent\`, \`Cost\` |
| \`boundary.md\` | Boundary rules | \`Rule\`, \`What it forbids\` |
| \`reconcile.md\` | Proposal kinds | \`Kind\`, \`Shows\`, \`May be forced by\` |
| \`search.md\` | Sweeps | \`Sweep\`, \`Budget\`, \`Stops when\`, \`Produces\` |
| \`vocabulary.md\` | Scout terms | \`Term\`, \`Means\` |
| \`vocabulary.md\` | Borrowed terms | \`Term\`, \`Owned by\` |
`,
  'boundary.md': `# Boundary

| Rule | What it forbids |
|---|---|
| B1 | Treating a finding as a fact about the user |
`,
  'steps.md': `# Steps

| Id | Name | Reads | Produces |
|---|---|---|---|
| \`ground\` | Ground | the ТЗ | the working ТЗ |

| Capability | Absent | Cost |
|---|---|---|
| \`web\` | cannot fetch | the search step does not run |
`,
  'search.md': `# Search

| Sweep | Budget | Stops when | Produces |
|---|---|---|---|
| terminology | ~50 | three dry sources | a term list |
`,
  'reconcile.md': `# Reconcile

| Kind | Shows | May be forced by |
|---|---|---|
| \`add\` | the new line | an answer |
`,
  'output.md': `# Output

One asked-for thing per line.
`,
  'vocabulary.md': `# Vocabulary

| Term | Means |
|---|---|
| находка | something a sweep learned |

| Term | Owned by |
|---|---|
| бриф | the Maestro specification |
`,
};

async function scoutViolationsFor(overrides: Overrides = {}): Promise<Violation[]> {
  const parent = await mkdtemp(path.join(tmpdir(), 'spec-integrity-'));
  // Named `scout`, because the profile is resolved from the directory's own name.
  const dir = path.join(parent, 'scout');
  await mkdir(dir, { recursive: true });
  const files: Overrides = { ...SCOUT_BASELINE, ...overrides };
  for (const [name, body] of Object.entries(files)) {
    if (body === null) continue;
    await writeFile(path.join(dir, name), body, 'utf8');
  }
  try {
    return await checkSpec(dir, profileFor(dir));
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

test('profileFor picks the profile from the directory name', () => {
  assert.equal(profileFor('docs/spec/scout').name, 'scout');
  assert.equal(profileFor('docs/spec').name, 'maestro');
  assert.equal(profileFor('/tmp/spec-integrity-abc').name, 'maestro');
});

test('a consistent scout specification produces no violations', async () => {
  assert.deepEqual(await scoutViolationsFor(), []);
});

test('the two profiles have different required documents', async () => {
  // The whole reason for a per-directory required set: `phases.md` is required
  // in one directory and meaningless in the other, and one merged list would
  // have to drop it to fit both.
  assert.ok(MAESTRO_PROFILE.required.includes('phases.md'));
  assert.ok(!SCOUT_PROFILE.required.includes('phases.md'));
  assert.ok(SCOUT_PROFILE.required.includes('boundary.md'));
  assert.ok(!MAESTRO_PROFILE.required.includes('boundary.md'));
});

test('a missing scout document is reported under the scout required set', async () => {
  const violations = await scoutViolationsFor({ 'reconcile.md': null });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'documents');
  assert.match(violations[0]?.message ?? '', /reconcile\.md/);
});

test('a declared table that is not there is reported', async () => {
  const violations = await scoutViolationsFor({ 'search.md': '# Search\n\nNo table.\n' });
  assert.ok(violations.some(v => v.check === 'tables' && v.file === 'search.md'));
});

test('a table the section promises and no checker reads is reported', async () => {
  const violations = await scoutViolationsFor({
    'README.md': `${SCOUT_BASELINE['README.md']}| \`output.md\` | Shapes | \`Shape\`, \`Why\` |\n`,
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'tables');
  assert.match(violations[0]?.message ?? '', /promises a table no checker reads/);
});

test('a table the checker requires and the section does not list is reported', async () => {
  const trimmed = (SCOUT_BASELINE['README.md'] ?? '')
    .split('\n')
    .filter(line => !line.includes('Borrowed terms'))
    .join('\n');
  const violations = await scoutViolationsFor({ 'README.md': trimmed });
  assert.equal(violations.length, 1);
  assert.match(violations[0]?.message ?? '', /does not list/);
});

test('a link that resolves to nothing is reported', async () => {
  const violations = await scoutViolationsFor({
    'output.md': '# Output\n\nSee [the boundary](boundry.md).\n',
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'links');
  assert.match(violations[0]?.message ?? '', /boundry\.md/);
});

test('a link into the sibling specification is followed, not assumed', async () => {
  // The one-owner rule makes Scout link to `../safety.md` rather than restate S6.
  // A link that resolves to nothing turns a rule with one owner into none.
  const violations = await scoutViolationsFor({
    'boundary.md': `${SCOUT_BASELINE['boundary.md']}\nSee [safety](../safety.md).\n`,
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'links');
});
