import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  checkHostDegradation,
  findMarkers,
  readsAsStop,
  slugify,
  type Violation,
} from './host-degradation.ts';

// The fixture is the real table's shape with two rows: one that degrades and
// one that stops. Every case below is that pair with one thing moved.
const SPEC = `# Hosts

| Capability | What a прогон uses it for | Degrades | Without it |
|---|---|---|---|
| worktree isolation | two таски of one wave at once | yes | waves narrow to one таск |
| context isolation | withholding \`spec.md\` | no | the прогон stops |
`;

const PREFLIGHT = `# Preflight

<!-- maestro:probes:worktree-isolation -->

Try it rather than believe it.
`;

const BUILD = `# Build

<!-- maestro:degrades:worktree-isolation -->

If a worktree does not come up, the wave is one таск wide.
`;

const REFERENCE = `# Resolving The Host

| Missing | Capability | What changes |
|---|---|---|
| worktrees | worktree isolation | every wave is one таск wide |
| a subagent with a context you control | context isolation | **stop.** G2 is a withholding check |
| a page that follows the state | — | the прогон runs and the отчёт is unaffected |
`;

type Overrides = {
  spec?: string;
  preflight?: string;
  build?: string;
  reference?: string;
};

async function violationsFor(overrides: Overrides = {}): Promise<Violation[]> {
  const root = await mkdtemp(path.join(tmpdir(), 'host-degradation-'));
  try {
    const specDir = path.join(root, 'spec');
    const phasesDir = path.join(root, 'bundle', 'phases');
    await mkdir(specDir, { recursive: true });
    await mkdir(phasesDir, { recursive: true });
    await writeFile(path.join(specDir, 'hosts.md'), overrides.spec ?? SPEC, 'utf8');
    await writeFile(path.join(phasesDir, '0-preflight.md'), overrides.preflight ?? PREFLIGHT, 'utf8');
    await writeFile(path.join(phasesDir, '5-build.md'), overrides.build ?? BUILD, 'utf8');
    const referenceDir = path.join(root, 'bundle', 'references');
    await mkdir(referenceDir, { recursive: true });
    await writeFile(path.join(referenceDir, 'hosts.md'), overrides.reference ?? REFERENCE, 'utf8');
    return await checkHostDegradation({ specDir, bundleDir: path.join(root, 'bundle') });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const checks = (violations: Violation[]): string[] => violations.map(v => v.check);

test('a capability probed and applied passes', async () => {
  assert.deepEqual(await violationsFor(), []);
});

test('a degrading capability nobody establishes is reported', async () => {
  const violations = await violationsFor({ preflight: '# Preflight\n\nNothing here.\n' });
  assert.deepEqual(checks(violations), ['probes']);
  assert.match(violations[0]?.message ?? '', /worktree isolation/);
});

// The defect the first end-to-end прогон hit: the rule for a missing worktree
// lived only in the reference the прогон never opened.
test('a degrading capability no phase spends is reported', async () => {
  const violations = await violationsFor({ build: '# Build\n\nRaise the worktrees.\n' });
  assert.deepEqual(checks(violations), ['degradations']);
  assert.match(violations[0]?.message ?? '', /what that costs/);
});

test('a stop condition may not carry a degradation rule', async () => {
  const violations = await violationsFor({
    build: `${BUILD}\n<!-- maestro:degrades:context-isolation -->\n`,
  });
  assert.deepEqual(checks(violations), ['degradations']);
  assert.match(violations[0]?.message ?? '', /stop condition/);
});

test('a marker naming no capability is reported', async () => {
  const violations = await violationsFor({
    build: `${BUILD}\n<!-- maestro:degrades:worktrees -->\n`,
  });
  assert.deepEqual(checks(violations), ['markers']);
  assert.match(violations[0]?.message ?? '', /no capability/);
});

test('a capability is probed in preflight and nowhere else', async () => {
  const violations = await violationsFor({
    build: `${BUILD}\n<!-- maestro:probes:worktree-isolation -->\n`,
  });
  assert.deepEqual(checks(violations), ['markers']);
  assert.match(violations[0]?.message ?? '', /established in 0-preflight\.md/);
});

test('Degrades takes yes or no and says so otherwise', async () => {
  const violations = await violationsFor({
    spec: SPEC.replace('| yes |', '| sometimes |'),
  });
  // The row is skipped once reported, so the missing markers are not also
  // counted: one defect, one finding.
  assert.deepEqual(checks(violations), ['capabilities']);
  assert.match(violations[0]?.message ?? '', /expected yes or no/);
});

test('a table without the Degrades column is reported once', async () => {
  const violations = await violationsFor({
    spec: '# Hosts\n\n| Capability | Without it |\n|---|---|\n| worktrees | narrower |\n',
  });
  assert.deepEqual(checks(violations), ['capabilities']);
});

test('slugify folds a capability name to its marker form', () => {
  assert.equal(slugify('worktree isolation'), 'worktree-isolation');
  assert.equal(slugify('`subagent fan-out`'), 'subagent-fan-out');
  assert.equal(slugify('A Skills Directory'), 'a-skills-directory');
});

test('findMarkers reports kind, slug and line', () => {
  const markers = findMarkers('a\n<!--  maestro:probes:version-control  -->\nb\n', '0-preflight.md');
  assert.deepEqual(markers, [
    { kind: 'probes', slug: 'version-control', file: '0-preflight.md', line: 2 },
  ]);
});

// The reference is what a прогон reads on a host the specification's default
// does not cover, so the two accounts of one cost have to agree.
test('a degrading capability with no cost row in the reference is reported', async () => {
  const violations = await violationsFor({
    reference: REFERENCE.replace(
      '| worktrees | worktree isolation | every wave is one таск wide |\n',
      '',
    ),
  });
  assert.deepEqual(checks(violations), ['reference']);
  assert.match(violations[0]?.message ?? '', /no cost row/);
});

test('a cost row naming no capability is reported', async () => {
  const violations = await violationsFor({
    reference: `${REFERENCE}| worktrees again | worktrees | narrower |\n`,
  });
  assert.deepEqual(checks(violations), ['reference']);
  assert.match(violations[0]?.message ?? '', /no capability/);
});

test('a capability with two cost rows is reported once', async () => {
  const violations = await violationsFor({
    reference: `${REFERENCE}| isolated trees | worktree isolation | narrower |\n`,
  });
  assert.deepEqual(checks(violations), ['reference']);
  assert.match(violations[0]?.message ?? '', /already has a cost row/);
});

test('a stop condition whose cost row does not stop is reported', async () => {
  const violations = await violationsFor({
    reference: REFERENCE.replace('**stop.** G2 is a withholding check', 'the readers run anyway'),
  });
  assert.deepEqual(checks(violations), ['reference']);
  assert.match(violations[0]?.message ?? '', /does not say so/);
});

test('a degrading capability whose cost row stops the прогон is reported', async () => {
  const violations = await violationsFor({
    reference: REFERENCE.replace('every wave is one таск wide', '**stop.** nothing to build in'),
  });
  assert.deepEqual(checks(violations), ['reference']);
  assert.match(violations[0]?.message ?? '', /this row stops/);
});

test('a reference without the cost table is reported', async () => {
  const violations = await violationsFor({ reference: '# Resolving The Host\n\nNothing here.\n' });
  assert.deepEqual(checks(violations), ['reference']);
});

test('readsAsStop reads the word only where the cell declares it', () => {
  assert.equal(readsAsStop('**stop.** There is nowhere to build'), true);
  assert.equal(readsAsStop('stop. G2 is a withholding check'), true);
  assert.equal(readsAsStop('every wave is one таск wide'), false);
  // The dashboard row ends this way; it is advice about wording, not a stop.
  assert.equal(readsAsStop('the прогон runs, and stop promising a live one'), false);
});
