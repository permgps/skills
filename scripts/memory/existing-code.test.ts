// Whether a project already holds code, the one fact preflight decides for
// phase 3's existing-code reader. Each detection test is one row of the
// *Detection combinations* table in the plan that introduced the rule, built as
// a real project in a temporary directory; git rows commit through real git.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { GLOSSARY_FILES, GLOSSARY_MAPS, KNOWN_MEMORY_FILES, NEVER_WRITTEN } from './markers.ts';
import {
  NOT_CODE_ROOT_DIRS, NOT_CODE_ROOT_FILES, detectExistingCode, qualifies,
} from '../../skills/maestro/tools/runtime/existing-code.mts';

const run = promisify(execFile);

// The same names memory.mts passes, built from the same constants.
const IGNORED: ReadonlySet<string> = new Set(
  [...KNOWN_MEMORY_FILES, ...NEVER_WRITTEN, ...GLOSSARY_MAPS, ...GLOSSARY_FILES].map(file => path.posix.basename(file)),
);

const hasGit = spawnSync('git', ['--version']).status === 0;
const needsGit = { skip: hasGit ? false : 'git is not on PATH' };

const INSTALLED_ONLY: Record<string, string> = {
  '.maestro/README.md': '# Runs\n',
  'AGENTS.md': '# Agents\n',
  'CLAUDE.md': '# Claude\n',
  'GLOSSARY.md': '# Glossary\n',
  '.claude/skills/maestro/SKILL.md': '# Maestro\n',
  'skills-lock.json': '{}\n',
  'README.md': '# Project\n',
  'LICENSE': 'MIT\n',
  '.gitignore': 'dist/\n',
};

async function withProject(body: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'maestro-existing-code-'));
  try { await body(root); } finally { await rm(root, { recursive: true, force: true }); }
}

async function place(root: string, files: Record<string, string>): Promise<void> {
  for (const [relative, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await writeFile(path.join(root, relative), text, 'utf8');
  }
}

async function git(root: string, ...args: string[]): Promise<void> {
  await run('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args]);
}

async function commitAll(root: string): Promise<void> {
  await git(root, 'init', '-q');
  await git(root, 'add', '-A');
  await git(root, 'commit', '-q', '--allow-empty', '-m', 'init');
}

test('a fresh git init holding only .maestro reads as having no code', needsGit, async () => {
  await withProject(async root => {
    await place(root, { '.maestro/state.js': 'window.state = {};\n' });
    await git(root, 'init', '-q');
    assert.deepEqual(await detectExistingCode(root, IGNORED), { present: false, source: 'git', first: null });
  });
});

test('a project with only Maestro, memory files and an install reads as having no code', needsGit, async () => {
  await withProject(async root => {
    await place(root, INSTALLED_ONLY);
    await commitAll(root);
    assert.deepEqual(await detectExistingCode(root, IGNORED), { present: false, source: 'git', first: null });
  });
});

test('a committed source file next to the install counts as code and is named', needsGit, async () => {
  await withProject(async root => {
    await place(root, { ...INSTALLED_ONLY, 'src/app.ts': 'export {};\n' });
    await commitAll(root);
    assert.deepEqual(await detectExistingCode(root, IGNORED), { present: true, source: 'git', first: 'src/app.ts' });
  });
});

test('an untracked source file that git does not ignore counts as code', needsGit, async () => {
  await withProject(async root => {
    await place(root, INSTALLED_ONLY);
    await commitAll(root);
    await place(root, { 'src/app.ts': 'export {};\n' });
    assert.deepEqual(await detectExistingCode(root, IGNORED), { present: true, source: 'git', first: 'src/app.ts' });
  });
});

test('an ignored build directory never makes an empty project look full', needsGit, async () => {
  await withProject(async root => {
    await place(root, { '.gitignore': 'dist/\n', 'dist/bundle.js': 'console.log(1);\n' });
    await commitAll(root);
    assert.deepEqual(await detectExistingCode(root, IGNORED), { present: false, source: 'git', first: null });
  });
});

test('memory files and project glossaries deep in the tree are not code', needsGit, async () => {
  await withProject(async root => {
    await place(root, { 'docs/AGENTS.md': '# Docs\n', 'src/ordering/GLOSSARY.md': '# Terms\n' });
    await commitAll(root);
    assert.deepEqual(await detectExistingCode(root, IGNORED), { present: false, source: 'git', first: null });
  });
});

test('CI configuration alone counts as code, because it names the commands', needsGit, async () => {
  await withProject(async root => {
    await place(root, { '.github/workflows/ci.yml': 'on: push\n' });
    await commitAll(root);
    assert.deepEqual(await detectExistingCode(root, IGNORED), { present: true, source: 'git', first: '.github/workflows/ci.yml' });
  });
});

test('without a repository the walk finds the first file and stops', async () => {
  await withProject(async root => {
    await place(root, { 'index.html': '<!doctype html>\n' });
    assert.deepEqual(await detectExistingCode(root, IGNORED), { present: true, source: 'walk', first: 'index.html' });
  });
});

test('without a repository Maestro and a memory file alone read as no code', async () => {
  await withProject(async root => {
    await place(root, { '.maestro/state.js': 'window.state = {};\n', 'CLAUDE.md': '# Claude\n' });
    assert.deepEqual(await detectExistingCode(root, IGNORED), { present: false, source: 'walk', first: null });
  });
});

test('the walk does not follow a symlinked directory to the only file', async () => {
  await withProject(async root => {
    const outside = await mkdtemp(path.join(tmpdir(), 'maestro-existing-code-outside-'));
    try {
      await place(outside, { 'app.ts': 'export {};\n' });
      await symlink(outside, path.join(root, 'linked'), 'dir');
      assert.deepEqual(await detectExistingCode(root, IGNORED), { present: false, source: 'walk', first: null });
    } finally { await rm(outside, { recursive: true, force: true }); }
  });
});

test('a git that cannot be started falls back to the walk', async () => {
  await withProject(async root => {
    await place(root, { 'src/app.ts': 'export {};\n', 'README.md': '# Project\n' });
    const found = await detectExistingCode(root, IGNORED, 'maestro-no-such-git-binary');
    assert.deepEqual(found, { present: true, source: 'walk', first: 'src/app.ts' });
  });
});

test('every excluded root directory hides what is under it, and only at the root', () => {
  for (const dir of NOT_CODE_ROOT_DIRS) {
    assert.equal(qualifies(`${dir}/anything.ts`, IGNORED), false, dir);
  }
  assert.equal(qualifies('packages/web/.claude/settings.json', IGNORED), true);
});

test('DeepSeek Harness\'s project directory is a host install, not code', () => {
  assert.equal(qualifies('.dsh/skills/maestro/SKILL.md', IGNORED), false);
  assert.equal(qualifies('packages/web/.dsh/settings.json', IGNORED), true, 'only at the root');
});

test('a .git segment anywhere hides the path, which covers a submodule', () => {
  assert.equal(qualifies('vendor/lib/.git/config', IGNORED), false);
  assert.equal(qualifies('.git', IGNORED), false);
});

test('each memory file and project glossary name is not code at any depth', () => {
  for (const name of IGNORED) {
    assert.equal(qualifies(name, IGNORED), false, name);
    assert.equal(qualifies(`deep/inside/${name}`, IGNORED), false, `deep/inside/${name}`);
  }
});

test('repository meta files count as nothing at the root and as code when nested', () => {
  for (const name of [...NOT_CODE_ROOT_FILES, 'README.md', 'readme', 'LICENSE.txt', 'LICENCE', 'COPYING.LESSER']) {
    assert.equal(qualifies(name, IGNORED), false, name);
  }
  assert.equal(qualifies('packages/web/README.md', IGNORED), true);
  assert.equal(qualifies('config/.gitignore', IGNORED), true);
  assert.equal(qualifies('READMEFIRST.ts', IGNORED), true);
});

test('dot-directories other than the excluded ones are code, .github first among them', () => {
  assert.equal(qualifies('.github/workflows/ci.yml', IGNORED), true);
  assert.equal(qualifies('.vscode/settings.json', IGNORED), true);
});
