import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  checkViewerOwnership,
  findMarks,
  openingLines,
  type Violation,
} from './viewer-ownership.ts';

// The fixture is the real bundle's shape with the smallest cast that can carry
// every rule: the resident statement, one phase that opens and one that must
// not, and two briefs. Every case below is that shape with one thing moved.
const SKILL = `# Maestro

## The Dashboard

<!-- maestro:view:owner -->
**The прогон puts exactly one page in front of the user, and it is this one.**
`;

const PREFLIGHT = `# Preflight

<!-- maestro:view:opens-panel -->

Open what the tool printed: http://localhost:8000/dashboard.html
`;

const BUILD = `# Build

Before launching the next wave, check the panel is still there.
`;

const EXECUTOR = `# Executor

<!-- maestro:view:no-viewer -->
You open nothing in front of the user.
`;

const REVIEWER = `# Reviewer

<!-- maestro:view:no-viewer -->
You read; you do not run, and you do not open.
`;

type Overrides = {
  skill?: string;
  preflight?: string;
  build?: string;
  executor?: string;
  reviewer?: string;
};

async function violationsFor(overrides: Overrides = {}): Promise<Violation[]> {
  const bundleDir = await mkdtemp(path.join(tmpdir(), 'viewer-ownership-'));
  try {
    await mkdir(path.join(bundleDir, 'phases'));
    await mkdir(path.join(bundleDir, 'prompts'));
    await writeFile(path.join(bundleDir, 'SKILL.md'), overrides.skill ?? SKILL, 'utf8');
    await writeFile(path.join(bundleDir, 'phases', '0-preflight.md'),
      overrides.preflight ?? PREFLIGHT, 'utf8');
    await writeFile(path.join(bundleDir, 'phases', '5-build.md'),
      overrides.build ?? BUILD, 'utf8');
    await writeFile(path.join(bundleDir, 'prompts', 'executor.md'),
      overrides.executor ?? EXECUTOR, 'utf8');
    await writeFile(path.join(bundleDir, 'prompts', 'reviewer.md'),
      overrides.reviewer ?? REVIEWER, 'utf8');
    return await checkViewerOwnership({ bundleDir });
  } finally {
    await rm(bundleDir, { recursive: true, force: true });
  }
}

const checks = (violations: Violation[]): string[] => violations.map(v => v.check);

test('a bundle that keeps the boundary passes', async () => {
  assert.deepEqual(await violationsFor(), []);
});

test('the resident rule missing from SKILL.md is the first thing reported', async () => {
  const violations = await violationsFor({ skill: '# Maestro\n\n## The Dashboard\n\nRaised in preflight.\n' });
  assert.deepEqual(checks(violations), ['owner']);
  assert.match(violations[0]!.message, /exactly once/);
});

test('the resident rule marked twice is a violation too, because two rules drift', async () => {
  const violations = await violationsFor({
    skill: `${SKILL}\n<!-- maestro:view:owner -->\nAnd again, differently.\n`,
  });
  assert.deepEqual(checks(violations), ['owner']);
});

test('a brief that says nothing about the viewer is named', async () => {
  const violations = await violationsFor({ reviewer: '# Reviewer\n\nYou review one таск.\n' });
  assert.deepEqual(checks(violations), ['prompt']);
  assert.equal(violations[0]!.file, path.join('prompts', 'reviewer.md'));
});

test('a brief claiming preflight\'s exemption reads as permission and fails', async () => {
  const violations = await violationsFor({
    executor: `${EXECUTOR}\n<!-- maestro:view:opens-panel -->\n`,
  });
  assert.deepEqual(checks(violations), ['prompt']);
  assert.match(violations[0]!.message, /belongs to/);
});

test('preflight unmarked leaves the exemption anchored to nothing', async () => {
  const violations = await violationsFor({
    preflight: '# Preflight\n\nOpen http://localhost:8000/dashboard.html\n',
  });
  assert.deepEqual(checks(violations), ['opens']);
  assert.match(violations[0]!.message, /exactly once/);
});

test('another phase claiming the exemption is reported at its line', async () => {
  const violations = await violationsFor({
    build: '# Build\n\n<!-- maestro:view:opens-panel -->\n\nOpen the checks page.\n',
  });
  assert.deepEqual(checks(violations), ['opens']);
  assert.equal(violations[0]!.line, 3);
});

test('a phase that names an address to open is caught without a marker to go by', async () => {
  // The half a marker cannot cover: a phase that starts instructing an open has
  // no reason to declare it, and declaring it is not what makes it wrong.
  const violations = await violationsFor({
    build: '# Build\n\nShow the user http://localhost:8971/tests.html when the wave closes.\n',
  });
  assert.deepEqual(checks(violations), ['opens']);
  assert.equal(violations[0]!.line, 3);
  assert.match(violations[0]!.message, /preflight step 5/);
});

test('preflight naming an address is the job, not a violation', async () => {
  assert.deepEqual(await violationsFor({
    preflight: `${PREFLIGHT}\nStart the preview with preview_start, then navigate to /dashboard.html.\n`,
  }), []);
});

test('every marker is found with its own line and kind', () => {
  const found = findMarks('a\n<!-- maestro:view:owner -->\nb\n<!-- maestro:view:no-viewer -->\n', 'f.md');
  assert.deepEqual(found, [
    { mark: 'owner', file: 'f.md', line: 2 },
    { mark: 'no-viewer', file: 'f.md', line: 4 },
  ]);
});

test('an opening signal is a line number, and prose about panes is not one', () => {
  assert.deepEqual(openingLines('one\nopen http://localhost:9/x\nthree\n'), [2]);
  assert.deepEqual(openingLines('The pane is the panel\'s, and nothing else goes in it.\n'), []);
});
