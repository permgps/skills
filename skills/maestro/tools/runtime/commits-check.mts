// On resume, which commits the таски recorded `HEAD` no longer holds.
//
// A прогон resumed in a new session, after a compaction, or reopened from a
// closed run trusts `tasks[].commits` as the work already done. A reset, a
// rebase or a checkout between sessions can take a commit off `HEAD`'s history,
// and a прогон that builds on it reviews code that is not there. This command
// classifies every recorded sha and reports, таск by таск, what was lost, with
// the rewritten twin a rebase left and the local branches a checkout left it on.
//
// It reads and never writes (decision D1): the orchestrator decides what a
// lost commit means and writes the reset through an ordinary `--publish`, so
// it never learns of a reset after the fact. A git that cannot answer makes the
// whole result `unavailable`, because a partial answer is one a reset could act
// on, and "git did not answer" must never send a таск back.
//
// Contract: docs/spec/phases.md, section "Recovery"; docs/spec/state-contract.md,
// `--commits-check`.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { ancestry, branchesContaining, findRewrittenCommit, headCommit, runName } from './history.mts';
import { createLogger } from './shared/log.mts';
import { extractStateLiteral } from './state/read.mts';

const log = createLogger('commits');

/** One recorded commit `HEAD` no longer holds. */
export interface LostCommit {
  sha: string;
  state: 'not-ancestor' | 'missing';
  /** The commit a rebase most likely rewrote it into; only on `not-ancestor`, only when found. */
  rewritten?: string;
  /** The local branches that still hold it; only on `not-ancestor`. */
  branches?: string[];
}

export interface LostTask {
  taskId: string;
  status: string;
  commits: LostCommit[];
}

interface TaskShape {
  id: string;
  status: string;
  commits?: unknown;
  lostCommits?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

/**
 * `--commits-check`: one JSON result. Exit 0 when nothing is lost or git could
 * not answer, 1 when something is lost, 2 when there is no readable state.
 */
export async function commitsCheckCommand(_args: string[], runDir: string, gitBinary = 'git'): Promise<{ result: Record<string, unknown>; code: number }> {
  let state: unknown;
  try {
    state = JSON.parse(extractStateLiteral(await readFile(path.join(runDir, 'state.js'), 'utf8')));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.error('check', 'state could not be read; nothing checked', { runDir, reason });
    return { result: { error: `no readable state.js beside this script — publish the state first (${reason})` }, code: 2 };
  }
  if (!isRecord(state) || !Array.isArray(state['tasks'])) {
    log.error('check', 'state has no tasks list; nothing checked', { runDir });
    return { result: { error: 'state.js carries no tasks list — publish a valid state first' }, code: 2 };
  }
  const projectRoot = path.dirname(runDir);
  const run = runName(state);
  const tasks = (state['tasks'] as unknown[]).filter(isRecord) as unknown as TaskShape[];

  const head = await headCommit(projectRoot, gitBinary);
  if ('unavailable' in head) return unavailable(head.unavailable);

  // Every sha any таск records, in either list: a twin already recorded belongs
  // to somebody, so it is no hint for this one.
  const excluded = new Set(tasks.flatMap(task => [...strings(task.commits), ...strings(task.lostCommits)]));
  const lost: LostTask[] = [];
  let checked = 0;
  let unrecorded = 0;
  for (const task of tasks) {
    // A таск of a contract before 3 has no list; it is counted, not guessed at.
    if (!Array.isArray(task.commits)) { unrecorded += 1; continue; }
    const recorded = strings(task.commits);
    const found: LostCommit[] = [];
    for (const sha of recorded) {
      checked += 1;
      const classified = await ancestry(projectRoot, sha, gitBinary);
      if (classified.state === 'unavailable') return unavailable(classified.reason);
      if (classified.state === 'ancestor') continue;
      if (classified.state === 'missing') { found.push({ sha, state: 'missing' }); continue; }
      const containing = await branchesContaining(projectRoot, sha, gitBinary);
      if ('unavailable' in containing) return unavailable(containing.unavailable);
      const twin = await findRewrittenCommit(projectRoot, { sha, dir: run, excluded }, gitBinary);
      found.push({ sha, state: 'not-ancestor', ...(twin ? { rewritten: twin.sha } : {}), branches: containing.branches });
    }
    log.debug('check', 'таск checked', { taskId: task.id, recorded: recorded.length, lost: found.length });
    if (found.length > 0) lost.push({ taskId: task.id, status: task.status, commits: found });
  }

  const onBranch = singleBranch(lost);
  log.info('check', 'recorded commits checked', { run, tasks: tasks.length, checked, lost: lost.length, onBranch: onBranch !== undefined });
  const result: Record<string, unknown> = { result: 'checked', head: head.sha, run, checked, lost };
  if (unrecorded > 0) result['unrecorded'] = unrecorded;
  if (onBranch !== undefined) result['onBranch'] = onBranch;
  return { result, code: lost.length > 0 ? 1 : 0 };
}

function unavailable(reason: string): { result: Record<string, unknown>; code: number } {
  log.warn('check', 'history unavailable; nothing will be reset', { reason });
  return { result: { result: 'unavailable', reason }, code: 0 };
}

/**
 * A local branch every lost commit is on: what a checkout looks like. When
 * several hold them all, any one of them gives the work back, so the first by
 * name is named. A missing commit sits on no branch, so any missing one rules a
 * checkout out.
 */
function singleBranch(lost: readonly LostTask[]): string | undefined {
  const commits = lost.flatMap(task => task.commits);
  if (commits.length === 0 || commits.some(commit => commit.state === 'missing')) return undefined;
  const [first, ...rest] = commits.map(commit => new Set(commit.branches ?? []));
  // `branches` arrives sorted, so the first common one is the first by name.
  return [...first!].find(branch => rest.every(set => set.has(branch)));
}
