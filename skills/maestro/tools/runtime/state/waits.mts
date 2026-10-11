// The closed waits of a contract-9 прогон, kept by publication.
//
// The orchestrator only sets and clears `awaiting`; it never writes `waits`.
// One mechanical writer replaces a prose ritual that a forgotten clear would
// break: `sync.mts --publish` compares the published state with the candidate
// and appends the wait that ended. Every `until` comes from the candidate's
// own stamps and never from a clock, so the rule is a pure function and a
// closed wait never ends before it began.

import { isDeepStrictEqual } from 'node:util';

import { createLogger } from '../shared/log.mts';
import type { RunState, Wait } from './contract.mts';
import type { StateViolation } from './validate.mts';

const log = createLogger('state');

/** How a wait ended: the reply was written, a phase moved on under it, or another question replaced it. */
export type WaitClosure = 'cleared' | 'transition' | 'new-question';

export interface KeptWaits {
  state: RunState;
  closed: (Wait & { by: WaitClosure }) | null;
  violations: StateViolation[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const atLeastV9 = (state: unknown): boolean =>
  isRecord(state) && typeof state['contractVersion'] === 'number' && state['contractVersion'] >= 9;

const moment = (raw: unknown): number => typeof raw === 'string' ? Date.parse(raw) : Number.NaN;

/** The later of two stamps, as written; a stamp no reader can parse loses. */
function later(a: string, b: unknown): string {
  return typeof b === 'string' && moment(b) > moment(a) ? b : a;
}

/** The earlier of two stamps, as written; a stamp no reader can parse loses. */
function earlier(a: unknown, b: unknown): unknown {
  if (Number.isNaN(moment(a))) return b;
  if (Number.isNaN(moment(b))) return a;
  return moment(b) < moment(a) ? b : a;
}

/** `id → status` for a list of entries; anything without a string id is skipped. */
function statuses(entries: unknown): Map<string, unknown> {
  const map = new Map<string, unknown>();
  if (!Array.isArray(entries)) return map;
  for (const entry of entries) {
    if (isRecord(entry) && typeof entry['id'] === 'string') map.set(entry['id'], entry['status']);
  }
  return map;
}

function statusesDiffer(before: unknown, after: unknown): boolean {
  const a = statuses(before);
  const b = statuses(after);
  if (a.size !== b.size) return true;
  for (const [id, status] of a) {
    if (!b.has(id) || b.get(id) !== status) return true;
  }
  return false;
}

/**
 * Whether the прогон moved between two writes: the current стадия, any
 * стадия's status, or any таск's status, matched by id, with an entry on one
 * side only counting too. A requirement or gate changing is not a move — the
 * манифест and the gates are settled while the user is being asked.
 */
export function transitioned(previous: RunState, candidate: RunState): boolean {
  return previous.currentStage !== candidate.currentStage
    || statusesDiffer(previous.stages, candidate.stages)
    || statusesDiffer(previous.tasks, candidate.tasks);
}

/**
 * The published state as a contract-9 candidate must become, with the wait
 * that ended appended to `waits`.
 *
 * The base list is the published one only for the same прогон at contract 9;
 * a new run over a closed one, or a first publish, starts with none. A
 * candidate may carry `waits` only as it last read it — absent, the published
 * list, or the list computed here — because the list is kept by publication
 * and a rewritten one would move minutes off every clock on the page.
 */
export function keepWaits(previous: RunState | null, candidate: RunState): KeptWaits {
  if (!atLeastV9(candidate)) return { state: candidate, closed: null, violations: [] };

  const sameRun = previous !== null && atLeastV9(previous) && previous.runId === candidate.runId;
  const base: Wait[] = sameRun && Array.isArray(previous.waits) ? previous.waits : [];
  const open = sameRun && isRecord(previous.awaiting) && typeof previous.awaiting.since === 'string'
    ? previous.awaiting.since : null;
  const asked = isRecord(candidate.awaiting) ? candidate.awaiting.since : undefined;

  let closed: KeptWaits['closed'] = null;
  let dropAwaiting = false;
  if (open !== null) {
    if (asked === undefined) {
      closed = { since: open, until: later(open, candidate.updatedAt), by: 'cleared' };
    } else if (moment(asked) !== moment(open)) {
      closed = { since: open, until: later(open, earlier(asked, candidate.updatedAt)), by: 'new-question' };
    } else if (sameRun && transitioned(previous, candidate)) {
      closed = { since: open, until: later(open, candidate.updatedAt), by: 'transition' };
      dropAwaiting = true;
    } else {
      log.debug('waits', 'wait kept open', { runId: candidate.runId, since: open });
    }
  }

  const computed: Wait[] = closed ? [...base, { since: closed.since, until: closed.until }] : base;
  const carried = (candidate as unknown as Record<string, unknown>)['waits'];
  if (carried !== undefined && !isDeepStrictEqual(carried, base) && !isDeepStrictEqual(carried, computed)) {
    log.debug('waits', 'waits refused', { runId: candidate.runId, carried: Array.isArray(carried) ? carried.length : typeof carried, published: base.length });
    return { state: candidate, closed: null, violations: [{ field: 'waits',
      message: 'waits is kept by sync.mts — publish it as you last read it, or leave it out' }] };
  }

  const state: RunState = { ...candidate };
  if (computed.length) state.waits = computed.map(wait => ({ since: wait.since, until: wait.until }));
  else delete state.waits;
  if (dropAwaiting) delete state.awaiting;
  if (computed.length) log.debug('waits', 'waits carried', { runId: candidate.runId, count: computed.length });
  return { state, closed, violations: [] };
}

/**
 * A later write of the same contract-9 прогон keeps every closed wait as it
 * was: the published list must be a prefix of the next one. `writeState`
 * holds this through `validateStateTransition`, so a writer that bypasses
 * publication cannot drop a wait either.
 */
export function validateWaitsTransition(previous: RunState, next: RunState): StateViolation[] {
  if (!atLeastV9(previous) || !atLeastV9(next) || previous.runId !== next.runId) return [];
  const before = Array.isArray(previous.waits) ? previous.waits : [];
  const after = Array.isArray(next.waits) ? next.waits : [];
  const kept = before.length <= after.length && before.every((wait, index) => isDeepStrictEqual(wait, after[index]));
  if (kept) return [];
  log.debug('waits', 'waits transition refused', { runId: next.runId, before: before.length, after: after.length });
  return [{ field: 'waits', message: 'a closed wait was dropped or rewritten — waits only grows; publish it as you last read it' }];
}
