import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  checkDialsDefaults,
  findDeclarations,
  readModes,
  type Violation,
} from './dials-defaults.ts';

// The fixtures are the three real files reduced to what this checker reads:
// the modes table, and the sentence naming the one that applies by default.
const SPEC = `# Dials

| Mode | Default | Human gates |
|---|---|---|
| \`full\` | | none |
| \`semi\` | yes | questions, only on genuine forks |
`;

const PHASE = `# Phase 0a — Dials

Built-in default: \`semi\`. A project may pin its own.

| Mode | Human gates |
|---|---|
| \`full\` | none |
| \`semi\` | questions, only on genuine forks |
`;

const SKILL = `# Maestro

**Mode** — how much is asked of the user. Built-in default \`semi\`; a project
pins its own in \`.maestro/config.json\`.

| Mode | Human gates |
|---|---|
| \`full\` | none |
| \`semi\` | questions, only on genuine forks |
`;

type Overrides = { spec?: string; phase?: string; skill?: string };

async function violationsFor(overrides: Overrides = {}): Promise<Violation[]> {
  const root = await mkdtemp(path.join(tmpdir(), 'dials-defaults-'));
  try {
    const specDir = path.join(root, 'spec');
    const bundleDir = path.join(root, 'bundle');
    await mkdir(specDir, { recursive: true });
    await mkdir(path.join(bundleDir, 'phases'), { recursive: true });
    await writeFile(path.join(specDir, 'dials.md'), overrides.spec ?? SPEC, 'utf8');
    await writeFile(path.join(bundleDir, 'phases', '0-dials.md'), overrides.phase ?? PHASE, 'utf8');
    await writeFile(path.join(bundleDir, 'SKILL.md'), overrides.skill ?? SKILL, 'utf8');
    return await checkDialsDefaults({ specDir, bundleDir });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const checks = (violations: Violation[]): string[] => violations.map(v => v.check);

test('three files that agree pass', async () => {
  assert.deepEqual(await violationsFor(), []);
});

// The defect this checker exists for: one file learns a new default and the
// other two keep promising the old one.
test('a bundle file declaring a different default is reported', async () => {
  const violations = await violationsFor({
    phase: PHASE.replace('Built-in default: `semi`.', 'Built-in default: `full`.'),
  });
  assert.deepEqual(checks(violations), ['default']);
  assert.match(violations[0]?.message ?? '', /"full".*says "semi"/);
});

test('a mode the specification defines and the bundle omits is reported', async () => {
  const violations = await violationsFor({
    phase: PHASE.replace('| `full` | none |\n', ''),
  });
  assert.deepEqual(checks(violations), ['modes']);
  assert.match(violations[0]?.message ?? '', /"full" is defined in .*dials\.md and missing here/);
});

test('a mode the bundle invents is reported', async () => {
  const violations = await violationsFor({
    skill: SKILL.replace('| `semi` |', '| `guided` |'),
  });
  // One mode vanished and one appeared: both halves are named, because a
  // rename and an omission are different repairs.
  assert.deepEqual(checks(violations), ['modes', 'modes']);
  assert.match(violations[1]?.message ?? '', /"guided" is named here/);
});

test('a bundle file that declares no default at all is reported', async () => {
  const violations = await violationsFor({
    skill: SKILL.replace('Built-in default `semi`; a project\npins', 'A project pins'),
  });
  assert.deepEqual(checks(violations), ['default']);
  assert.match(violations[0]?.message ?? '', /no built-in default declared/);
});

// Two declarations in one file is the drift this checker prevents, arriving
// inside a single file rather than between two.
test('a file declaring the default twice is reported', async () => {
  const violations = await violationsFor({
    phase: `${PHASE}\nA reminder: built-in default \`semi\`.\n`,
  });
  assert.deepEqual(checks(violations), ['default']);
  assert.match(violations[0]?.message ?? '', /declared twice/);
});

test('a specification with no mode marked Default is reported', async () => {
  const violations = await violationsFor({ spec: SPEC.replace('| yes |', '| |') });
  assert.deepEqual(checks(violations), ['default']);
  assert.match(violations[0]?.message ?? '', /no mode is marked Default/);
});

test('a specification marking two defaults is reported', async () => {
  const violations = await violationsFor({
    spec: SPEC.replace('| `full` | | none |', '| `full` | yes | none |'),
  });
  assert.equal(checks(violations)[0], 'default');
  assert.match(violations[0]?.message ?? '', /second mode marked Default/);
});

test('a specification with no modes table stops the check there', async () => {
  const violations = await violationsFor({ spec: '# Dials\n\nNo table here.\n' });
  assert.deepEqual(checks(violations), ['modes']);
  assert.match(violations[0]?.message ?? '', /no table with columns Mode, Human gates, Default/);
});

test('a bundle file with no modes table is reported without hiding its default', async () => {
  const violations = await violationsFor({ phase: '# Dials\n\nBuilt-in default: `full`.\n' });
  // Two separate facts: the table is gone, and the default disagrees.
  assert.deepEqual(checks(violations), ['modes', 'default']);
});

test('modes are read in source order', () => {
  assert.deepEqual(readModes(PHASE), ['full', 'semi']);
});

test('a document with no modes table reads as null, not as an empty list', () => {
  // Empty would mean "names no modes", which is a finding. Null means "has no
  // table", which is a different one.
  assert.equal(readModes('# Dials\n\nNothing.\n'), null);
});

test('a declaration is found with or without its colon', () => {
  assert.deepEqual(findDeclarations('Built-in default: `semi`.'), [{ mode: 'semi', line: 1 }]);
  assert.deepEqual(findDeclarations('Built-in default `full`;'), [{ mode: 'full', line: 1 }]);
});

test('a declaration is found regardless of case, and carries its line', () => {
  assert.deepEqual(findDeclarations('one\ntwo\nbuilt-in DEFAULT `manual`'),
    [{ mode: 'manual', line: 3 }]);
});

test('prose about the built-in default without a value declares nothing', () => {
  assert.deepEqual(findDeclarations('| 3 | the built-in default | the Modes table above |'), []);
});
