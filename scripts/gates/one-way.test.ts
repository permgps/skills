import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { runGate } from './cli.ts';
import { isMigrationPath, majorOf, oneWayIn, oneWayInCommits, oneWayLines } from './one-way.ts';
import { writeState } from '../state/write.ts';
import { validateState } from '../state/validate.ts';
import { type RunState, type TaskEntry } from '../state/contract.ts';

// --- the pure half -----------------------------------------------------------

test('a caret, a tilde, a comparator and a v prefix all reduce to the leading major', () => {
  assert.equal(majorOf('^18.2.0'), '18');
  assert.equal(majorOf('~18.2.0'), '18');
  assert.equal(majorOf('>=18.2.0'), '18');
  assert.equal(majorOf('v18'), '18');
  assert.equal(majorOf('18.x'), '18');
});

test('below 1.0 the minor is the major, as semver says', () => {
  assert.equal(majorOf('0.3.1'), '0.3');
  assert.equal(majorOf('^0.4.0'), '0.4');
});

test('a version that is not a number has no major, so it is never called an upgrade', () => {
  assert.equal(majorOf('latest'), null);
  assert.equal(majorOf('workspace:*'), null);
  assert.equal(majorOf('github:owner/repo'), null);
});

test('a migration is a path under a migrations or migrate directory, or under alembic/versions', () => {
  assert.equal(isMigrationPath('db/migrations/0004_orders.sql'), true);
  assert.equal(isMigrationPath('db/migrate/20261004_add_orders.rb'), true);
  assert.equal(isMigrationPath('alembic/versions/abc_orders.py'), true);
  assert.equal(isMigrationPath('src/migrations.ts'), false);
  assert.equal(isMigrationPath('docs/versions/notes.md'), false);
});

// --- the git half: a run's state and a real repository -----------------------

function git(repo: string, ...args: string[]): string {
  return execFileSync('git', ['-C', repo, '-c', 'user.name=maestro', '-c', 'user.email=maestro@example.invalid',
    '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim();
}

async function write(repo: string, file: string, body: string): Promise<void> {
  await mkdir(path.dirname(path.join(repo, file)), { recursive: true });
  await writeFile(path.join(repo, file), body, 'utf8');
}

function commit(repo: string, message: string): string {
  git(repo, 'add', '--all');
  git(repo, 'commit', '--quiet', '--no-verify', '-m', message);
  return git(repo, 'rev-parse', 'HEAD');
}

const short = (hash: string): string => hash.slice(0, 7);

function task(id: string, commits: string[]): TaskEntry {
  return { id, title: `таск ${id}`, requirementIds: ['R01'], status: 'review', blockedBy: [], wave: 1, zone: [],
    files: [], retries: 0, repairs: 0, handoffs: 0, commits };
}

function stateWith(tasks: TaskEntry[], oneWay?: string[]): RunState {
  return {
    contractVersion: 3,
    runId: 'run-1',
    slug: 'orders',
    startedAt: '2026-10-04T09:00:00Z',
    mode: 'semi',
    depth: 'normal',
    polish: false,
    dialChanges: [],
    stages: [{ id: 'build', status: 'done', startedAt: '2026-10-04T09:00:00Z', finishedAt: '2026-10-04T09:10:00Z' }],
    currentStage: 'review',
    tasks,
    requirements: [{ id: 'R01', status: 'in-spec' }],
    gates: [],
    updatedAt: '2026-10-04T09:12:00Z',
    debt: { placeholders: [], assumptions: [], emptyEnv: [] },
    additions: [],
    ...(oneWay === undefined ? {} : { oneWay }),
  };
}

/** A project repository whose base commit holds the user's own files. */
async function withRepo(body: (repo: string, target: string) => Promise<void>): Promise<void> {
  const repo = await mkdtemp(path.join(tmpdir(), 'one-way-'));
  try {
    git(repo, 'init', '--quiet');
    await write(repo, 'README.md', '# orders\n');
    await write(repo, 'config/legacy.json', '{"rate": 1}\n');
    await write(repo, 'src/old-name.ts', 'export const total = 1;\n');
    await write(repo, 'package.json', JSON.stringify({
      dependencies: { react: '^18.2.0', zod: '0.3.1', lodash: '4.17.21' },
      devDependencies: { typescript: '~5.4.0' },
    }, null, 2) + '\n');
    commit(repo, 'the user\'s project before the прогон');
    await mkdir(path.join(repo, '.maestro'));
    await body(repo, path.join(repo, '.maestro'));
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
}

async function bump(repo: string, deps: Record<string, string>, devDeps: Record<string, string> = { typescript: '~5.4.0' }): Promise<void> {
  await write(repo, 'package.json', JSON.stringify({ dependencies: deps, devDependencies: devDeps }, null, 2) + '\n');
}

test('a deleted file that existed before the прогон is listed as deleted', async () => {
  await withRepo(async (repo, target) => {
    await unlink(path.join(repo, 'config/legacy.json'));
    const hash = commit(repo, 'drop the legacy config');
    assert.deepEqual(await oneWayLines(stateWith([task('T03', [hash])]), repo),
      [`deleted — config/legacy.json — T03 ${short(hash)}`]);
    void target;
  });
});

test('a file one таск created and a later таск deleted is not the user\'s file and is not listed', async () => {
  await withRepo(async repo => {
    await write(repo, 'src/scratch.ts', 'export {};\n');
    const created = commit(repo, 'add scratch');
    await unlink(path.join(repo, 'src/scratch.ts'));
    const deleted = commit(repo, 'drop scratch');
    assert.deepEqual(await oneWayLines(stateWith([task('T01', [created]), task('T02', [deleted])]), repo), []);
  });
});

test('a rename of a file that existed before the прогон is listed with both paths', async () => {
  await withRepo(async repo => {
    git(repo, 'mv', 'src/old-name.ts', 'src/new-name.ts');
    const hash = commit(repo, 'rename');
    assert.deepEqual(await oneWayLines(stateWith([task('T02', [hash])]), repo),
      [`renamed — src/old-name.ts → src/new-name.ts — T02 ${short(hash)}`]);
  });
});

test('a new file under db/migrations is listed as a migration', async () => {
  await withRepo(async repo => {
    await write(repo, 'db/migrations/0004_orders.sql', 'ALTER TABLE orders ADD COLUMN paid boolean;\n');
    const hash = commit(repo, 'migrate');
    assert.deepEqual(await oneWayLines(stateWith([task('T05', [hash])]), repo),
      [`migration — db/migrations/0004_orders.sql — T05 ${short(hash)}`]);
  });
});

test('a major bump of a dependency is listed, and a minor one is not', async () => {
  await withRepo(async repo => {
    await bump(repo, { react: '^19.0.0', zod: '0.3.1', lodash: '4.18.0' });
    const hash = commit(repo, 'upgrade react');
    assert.deepEqual(await oneWayLines(stateWith([task('T04', [hash])]), repo),
      [`dependency-major — react ^18.2.0 → ^19.0.0 — T04 ${short(hash)}`]);
  });
});

test('below 1.0 a minor bump is listed and a patch bump is not', async () => {
  await withRepo(async repo => {
    await bump(repo, { react: '^18.2.0', zod: '0.4.0', lodash: '4.17.21' });
    const minor = commit(repo, 'zod minor');
    await bump(repo, { react: '^18.2.0', zod: '0.4.1', lodash: '4.17.21' });
    const patch = commit(repo, 'zod patch');
    assert.deepEqual(await oneWayLines(stateWith([task('T04', [minor, patch])]), repo),
      [`dependency-major — zod 0.3.1 → 0.4.0 — T04 ${short(minor)}`]);
  });
});

test('a major bump in devDependencies is listed', async () => {
  await withRepo(async repo => {
    await bump(repo, { react: '^18.2.0', zod: '0.3.1', lodash: '4.17.21' }, { typescript: '~6.0.0' });
    const hash = commit(repo, 'typescript 6');
    assert.deepEqual(await oneWayLines(stateWith([task('T04', [hash])]), repo),
      [`dependency-major — typescript ~5.4.0 → ~6.0.0 — T04 ${short(hash)}`]);
  });
});

test('a newly added dependency is not an upgrade and is not listed', async () => {
  await withRepo(async repo => {
    await bump(repo, { react: '^18.2.0', zod: '0.3.1', lodash: '4.17.21', express: '^5.0.0' });
    const hash = commit(repo, 'add express');
    assert.deepEqual(await oneWayLines(stateWith([task('T04', [hash])]), repo), []);
  });
});

test('lines come in таск order and then commit order, and each passes the state validator', async () => {
  await withRepo(async repo => {
    await write(repo, 'db/migrations/0001_init.sql', 'CREATE TABLE t (id int);\n');
    const migration = commit(repo, 'migration');
    await unlink(path.join(repo, 'config/legacy.json'));
    const deletion = commit(repo, 'deletion');
    git(repo, 'mv', 'src/old-name.ts', 'src/new-name.ts');
    const rename = commit(repo, 'rename');
    const lines = await oneWayLines(stateWith([task('T01', [deletion, rename]), task('T02', [migration])]), repo);
    assert.deepEqual(lines, [
      `deleted — config/legacy.json — T01 ${short(deletion)}`,
      `renamed — src/old-name.ts → src/new-name.ts — T01 ${short(rename)}`,
      `migration — db/migrations/0001_init.sql — T02 ${short(migration)}`,
    ]);
    assert.deepEqual(validateState({ ...stateWith([]), oneWay: lines }), []);
  });
});

async function gateExit(target: string): Promise<number> {
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (() => true) as typeof process.stdout.write;
  try {
    return await runGate('one-way', () => [], target, oneWayInCommits);
  } finally {
    process.stdout.write = original;
  }
}

test('the gate fails when the review phase did not record a change the diffs show', async () => {
  await withRepo(async (repo, target) => {
    await unlink(path.join(repo, 'config/legacy.json'));
    const hash = commit(repo, 'drop the legacy config');
    const state = stateWith([task('T03', [hash])], []);

    const findings = await oneWayInCommits(state, target);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.requirementId, 'T03');
    assert.match(findings[0]?.message ?? '', /oneWay lacks "deleted — config\/legacy\.json — T03 [0-9a-f]{7}"/);

    await writeState(target, state);
    assert.equal(await gateExit(target), 1);
  });
});

test('the gate passes when every mechanical line is recorded, and a line added by judgement is allowed', async () => {
  await withRepo(async (repo, target) => {
    await unlink(path.join(repo, 'config/legacy.json'));
    const hash = commit(repo, 'drop the legacy config');
    const state = stateWith([task('T03', [hash])], [
      `deleted — config/legacy.json — T03 ${short(hash)}`,
      `migration — scripts/rewrite-prices.ts — T03 ${short(hash)}`,
    ]);
    assert.deepEqual(await oneWayInCommits(state, target), []);
    await writeState(target, state);
    assert.equal(await gateExit(target), 0);
  });
});

test('a commit git cannot show rejects, so the gate exits 2 rather than passing unread', async () => {
  await withRepo(async (_repo, target) => {
    const state = stateWith([task('T03', ['0000000000000000000000000000000000000000'])], []);
    await assert.rejects(() => oneWayInCommits(state, target));
    await writeState(target, state);
    assert.equal(await gateExit(target), 2);
  });
});

test('an explicit repository directory is used instead of the run directory\'s parent', async () => {
  await withRepo(async repo => {
    await unlink(path.join(repo, 'config/legacy.json'));
    const hash = commit(repo, 'drop');
    const elsewhere = await mkdtemp(path.join(tmpdir(), 'one-way-run-'));
    try {
      const findings = await oneWayIn(repo)(stateWith([task('T03', [hash])], []), path.join(elsewhere, '.maestro'));
      assert.deepEqual(findings.map(found => found.requirementId), ['T03']);
    } finally {
      await rm(elsewhere, { recursive: true, force: true });
    }
  });
});
