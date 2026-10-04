#!/usr/bin/env node
// Debug tags — the review phase's mechanical check on what a repair left behind.
//
// Pass condition, from phases/6-review.md step 2: no таск's commits leave a line
// carrying `[maestro-debug:`. A repair tags any temporary diagnostic output with
// the defect it serves, `[maestro-debug:DF-N]`, and removes it before return;
// one that survives is a blocking finding against the таск that added it.
//
// "Left behind" is per таск and net: a tagged line one commit of a таск adds
// and a later commit of the same таск removes is gone. Another таск's commit
// never clears it — the таск that added it is the таск that has to answer.
//
// Like G1–G4 this ships with the repository, not the bundle: a прогон applies
// the same condition in the phase's own words. Unlike them it reads git, not
// only the state, because the condition is about the diff.
//
// A finding names the таск, the path, the tag id and the commit — never the
// line. A tagged line is debug output, and debug output is exactly where a value
// that must not travel tends to sit.

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

/** What a repair puts on every line of temporary diagnostic output. */
export const DEBUG_TAG = '[maestro-debug:';

const TAG = /\[maestro-debug:([^\]]*)\]/;
const DEFECT_ID = /^DF-\d+$/;

/** One tagged line that the commits of a таск added and never removed. */
export interface DebugTagLeftover {
  /** The commit that added it. */
  commit: string;
  path: string;
  /** The defect id inside the tag, or `malformed` when it is not a `DF-N`. */
  tagId: string;
}

interface Added {
  commit: string;
  tagId: string;
}

/**
 * The tagged lines a таск's commits leave behind, given each commit's diff in
 * the order the commits landed.
 *
 * A line is keyed by its path and its trimmed content, so the same line
 * re-indented and then removed is still the same line. A removal only cancels
 * an addition already seen; removing a line these commits never added clears
 * nothing.
 */
export function findDebugTags(commits: readonly { commit: string; diff: string }[]): DebugTagLeftover[] {
  const open = new Map<string, Added[]>();

  for (const { commit, diff } of commits) {
    let file = '';
    // A file's `---`/`+++` headers come before its first hunk. Inside a hunk a
    // line starting `+++` is an added line that began with `++`, not a header.
    let inHunk = false;
    for (const line of diff.split('\n')) {
      if (line.startsWith('diff --git ')) {
        inHunk = false;
        continue;
      }
      if (!inHunk) {
        // Renames are off, so old and new path agree except where one side is
        // /dev/null: a deleted file's removed lines key by the path it had.
        if (line.startsWith('--- ') && line !== '--- /dev/null') file = line.slice(4).replace(/^a\//, '');
        if (line.startsWith('+++ ') && line !== '+++ /dev/null') file = line.slice(4).replace(/^b\//, '');
        if (line.startsWith('@@')) inHunk = true;
        continue;
      }
      if (line.startsWith('@@')) continue;

      const sign = line[0];
      if (sign !== '+' && sign !== '-') continue;
      const content = line.slice(1).trim();
      const tag = TAG.exec(content) ?? (content.includes(DEBUG_TAG) ? [DEBUG_TAG, ''] : null);
      if (tag === null) continue;

      const key = `${file}\n${content}`;
      const added = open.get(key) ?? [];
      if (sign === '+') {
        const id = tag[1] ?? '';
        added.push({ commit, tagId: DEFECT_ID.test(id) ? id : 'malformed' });
        open.set(key, added);
      } else {
        added.shift();
      }
    }
  }

  const leftovers: DebugTagLeftover[] = [];
  for (const [key, added] of open) {
    const file = key.slice(0, key.indexOf('\n'));
    for (const { commit, tagId } of added) leftovers.push({ commit, path: file, tagId });
  }
  return leftovers;
}

/** One commit's diff, as the review phase reads it: `git show <commit> -- .` */
async function showCommit(repo: string, commit: string): Promise<string> {
  const { stdout } = await run('git', [
    '-C', repo, 'show', '--format=', '--no-color', '--no-ext-diff', '--no-renames', commit, '--', '.',
  ], { maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

/**
 * The check against a project repository. `repo` defaults to the directory
 * that holds the run directory, because `.maestro` sits in the project root.
 * A commit git cannot show throws, which the runner reports as unreadable.
 */
export function debugTagsIn(repo?: string): GateFileCheck {
  return async (state: RunState, target: string): Promise<GateFinding[]> => {
    const root = repo ?? path.dirname(path.resolve(target));
    const findings: GateFinding[] = [];
    let commitCount = 0;

    for (const task of state.tasks) {
      const diffs: { commit: string; diff: string }[] = [];
      for (const commit of task.commits ?? []) {
        let diff: string;
        try {
          diff = await showCommit(root, commit);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          log.error('debug-tags', 'commit could not be read', { taskId: task.id, commit, reason });
          throw new Error(`таск ${task.id}: commit ${commit} could not be read in ${root}`);
        }
        log.debug('debug-tags', 'commit scanned', {
          taskId: task.id, commit, bytes: diff.length, tagged: diff.includes(DEBUG_TAG),
        });
        diffs.push({ commit, diff });
        commitCount += 1;
      }

      for (const leftover of findDebugTags(diffs)) {
        findings.push({
          requirementId: task.id,
          message: `таск ${task.id} leaves ${DEBUG_TAG}${leftover.tagId}] in ${leftover.path} `
            + `(added by ${leftover.commit.slice(0, 7)}) — remove it before return`,
        });
      }
    }

    log.info('debug-tags', 'tags checked', { tasks: state.tasks.length, commits: commitCount, leftovers: findings.length });
    return findings;
  };
}

/** The check with the repository taken from the run directory's location. */
export const debugTagsInCommits: GateFileCheck = debugTagsIn();

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await runGate('debug-tags', () => [], targetFromArgv(), debugTagsIn(process.argv[3])));
}
