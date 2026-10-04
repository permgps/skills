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

import { BEGIN_MARKER, END_MARKER } from '../memory/markers.ts';
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
      `# Team\n\nTheir words.\n\n${wrap('Prices live in menu.json.')}\n`);
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

test('an unknown host or an empty body is refused with exit 2 and touches nothing', async () => {
  const project = await target();
  try {
    for (const [args, input] of [
      [['--memory-write'], 'A fact.'],
      [['--memory-write', '--host', 'cursor'], 'A fact.'],
      [['--memory-write', '--host', 'codex'], '  \n'],
    ] as const) {
      const outcome = project.sync([...args], input);
      assert.equal(outcome.code, 2, `${args.join(' ')}: ${outcome.stdout}`);
      assert.equal(typeof outcome['error'], 'string');
    }
    assert.deepEqual(await readdir(project.root), ['.maestro']);
  } finally { await project.dispose(); }
});
