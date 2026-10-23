import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { changedLines, runCommits } from './changed-lines.ts';

interface Repo {
  root: string;
  commit(files: Record<string, string | Buffer>, message: string): Promise<string>;
}

async function withRepo(body: (repo: Repo) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'maestro-changed-lines-'));
  const git = (args: string[]): string => {
    const done = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
    if (done.status !== 0) throw new Error(`git ${args.join(' ')}: ${done.stderr}`);
    return done.stdout;
  };
  git(['init', '-q']);
  git(['config', 'user.email', 'test@example.invalid']);
  git(['config', 'user.name', 'Changed Lines Test']);
  const repo: Repo = {
    root,
    async commit(files, message) {
      for (const [file, content] of Object.entries(files)) await writeFile(path.join(root, file), content);
      git(['add', '-A']);
      git(['commit', '-q', '--allow-empty', '-m', message]);
      return git(['rev-parse', 'HEAD']).trim();
    },
  };
  try { await body(repo); } finally { await rm(root, { recursive: true, force: true }); }
}

test('a commit of three insertions and two deletions changed five lines', async () => {
  await withRepo(async repo => {
    await repo.commit({ 'a.txt': 'one\ntwo\nthree\n' }, 'base');
    const sha = await repo.commit({ 'a.txt': 'one\n4\n5\n6\n' }, 'change');
    assert.deepEqual(await changedLines(repo.root, [sha]), { lines: 5, binaryFiles: 0, unreadable: [] });
  });
});

test('the commits of one таск add up', async () => {
  await withRepo(async repo => {
    const first = await repo.commit({ 'a.txt': 'a\nb\n' }, 'first');
    const second = await repo.commit({ 'b.txt': 'c\n' }, 'second');
    assert.equal((await changedLines(repo.root, [first, second])).lines, 3);
  });
});

test('a binary file adds no lines and is counted apart', async () => {
  await withRepo(async repo => {
    const sha = await repo.commit({ 'image.bin': Buffer.from([0, 1, 2, 0, 255]), 'a.txt': 'x\n' }, 'binary');
    assert.deepEqual(await changedLines(repo.root, [sha]), { lines: 1, binaryFiles: 1, unreadable: [] });
  });
});

test('an unknown sha and a value that is not a sha are reported unreadable, never counted as zero', async () => {
  await withRepo(async repo => {
    const sha = await repo.commit({ 'a.txt': 'x\n' }, 'one');
    const missing = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
    const result = await changedLines(repo.root, [sha, missing, '--output=/tmp/x']);
    assert.deepEqual(result, { lines: 1, binaryFiles: 0, unreadable: [missing, '--output=/tmp/x'] });
  });
});

test('a project with no repository reports every commit unreadable', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'maestro-changed-lines-'));
  try {
    const sha = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
    assert.deepEqual(await changedLines(root, [sha]), { lines: 0, binaryFiles: 0, unreadable: [sha] });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the run\'s commits are found by their trailer, and a run whose dir is a prefix of another is kept apart', async () => {
  await withRepo(async repo => {
    const task = await repo.commit({ 'a.txt': 'x\n' }, '01 Engine\n\nMaestro-Run: run-2026-10-23\nRequirements: R01');
    const closing = await repo.commit({ 'b.txt': 'y\n' }, 'maestro: close run-2026-10-23\n\nMaestro-Run: run-2026-10-23');
    await repo.commit({ 'c.txt': 'z\n' }, '01 Other\n\nMaestro-Run: run-2026-10-2\nRequirements: R01');
    await repo.commit({ 'd.txt': 'w\n' }, '01 Dotted\n\nMaestro-Run: run-2026-10-23x');
    const found = await runCommits(repo.root, 'run-2026-10-23');
    assert.ok('shas' in found);
    assert.deepEqual([...found.shas].sort(), [task, closing].sort());
  });
});

test('a dir with regex characters is matched literally', async () => {
  await withRepo(async repo => {
    const sha = await repo.commit({ 'a.txt': 'x\n' }, 'one\n\nMaestro-Run: run.1');
    await repo.commit({ 'b.txt': 'y\n' }, 'two\n\nMaestro-Run: runX1');
    assert.deepEqual(await runCommits(repo.root, 'run.1'), { shas: [sha] });
  });
});
