#!/usr/bin/env node
// G2 — the gate after the specification phase.
//
// Pass condition, from docs/spec/gates.md: every live требование is in-spec,
// deferred or dropped with zero left open, and an independent reader given only
// brief.md and spec.md finds nothing missing.
//
// Only the first half is mechanical. The reader's half cannot be a script — it
// needs the бриф and the spec read by something that has seen neither the
// манифест nor the reasoning behind them. What this file can check is that its
// verdict was recorded and acted on rather than filed as a note, because "passed
// with notes" is the failure mode the gate exists to prevent.

import { pathToFileURL } from 'node:url';

import { createLogger } from '../shared/log.ts';
import type { RunState, RequirementStatus } from '../state/contract.ts';
import { runGate, targetFromArgv, type GateFinding } from './cli.ts';

export type { GateFinding };

const log = createLogger('gate-g2');

/** Statuses a требование may still hold once the specification is written. */
const SETTLED: RequirementStatus[] = ['in-spec', 'deferred', 'dropped'];

/** Of those, the ones that are only settled if the user's reason came with them. */
const REASON_REQUIRED: RequirementStatus[] = ['deferred', 'dropped'];

export function checkG2(state: RunState): GateFinding[] {
  const findings: GateFinding[] = [];
  const counts = new Map<string, number>();

  state.requirements.forEach((requirement, index) => {
    const id = requirement.id === '' ? `requirements[${index}]` : requirement.id;
    counts.set(requirement.status, (counts.get(requirement.status) ?? 0) + 1);

    if (!SETTLED.includes(requirement.status)) {
      findings.push({
        requirementId: id,
        message: `требование ${id} is still "${requirement.status}" — the specification `
          + 'left it undecided rather than deferring or dropping it',
      });
      return;
    }

    if (REASON_REQUIRED.includes(requirement.status)
      && (requirement.reason === undefined || requirement.reason.trim() === '')) {
      findings.push({
        requirementId: id,
        message: `требование ${id} is "${requirement.status}" with no recorded reason`,
      });
    }
  });

  if (state.requirements.length === 0) {
    findings.push({
      requirementId: '',
      message: 'the манифест has no требования — nothing was recorded from the бриф',
    });
  }

  // --- the independent reader's verdict was recorded, not filed --------------
  const gate = state.gates.find(entry => entry.id === 'G2');
  if (gate === undefined) {
    findings.push({
      requirementId: '',
      message: 'the run state has no G2 entry — the independent reader left no verdict',
    });
  } else if (gate.status === 'passed' && gate.findings.length > 0) {
    findings.push({
      requirementId: '',
      message: `G2 is recorded as passed while carrying ${gate.findings.length} finding(s). `
        + 'A gate is never passed with notes: act on each one, or record it as an explicit '
        + 'deferral against a requirement id',
    });
  }

  log.info('g2', 'requirements checked', {
    total: state.requirements.length,
    ...Object.fromEntries(counts),
  });

  return findings;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await runGate('check-g2', checkG2, targetFromArgv()));
}
