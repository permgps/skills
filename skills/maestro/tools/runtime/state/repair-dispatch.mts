// Durable repair capacity reservations. RA remains an observed return, never an intention.
import { isDeepStrictEqual } from 'node:util';
import { createLogger } from '../shared/log.mts';
import { isMoment, type RepairDispatch, type RunState } from './contract.mts';
import type { StateViolation } from './validate.mts';

const log = createLogger('repair-dispatch');
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(text);
const pending = (d: RepairDispatch): boolean => d.status === 'reserved' || d.status === 'dispatched';

export function validateDispatchShape(state: RunState): StateViolation[] {
  const record = state.verification;
  if (!record) return [];
  const raw = record as unknown as Record<string, unknown>;
  if (raw.repairDispatches === undefined && raw.repairAccounting === undefined) return [];
  const errors: StateViolation[] = [];
  const add = (message: string): void => { errors.push({ field: 'verification.repairDispatches', message }); };
  if (record.version !== 3) return [{ field: 'verification.repairDispatches', message: 'repair reservations require verification 3; older records remain unchanged' }];
  const accounting = raw.repairAccounting;
  if (!object(accounting) || !['complete', 'incomplete'].includes(String(accounting.status))
    || !isMoment(accounting.reviewedAt) || !strings(accounting.evidenceIds) || !text(accounting.note)) add('accounting needs status, reviewedAt, evidenceIds and a nonempty inventory note');
  if (!Array.isArray(raw.repairDispatches)) { add('repairDispatches must be an array'); return errors; }
  for (const d of raw.repairDispatches) {
    if (!object(d) || !text(d.id) || !isMoment(d.at) || !text(d.base)
      || !/^[a-f0-9]{7,40}$/i.test(d.base) || !['reserved', 'dispatched', 'returned', 'cancelled'].includes(String(d.status))
      || !object(d.proposal)) { add('dispatch needs id, at, handed base, status and proposal'); continue; }
    const p = d.proposal;
    for (const key of ['id', 'findingId', 'taskId', 'rootFindingId', 'defectId', 'hypothesis', 'diagnosis', 'strategy', 'action', 'repeatKind', 'expectedProgress']) {
      if (!text(p[key])) add(`proposal needs ${key}`);
    }
    for (const key of ['evidenceIds', 'followUpCheckIds', 'readyUpstreamTaskIds', 'blockingPrerequisites', 'unlocksTaskIds']) {
      if (!strings(p[key])) add(`proposal needs string array ${key}`);
    }
    for (const key of ['predecessorId', 'diagnosisDispatchId', 'diagnosisReturnId', 'novelty']) {
      if (p[key] !== undefined && !text(p[key])) add(`proposal ${key} must be nonempty text`);
    }
    if (p.outcome !== undefined || p.commit !== undefined || p.at !== undefined) add('a proposal carries no outcome, commit or execution time');
    if (d.settledAt !== undefined && !isMoment(d.settledAt)) add('settledAt must be an ISO moment');
    if (d.cancellationReason !== undefined && !text(d.cancellationReason)) add('cancellation reason must be nonempty');
    if (d.executionIds !== undefined && !strings(d.executionIds)) add('executionIds must be a string array');
  }
  return errors;
}

export function validateDispatchRecord(state: RunState): StateViolation[] {
  const errors = validateDispatchShape(state);
  if (errors.length || state.verification?.version !== 3 || !state.verification.repairDispatches) return errors;
  const r = state.verification;
  const rows = r.repairDispatches!;
  const add = (message: string): void => { errors.push({ field: 'verification.repairDispatches', message }); };
  if (new Set(rows.map(d => d.id)).size !== rows.length || new Set(rows.map(d => d.proposal.id)).size !== rows.length) add('dispatch and proposed attempt IDs must be unique');
  for (const id of r.repairAccounting!.evidenceIds) if (!r.evidence.some(e => e.id === id)) add(`accounting evidence ${id} is missing`);
  const active = rows.filter(pending);
  if (active.length && r.repairAccounting!.status !== 'complete') add('remaining budget is unknown; reconcile accounting before reserving repairs');
  if (r.repairAttempts.length + active.length > r.repairLimits.total) add('returned attempts plus pending reservations exceed the total budget');
  if (new Set(active.map(d => d.proposal.rootFindingId)).size !== active.length) add('only one outstanding repair per stable root is allowed');
  const roots = new Map<string, number>();
  for (const a of r.repairAttempts) roots.set(a.rootFindingId, (roots.get(a.rootFindingId) ?? 0) + 1);
  for (const d of active) roots.set(d.proposal.rootFindingId, (roots.get(d.proposal.rootFindingId) ?? 0) + 1);
  for (const [root, count] of roots) if (count > r.repairLimits.perFinding) add(`returned attempts plus reservations exceed the budget for ${root}`);
  for (const d of rows) {
    const p = d.proposal;
    const defect = r.defects.find(df => df.id === p.defectId);
    if (!defect || defect.parentTaskId !== p.taskId || defect.rootFindingId !== p.rootFindingId) add(`${d.id} must name its defect's task and stable root`);
    if (!r.findings.some(f => f.id === p.findingId)) add(`${d.id} names an unknown finding`);
    const root = r.findings.find(f => f.id === p.rootFindingId);
    if (!root || root.supersedes) add(`${d.id} must retain the original root finding`);
    const attempt = r.repairAttempts.find(a => a.id === p.id);
    if (d.status === 'returned') {
      if (!attempt || !('defectId' in attempt)) add(`${d.id} needs its actual RA result`);
      else {
        const { at, outcome: _outcome, commit: _commit, ...actual } = attempt;
        if (!isDeepStrictEqual(actual, p) || Date.parse(at) < Date.parse(d.at) || Date.parse(at) > Date.parse(d.settledAt ?? '')) add(`${d.id} result must match its proposal and follow reservation`);
      }
      if (!d.executionIds?.length || d.executionIds.some(id => {
        const e = r.executions.find(e => e.id === id);
        return !e || !p.followUpCheckIds.includes(e.checkId) || Date.parse(e.executedAt) < Date.parse(d.at) || Date.parse(e.executedAt) > Date.parse(d.settledAt ?? '') || !e.evidenceIds.length;
      })) add(`${d.id} needs actual follow-up executions with evidence`);
      if (!d.settledAt || d.cancellationReason) add(`${d.id} needs a settlement time, not cancellation`);
    } else {
      if (attempt) add(`${d.id} result requires returned settlement in the same publication`);
      if (d.executionIds !== undefined) add(`${d.id} has no returned execution list`);
      if (d.status === 'cancelled') {
        if (!d.settledAt || !d.cancellationReason) add(`${d.id} cancellation needs time and reason`);
      } else if (d.settledAt || d.cancellationReason) add(`${d.id} is still pending`);
    }
    if (d.settledAt && Date.parse(d.settledAt) < Date.parse(d.at)) add(`${d.id} settlement precedes reservation`);
  }
  if (state.lifecycle === 'closed' && active.length) add('reconcile pending dispatches before closing; unknown work is not cancelled');
  log.debug('validate', 'repair reservations checked', { pending: active.length, returned: r.repairAttempts.length, errors: errors.length });
  return errors;
}

export function validateDispatchTransition(previous: RunState | undefined, next: RunState,
  admit: (state: RunState, dispatch: RepairDispatch) => StateViolation[]): StateViolation[] {
  const errors = validateDispatchRecord(next);
  const before = previous?.verification;
  const after = next.verification;
  const old = before?.version === 3 ? before.repairDispatches : undefined;
  if (after?.version !== 3 || after.repairDispatches === undefined) {
    if (old) errors.push({ field: 'verification.repairDispatches', message: 'an enabled ledger cannot be removed' });
    return errors;
  }
  if (errors.length) return errors;
  const add = (message: string): void => { errors.push({ field: 'verification.repairDispatches', message }); };
  if (old) {
    for (const d of old) {
      const current = after.repairDispatches.find(item => item.id === d.id);
      if (!current) { add(`published dispatch ${d.id} cannot be removed`); continue; }
      const { status: _status, settledAt: _at, executionIds: _runs, cancellationReason: _reason, ...identity } = d;
      const { status: _newStatus, settledAt: _newAt, executionIds: _newRuns, cancellationReason: _newReason, ...nextIdentity } = current;
      const allowed = d.status === 'reserved' ? ['reserved', 'dispatched', 'cancelled']
        : d.status === 'dispatched' ? ['dispatched', 'returned'] : [d.status];
      if (!isDeepStrictEqual(identity, nextIdentity) || !allowed.includes(current.status)
        || d.status === current.status && !isDeepStrictEqual(d, current)) add(`${d.id} only permits reserve, dispatch, then actual return; only undispatched work may cancel`);
      if (d.status === 'reserved' && current.status === 'dispatched') errors.push(...admit(next, current));
    }
  } else if (previous) {
    if (after.repairAccounting!.status === 'complete' && !after.repairAccounting!.evidenceIds.length) add('legacy activation needs inventory evidence or incomplete accounting; counters are not an inventory');
  }
  if (before?.version === 3 && before.repairAccounting?.status === 'incomplete' && after.repairAccounting!.status === 'complete' && !after.repairAccounting!.evidenceIds.length) add('completing an inventory requires preserved evidence');
  if (before?.version === 3 && before.repairAccounting?.status === 'complete'
    && !isDeepStrictEqual(before.repairAccounting, after.repairAccounting)) add('completed accounting inventory is immutable');
  for (const d of after.repairDispatches) {
    if (old?.some(item => item.id === d.id)) continue;
    if (d.status !== 'reserved') add(`${d.id} must first be published reserved`);
    if (before?.repairAttempts.some(a => a.id === d.proposal.id)) add(`${d.id} cannot reserve an existing result`);
    errors.push(...admit(next, d));
  }
  const recovering = previous !== undefined && (before?.version !== 3 || before.repairAccounting?.status !== 'complete')
    && after.repairAccounting!.status === 'complete' && after.repairAccounting!.evidenceIds.length > 0
    && isDeepStrictEqual(previous.tasks, next.tasks) && !after.repairDispatches.some(pending)
    && after.repairDispatches.every(d => old?.some(item => item.id === d.id));
  for (const a of after.repairAttempts) {
    if (before?.repairAttempts.some(old => old.id === a.id)) continue;
    const recovered = recovering && Date.parse(a.at) <= Date.parse(previous!.updatedAt!)
      && a.evidenceIds.length > 0 && a.evidenceIds.every(id => after.repairAccounting!.evidenceIds.includes(id))
      && a.followUpCheckIds.every(id => after.executions.some(e => e.checkId === id
        && Date.parse(e.executedAt) >= Date.parse(a.at) && Date.parse(e.executedAt) <= Date.parse(previous!.updatedAt!)
        && e.evidenceIds.length > 0 && e.evidenceIds.every(id => after.repairAccounting!.evidenceIds.includes(id))));
    if (recovered) continue;
    const receipt = after.repairDispatches.find(d => d.proposal.id === a.id && d.status === 'returned');
    if (!receipt || !old?.some(d => d.id === receipt.id && d.status === 'dispatched')) add(`attempt ${a.id} needs a previously dispatched reservation and actual return`);
  }
  for (const task of next.tasks) {
    const earlier = previous?.tasks.find(t => t.id === task.id);
    const outstanding = after.repairDispatches.filter(d => d.proposal.taskId === task.id && pending(d));
    if (outstanding.length && ['done', 'review'].includes(task.status)) add(`task ${task.id} still has unsettled repairs`);
    if (earlier?.status === 'repair' && ['running', 'review', 'done'].includes(task.status)
      && !after.repairDispatches.some(d => d.proposal.taskId === task.id && (task.status === 'running' ? d.status === 'dispatched' : d.status === 'returned' && !old?.some(prior => prior.id === d.id && prior.status === 'returned')))) add(`task ${task.id} needs its repair dispatch/return receipt`);
  }
  for (const error of errors) log.error('transition', error.message, { field: error.field });
  return errors;
}
