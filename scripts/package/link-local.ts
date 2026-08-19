#!/usr/bin/env node
// Puts the skill bundle where the local agents look for it, by symlink, so the
// repository can run its own skill while developing it.
//
// The links are never committed: .gitignore excludes .claude/, .codex/ and
// .gemini/ wholesale, and punching a hole in that rule to track three symlinks
// would trade a real protection for a convenience a script already provides.

import { lstat, mkdir, readlink, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createLogger } from '../shared/log.ts';

const log = createLogger('link-local');

/** Agent directories that look for skills in `<dir>/skills/<name>`. */
export const HOSTS = ['.claude', '.codex', '.gemini'];

export const BUNDLE = path.join('skills', 'maestro');

export type LinkAction =
  | 'created'    // the link did not exist and now does
  | 'relinked'   // a symlink existed but pointed somewhere else
  | 'unchanged'  // the link already pointed where it should
  | 'refused'    // something real is in the way; nothing was touched
  | 'removed'    // the link existed and is gone
  | 'absent';    // there was nothing to remove

export interface LinkResult {
  host: string;
  /** Link path, relative to the repository root. */
  target: string;
  action: LinkAction;
  reason?: string;
}

const linkPathFor = (host: string, bundle: string): string =>
  path.join(host, 'skills', path.basename(bundle));

/** lstat that answers "what is here", never throwing for an empty slot. */
async function inspect(absolute: string): Promise<'symlink' | 'other' | 'nothing'> {
  try {
    const stats = await lstat(absolute);
    return stats.isSymbolicLink() ? 'symlink' : 'other';
  } catch {
    return 'nothing';
  }
}

export interface LinkOptions {
  hosts?: string[];
  bundle?: string;
}

/**
 * Create one symlink per host. Existing symlinks are repointed; anything that is
 * not a symlink is left exactly as found and reported as refused — a real
 * directory of somebody's own skills is not this script's to delete.
 */
export async function linkLocal(root: string, options: LinkOptions = {}): Promise<LinkResult[]> {
  const hosts = options.hosts ?? HOSTS;
  const bundle = options.bundle ?? BUNDLE;
  const results: LinkResult[] = [];

  const bundleAbsolute = path.resolve(root, bundle);
  if ((await inspect(bundleAbsolute)) === 'nothing') {
    throw new Error(`bundle not found: ${bundle}`);
  }

  for (const host of hosts) {
    const target = linkPathFor(host, bundle);
    const absolute = path.resolve(root, target);
    const kind = await inspect(absolute);

    if (kind === 'other') {
      const reason = 'path exists and is not a symlink';
      log.warn('link', 'refusing to replace an existing path', { target, reason });
      results.push({ host, target, action: 'refused', reason });
      continue;
    }

    // Relative, so the link keeps working if the checkout is moved.
    const relative = path.relative(path.dirname(absolute), bundleAbsolute);

    if (kind === 'symlink') {
      const current = await readlink(absolute);
      if (current === relative) {
        log.debug('link', 'link already points at the bundle', { target });
        results.push({ host, target, action: 'unchanged' });
        continue;
      }
      log.info('link', 'repointing an existing symlink', { target, from: current, to: relative });
      await rm(absolute);
      await symlink(relative, absolute);
      results.push({ host, target, action: 'relinked' });
      continue;
    }

    log.info('link', 'creating symlink', { target, to: relative });
    await mkdir(path.dirname(absolute), { recursive: true });
    await symlink(relative, absolute);
    results.push({ host, target, action: 'created' });
  }

  return results;
}

/** Remove the links this script created. Never removes a real directory. */
export async function unlinkLocal(root: string, options: LinkOptions = {}): Promise<LinkResult[]> {
  const hosts = options.hosts ?? HOSTS;
  const bundle = options.bundle ?? BUNDLE;
  const results: LinkResult[] = [];

  for (const host of hosts) {
    const target = linkPathFor(host, bundle);
    const absolute = path.resolve(root, target);
    const kind = await inspect(absolute);

    if (kind === 'nothing') {
      log.debug('unlink', 'nothing to remove', { target });
      results.push({ host, target, action: 'absent' });
      continue;
    }
    if (kind === 'other') {
      const reason = 'path exists and is not a symlink';
      log.warn('unlink', 'refusing to remove a real path', { target, reason });
      results.push({ host, target, action: 'refused', reason });
      continue;
    }

    log.info('unlink', 'removing symlink', { target });
    await rm(absolute);
    results.push({ host, target, action: 'removed' });
  }

  return results;
}

export const describe = (result: LinkResult): string =>
  `${result.action.padEnd(9)} ${result.target}`
  + (result.reason === undefined ? '' : `  (${result.reason})`);

async function main(): Promise<number> {
  const command = process.argv[2];
  if (command !== 'link' && command !== 'unlink') {
    process.stdout.write('usage: link-local.ts link|unlink\n');
    return 2;
  }

  const root = process.cwd();
  log.info('run', 'running', { command, root });

  let results: LinkResult[];
  try {
    results = command === 'link' ? await linkLocal(root) : await unlinkLocal(root);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.error('run', 'command failed', { command, reason });
    process.stdout.write(`link-local: ${reason}\n`);
    return 2;
  }

  for (const result of results) process.stdout.write(`${describe(result)}\n`);
  return results.some(result => result.action === 'refused') ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}
