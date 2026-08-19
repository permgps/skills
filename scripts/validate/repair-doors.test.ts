import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { checkRepairDoors, findOpenings, type Violation } from './repair-doors.ts';

const SPEC = `# Phases

## Repair

| Door | Opened by | State of the таск | What arrives with it |
|---|---|---|---|
| not-done | build | anything other than done | nothing is committed |
| recorded-divergence | build | \`review\` | the \`D##\` |
`;

const REPAIR = `# Phase 8 — Repair

| Door | Arrived from | State of the таск | What is known |
|---|---|---|---|
| not-done | Разработка | not \`done\` | nothing is committed |
| recorded-divergence | Разработка | \`review\` | a \`D##\` |
`;

const BUILD = `# Phase 5 — Build

<!-- maestro:opens:not-done -->
A таск that comes back anything other than done belongs to the repair phase.

<!-- maestro:opens:recorded-divergence -->
A row that says a delivered file disagrees with the build sends its таск back.
`;

type Overrides = { spec?: string; repair?: string; build?: string };

async function violationsFor(overrides: Overrides = {}): Promise<Violation[]> {
  const root = await mkdtemp(path.join(tmpdir(), 'repair-doors-'));
  try {
    const specDir = path.join(root, 'spec');
    const phasesDir = path.join(root, 'bundle', 'phases');
    await mkdir(specDir, { recursive: true });
    await mkdir(phasesDir, { recursive: true });
    await writeFile(path.join(specDir, 'phases.md'), overrides.spec ?? SPEC, 'utf8');
    await writeFile(path.join(phasesDir, '8-repair.md'), overrides.repair ?? REPAIR, 'utf8');
    await writeFile(path.join(phasesDir, '5-build.md'), overrides.build ?? BUILD, 'utf8');
    return await checkRepairDoors({ specDir, bundleDir: path.join(root, 'bundle') });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const checks = (violations: Violation[]): string[] => violations.map(v => v.check);

test('doors declared, listed and opened produce no violations', async () => {
  assert.deepEqual(await violationsFor(), []);
});

// The defect the first end-to-end прогон hit: the build wrote «carried to the
// repair phase» and no door existed to carry it through.
test('a door nobody opens is reported', async () => {
  const violations = await violationsFor({
    build: '# Phase 5 — Build\n\n<!-- maestro:opens:not-done -->\nOnly one of them.\n',
  });
  assert.deepEqual(checks(violations), ['openings']);
  assert.match(violations[0]?.message ?? '', /opened by nobody/);
});

test('a door the repair phase does not list is reported', async () => {
  const violations = await violationsFor({
    repair: REPAIR.replace('| recorded-divergence | Разработка | `review` | a `D##` |\n', ''),
  });
  assert.deepEqual(checks(violations), ['repair']);
  assert.match(violations[0]?.message ?? '', /missing from/);
});

test('a door the repair phase invents is reported', async () => {
  const violations = await violationsFor({
    repair: `${REPAIR}| polish-round | Доводка | \`done\` | a comparison |\n`,
  });
  assert.deepEqual(checks(violations), ['repair']);
  assert.match(violations[0]?.message ?? '', /does not declare/);
});

test('a marker naming no door is reported', async () => {
  const violations = await violationsFor({
    build: `${BUILD}\n<!-- maestro:opens:g4-disagreement -->\n`,
  });
  assert.deepEqual(checks(violations), ['openings']);
  assert.match(violations[0]?.message ?? '', /no door in/);
});

test('a door opened inside the repair phase itself is reported twice over', async () => {
  const violations = await violationsFor({
    build: '# Phase 5 — Build\n\n<!-- maestro:opens:not-done -->\n',
    repair: `${REPAIR}\n<!-- maestro:opens:recorded-divergence -->\n`,
  });
  // Once because repair may not open its own door, and once because that
  // leaves the door with nobody sending through it.
  assert.deepEqual(checks(violations), ['openings', 'openings']);
  assert.match(violations[0]?.message ?? '', /opened by the phase that sends/);
  assert.match(violations[1]?.message ?? '', /opened by nobody/);
});

test('a marker in a phase the specification did not name is reported', async () => {
  const violations = await violationsFor({
    spec: SPEC.replace('| recorded-divergence | build |', '| recorded-divergence | acceptance |'),
  });
  assert.deepEqual(checks(violations), ['openings']);
  assert.match(violations[0]?.message ?? '', /declared as opened by acceptance/);
});

test('a door declared twice is reported once', async () => {
  const violations = await violationsFor({
    spec: `${SPEC}| not-done | build | again | nothing |\n`,
  });
  assert.deepEqual(checks(violations), ['doors']);
  assert.match(violations[0]?.message ?? '', /declared twice/);
});

test('a specification without the door table is reported', async () => {
  const violations = await violationsFor({ spec: '# Phases\n\nNo table here.\n' });
  assert.deepEqual(checks(violations), ['doors']);
});

test('findOpenings reports the door and its line', () => {
  assert.deepEqual(findOpenings('a\n<!--  maestro:opens:not-done  -->\n', '5-build.md'), [
    { door: 'not-done', file: '5-build.md', line: 2 },
  ]);
});
