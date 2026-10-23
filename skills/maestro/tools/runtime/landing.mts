// `--publish <candidate> --land <NN>`: the commit a таск just landed in,
// verified against that таск and appended to its `commits` before validation.
//
// The publish that records a landing needs the commit's sha, and a sha the
// orchestrator copies out of `git commit`'s output is a sha nobody checked: it
// can name the previous таск's commit, a commit the hook rewrote, or nothing.
// Reading `HEAD` here lets the commit and the publish go out in one message —
// a failed commit leaves a `HEAD` this check refuses, so nothing is published
// as landed that did not land.
//
// It runs inside the publication lock, after the waits are kept and before the
// candidate is validated, so the state is judged as it will be written. It
// changes nothing on disk itself: the candidate file is left as written, and
// only the published state carries the sha.
//
// What it does not cover: whether the commit took the right lines. It checks
// that the таск's paths hold nothing uncommitted, never what the diff says;
// that is the review's job, against the task file.
//
// Contract: docs/spec/state-contract.md, `--land`; docs/spec/phases.md,
// section "Commits".

import { FIELD, SHA_PATTERN, runGit, runName } from './history.mts';
import { createLogger } from './shared/log.mts';
import type { RunState } from './state/contract.mts';
import type { StateViolation } from './state/validate.mts';

const log = createLogger('sync');

/** How many uncommitted paths a refusal names; the count is always given. */
export const DIRTY_PATHS_NAMED = 20;

/** Between two values of one trailer key: a trailer given twice is refused, not merged. */
const VALUES = '\x1d';

export type LandRule =
  | 'land-unknown-task' | 'land-not-review' | 'land-subject' | 'land-run' | 'land-requirements'
  | 'land-lost' | 'land-other-task' | 'land-stale-head' | 'land-no-paths' | 'land-path' | 'land-dirty';

export type LandOutcome =
  | { kind: 'landed'; state: RunState; sha: string; appended: boolean }
  | { kind: 'refused'; rule: LandRule; violations: StateViolation[] }
  | { kind: 'unavailable'; reason: string };

interface TaskShape {
  id: string;
  status?: unknown;
  requirementIds?: unknown;
  zone?: unknown;
  files?: unknown;
  commits?: unknown;
  lostCommits?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Requirement ids in id order: `R2` before `R10`, as a person reads them. */
const byId = (left: string, right: string): number => left.localeCompare(right, 'en', { numeric: true });

/** The `Requirements:` value a таск's commit carries: its ids in id order, joined by a comma and a space. */
export const requirementsTrailer = (ids: readonly string[]): string => [...ids].sort(byId).join(', ');

/**
 * The subject names the таск when its first token is the таск's id: the whole
 * subject, or the id followed by a space, a colon or `(`. `T01: …` and
 * `T01 (repair): …` are what the recorded прогоны wrote; `T010` is another таск.
 * Only the head of the subject is matched, so a long subject costs nothing.
 */
export function subjectNamesTask(subject: string, taskId: string): boolean {
  return new RegExp(`^${escapeRegExp(taskId)}(?:$|[ :(])`).test(subject.slice(0, taskId.length + 1));
}

/** A path from a таск's zone or files that may go to git as a pathspec. */
function safePath(entry: string): boolean {
  if (entry.trim() === '' || entry.startsWith('/') || entry.startsWith(':') || /^[A-Za-z]:[\\/]/.test(entry)) return false;
  return !entry.split(/[\\/]/).includes('..');
}

/** The paths `status --porcelain=v1 -z` printed: a rename's or copy's second path is its origin. */
function statusPaths(stdout: string): string[] {
  const items = stdout.split('\0');
  const paths: string[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    if (item.length < 4) continue;
    paths.push(item.slice(3));
    if (item[0] === 'R' || item[0] === 'C') index += 1;
  }
  return paths;
}

/**
 * Verify `HEAD` against таск `taskId` of the candidate and append its sha.
 * Each step returns on its first failure, so the refusal names one rule.
 */
export async function landCandidate(candidate: RunState, taskId: string, projectRoot: string, gitBinary = 'git'): Promise<LandOutcome> {
  const tasks = (Array.isArray(candidate.tasks) ? candidate.tasks : []) as unknown[];
  const index = tasks.findIndex(task => isRecord(task) && task['id'] === taskId);
  const field = index < 0 ? 'tasks' : `tasks[${index}].commits`;
  const refuse = (rule: LandRule, message: string, sha?: string): LandOutcome => {
    log.warn('land', 'land refused', { taskId, rule, ...(sha ? { sha } : {}) });
    return { kind: 'refused', rule, violations: [{ field, message: `${rule}: ${message}` }] };
  };
  if (index < 0) return refuse('land-unknown-task', `the candidate has no таск ${taskId} — name the таск whose commit HEAD is`);
  const task = tasks[index] as TaskShape;
  if (task.status !== 'review') {
    return refuse('land-not-review', `таск ${taskId} is ${String(task.status)} in the candidate — write it review in the same candidate: it is committed, not accepted`);
  }

  const head = await runGit(projectRoot, ['log', '-1',
    `--format=%H${FIELD}%s${FIELD}%(trailers:key=Maestro-Run,valueonly,separator=%x1d)${FIELD}%(trailers:key=Requirements,valueonly,separator=%x1d)`,
    'HEAD', '--'], gitBinary);
  if ('unavailable' in head) {
    log.error('land', 'git unavailable', { taskId, reason: head.unavailable });
    return { kind: 'unavailable', reason: `HEAD could not be read: ${head.unavailable}; nothing was published` };
  }
  const [sha = '', subject = '', runTrailer = '', requirementsValue = ''] = head.stdout.replace(/\n$/, '').split(FIELD);
  if (!SHA_PATTERN.test(sha)) {
    log.error('land', 'git unavailable', { taskId, reason: 'HEAD named no commit' });
    return { kind: 'unavailable', reason: 'git log HEAD named no commit; nothing was published' };
  }
  log.debug('land', 'head read', { taskId, sha });

  if (!subjectNamesTask(subject, taskId)) {
    const found = subject.split(/[ :(]/, 1)[0]!.slice(0, 40);
    return refuse('land-subject', `HEAD's subject opens with "${found}", not таск ${taskId} — commit the таск with its id first in the subject, or land the таск HEAD belongs to`, sha);
  }

  const run = runName(candidate as unknown as Record<string, unknown>);
  const runs = runTrailer.split(VALUES).map(value => value.trim()).filter(value => value !== '');
  if (runs.length !== 1 || runs[0] !== run) {
    return refuse('land-run', `HEAD's Maestro-Run: trailer is ${runs.length === 0 ? 'missing' : `"${runs.join(', ')}"`}, not "${run}" — the commit belongs to another run or lost its trailer`, sha);
  }

  const expected = requirementsTrailer(strings(task.requirementIds));
  const lines = requirementsValue.split(VALUES).filter(value => value.trim() !== '');
  // Spacing is not the binding; the ids and their order are.
  const found = lines.length === 1 ? lines[0]!.split(',').map(value => value.trim()).join(', ') : null;
  if (found !== expected) {
    return refuse('land-requirements', `HEAD's Requirements: trailer ${lines.length === 0 ? 'is missing' : lines.length > 1 ? 'is given twice' : `is "${found}"`}, not "${expected}" — the таск's requirementIds in id order, joined by a comma and a space`, sha);
  }

  const others = tasks.filter(isRecord) as unknown as TaskShape[];
  if (others.some(other => strings(other.lostCommits).includes(sha))) {
    return refuse('land-lost', `${sha} is recorded as lost — a lost commit never comes back into commits; land the relaunched work in a new commit`, sha);
  }
  const holder = others.find(other => other.id !== taskId && strings(other.commits).includes(sha));
  if (holder) return refuse('land-other-task', `${sha} already landed таск ${holder.id} — commit таск ${taskId} first`, sha);
  const commits = strings(task.commits);
  if (commits.length > 0 && commits[commits.length - 1] === sha) {
    log.info('land', 'landed', { taskId, sha, appended: false });
    return { kind: 'landed', state: candidate, sha, appended: false };
  }
  if (commits.includes(sha)) return refuse('land-stale-head', `no new commit since ${sha} — commit the таск's paths first`, sha);

  const paths = [...new Set([...strings(task.zone), ...strings(task.files)])];
  if (paths.length === 0) return refuse('land-no-paths', `таск ${taskId} names no zone and no files — write its zone before landing, so the commit can be checked for what it left behind`, sha);
  const unsafe = paths.filter(entry => !safePath(entry));
  if (unsafe.length > 0) return refuse('land-path', `таск ${taskId} names ${unsafe.length} path(s) outside the project (${unsafe.slice(0, 3).join(', ')}) — zone and files are project-relative paths`, sha);

  const status = await runGit(projectRoot, ['-c', 'core.quotePath=false', 'status', '--porcelain=v1', '-z', '--untracked-files=all',
    '--', ...paths, ':(exclude).maestro'], gitBinary);
  if ('unavailable' in status) {
    log.error('land', 'git unavailable', { taskId, reason: status.unavailable });
    return { kind: 'unavailable', reason: `the таск's paths could not be checked: ${status.unavailable}; nothing was published` };
  }
  const dirty = statusPaths(status.stdout);
  if (dirty.length > 0) {
    const named = dirty.slice(0, DIRTY_PATHS_NAMED).join(', ');
    return refuse('land-dirty', `${dirty.length} path(s) of таск ${taskId} are not in the commit (${named}${dirty.length > DIRTY_PATHS_NAMED ? ', …' : ''}) — git add them and make a second commit, then land again`, sha);
  }

  const state = structuredClone(candidate);
  const landed = (state.tasks as unknown[])[index] as TaskShape;
  landed.commits = [...commits, sha];
  log.info('land', 'landed', { taskId, sha, appended: true });
  return { kind: 'landed', state, sha, appended: true };
}
