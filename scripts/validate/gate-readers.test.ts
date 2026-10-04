import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  checkGateReaders,
  declaredInputs,
  normalizeName,
  PRIOR_MEMORY_INPUT,
  sectionBody,
  splitNames,
  type Violation,
} from './gate-readers.ts';
import { PRIOR_FILE } from '../memory/markers.ts';

// Fixtures are generated per test, as everywhere else in this directory: each
// one differs from the agreeing baseline by exactly the defect under test.
const SPEC = `# Gates

| Gate | After phase | Pass condition |
|---|---|---|
| G2 | spec | an independent reader finds nothing missing |

### What Each Independent Reader Is Given

| Gate | Reader's brief | Given | Withheld |
|---|---|---|---|
| G2 | \`independent-reader.md\` | \`brief.md\`, \`spec.md\` | the манифест, \`prior.md\` |
| G4 | \`acceptance-reader.md\` | \`manifest.md\`, the additions block of \`brief.md\`, the running build | \`spec.md\`, \`prior.md\` |
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
  assert.deepEqual(checks(violations), ['briefs']);
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
    '| G2 | `independent-reader.md` | `brief.md`, `spec.md` | the манифест, `prior.md` |',
    '| G2 | `independent-reader.md` | `brief.md`, `spec.md`, the манифест | the манифест, `prior.md` |'),
    independent: INDEPENDENT.replace('| `spec.md` | what is going to be built |',
      '| `spec.md` | what is going to be built |\n| the манифест | supplied interpretation |'),
  });
  assert.ok(violations.some(item => item.check === 'boundary'));
});

test('a prior decision handed to the spec reader is reported', async () => {
  const violations = await violationsFor({
    spec: SPEC.replace(
      '| G2 | `independent-reader.md` | `brief.md`, `spec.md` | the манифест, `prior.md` |',
      '| G2 | `independent-reader.md` | `brief.md`, `spec.md`, `prior.md` | the манифест |'),
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
    spec: SPEC.replace('| `spec.md`, `prior.md` |', '| `spec.md` |'),
    acceptance: ACCEPTANCE.replace('| `prior.md` | what earlier runs decided |\n', ''),
  });
  assert.deepEqual(checks(violations), ['memory']);
  assert.match(violations[0]!.message, /gate G4 does not withhold prior\.md/);
});

test('the withheld name is the file the memory read actually writes, so the two cannot drift apart', () => {
  assert.equal(PRIOR_MEMORY_INPUT, PRIOR_FILE);
});

// --- the task-file reader is held like every other reader ----------------------

const TASK_ROW = '| G3 task | `task-reader.md` | the task file, `interfaces.md` | `spec.md`, `manifest.md`, the other task files, `prior.md` |\n';

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

const STANDARDS_ROW = '| standards (no gate) | `standards-reader.md` | every таск\'s per-commit diffs, the project\'s documented standards | `spec.md`, `manifest.md`, the task files, `interfaces.md`, `reviews/`, `prior.md` |\n';

const STANDARDS_READER = `# Standards Reader

## What You Are Given

| Input | What it is |
|---|---|
| every таск's per-commit diffs | each commit of every таск, labelled |
| the project's documented standards | the project's own documents |

## What You Are Not Given

| Input | What it is |
|---|---|
| \`spec.md\` | the specification |
| \`manifest.md\` | the numbered requirement list |
| the task files | what each executor was told |
| \`interfaces.md\` | the shared boundaries |
| \`reviews/\` | what each reviewer found |
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
      .replace('| the project\'s documented standards | the project\'s own documents |\n',
        '| the project\'s documented standards | the project\'s own documents |\n'
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
