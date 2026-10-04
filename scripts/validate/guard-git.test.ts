// Holds the optional git guard: what it reads out of a command line, what it
// blocks, what it lets through, and what it answers Claude Code. The guard
// ships in the bundle but is installed only by the user, so these tests are the
// whole of what `npm run check` knows about it; whether Claude Code actually
// calls it is held by the dated record in docs/install.md and nothing here.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { classify, denyReason, GUARD_RULES, type GuardRule } from '../../skills/maestro/tools/guard-git.mts';

/** A directory with nothing in it, so no positional word is mistaken for a path. */
async function emptyDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'guard-git-empty-'));
}

function ruleOf(command: string, cwd: string): GuardRule | null {
  const verdict = classify(command, cwd);
  return verdict.blocked ? verdict.rule : null;
}

function assertBlocked(rows: readonly (readonly [string, GuardRule])[], cwd: string): void {
  for (const [command, rule] of rows) {
    assert.equal(ruleOf(command, cwd), rule, `expected ${rule} for: ${command}`);
  }
}

function assertAllowed(commands: readonly string[], cwd: string): void {
  for (const command of commands) {
    assert.equal(ruleOf(command, cwd), null, `expected allowed: ${command}`);
  }
}

test('every push is blocked, whatever its flags or refspec', async () => {
  const cwd = await emptyDir();
  try {
    assertBlocked([
      ['git push', 'push'],
      ['git push --force origin main', 'push'],
      ['git push --force-with-lease', 'push'],
      ['git push origin :old', 'push'],
      ['git push --mirror', 'push'],
    ], cwd);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('reset is blocked with --hard and allowed without it', async () => {
  const cwd = await emptyDir();
  try {
    assertBlocked([
      ['git reset --hard', 'reset-hard'],
      ['git reset --hard HEAD~2', 'reset-hard'],
    ], cwd);
    assertAllowed(['git reset --soft HEAD~1', 'git reset HEAD a.ts', 'git reset'], cwd);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('clean is blocked whenever it is forced, a dry run included, and allowed as a dry run alone', async () => {
  const cwd = await emptyDir();
  try {
    assertBlocked([
      ['git clean -f', 'clean-force'],
      ['git clean -xdf', 'clean-force'],
      ['git clean --force', 'clean-force'],
      ['git clean -fn', 'clean-force'],
    ], cwd);
    assertAllowed(['git clean -n', 'git clean -nd'], cwd);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('a branch deleted by force is blocked and a merged-only delete is allowed', async () => {
  const cwd = await emptyDir();
  try {
    assertBlocked([
      ['git branch -D t', 'branch-force-delete'],
      ['git branch -Dr t', 'branch-force-delete'],
      ['git branch -df t', 'branch-force-delete'],
      ['git branch --delete --force t', 'branch-force-delete'],
      ['git branch -d -f t', 'branch-force-delete'],
    ], cwd);
    assertAllowed(['git branch -d t', 'git branch --delete t', 'git branch -f t main', 'git branch'], cwd);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('a checkout that names paths, forces or patches is blocked by its syntax alone', async () => {
  const cwd = await emptyDir();
  try {
    assertBlocked([
      ['git checkout -- a.ts', 'discarding-checkout'],
      ['git checkout HEAD -- a.ts', 'discarding-checkout'],
      ['git checkout .', 'discarding-checkout'],
      ['git checkout src/.', 'discarding-checkout'],
      ['git checkout -f main', 'discarding-checkout'],
      ['git checkout --force main', 'discarding-checkout'],
      ['git checkout -p', 'discarding-checkout'],
      ['git checkout --theirs a.ts', 'discarding-checkout'],
      ['git checkout --ours a.ts', 'discarding-checkout'],
      ["git checkout 'src/*.ts'", 'discarding-checkout'],
      ['git checkout :/a.ts', 'discarding-checkout'],
      ['git checkout --pathspec-from-file=list.txt', 'discarding-checkout'],
    ], cwd);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('an ambiguous checkout is decided by whether the word exists on disk', async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'guard-git-tree-'));
  try {
    await mkdir(path.join(cwd, 'src'));
    await writeFile(path.join(cwd, 'src', 'app.ts'), 'export {};\n');
    assertBlocked([
      ['git checkout src/app.ts', 'discarding-checkout'],
      ['git checkout src', 'discarding-checkout'],
      ['cd src && git checkout app.ts', 'discarding-checkout'],
      ['git -C src checkout app.ts', 'discarding-checkout'],
      ['git checkout main src/app.ts', 'discarding-checkout'],
    ], cwd);
    assertAllowed([
      'git checkout main',
      'git checkout -b feature main',
      'git checkout -b src',
      'git checkout --orphan src',
      'cd src && git checkout main',
    ], cwd);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('switch is blocked when it discards changes and allowed when it only moves', async () => {
  const cwd = await emptyDir();
  try {
    assertBlocked([
      ['git switch --discard-changes main', 'discarding-switch'],
      ['git switch -f main', 'discarding-switch'],
      ['git switch --force main', 'discarding-switch'],
    ], cwd);
    assertAllowed(['git switch main', 'git switch -c feature', 'git switch -'], cwd);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('restore is allowed only when it touches the index and not the working tree', async () => {
  const cwd = await emptyDir();
  try {
    assertBlocked([
      ['git restore a.ts', 'discarding-restore'],
      ['git restore -W a.ts', 'discarding-restore'],
      ['git restore -SW a.ts', 'discarding-restore'],
      ['git restore --staged --worktree a.ts', 'discarding-restore'],
      ['git restore --source=HEAD~1 a.ts', 'discarding-restore'],
    ], cwd);
    assertAllowed(['git restore --staged a.ts', 'git restore -S a.ts'], cwd);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('a blocked command is found behind separators, assignments, wrappers and global options', async () => {
  const cwd = await emptyDir();
  try {
    assertBlocked([
      ['cd x && git push', 'push'],
      ['echo ok; git reset --hard', 'reset-hard'],
      ['true || git push', 'push'],
      ['ls | git push', 'push'],
      ['git status |& git push', 'push'],
      ['(git push)', 'push'],
      ['FOO=1 git push', 'push'],
      ['FOO=1 BAR="a b" git push', 'push'],
      ['env -i git push', 'push'],
      ['env -u HOME FOO=1 git push', 'push'],
      ['sudo -u me git push', 'push'],
      ['nohup git push &', 'push'],
      ['nice -n 5 git push', 'push'],
      ['timeout 5 git push', 'push'],
      ['timeout -s KILL 5s git push', 'push'],
      ['xargs git push', 'push'],
      ['xargs -I {} git push {}', 'push'],
      ['command git push', 'push'],
      ['exec git push', 'push'],
      ['time git push', 'push'],
      ['time -p git push', 'push'],
      ['/usr/bin/time -f %e -o t.txt git push', 'push'],
      ['/usr/bin/git push', 'push'],
      ['git -C ../x push', 'push'],
      ['git -c a=b push', 'push'],
      ['git --git-dir=.git push', 'push'],
      ['git --git-dir .git --work-tree . push', 'push'],
      ['git --no-pager push', 'push'],
      ['git push > out.txt 2>&1', 'push'],
      ['git 2>/dev/null push', 'push'],
    ], cwd);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('a blocked command is found inside a nested shell, eval and command substitution', async () => {
  const cwd = await emptyDir();
  try {
    assertBlocked([
      ["bash -c 'git push --force'", 'push'],
      ['sh -lc "git reset --hard"', 'reset-hard'],
      ['zsh -c "cd x && git clean -fd"', 'clean-force'],
      ['eval git push', 'push'],
      ["eval 'git push'", 'push'],
      ['echo $(git push)', 'push'],
      ['echo `git push`', 'push'],
      ['echo "$(git clean -f)"', 'clean-force'],
      ['echo "`git reset --hard`"', 'reset-hard'],
      ['echo $(echo $(git push))', 'push'],
    ], cwd);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('a blocked command is found inside reserved words and on a later line', async () => {
  const cwd = await emptyDir();
  try {
    assertBlocked([
      ['{ git push; }', 'push'],
      ['if true; then git push; fi', 'push'],
      ['while false; do git reset --hard; done', 'reset-hard'],
      ['! git push', 'push'],
      ['echo first\ngit push', 'push'],
      ['git \\\npush', 'push'],
    ], cwd);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('the commands the phases and the runtime use are allowed', async () => {
  const cwd = await emptyDir();
  try {
    assertAllowed([
      'git status',
      'git status --porcelain',
      'git init',
      'git show abc -- .',
      'git show <commit> -- .',
      'git show --name-status --format= -M abc',
      'git worktree add -b t /abs/t main',
      'git worktree add -b <owned-task-branch> <absolute-owned-workspace> <integrated-base>',
      'git rev-parse --show-toplevel',
      'git ls-files --error-unmatch -- a.ts',
      'git mv -- a b',
      'git merge t',
      'git add -A && git commit -m "push the button"',
      'git archive HEAD',
      'git log --oneline -20',
    ], cwd);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('words that only mention git are not git', async () => {
  const cwd = await emptyDir();
  try {
    assertAllowed([
      'git log --grep=push',
      'echo "git push"',
      "echo 'git reset --hard'",
      'grep -rn "reset --hard" .',
      'npm run push',
      'gitk',
      'legit push',
      'printf "%s\\n" "git clean -f"',
      "echo '$(git push)'",
    ], cwd);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('a here-document body is text, not commands, and the command after it is read', async () => {
  const cwd = await emptyDir();
  try {
    assertAllowed([
      "git commit -m \"$(cat <<'EOF'\nguard: git push is blocked now\ngit reset --hard too\nEOF\n)\"",
      'cat <<-EOF > notes.txt\n\tgit push\n\tEOF',
      'cat <<< "git push"',
    ], cwd);
    assertBlocked([
      ['cat <<EOF\ngit status\nEOF\ngit push', 'push'],
    ], cwd);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('the neighbouring destructive forms are pinned as allowed, so widening the list is a decision', async () => {
  const cwd = await emptyDir();
  try {
    assertAllowed([
      'git rebase -i main',
      'git commit --amend',
      'git stash drop',
      'git stash clear',
      'git reset --merge',
      'git reset --keep HEAD~1',
      'git checkout -B x',
      'git switch -C x',
      'git branch -M x',
      'git worktree remove --force d',
      'git filter-branch --tree-filter true',
      'git update-ref -d refs/heads/x',
      'git reflog expire --expire=now --all',
    ], cwd);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('a script a shell reads from stdin is not read, as docs/install.md states among the limits', async () => {
  const cwd = await emptyDir();
  try {
    assertAllowed([
      'echo "git push" | sh',
      'bash <<EOF\ngit push\nEOF',
      'bash < deploy.sh',
    ], cwd);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('an unterminated quote does not throw and does not hide the command before it', async () => {
  const cwd = await emptyDir();
  try {
    assertBlocked([
      ["git push 'oops", 'push'],
      ['git push "oops', 'push'],
      ['echo $(git push', 'push'],
    ], cwd);
    assertAllowed(["echo 'git push"], cwd);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('an empty command is allowed and reads no segment', async () => {
  const cwd = await emptyDir();
  try {
    assert.deepEqual(classify('', cwd), { blocked: false, segments: 0 });
    assert.deepEqual(classify('   \n ; ', cwd), { blocked: false, segments: 0 });
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('the first blocked segment in reading order is the one reported', async () => {
  const cwd = await emptyDir();
  try {
    assert.deepEqual(classify('git reset --hard; git push', cwd), { blocked: true, rule: 'reset-hard', subcommand: 'reset' });
    assert.deepEqual(classify('git status && git clean -f && git push', cwd), { blocked: true, rule: 'clean-force', subcommand: 'clean' });
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('an allowed verdict counts every simple command it read, nested ones included', async () => {
  const cwd = await emptyDir();
  try {
    assert.deepEqual(classify('git status && echo $(git log -1)', cwd), { blocked: false, segments: 3 });
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('a deny reason names the rule and never repeats any word of the command', () => {
  const command = 'git push https://u:SECRET@h/r';
  for (const rule of Object.keys(GUARD_RULES) as GuardRule[]) {
    const reason = denyReason(rule);
    assert.ok(reason.includes(GUARD_RULES[rule]), `reason for ${rule} names the rule`);
    assert.ok(!reason.includes('SECRET'), `reason for ${rule} carries no command text`);
    assert.ok(!reason.includes('https://'), `reason for ${rule} carries no command text`);
  }
  assert.ok(!command.includes(denyReason('push')));
});

// ── The hook contract, through a real Node process ─────────────────────────

const GUARD = path.resolve('skills/maestro/tools/guard-git.mts');

interface HookRun { status: number; out: string; err: string }

function hook(input: string, env: Record<string, string> = {}, script = GUARD): HookRun {
  const done = spawnSync(process.execPath, [script], {
    input,
    encoding: 'utf8',
    env: { ...process.env, LOG_LEVEL: 'INFO', MAESTRO_GUARD_DEBUG: '', ...env },
  });
  return { status: done.status ?? -1, out: done.stdout ?? '', err: done.stderr ?? '' };
}

function bash(command: string, cwd?: string): string {
  return JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, ...(cwd ? { cwd } : {}) });
}

function denial(out: string): { hookEventName: string; permissionDecision: string; permissionDecisionReason: string } {
  const lines = out.split('\n').filter(Boolean);
  assert.equal(lines.length, 1, 'stdout is exactly one JSON line');
  return (JSON.parse(lines[0]!) as { hookSpecificOutput: { hookEventName: string; permissionDecision: string; permissionDecisionReason: string } }).hookSpecificOutput;
}

test('a blocked Bash call is denied on stdout with exit 0, naming the rule', () => {
  const run = hook(bash('git push --force origin main'));
  assert.equal(run.status, 0);
  const output = denial(run.out);
  assert.equal(output.hookEventName, 'PreToolUse');
  assert.equal(output.permissionDecision, 'deny');
  assert.equal(output.permissionDecisionReason, denyReason('push'));
  assert.match(run.err, /INFO \[guard-git\.decision\] blocked \{"rule":"push","subcommand":"push"\}/);
});

test('an allowed Bash call prints nothing, because printing allow would skip the user\'s permission prompt', () => {
  const run = hook(bash('git status && npm test'));
  assert.equal(run.status, 0);
  assert.equal(run.out, '');
});

test('a call to another tool is ignored with exit 0 and nothing on stdout', () => {
  const run = hook(JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: 'a.ts' } }), { MAESTRO_GUARD_DEBUG: '1' });
  assert.equal(run.status, 0);
  assert.equal(run.out, '');
  assert.match(run.err, /DEBUG \[guard-git\.payload\] tool ignored \{"tool":"Edit"\}/);
});

test('a payload the guard cannot read exits 2 with one sentence on stderr and nothing on stdout', () => {
  const cases: [string, string][] = [
    ['not json at all', 'not json'],
    ['', 'empty'],
    ['[1, 2]', 'not json'],
    [JSON.stringify({ tool_name: 'Bash', tool_input: {} }), 'no command'],
    [JSON.stringify({ tool_name: 'Bash', tool_input: { command: 7 } }), 'no command'],
  ];
  for (const [input, reason] of cases) {
    const run = hook(input);
    assert.equal(run.status, 2, `exit 2 for ${reason}`);
    assert.equal(run.out, '', `stdout empty for ${reason}`);
    assert.match(run.err, new RegExp(`WARN \\[guard-git\\.payload\\] unreadable \\{"reason":"${reason}"\\}`));
    assert.equal(run.err.split('\n').filter((line) => line.startsWith('guard-git:')).length, 1, `one sentence for ${reason}`);
  }
});

test('the payload cwd decides whether a checkout word names a file', async () => {
  const withFile = await mkdtemp(path.join(tmpdir(), 'guard-git-cwd-'));
  const without = await mkdtemp(path.join(tmpdir(), 'guard-git-cwd-'));
  try {
    await writeFile(path.join(withFile, 'a.ts'), 'export {};\n');
    assert.equal(denial(hook(bash('git checkout a.ts', withFile)).out).permissionDecision, 'deny');
    const allowed = hook(bash('git checkout a.ts', without));
    assert.equal(allowed.status, 0);
    assert.equal(allowed.out, '');
  } finally {
    await rm(withFile, { recursive: true, force: true });
    await rm(without, { recursive: true, force: true });
  }
});

test('no word of a blocked command reaches stdout or stderr, even at DEBUG', () => {
  const run = hook(bash('git push https://u:SECRET@h/r'), { MAESTRO_GUARD_DEBUG: '1' });
  assert.equal(run.status, 0);
  assert.equal(denial(run.out).permissionDecision, 'deny');
  assert.match(run.err, /DEBUG/);
  assert.ok(!run.out.includes('SECRET') && !run.err.includes('SECRET'));
  assert.ok(!run.out.includes('https://') && !run.err.includes('https://'));
});

test('an installed copy runs with no package.json, no PATH, and through a symlink', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'guard git installed '));
  try {
    const tools = path.join(root, 'project', '.claude', 'skills', 'maestro', 'tools');
    await mkdir(path.join(tools, 'runtime', 'shared'), { recursive: true });
    await copyFile(GUARD, path.join(tools, 'guard-git.mts'));
    await copyFile(path.resolve('skills/maestro/tools/runtime/shared/log.mts'), path.join(tools, 'runtime', 'shared', 'log.mts'));
    const sealed = { PATH: '', NODE_OPTIONS: '' };
    const copied = hook(bash('git reset --hard'), sealed, path.join(tools, 'guard-git.mts'));
    assert.equal(copied.status, 0, copied.err);
    assert.equal(denial(copied.out).permissionDecisionReason, denyReason('reset-hard'));
    const link = path.join(root, 'linked-guard.mts');
    await symlink(path.join(tools, 'guard-git.mts'), link);
    const linked = hook(bash('git clean -fd'), sealed, link);
    assert.equal(linked.status, 0, linked.err);
    assert.equal(denial(linked.out).permissionDecisionReason, denyReason('clean-force'));
  } finally { await rm(root, { recursive: true, force: true }); }
});
