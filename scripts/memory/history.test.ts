// The commits since the last closure, as preflight reads them into prior.md.
// Each test is one row of the commits table in the plan "Where The Work Stands
// Between Прогоны" at library level: what git can say, which basis the read
// takes, and what prior.md then shows. The rows that name a flag or an exit
// are driven through sync.mts in scripts/validate/memory-sync.test.ts.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { commitsSince, headCommit } from '../../skills/maestro/tools/runtime/history.mts';
import { CHANGED_PATHS_MAX, readPriorMemory, renderPrior, type PriorMemory } from './markers.ts';

const hasGit = spawnSync('git', ['--version']).status === 0;
const needsGit = { skip: hasGit ? false : 'git is not on PATH' };
const READ_AT = new Date('2026-10-12T09:00:00Z');
const NEW_RUN = '2026-10-12-next--wip';
const CLOSED = '2026-10-01-first';

interface Repo {
  root: string;
  runRoot: string;
  git(args: string[], date?: string): string;
  commit(files: Record<string, string>, subject: string, date?: string): string;
}

async function withRepo(body: (repo: Repo) => Promise<void>, options: { git?: boolean } = { git: true }): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'maestro-history-'));
  const runRoot = path.join(root, '.maestro');
  await mkdir(path.join(runRoot, NEW_RUN), { recursive: true });
  const git = (args: string[], date = '2026-10-01T10:00:00Z'): string => {
    const done = spawnSync('git', ['-C', root, ...args], {
      encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    });
    if (done.status !== 0) throw new Error(`git ${args.join(' ')}: ${done.stderr}`);
    return done.stdout;
  };
  const repo: Repo = {
    root, runRoot, git,
    commit(files, subject, date) {
      for (const [file, text] of Object.entries(files)) {
        mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        writeFileSync(path.join(root, file), text);
      }
      git(['add', '-A']);
      git(['commit', '-q', '--allow-empty', '-m', subject], date);
      return git(['rev-parse', 'HEAD']).trim();
    },
  };
  if (options.git !== false) {
    git(['init', '-q']);
    git(['config', 'user.email', 'test@example.invalid']);
    git(['config', 'user.name', 'History Test']);
  }
  try { await body(repo); } finally { await rm(root, { recursive: true, force: true }); }
}

/** What a closing publish left: the header naming the closure, and nothing open. */
async function closure(runRoot: string, commit: string | null, closedAt = '2026-10-01T12:00:00Z'): Promise<void> {
  await writeFile(path.join(runRoot, 'PROGRESS.md'), [
    '# Where The Work Stands', '',
    `Closed ${CLOSED} on ${closedAt}, outcome completed, at commit ${commit ?? 'none'}.`, '',
    '## Settled By The User', '', 'None.', '',
    '## Not Done', '', `- [${CLOSED}#R02] R02 Exports — deferred: later`, '',
    '## Known Bugs', '', 'None.', '',
    '## Fixes Without Maestro', '', 'None.', '',
  ].join('\n'), 'utf8');
}

const sinceSection = (text: string): string => text.slice(text.indexOf('## Since The Last Closure'), text.indexOf('## Not Read') === -1 ? undefined : text.indexOf('## Not Read'));

test('with no progress file no closure is recorded, and no history is read', needsGit, () => withRepo(async repo => {
  repo.commit({ 'src/app.ts': 'export {};\n' }, 'first');
  const prior = await readPriorMemory(repo.root, repo.runRoot, NEW_RUN);
  assert.equal(prior.progress, null);
  assert.equal(prior.commits, null);
  assert.match(renderPrior(prior, READ_AT), /## Since The Last Closure\n\nNo earlier closure recorded, so no history since one was read\.\n/);
}));

test('without a git binary the history is not read, and the reason is said twice over', () => withRepo(async repo => {
  await closure(repo.runRoot, 'abc1234');
  const prior = await readPriorMemory(repo.root, repo.runRoot, NEW_RUN, { gitBinary: 'git-that-is-not-installed' });
  assert.equal(prior.commits?.state, 'unavailable');
  assert.deepEqual(prior.notRead, [{ item: 'git history', reason: 'git could not be started: ENOENT' }]);
  assert.match(renderPrior(prior, READ_AT), /## Since The Last Closure\n\nNot read: git could not be started: ENOENT\.\n/);
}, { git: false }));

test('outside a repository the history is unavailable, never an error', () => withRepo(async repo => {
  await closure(repo.runRoot, 'abc1234');
  const prior = await readPriorMemory(repo.root, repo.runRoot, NEW_RUN);
  assert.equal(prior.commits?.state, 'unavailable');
  assert.match(prior.commits?.reason ?? '', /git exited/);
}, { git: false }));

test('commits that touched only .maestro and the memory files are not code', needsGit, () => withRepo(async repo => {
  const closedAt = repo.commit({ 'src/app.ts': 'export {};\n' }, 'the closing commit');
  await closure(repo.runRoot, closedAt);
  repo.commit({ '.maestro/2026-10-01-first/decisions.md': '- kept\n', 'AGENTS.md': '# Agents\n', '.claude/CLAUDE.md': '# Claude\n' }, 'memory block', '2026-10-02T10:00:00Z');
  const history = await commitsSince(repo.root, { commit: closedAt, at: '2026-10-01T12:00:00Z', dir: CLOSED }, ['.maestro', 'AGENTS.md', 'CLAUDE.md', '.claude/CLAUDE.md', 'GEMINI.md']);
  assert.deepEqual({ state: history.state, basis: history.basis, count: history.commits.length }, { state: 'listed', basis: 'commit', count: 0 });
  const text = renderPrior(await readPriorMemory(repo.root, repo.runRoot, NEW_RUN), READ_AT);
  assert.match(text, new RegExp(`No code commits since the closure of ${CLOSED} on 2026-10-01T12:00:00Z\\.`));
}));

test('commits over code since an ancestor closure are listed newest first, with the paths they changed', needsGit, () => withRepo(async repo => {
  const closedAt = repo.commit({ 'src/app.ts': 'export {};\n' }, 'the closing commit');
  await closure(repo.runRoot, closedAt);
  const first = repo.commit({ 'src/cart.ts': 'export {};\n', 'AGENTS.md': '# Agents\n' }, 'add the cart by hand', '2026-10-03T10:00:00Z');
  const second = repo.commit({ 'src/app.ts': 'export const app = 1;\n' }, 'fix the app entry', '2026-10-04T10:00:00Z');
  const prior = await readPriorMemory(repo.root, repo.runRoot, NEW_RUN);
  assert.equal(prior.commits?.range, `${closedAt}..HEAD`);
  assert.deepEqual(prior.commits?.commits.map(commit => commit.sha), [second, first]);
  assert.deepEqual(prior.commits?.paths, ['src/app.ts', 'src/cart.ts']);
  assert.equal(sinceSection(renderPrior(prior, READ_AT)), [
    '## Since The Last Closure',
    '',
    `2 commits over code since the closure of ${CLOSED} on 2026-10-01T12:00:00Z, newest first:`,
    '',
    `- \`${second.slice(0, 7)}\` 2026-10-04 fix the app entry`,
    `- \`${first.slice(0, 7)}\` 2026-10-03 add the cart by hand`,
    '',
    '### Changed Paths',
    '',
    '- `src/app.ts`',
    '- `src/cart.ts`',
    '',
  ].join('\n'));
}));

test('a closure commit the history no longer reaches switches the read to the date, and says so', needsGit, () => withRepo(async repo => {
  const base = repo.commit({ 'src/app.ts': 'export {};\n' }, 'base', '2026-10-01T09:00:00Z');
  const lost = repo.commit({ 'src/lost.ts': 'export {};\n' }, 'the closing commit', '2026-10-01T11:00:00Z');
  await closure(repo.runRoot, lost);
  repo.git(['reset', '-q', '--hard', base]);
  const after = repo.commit({ 'src/new.ts': 'export {};\n' }, 'rebuilt by hand', '2026-10-05T10:00:00Z');
  const prior = await readPriorMemory(repo.root, repo.runRoot, NEW_RUN);
  assert.equal(prior.commits?.basis, 'date');
  assert.equal(prior.commits?.range, '--since=2026-10-01T12:00:00Z');
  assert.deepEqual(prior.commits?.commits.map(commit => commit.sha), [after]);
  assert.match(renderPrior(prior, READ_AT), new RegExp(`The commit that closure recorded, ${lost.slice(0, 12)}, is not an ancestor of HEAD .* so this reads by date: \`--since=2026-10-01T12:00:00Z\`\\.`));
}));

test('a closure that recorded no commit reads by date', needsGit, () => withRepo(async repo => {
  repo.commit({ 'src/app.ts': 'export {};\n' }, 'before', '2026-09-30T10:00:00Z');
  await closure(repo.runRoot, null);
  const after = repo.commit({ 'src/next.ts': 'export {};\n' }, 'after', '2026-10-02T10:00:00Z');
  const prior = await readPriorMemory(repo.root, repo.runRoot, NEW_RUN);
  assert.equal(prior.commits?.basis, 'date');
  assert.deepEqual(prior.commits?.commits.map(commit => commit.sha), [after]);
  assert.match(renderPrior(prior, READ_AT), /That closure recorded no commit, so this reads by date/);
}));

test('a progress file whose header names no closure is read, and its history is not', needsGit, () => withRepo(async repo => {
  repo.commit({ 'src/app.ts': 'export {};\n' }, 'first');
  await writeFile(path.join(repo.runRoot, 'PROGRESS.md'), '# Where The Work Stands\n\nsomebody rewrote the header\n', 'utf8');
  const prior = await readPriorMemory(repo.root, repo.runRoot, NEW_RUN);
  assert.equal(prior.progress?.header, null);
  assert.equal(prior.commits, null);
  assert.deepEqual(prior.notRead.map(entry => entry.item), ['.maestro/PROGRESS.md']);
}));

test('HEAD is named when git can name it, and is unavailable in an empty repository', needsGit, () => withRepo(async repo => {
  assert.ok('unavailable' in await headCommit(repo.root));
  const sha = repo.commit({ 'a.txt': 'a\n' }, 'first');
  assert.deepEqual(await headCommit(repo.root), { sha });
}));

// --- past thirty commits, rendered from a read that already happened ----------

function readWith(count: number, paths = 2): PriorMemory {
  return {
    blocks: [], glossary: { state: 'absent', files: [], bytes: 0, limit: 0 }, runs: [], notRead: [],
    progress: { text: '# Where The Work Stands\n', header: { dir: CLOSED, closedAt: '2026-10-01T12:00:00Z', outcome: 'completed', commit: 'abc1234' } },
    commits: {
      state: 'listed', basis: 'commit', range: 'abc1234..HEAD',
      commits: Array.from({ length: count }, (_, index) => ({ sha: `${String(index).padStart(7, '0')}ffff`, date: '2026-10-05T10:00:00+05:00', subject: `change ${count - index}` })),
      paths: Array.from({ length: paths }, (_, index) => `src/file-${String(index).padStart(3, '0')}.ts`),
    },
  };
}

test('past thirty commits a reader\'s summary stands in for the list', () => {
  const text = renderPrior(readWith(31), READ_AT, ['- the cart moved to src/cart', 'auth was rewritten']);
  assert.match(text, /31 commits over code since the closure of .*; a commit reader summarised them:\n\n- the cart moved to src\/cart\n- auth was rewritten\n\n### Changed Paths/);
  assert.doesNotMatch(text, /change 31/);
});

test('past thirty commits with the reader declined, the newest thirty are listed and the rest counted', () => {
  const text = renderPrior(readWith(45), READ_AT, 'declined');
  assert.match(text, /the newest 30, unsummarised:/);
  assert.match(text, /change 45\n/);
  assert.doesNotMatch(text, /change 15\n/);
  assert.match(text, /- 15 earlier commits not summarised\.\n/);
});

test('the changed paths stop at fifty and count the rest', () => {
  const text = renderPrior(readWith(1, CHANGED_PATHS_MAX + 7), READ_AT);
  assert.match(text, /- `src\/file-049\.ts`\n- and 7 more\n/);
  assert.doesNotMatch(text, /file-050/);
});

// --- the closing commit, found by its subject when the header's commit is gone --

/** The commit the memory run makes after a closure: `.maestro/` only, the fixed subject, the trailer. */
function closingCommit(repo: Repo, dir: string, date: string, note = 'closed'): string {
  writeFileSync(path.join(repo.runRoot, `closing-note-${dir}.md`), `${note}\n`);
  repo.git(['add', '--', '.maestro']);
  repo.git(['commit', '-q', '-m', `maestro: close ${dir}`, '-m', `Maestro-Run: ${dir}`, '--', '.maestro'], date);
  return repo.git(['rev-parse', 'HEAD']).trim();
}

/** Reword the root commit and replay everything after it, so every sha changes and every subject stays. */
function rewriteFromRoot(repo: Repo, root: string): void {
  const branch = repo.git(['symbolic-ref', '--short', 'HEAD']).trim();
  repo.git(['checkout', '-q', '--detach', root]);
  repo.git(['commit', '-q', '--amend', '-m', 'base, reworded'], '2026-10-01T09:00:00Z');
  const reworded = repo.git(['rev-parse', 'HEAD']).trim();
  repo.git(['rebase', '-q', '--onto', reworded, root, branch], '2026-10-06T10:00:00Z');
}

const isAncestor = (repo: Repo, sha: string): boolean =>
  spawnSync('git', ['-C', repo.root, 'merge-base', '--is-ancestor', sha, 'HEAD']).status === 0;

/** The newest commit on HEAD whose subject is exactly the closing subject of `dir`, as the test sees it. */
const closingOnHead = (repo: Repo, dir: string): string =>
  repo.git(['log', '--format=%H %s', 'HEAD']).split('\n').find(line => line.slice(41) === `maestro: close ${dir}`)!.slice(0, 40);

test('after a rebase rewrote the closure commit, the closing commit found by its subject is the basis', needsGit, () => withRepo(async repo => {
  const root = repo.commit({ 'src/app.ts': 'export {};\n' }, 'base', '2026-10-01T09:00:00Z');
  const closedAt = repo.commit({ 'src/cart.ts': 'export {};\n' }, 'the last таск', '2026-10-01T11:00:00Z');
  await closure(repo.runRoot, closedAt);
  closingCommit(repo, CLOSED, '2026-10-01T12:30:00Z');
  repo.commit({ 'src/fix.ts': 'export {};\n' }, 'a fix by hand', '2026-10-03T10:00:00Z');
  rewriteFromRoot(repo, root);
  assert.equal(isAncestor(repo, closedAt), false, 'the rewrite must leave the header commit off HEAD');
  const closing = closingOnHead(repo, CLOSED);
  const fix = repo.git(['rev-parse', 'HEAD']).trim();
  const prior = await readPriorMemory(repo.root, repo.runRoot, NEW_RUN);
  assert.equal(prior.commits?.basis, 'closing-commit');
  assert.equal(prior.commits?.range, `${closing}..HEAD`);
  assert.equal(prior.commits?.closingCommit, closing);
  assert.deepEqual(prior.commits?.commits.map(commit => commit.sha), [fix]);
  assert.deepEqual(prior.commits?.paths, ['src/fix.ts']);
  assert.equal(sinceSection(renderPrior(prior, READ_AT)), [
    '## Since The Last Closure',
    '',
    `The commit that closure recorded, ${closedAt.slice(0, 12)}, is not an ancestor of HEAD; the closing commit of ${CLOSED}, ${closing.slice(0, 12)}, is, so this reads from it: \`${closing}..HEAD\`.`,
    '',
    `1 commit over code since the closure of ${CLOSED} on 2026-10-01T12:00:00Z, newest first:`,
    '',
    `- \`${fix.slice(0, 7)}\` 2026-10-06 a fix by hand`, // the rebase's committer date
    '',
    '### Changed Paths',
    '',
    '- `src/fix.ts`',
    '',
  ].join('\n'));
}));

test('a closure that recorded no commit reads from its closing commit when HEAD carries one', needsGit, () => withRepo(async repo => {
  repo.commit({ 'src/app.ts': 'export {};\n' }, 'before', '2026-09-30T10:00:00Z');
  await closure(repo.runRoot, null);
  const closing = closingCommit(repo, CLOSED, '2026-10-01T12:30:00Z');
  const after = repo.commit({ 'src/next.ts': 'export {};\n' }, 'after', '2026-10-02T10:00:00Z');
  const history = await commitsSince(repo.root, { commit: null, at: '2026-10-01T12:00:00Z', dir: CLOSED }, ['.maestro']);
  assert.deepEqual({ basis: history.basis, range: history.range, closingCommit: history.closingCommit },
    { basis: 'closing-commit', range: `${closing}..HEAD`, closingCommit: closing });
  const prior = await readPriorMemory(repo.root, repo.runRoot, NEW_RUN);
  assert.deepEqual(prior.commits?.commits.map(commit => commit.sha), [after]);
  assert.match(renderPrior(prior, READ_AT), new RegExp(
    `That closure recorded no commit; its closing commit ${closing.slice(0, 12)} is on HEAD's history, so this reads from it: \`${closing}\\.\\.HEAD\`\\.`));
}));

test('a closing subject that appears only in a commit body is not a closing commit', needsGit, () => withRepo(async repo => {
  repo.commit({ 'src/app.ts': 'export {};\n' }, 'before', '2026-09-30T10:00:00Z');
  await closure(repo.runRoot, null);
  repo.git(['add', '-A']);
  repo.git(['commit', '-q', '-m', 'tidy the progress file', '-m', `maestro: close ${CLOSED}`], '2026-10-01T12:30:00Z');
  const after = repo.commit({ 'src/next.ts': 'export {};\n' }, 'after', '2026-10-02T10:00:00Z');
  const prior = await readPriorMemory(repo.root, repo.runRoot, NEW_RUN);
  assert.equal(prior.commits?.basis, 'date');
  assert.equal(prior.commits?.closingCommit, undefined);
  assert.deepEqual(prior.commits?.commits.map(commit => commit.sha), [after]);
  assert.match(renderPrior(prior, READ_AT), /That closure recorded no commit, so this reads by date/);
}));

test('the closing commit of another run directory is not this closure\'s, even when its name extends this one', needsGit, () => withRepo(async repo => {
  repo.commit({ 'src/app.ts': 'export {};\n' }, 'before', '2026-09-30T10:00:00Z');
  await closure(repo.runRoot, null);
  closingCommit(repo, '2026-09-01-other', '2026-10-01T12:30:00Z');
  closingCommit(repo, `${CLOSED}-again`, '2026-10-01T12:40:00Z');
  const after = repo.commit({ 'src/next.ts': 'export {};\n' }, 'after', '2026-10-02T10:00:00Z');
  const prior = await readPriorMemory(repo.root, repo.runRoot, NEW_RUN);
  assert.equal(prior.commits?.basis, 'date');
  assert.deepEqual(prior.commits?.commits.map(commit => commit.sha), [after]);
}));

test('two closing commits of the same run directory: the newest is the basis', needsGit, () => withRepo(async repo => {
  const lost = repo.commit({ 'src/app.ts': 'export {};\n' }, 'before', '2026-09-30T10:00:00Z');
  await closure(repo.runRoot, 'f'.repeat(40));
  closingCommit(repo, CLOSED, '2026-10-01T12:30:00Z', 'first');
  const between = repo.commit({ 'src/between.ts': 'export {};\n' }, 'between', '2026-10-01T15:00:00Z');
  const newest = closingCommit(repo, CLOSED, '2026-10-01T16:00:00Z', 'second');
  const after = repo.commit({ 'src/next.ts': 'export {};\n' }, 'after', '2026-10-02T10:00:00Z');
  assert.ok(lost !== newest && between !== newest);
  const prior = await readPriorMemory(repo.root, repo.runRoot, NEW_RUN);
  assert.equal(prior.commits?.basis, 'closing-commit');
  assert.equal(prior.commits?.range, `${newest}..HEAD`);
  assert.deepEqual(prior.commits?.commits.map(commit => commit.sha), [after]);
}));
