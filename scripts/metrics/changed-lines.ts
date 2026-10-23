// How many lines each таск changed, read from the commits the run state says it
// landed in.
//
// Changed lines are insertions plus deletions of `git show --numstat`, the
// count the sizing decisions are argued in. Git is read through the runtime's
// bounded runner, so a hung credential helper or a huge history costs a
// measurement ten seconds, never the measurement. A commit git cannot read is
// reported as unreadable rather than counted as zero: a zero would claim the
// таск changed nothing.

import { SHA_PATTERN, runGit } from '../../skills/maestro/tools/runtime/history.mts';
import { createLogger } from '../shared/log.ts';

const log = createLogger('metrics');

export interface ChangedLines {
  /** Insertions plus deletions over every readable commit. */
  lines: number;
  /** Files git reports as binary: they add no lines and are counted here instead. */
  binaryFiles: number;
  /** Recorded shas git could not show, or that are not shas at all. */
  unreadable: string[];
}

/** Sum the changed lines of `shas` in the repository at `projectRoot`. */
export async function changedLines(projectRoot: string, shas: readonly string[], gitBinary = 'git'): Promise<ChangedLines> {
  const total: ChangedLines = { lines: 0, binaryFiles: 0, unreadable: [] };
  for (const sha of shas) {
    // A recorded value is checked before it reaches git, so a hand-edited state
    // cannot pass an option where a commit belongs.
    if (!SHA_PATTERN.test(sha)) {
      total.unreadable.push(sha);
      log.warn('git', 'recorded commit is not a sha', { sha });
      continue;
    }
    const shown = await runGit(projectRoot, ['show', '--numstat', '--format=', '--no-renames', sha], gitBinary);
    if (!('stdout' in shown)) {
      total.unreadable.push(sha);
      log.warn('git', 'commit could not be read', { sha, reason: shown.unavailable });
      continue;
    }
    let insertions = 0;
    let deletions = 0;
    let binary = 0;
    for (const line of shown.stdout.split('\n')) {
      const match = /^(\d+|-)\t(\d+|-)\t/.exec(line);
      if (match === null) continue;
      if (match[1] === '-' || match[2] === '-') {
        binary += 1;
        continue;
      }
      insertions += Number(match[1]);
      deletions += Number(match[2]);
    }
    total.lines += insertions + deletions;
    total.binaryFiles += binary;
    log.debug('git', 'commit counted', { sha, insertions, deletions, binary });
  }
  return total;
}

const escapeForGrep = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Every commit whose message carries `Maestro-Run: <dir>` on a line of its own,
 * on any branch — what the run committed, recorded by a таск or not.
 */
export async function runCommits(projectRoot: string, dir: string, gitBinary = 'git'): Promise<{ shas: string[] } | { unavailable: string }> {
  const listed = await runGit(projectRoot,
    ['log', '--all', '--format=%H', '-E', `--grep=^Maestro-Run: ${escapeForGrep(dir)}$`], gitBinary);
  if (!('stdout' in listed)) {
    log.warn('git', 'run commits could not be listed', { dir, reason: listed.unavailable });
    return { unavailable: listed.unavailable };
  }
  const shas = listed.stdout.split('\n').map(line => line.trim()).filter(line => line !== '');
  log.debug('git', 'run commits listed', { dir, commits: shas.length });
  return { shas };
}
