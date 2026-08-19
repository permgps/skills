import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readlink, lstat, rm, symlink } from 'node:fs/promises';
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
