// The roadmap's "no phase uses any of these commands, as checked by grep",
// and the other half of the guard's promise: no bundle tells a прогон to
// install it.
//
// The sweep runs the guard's own `classify()` rather than a regex, so a
// command in the bundle is read exactly the way the guard would read it from
// an agent. If a phase ever prescribes `git branch -D`, the guard installed
// beside it would refuse the very step the phase asks for, and this is where
// that shows first.
//
// What it cannot see: a command described in prose ("delete the branch by
// force") rather than written in a code span or a code block. Those are read
// by people, and nothing here holds them.

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { classify, type GuardRule } from '../../skills/maestro/tools/guard-git.mts';

interface Snippet { text: string; line: number }
interface Finding { file: string; line: number; rule: GuardRule }

/** Every fenced-block line and every inline code span, with its 1-based line. */
function snippets(markdown: string): Snippet[] {
  const found: Snippet[] = [];
  let fence: string | null = null;
  markdown.split('\n').forEach((text, index) => {
    const line = index + 1;
    const marker = /^\s*(`{3,}|~{3,})/.exec(text)?.[1];
    if (marker !== undefined && (fence === null || marker.startsWith(fence))) {
      fence = fence === null ? marker : null;
      return;
    }
    if (fence !== null) { found.push({ text, line }); return; }
    for (const match of text.matchAll(/(`+)(.+?)\1/g)) found.push({ text: match[2]!.trim(), line });
  });
  return found;
}

async function markdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
}

/** Each code snippet mentioning git that the guard would refuse, by file and line. */
async function sweep(bundleDir: string): Promise<Finding[]> {
  const cwd = await mkdtemp(path.join(tmpdir(), 'guard-git-sweep-'));
  try {
    const findings: Finding[] = [];
    for (const file of await markdownFiles(bundleDir)) {
      for (const snippet of snippets(await readFile(file, 'utf8'))) {
        if (!snippet.text.includes('git')) continue;
        const verdict = classify(snippet.text, cwd);
        if (verdict.blocked) findings.push({ file: path.relative(bundleDir, file), line: snippet.line, rule: verdict.rule });
      }
    }
    return findings;
  } finally { await rm(cwd, { recursive: true, force: true }); }
}

const INSTALL_WORDS = ['guard-git', 'PreToolUse', 'settings.json'] as const;

/** Each bundle line that names the guard or the host setting that installs it. */
async function installMentions(bundleDir: string): Promise<{ file: string; line: number; word: string }[]> {
  const found: { file: string; line: number; word: string }[] = [];
  for (const file of await markdownFiles(bundleDir)) {
    (await readFile(file, 'utf8')).split('\n').forEach((text, index) => {
      for (const word of INSTALL_WORDS) {
        if (text.includes(word)) found.push({ file: path.relative(bundleDir, file), line: index + 1, word });
      }
    });
  }
  return found;
}

async function fixtureBundle(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'guard-git-bundle-'));
  for (const [relative, body] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, relative)), { recursive: true });
    await writeFile(path.join(dir, relative), body);
  }
  return dir;
}

test('the sweep finds a blocked command in a code span and in a code block, naming file and line', async () => {
  const dir = await fixtureBundle({
    'phases/5-build.md': '# Build\n\nThen run `git reset --hard` to start over.\n',
    'references/codex.md': 'Clean up:\n\n```bash\ngit worktree remove d\ngit branch -D owned\n```\n',
    'phases/6-review.md': 'Read `git show <commit> -- .` and never `git status` alone.\n',
  });
  try {
    assert.deepEqual(await sweep(dir), [
      { file: path.join('phases', '5-build.md'), line: 3, rule: 'reset-hard' },
      { file: path.join('references', 'codex.md'), line: 5, rule: 'branch-force-delete' },
    ]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('no Maestro bundle file writes a command the git guard would refuse', async () => {
  assert.deepEqual(await sweep('skills/maestro'), []);
});

test('no Scout bundle file writes a command the git guard would refuse', async () => {
  assert.deepEqual(await sweep('skills/scout'), []);
});

test('the install check finds a bundle line that names the guard or its host setting', async () => {
  const dir = await fixtureBundle({
    'phases/0-preflight.md': '# Preflight\n\nAdd a PreToolUse hook to the user settings.\n',
  });
  try {
    assert.deepEqual(await installMentions(dir), [{ file: path.join('phases', '0-preflight.md'), line: 3, word: 'PreToolUse' }]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('no bundle file names the guard, because a прогон never installs it: editing the user\'s settings is outside S5\'s boundary', async () => {
  assert.deepEqual(await installMentions('skills/maestro'), []);
  assert.deepEqual(await installMentions('skills/scout'), []);
});
