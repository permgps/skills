import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BRIEFING_ANCHORS,
  CUT_ANCHORS,
  DIAGNOSIS_ANCHORS,
  REPORT_ANCHORS,
  REVIEW_ANCHORS,
  SIGNAL_ANCHORS,
  STOP_ANCHORS,
  textAfterHandoff,
  bundleProfileFor,
  carriesLeafRule,
  checkBundle,
  checkProcedure,
  COMPLETION_PROCEDURES,
  LEAF_RULE,
  MAESTRO_BUNDLE,
  MEMORY_ANCHORS,
  procedureSection,
  findRelativeLinks,
  TESTING_ANCHORS,
  parseFrontmatter,
  type BundleProfile,
  type Violation,
} from './bundle-integrity.ts';
import { checkAnswers, parseAnswers } from '../gates/answers.ts';
import { checkExecutionReturns, parseExecutionReturns } from '../gates/execution-return.ts';

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

/**
 * The Maestro layout without the shipped bundle's resident budget and invocation
 * policy. A fixture is a few lines long, so an exact line ceiling would refuse
 * every one of them; those two rules are tested on a copy of the real bundle.
 */
const LAYOUT_ONLY: BundleProfile = {
  name: MAESTRO_BUNDLE.name,
  steps: MAESTRO_BUNDLE.steps,
  prompts: MAESTRO_BUNDLE.prompts,
  other: MAESTRO_BUNDLE.other,
};

async function violationsFor(overrides: Overrides): Promise<Violation[]> {
  const { dir, bundle } = await makeBundle(overrides);
  try {
    return await checkBundle(bundle, LAYOUT_ONLY);
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

/** A prompt body that also keeps its субагент a leaf, so a test sees only its own finding. */
const brief = (body: string): string => `${body}\n- ${LEAF_RULE}\n`;

test('a prompt linked from a phase file is valid', async () => {
  const violations = await violationsFor({
    'phases/1-manifest.md': `# Manifest\n\nHand over [the reader](../prompts/reader.md).\n`,
    'prompts/reader.md': brief(`# Reader\n\nYou have the brief and nothing else.\n`),
  });
  assert.deepEqual(violations, []);
});

test('a prompt nobody links to is reported', async () => {
  const violations = await violationsFor({
    'prompts/reader.md': brief(`# Reader\n\nOrphan.\n`),
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
    'prompts/reader.md': brief(`# Reader\n\nBrief.\n`),
  });
  assert.deepEqual(violations, []);
});

test('a dead link inside a prompt is reported — prompts are checked, not trusted', async () => {
  const violations = await violationsFor({
    'phases/1-manifest.md': `# Manifest\n\nHand over [the reader](../prompts/reader.md).\n`,
    'prompts/reader.md': brief(`# Reader\n\nSee [gone](../references/gone.md).\n`),
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'links');
  assert.equal(violations[0]?.file, 'prompts/reader.md');
});

test('a prompt linking into phases/ is reported with its own reason', async () => {
  const violations = await violationsFor({
    'phases/1-manifest.md': `# Manifest\n\nHand over [the reader](../prompts/reader.md).\n`,
    'prompts/reader.md': brief(`# Reader\n\nFirst read [manifest](../phases/1-manifest.md).\n`),
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'cross-phase');
  assert.equal(violations[0]?.file, 'prompts/reader.md');
  assert.match(violations[0]?.message ?? '', /stops being an independent brief/);
});

test('a prompt escaping the bundle is reported', async () => {
  const violations = await violationsFor({
    'phases/1-manifest.md': `# Manifest\n\nHand over [the reader](../prompts/reader.md).\n`,
    'prompts/reader.md': brief(`# Reader\n\nSee [outside](../../secrets.md).\n`),
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'links');
  assert.match(violations[0]?.message ?? '', /escapes the bundle/);
});

test('a bundle with no prompts directory is valid', async () => {
  assert.deepEqual(await violationsFor({}), []);
});

// --- prompts: every brief keeps its субагент a leaf -------------------------

test('a brief without the leaf rule is reported, and only that brief', async () => {
  const violations = await violationsFor({
    'phases/1-manifest.md': `# Manifest\n\n[reader](../prompts/reader.md) and [other](../prompts/other.md).\n`,
    'prompts/reader.md': brief(`# Reader\n\nBrief.\n`),
    'prompts/other.md': `# Other\n\nBrief.\n`,
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.check, 'leaf');
  assert.equal(violations[0]?.file, path.join('prompts', 'other.md'));
  assert.match(violations[0]?.message ?? '', /nested прогон/);
});

test('the leaf rule is still found when a paragraph wraps it across lines', () => {
  assert.equal(carriesLeafRule('- Invoke no skill and dispatch no agent;\n  do the work in this context.\n'), true);
  assert.equal(carriesLeafRule('Invoke no skill; do the work in this context.'), false);
});

test('every shipped brief keeps its субагент a leaf, and the executor losing the sentence is the one finding', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'bundle-integrity-leaf-'));
  const copy = path.join(dir, 'maestro');
  try {
    await cp(fileURLToPath(new URL('../../skills/maestro', import.meta.url)), copy, { recursive: true });
    assert.deepEqual(await checkBundle(copy), []);

    const executor = path.join(copy, 'prompts', 'executor.md');
    const words = LEAF_RULE.split(' ').map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const sentence = new RegExp(words.join('\\s+'));
    const body = await readFile(executor, 'utf8');
    assert.match(body, sentence);
    await writeFile(executor, body.replace(sentence, ''), 'utf8');

    const violations = await checkBundle(copy);
    assert.equal(violations.length, 1);
    assert.equal(violations[0]?.check, 'leaf');
    assert.equal(violations[0]?.file, path.join('prompts', 'executor.md'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
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

test('procedure scaffold rejects missing evidence/outcome instructions', () => {
  const body = 'Entry: inputs\n1. Run check\nReturn fields: id, result\nUnavailable stays incomplete. Next action: review.\nValid: capture passes. Invalid: fabricated pass.';
  assert.deepEqual(checkProcedure(body), []);
  assert.deepEqual(checkProcedure(body.replace('Return fields: id, result', '')), ['output fields']);
  assert.deepEqual(checkProcedure(body.replace('Unavailable stays incomplete.', '')), ['missing-capability outcome']);
});

test('the shipped readiness protocol is a declared procedure and loses it without an Invalid example', async () => {
  assert.ok(COMPLETION_PROCEDURES.some(([file, heading]) =>
    file === 'references/verification-procedures.md' && heading === 'Readiness Protocol'));
  const body = await readFile(new URL('../../skills/maestro/references/verification-procedures.md', import.meta.url), 'utf8');
  const section = procedureSection(body, 'Readiness Protocol');
  assert.match(section, /setup_failed/);
  assert.deepEqual(checkProcedure(section), []);
  assert.deepEqual(checkProcedure(section.replace('Invalid:', 'Counterexample')), ['invalid example']);
});

test('autonomous runtime imports reject external, missing, escaped and obsolete executable dependencies', async () => {
  const { checkRuntimeImports } = await import('./bundle-integrity.ts');
  const dir = await mkdtemp(path.join(tmpdir(), 'runtime-closure-'));
  const tools = path.join(dir, 'tools');
  try {
    await mkdir(path.join(tools, 'runtime'), { recursive: true });
    await writeFile(path.join(tools, 'runtime', 'module.mts'), 'export const value = 1;');
    const entry = path.join(tools, 'sync.mts');
    await writeFile(entry, "import { value } from './runtime/module.mts';");
    assert.deepEqual(await checkRuntimeImports(tools), []);
    for (const source of ["import 'third-party';", "import './runtime/missing.mts';",
      "import '../../scripts/state/read.ts';", "import '/absolute/development/file.mts';",
      "import(variable);", "import 'node:missing-builtin';", "spawn('python3', ['sync.py']);"]) {
      await writeFile(entry, source);
      assert.ok((await checkRuntimeImports(tools)).length > 0, source);
    }
    await writeFile(entry, "import './runtime/module.mts';");
    await writeFile(path.join(tools, 'sync.py'), '# obsolete helper');
    assert.ok((await checkRuntimeImports(tools)).some(item => item.message.includes('obsolete Python')));
    await rm(path.join(tools, 'sync.py'));
    await rm(entry);
    assert.ok((await checkRuntimeImports(tools)).some(item => item.message.includes('entrypoint')));
    await rm(path.join(tools, 'runtime'), { recursive: true });
    assert.ok((await checkRuntimeImports(tools)).some(item => item.message.includes('runtime tree')));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('runtime import scanning ignores quoted data and comments and rejects imports hidden in template expressions', async () => {
  const { runtimeImports } = await import('./bundle-integrity.ts');
  assert.deepEqual(runtimeImports("const data = { from: 'value' }; // import 'external';\nimport './runtime/module.mts';").imports, ['./runtime/module.mts']);
  // Object data has a colon, so the scanner must not treat it as a from declaration.
  assert.deepEqual(runtimeImports("const data = { 'from': 'value' }; // import 'external';\nimport './runtime/module.mts';").imports, ['./runtime/module.mts']);
  assert.equal(runtimeImports('const data = `${await import("external")}`;').computed, true);
});

// --- the memory read path, end to end ---------------------------------------

/** A copy of the shipped bundle, so each test differs from the real one by one edit. */
async function withShippedCopy(body: (copy: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'bundle-integrity-memory-'));
  const copy = path.join(dir, 'maestro');
  try {
    await cp(fileURLToPath(new URL('../../skills/maestro', import.meta.url)), copy, { recursive: true });
    await body(copy);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('every memory anchor names a file the shipped bundle has, and the bundle carries them all', async () => {
  await withShippedCopy(async copy => {
    for (const anchor of MEMORY_ANCHORS) {
      const body = await readFile(path.join(copy, anchor.file), 'utf8');
      assert.ok(body.replace(/\s+/g, ' ').includes(anchor.literal), `${anchor.file}: ${anchor.literal}`);
    }
    assert.deepEqual((await checkBundle(copy)).filter(v => v.check === 'memory'), []);
  });
});

test('preflight losing its memory read is the one finding, named on preflight', async () => {
  await withShippedCopy(async copy => {
    const preflight = path.join(copy, 'phases', '0-preflight.md');
    const body = await readFile(preflight, 'utf8');
    assert.ok(body.includes('sync.mts --memory-read'));
    await writeFile(preflight, body.split('sync.mts --memory-read').join('sync.mts'), 'utf8');

    const violations = await checkBundle(copy);
    assert.equal(violations.length, 1, JSON.stringify(violations));
    assert.equal(violations[0]?.check, 'memory');
    assert.equal(violations[0]?.file, path.join('phases', '0-preflight.md'));
    assert.match(violations[0]?.message ?? '', /nothing ever reads them/);
  });
});

test('the plan losing the Terms table header is reported on the plan phase', async () => {
  await withShippedCopy(async copy => {
    const plan = path.join(copy, 'phases', '4-plan.md');
    const body = await readFile(plan, 'utf8');
    await writeFile(plan, body.replace("| Term | Meaning | Words to avoid | User's wording |", '| Term | Meaning |'), 'utf8');
    const violations = (await checkBundle(copy)).filter(v => v.check === 'memory');
    assert.deepEqual(violations.map(v => v.file), [path.join('phases', '4-plan.md')]);
  });
});

test('a brief that hands its субагент prior.md is reported, while withholding it is not', async () => {
  await withShippedCopy(async copy => {
    const executor = path.join(copy, 'prompts', 'executor.md');
    const body = await readFile(executor, 'utf8');
    await writeFile(executor, body.replace('# ', '# Also read `.maestro/<dir>/prior.md` first.\n\n# '), 'utf8');
    const violations = (await checkBundle(copy)).filter(v => v.check === 'memory');
    assert.deepEqual(violations.map(v => v.file), [path.join('prompts', 'executor.md')]);
    assert.match(violations[0]?.message ?? '', /only withhold it/);
  });
});

// --- briefing proposes, the user disposes -------------------------------------

const SHIPPED_BRIEFING = fileURLToPath(new URL('../../skills/maestro/phases/2-briefing.md', import.meta.url));

/** The fenced `answers.md` template step 4 of the shipped briefing phase prescribes. */
async function shippedAnswersTemplate(): Promise<string> {
  const body = await readFile(SHIPPED_BRIEFING, 'utf8');
  const match = /```markdown\n(### R\d{2,}[\s\S]*?)```/.exec(body);
  assert.ok(match, 'phases/2-briefing.md carries no fenced answers.md entry');
  return match[1]!;
}

test('every briefing anchor names a file the shipped bundle has, and the bundle carries them all', async () => {
  await withShippedCopy(async copy => {
    for (const anchor of BRIEFING_ANCHORS) {
      const body = await readFile(path.join(copy, anchor.file), 'utf8');
      assert.ok(body.replace(/\s+/g, ' ').includes(anchor.literal), `${anchor.file}: ${anchor.literal}`);
    }
    assert.deepEqual((await checkBundle(copy)).filter(v => v.check === 'briefing'), []);
  });
});

test('briefing losing the repository-fact row is the one finding, named on the briefing phase', async () => {
  await withShippedCopy(async copy => {
    const briefing = path.join(copy, 'phases', '2-briefing.md');
    const body = await readFile(briefing, 'utf8');
    const row = body.split('\n').find(line => line.startsWith('| The answer is a fact about the repository'));
    assert.ok(row);
    await writeFile(briefing, body.replace(`${row}\n`, ''), 'utf8');

    const violations = await checkBundle(copy);
    assert.equal(violations.length, 1, JSON.stringify(violations));
    assert.equal(violations[0]?.check, 'briefing');
    assert.equal(violations[0]?.file, path.join('phases', '2-briefing.md'));
    assert.match(violations[0]?.message ?? '', /never put to the user/);
  });
});

test('SKILL.md losing «Не понял» is reported on SKILL.md', async () => {
  await withShippedCopy(async copy => {
    const skill = path.join(copy, 'SKILL.md');
    const body = await readFile(skill, 'utf8');
    await writeFile(skill, body.replace('«Не понял» is not an answer', '«Не понял» is a reply'), 'utf8');
    const violations = (await checkBundle(copy)).filter(v => v.check === 'briefing');
    assert.deepEqual(violations.map(v => v.file), ['SKILL.md']);
  });
});

test('the answers.md template the briefing phase ships passes the G1 answers check', async () => {
  const entries = parseAnswers(await shippedAnswersTemplate());
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.requirementId, 'R03');
  assert.deepEqual(entries[0]?.options?.map(option => option.recommended), [true, false]);
  assert.deepEqual(checkAnswers(entries), []);
});

test('the shipped template without its Chosen line is exactly one G1 finding', async () => {
  const template = await shippedAnswersTemplate();
  const withoutChosen = template.split('\n').filter(line => !line.startsWith('Chosen:')).join('\n');
  const findings = checkAnswers(parseAnswers(withoutChosen));
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.requirementId, 'R03');
});

// --- executors write tests that can fail --------------------------------------

const SHIPPED_EXECUTOR = fileURLToPath(new URL('../../skills/maestro/prompts/executor.md', import.meta.url));

test('every testing anchor names a file the shipped bundle has, and the bundle carries them all', async () => {
  await withShippedCopy(async copy => {
    for (const anchor of TESTING_ANCHORS) {
      const body = await readFile(path.join(copy, anchor.file), 'utf8');
      assert.ok(body.replace(/\s+/g, ' ').includes(anchor.literal), `${anchor.file}: ${anchor.literal}`);
    }
    assert.deepEqual((await checkBundle(copy)).filter(v => v.check === 'testing'), []);
  });
});

test('the executor brief losing its skip line is the one finding, named on the executor brief', async () => {
  await withShippedCopy(async copy => {
    const executor = path.join(copy, 'prompts', 'executor.md');
    const body = await readFile(executor, 'utf8');
    await writeFile(executor, body.replace('A skipped or pending test is not a pass', 'Skipped tests are fine'), 'utf8');

    const violations = await checkBundle(copy);
    assert.equal(violations.length, 1, JSON.stringify(violations));
    assert.equal(violations[0]?.check, 'testing');
    assert.equal(violations[0]?.file, path.join('prompts', 'executor.md'));
    assert.match(violations[0]?.message ?? '', /skip itself and exit green/);
  });
});

test('the plan phase losing its Test surface row is reported on the plan phase', async () => {
  await withShippedCopy(async copy => {
    const plan = path.join(copy, 'phases', '4-plan.md');
    const body = await readFile(plan, 'utf8');
    const row = body.split('\n').find(line => line.startsWith('| Test surface |'));
    assert.ok(row);
    await writeFile(plan, body.replace(`${row}\n`, ''), 'utf8');
    const violations = (await checkBundle(copy)).filter(v => v.check === 'testing');
    assert.deepEqual(violations.map(v => v.file), [path.join('phases', '4-plan.md')]);
  });
});

test('the verification procedures losing the first-build red rule are reported, though no link pass reads them', async () => {
  await withShippedCopy(async copy => {
    const procedures = path.join(copy, 'references', 'verification-procedures.md');
    const body = (await readFile(procedures, 'utf8')).replace(/\s+/g, ' ');
    await writeFile(procedures, body.replace('executor writes is seen failing on one of its named assertions', 'executor writes passes'), 'utf8');
    const violations = (await checkBundle(copy)).filter(v => v.check === 'testing');
    assert.deepEqual(violations.map(v => v.file), [path.join('references', 'verification-procedures.md')]);
  });
});

/** The fenced return block part 5 of the shipped executor brief prescribes. */
async function shippedReturnTemplate(): Promise<string> {
  return readFile(SHIPPED_EXECUTOR, 'utf8');
}

test('the return template the executor brief ships passes the return-block parser', async () => {
  const blocks = parseExecutionReturns(await shippedReturnTemplate());
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.red?.kind, 'run');
  assert.deepEqual(checkExecutionReturns(blocks, 'prompts/executor.md'), []);
});

test('the shipped return template without its red run is exactly one red-missing violation', async () => {
  const lines = (await shippedReturnTemplate()).split('\n');
  const start = lines.findIndex(line => line.trim() === 'red:');
  assert.ok(start > 0, 'prompts/executor.md carries no red: block in its template');
  let end = start + 1;
  while (/^\s{5,}\S/.test(lines[end] ?? '')) end += 1;
  lines.splice(start, end - start);
  const violations = checkExecutionReturns(parseExecutionReturns(lines.join('\n')), 'prompts/executor.md');
  assert.deepEqual(violations.map(v => v.check), ['red-missing']);
});

// --- the plan cuts for width and for something to show ------------------------

test('every cut anchor names a file the shipped bundle has, and the bundle carries them all', async () => {
  assert.ok(CUT_ANCHORS.length > 0, 'CUT_ANCHORS holds no literal');
  await withShippedCopy(async copy => {
    for (const anchor of CUT_ANCHORS) {
      const body = await readFile(path.join(copy, anchor.file), 'utf8');
      assert.ok(body.replace(/\s+/g, ' ').includes(anchor.literal), `${anchor.file}: ${anchor.literal}`);
    }
    assert.deepEqual((await checkBundle(copy)).filter(v => v.check === 'cut'), []);
  });
});

test('the plan phase losing its prefactor precondition is the one finding, named on the plan phase', async () => {
  await withShippedCopy(async copy => {
    const plan = path.join(copy, 'phases', '4-plan.md');
    const body = await readFile(plan, 'utf8');
    const dropped = body.replace(/Cut it only when an\s+existing check already covers/, 'Cut it whenever it helps; it covers');
    assert.notEqual(dropped, body);
    await writeFile(plan, dropped, 'utf8');

    const violations = await checkBundle(copy);
    assert.equal(violations.length, 1, JSON.stringify(violations));
    assert.equal(violations[0]?.check, 'cut');
    assert.equal(violations[0]?.file, path.join('phases', '4-plan.md'));
    assert.match(violations[0]?.message ?? '', /never seen failing/);
  });
});

test('the task reader losing the stub finding is reported on the task reader', async () => {
  await withShippedCopy(async copy => {
    const reader = path.join(copy, 'prompts', 'task-reader.md');
    const body = await readFile(reader, 'utf8');
    await writeFile(reader, body.replace('A *done means* only a stub can meet', 'A done-means item'), 'utf8');
    const violations = (await checkBundle(copy)).filter(v => v.check === 'cut');
    assert.deepEqual(violations.map(v => v.file), [path.join('prompts', 'task-reader.md')]);
  });
});

test('the build phase losing the hand-over of blockers\' D## rows is reported on the build phase', async () => {
  await withShippedCopy(async copy => {
    const build = path.join(copy, 'phases', '5-build.md');
    const body = await readFile(build, 'utf8');
    const dropped = body.replace(/is also handed the `D##` rows its blockers\s+recorded/, 'is handed nothing more');
    assert.notEqual(dropped, body);
    await writeFile(build, dropped, 'utf8');
    const violations = (await checkBundle(copy)).filter(v => v.check === 'cut');
    assert.deepEqual(violations.map(v => v.file), [path.join('phases', '5-build.md')]);
  });
});

// --- review sees what nobody asked for ----------------------------------------

test('every review anchor names a file the shipped bundle has, and the bundle carries them all', async () => {
  assert.ok(REVIEW_ANCHORS.length > 0, 'REVIEW_ANCHORS holds no literal');
  await withShippedCopy(async copy => {
    for (const anchor of REVIEW_ANCHORS) {
      const body = await readFile(path.join(copy, anchor.file), 'utf8');
      assert.ok(body.replace(/\s+/g, ' ').includes(anchor.literal), `${anchor.file}: ${anchor.literal}`);
    }
    assert.deepEqual((await checkBundle(copy)).filter(v => v.check === 'review'), []);
  });
});

test('the review phase losing its debug-tag condition is the one finding, named on the review phase', async () => {
  await withShippedCopy(async copy => {
    const review = path.join(copy, 'phases', '6-review.md');
    const body = await readFile(review, 'utf8');
    const dropped = body.replace(/that no later commit of the same таск\s+removes is a blocking finding of your own/,
      'is worth a mention');
    assert.notEqual(dropped, body);
    await writeFile(review, dropped, 'utf8');

    const violations = await checkBundle(copy);
    assert.equal(violations.length, 1, JSON.stringify(violations));
    assert.equal(violations[0]?.check, 'review');
    assert.equal(violations[0]?.file, path.join('phases', '6-review.md'));
    assert.match(violations[0]?.message ?? '', /debug output/);
  });
});

test('the reviewer losing its fifth part is reported on the reviewer brief', async () => {
  await withShippedCopy(async copy => {
    const reviewer = path.join(copy, 'prompts', 'reviewer.md');
    const body = await readFile(reviewer, 'utf8');
    const dropped = body.replace(/tagged `unrequested`, and never\s+blocking/, 'blocking when it matters');
    assert.notEqual(dropped, body);
    await writeFile(reviewer, dropped, 'utf8');
    const violations = (await checkBundle(copy)).filter(v => v.check === 'review');
    assert.deepEqual(violations.map(v => v.file), [path.join('prompts', 'reviewer.md')]);
  });
});

test('the reviewer losing the one exception for absence is reported on the reviewer brief', async () => {
  await withShippedCopy(async copy => {
    const reviewer = path.join(copy, 'prompts', 'reviewer.md');
    const body = await readFile(reviewer, 'utf8');
    const dropped = body.replace(/the\s+one\s+place\s+an\s+absence\s+is\s+a\s+finding/, 'a note');
    assert.notEqual(dropped, body);
    await writeFile(reviewer, dropped, 'utf8');
    const violations = (await checkBundle(copy)).filter(v => v.check === 'review');
    assert.deepEqual(violations.map(v => v.file), [path.join('prompts', 'reviewer.md')]);
    assert.match(violations[0]?.message ?? '', /missing permission check/);
  });
});

test('a review phase that drops the risk tag is reported on the review phase', async () => {
  await withShippedCopy(async copy => {
    const review = path.join(copy, 'phases', '6-review.md');
    const body = await readFile(review, 'utf8');
    const dropped = body.replace(/A `risk:` finding is written\s+with its tag/, 'A finding is written');
    assert.notEqual(dropped, body);
    await writeFile(review, dropped, 'utf8');
    const violations = (await checkBundle(copy)).filter(v => v.check === 'review');
    assert.deepEqual(violations.map(v => v.file), [path.join('phases', '6-review.md')]);
  });
});

test('the standards reader calling a smell a violation is reported on its brief', async () => {
  await withShippedCopy(async copy => {
    const reader = path.join(copy, 'prompts', 'standards-reader.md');
    const body = await readFile(reader, 'utf8');
    const dropped = body.replaceAll('never a violation', 'a violation');
    assert.notEqual(dropped, body);
    await writeFile(reader, dropped, 'utf8');
    const violations = (await checkBundle(copy)).filter(v => v.check === 'review');
    assert.deepEqual(violations.map(v => v.file), [path.join('prompts', 'standards-reader.md')]);
  });
});

// --- repair diagnoses by competing hypotheses ----------------------------------

test('every diagnosis anchor names a file the shipped bundle has, and the bundle carries them all', async () => {
  assert.ok(DIAGNOSIS_ANCHORS.length > 0, 'DIAGNOSIS_ANCHORS holds no literal');
  await withShippedCopy(async copy => {
    for (const anchor of DIAGNOSIS_ANCHORS) {
      const body = await readFile(path.join(copy, anchor.file), 'utf8');
      assert.ok(body.replace(/\s+/g, ' ').includes(anchor.literal), `${anchor.file}: ${anchor.literal}`);
    }
    assert.deepEqual((await checkBundle(copy)).filter(v => v.check === 'diagnosis'), []);
  });
});

test('the diagnostician losing its ranked hypotheses is the one finding, named on its brief', async () => {
  await withShippedCopy(async copy => {
    const brief = path.join(copy, 'prompts', 'repair-diagnostician.md');
    const body = await readFile(brief, 'utf8');
    const dropped = body.replace(/List three to five ranked hypotheses for the failure, most likely\s+first/,
      'Propose one grounded next approach');
    assert.notEqual(dropped, body);
    await writeFile(brief, dropped, 'utf8');

    const violations = await checkBundle(copy);
    assert.equal(violations.length, 1, JSON.stringify(violations));
    assert.equal(violations[0]?.check, 'diagnosis');
    assert.equal(violations[0]?.file, path.join('prompts', 'repair-diagnostician.md'));
    assert.match(violations[0]?.message ?? '', /one cause the diagnostician thought of first/);
  });
});

test('the отчёт losing the noCorrectSeam observations is reported on the acceptance phase', async () => {
  await withShippedCopy(async copy => {
    const acceptance = path.join(copy, 'phases', '7-acceptance.md');
    const body = await readFile(acceptance, 'utf8');
    const dropped = body.replace(/; then each `noCorrectSeam:` line[^|]*never the hypotheses/, '');
    assert.notEqual(dropped, body);
    await writeFile(acceptance, dropped, 'utf8');
    const violations = (await checkBundle(copy)).filter(v => v.check === 'diagnosis');
    assert.deepEqual(violations.map(v => v.file), [path.join('phases', '7-acceptance.md'), path.join('phases', '7-acceptance.md')]);
  });
});

// --- the отчёт hands over what only the user can do ----------------------------

test('every report anchor names a file the shipped bundle has, and the bundle carries them all', async () => {
  assert.ok(REPORT_ANCHORS.length > 0, 'REPORT_ANCHORS holds no literal');
  await withShippedCopy(async copy => {
    for (const anchor of REPORT_ANCHORS) {
      const body = await readFile(path.join(copy, anchor.file), 'utf8');
      assert.ok(body.replace(/\s+/g, ' ').includes(anchor.literal), `${anchor.file}: ${anchor.literal}`);
    }
    assert.deepEqual((await checkBundle(copy)).filter(v => v.check === 'report'), []);
  });
});

test('the отчёт losing one question per idea is the one finding, named on the acceptance phase', async () => {
  await withShippedCopy(async copy => {
    const acceptance = path.join(copy, 'phases', '7-acceptance.md');
    const body = await readFile(acceptance, 'utf8');
    const dropped = body.replace('**One question per idea.**', '**Each placeholder is a question.**');
    assert.notEqual(dropped, body);
    await writeFile(acceptance, dropped, 'utf8');

    const violations = await checkBundle(copy);
    assert.equal(violations.length, 1, JSON.stringify(violations));
    assert.equal(violations[0]?.check, 'report');
    assert.equal(violations[0]?.file, path.join('phases', '7-acceptance.md'));
  });
});

test('the review phase losing its one-way scan is reported on the review phase', async () => {
  await withShippedCopy(async copy => {
    const review = path.join(copy, 'phases', '6-review.md');
    const body = await readFile(review, 'utf8');
    const dropped = body.replace(/\*\*Then record what is hard to undo\.\*\*[\s\S]*?names no path\.\n/, '');
    assert.notEqual(dropped, body);
    await writeFile(review, dropped, 'utf8');
    const files = (await checkBundle(copy)).filter(v => v.check === 'report').map(v => v.file);
    assert.ok(files.length > 0);
    assert.ok(files.every(file => file === path.join('phases', '6-review.md')), JSON.stringify(files));
  });
});

// --- the phases record signals the retrospective reads ------------------------

test('every signal anchor names a file the shipped bundle has, and the bundle carries them all', async () => {
  assert.ok(SIGNAL_ANCHORS.length > 0, 'SIGNAL_ANCHORS holds no literal');
  await withShippedCopy(async copy => {
    for (const anchor of SIGNAL_ANCHORS) {
      const body = await readFile(path.join(copy, anchor.file), 'utf8');
      assert.ok(body.replace(/\s+/g, ' ').includes(anchor.literal), `${anchor.file}: ${anchor.literal}`);
    }
    assert.deepEqual((await checkBundle(copy)).filter(v => v.check === 'signals'), []);
  });
});

test('a phase that goes back to «record that it asked» is the one finding, named on that phase', async () => {
  await withShippedCopy(async copy => {
    const build = path.join(copy, 'phases', '5-build.md');
    const body = await readFile(build, 'utf8');
    const dropped = body.replace(/Refuse, and append\s+`SIG-<n> withheld-request — spec\.md — executor <taskId>` to `signals`/,
      'Refuse, and record that it asked');
    assert.notEqual(dropped, body);
    await writeFile(build, dropped, 'utf8');

    const violations = await checkBundle(copy);
    assert.equal(violations.length, 1, JSON.stringify(violations));
    assert.equal(violations[0]?.check, 'signals');
    assert.equal(violations[0]?.file, path.join('phases', '5-build.md'));
  });
});

test('preflight no longer seeding signals is reported on the preflight phase', async () => {
  await withShippedCopy(async copy => {
    const preflight = path.join(copy, 'phases', '0-preflight.md');
    const body = await readFile(preflight, 'utf8');
    const dropped = body.replace(/^\| `signals` \|.*\n/m, '');
    assert.notEqual(dropped, body);
    await writeFile(preflight, dropped, 'utf8');
    const violations = (await checkBundle(copy)).filter(v => v.check === 'signals');
    assert.deepEqual(violations.map(v => v.file), [path.join('phases', '0-preflight.md')]);
  });
});

// --- the resident budget and who starts the skill ------------------------------

test('the shipped bundle sits exactly at its resident ceilings and declares explicit-only invocation on both hosts', async () => {
  await withShippedCopy(async copy => {
    const violations = (await checkBundle(copy)).filter(v => v.check === 'resident' || v.check === 'invocation');
    assert.deepEqual(violations, []);
  });
});

/** The shipped `SKILL.md` with one edit, and the checker's resident findings on it. */
async function residentFindingsAfter(edit: (skill: string) => string): Promise<Violation[]> {
  let found: Violation[] = [];
  await withShippedCopy(async copy => {
    const skill = path.join(copy, 'SKILL.md');
    await writeFile(skill, edit(await readFile(skill, 'utf8')), 'utf8');
    found = (await checkBundle(copy)).filter(v => v.check === 'resident');
  });
  return found;
}

function shippedDescription(skill: string): string {
  const line = skill.split('\n').find(candidate => candidate.startsWith('description: '));
  assert.ok(line, 'SKILL.md carries no description line');
  return line.slice('description: '.length);
}

test('a SKILL.md one line over its ceiling is refused, and the message says raising the ceiling is not the fix', async () => {
  const violations = await residentFindingsAfter(skill => `${skill}\n`);
  assert.equal(violations.length, 1, JSON.stringify(violations));
  assert.equal(violations[0]?.file, 'SKILL.md');
  assert.match(violations[0]?.message ?? '', /over the ceiling of \d+/);
  assert.match(violations[0]?.message ?? '', /raising the ceiling is not the fix/);
});

test('a SKILL.md shorter than its ceiling is refused until the ceiling is lowered to match', async () => {
  const ceiling = MAESTRO_BUNDLE.resident?.skillLines;
  assert.ok(ceiling);
  const violations = await residentFindingsAfter(skill => skill.replace('\n\n', '\n'));
  assert.equal(violations.length, 1, JSON.stringify(violations));
  assert.match(violations[0]?.message ?? '', new RegExp(`lower resident\\.skillLines .* to ${ceiling - 1} `));
  assert.match(violations[0]?.message ?? '', /only goes down/);
});

test('a description longer than its ceiling is refused, because it is resident on every turn', async () => {
  const violations = await residentFindingsAfter(skill => {
    const description = shippedDescription(skill);
    return skill.replace(`description: ${description}`, `description: ${description} x`);
  });
  assert.equal(violations.length, 1, JSON.stringify(violations));
  assert.equal(violations[0]?.line, 1);
  assert.match(violations[0]?.message ?? '', /trigger conditions only/);
  assert.match(violations[0]?.message ?? '', /raising the ceiling is not the fix/);
});

test('a description shorter than its ceiling is refused until the ceiling is lowered to match', async () => {
  const ceiling = MAESTRO_BUNDLE.resident?.descriptionChars;
  assert.ok(ceiling);
  const violations = await residentFindingsAfter(skill => {
    const description = shippedDescription(skill);
    return skill.replace(`description: ${description}`, `description: ${description.slice(0, -1)}`);
  });
  assert.equal(violations.length, 1, JSON.stringify(violations));
  assert.match(violations[0]?.message ?? '', new RegExp(`lower resident\\.descriptionChars .* to ${ceiling - 1} `));
});

test('the description is measured in characters, so an em dash counts once', async () => {
  const violations = await residentFindingsAfter(skill => {
    const description = shippedDescription(skill);
    return skill.replace(`description: ${description}`, `description: ${description.slice(0, -1)}—`);
  });
  assert.deepEqual(violations, []);
});

test('a fixture bundle without a resident budget is not held to the shipped ceilings', async () => {
  assert.ok(MAESTRO_BUNDLE.resident && MAESTRO_BUNDLE.invocation);
  assert.deepEqual((await violationsFor({})).filter(v => v.check === 'resident' || v.check === 'invocation'), []);
});

/** The shipped bundle with one edit, and the checker's invocation findings on it. */
async function invocationFindingsAfter(edit: (copy: string) => Promise<void>): Promise<Violation[]> {
  let found: Violation[] = [];
  await withShippedCopy(async copy => {
    await edit(copy);
    found = (await checkBundle(copy)).filter(v => v.check === 'invocation');
  });
  return found;
}

test('a SKILL.md without disable-model-invocation: true is refused on SKILL.md, naming both hosts', async () => {
  const violations = await invocationFindingsAfter(async copy => {
    const skill = path.join(copy, 'SKILL.md');
    const body = await readFile(skill, 'utf8');
    assert.ok(body.includes('disable-model-invocation: true\n'));
    await writeFile(skill, body.replace('disable-model-invocation: true\n', ''), 'utf8');
  });
  assert.deepEqual(violations.map(v => [v.file, v.line]), [['SKILL.md', 1]]);
  assert.match(violations[0]?.message ?? '', /agents\/openai\.yaml/);
});

test('a bundle without agents/openai.yaml is refused, because Codex would start the skill on its own', async () => {
  const violations = await invocationFindingsAfter(async copy => {
    await rm(path.join(copy, 'agents', 'openai.yaml'));
  });
  assert.deepEqual(violations.map(v => [v.file, v.line]), [[path.join('agents', 'openai.yaml'), 0]]);
  assert.match(violations[0]?.message ?? '', /starts the skill on its own/);
});

test('Codex without allow_implicit_invocation: false is refused even when Claude Code declares explicit-only', async () => {
  const violations = await invocationFindingsAfter(async copy => {
    const yaml = path.join(copy, 'agents', 'openai.yaml');
    const body = await readFile(yaml, 'utf8');
    await writeFile(yaml, body.replace('allow_implicit_invocation: false', 'allow_implicit_invocation: true'), 'utf8');
  });
  assert.deepEqual(violations.map(v => [v.file, v.line]), [[path.join('agents', 'openai.yaml'), 2]]);
});

test('allow_implicit_invocation: false outside a policy block is not a declaration', async () => {
  const violations = await invocationFindingsAfter(async copy => {
    await writeFile(path.join(copy, 'agents', 'openai.yaml'), 'interface:\n  allow_implicit_invocation: false\n', 'utf8');
  });
  assert.deepEqual(violations.map(v => v.file), [path.join('agents', 'openai.yaml')]);
});

// --- a stop says it stopped, and a missing capability has a path --------------

test('every stop anchor names a file the shipped bundle has, and the bundle carries them all', async () => {
  assert.ok(STOP_ANCHORS.length > 0, 'STOP_ANCHORS holds no literal');
  await withShippedCopy(async copy => {
    for (const anchor of STOP_ANCHORS) {
      const body = await readFile(path.join(copy, anchor.file), 'utf8');
      assert.ok(body.replace(/\s+/g, ' ').includes(anchor.literal), `${anchor.file}: ${anchor.literal}`);
    }
    assert.deepEqual((await checkBundle(copy)).filter(v => v.check === 'stops'), []);
  });
});

test('the executor brief losing its S4 rule is the one stop finding, named on the brief', async () => {
  await withShippedCopy(async copy => {
    const brief = path.join(copy, 'prompts', 'executor.md');
    const body = await readFile(brief, 'utf8');
    const dropped = body.replace(/Do no irreversible or outward-facing action/, 'Mind what you do');
    assert.notEqual(dropped, body);
    await writeFile(brief, dropped, 'utf8');
    const found = (await checkBundle(copy)).filter(v => v.check === 'stops');
    assert.deepEqual(found.map(v => v.file), [path.join('prompts', 'executor.md')]);
  });
});

// --- the hand-off is the last line a phase file holds --------------------------

test('no shipped phase file holds text after its hand-off to the next phase', async () => {
  await withShippedCopy(async copy => {
    assert.deepEqual((await checkBundle(copy)).filter(v => v.check === 'handoff'), []);
  });
});

test('a section after the hand-off is a finding on its first line, naming the hand-off it hides behind', () => {
  const body = '# Phase\n\nStep one.\n\nThen read the build phase file.\n\n## Late Section\n\nA step nobody reads.\n';
  const found = textAfterHandoff('phases/4-plan.md', body);
  assert.equal(found.length, 1);
  assert.equal(found[0]!.line, 7);
  assert.match(found[0]!.message, /hand-off on line 5/);
});

test('a hand-off followed only by blank lines, or a phase with no hand-off, is not a finding', () => {
  assert.deepEqual(textAfterHandoff('phases/1-manifest.md', 'Step.\n\nThen read the briefing phase file.\n\n\n'), []);
  assert.deepEqual(textAfterHandoff('phases/9-memory.md', '# Memory\n\nNo next phase.\n'), []);
});
