// Shared pure G3 graph rules. Publication must not trust a passed label alone.
import { isDeepStrictEqual } from 'node:util';
import { createLogger } from '../shared/log.mts';
import type { RunState } from './contract.mts';
import type { StateViolation } from './validate.mts';
const log = createLogger('plan-graph');
const BUILT: readonly string[] = ['in-spec', 'placeholder'];
export interface GraphFinding { requirementId: string; message: string }
export function upstreamOf(id: string, blockers: Map<string, string[]>): Set<string> {
  const reached = new Set<string>();
  const pending = [...(blockers.get(id) ?? [])];
  while (pending.length > 0) {
    const next = pending.pop()!;
    if (next === id || reached.has(next)) continue;
    reached.add(next);
    pending.push(...(blockers.get(next) ?? []));
  }
  return reached;
}

export function checkPlanGraph(state: RunState): GraphFinding[] {
  if (state.contractVersion < 4 || !state.verification) return [];
  const record = state.verification;
  const findings: GraphFinding[] = [];
  const status = new Map(state.requirements.map(r => [r.id, r.status]));
  const blockers = new Map(state.tasks.map(t => [t.id, t.blockedBy]));
  const ancestors = (id: string): Set<string> => upstreamOf(id, blockers);
  const tasks = new Map(state.tasks.map(task => [task.id, task]));
  const checks = new Map(record.checks.map(check => [check.id, check]));
  const obligations = record.obligations.filter(item => item.targetRevision === record.targetRevision);
  const covered = new Set<string>();
  for (const obligation of obligations) {
    for (const requirementId of obligation.requirementIds) covered.add(requirementId);
    const requiredChecks = obligation.checkIds.map(id => checks.get(id)).filter(check => check?.required);
    if (requiredChecks.length === 0) findings.push({ requirementId: obligation.requirementIds[0] ?? '',
      message: `obligation ${obligation.id} has no required executable check` });
    for (const ownerId of obligation.implementationTaskIds) {
      const owner = tasks.get(ownerId);
      if (!owner || !obligation.requirementIds.some(id => owner.requirementIds.includes(id))) {
        findings.push({ requirementId: obligation.requirementIds[0] ?? '',
          message: `obligation ${obligation.id} has no matching implementation owner ${ownerId}` });
      }
    }
    for (const check of requiredChecks) {
      if (!check) continue;
      const executionOwner = check.executionTaskId ? tasks.get(check.executionTaskId) : undefined;
      if (!executionOwner || !obligation.requirementIds.some(id => executionOwner.requirementIds.includes(id))) {
        findings.push({ requirementId: obligation.requirementIds[0] ?? '',
          message: `check ${check.id} has no matching execution owner` });
      }
      for (const dependency of obligation.implementationTaskIds) {
        if (!check.integrationDependencies.includes(dependency)) findings.push({
          requirementId: obligation.requirementIds[0] ?? '',
          message: `check ${check.id} omits implementation prerequisite ${dependency}` });
      }
      for (const dependency of check.integrationDependencies) {
        if (!tasks.has(dependency)) findings.push({ requirementId: obligation.requirementIds[0] ?? '',
          message: `check ${check.id} has missing integration prerequisite ${dependency}` });
        else if (executionOwner && dependency !== executionOwner.id
          && !ancestors(executionOwner.id).has(dependency)) findings.push({
          requirementId: obligation.requirementIds[0] ?? '',
          message: `execution owner ${executionOwner.id} of check ${check.id} does not transitively depend on `
            + `integration prerequisite ${dependency} — add ${dependency} to the blockedBy chain of ${executionOwner.id}` });
      }
      if (check.method.includes('source') && /browser|pointer|keyboard|hover|visible/i.test(obligation.expectation)) {
        findings.push({ requirementId: obligation.requirementIds[0] ?? '',
          message: `source-only check ${check.id} cannot establish UI behavior ${obligation.id}` });
      }
    }
  }
  for (const [id, requirementStatus] of status) {
    if (BUILT.includes(requirementStatus) && !covered.has(id)) findings.push({ requirementId: id,
      message: `requirement ${id} has no current observable obligation` });
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      findings.push({ requirementId: id, message: `task dependency cycle includes ${id}` });
      return;
    }
    visiting.add(id);
    for (const dependency of tasks.get(id)?.blockedBy ?? []) {
      if (!tasks.has(dependency)) findings.push({ requirementId: id,
        message: `task ${id} has missing prerequisite ${dependency}` });
      else visit(dependency);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of tasks.keys()) visit(id);

  log.debug('check', 'verification ownership checked', { obligations: record.obligations.length, checks: record.checks.length, findings: findings.length });
  return findings;
}

export function validatePlanPublication(next: RunState, previous?: RunState): StateViolation[] {
  if (!next.gates.some(g => g.id === 'G3' && g.status === 'passed')) return [];
  if (previous && isDeepStrictEqual(previous, next)) return [];
  const work = (state: RunState) => ({ tasks: state.tasks, requirements: state.requirements,
    gates: state.gates, lifecycle: state.lifecycle, outcome: state.outcome, verification: state.verification });
  if (previous && isDeepStrictEqual(work(previous), work(next))) return [];
  const errors = checkPlanGraph(next).map(f => ({ field: `verification.plan[${f.requirementId}]`, message: f.message }));
  for (const error of errors) log.error('publish', error.message, { field: error.field });
  return errors;
}
