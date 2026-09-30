import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readlink, lstat, rm, symlink, rename, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { linkLocal, unlinkLocal, HOSTS, type LinkResult } from './link-local.ts';

const BUNDLE = path.join('skills', 'maestro');

/** A throwaway repository with a bundle in it and nothing else. */
async function makeRepo(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'link-local-'));
  await mkdir(path.join(root, BUNDLE), { recursive: true });
  await writeFile(path.join(root, BUNDLE, 'SKILL.md'), '# Maestro\n', 'utf8');
  return root;
}

async function withRepo(body: (root: string) => Promise<void>): Promise<void> {
  const root = await makeRepo();
  try {
    await body(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const actions = (results: LinkResult[]): string[] => results.map(r => r.action);

test('link creates one symlink per host', async () => {
  await withRepo(async root => {
    const results = await linkLocal(root);

    assert.deepEqual(actions(results), HOSTS.map(() => 'created'));
    for (const result of results) {
      const absolute = path.join(root, result.target);
      assert.equal((await lstat(absolute)).isSymbolicLink(), true);
      // Relative, so a moved checkout keeps working.
      assert.equal(path.isAbsolute(await readlink(absolute)), false);
      assert.equal(
        path.resolve(path.dirname(absolute), await readlink(absolute)),
        path.resolve(root, BUNDLE),
      );
    }
  });
});

test('link is idempotent', async () => {
  await withRepo(async root => {
    await linkLocal(root);
    const second = await linkLocal(root);
    assert.deepEqual(actions(second), HOSTS.map(() => 'unchanged'));
  });
});

test('link repoints a symlink that points somewhere else', async () => {
  await withRepo(async root => {
    // A stale link at the exact path this script owns, pointing at another
    // bundle — the case a renamed or moved skill leaves behind.
    const other = path.join(root, 'skills', 'other');
    await mkdir(other, { recursive: true });
    const linkPath = path.join(root, '.claude', 'skills', 'maestro');
    await mkdir(path.dirname(linkPath), { recursive: true });
    await symlink(path.relative(path.dirname(linkPath), other), linkPath);

    const results = await linkLocal(root, { hosts: ['.claude'] });

    assert.deepEqual(actions(results), ['relinked']);
    assert.equal(
      path.resolve(path.dirname(linkPath), await readlink(linkPath)),
      path.resolve(root, BUNDLE),
    );
  });
});

test('link refuses to replace a real directory and touches nothing', async () => {
  await withRepo(async root => {
    const occupied = path.join(root, '.claude', 'skills', 'maestro');
    await mkdir(occupied, { recursive: true });
    await writeFile(path.join(occupied, 'SKILL.md'), 'someone else\n', 'utf8');

    const results = await linkLocal(root, { hosts: ['.claude'] });

    assert.deepEqual(actions(results), ['refused']);
    assert.match(results[0]?.reason ?? '', /not a symlink/);
    assert.equal((await lstat(occupied)).isDirectory(), true);
    assert.equal((await lstat(occupied)).isSymbolicLink(), false);
  });
});

test('link fails loudly when the bundle does not exist', async () => {
  await withRepo(async root => {
    await assert.rejects(
      () => linkLocal(root, { bundle: path.join('skills', 'missing') }),
      /bundle not found/,
    );
  });
});

test('unlink removes the links it created', async () => {
  await withRepo(async root => {
    await linkLocal(root);
    const results = await unlinkLocal(root);

    assert.deepEqual(actions(results), HOSTS.map(() => 'removed'));
    for (const result of results) {
      await assert.rejects(() => lstat(path.join(root, result.target)));
    }
  });
});

test('unlink on a clean repository reports absent, not failure', async () => {
  await withRepo(async root => {
    const results = await unlinkLocal(root);
    assert.deepEqual(actions(results), HOSTS.map(() => 'absent'));
  });
});

test('unlink refuses to remove a real directory', async () => {
  await withRepo(async root => {
    const occupied = path.join(root, '.claude', 'skills', 'maestro');
    await mkdir(occupied, { recursive: true });

    const results = await unlinkLocal(root, { hosts: ['.claude'] });

    assert.deepEqual(actions(results), ['refused']);
    assert.equal((await lstat(occupied)).isDirectory(), true);
  });
});


test('Codex uses the literal canonical discovery path without touching legacy directories', async () => {
  await withRepo(async root => {
    const legacy = path.join(root, '.codex/skills/maestro');
    await mkdir(legacy, { recursive: true });
    await writeFile(path.join(legacy, 'SKILL.md'), 'user owned');
    const first = await linkLocal(root);
    assert.equal(first.find(item => item.target === '.agents/skills/maestro')?.action, 'created');
    assert.equal(first.some(item => item.target === '.codex/skills/maestro'), false);
    assert.equal((await linkLocal(root)).find(item => item.target === '.agents/skills/maestro')?.action, 'unchanged');
    await unlinkLocal(root);
    await unlinkLocal(root);
    assert.equal(await readFile(path.join(legacy, 'SKILL.md'), 'utf8'), 'user owned');
  });
});

test('shared normalized host destinations perform one link and unlink operation', async () => {
  await withRepo(async root => {
    const options = { hosts: ['.agents', './.agents', '.agents'] };
    assert.deepEqual(actions(await linkLocal(root, options)), ['created']);
    assert.deepEqual(actions(await unlinkLocal(root, options)), ['removed']);
  });
});

test('the canonical relative link survives checkout relocation', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'link-relocate-'));
  try {
    const root = path.join(parent, 'before');
    await mkdir(path.join(root, BUNDLE), { recursive: true });
    await writeFile(path.join(root, BUNDLE, 'SKILL.md'), 'relocated bundle');
    await linkLocal(root);
    const moved = path.join(parent, 'after');
    await rename(root, moved);
    assert.equal(await readFile(path.join(moved, '.agents/skills/maestro/SKILL.md'), 'utf8'), 'relocated bundle');
    assert.ok(actions(await linkLocal(moved)).every(action => action === 'unchanged'));
    await unlinkLocal(moved);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('canonical discovery refuses a user-owned directory on link and unlink', async () => {
  await withRepo(async root => {
    const occupied = path.join(root, '.agents/skills/maestro');
    await mkdir(occupied, { recursive: true });
    await writeFile(path.join(occupied, 'SKILL.md'), 'user owned');
    assert.equal((await linkLocal(root)).find(item => item.target === '.agents/skills/maestro')?.action, 'refused');
    assert.equal((await unlinkLocal(root)).find(item => item.target === '.agents/skills/maestro')?.action, 'refused');
    assert.equal(await readFile(path.join(occupied, 'SKILL.md'), 'utf8'), 'user owned');
  });
});

test('a linked installed Maestro exposes the complete autonomous runtime tree', async () => {
  const { cp } = await import('node:fs/promises');
  await withRepo(async root => {
    await cp('skills/maestro/tools', path.join(root, BUNDLE, 'tools'), { recursive: true });
    await linkLocal(root, { hosts: ['.agents'] });
    const installed = path.join(root, '.agents/skills/maestro/tools');
    assert.match(await readFile(path.join(installed, 'sync.mts'), 'utf8'), /runtime\/publication\.mts/);
    for (const file of ['state/contract', 'state/validate', 'state/verification', 'state/evidence',
      'state/projection', 'state/read', 'state/write', 'state/paths', 'shared/log',
      'publication', 'legacy', 'dashboard', 'server', 'opener']) {
      assert.ok((await readFile(path.join(installed, 'runtime', file + '.mts'), 'utf8')).length > 0);
    }
  });
});
