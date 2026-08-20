// Where a прогон's artifacts live inside the target project.
//
// Every builder is pure and takes its date as an argument. A path function that
// reads the clock cannot be tested without freezing time, and a run resumed the
// next morning would silently start writing to a second brief.

import path from 'node:path';

import type { RunState } from './contract.ts';

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

/** `YYYY-MM-DD` from a Date the caller supplies. */
export function toDate(when: Date): string {
  if (Number.isNaN(when.getTime())) throw new RangeError('date is invalid');
  return when.toISOString().slice(0, 10);
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

/** Every path belonging to one feature slug. */
export function forRun(slug: string) {
  const safe = toSlug(slug);
  const dir = within(ROOT, safe);
  const inside = (...segments: string[]): string => within(dir, ...segments);

  return {
    slug: safe,
    dir,
    /** Dated, because a feature slug outlives one sitting. */
    brief: (when: Date): string => inside(`${toDate(when)}-brief.md`),
    manifest: (): string => inside('manifest.md'),
    answers: (): string => inside('answers.md'),
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
    report: (): string => inside('report.md'),
  };
}

export type RunPaths = ReturnType<typeof forRun>;

/**
 * The isolation directory for one таск of a parallel wave — a sibling of the
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
export const forState = (state: RunState): RunPaths => forRun(state.slug);
