#!/usr/bin/env node
// G1 — the gate after брифинг.
//
// Pass condition, from docs/spec/gates.md: every требование has a status, and
// none is left open without a recorded reason.
//
// This is the mechanical half. The other half — whether the recorded reason is
// a real answer or a placeholder somebody typed to get past the gate — is the
// phase file's business, because it needs the брифинг in front of it.

import { pathToFileURL } from 'node:url';

import { createLogger } from '../shared/log.ts';
import type { RunState, RequirementStatus } from '../state/contract.ts';
import { hasFreshManifestAudit } from '../state/verification.ts';
import { runGate, targetFromArgv, type GateFinding } from './cli.ts';

export type { GateFinding };

const log = createLogger('gate-g1');

/** Statuses that are incomplete without a reason. */
const REASON_REQUIRED: RequirementStatus[] = ['open', 'deferred', 'dropped'];

export function checkG1(state: RunState): GateFinding[] {
  const findings: GateFinding[] = [];
  const counts = new Map<string, number>();
  const seen = new Set<string>();

  state.requirements.forEach((requirement, index) => {
    const id = requirement.id === '' ? `requirements[${index}]` : requirement.id;
    counts.set(requirement.status, (counts.get(requirement.status) ?? 0) + 1);

    if (seen.has(id)) {
      findings.push({ requirementId: id, message: `requirement id ${id} appears more than once` });
    }
    seen.add(id);

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

  if (state.contractVersion >= 5 && (!state.verification || state.verification.version === 1
    || !hasFreshManifestAudit(state.verification, state.requirements.map(item => item.id)) || !state.verification.scopeBaseline)) {
    findings.push({ requirementId: '', message: 'G1 requires a fresh independent source audit and frozen original agreement' });
    log.warn('audit', 'source agreement is not established', { runId: state.runId });
  }
  log.info('g1', 'requirements checked', {
    total: state.requirements.length,
    ...Object.fromEntries(counts),
  });

  return findings;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await runGate('check-g1', checkG1, targetFromArgv()));
}
