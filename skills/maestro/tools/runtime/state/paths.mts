// Where a прогон's artifacts live inside the target project.
//
// Every builder is pure and takes its date as an argument. A path function that
// reads the clock cannot be tested without freezing time, and a run resumed the
// next morning would silently start writing to a second brief.

import path from 'node:path';

import { createLogger } from '../shared/log.mts';
import type { RunState } from './contract.mts';

const log = createLogger('paths');

/** The run directory inside the target project. */
export const ROOT = '.maestro';

/** A path escaped the run directory — always a defect, never a configuration. */
export class PathEscapeError extends Error {
  constructor(value: string) {
    super(`path escapes the run directory: ${value}`);
    this.name = 'PathEscapeError';
  }
}

/**
 * A filesystem-safe slug. Lowercase, ASCII-ish, dash-separated, non-empty.
 * The transliteration is deliberately absent: a Russian feature name becomes a
 * name the user typed in English, not a machine's guess at how to spell it.
 */
export function toSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug === '') throw new PathEscapeError(value);
  return slug;
}

/** `NN` — two digits, more when a run genuinely has a hundred таски. */
export function toIndex(value: number): string {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`index must be a non-negative integer: ${value}`);
  }
  return String(value).padStart(2, '0');
}

/** An evidence folder identity is stable and cannot contain path separators. */
export function toEvidenceId(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new PathEscapeError(value);
  return value;
}

/** `YYYY-MM-DD` from a Date the caller supplies. */
export function toDate(when: Date): string {
  if (Number.isNaN(when.getTime())) throw new RangeError('date is invalid');
  return when.toISOString().slice(0, 10);
}

/** The suffix a run directory carries exactly while its прогон is active. */
export const WIP_SUFFIX = '--wip';

/**
 * The run directory's grammar from contract 7: `<YYYY-MM-DD>-<slug>`, then
 * `--wip` while active. A canonical slug never holds `--`, so the suffix cannot
 * be mistaken for part of the name. The dashboard carries a copy of this
 * pattern because it imports nothing; `npm run dashboard` compares the two.
 */
export const RUN_DIR_PATTERN = /^(\d{4}-\d{2}-\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)(--wip)?$/;

/**
 * The contract-7 run directory name. The date is the UTC day `startedAt` names,
 * through the same `toDate` that dates the brief, so the two dates in one
 * directory cannot disagree.
 */
export function toRunDir(startedAt: string, slug: string, active: boolean): string {
  const safe = toSlug(slug);
  if (safe !== slug) throw new PathEscapeError(slug);
  return `${toDate(new Date(startedAt))}-${safe}${active ? WIP_SUFFIX : ''}`;
}

export interface RunDirName { date: string; slug: string; wip: boolean }

/** The three parts of a contract-7 run directory, or null when it does not parse. */
export function parseRunDir(dir: string): RunDirName | null {
  const match = RUN_DIR_PATTERN.exec(dir);
  if (!match) return null;
  return { date: match[1]!, slug: match[2]!, wip: match[3] !== undefined };
}

/**
 * The run directory a state lives in, relative to `.maestro/`. From contract 7
 * it is the state's own `dir`; below, it is the slug the run was written under,
 * because those runs keep their names. Every reader resolves a run through this
 * one function, so no module rebuilds the name from `slug` on its own.
 */
export function runDirName(state: Pick<RunState, 'contractVersion' | 'slug' | 'dir'>): string {
  const resolved = state.contractVersion >= 7 ? state.dir : state.slug;
  if (typeof resolved !== 'string' || resolved === '' || resolved.includes('/')
    || resolved.includes('\\') || resolved === '.' || resolved === '..') {
    throw new PathEscapeError(String(resolved));
  }
  log.debug('run-dir', 'run directory resolved', {
    contractVersion: state.contractVersion, slug: state.slug, dir: state.dir, resolved,
  });
  return resolved;
}

/** Join inside the run root, refusing anything that climbs out of it. */
function within(root: string, ...segments: string[]): string {
  const joined = path.join(root, ...segments);
  const normalized = path.normalize(joined);
  const prefix = `${path.normalize(root)}${path.sep}`;
  if (normalized !== path.normalize(root) && !normalized.startsWith(prefix)) {
    throw new PathEscapeError(joined);
  }
  return normalized;
}

/**
 * The dashboard's only input, by name.
 *
 * Here rather than beside the writer because the reader needs it too, and a
 * filename that two modules spell for themselves is a filename that can be
 * spelled two ways. `statePath()` below is the same fact with the run root
 * attached.
 */
export const STATE_FILE = 'state.js';

/** Paths shared by the whole project, outside any one feature directory. */
export const runRoot = (): string => ROOT;
export const statePath = (): string => within(ROOT, STATE_FILE);
export const dashboardPath = (): string => within(ROOT, 'dashboard.html');

/** Every path belonging to one feature slug — a run written before contract 7. */
export function forRun(slug: string) {
  const safe = toSlug(slug);
  return artifactsIn(safe, safe);
}

/**
 * Every path belonging to one contract-7 run directory. The name is taken as
 * the state holds it and parsed, never rebuilt, so a run whose suffix just came
 * off resolves to where it is now rather than where it was.
 */
export function forDir(dir: string) {
  const parsed = parseRunDir(dir);
  if (!parsed) throw new PathEscapeError(dir);
  return artifactsIn(dir, parsed.slug);
}

/** One builder behind both entries, so a file is spelled once whatever named the run. */
function artifactsIn(name: string, slug: string) {
  const dir = within(ROOT, name);
  const inside = (...segments: string[]): string => within(dir, ...segments);

  return {
    slug,
    dir,
    /** Dated, because a feature slug outlives one sitting. */
    brief: (when: Date): string => inside(`${toDate(when)}-brief.md`),
    manifest: (): string => inside('manifest.md'),
    answers: (): string => inside('answers.md'),
    /** What earlier runs left, read once by preflight and withheld from every blind reader. */
    prior: (): string => inside('prior.md'),
    reference: (): string => inside('reference.md'),
    spec: (): string => inside('spec.md'),
    /** Boundaries the plan derived from the spec. */
    interfaces: (): string => inside('interfaces.md'),
    /** What finished таски actually built — a different writer, so a different file. */
    discoveredInterfaces: (): string => inside('discovered-interfaces.md'),
    tasksDir: (): string => inside('tasks'),
    task: (index: number, name: string): string =>
      inside('tasks', `${toIndex(index)}-${toSlug(name)}.md`),
    /** Only for a таск that ran out of context. Beside its task file, never elsewhere. */
    handoff: (index: number, name: string): string =>
      inside('tasks', `${toIndex(index)}-${toSlug(name)}-handoff.md`),
    reviewsDir: (): string => inside('reviews'),
    review: (index: number, name: string): string =>
      inside('reviews', `${toIndex(index)}-${toSlug(name)}.md`),
    evidenceDir: (executionId: string): string =>
      inside('evidence', toEvidenceId(executionId)),
    evidence: (executionId: string, filename: string): string => {
      if (!/^[A-Za-z0-9._-]+$/.test(filename) || filename === '.' || filename === '..') {
        throw new PathEscapeError(filename);
      }
      return inside('evidence', toEvidenceId(executionId), filename);
    },
    report: (): string => inside('report.md'),
  };
}

export type RunPaths = ReturnType<typeof artifactsIn>;

/**
 * The isolation directory for one таск of a parallel wave — named by the slug,
 * not by `dir`: a name that changed when the run closed would orphan the copy a
 * dying wave left behind. It is a sibling of the
 * project, not a path inside it. **This is the one builder here that leaves the
 * run root on purpose**, so it does not go through `within`: a worktree inside
 * `.maestro/` would put the project's code inside the run's record.
 *
 * The name is derived rather than stored. A path written into the run state is a
 * second source of truth, and a прогон that died mid-wave leaves it pointing at
 * a directory that may no longer exist; computing the same name again finds
 * whatever is actually there.
 */
export function worktree(project: string, slug: string, index: number): string {
  return path.join('..', `${toSlug(project)}-maestro-${toSlug(slug)}-${toIndex(index)}`);
}

/** Convenience for the common case: the paths of the run a state describes. */
export const forState = (state: RunState): RunPaths =>
  state.contractVersion >= 7 ? forDir(runDirName(state)) : forRun(runDirName(state));
