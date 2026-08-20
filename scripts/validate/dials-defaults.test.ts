import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  checkDialsDefaults,
  findDeclarations,
  readValues,
  DIALS,
  type DialSpec,
  type Violation,
} from './dials-defaults.ts';

const MODE: DialSpec = { dial: 'mode', column: 'Mode', witness: 'Human gates' };
const REGISTER: DialSpec = { dial: 'explain', column: 'Register', witness: 'What changes' };
const LANGUAGE: DialSpec =
  { dial: 'language', column: 'Language', witness: 'What changes', derived: true };

// The fixtures are the three real files reduced to what this checker reads: a
// table per dial, and the sentence naming the value that applies by default.
const SPEC = `# Dials

| Mode | Default | Human gates |
|---|---|---|
| \`full\` | | none |
| \`semi\` | yes | questions, only on genuine forks |
`;

const PHASE = `# Phase 0a — Dials

Built-in default for \`mode\`: \`semi\`. A project may pin its own.

| Mode | Human gates |
|---|---|
| \`full\` | none |
| \`semi\` | questions, only on genuine forks |
`;

const SKILL = `# Maestro

**Mode** — how much is asked of the user. Built-in default for \`mode\`: \`semi\`;
a project pins its own in \`.maestro/config.json\`.

| Mode | Human gates |
|---|---|
| \`full\` | none |
| \`semi\` | questions, only on genuine forks |
`;

// The same three files once a second dial lives in them.
const TWO_DIAL_SPEC = `${SPEC}
| Register | Default | What changes |
|---|---|---|
| \`plain\` | | every sentence is written for a beginner |
| \`normal\` | yes | the vocabulary's terms are used as they stand |
`;

const twoDials = (markdown: string, defaultLine: string): string => `${markdown}
${defaultLine}

| Register | What changes |
|---|---|
| \`plain\` | every sentence is written for a beginner |
| \`normal\` | the vocabulary's terms are used as they stand |
`;

const TWO_DIAL_PHASE = twoDials(PHASE, 'Built-in default for `explain`: `normal`.');
const TWO_DIAL_SKILL = twoDials(SKILL, 'Built-in default for `explain`: `normal`.');

type Overrides = { spec?: string; phase?: string; skill?: string; dials?: readonly DialSpec[] };

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
    // The fixtures carry one dial unless a test says otherwise. The shipped
    // `DIALS` list is asserted on its own below, and held to the real files by
    // `npm run dials`.
    return await checkDialsDefaults({
      specDir,
      bundleDir,
      dials: overrides.dials ?? [MODE],
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const bothDials = (extra: Overrides = {}): Overrides => ({
  spec: TWO_DIAL_SPEC,
  phase: TWO_DIAL_PHASE,
  skill: TWO_DIAL_SKILL,
  dials: [MODE, REGISTER],
  ...extra,
});

const checks = (violations: Violation[]): string[] => violations.map(v => v.check);

test('three files that agree pass', async () => {
  assert.deepEqual(await violationsFor(), []);
});

// The defect this checker exists for: one file learns a new default and the
// other two keep promising the old one.
test('a bundle file declaring a different default is reported', async () => {
  const violations = await violationsFor({
    phase: PHASE.replace('for `mode`: `semi`.', 'for `mode`: `full`.'),
  });
  assert.deepEqual(checks(violations), ['default']);
  assert.match(violations[0]?.message ?? '', /"full".*says "semi"/);
});

test('a mode the specification defines and the bundle omits is reported', async () => {
  const violations = await violationsFor({
    phase: PHASE.replace('| `full` | none |\n', ''),
  });
  assert.deepEqual(checks(violations), ['mode']);
  assert.match(violations[0]?.message ?? '', /"full" is defined in .*dials\.md and missing here/);
});

test('a mode the bundle invents is reported', async () => {
  const violations = await violationsFor({
    skill: SKILL.replace('| `semi` |', '| `guided` |'),
  });
  // One mode vanished and one appeared: both halves are named, because a
  // rename and an omission are different repairs.
  assert.deepEqual(checks(violations), ['mode', 'mode']);
  assert.match(violations[1]?.message ?? '', /"guided" is named here/);
});

test('a bundle file that declares no default at all is reported', async () => {
  const violations = await violationsFor({
    skill: SKILL.replace('Built-in default for `mode`: `semi`;\na project\npins', 'A project pins')
      .replace('Built-in default for `mode`: `semi`;', 'It is'),
  });
  assert.deepEqual(checks(violations), ['default']);
  assert.match(violations[0]?.message ?? '', /no built-in default declared for "mode"/);
});

// Two declarations of the same dial in one file is the drift this checker
// prevents, arriving inside a single file rather than between two.
test('a file declaring one dial default twice is reported', async () => {
  const violations = await violationsFor({
    phase: `${PHASE}\nA reminder: built-in default for \`mode\`: \`semi\`.\n`,
  });
  assert.deepEqual(checks(violations), ['default']);
  assert.match(violations[0]?.message ?? '', /for "mode" is declared twice/);
});

// The reason the sentence names its dial. Under the old phrasing the second of
// these read as the first one repeated, and the file could not carry both.
test('two dials each declaring a default once pass', async () => {
  assert.deepEqual(await violationsFor(bothDials()), []);
});

test('a second dial declared twice is reported, and the first is not', async () => {
  const violations = await violationsFor(bothDials({
    phase: `${TWO_DIAL_PHASE}\nAgain: built-in default for \`explain\`: \`normal\`.\n`,
  }));
  assert.deepEqual(checks(violations), ['default']);
  assert.match(violations[0]?.message ?? '', /for "explain" is declared twice/);
});

test('a second dial declaring a value the specification does not mark is reported', async () => {
  const violations = await violationsFor(bothDials({
    skill: TWO_DIAL_SKILL.replace('for `explain`: `normal`.', 'for `explain`: `plain`.'),
  }));
  assert.deepEqual(checks(violations), ['default']);
  assert.match(violations[0]?.message ?? '', /"plain" as the built-in default for "explain".*says "normal"/);
});

test('a declaration for a dial the specification does not define is reported', async () => {
  const violations = await violationsFor({
    phase: `${PHASE}\nBuilt-in default for \`tempo\`: \`fast\`.\n`,
  });
  assert.deepEqual(checks(violations), ['default']);
  assert.match(violations[0]?.message ?? '', /"tempo", which .*dials\.md defines no dial for/);
});

test('a specification with no mode marked Default is reported', async () => {
  const violations = await violationsFor({ spec: SPEC.replace('| yes |', '| |') });
  assert.deepEqual(checks(violations), ['mode']);
  assert.match(violations[0]?.message ?? '', /no Mode is marked Default/);
});

test('a specification marking two defaults is reported', async () => {
  const violations = await violationsFor({
    spec: SPEC.replace('| `full` | | none |', '| `full` | yes | none |'),
  });
  assert.equal(checks(violations)[0], 'mode');
  assert.match(violations[0]?.message ?? '', /second Mode marked Default/);
});

test('a specification with no modes table stops the check there', async () => {
  const violations = await violationsFor({ spec: '# Dials\n\nNo table here.\n' });
  assert.deepEqual(checks(violations), ['mode']);
  assert.match(violations[0]?.message ?? '', /no table with columns Mode, Human gates, Default/);
});

test('a bundle file with no modes table is reported without hiding its default', async () => {
  const violations = await violationsFor({
    phase: '# Dials\n\nBuilt-in default for `mode`: `full`.\n',
  });
  // Two separate facts: the table is gone, and the default disagrees.
  assert.deepEqual(checks(violations), ['mode', 'default']);
});

test('values are read in source order', () => {
  assert.deepEqual(readValues(PHASE, MODE), ['full', 'semi']);
  assert.deepEqual(readValues(TWO_DIAL_PHASE, REGISTER), ['plain', 'normal']);
});

test('a document with no table for that dial reads as null, not as an empty list', () => {
  // Empty would mean "names no values", which is a finding. Null means "has no
  // table", which is a different one.
  assert.equal(readValues('# Dials\n\nNothing.\n', MODE), null);
  assert.equal(readValues(PHASE, REGISTER), null);
});

test('a declaration is found with or without its colon, and carries its dial', () => {
  assert.deepEqual(findDeclarations('Built-in default for `mode`: `semi`.'),
    [{ dial: 'mode', value: 'semi', line: 1 }]);
  assert.deepEqual(findDeclarations('Built-in default for `mode` `full`;'),
    [{ dial: 'mode', value: 'full', line: 1 }]);
});

test('a declaration is found regardless of case, and carries its line', () => {
  assert.deepEqual(findDeclarations('one\ntwo\nbuilt-in DEFAULT for `mode` `manual`'),
    [{ dial: 'mode', value: 'manual', line: 3 }]);
});

test('prose about the built-in default without a dial declares nothing', () => {
  assert.deepEqual(findDeclarations('| 3 | the built-in default | the Modes table above |'), []);
  assert.deepEqual(findDeclarations('Built-in default `semi`.'), []);
});

test('the shipped dial list is what the real files are held to', () => {
  assert.deepEqual(DIALS.map(dial => dial.dial), ['mode', 'explain', 'language']);
});

// These files are prose wrapped at eighty columns. A reflow that moved a word
// onto the next line used to delete the declaration without a word said.
test('a declaration wrapped across a line break is still found', () => {
  assert.deepEqual(findDeclarations('Built-in default\nfor `explain`: `normal`.'),
    [{ dial: 'explain', value: 'normal', line: 1 }]);
  assert.deepEqual(findDeclarations('x\nBuilt-in default for `explain`:\n`normal`;'),
    [{ dial: 'explain', value: 'normal', line: 2 }]);
});


// --- a dial with no built-in default -------------------------------------
//
// The language is derived rather than chosen: it is read off the бриф, which
// exists by the time the dials resolve. Its table therefore carries no
// `Default` column and no file declares one — but the three homes still have to
// name the same two values, which is the half of this check it keeps.

const LANGUAGE_TABLE = `
| Language | What changes |
|---|---|
| \`ru\` | every sentence the user reads is Russian |
| \`en\` | the same sentences in English |
`;

const derived = (extra: Overrides = {}): Overrides => ({
  spec: SPEC + LANGUAGE_TABLE,
  phase: PHASE + LANGUAGE_TABLE,
  skill: SKILL + LANGUAGE_TABLE,
  dials: [MODE, LANGUAGE],
  ...extra,
});

test('a derived dial passes with no Default column and no declaration anywhere', async () => {
  assert.deepEqual(await violationsFor(derived()), []);
});

test('a derived dial the bundle disagrees with is reported in both directions', async () => {
  const violations = await violationsFor(derived({
    phase: PHASE + LANGUAGE_TABLE.replace('| `en` |', '| `de` |'),
  }));
  assert.deepEqual(checks(violations), ['language', 'language']);
  assert.match(violations[0]?.message ?? '', /"en" is defined in .*dials\.md and missing here/);
  assert.match(violations[1]?.message ?? '', /"de" is named here and defined nowhere/);
});

test('a value outside the derived dial\'s set is reported where it was invented', async () => {
  const violations = await violationsFor(derived({
    skill: SKILL + LANGUAGE_TABLE + '| `fr` | the same sentences in French |\n',
  }));
  assert.deepEqual(checks(violations), ['language']);
  assert.match(violations[0]?.message ?? '', /"fr" is named here and defined nowhere/);
});

// A derived dial that grew a built-in default has stopped reading what it
// derives from, and the two would then disagree silently: the бриф says one
// thing and the declaration another.
test('a built-in default declared for a derived dial is itself the finding', async () => {
  const violations = await violationsFor(derived({
    phase: PHASE + LANGUAGE_TABLE + '\nBuilt-in default for `language`: `ru`.\n',
  }));
  assert.deepEqual(checks(violations), ['default']);
  assert.match(violations[0]?.message ?? '', /derives\s+rather than defaults/);
});

test('the two chosen dials are unaffected by the derived one beside them', async () => {
  const violations = await violationsFor({
    spec: TWO_DIAL_SPEC + LANGUAGE_TABLE,
    phase: TWO_DIAL_PHASE + LANGUAGE_TABLE,
    skill: TWO_DIAL_SKILL + LANGUAGE_TABLE,
    dials: [MODE, REGISTER, LANGUAGE],
  });
  assert.deepEqual(violations, []);
});
