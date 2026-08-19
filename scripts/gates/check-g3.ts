#!/usr/bin/env node
// G3 — the gate after the plan phase.
//
// Pass condition, from docs/spec/gates.md: every in-spec требование maps to at
// least one таск, every таск traces back to at least one требование, and a
// reader given exactly what an executor will be given finds each task file
// buildable without asking a question.
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
import { runGate, targetFromArgv, type GateFinding } from './cli.ts';

export type { GateFinding };

const log = createLogger('gate-g3');

export function checkG3(state: RunState): GateFinding[] {
  const findings: GateFinding[] = [];

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
