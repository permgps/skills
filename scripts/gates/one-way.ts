#!/usr/bin/env node
// One-way changes — the review phase's mechanical scan of what is hard to undo.
//
// Pass condition, from phases/6-review.md step 2: every change the per-commit
// diffs show as one-way is a line in the run state's `oneWay`. The отчёт's
// «Hard to undo» section is read out of that list, so a change the scan missed
// is a change the user is never told about.
//
// Four kinds, each mechanical:
// - `deleted`: a path a commit deletes that no commit of the прогон added;
// - `renamed`: a rename whose source no commit of the прогон added;
// - `migration`: an added path under a `migrations` or `migrate` directory, or
//   under `alembic/versions`;
// - `dependency-major`: a version in `package.json` whose leading major changed,
//   for a package present on both sides of the commit.
//
// What this does not hold, and the phase applies by judgement: a data
// migration outside those directories, and every manifest other than
// `package.json` (`pyproject.toml`, `requirements.txt`, `Cargo.toml`, `go.mod`,
// `Gemfile`). A line the state carries beyond the scan's is therefore allowed;
// only a mechanical line the state lacks is a finding.
//
// Like debug-tags.ts this ships with the repository, not the bundle: a прогон
// applies the same rule in the phase's own words.

import { execFile } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { createLogger } from '../shared/log.ts';
import type { RunState } from '../state/contract.ts';
import { runGate, targetFromArgv, type GateFileCheck, type GateFinding } from './cli.ts';

export type { GateFinding };

const log = createLogger('gate');
const run = promisify(execFile);

/** Directory names under which an added file is a migration. */
export const MIGRATION_SEGMENTS: readonly string[] = ['migrations', 'migrate'];

/** The `package.json` fields whose versions are compared. */
export const DEPENDENCY_FIELDS: readonly string[] = [
  'dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies',
];

/**
 * The part of a version that a breaking change moves: the leading major, or
 * `0.<minor>` below 1.0, as semver treats it. `null` when the version is not a
 * number at all (`latest`, `workspace:*`, a git URL), which is never called an
 * upgrade because nothing can be compared.
 */
export function majorOf(version: string): string | null {
  const match = /^(\d+)(?:\.(\d+|x|\*))?/.exec(version.trim().replace(/^[\^~>=<\s]*v?/, ''));
  if (match === null) return null;
  const [, major, minor] = match;
  if (major !== '0') return major ?? null;
  return `0.${minor !== undefined && /^\d+$/.test(minor) ? minor : '0'}`;
}

/** Whether an added path is a schema or data migration by where it sits. */
export function isMigrationPath(file: string): boolean {
  const directories = file.split('/').slice(0, -1);
  if (directories.some(segment => MIGRATION_SEGMENTS.includes(segment))) return true;
  return directories.some((segment, position) => segment === 'alembic' && directories[position + 1] === 'versions');
}

interface Change {
  status: string;
  paths: string[];
}

/** One commit's file list, as `git show --name-status` prints it, renames on. */
async function changesOf(repo: string, commit: string): Promise<Change[]> {
  const { stdout } = await run('git', [
    '-C', repo, 'show', '--format=', '--no-color', '--no-ext-diff', '--name-status', '-M', commit, '--', '.',
  ], { maxBuffer: 64 * 1024 * 1024 });
  return stdout.split('\n').filter(line => line.trim() !== '').map(line => {
    const [status = '', ...paths] = line.split('\t');
    return { status: status.charAt(0), paths };
  });
}

/** A file's text at a revision, or `null` when it is not there. */
async function fileAt(repo: string, revision: string, file: string): Promise<string | null> {
  try {
    const { stdout } = await run('git', ['-C', repo, 'show', `${revision}:${file}`], { maxBuffer: 16 * 1024 * 1024 });
    return stdout;
  } catch {
    return null;
  }
}

function dependencyVersions(text: string | null): Map<string, string> {
  const versions = new Map<string, string>();
  if (text === null) return versions;
  let manifest: unknown;
  try { manifest = JSON.parse(text); } catch { return versions; }
  if (typeof manifest !== 'object' || manifest === null) return versions;
  for (const field of DEPENDENCY_FIELDS) {
    const block = (manifest as Record<string, unknown>)[field];
    if (typeof block !== 'object' || block === null) continue;
    for (const [name, version] of Object.entries(block)) {
      if (typeof version === 'string' && !versions.has(`${field}\n${name}`)) versions.set(`${field}\n${name}`, version);
    }
  }
  return versions;
}

/** The major bumps one commit makes to one `package.json`, as `name from → to`. */
async function majorBumps(repo: string, commit: string, manifest: string): Promise<string[]> {
  const before = dependencyVersions(await fileAt(repo, `${commit}^`, manifest));
  const after = dependencyVersions(await fileAt(repo, commit, manifest));
  const bumps: string[] = [];
  for (const [key, to] of after) {
    const from = before.get(key);
    if (from === undefined || from === to) continue;
    const was = majorOf(from);
    const is = majorOf(to);
    if (was === null || is === null || was === is) continue;
    bumps.push(`${key.slice(key.indexOf('\n') + 1)} ${from} → ${to}`);
  }
  return bumps;
}

/**
 * Every mechanical one-way line the прогон's commits produce, in таск order and
 * then commit order, in the exact shape the state validator accepts:
 * `<kind> — <subject> — <taskId> <short commit>`. A commit git cannot show
 * throws, which the runner reports as unreadable.
 */
export async function oneWayLines(state: RunState, repo: string): Promise<string[]> {
  const read: { taskId: string; commit: string; changes: Change[] }[] = [];
  for (const task of state.tasks) {
    for (const commit of task.commits ?? []) {
      let changes: Change[];
      try {
        changes = await changesOf(repo, commit);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        log.error('one-way', 'commit could not be read', { taskId: task.id, commit, reason });
        throw new Error(`таск ${task.id}: commit ${commit} could not be read in ${repo}`);
      }
      read.push({ taskId: task.id, commit, changes });
    }
  }

  // A path any commit of the прогон created is not the user's file, whichever
  // таск created it and whenever, so the set is built before any line is.
  const created = new Set<string>();
  for (const { changes } of read) {
    for (const { status, paths } of changes) {
      if (status === 'A' && paths[0] !== undefined) created.add(paths[0]);
      if ((status === 'R' || status === 'C') && paths[1] !== undefined) created.add(paths[1]);
    }
  }

  const lines: string[] = [];
  const push = (line: string): void => { if (!lines.includes(line)) lines.push(line); };
  for (const { taskId, commit, changes } of read) {
    const tail = `${taskId} ${commit.slice(0, 7)}`;
    const counts = { deleted: 0, renamed: 0, migrations: 0, majors: 0 };
    for (const { status, paths } of changes) {
      const [first = '', second = ''] = paths;
      if (status === 'D' && !created.has(first)) {
        push(`deleted — ${first} — ${tail}`);
        counts.deleted += 1;
      }
      if (status === 'R' && !created.has(first)) {
        push(`renamed — ${first} → ${second} — ${tail}`);
        counts.renamed += 1;
      }
      if (status === 'A' && isMigrationPath(first)) {
        push(`migration — ${first} — ${tail}`);
        counts.migrations += 1;
      }
      if (status === 'M' && path.posix.basename(first) === 'package.json') {
        for (const bump of await majorBumps(repo, commit, first)) {
          push(`dependency-major — ${bump} — ${tail}`);
          counts.majors += 1;
        }
      }
    }
    log.debug('one-way', 'commit read', { taskId, commit, ...counts });
  }

  log.info('one-way', 'one-way changes found', { tasks: state.tasks.length, lines: lines.length });
  return lines;
}

/**
 * The check against a project repository. `repo` defaults to the directory
 * that holds the run directory, because `.maestro` sits in the project root.
 */
export function oneWayIn(repo?: string): GateFileCheck {
  return async (state: RunState, target: string): Promise<GateFinding[]> => {
    const root = repo ?? path.dirname(path.resolve(target));
    const recorded = new Set(state.oneWay ?? []);
    return (await oneWayLines(state, root))
      .filter(line => !recorded.has(line))
      .map(line => ({
        requirementId: line.slice(line.lastIndexOf(' — ') + 3).split(' ')[0] ?? '',
        message: `oneWay lacks "${line}" — append it in the review phase's scan; the отчёт's Hard to undo reads only that list`,
      }));
  };
}

/** The check with the repository taken from the run directory's location. */
export const oneWayInCommits: GateFileCheck = oneWayIn();

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await runGate('one-way', () => [], targetFromArgv(), oneWayIn(process.argv[3])));
}
