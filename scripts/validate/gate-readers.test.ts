import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  CODEBASE_DENIED,
  CODEBASE_GIVEN_ROWS,
  CODEBASE_HANDED,
  CODEBASE_INPUT,
  checkGateReaders,
  checkModelTiers,
  checkStandardsSources,
  JUDGE_BRIEFS,
  REFERENCE_DENIED,
  REFERENCE_INPUT,
  declaredInputs,
  normalizeName,
  PRIOR_MEMORY_INPUT,
  sectionBody,
  splitNames,
  STANDARDS_DOCUMENTS,
  standardsSources,
  type Violation,
} from './gate-readers.ts';
import { PRIOR_FILE, readPriorMemory, renderPrior } from '../memory/markers.ts';
import { PROGRESS_FILE } from '../memory/progress.ts';
import { parseTables } from './spec-integrity.ts';
import { MEMORY_FILES_BY_HOST } from '../../skills/maestro/tools/runtime/memory.mts';

/** Every standards source, backticked, as the shipped prose names them. */
const SOURCES_LINE = standardsSources().map(source => `\`${source}\``).join(', ');

// Fixtures are generated per test, as everywhere else in this directory: each
// one differs from the agreeing baseline by exactly the defect under test.
const SPEC = `# Gates

| Gate | After phase | Pass condition |
|---|---|---|
| G2 | spec | an independent reader finds nothing missing |

### What Each Independent Reader Is Given

| Gate | Reader's brief | Given | Withheld |
|---|---|---|---|
| G2 | \`independent-reader.md\` | \`brief.md\`, \`spec.md\` | \`codebase.md\`, the манифест, \`prior.md\` |
| G4 | \`acceptance-reader.md\` | \`manifest.md\`, the additions block of \`brief.md\`, the running build | \`codebase.md\`, \`spec.md\`, \`prior.md\` |
`;

const INDEPENDENT = `# Independent Reader

## What You Are Given

| Input | What it is |
|---|---|
| \`brief.md\` | what the user asked for |
| \`spec.md\` | what is going to be built |

## What You Are Not Given

| Input | What it is |
|---|---|
| the манифест | the interpreted requirement list |
| \`codebase.md\` | the прогон's reading of the code |
| \`prior.md\` | what earlier runs decided |

## Your Question

Is there anything in the brief the specification does not account for?
`;

const ACCEPTANCE = `# Acceptance Reader

## What You Are Given

| Input | What it is |
|---|---|
| \`manifest.md\` | the numbered требования |
| the additions block of \`brief.md\` | the dated entries |
| the running build | the project as it now is |

## What You Are Not Given

| Input | What it is |
|---|---|
| \`spec.md\` | the implementation specification |
| \`codebase.md\` | the прогон's reading of the code |
| \`prior.md\` | what earlier runs decided |

## Your Question

Does the build do each требование?
`;

type Overrides = {
  spec?: string;
  independent?: string;
  acceptance?: string;
  /** Further briefs by file name, for a row the baseline table does not carry. */
  briefs?: Record<string, string>;
};

async function violationsFor(overrides: Overrides = {}): Promise<Violation[]> {
  const root = await mkdtemp(path.join(tmpdir(), 'gate-readers-'));
  try {
    const specDir = path.join(root, 'spec');
    const promptsDir = path.join(root, 'bundle', 'prompts');
    await mkdir(specDir, { recursive: true });
    await mkdir(promptsDir, { recursive: true });
    await writeFile(path.join(specDir, 'gates.md'), overrides.spec ?? SPEC, 'utf8');
    await writeFile(
      path.join(promptsDir, 'independent-reader.md'),
      overrides.independent ?? INDEPENDENT,
      'utf8',
    );
    await writeFile(
      path.join(promptsDir, 'acceptance-reader.md'),
      overrides.acceptance ?? ACCEPTANCE,
      'utf8',
    );
    for (const [name, body] of Object.entries(overrides.briefs ?? {})) {
      await writeFile(path.join(promptsDir, name), body, 'utf8');
    }
    return await checkGateReaders({ specDir, bundleDir: path.join(root, 'bundle') });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const checks = (violations: Violation[]): string[] => violations.map(v => v.check);

test('a specification and its reader briefs that agree produce no violations', async () => {
  assert.deepEqual(await violationsFor({}), []);
});

test('a brief that does not declare an artifact the specification lists is reported', async () => {
  const violations = await violationsFor({
    acceptance: ACCEPTANCE.replace('| the running build | the project as it now is |\n', ''),
  });
  assert.deepEqual(checks(violations), ['inputs']);
  assert.match(violations[0]?.message ?? '', /does not declare "the running build"/);
  // Both places are named, because the finding is about the pair and not about
  // either one of them.
  assert.match(violations[0]?.message ?? '', /gates\.md/);
});

test('a brief that declares an artifact the specification does not list is reported', async () => {
  const violations = await violationsFor({
    independent: INDEPENDENT.replace('| `spec.md` | what is going to be built |\n',
      '| `spec.md` | what is going to be built |\n| `reviews/` | the review notes |\n'),
  });
  assert.deepEqual(checks(violations), ['inputs']);
  assert.match(violations[0]?.message ?? '', /declares "reviews\/"/);
  assert.match(violations[0]?.message ?? '', /does not list among what this reader is given/);
});

test('a missing withheld input is reported', async () => {
  const violations = await violationsFor({
    acceptance: ACCEPTANCE.replace('| `spec.md` | the implementation specification |\n', ''),
  });
  assert.deepEqual(checks(violations), ['withheld']);
  assert.match(violations[0]?.message ?? '', /does not withhold "spec\.md"/);
});

test('an extra withheld input is reported', async () => {
  const violations = await violationsFor({
    independent: INDEPENDENT.replace('| the манифест | the interpreted requirement list |\n',
      '| the манифест | the interpreted requirement list |\n| `reviews/` | prior verdicts |\n'),
  });
  assert.deepEqual(checks(violations), ['withheld']);
  assert.match(violations[0]?.message ?? '', /withholds "reviews\/"/);
});

test('the additions reach the reader through the same name on both sides', async () => {
  // The name is a phrase rather than a filename, and the check has to compare
  // it as one — `the additions block of brief.md` is not `brief.md`.
  const violations = await violationsFor({
    spec: SPEC.replace('the additions block of `brief.md`', '`brief.md`'),
  });
  assert.deepEqual(checks(violations), ['inputs', 'inputs']);
  assert.match(violations[0]?.message ?? '', /does not declare "brief\.md"/);
  assert.match(violations[1]?.message ?? '', /declares "the additions block of brief\.md"/);
});

test('a gate the specification declares with no brief is reported', async () => {
  const violations = await violationsFor({
    spec: SPEC.replace('| G4 | `acceptance-reader.md` |', '| G4 | `gone-reader.md` |'),
  });
  // The brief the row stopped naming is now outside the table and still names
  // codebase.md, which is a finding of its own.
  assert.deepEqual(checks(violations), ['briefs', 'codebase-briefs']);
  assert.match(violations[0]?.message ?? '', /not in .*prompts/);
});

test('a brief with no declared inputs is reported rather than skipped', async () => {
  const violations = await violationsFor({
    acceptance: '# Acceptance Reader\n\nYou have been given the манифест and the build.\n',
  });
  assert.deepEqual(checks(violations), ['briefs']);
  assert.match(violations[0]?.message ?? '', /must declare what it is handed/);
});

test('a specification with no reader table is reported', async () => {
  const violations = await violationsFor({ spec: '# Gates\n\n| Gate | After phase |\n|---|---|\n| G2 | spec |\n' });
  assert.deepEqual(checks(violations), ['declared']);
  assert.match(violations[0]?.message ?? '', /one home a machine can read/);
});

test('the real gate table matches the briefs the bundle actually ships', async () => {
  // The fixture above proves the rule fires; this proves the repository's own
  // specification and bundle satisfy it, which no fixture can check.
  const root = path.resolve(import.meta.dirname, '..', '..');
  const violations = await checkGateReaders({
    specDir: path.join(root, 'docs', 'spec'),
    bundleDir: path.join(root, 'skills', 'maestro'),
  });
  assert.deepEqual(violations, []);
});

test('sectionBody stops at the next heading of the same level', () => {
  const body = sectionBody('# T\n\n## One\n\na\n\n## Two\n\nb\n', 'One');
  assert.equal(body, '\na\n');
});

test('declaredInputs reads only the section it is named after', () => {
  const markdown = '## Other\n\n| Input | What it is |\n|---|---|\n| `decoy.md` | x |\n'
    + '\n## What You Are Given\n\n| Input | What it is |\n|---|---|\n| `real.md` | y |\n';
  assert.deepEqual(declaredInputs(markdown), ['real.md']);
});

test('a name is compared without the decoration it was written with', () => {
  assert.equal(normalizeName('**the running build**'), 'the running build');
  assert.equal(normalizeName('`brief.md`.'), 'brief.md');
  assert.equal(normalizeName('the   additions  block of `brief.md`'), 'the additions block of brief.md');
  assert.deepEqual(splitNames('`a.md`, the b of `c.md`'), ['a.md', 'the b of c.md']);
});

test('a reader cannot both receive and withhold the same source interpretation', async () => {
  const violations = await violationsFor({ spec: SPEC.replace(
    '| G2 | `independent-reader.md` | `brief.md`, `spec.md` | `codebase.md`, the манифест, `prior.md` |',
    '| G2 | `independent-reader.md` | `brief.md`, `spec.md`, the манифест | `codebase.md`, the манифест, `prior.md` |'),
    independent: INDEPENDENT.replace('| `spec.md` | what is going to be built |',
      '| `spec.md` | what is going to be built |\n| the манифест | supplied interpretation |'),
  });
  assert.ok(violations.some(item => item.check === 'boundary'));
});

test('a prior decision handed to the spec reader is reported', async () => {
  const violations = await violationsFor({
    spec: SPEC.replace(
      '| G2 | `independent-reader.md` | `brief.md`, `spec.md` | `codebase.md`, the манифест, `prior.md` |',
      '| G2 | `independent-reader.md` | `brief.md`, `spec.md`, `prior.md` | `codebase.md`, the манифест |'),
    independent: INDEPENDENT
      .replace('| `spec.md` | what is going to be built |',
        '| `spec.md` | what is going to be built |\n| `prior.md` | what earlier runs decided |')
      .replace('| `prior.md` | what earlier runs decided |\n\n## Your Question', '\n## Your Question'),
  });
  const memory = violations.filter(item => item.check === 'memory');
  assert.equal(memory.length, 1, JSON.stringify(violations));
  assert.match(memory[0]!.message, /gate G2 gives its reader prior\.md/);
});

test('a reader row that does not withhold prior memory is reported, even with its brief agreeing', async () => {
  const violations = await violationsFor({
    spec: SPEC.replace('| `codebase.md`, `spec.md`, `prior.md` |', '| `codebase.md`, `spec.md` |'),
    acceptance: ACCEPTANCE.replace('| `prior.md` | what earlier runs decided |\n', ''),
  });
  assert.deepEqual(checks(violations), ['memory']);
  assert.match(violations[0]!.message, /gate G4 does not withhold prior\.md/);
});

test('the withheld name is the file the memory read actually writes, so the two cannot drift apart', () => {
  assert.equal(PRIOR_MEMORY_INPUT, PRIOR_FILE);
});

// --- the task-file reader is held like every other reader ----------------------

const TASK_ROW = '| G3 task | `task-reader.md` | the task file, `interfaces.md` | `spec.md`, `manifest.md`, `codebase.md`, the other task files, `prior.md` |\n';

const TASK_READER = `# Task-File Reader

## What You Are Given

| Input | What it is |
|---|---|
| the task file | what to build, its Depends on and its done means |
| \`interfaces.md\` | the shared boundaries |

## What You Are Not Given

| Input | What it is |
|---|---|
| \`spec.md\` | the specification |
| \`manifest.md\` | the numbered requirement list |
| the other task files | every other таск |
| \`codebase.md\` | the прогон's reading of the code |
| \`prior.md\` | what earlier runs decided |

## Your Question

Could you build this without asking a question?
`;

const withTaskRow = (row = TASK_ROW): string => `${SPEC}${row}`;

test('a task reader that agrees with its G3 task row produces no violations', async () => {
  assert.deepEqual(await violationsFor({ spec: withTaskRow(), briefs: { 'task-reader.md': TASK_READER } }), []);
});

test('a task reader handed the other task files is reported, on both sides of the row', async () => {
  const violations = await violationsFor({
    spec: withTaskRow(),
    briefs: { 'task-reader.md': TASK_READER
      .replace('| the other task files | every other таск |\n', '')
      .replace('| `interfaces.md` | the shared boundaries |\n',
        '| `interfaces.md` | the shared boundaries |\n| the other task files | every other таск |\n') },
  });
  assert.deepEqual(checks(violations).sort(), ['inputs', 'withheld']);
  assert.ok(violations.every(v => v.message.includes('the other task files')), JSON.stringify(violations));
});

test('a G3 task row that does not withhold prior memory is reported', async () => {
  const violations = await violationsFor({
    spec: withTaskRow(TASK_ROW.replace(', `prior.md` |', ' |')),
    briefs: { 'task-reader.md': TASK_READER.replace('| `prior.md` | what earlier runs decided |\n', '') },
  });
  assert.deepEqual(checks(violations), ['memory']);
  assert.match(violations[0]!.message, /gate G3 task does not withhold prior\.md/);
});

// --- the standards reader gates nothing, and is held like every reader ---------

const STANDARDS_ROW = '| standards (no gate) | `standards-reader.md` | every таск\'s per-commit diffs, the project\'s documented standards | `spec.md`, `manifest.md`, the task files, `interfaces.md`, `reviews/`, `codebase.md`, `prior.md` |\n';

const STANDARDS_READER = `# Standards Reader

## What You Are Given

| Input | What it is |
|---|---|
| every таск's per-commit diffs | each commit of every таск, labelled |
| the project's documented standards | the project's own documents: ${SOURCES_LINE} |

## What You Are Not Given

| Input | What it is |
|---|---|
| \`spec.md\` | the specification |
| \`manifest.md\` | the numbered requirement list |
| the task files | what each executor was told |
| \`interfaces.md\` | the shared boundaries |
| \`reviews/\` | what each reviewer found |
| \`codebase.md\` | the прогон's reading of the code |
| \`prior.md\` | what earlier runs decided |

## Your Question

What would the project's own standards notice across таски?
`;

test('a standards reader that agrees with its row produces no violations', async () => {
  assert.deepEqual(await violationsFor({
    spec: `${SPEC}${STANDARDS_ROW}`, briefs: { 'standards-reader.md': STANDARDS_READER } }), []);
});

test('a standards reader handed the task files is reported, on both sides of the row', async () => {
  const violations = await violationsFor({
    spec: `${SPEC}${STANDARDS_ROW}`,
    briefs: { 'standards-reader.md': STANDARDS_READER
      .replace('| the task files | what each executor was told |\n', '')
      .replace(`| the project's documented standards | the project's own documents: ${SOURCES_LINE} |\n`,
        `| the project's documented standards | the project's own documents: ${SOURCES_LINE} |\n`
        + '| the task files | what each executor was told |\n') },
  });
  assert.deepEqual(checks(violations).sort(), ['inputs', 'withheld']);
  assert.ok(violations.every(v => v.message.includes('the task files')), JSON.stringify(violations));
});

test('a standards row that does not withhold prior memory is reported', async () => {
  const violations = await violationsFor({
    spec: `${SPEC}${STANDARDS_ROW.replace(', `prior.md` |', ' |')}`,
    briefs: { 'standards-reader.md': STANDARDS_READER.replace('| `prior.md` | what earlier runs decided |\n', '') },
  });
  assert.deepEqual(checks(violations), ['memory']);
  assert.match(violations[0]!.message, /standards \(no gate\) does not withhold prior\.md/);
});

// --- codebase.md: contextual readers and executors receive it; blind readers do not ---

const CONSISTENCY_ROW = '| G3 consistency | `plan-consistency-reader.md` | every task file, `interfaces.md`, `codebase.md` | `spec.md`, `prior.md` |\n';

const CONSISTENCY_READER = `# Plan-Consistency Reader

## What You Are Given

| Input | What it is |
|---|---|
| every task file | every таск |
| \`interfaces.md\` | the shared boundaries |
| \`codebase.md\` | what the repository held before this прогон |

## What You Are Not Given

| Input | What it is |
|---|---|
| \`spec.md\` | the specification |
| \`prior.md\` | what earlier runs decided |
`;

const EXECUTOR = `# Executor

You have been given a task file, \`interfaces.md\`, and \`codebase.md\` when the
прогон has one.

You have not seen \`spec.md\`, \`reference.md\`, or the other таски.

## Your Job

Build it.
`;

const REVIEWER = `# Reviewer

You are given the task file and the diff.

You have not seen \`spec.md\`, the plan, \`codebase.md\`, \`reference.md\`, or any other таск.

## Your Question

Does the diff do what the task file says?
`;

const DIAGNOSTICIAN = `# Repair Diagnostician

You are given the failure.

## Your Question

Why did it fail?
`;

const codebaseFixture = (overrides: { spec?: string; briefs?: Record<string, string> } = {}): Promise<Violation[]> =>
  violationsFor({
    spec: overrides.spec ?? `${SPEC}${CONSISTENCY_ROW}`,
    briefs: {
      'plan-consistency-reader.md': CONSISTENCY_READER,
      'executor.md': EXECUTOR,
      'reviewer.md': REVIEWER,
      'repair-diagnostician.md': DIAGNOSTICIAN,
      ...overrides.briefs,
    },
  });

test('the plan-consistency reader given codebase.md, the executor told of it and the reviewer denied it produce no violations', async () => {
  assert.deepEqual(await codebaseFixture(), []);
});

test('the G3 consistency row losing codebase.md is reported on gates.md', async () => {
  const violations = await codebaseFixture({
    spec: `${SPEC}${CONSISTENCY_ROW.replace(', `codebase.md` |', ' |')}`,
    briefs: { 'plan-consistency-reader.md': CONSISTENCY_READER.replace('| `codebase.md` | what the repository held before this прогон |\n', '') },
  });
  assert.deepEqual(checks(violations), ['codebase']);
  assert.match(violations[0]!.file, /gates\.md$/);
  assert.match(violations[0]!.message, /gate G3 consistency does not give its reader codebase\.md/);
});

test('a G2 row giving codebase.md is reported, because a blind reader would inherit the прогон\'s reading of the code', async () => {
  const violations = await codebaseFixture({
    spec: `${SPEC.replace('| `brief.md`, `spec.md` | `codebase.md`, the манифест, `prior.md` |', '| `brief.md`, `spec.md`, `codebase.md` | the манифест, `prior.md` |')}${CONSISTENCY_ROW}`,
    briefs: {
      'independent-reader.md': INDEPENDENT
        .replace('| `codebase.md` | the прогон\'s reading of the code |\n', '')
        .replace('| `spec.md` | what is going to be built |\n', '| `spec.md` | what is going to be built |\n| `codebase.md` | the code |\n'),
    },
  });
  assert.deepEqual(checks(violations), ['codebase']);
  assert.match(violations[0]!.message, /gate G2 gives its reader codebase\.md — only G3 consistency, G2 architecture may/);
});

test('a G4 row that does not withhold codebase.md is reported', async () => {
  const violations = await codebaseFixture({
    spec: `${SPEC.replace('| `codebase.md`, `spec.md`, `prior.md` |', '| `spec.md`, `prior.md` |')}${CONSISTENCY_ROW}`,
    briefs: { 'acceptance-reader.md': ACCEPTANCE.replace('| `codebase.md` | the прогон\'s reading of the code |\n', '') },
  });
  assert.deepEqual(checks(violations), ['codebase']);
  assert.match(violations[0]!.message, /gate G4 does not withhold codebase\.md/);
});

test('an executor brief whose opening does not name codebase.md is reported on that brief', async () => {
  const violations = await codebaseFixture({
    briefs: { 'executor.md': EXECUTOR.replace(', and `codebase.md` when the\nпрогон has one', '') + '\nRead `codebase.md` later.\n' },
  });
  assert.deepEqual(checks(violations), ['codebase-briefs']);
  assert.match(violations[0]!.file, /executor\.md$/);
  assert.match(violations[0]!.message, /opening of executor\.md/);
});

test('a reviewer brief whose "You have not seen" paragraph does not name codebase.md is reported', async () => {
  const violations = await codebaseFixture({
    briefs: { 'reviewer.md': REVIEWER.replace(' `codebase.md`,', '') },
  });
  assert.deepEqual(checks(violations), ['codebase-briefs']);
  assert.match(violations[0]!.file, /reviewer\.md$/);
});

test('reference.md is withheld from exactly the executor and the reviewer', () => {
  assert.equal(REFERENCE_INPUT, 'reference.md');
  assert.deepEqual([...REFERENCE_DENIED], ['executor.md', 'reviewer.md']);
});

for (const [brief, body] of [['executor.md', EXECUTOR], ['reviewer.md', REVIEWER]] as const) {
  test(`${brief} dropping reference.md from its "You have not seen" paragraph is reported on that brief`, async () => {
    const violations = await codebaseFixture({ briefs: { [brief]: body.replace(' \`reference.md\`,', '') } });
    assert.deepEqual(checks(violations), ['reference-briefs']);
    assert.ok(violations[0]!.file.endsWith(brief), violations[0]!.file);
    assert.equal(violations[0]!.message, `name \`reference.md\` among what ${brief} has not seen — a таск follows only the references its task file cites`);
  });
}

test('a repair diagnostician brief that mentions codebase.md is reported', async () => {
  const violations = await codebaseFixture({
    briefs: { 'repair-diagnostician.md': DIAGNOSTICIAN.replace('You are given the failure.', 'You are given the failure and `codebase.md`.') },
  });
  assert.deepEqual(checks(violations), ['codebase-briefs']);
  assert.match(violations[0]!.file, /repair-diagnostician\.md$/);
  assert.match(violations[0]!.message, /remove the mention/);
});

test('codebase.md is given to exactly the rows the list names, and the list names the real table\'s row', () => {
  assert.equal(CODEBASE_INPUT, 'codebase.md');
  assert.deepEqual([...CODEBASE_GIVEN_ROWS], ['G3 consistency', 'G2 architecture']);
  assert.deepEqual([...CODEBASE_HANDED], ['executor.md']);
  assert.deepEqual([...CODEBASE_DENIED], ['reviewer.md']);
});

// --- who runs on which model tier -------------------------------------------

const TIER_ROWS = [
  '| preflight probe | — | `standard` |',
  '| existing-code reader | `existing-code-reader.md` | `standard` |',
  '| build executor | `executor.md` | the таск\'s |',
  '| repair executor | `executor.md` | `strong` |',
  '| reviewer | `reviewer.md` | `strong` |',
];

async function tiersFor(rows: string[], briefs = ['existing-code-reader.md', 'executor.md', 'reviewer.md']): Promise<Violation[]> {
  const root = await mkdtemp(path.join(tmpdir(), 'gate-tiers-'));
  try {
    const specDir = path.join(root, 'spec');
    const bundleDir = path.join(root, 'bundle');
    await mkdir(specDir, { recursive: true });
    await mkdir(path.join(bundleDir, 'prompts'), { recursive: true });
    await writeFile(path.join(specDir, 'dials.md'), `# Dials\n\n| Role | Brief | Tier |\n|---|---|---|\n${rows.join('\n')}\n`);
    for (const brief of briefs) await writeFile(path.join(bundleDir, 'prompts', brief), `# ${brief}\n`);
    return await checkModelTiers(specDir, bundleDir);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('a tier table that runs every shipped brief, judges on strong, passes', async () => {
  assert.deepEqual(await tiersFor(TIER_ROWS), []);
});

test('a brief the bundle ships and no tier row runs is reported', async () => {
  const found = await tiersFor(TIER_ROWS.filter(row => !row.includes('reviewer')));
  assert.equal(found.length, 1);
  assert.match(found[0]!.message, /^reviewer\.md ships in .* and no row of the tier table runs it — add its role and tier$/);
});

test('a tier outside strong, standard and the таск\'s is reported on its row', async () => {
  const found = await tiersFor([...TIER_ROWS.slice(0, 4), '| reviewer | `reviewer.md` | `cheap` |']);
  assert.ok(found.some(v => /role "reviewer" runs on "cheap" — write strong, standard or the таск's/.test(v.message)), JSON.stringify(found));
});

test('a judge on a standard row is reported, wherever the row is', async () => {
  const found = await tiersFor([...TIER_ROWS, '| second look | `reviewer.md` | `standard` |']);
  assert.equal(found.length, 1);
  assert.match(found[0]!.message, /reviewer\.md is a judge and role "second look" runs it on standard — a judge never runs below what it judges/);
});

test('the таск\'s tier on a brief that builds no таск is reported', async () => {
  const found = await tiersFor([...TIER_ROWS.slice(0, 4), '| reviewer | `reviewer.md` | the таск\'s |']);
  assert.ok(found.some(v => /role "reviewer" takes the таск's tier, but reviewer\.md builds no таск/.test(v.message)), JSON.stringify(found));
});

test('a row naming a brief the bundle does not ship is reported', async () => {
  const found = await tiersFor([...TIER_ROWS, '| ghost | `ghost-reader.md` | `strong` |']);
  assert.equal(found.length, 1);
  assert.match(found[0]!.message, /role "ghost" names ghost-reader\.md, which .* does not ship/);
});

test('a shipped brief no list classifies is reported on the brief itself', async () => {
  const found = await tiersFor([...TIER_ROWS, '| scout | `scout.md` | `strong` |'], ['existing-code-reader.md', 'executor.md', 'reviewer.md', 'scout.md']);
  assert.equal(found.length, 1);
  assert.match(found[0]!.file, /prompts[\\/]scout\.md$/);
  assert.match(found[0]!.message, /in none of JUDGE_BRIEFS, STANDARD_BRIEFS or TIERED_BRIEFS/);
});

test('a polish-reader.md shipped again is reported, because no tier row runs it and no list classifies it', async () => {
  const found = await tiersFor(TIER_ROWS, ['existing-code-reader.md', 'executor.md', 'reviewer.md', 'polish-reader.md']);
  assert.ok(found.length > 0);
  assert.ok(found.every(v => /polish-reader\.md/.test(v.message) || /polish-reader\.md$/.test(v.file)), JSON.stringify(found));
});

test('the shipped tier table runs every shipped brief, and the eleven judges on strong', async () => {
  const root = path.resolve(import.meta.dirname, '..', '..');
  assert.equal(JUDGE_BRIEFS.length, 11);
  assert.deepEqual(await checkModelTiers(path.join(root, 'docs', 'spec'), path.join(root, 'skills', 'maestro')), []);
});

// --- where the standards reader's documents are gathered from ---------------

const STANDARDS_PHASE = `# Review\n\n### 5. Write the state\n\nx\n\n### 6. One standards pass\n\nSearch ${SOURCES_LINE}.\n\n## When It Does Not Go That Way\n\ny\n`;
const STANDARDS_SPEC = `# Phases\n\n## Review\n\n### One Standards Pass\n\nThe reader is given ${SOURCES_LINE}.\n\n### The Таск Lifecycle\n\nz\n`;
const STANDARDS_BRIEF = `# Standards Reader\n\n## What You Are Given\n\n| Input | What it is |\n|---|---|\n| the project's documented standards | ${SOURCES_LINE} |\n\n## What You Are Not Given\n\nw\n`;

async function standardsFor(files: { phase?: string | null; spec?: string | null; brief?: string | null } = {}): Promise<Violation[]> {
  const root = await mkdtemp(path.join(tmpdir(), 'gate-standards-'));
  try {
    const specDir = path.join(root, 'spec');
    const bundleDir = path.join(root, 'bundle');
    await mkdir(specDir, { recursive: true });
    await mkdir(path.join(bundleDir, 'phases'), { recursive: true });
    await mkdir(path.join(bundleDir, 'prompts'), { recursive: true });
    const phase = files.phase === undefined ? STANDARDS_PHASE : files.phase;
    const spec = files.spec === undefined ? STANDARDS_SPEC : files.spec;
    const brief = files.brief === undefined ? STANDARDS_BRIEF : files.brief;
    if (phase !== null) await writeFile(path.join(bundleDir, 'phases', '6-review.md'), phase);
    if (spec !== null) await writeFile(path.join(specDir, 'phases.md'), spec);
    if (brief !== null) await writeFile(path.join(bundleDir, 'prompts', 'standards-reader.md'), brief);
    return await checkStandardsSources(specDir, bundleDir);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('a phase step, a spec section and a brief that name every standards source produce no violations', async () => {
  assert.deepEqual(await standardsFor(), []);
});

test('a phase step that drops a host memory file is reported on the phase file, naming the host', async () => {
  const found = await standardsFor({ phase: STANDARDS_PHASE.replace('`GEMINI.md`, ', '') });
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.equal(found[0]!.check, 'standards');
  assert.match(found[0]!.file, /phases[\\/]6-review\.md$/);
  assert.match(found[0]!.message, /`GEMINI\.md`.*memory file of gemini-cli/);
});

test('a memory file two hosts load is reported with both hosts', async () => {
  const found = await standardsFor({ phase: STANDARDS_PHASE.replace('`AGENTS.md`, ', '') });
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.match(found[0]!.message, /memory file of claude-code and codex/);
});

test('a spec section that drops STYLEGUIDE* is reported on phases.md', async () => {
  const found = await standardsFor({ spec: STANDARDS_SPEC.replace('`STYLEGUIDE*`, ', '') });
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.match(found[0]!.file, /phases\.md$/);
  assert.match(found[0]!.message, /`STYLEGUIDE\*`/);
});

test('a brief that drops CODING_STANDARDS* is reported on the brief', async () => {
  const found = await standardsFor({ brief: STANDARDS_BRIEF.replace('`CODING_STANDARDS*`, ', '') });
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.match(found[0]!.file, /standards-reader\.md$/);
  assert.match(found[0]!.message, /`CODING_STANDARDS\*`/);
});

test('a source named in phases.md only outside One Standards Pass is still reported', async () => {
  const spec = STANDARDS_SPEC.replace('`GEMINI.md`, ', '').replace('z\n', 'z, and `GEMINI.md`\n');
  const found = await standardsFor({ spec });
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.match(found[0]!.message, /`GEMINI\.md`/);
});

test('a renamed One Standards Pass heading is one missing-section finding, not a silent skip', async () => {
  const found = await standardsFor({ spec: STANDARDS_SPEC.replace('### One Standards Pass', '### Standards Pass') });
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.match(found[0]!.message, /no `### One Standards Pass` section/);
});

test('a fixture with none of the three files has nothing to hold', async () => {
  assert.deepEqual(await standardsFor({ phase: null, spec: null, brief: null }), []);
});

test('the standards sources carry every memory file of every host, and every standards document', () => {
  const sources = standardsSources();
  for (const [id, host] of Object.entries(MEMORY_FILES_BY_HOST)) {
    for (const file of host.groups.flat()) assert.ok(sources.includes(file), `${file} of ${id}`);
  }
  for (const document of STANDARDS_DOCUMENTS) assert.ok(sources.includes(document), document);
  assert.equal(new Set(sources).size, sources.length);
});

test('the shipped phase step, spec section and brief name every standards source', async () => {
  const root = path.resolve(import.meta.dirname, '..', '..');
  assert.deepEqual(await checkStandardsSources(path.join(root, 'docs', 'spec'), path.join(root, 'skills', 'maestro')), []);
});

test('sectionBody at level 3 stops at the next ### and at the next ##', () => {
  assert.equal(sectionBody('### A\n\na\n\n### B\n\nb\n', 'A', 3), '\na\n');
  assert.equal(sectionBody('## R\n\n### A\n\na\n\n## S\n\ns\n', 'A', 3), '\na\n');
});

// --- where the work stands reaches no reader -----------------------------------

test('what the progress file says reaches a reader only inside prior.md, which every reader withholds', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'gate-readers-progress-'));
  try {
    const runRoot = path.join(root, '.maestro');
    await mkdir(path.join(runRoot, '2026-10-12-next--wip'), { recursive: true });
    const progress = '# Where The Work Stands\n\nClosed 2026-10-01-first on 2026-10-01T12:00:00Z, outcome completed, at commit none.\n\n## Not Done\n\n- [2026-10-01-first#R02] R02 Exports — deferred: later\n';
    await writeFile(path.join(runRoot, PROGRESS_FILE), progress, 'utf8');
    const prior = renderPrior(await readPriorMemory(root, runRoot, '2026-10-12-next--wip', { gitBinary: 'git-that-is-not-installed' }), new Date('2026-10-12T09:00:00Z'));
    assert.ok(prior.includes(progress.trimEnd()), 'prior.md does not carry the progress file');

    const gates = await readFile(new URL('../../docs/spec/gates.md', import.meta.url), 'utf8');
    const table = parseTables(gates).find(found => ['Gate', "Reader's brief", 'Given', 'Withheld'].every(column => found.columns.includes(column)));
    assert.ok(table, 'gates.md has no reader table');
    const forbidden = [PRIOR_MEMORY_INPUT, PROGRESS_FILE].map(name => normalizeName(name));
    for (const row of table.rows) {
      const given = splitNames(row['Given']);
      for (const name of forbidden) assert.equal(given.includes(name), false, `${String(row['Gate'])} gives ${name}`);
      const brief = normalizeName(row["Reader's brief"]);
      const declared = declaredInputs(await readFile(new URL(`../../skills/maestro/prompts/${brief}`, import.meta.url), 'utf8')) ?? [];
      for (const name of forbidden) assert.equal(declared.includes(name), false, `${brief} declares ${name} as given`);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

// Contextual architecture checks must never widen the blind readers' inputs.
const ARCHITECTURE_ROW = '| G2 architecture | `spec-architecture-reader.md` | `spec.md`, `codebase.md`, `manifest.md`, `answers.md` | `brief.md`, `prior.md`, the plan, prior verdicts, the repository |\n';
const ARCHITECTURE_READER = `# Architecture Reader

## What You Are Given

| Input | What it is |
|---|---|
| spec.md | proposed behavior |
| codebase.md | discovered decisions |
| manifest.md | current requirements |
| answers.md | current decisions |

## What You Are Not Given

| Input | What it is |
|---|---|
| brief.md | original request |
| prior.md | earlier run memory |
| the plan | later work |
| prior verdicts | other readers |
| the repository | raw source |
`;

test('the contextual G2 architecture reader receives decision context without widening blind inputs', async () => {
  assert.deepEqual(await codebaseFixture({
    spec: `${SPEC}${CONSISTENCY_ROW}${ARCHITECTURE_ROW}`,
    briefs: { 'spec-architecture-reader.md': ARCHITECTURE_READER },
  }), []);
});

test('removing decision context from both architecture declarations still fails the reader boundary', async () => {
  const violations = await codebaseFixture({
    spec: `${SPEC}${CONSISTENCY_ROW}${ARCHITECTURE_ROW.replace('`codebase.md`, ', '')}`,
    briefs: { 'spec-architecture-reader.md': ARCHITECTURE_READER.replace('| codebase.md | discovered decisions |\n', '') },
  });
  assert.deepEqual(checks(violations), ['codebase']);
  assert.match(violations[0]!.message, /G2 architecture does not give/);
});
