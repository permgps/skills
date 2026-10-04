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

type Overrides = { spec?: string; independent?: string; acceptance?: string };

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
