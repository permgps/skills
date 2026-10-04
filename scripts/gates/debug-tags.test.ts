import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { runGate } from './cli.ts';
import { debugTagsIn, debugTagsInCommits, findDebugTags, DEBUG_TAG } from './debug-tags.ts';
import { writeState } from '../state/write.ts';
import { type RunState, type TaskEntry } from '../state/contract.ts';

// --- the pure half: a diff in, the tags it leaves behind out -----------------

/** One commit's diff that touches `file`, adding and removing the given lines. */
function diffOf(file: string, added: string[], removed: string[] = []): string {
  return [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -1,${removed.length} +1,${added.length} @@`,
    ...removed.map(line => `-${line}`),
    ...added.map(line => `+${line}`),
    '',
  ].join('\n');
}

const TAGGED = "console.log('totals', rows); // [maestro-debug:DF-4]";

test('an added tagged line is left behind', () => {
  assert.deepEqual(findDebugTags([{ commit: 'aaa1111', diff: diffOf('src/orders.ts', [TAGGED]) }]), [
    { commit: 'aaa1111', path: 'src/orders.ts', tagId: 'DF-4' },
  ]);
});

test('a tag the same таск removes in a later commit is not left behind', () => {
  assert.deepEqual(findDebugTags([
    { commit: 'aaa1111', diff: diffOf('src/orders.ts', [TAGGED]) },
    { commit: 'bbb2222', diff: diffOf('src/orders.ts', [], [TAGGED]) },
  ]), []);
});

test('removing a tagged line nobody added in these commits clears nothing and reports nothing', () => {
  assert.deepEqual(findDebugTags([
    { commit: 'aaa1111', diff: diffOf('src/orders.ts', [], [TAGGED]) },
    { commit: 'bbb2222', diff: diffOf('src/orders.ts', [TAGGED]) },
  ]), [{ commit: 'bbb2222', path: 'src/orders.ts', tagId: 'DF-4' }]);
});

test('file headers are not lines, even when a path carries the tag', () => {
  const header = 'odd[maestro-debug:DF-1].ts';
  assert.deepEqual(findDebugTags([{ commit: 'aaa1111', diff: diffOf(header, ['const a = 1;']) }]), []);
});

test('an added line that itself begins with "++" is a line, not a header', () => {
  assert.deepEqual(findDebugTags([{ commit: 'aaa1111', diff: diffOf('a.c', ['++count; // [maestro-debug:DF-7]']) }]), [
    { commit: 'aaa1111', path: 'a.c', tagId: 'DF-7' },
  ]);
});

test('deleting the file that held the tag clears it', () => {
  const deleted = ['diff --git a/a.ts b/a.ts', 'deleted file mode 100644', '--- a/a.ts', '+++ /dev/null',
    '@@ -1 +0,0 @@', `-${TAGGED}`, ''].join('\n');
  assert.deepEqual(findDebugTags([
    { commit: 'aaa1111', diff: diffOf('a.ts', [TAGGED]) },
    { commit: 'bbb2222', diff: deleted },
  ]), []);
});

test('a tag whose id is not a DF-N is still debug output left behind', () => {
  assert.deepEqual(
    findDebugTags([{ commit: 'aaa1111', diff: diffOf('a.ts', ['print(x)  # [maestro-debug:totals]']) }]),
    [{ commit: 'aaa1111', path: 'a.ts', tagId: 'malformed' }],
  );
});

test('two identical tagged lines count twice, and one removal leaves one', () => {
  assert.equal(findDebugTags([
    { commit: 'aaa1111', diff: diffOf('a.ts', [TAGGED, TAGGED]) },
    { commit: 'bbb2222', diff: diffOf('a.ts', [], [TAGGED]) },
  ]).length, 1);
});

test('a line moved with different indentation still matches its removal', () => {
  assert.deepEqual(findDebugTags([
    { commit: 'aaa1111', diff: diffOf('a.ts', [`  ${TAGGED}`]) },
    { commit: 'bbb2222', diff: diffOf('a.ts', [], [`    ${TAGGED}  `]) },
  ]), []);
});

test('an untagged diff is clean', () => {
  assert.deepEqual(findDebugTags([{ commit: 'aaa1111', diff: diffOf('a.ts', ["console.log('ready')"]) }]), []);
  assert.equal(DEBUG_TAG, '[maestro-debug:');
});

// --- the git half: a run's state and a real repository -----------------------

function git(repo: string, ...args: string[]): string {
  return execFileSync('git', ['-C', repo, '-c', 'user.name=maestro', '-c', 'user.email=maestro@example.invalid',
    '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim();
}

async function commitFile(repo: string, file: string, body: string): Promise<string> {
  await mkdir(path.dirname(path.join(repo, file)), { recursive: true });
  await writeFile(path.join(repo, file), body, 'utf8');
  git(repo, 'add', '--', file);
  git(repo, 'commit', '--quiet', '--no-verify', '-m', `write ${file}`);
  return git(repo, 'rev-parse', 'HEAD');
}

function task(id: string, commits: string[]): TaskEntry {
  return { id, title: `таск ${id}`, requirementIds: ['R01'], status: 'review', blockedBy: [], wave: 1, zone: [],
    files: [], retries: 0, repairs: 0, handoffs: 0, commits };
}

function stateWith(tasks: TaskEntry[]): RunState {
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
  };
}

/** A project repository with one base commit and a run directory inside it. */
async function withRepo(body: (repo: string, target: string) => Promise<void>): Promise<void> {
  const repo = await mkdtemp(path.join(tmpdir(), 'debug-tags-'));
  try {
    git(repo, 'init', '--quiet');
    await commitFile(repo, 'README.md', '# orders\n');
    await mkdir(path.join(repo, '.maestro'));
    await body(repo, path.join(repo, '.maestro'));
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
}

async function gateExit(target: string): Promise<number> {
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (() => true) as typeof process.stdout.write;
  try {
    return await runGate('debug-tags', () => [], target, debugTagsInCommits);
  } finally {
    process.stdout.write = original;
  }
}

test('a таск whose commit leaves a tag is one finding naming the таск, the path and the id — never the line', async () => {
  await withRepo(async (repo, target) => {
    const secretLine = "console.log('token', 'sk-live-0000'); // [maestro-debug:DF-4]";
    const added = await commitFile(repo, 'src/orders.ts', `export const total = 1;\n${secretLine}\n`);
    const state = stateWith([task('03', [added])]);

    const findings = await debugTagsInCommits(state, target);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.requirementId, '03');
    assert.match(findings[0]?.message ?? '', /таск 03 leaves \[maestro-debug:DF-4\] in src\/orders\.ts/);
    assert.ok(!(findings[0]?.message ?? '').includes('sk-live'), 'the tagged line must not travel');

    await writeState(target, state);
    assert.equal(await gateExit(target), 1);
  });
});

test('the same таск removing its tag in a later commit passes', async () => {
  await withRepo(async (repo, target) => {
    const added = await commitFile(repo, 'src/orders.ts', "export const total = 1;\nconsole.log(1); // [maestro-debug:DF-4]\n");
    const removed = await commitFile(repo, 'src/orders.ts', 'export const total = 1;\n');
    const state = stateWith([task('03', [added, removed])]);

    assert.deepEqual(await debugTagsInCommits(state, target), []);
    await writeState(target, state);
    assert.equal(await gateExit(target), 0);
  });
});

test('another таск removing the tag does not clear it for the таск that added it', async () => {
  await withRepo(async (repo, target) => {
    const added = await commitFile(repo, 'src/orders.ts', "console.log(1); // [maestro-debug:DF-4]\n");
    const removed = await commitFile(repo, 'src/orders.ts', 'export {};\n');
    const findings = await debugTagsInCommits(stateWith([task('03', [added]), task('04', [removed])]), target);
    assert.deepEqual(findings.map(found => found.requirementId), ['03']);
  });
});

test('a commit git cannot show rejects, so the gate exits 2 rather than passing unread', async () => {
  await withRepo(async (_repo, target) => {
    const state = stateWith([task('03', ['0000000000000000000000000000000000000000'])]);
    await assert.rejects(() => debugTagsInCommits(state, target));
    await writeState(target, state);
    assert.equal(await gateExit(target), 2);
  });
});

test('an explicit repository directory is used instead of the run directory\'s parent', async () => {
  await withRepo(async (repo, target) => {
    const added = await commitFile(repo, 'a.ts', "print(1) // [maestro-debug:DF-2]\n");
    const elsewhere = await mkdtemp(path.join(tmpdir(), 'debug-tags-run-'));
    try {
      const findings = await debugTagsIn(repo)(stateWith([task('01', [added])]), path.join(elsewhere, '.maestro'));
      assert.deepEqual(findings.map(found => found.requirementId), ['01']);
    } finally {
      await rm(elsewhere, { recursive: true, force: true });
    }
  });
});
