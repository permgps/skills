// The memory actions of the copied `sync.mts`, driven the way a прогон drives them.
//
// Preflight runs `--memory-read` and phase 9 runs `--memory-write`, each through
// the helper copied into `<project>/.maestro/`. So each test builds that
// project, publishes a real contract-7 state where the register matters (the
// register then holds a row `upsertRegister` wrote, not one typed here), and
// asserts what the orchestrator sees: an exit code, one JSON line, and the files.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { copyFile, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { BEGIN_MARKER, END_MARKER, TAIL_HEADING, historyTail } from '../memory/markers.ts';
import { CAPTURES, SOURCE_MANIFEST, activeContract7State, contract7State } from '../state/fixtures/verification.ts';
import type { RunState } from '../state/contract.ts';

const SYNC = 'skills/maestro/tools/sync.mts';
const PAGE = 'skills/maestro/assets/dashboard.html';
const EARLIER = '2026-09-29-synthetic-menu';
const CURRENT = '2026-10-04-next-run--wip';

type Outcome = Record<string, unknown> & { code: number; stdout: string };

const wrap = (body: string): string => `${BEGIN_MARKER}\n${body}\n${END_MARKER}`;

interface Target {
  root: string;
  maestro: string;
  sync(args: string[], input?: string): Outcome;
  publish(state: RunState, expect?: string): Outcome;
  dispose(): Promise<void>;
}

async function target(): Promise<Target> {
  const root = await mkdtemp(path.join(tmpdir(), 'maestro-memory-sync-'));
  const maestro = path.join(root, '.maestro');
  await mkdir(maestro);
  await copyFile(SYNC, path.join(maestro, 'sync.mts'));
  await cp('skills/maestro/tools/runtime', path.join(maestro, 'runtime'), { recursive: true });
  await copyFile(PAGE, path.join(maestro, 'dashboard.html'));
  const pids = new Set<number>();
  const sync = (args: string[], input?: string): Outcome => {
    const done = spawnSync(process.execPath, [path.join(maestro, 'sync.mts'), ...args], {
      encoding: 'utf8', input: input ?? '', env: { ...process.env, MAESTRO_SYNC_NO_OPEN: '1' },
    });
    try {
      pids.add((JSON.parse(readFileSync(path.join(maestro, 'serve.json'), 'utf8')) as { pid: number }).pid);
    } catch { /* no server was raised */ }
    const first = done.stdout.split('\n')[0] || '{}';
    return { ...JSON.parse(first) as Record<string, unknown>, code: done.status ?? -1, stdout: done.stdout };
  };
  return {
    root, maestro, sync,
    publish(state, expect) {
      const candidate = path.join(root, 'candidate.json');
      writeFileSync(candidate, JSON.stringify(state));
      return sync(['--publish', candidate, '--no-open', ...(expect ? ['--expect', expect] : [])]);
    },
    async dispose() {
      for (const pid of pids) { try { process.kill(pid, 'SIGTERM'); } catch { /* gone */ } }
      await rm(root, { recursive: true, force: true });
    },
  };
}

/** A finished earlier run: published twice, so the register row is the landed one. */
async function landEarlierRun(project: Target, decisions: string): Promise<void> {
  for (const [relative, body] of Object.entries({ ...CAPTURES, 'manifest.md': SOURCE_MANIFEST })) {
    await mkdir(path.dirname(path.join(project.maestro, `${EARLIER}--wip`, relative)), { recursive: true });
    await writeFile(path.join(project.maestro, `${EARLIER}--wip`, relative), body);
  }
  assert.equal(project.publish(activeContract7State()).code, 0);
  const closed = project.publish({ ...contract7State(), updatedAt: '2026-09-29T09:30:00Z' }, activeContract7State().updatedAt);
  assert.equal(closed.code, 0, JSON.stringify(closed));
  await writeFile(path.join(project.maestro, EARLIER, 'decisions.md'), decisions, 'utf8');
}

test('preflight\'s read writes prior.md from the memory block and a run publication registered', async () => {
  const project = await target();
  try {
    await landEarlierRun(project, '- Kept the menu static instead of a CMS, because the owner edits it twice a year. (R02, 2026-09-29)\n');
    await writeFile(path.join(project.root, 'CLAUDE.md'), `# Team\n\n${wrap('Prices live in menu.json.')}\n`, 'utf8');
    await mkdir(path.join(project.maestro, CURRENT));

    const read = project.sync(['--memory-read', '--run-dir', CURRENT]);
    assert.equal(read.code, 0, read.stdout);
    assert.equal(read['action'], 'written');
    assert.deepEqual(read['blockFiles'], ['CLAUDE.md']);
    assert.deepEqual(read['runs'], [EARLIER]);

    const prior = await readFile(path.join(project.maestro, CURRENT, 'prior.md'), 'utf8');
    assert.match(prior, /### `CLAUDE.md`\n\nPrices live in menu.json.\n/);
    assert.match(prior, new RegExp(`### ${EARLIER} — completed, started 2026-09-29\\n\\n- Kept the menu static`));
  } finally { await project.dispose(); }
});

test('a second read keeps the prior.md the first one wrote', async () => {
  const project = await target();
  try {
    await mkdir(path.join(project.maestro, CURRENT));
    assert.equal(project.sync(['--memory-read', '--run-dir', CURRENT])['action'], 'written');
    const first = await readFile(path.join(project.maestro, CURRENT, 'prior.md'), 'utf8');
    await writeFile(path.join(project.root, 'AGENTS.md'), `${wrap('Written after preflight.')}\n`, 'utf8');

    const again = project.sync(['--memory-read', '--run-dir', CURRENT]);
    assert.equal(again.code, 0);
    assert.equal(again['action'], 'kept');
    assert.equal(await readFile(path.join(project.maestro, CURRENT, 'prior.md'), 'utf8'), first);
  } finally { await project.dispose(); }
});

test('the read refuses a run directory it cannot use, with exit 2 and nothing written', async () => {
  const project = await target();
  try {
    for (const args of [['--memory-read'], ['--memory-read', '--run-dir', '../escape'], ['--memory-read', '--run-dir', CURRENT]]) {
      const outcome = project.sync(args);
      assert.equal(outcome.code, 2, `${args.join(' ')}: ${outcome.stdout}`);
      assert.equal(typeof outcome['error'], 'string');
    }
    assert.deepEqual((await readdir(project.root)).sort(), ['.maestro']);
  } finally { await project.dispose(); }
});

test('malformed markers in a memory file are named in prior.md and do not fail the read', async () => {
  const project = await target();
  try {
    await writeFile(path.join(project.root, 'AGENTS.md'), `notes\n${BEGIN_MARKER}\n`, 'utf8');
    await mkdir(path.join(project.maestro, CURRENT));
    const read = project.sync(['--memory-read', '--run-dir', CURRENT]);
    assert.equal(read.code, 0, read.stdout);
    assert.equal((read['notRead'] as { item: string }[])[0]!.item, 'AGENTS.md');
    assert.match(await readFile(path.join(project.maestro, CURRENT, 'prior.md'), 'utf8'), /## Not Read\n\n- `AGENTS.md`: /);
  } finally { await project.dispose(); }
});

test('preflight\'s read carries a map and the glossaries it links to, and reports them in its JSON line', async () => {
  const project = await target();
  try {
    const files: Record<string, string> = {
      'GLOSSARY-MAP.md': '# Glossary Map\n\n## Contexts\n\n- [Ordering](./src/ordering/GLOSSARY.md): orders\n- [Billing](./src/billing/GLOSSARY.md): invoices\n',
      'src/ordering/GLOSSARY.md': '# Ordering\n\n**Order**:\nA customer\'s request for goods.\n_Avoid_: Purchase\n',
      'src/billing/GLOSSARY.md': '# Billing\n\n**Invoice**:\nA request for payment.\n_Avoid_: Bill\n',
    };
    for (const [file, body] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(project.root, file)), { recursive: true });
      await writeFile(path.join(project.root, file), body, 'utf8');
    }
    await mkdir(path.join(project.maestro, CURRENT));

    const read = project.sync(['--memory-read', '--run-dir', CURRENT]);
    assert.equal(read.code, 0, read.stdout);
    assert.deepEqual(read['glossary'], {
      state: 'read',
      files: ['GLOSSARY-MAP.md', 'src/ordering/GLOSSARY.md', 'src/billing/GLOSSARY.md'],
      bytes: Buffer.byteLength(Object.values(files).join('')),
      limit: 32 * 1024,
    });
    const prior = await readFile(path.join(project.maestro, CURRENT, 'prior.md'), 'utf8');
    assert.match(prior, /### `src\/ordering\/GLOSSARY.md`\n\n```markdown\n# Ordering\n/);
  } finally { await project.dispose(); }
});

test('a project glossary over the limit is reported by name and size, and not one line of it reaches prior.md', async () => {
  const project = await target();
  try {
    await writeFile(path.join(project.root, 'GLOSSARY.md'), '**Term**:\n' + 'z'.repeat(32 * 1024), 'utf8');
    await mkdir(path.join(project.maestro, CURRENT));

    const read = project.sync(['--memory-read', '--run-dir', CURRENT]);
    assert.equal(read.code, 0, read.stdout);
    assert.deepEqual(read['glossary'], { state: 'over-limit', files: ['GLOSSARY.md'], bytes: 32 * 1024 + 10, limit: 32 * 1024 });
    const prior = await readFile(path.join(project.maestro, CURRENT, 'prior.md'), 'utf8');
    assert.match(prior, /Not read: 1 file, 32778 bytes, over the 32768-byte limit\./);
    assert.doesNotMatch(prior, /\*\*Term\*\*/);
  } finally { await project.dispose(); }
});

test('phase 9\'s write splices the block from stdin into the file the host loads', async () => {
  const project = await target();
  try {
    await writeFile(path.join(project.root, 'CLAUDE.md'), '# Team\n\nTheir words.\n', 'utf8');
    const written = project.sync(['--memory-write', '--host', 'claude-code'], 'Prices live in menu.json.\n');
    assert.equal(written.code, 0, written.stdout);
    assert.equal(written['file'], 'CLAUDE.md');
    assert.equal(written['action'], 'appended');
    assert.equal(written['loadedByHost'], true);
    assert.equal(await readFile(path.join(project.root, 'CLAUDE.md'), 'utf8'),
      `# Team\n\nTheir words.\n\n${wrap(`Prices live in menu.json.\n\n${historyTail()}`)}\n`);
  } finally { await project.dispose(); }
});

test('the write reports a file its host will not load instead of creating a second one', async () => {
  const project = await target();
  try {
    await writeFile(path.join(project.root, 'AGENTS.md'), 'Codex notes.\n', 'utf8');
    const written = project.sync(['--memory-write', '--host', 'gemini-cli'], 'A fact.');
    assert.equal(written.code, 0, written.stdout);
    assert.equal(written['file'], 'AGENTS.md');
    assert.equal(written['loadedByHost'], false);
    assert.deepEqual((await readdir(project.root)).sort(), ['.maestro', 'AGENTS.md']);
  } finally { await project.dispose(); }
});

test('the block in two files and malformed markers each stop the write with exit 1', async () => {
  const project = await target();
  try {
    await writeFile(path.join(project.root, 'AGENTS.md'), `${wrap('one')}\n`, 'utf8');
    await writeFile(path.join(project.root, 'GEMINI.md'), `${wrap('two')}\n`, 'utf8');
    const conflict = project.sync(['--memory-write', '--host', 'codex'], 'new');
    assert.equal(conflict.code, 1, conflict.stdout);
    assert.deepEqual(conflict['files'], ['AGENTS.md', 'GEMINI.md']);

    await writeFile(path.join(project.root, 'GEMINI.md'), `x\n${END_MARKER}\n`, 'utf8');
    const malformed = project.sync(['--memory-write', '--host', 'codex'], 'new');
    assert.equal(malformed.code, 1, malformed.stdout);
    assert.equal(malformed['file'], 'GEMINI.md');
    assert.deepEqual(malformed['lines'], [2]);

    const carried = project.sync(['--memory-write', '--host', 'gemini-cli'], `a\n${BEGIN_MARKER}\nb`);
    assert.equal(carried.code, 1, carried.stdout);
    assert.equal(await readFile(path.join(project.root, 'AGENTS.md'), 'utf8'), `${wrap('one')}\n`);
  } finally { await project.dispose(); }
});

test('a missing or unknown host is refused with exit 2 and touches nothing', async () => {
  const project = await target();
  try {
    for (const [args, input] of [
      [['--memory-write'], 'A fact.'],
      [['--memory-write', '--host', 'cursor'], 'A fact.'],
    ] as const) {
      const outcome = project.sync([...args], input);
      assert.equal(outcome.code, 2, `${args.join(' ')}: ${outcome.stdout}`);
      assert.equal(typeof outcome['error'], 'string');
    }
    assert.deepEqual(await readdir(project.root), ['.maestro']);
  } finally { await project.dispose(); }
});

// An empty body used to be exit 2, because it would have erased the block. The
// helper now keeps that block's own part and only refreshes its tail (D8), so
// the call after every closure can be made even when the run learned nothing.
test('an empty body keeps the block there and refreshes its tail, exit 0', async () => {
  const project = await target();
  try {
    await writeFile(path.join(project.root, 'AGENTS.md'), `Team.\n\n${wrap('Kept fact.')}\n`, 'utf8');
    const kept = project.sync(['--memory-write', '--host', 'codex'], '  \n');
    assert.equal(kept.code, 0, kept.stdout);
    assert.equal(kept['action'], 'replaced');
    assert.equal(await readFile(path.join(project.root, 'AGENTS.md'), 'utf8'), `Team.\n\n${wrap(`Kept fact.\n\n${historyTail()}`)}\n`);
  } finally { await project.dispose(); }
});

test('an empty body in a project with no memory file creates the host\'s file holding the tail alone', async () => {
  const project = await target();
  try {
    const created = project.sync(['--memory-write', '--host', 'claude-code'], '');
    assert.equal(created.code, 0, created.stdout);
    assert.equal(created['action'], 'created');
    assert.equal(created['file'], 'CLAUDE.md');
    assert.equal(await readFile(path.join(project.root, 'CLAUDE.md'), 'utf8'), `${wrap(historyTail())}\n`);
  } finally { await project.dispose(); }
});

test('prior.md carries the tail on, and the next write that copies it still leaves one tail', async () => {
  const project = await target();
  try {
    assert.equal(project.sync(['--memory-write', '--host', 'codex'], 'Prices live in menu.json.').code, 0);
    await mkdir(path.join(project.maestro, CURRENT));
    const read = project.sync(['--memory-read', '--run-dir', CURRENT]);
    assert.equal(read.code, 0, read.stdout);
    const prior = await readFile(path.join(project.maestro, CURRENT, 'prior.md'), 'utf8');
    assert.ok(prior.includes(`Prices live in menu.json.\n\n${historyTail()}`), 'prior.md lost the tail');
    const again = project.sync(['--memory-write', '--host', 'codex'], `Prices live in menu.json.\nTaxes too.\n\n${historyTail()}\n`);
    assert.equal(again.code, 0, again.stdout);
    const text = await readFile(path.join(project.root, 'AGENTS.md'), 'utf8');
    assert.equal(text, `${wrap(`Prices live in menu.json.\nTaxes too.\n\n${historyTail()}`)}\n`);
    assert.equal(text.split('\n').filter(line => line === TAIL_HEADING).length, 1);
  } finally { await project.dispose(); }
});

const hasGit = spawnSync('git', ['--version']).status === 0;

/** Commit everything under the project root, as a real repository's history would hold it. */
function commitAll(root: string): void {
  for (const args of [['init', '-q'], ['add', '-A'], ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init']]) {
    const done = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
    assert.equal(done.status, 0, `git ${args.join(' ')}: ${done.stderr}`);
  }
}

/** A project shaped like a real Laravel one with Maestro installed: memory files, an install, a README and code. */
async function laravelShaped(project: Target): Promise<void> {
  const files: Record<string, string> = {
    'app/Models/Landing.php': '<?php\nclass Landing {}\n',
    'composer.json': '{"name":"acme/landing"}\n',
    'AGENTS.md': '# Agents\n',
    'CLAUDE.md': '# Claude\n',
    '.claude/skills/maestro/SKILL.md': '# Maestro\n',
    'README.md': '# Landing\n',
  };
  for (const [relative, body] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(project.root, relative)), { recursive: true });
    await writeFile(path.join(project.root, relative), body, 'utf8');
  }
  await mkdir(path.join(project.maestro, CURRENT));
  commitAll(project.root);
}

test('preflight\'s read says a project with committed code has existing code, and names the first file', { skip: hasGit ? false : 'git is not on PATH' }, async () => {
  const project = await target();
  try {
    await laravelShaped(project);
    const outcome = project.sync(['--memory-read', '--run-dir', CURRENT]);
    assert.equal(outcome.code, 0, outcome.stdout);
    assert.equal(outcome['action'], 'written');
    const existing = outcome['existingCode'] as { present: boolean; source: string; first: string | null };
    assert.equal(existing.present, true);
    assert.equal(existing.source, 'git');
    assert.notEqual(existing.first, null);
    assert.match(existing.first ?? '', /^(app\/|composer\.json$)/);
  } finally { await project.dispose(); }
});

test('a resumed read that keeps prior.md still reports the same existingCode', { skip: hasGit ? false : 'git is not on PATH' }, async () => {
  const project = await target();
  try {
    await laravelShaped(project);
    const first = project.sync(['--memory-read', '--run-dir', CURRENT]);
    const again = project.sync(['--memory-read', '--run-dir', CURRENT]);
    assert.equal(again.code, 0, again.stdout);
    assert.equal(again['action'], 'kept');
    assert.equal((again['existingCode'] as { present?: boolean } | undefined)?.present, true, again.stdout);
    assert.deepEqual(again['existingCode'], first['existingCode']);
  } finally { await project.dispose(); }
});

// --- where the work stands, and the commits since the last closure ---------------

const needsGit = { skip: hasGit ? false : 'git is not on PATH' };

/** git in the project, as a user's history would have it. */
function git(root: string, ...args: string[]): string {
  const done = spawnSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
  assert.equal(done.status, 0, `git ${args.join(' ')}: ${done.stderr}`);
  return done.stdout;
}

/** A repository whose earlier run closed through publication, so PROGRESS.md names a real commit. */
async function landedInRepo(project: Target): Promise<string> {
  git(project.root, 'init', '-q');
  await writeFile(path.join(project.root, 'app.ts'), 'export {};\n', 'utf8');
  git(project.root, 'add', 'app.ts');
  git(project.root, 'commit', '-q', '-m', 'the code the run built');
  await landEarlierRun(project, '- Kept the menu static. (R01, 2026-09-29)\n');
  await mkdir(path.join(project.maestro, CURRENT));
  return git(project.root, 'rev-parse', 'HEAD').trim();
}

/** `count` real commits over code, each touching its own file. */
async function commitsOverCode(project: Target, count: number): Promise<void> {
  await mkdir(path.join(project.root, 'src'), { recursive: true });
  for (let index = 1; index <= count; index += 1) {
    await writeFile(path.join(project.root, 'src', `f${index}.ts`), `export const n = ${index};\n`, 'utf8');
    git(project.root, 'add', '-A', 'src');
    git(project.root, 'commit', '-q', '-m', `change ${index}`);
  }
}

const priorOf = (project: Target): Promise<string> => readFile(path.join(project.maestro, CURRENT, 'prior.md'), 'utf8');
const priorExists = async (project: Target): Promise<boolean> =>
  (await readdir(path.join(project.maestro, CURRENT))).includes('prior.md');

test('with no progress file the read reports it absent and no closure to read history from', async () => {
  const project = await target();
  try {
    await mkdir(path.join(project.maestro, CURRENT));
    const read = project.sync(['--memory-read', '--run-dir', CURRENT]);
    assert.equal(read['progress'], 'absent');
    assert.deepEqual(read['commits'], { state: 'none', count: 0, paths: [] });
  } finally { await project.dispose(); }
});

test('a few commits since the closure publication recorded are listed with their paths', needsGit, async () => {
  const project = await target();
  try {
    const closedAt = await landedInRepo(project);
    await commitsOverCode(project, 2);
    const read = project.sync(['--memory-read', '--run-dir', CURRENT]);
    assert.equal(read.code, 0, read.stdout);
    assert.equal(read['action'], 'written');
    assert.equal(read['progress'], 'read');
    assert.deepEqual(read['commits'], { state: 'listed', basis: 'commit', range: `${closedAt}..HEAD`, count: 2, paths: ['src/f1.ts', 'src/f2.ts'] });
    const prior = await priorOf(project);
    assert.match(prior, /## Where The Work Stands\n\n`\.maestro\/PROGRESS\.md` as the last closure left it/);
    assert.match(prior, /2 commits over code since the closure of 2026-09-29-synthetic-menu/);
  } finally { await project.dispose(); }
});

test('past thirty commits the first read writes nothing and asks for a summary', needsGit, async () => {
  const project = await target();
  try {
    const closedAt = await landedInRepo(project);
    await commitsOverCode(project, 31);
    const read = project.sync(['--memory-read', '--run-dir', CURRENT]);
    assert.equal(read.code, 0, read.stdout);
    assert.equal(read['action'], 'summary-needed');
    assert.deepEqual({ ...(read['commits'] as Record<string, unknown>), paths: undefined },
      { state: 'summary-needed', basis: 'commit', range: `${closedAt}..HEAD`, count: 31, paths: undefined });
    assert.equal(await priorExists(project), false);
  } finally { await project.dispose(); }
});

test('the second read with the reader\'s summary on stdin writes it in place of the list', needsGit, async () => {
  const project = await target();
  try {
    await landedInRepo(project);
    await commitsOverCode(project, 31);
    const read = project.sync(['--memory-read', '--run-dir', CURRENT, '--commit-summary'], 'src/ grew 31 small modules\n\n- each exports one number\n');
    assert.equal(read.code, 0, read.stdout);
    assert.equal(read['action'], 'written');
    assert.equal((read['commits'] as { state: string }).state, 'summarised');
    const prior = await priorOf(project);
    assert.match(prior, /a commit reader summarised them:\n\n- src\/ grew 31 small modules\n- each exports one number\n/);
    assert.doesNotMatch(prior, /change 17/);
  } finally { await project.dispose(); }
});

test('a summary of no lines or more than ten is refused with exit 1, and nothing is written', needsGit, async () => {
  const project = await target();
  try {
    await landedInRepo(project);
    await commitsOverCode(project, 31);
    for (const [input, lines] of [['\n  \n', 0], [Array.from({ length: 11 }, (_, index) => `line ${index}`).join('\n'), 11]] as const) {
      const read = project.sync(['--memory-read', '--run-dir', CURRENT, '--commit-summary'], input);
      assert.equal(read.code, 1, read.stdout);
      assert.equal(read['lines'], lines);
      assert.match(String(read['error']), /1 to 10 non-empty lines/);
      assert.equal(await priorExists(project), false);
    }
  } finally { await project.dispose(); }
});

test('with the reader declined the newest thirty subjects are written and the rest counted', needsGit, async () => {
  const project = await target();
  try {
    await landedInRepo(project);
    await commitsOverCode(project, 31);
    const read = project.sync(['--memory-read', '--run-dir', CURRENT, '--no-commit-summary']);
    assert.equal(read.code, 0, read.stdout);
    assert.equal((read['commits'] as { state: string }).state, 'unsummarised');
    const prior = await priorOf(project);
    assert.match(prior, /change 31\n/);
    assert.doesNotMatch(prior, /change 1\n/);
    assert.match(prior, /- 1 earlier commits not summarised\.\n/);
  } finally { await project.dispose(); }
});

test('an existing prior.md is kept byte for byte whatever the summary flags say', needsGit, async () => {
  const project = await target();
  try {
    await landedInRepo(project);
    await commitsOverCode(project, 31);
    assert.equal(project.sync(['--memory-read', '--run-dir', CURRENT, '--no-commit-summary'])['action'], 'written');
    const first = await priorOf(project);
    const again = project.sync(['--memory-read', '--run-dir', CURRENT, '--commit-summary'], 'a different summary\n');
    assert.equal(again['action'], 'kept');
    assert.equal(await priorOf(project), first);
  } finally { await project.dispose(); }
});
