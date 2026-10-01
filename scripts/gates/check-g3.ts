#!/usr/bin/env node
// G3 — the gate after the plan phase.
//
// Pass condition, from docs/spec/gates.md: every in-spec требование maps to at
// least one таск, every таск traces back to at least one требование, and a
// reader given exactly what an executor will be given finds each task file
// buildable without asking a question. Two mechanical rules came from a run
// whose repairs kept reopening each other: таски sharing a path in `files` or
// `zone` are ordered by `blockedBy`, and a check's execution owner transitively
// depends on every integration prerequisite of that check.
//
// Both directions of the map, because either alone is worth little. A cut can
// cover every требование and still carry two таски invented along the way; it
// can be perfectly traceable while quietly leaving a требование out. The gate is
// the map, and a map with an unmatched entry on either side is not a map.
//
// The third half is not mechanical — like G2's reader, it is a subagent's
// verdict — so what this script checks is the trace it leaves. The first
// end-to-end прогон is why it exists: four of five task files contradicted
// themselves or left something undefined, every one of them passed the map, and
// the one whose executor had nothing to fall back on shipped wrong.

import { pathToFileURL } from 'node:url';

import { createLogger } from '../shared/log.ts';
import type { RunState } from '../state/contract.ts';
import { validateCompletionRecords } from '../state/verification.ts';
import { runGate, targetFromArgv, type GateFinding } from './cli.ts';

export type { GateFinding };

const log = createLogger('gate-g3');

/**
 * Every таск reachable through `blockedBy` from `id`, the таск itself excluded.
 * A visited set rather than recursion, so a cycle — reported elsewhere — ends the walk.
 */
function upstreamOf(id: string, blockers: Map<string, string[]>): Set<string> {
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

export function checkG3(state: RunState): GateFinding[] {
  const findings: GateFinding[] = [];
  const blockers = new Map(state.tasks.map(task => [task.id, task.blockedBy]));
  const upstream = new Map<string, Set<string>>();
  const ancestors = (id: string): Set<string> => {
    let known = upstream.get(id);
    if (!known) upstream.set(id, known = upstreamOf(id, blockers));
    return known;
  };

  const status = new Map<string, string>();
  for (const requirement of state.requirements) {
    if (requirement.id !== '') status.set(requirement.id, requirement.status);
  }

  // --- forward: every таск traces to требования that exist and are live -----
  const reached = new Set<string>();
  const seenTasks = new Set<string>();
  let edges = 0;

  state.tasks.forEach((task, index) => {
    const taskId = task.id === '' ? `tasks[${index}]` : task.id;

    if (seenTasks.has(taskId)) {
      findings.push({ requirementId: taskId, message: `таск id ${taskId} appears more than once` });
    }
    seenTasks.add(taskId);

    // An empty requirementIds is refused by the state validator before a gate
    // ever sees it; re-checking it here would put one rule in two places.
    for (const requirementId of task.requirementIds) {
      edges += 1;
      const requirementStatus = status.get(requirementId);

      if (requirementStatus === undefined) {
        findings.push({
          requirementId,
          message: `таск ${taskId} traces to ${requirementId}, which is not in the манифест`,
        });
        continue;
      }
      if (requirementStatus !== 'in-spec') {
        findings.push({
          requirementId,
          message: `таск ${taskId} traces to ${requirementId}, which is "${requirementStatus}" `
            + '— building it is work nobody asked for',
        });
        continue;
      }
      reached.add(requirementId);
    }
  });

  // --- backward: every in-spec требование was reached by some таск ----------
  for (const [id, requirementStatus] of status) {
    if (requirementStatus === 'in-spec' && !reached.has(id)) {
      findings.push({
        requirementId: id,
        message: `требование ${id} is in-spec and no таск builds it — it was dropped `
          + 'between the specification and the cut',
      });
    }
  }

  // --- two таски writing one path are ordered, or they collide --------------
  // Waves keep wave-mates apart and say nothing about таски in different waves
  // that never wait for each other: two such таски that share a route file both
  // land, and the second one's review judges the first one's code.
  const writers = new Map<string, string[]>();
  for (const task of state.tasks) {
    for (const path of new Set([...(task.files ?? []), ...(task.zone ?? [])])) {
      writers.set(path, [...(writers.get(path) ?? []), task.id]);
    }
  }
  let collisions = 0;
  const reportedPairs = new Set<string>();
  for (const [path, owners] of writers) {
    for (let i = 0; i < owners.length; i += 1) {
      for (let j = i + 1; j < owners.length; j += 1) {
        const [a, b] = [owners[i]!, owners[j]!];
        if (a === b || ancestors(a).has(b) || ancestors(b).has(a)) continue;
        const pair = [a, b].sort().join('/');
        if (reportedPairs.has(pair)) continue;
        reportedPairs.add(pair);
        collisions += 1;
        findings.push({ requirementId: a,
          message: `таски ${a} and ${b} both write ${path} and neither waits for the other — `
            + `add one to the other's blockedBy, or move ${path} into one таск` });
      }
    }
  }
  log.debug('g3', 'file ownership checked', { paths: writers.size, collisions });

  if (state.contractVersion >= 4 && state.verification) {
    const record = state.verification;
    if (record.version !== 1) {
      for (const violation of validateCompletionRecords(state, record)) findings.push({ requirementId: '',
        message: `${violation.field}: ${violation.message}` });
    }
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
      if (requirementStatus === 'in-spec' && !covered.has(id)) findings.push({ requirementId: id,
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
    log.info('verification', 'ownership graph checked', {
      obligations: obligations.length, checks: record.checks.length, tasks: tasks.size,
    });
  }

  // --- the task-file reader's verdict was recorded, not filed ---------------
  const gate = state.gates.find(entry => entry.id === 'G3');
  if (gate === undefined) {
    findings.push({
      requirementId: '',
      message: 'the run state has no G3 entry — the task-file reader left no verdict',
    });
  } else if (gate.status === 'passed' && gate.findings.length > 0) {
    findings.push({
      requirementId: '',
      message: `G3 is recorded as passed while carrying ${gate.findings.length} finding(s). `
        + 'A gate is never passed with notes: fix each task file, or record the finding as an '
        + 'explicit deferral against a requirement id',
    });
  }

  log.info('g3', 'traceability map built', {
    tasks: state.tasks.length,
    requirements: state.requirements.length,
    inSpec: [...status.values()].filter(value => value === 'in-spec').length,
    edges,
  });

  return findings;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await runGate('check-g3', checkG3, targetFromArgv()));
}
