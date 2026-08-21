import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  bundleProfileFor,
  checkBundle,
  findRelativeLinks,
  parseFrontmatter,
  type Violation,
} from './bundle-integrity.ts';

const FRONTMATTER = `---
name: maestro
description: Turn a dictated idea into a finished project.
argument-hint: "[full|semi] <what you want built>"
---
`;

const BASELINE: Record<string, string> = {
  'SKILL.md': `${FRONTMATTER}
# Maestro

| # | Phase | Rules |
|---|---|---|
| 0 | Preflight | [phases/0-preflight.md](phases/0-preflight.md) |
| 1 | Manifest | [phases/1-manifest.md](phases/1-manifest.md) |
`,
  'phases/0-preflight.md': `# Preflight

Create the run state. See [the state contract](../references/state.md).
`,
  'phases/1-manifest.md': `# Manifest

Number the requirements.
`,
  'references/state.md': `# State

Fields.
`,
};

/** `null` removes a baseline file; a string replaces or adds one. */
type Overrides = Record<string, string | null>;

async function makeBundle(overrides: Overrides = {}): Promise<{ dir: string; bundle: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), 'bundle-integrity-'));
  // The bundle lives in a directory named after the skill, because one of the
  // checks is that the frontmatter name and the directory agree.
  const bundle = path.join(dir, 'maestro');
  const files: Overrides = { ...BASELINE, ...overrides };

  for (const [name, body] of Object.entries(files)) {
    if (body === null) continue;
    const target = path.join(bundle, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body, 'utf8');
  }
  await mkdir(bundle, { recursive: true });
  return { dir, bundle };
}

async function violationsFor(overrides: Overrides): Promise<Violation[]> {
  const { dir, bundle } = await makeBundle(overrides);
  try {
    return await checkBundle(bundle);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('parseFrontmatter reads scalars and strips quotes', () => {
  const { keys, endLine } = parseFrontmatter(FRONTMATTER);
  assert.equal(keys.get('name'), 'maestro');
  assert.equal(keys.get('argument-hint'), '[full|semi] <what you want built>');
  assert.equal(endLine, 5);
});

test('parseFrontmatter reports an unclosed block as absent', () => {
  const { keys, endLine } = parseFrontmatter('---\nname: maestro\n\n# Body\n');
  assert.equal(endLine, 0);
  assert.equal(keys.size, 0);
});

test('parseFrontmatter reports a document without frontmatter as absent', () => {
  assert.equal(parseFrontmatter('# Maestro\n\nNo frontmatter here.\n').endLine, 0);
});

test('findRelativeLinks ignores absolute urls, mail links and bare anchors', () => {
  const links = findRelativeLinks(
    '[a](phases/0-preflight.md) [b](https://example.com) [c](mailto:x@y.z) [d](#section)\n',
  );
  assert.deepEqual(links, [{ target: 'phases/0-preflight.md', line: 1 }]);
});

test('findRelativeLinks strips a trailing anchor from a file target', () => {
  assert.deepEqual(
    findRelativeLinks('[a](phases/1-manifest.md#gates)\n'),
    [{ target: 'phases/1-manifest.md', line: 1 }],
  );
});

test('a consistent bundle produces no violations', async () => {
  assert.deepEqual(await violationsFor({}), []);
});

test('a bundle with no SKILL.md is reported', async () => {
  const violations = await violationsFor({ 'SKILL.md': null });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'entry');
});

test('a missing frontmatter key is reported', async () => {
  const violations = await violationsFor({
    'SKILL.md': `---\nname: maestro\ndescription: x\n---\n\n# Maestro\n`,
    'phases/0-preflight.md': null,
    'phases/1-manifest.md': null,
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'frontmatter');
  assert.match(violations[0]?.message ?? '', /missing "argument-hint"/);
});

test('an empty frontmatter value is reported', async () => {
  const violations = await violationsFor({
    'SKILL.md': `---\nname: maestro\ndescription:\nargument-hint: x\n---\n\n# Maestro\n`,
    'phases/0-preflight.md': null,
    'phases/1-manifest.md': null,
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0]?.message ?? '', /"description" is empty/);
});

test('a bundle with no frontmatter at all is reported once', async () => {
  const violations = await violationsFor({
    'SKILL.md': `# Maestro\n`,
    'phases/0-preflight.md': null,
    'phases/1-manifest.md': null,
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0]?.message ?? '', /no closed --- frontmatter/);
});

test('a name that disagrees with the directory is reported', async () => {
  const violations = await violationsFor({
    'SKILL.md': `---\nname: conductor\ndescription: x\nargument-hint: y\n---\n\n# Maestro\n`,
    'phases/0-preflight.md': null,
    'phases/1-manifest.md': null,
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0]?.message ?? '', /does not match directory "maestro"/);
});

test('a link that resolves to nothing is reported', async () => {
  const violations = await violationsFor({
    'phases/1-manifest.md': `# Manifest\n\nSee [the vocabulary](../references/vocabulary.md).\n`,
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'links');
  assert.equal(violations[0]?.file, 'phases/1-manifest.md');
  assert.match(violations[0]?.message ?? '', /resolves to nothing/);
});

test('a link that escapes the bundle is reported', async () => {
  const violations = await violationsFor({
    'phases/1-manifest.md': `# Manifest\n\nSee [outside](../../elsewhere.md).\n`,
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'links');
  assert.match(violations[0]?.message ?? '', /escapes the bundle/);
});

test('a phase file linking to another phase file is reported', async () => {
  const violations = await violationsFor({
    'phases/1-manifest.md': `# Manifest\n\nAs in [preflight](0-preflight.md).\n`,
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'cross-phase');
  assert.match(violations[0]?.message ?? '', /hoist the shared rule/);
});

test('a phase file linked from SKILL.md is not itself a cross-phase link', async () => {
  // SKILL.md is allowed — and required — to reach every phase.
  assert.deepEqual(await violationsFor({}), []);
});

test('a phase file nobody links to is reported', async () => {
  const violations = await violationsFor({
    'phases/2-briefing.md': `# Briefing\n\nAsk the genuine forks.\n`,
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'reachability');
  assert.equal(violations[0]?.file, 'phases/2-briefing.md');
});

test('a bundle with no phases directory is valid', async () => {
  const violations = await violationsFor({
    'SKILL.md': `${FRONTMATTER}\n# Maestro\n\nNo phases yet.\n`,
    'phases/0-preflight.md': null,
    'phases/1-manifest.md': null,
    'references/state.md': null,
  });
  assert.deepEqual(violations, []);
});

test('every violation in one bundle is reported, not just the first', async () => {
  const violations = await violationsFor({
    'phases/1-manifest.md': `# Manifest\n\n[gone](../references/gone.md) and [preflight](0-preflight.md).\n`,
    'phases/2-briefing.md': `# Briefing\n\nOrphan.\n`,
  });
  assert.deepEqual(
    violations.map(v => v.check).sort(),
    ['cross-phase', 'links', 'reachability'],
  );
});

// --- prompts: subagent briefs, reachable from the phase that hands them over --

test('a prompt linked from a phase file is valid', async () => {
  const violations = await violationsFor({
    'phases/1-manifest.md': `# Manifest\n\nHand over [the reader](../prompts/reader.md).\n`,
    'prompts/reader.md': `# Reader\n\nYou have the brief and nothing else.\n`,
  });
  assert.deepEqual(violations, []);
});

test('a prompt nobody links to is reported', async () => {
  const violations = await violationsFor({
    'prompts/reader.md': `# Reader\n\nOrphan.\n`,
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'reachability');
  assert.equal(violations[0]?.file, 'prompts/reader.md');
  assert.match(violations[0]?.message ?? '', /not linked from anywhere/);
});

test('a prompt may be reached from SKILL.md as well as from a phase', async () => {
  const violations = await violationsFor({
    'SKILL.md': `${FRONTMATTER}\n# Maestro\n\n[reader](prompts/reader.md)\n`,
    'phases/0-preflight.md': null,
    'phases/1-manifest.md': null,
    'references/state.md': null,
    'prompts/reader.md': `# Reader\n\nBrief.\n`,
  });
  assert.deepEqual(violations, []);
});

test('a dead link inside a prompt is reported — prompts are checked, not trusted', async () => {
  const violations = await violationsFor({
    'phases/1-manifest.md': `# Manifest\n\nHand over [the reader](../prompts/reader.md).\n`,
    'prompts/reader.md': `# Reader\n\nSee [gone](../references/gone.md).\n`,
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'links');
  assert.equal(violations[0]?.file, 'prompts/reader.md');
});

test('a prompt linking into phases/ is reported with its own reason', async () => {
  const violations = await violationsFor({
    'phases/1-manifest.md': `# Manifest\n\nHand over [the reader](../prompts/reader.md).\n`,
    'prompts/reader.md': `# Reader\n\nFirst read [manifest](../phases/1-manifest.md).\n`,
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'cross-phase');
  assert.equal(violations[0]?.file, 'prompts/reader.md');
  assert.match(violations[0]?.message ?? '', /stops being an independent brief/);
});

test('a prompt escaping the bundle is reported', async () => {
  const violations = await violationsFor({
    'phases/1-manifest.md': `# Manifest\n\nHand over [the reader](../prompts/reader.md).\n`,
    'prompts/reader.md': `# Reader\n\nSee [outside](../../secrets.md).\n`,
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'links');
  assert.match(violations[0]?.message ?? '', /escapes the bundle/);
});

test('a bundle with no prompts directory is valid', async () => {
  assert.deepEqual(await violationsFor({}), []);
});

// --- the second bundle, and what the widening costs -------------------------

const SCOUT_FRONTMATTER = `---
name: scout
description: Reconnaissance before a brief becomes a project.
argument-hint: "<what you want built, however incomplete>"
---
`;

const SCOUT_BASELINE: Record<string, string> = {
  'SKILL.md': `${SCOUT_FRONTMATTER}
# Scout

| # | Step | Rules |
|---|---|---|
| 1 | Ground | [steps/1-ground.md](steps/1-ground.md) |
| 2 | Search | [steps/2-search.md](steps/2-search.md) |
`,
  'steps/1-ground.md': `# Ground

Read what the user gave you. Then read the search step file.
`,
  'steps/2-search.md': `# Search

Two sweeps.
`,
};

async function scoutViolationsFor(overrides: Overrides = {}): Promise<Violation[]> {
  const dir = await mkdtemp(path.join(tmpdir(), 'bundle-integrity-scout-'));
  const bundle = path.join(dir, 'scout');
  const files: Overrides = { ...SCOUT_BASELINE, ...overrides };
  for (const [name, body] of Object.entries(files)) {
    if (body === null) continue;
    const target = path.join(bundle, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body, 'utf8');
  }
  await mkdir(bundle, { recursive: true });
  try {
    return await checkBundle(bundle, bundleProfileFor(bundle));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('a bundle whose steps live in steps/ passes under its own profile', async () => {
  assert.deepEqual(await scoutViolationsFor(), []);
});

test('a step file not linked from SKILL.md is reported, and named as a step', async () => {
  const violations = await scoutViolationsFor({ 'steps/3-grill.md': '# Grill\n\nAsk.\n' });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'reachability');
  assert.match(violations[0]?.message ?? '', /^steps file is not linked/);
});

test('a step file linking to another step file is reported', async () => {
  const violations = await scoutViolationsFor({
    'steps/1-ground.md': '# Ground\n\nThen [search](2-search.md).\n',
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'cross-phase');
  assert.match(violations[0]?.message ?? '', /^steps file links to/);
});

test('markdown in a directory no profile accounts for is reported, not ignored', async () => {
  // This is the failure mode the widening exists to convert from silence into an
  // error: before profiles, a bundle whose step directory had another name was
  // checked as though it had no steps at all, and the run said OK.
  const violations = await scoutViolationsFor({ 'notes/anything.md': '# Notes\n' });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'directories');
  assert.match(violations[0]?.message ?? '', /does not account for it/);
});

test('the maestro profile still accepts references/, which scout does not have', async () => {
  assert.deepEqual(await violationsFor({}), []);
  const violations = await scoutViolationsFor({ 'references/anything.md': '# Ref\n' });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'directories');
});

test('bundleProfileFor picks the profile from the bundle directory name', () => {
  assert.equal(bundleProfileFor('skills/scout').steps, 'steps');
  assert.equal(bundleProfileFor('skills/maestro').steps, 'phases');
  assert.equal(bundleProfileFor('/tmp/whatever').steps, 'phases');
});
