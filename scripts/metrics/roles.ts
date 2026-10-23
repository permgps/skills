// Which role a subagent context played in a прогон, read from the label its
// dispatch carried.
//
// `SKILL.md` asks every dispatch whose host call takes a `description` to open
// it with `maestro:<brief>` — the brief's file name without `.md`, `probe` for
// the preflight probe — and then the таск's id when the dispatch serves one.
// This module turns that label into a role and nothing more. A label it cannot
// read is reported as unattributed with the reason, never matched by
// resemblance: a cost measurement that guesses which context was a reviewer
// would put the guess in the very figure the next sizing decision rests on.
//
// The role map is enumerated against what ships: `roles.test.ts` holds its keys
// to `skills/maestro/prompts/*.md` and to the brief column of
// `docs/spec/dials.md` › *Who Runs On Which Tier*, so a new brief without a
// role fails `npm run check` instead of landing in `unattributed` unnoticed.

import { createLogger } from '../shared/log.ts';

const log = createLogger('metrics');

/** What every Maestro dispatch description opens with. */
export const DISPATCH_PREFIX = 'maestro:';

/** The one dispatch with no brief: preflight's model probe. */
export const PROBE_KEY = 'probe';

/** The roles a measurement reports, in the order it prints them. */
export const ROLES = [
  'orchestrator', 'executor', 'reviewer', 'standards reader', 'gate readers', 'repair', 'acceptance', 'other',
] as const;
export type Role = typeof ROLES[number];

/** A role a dispatch can carry; the orchestrator is the main session and is never dispatched. */
export type DispatchedRole = Exclude<Role, 'orchestrator'>;

/** Brief stem → role. `executor` is refined by `roleOf`; every other key is final. */
export const ROLE_OF_KEY: Readonly<Record<string, DispatchedRole>> = {
  'executor': 'executor',
  'reviewer': 'reviewer',
  'standards-reader': 'standards reader',
  'manifest-reader': 'gate readers',
  'independent-reader': 'gate readers',
  'reference-reader': 'gate readers',
  'spec-architecture-reader': 'gate readers',
  'task-reader': 'gate readers',
  'plan-consistency-reader': 'gate readers',
  'repair-diagnostician': 'repair',
  'strategy-reviewer': 'repair',
  'acceptance-reader': 'acceptance',
  'existing-code-reader': 'other',
  'commit-reader': 'other',
  'technical-researcher': 'other',
  'openspec-writer': 'other',
  [PROBE_KEY]: 'other',
};

export type UnattributedReason = 'no prefix' | 'unknown role key' | 'no description' | 'inline sidechain';

export type DispatchLabel =
  | { roleKey: string; taskId: string | null }
  | { unattributed: UnattributedReason; roleKey?: string };

// Anchored and without nested quantifiers, so a long description costs one
// linear scan; `roles.test.ts` times it on 200 KB.
const LABEL_PATTERN = /^maestro:([a-z0-9-]+)(?:\s+(\S+))?/;

/**
 * The role key and таск id a description carries, or why it carries none.
 *
 * The second token is only a candidate таск id: whether a таск of that id
 * exists is the state's to say, and the caller checks it.
 */
export function parseDispatchLabel(description: string | undefined): DispatchLabel {
  if (description === undefined) {
    log.debug('roles', 'dispatch label absent', { reason: 'no description' });
    return { unattributed: 'no description' };
  }
  const match = LABEL_PATTERN.exec(description);
  if (match === null) {
    log.debug('roles', 'dispatch label unreadable', { reason: 'no prefix' });
    return { unattributed: 'no prefix' };
  }
  const roleKey = match[1] ?? '';
  if (!Object.hasOwn(ROLE_OF_KEY, roleKey)) {
    log.debug('roles', 'dispatch label names no known brief', { roleKey, reason: 'unknown role key' });
    return { unattributed: 'unknown role key', roleKey };
  }
  const taskId = match[2] ?? null;
  log.debug('roles', 'dispatch label parsed', { roleKey, taskId });
  return { roleKey, taskId };
}

/**
 * The role of a context whose label parsed.
 *
 * The state records no repair stage to time a dispatch against — repair runs
 * inside review and acceptance — so an executor context that is not the first
 * for its таск counts as repair. `dials.md` already calls a retry after a failed
 * build attempt a repair, so the two agree. The blind spot: a context handoff
 * continues the same build in a new context, and is counted as repair too.
 */
export function roleOf(roleKey: string, earlierExecutorsOfTask: number): DispatchedRole {
  const role = ROLE_OF_KEY[roleKey] ?? 'other';
  if (role === 'executor' && earlierExecutorsOfTask > 0) return 'repair';
  return role;
}
