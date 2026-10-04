import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, cp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  checkHostDegradation,
  checkCodexRuntime,
  checkMemoryFiles,
  findMarkers,
  parseLoadGroups,
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


async function codexViolations(file: string, before: string, after: string): Promise<Violation[]> {
  const root = await mkdtemp(path.join(tmpdir(), 'codex-runtime-'));
  try {
    await cp('skills/maestro', root, { recursive: true });
    const target = path.join(root, file);
    await writeFile(target, (await readFile(target, 'utf8')).replace(before, after));
    return await checkCodexRuntime(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('the actual bundle declares reachable native Codex dispatch without preloading the recipe', async () => {
  assert.deepEqual(await checkCodexRuntime('skills/maestro'), []);
});

test('Codex inherited context is rejected by the declared runtime contract', async () => {
  const findings = await codexViolations('references/codex.md', '| fork_turns | none |', '| fork_turns | all |');
  assert.ok(findings.some(item => item.check === 'codex-runtime' && /fork_turns/.test(item.message)));
});

test('a Codex dispatch phase cannot lose its recipe reachability marker', async () => {
  const findings = await codexViolations('phases/7-acceptance.md', '<!-- maestro:codex:dispatch -->', '');
  assert.ok(findings.some(item => /7-acceptance/.test(item.file)));
});

test('the router cannot preload coordinator-only Codex mechanics', async () => {
  const findings = await codexViolations('SKILL.md', '## Start', '[preload](references/codex.md)\n\n## Start');
  assert.ok(findings.some(item => /demand/.test(item.message)));
});

test('a stale state-writer declaration cannot claim the autonomous Node runtime', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'codex-writer-'));
  try {
    await cp('skills/maestro', root, { recursive: true });
    const file = path.join(root, 'references/codex.md');
    await writeFile(file, (await readFile(file, 'utf8')).replace('coordinator-sync.mts', 'coordinator-sync.py'));
    const findings = await checkCodexRuntime(root);
    assert.ok(findings.some(item => item.message.includes('state-writer')));
  } finally { await rm(root, { recursive: true, force: true }); }
});

const SESSION_START = `# Hosts

| Host id | Host | Loads at session start | Creates | Evidence |
|---|---|---|---|---|
| \`claude-code\` | Claude Code | \`CLAUDE.md\`, \`CLAUDE.local.md\`; else \`AGENTS.md\` | \`CLAUDE.md\` | docs |
| \`gemini-cli\` | Gemini CLI | \`GEMINI.md\` | \`GEMINI.md\` | docs |
`;

const CODED = {
  'claude-code': { groups: [['CLAUDE.md', 'CLAUDE.local.md'], ['AGENTS.md']], creates: 'CLAUDE.md' },
  'gemini-cli': { groups: [['GEMINI.md']], creates: 'GEMINI.md' },
};

test('a load cell reads as precedence groups, highest first', () => {
  assert.deepEqual(parseLoadGroups('`CLAUDE.md`, `CLAUDE.local.md`; else `AGENTS.md`'),
    [['CLAUDE.md', 'CLAUDE.local.md'], ['AGENTS.md']]);
  assert.deepEqual(parseLoadGroups('`GEMINI.md`'), [['GEMINI.md']]);
});

test('a session-start table the runtime restates exactly passes', () => {
  assert.deepEqual(checkMemoryFiles(SESSION_START, 'hosts.md', CODED, 'memory.mts'), []);
});

test('a host missing from either side of the session-start fact is reported', () => {
  const { 'gemini-cli': _gemini, ...withoutGemini } = CODED;
  const missingInCode = checkMemoryFiles(SESSION_START, 'hosts.md', withoutGemini, 'memory.mts');
  assert.deepEqual(checks(missingInCode), ['memory-file']);
  assert.match(missingInCode[0]!.message, /gemini-cli.*no row for it/);

  const extra = { ...CODED, codex: { groups: [['AGENTS.md']], creates: 'AGENTS.md' } };
  const missingInSpec = checkMemoryFiles(SESSION_START, 'hosts.md', extra, 'memory.mts');
  assert.deepEqual(checks(missingInSpec), ['memory-file']);
  assert.match(missingInSpec[0]!.message, /codex.*hosts\.md records nothing/);
});

test('a file or an order that differs between hosts.md and the runtime is reported', () => {
  const reordered = { ...CODED, 'claude-code': { groups: [['AGENTS.md'], ['CLAUDE.md', 'CLAUDE.local.md']], creates: 'CLAUDE.md' } };
  assert.match(checkMemoryFiles(SESSION_START, 'hosts.md', reordered, 'memory.mts')[0]!.message, /claude-code loads/);
  const created = { ...CODED, 'gemini-cli': { groups: [['GEMINI.md']], creates: 'AGENTS.md' } };
  assert.match(checkMemoryFiles(SESSION_START, 'hosts.md', created, 'memory.mts')[0]!.message, /gemini-cli creates GEMINI\.md/);
});

test('a specification with no session-start table is reported once the runtime has a memory module', () => {
  assert.deepEqual(checks(checkMemoryFiles(SPEC, 'hosts.md', CODED, 'memory.mts')), ['memory-file']);
});

test('the real hosts table matches the memory module the bundle ships', async () => {
  const violations = await checkHostDegradation({ specDir: 'docs/spec', bundleDir: 'skills/maestro' });
  assert.deepEqual(violations.filter(v => v.check === 'memory-file'), []);
});
