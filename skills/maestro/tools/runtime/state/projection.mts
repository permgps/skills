// Read-only presentation of verification and historical state.
//
// Old runs remain exactly as written. A separate explicit resume conversion
// starts an explicit versioned candidate and never fabricates passing evidence.

import { isDeepStrictEqual } from 'node:util';

import { createLogger } from '../shared/log.mts';
import { type Debt, type RunState, type TaskEntry, type VerificationRecord } from './contract.mts';
import { validateStateTransition } from './closure.mts';
import { deriveVerification, deriveScopeProgress, hasFreshManifestAudit, type ScopeProgress, type VerificationSummary } from './verification.mts';

const log = createLogger('state');

export interface StateProjection {
  scopeProgress: ScopeProgress;
  completionSafeguards: 'established' | 'not-established';
  legacy: boolean;
  verificationEstablished: boolean;
  lifecycle: 'active' | 'closed' | 'historical';
  outcome?: string;
  g4: 'passed' | 'failed' | 'pending' | 'historical';
  summary?: VerificationSummary;
  notice?: string;
}

export interface AcceptanceReportProjection {
  scopeProgress: ScopeProgress;
  lifecycle: StateProjection['lifecycle'];
  outcome?: string;
  g4: StateProjection['g4'];
  verificationEstablished: boolean;
  rows: Array<{ requirementId: string; planningStatus: string; result: string;
    obligationIds: string[]; findingIds: string[] }>;
  staleCheckIds: string[];
  openPromiseIds: string[];
  acceptedExceptionIds: string[];
}

/** Report and closure text consume this data rather than restating a verdict. */
export function projectAcceptanceReport(state: RunState): AcceptanceReportProjection {
  const projected = projectState(state);
  const record = state.verification;
  return {
    scopeProgress: projected.scopeProgress,
    lifecycle: projected.lifecycle,
    ...(projected.outcome ? { outcome: projected.outcome } : {}),
    g4: projected.g4,
    verificationEstablished: projected.verificationEstablished,
    rows: state.requirements.map(requirement => ({
      requirementId: requirement.id,
      planningStatus: requirement.status,
      result: projected.summary?.requirementResults[requirement.id] ?? 'not established',
      obligationIds: record?.obligations.filter(item => item.targetRevision === record.targetRevision
        && item.requirementIds.includes(requirement.id)).map(item => item.id) ?? [],
      findingIds: record?.findings.filter(item => item.status === 'open'
        && item.requirementIds.includes(requirement.id)).map(item => item.id) ?? [],
    })),
    staleCheckIds: Object.entries(projected.summary?.checkResults ?? {})
      .filter(([, result]) => result === 'stale').map(([id]) => id),
    openPromiseIds: record?.promisedWork.filter(item => item.status === 'open').map(item => item.id) ?? [],
    acceptedExceptionIds: record?.decisions.filter(item => item.kind === 'accepted_exception')
      .map(item => item.id) ?? [],
  };
}

export function formatAcceptanceTable(projection: AcceptanceReportProjection): string {
  const header = '| Requirement | Planning | Verification | Obligations | Open findings |';
  const divider = '|---|---|---|---|---|';
  const rows = projection.rows.map(row => `| ${row.requirementId} | ${row.planningStatus} | ${row.result} | ${row.obligationIds.join(', ') || '—'} | ${row.findingIds.join(', ') || '—'} |`);
  return [header, divider, ...rows].join('\n');
}

/** A historical gate never becomes a verified delivery just because it is green. */
export function projectState(state: RunState): StateProjection {
  const scopeProgress = deriveScopeProgress(state);
  if (state.contractVersion < 4 || !state.verification) {
    const historicalG4 = state.gates.find(gate => gate.id === 'G4')?.status ?? 'historical';
    log.warn('project', 'legacy verification is not established', {
      runId: state.runId, contractVersion: state.contractVersion, historicalG4,
    });
    return {
      scopeProgress, completionSafeguards: 'not-established',
      legacy: true,
      verificationEstablished: false,
      lifecycle: 'historical',
      g4: historicalG4,
      notice: 'verification not established',
    };
  }
  const summary = deriveVerification(state);
  return {
    scopeProgress,
    completionSafeguards: state.verification.version !== 1 && !!state.verification.scopeBaseline && hasFreshManifestAudit(state.verification, state.requirements.map(item => item.id)) ? 'established' : 'not-established',
    legacy: false,
    verificationEstablished: state.lifecycle === 'closed' && state.outcome === 'completed'
      && summary.g4 === 'passed',
    lifecycle: state.lifecycle ?? 'active',
    ...(state.outcome ? { outcome: state.outcome } : {}),
    g4: summary.g4,
    summary,
  };
}

/**
 * The caller reconstructs obligations and open findings from current sources.
 * This function refuses a supplied "passing" history rather than laundering a
 * legacy `finishedAt` or historical gate into contract-4 success.
 */
export interface LegacyReconstruction {
  tasks: TaskEntry[];
  debt: Debt;
  additions: string[];
}

export function prepareLegacyResume(
  state: RunState,
  candidate: VerificationRecord,
  reconstruction?: LegacyReconstruction,
): RunState {
  const target = { 1: 4, 2: 5, 3: 6 }[candidate.version];
  if (state.contractVersion >= 6 || (state.contractVersion === 5 && candidate.version !== 3)
    || (state.contractVersion === 4 && candidate.version === 1)) throw new Error('resume conversion accepts historical guarantees only');
  if (candidate.version === 3) {
    const carried = state.verification;
    if (!isDeepStrictEqual([...candidate.inheritedExecutionIds].sort(), (carried?.executions ?? []).map(item => item.id).sort())
      || !isDeepStrictEqual([...candidate.inheritedAttemptIds].sort(), (carried?.repairAttempts ?? []).map(item => item.id).sort())
      || candidate.readiness.length || candidate.defects.length || candidate.strategyReviews.length) {
      throw new Error('v6 resume names carried history as inherited and infers no readiness, defect or strategy review');
    }
  }
  if (state.contractVersion < 4 && (candidate.executions.length > 0
    || candidate.acceptanceRounds.length > 0
    || candidate.coverageReviews.some(item => item.status === 'complete'))) {
    throw new Error('legacy resume needs fresh executions and coverage review');
  }
  if (state.contractVersion === 4) {
    const prior = state.verification!;
    if (candidate.acceptanceInputDigest === prior.acceptanceInputDigest
      || candidate.executions.some(item => !prior.executions.some(old => isDeepStrictEqual(old, item)))
      || candidate.acceptanceRounds.some(item => !prior.acceptanceRounds.some(old => isDeepStrictEqual(old, item)))) {
      throw new Error('v5 resume preserves historical executions/rounds and needs a fresh acceptance input identity');
    }
  }
  if (state.contractVersion < 5 && candidate.version !== 1 && (candidate.scopeBaseline || candidate.manifestAudits.some(item => item.result === 'passed')
    || candidate.negativeControls.some(item => item.result === 'passed'))) {
    throw new Error('v5 resume needs fresh independent audit and agreement; no inferred safeguards');
  }
  const oldFindings = state.gates.find(gate => gate.id === 'G4')?.findings ?? [];
  if (oldFindings.length > 0 && candidate.findings.length < oldFindings.length) {
    throw new Error('legacy G4 findings must be reconstructed as open findings');
  }
  if (candidate.findings.some(item => item.status !== 'open' && !state.verification?.findings.some(old => isDeepStrictEqual(old, item)))) {
    throw new Error('legacy findings remain open until fresh evidence resolves them');
  }
  if (!reconstruction && (state.contractVersion < 3 || !state.debt || !state.additions
    || state.tasks.some(task => !task.commits || !task.zone || !task.wave))) {
    throw new Error('legacy planning, debt, and additions must be reconstructed from run artifacts');
  }
  // A contract-5 run already earned its safeguards; only an older one re-earns G1.
  const gates = state.contractVersion === 5 ? [...state.gates] : state.gates.map(gate => gate.id === 'G4' || (candidate.version !== 1 && gate.id === 'G1')
    ? { ...gate, status: 'pending' as const } : gate);
  if (!gates.some(gate => gate.id === 'G4')) gates.push({ id: 'G4', status: 'pending', findings: [] });
  log.info('resume', 'prepared legacy candidate without inferred passes', {
    runId: state.runId, oldVersion: state.contractVersion, targetRevision: candidate.targetRevision,
  });
  const {
    finishedAt: _finishedAt, interruptedAt: _interruptedAt,
    outcome: _outcome, stopReason: _stopReason, verification: _verification,
    ...rest
  } = state;
  const resumed: RunState = {
    ...rest,
    tasks: reconstruction?.tasks ?? state.tasks,
    debt: reconstruction?.debt ?? state.debt!,
    additions: reconstruction?.additions ?? state.additions!,
    contractVersion: target,
    lifecycle: 'active',
    verification: candidate,
    gates,
    updatedAt: new Date().toISOString(),
  };
  if (validateStateTransition(state, resumed).length > 0) {
    throw new Error('resume must retain the published legacy graph; reconstruct missing metadata from actual artifacts');
  }
  return resumed;
}
