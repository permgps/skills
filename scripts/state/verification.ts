// Pure verification aggregation for a coherent contract-4 state.
//
// This module never reads files. Filesystem identity is checked at the read and
// write boundaries, while this module keeps one deterministic result rule for
// gates, reports, metrics, and the dashboard projection.

import { createLogger } from '../shared/log.ts';
import { STAGE_IDS } from './contract.ts';
import type {
  CheckExecution, CheckResult, RunState, VerificationCheck,
  VerificationObligation, VerificationRecord, VerificationResult,
} from './contract.ts';

const log = createLogger('state');

export interface VerificationSummary {
  checkResults: Record<string, CheckResult>;
  obligationResults: Record<string, VerificationResult>;
  requirementResults: Record<string, VerificationResult>;
  failedIds: string[];
  incompleteIds: string[];
  g4: 'passed' | 'failed' | 'pending';
  currentRoundId?: string;
}

/** JSON objects in state have a stable serialization independent of key order. */
export function sameFingerprint(left: unknown, right: unknown): boolean {
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  const keys = ['reference', 'build', 'data', 'runtime', 'acceptanceInput'];
  if (!keys.every(key => a[key] === b[key])) return false;
  const pathsA = a['relevantPaths'];
  const pathsB = b['relevantPaths'];
  const hashesA = a['inputHashes'];
  const hashesB = b['inputHashes'];
  if (!Array.isArray(pathsA) || !Array.isArray(pathsB)
    || !hashesA || !hashesB || typeof hashesA !== 'object' || typeof hashesB !== 'object') return false;
  const paths = [...new Set([...pathsA, ...pathsB])].sort();
  return pathsA.length === pathsB.length
    && pathsA.every(path => pathsB.includes(path))
    && paths.every(path => (hashesA as Record<string, unknown>)[String(path)]
      === (hashesB as Record<string, unknown>)[String(path)]);
}

function effectiveExecution(
  check: VerificationCheck,
  executions: CheckExecution[],
): CheckExecution | undefined {
  const candidates = executions.filter(item => item.checkId === check.id);
  const superseded = new Set(candidates.flatMap(item => item.supersedes ? [item.supersedes] : []));
  return candidates.filter(item => !superseded.has(item.id))
    .sort((a, b) => b.executedAt.localeCompare(a.executedAt) || b.id.localeCompare(a.id))[0];
}

function checkResult(check: VerificationCheck, record: VerificationRecord): CheckResult {
  const execution = effectiveExecution(check, record.executions);
  if (!execution) return 'not_run';
  if (!sameFingerprint(execution.fingerprint, check.currentFingerprint)) return 'stale';
  return execution.result;
}

function obligationResult(
  obligation: VerificationObligation,
  record: VerificationRecord,
  checkResults: Record<string, CheckResult>,
): VerificationResult {
  const contradicted = record.findings.some(finding => finding.status === 'open'
    && finding.obligationIds.includes(obligation.id));
  const required = record.checks.filter(check => check.required
    && obligation.checkIds.includes(check.id));
  if (contradicted || required.some(check => checkResults[check.id] === 'failed')) return 'failed';
  if (obligation.discovery === 'unresolved' || required.length === 0) return 'incomplete';
  return required.every(check => checkResults[check.id] === 'passed') ? 'passed' : 'incomplete';
}

/** The current target only; retained old revisions never masquerade as coverage. */
export function deriveVerification(state: RunState): VerificationSummary {
  const record = state.verification;
  if (!record) throw new Error('contract-4 verification record is missing');

  log.debug('derive', 'deriving current verification', {
    runId: state.runId,
    targetRevision: record.targetRevision,
    obligations: record.obligations.length,
  });

  const currentObligations = record.obligations.filter(item => item.targetRevision === record.targetRevision);
  const checkResults: Record<string, CheckResult> = {};
  for (const check of record.checks) checkResults[check.id] = checkResult(check, record);

  const obligationResults: Record<string, VerificationResult> = {};
  for (const obligation of currentObligations) {
    obligationResults[obligation.id] = obligationResult(obligation, record, checkResults);
  }

  const requirementResults: Record<string, VerificationResult> = {};
  for (const requirement of state.requirements) {
    if (requirement.status === 'dropped' || requirement.status === 'deferred') continue;
    const obligations = currentObligations.filter(item => item.requirementIds.includes(requirement.id));
    const openFinding = record.findings.some(item => item.status === 'open'
      && item.requirementIds.includes(requirement.id));
    const reviews = record.coverageReviews.filter(item => item.requirementId === requirement.id
      && item.inputDigest === record.acceptanceInputDigest
      && item.targetRevision === record.targetRevision);
    const latestReview = reviews.sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))[0];
    const results = obligations.map(item => obligationResults[item.id]);
    if (openFinding || results.includes('failed')) requirementResults[requirement.id] = 'failed';
    else if (obligations.length === 0 || !latestReview || latestReview.status !== 'complete'
      || results.includes('incomplete')) requirementResults[requirement.id] = 'incomplete';
    else requirementResults[requirement.id] = 'passed';
  }

  const failedIds = Object.entries(requirementResults)
    .filter(([, result]) => result === 'failed').map(([id]) => id);
  const incompleteIds = Object.entries(requirementResults)
    .filter(([, result]) => result === 'incomplete').map(([id]) => id);
  const rounds = record.acceptanceRounds.filter(item => item.inputDigest === record.acceptanceInputDigest
    && item.targetRevision === record.targetRevision);
  const latestRound = rounds.sort((a, b) => b.performedAt.localeCompare(a.performedAt))[0];
  const requiredChecks = record.checks.filter(check => check.required
    && currentObligations.some(obligation => obligation.checkIds.includes(check.id)));
  const roundCurrent = latestRound !== undefined
    && record.references.filter(reference => reference.role === 'authoritative_behavior')
      .every(reference => latestRound.referenceIds.includes(reference.id))
    && requiredChecks.every(check => {
      const execution = effectiveExecution(check, record.executions);
      return execution !== undefined && latestRound.executionIds.includes(execution.id)
        && sameFingerprint(execution.fingerprint, check.currentFingerprint);
    })
    && record.coverageReviews.filter(review => review.inputDigest === record.acceptanceInputDigest
      && review.targetRevision === record.targetRevision
      && requirementResults[review.requirementId] !== undefined)
      .every(review => latestRound.coverageReviewIds.includes(review.id))
    && record.findings.filter(finding => finding.status === 'open')
      .every(finding => latestRound.findingIds.includes(finding.id));
  const promised = record.promisedWork.some(item => item.status === 'open');
  const g4 = failedIds.length > 0 ? 'failed'
    : Object.keys(requirementResults).length === 0 || incompleteIds.length > 0
      || !roundCurrent || promised ? 'pending' : 'passed';

  log.debug('derive', 'verification derived', {
    failedIds, incompleteIds, g4, currentChecks: Object.keys(checkResults).length,
  });
  return {
    checkResults, obligationResults, requirementResults, failedIds, incompleteIds, g4,
    ...(roundCurrent ? { currentRoundId: latestRound!.id } : {}),
  };
}

export interface VerificationViolation {
  field: string;
  message: string;
}

const recordValue = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Structural checks run before any typed graph traversal or aggregation. */
function validateShape(value: unknown): VerificationViolation[] {
  const errors: VerificationViolation[] = [];
  const add = (field: string, message: string): void => { errors.push({ field, message }); };
  if (!recordValue(value)) return [{ field: 'verification', message: 'verification must be an object' }];
  if (value['version'] !== 1) add('verification.version', 'verification version must be 1');
  if (!Number.isInteger(value['targetRevision']) || Number(value['targetRevision']) < 1) {
    add('verification.targetRevision', 'target revision must be a positive integer');
  }
  if (typeof value['acceptanceInputDigest'] !== 'string' || value['acceptanceInputDigest'] === '') {
    add('verification.acceptanceInputDigest', 'current acceptance input digest is required');
  }
  const collections: Record<string, Record<string, 'string' | 'array' | 'boolean' | 'number'>> = {
    references: { id: 'string', statement: 'string', role: 'string', location: 'string', accessMethod: 'string', available: 'boolean', revision: 'string', conditions: 'array', approvedDeviationIds: 'array' },
    surfaces: { id: 'string', referenceId: 'string', source: 'string', inspected: 'boolean', variantIds: 'array' },
    obligations: { id: 'string', requirementIds: 'array', referenceIds: 'array', surfaceIds: 'array', expectation: 'string', discovery: 'string', sourceEvidenceIds: 'array', variantIds: 'array', checkIds: 'array', implementationTaskIds: 'array', targetRevision: 'number' },
    checks: { id: 'string', obligationIds: 'array', method: 'string', target: 'string', procedure: 'array', oracle: 'string', oracleEvidenceIds: 'array', variantIds: 'array', integrationDependencies: 'array', required: 'boolean' },
    executions: { id: 'string', checkId: 'string', result: 'string', invocation: 'string', tool: 'string', host: 'string', executor: 'string', executedAt: 'string', assertions: 'array', evidenceIds: 'array' },
    evidence: { id: 'string', path: 'string', sha256: 'string', mediaType: 'string', capturedAt: 'string', origin: 'string' },
    findings: { id: 'string', requirementIds: 'array', obligationIds: 'array', checkIds: 'array', evidenceIds: 'array', origin: 'string', description: 'string', status: 'string' },
    decisions: { id: 'string', kind: 'string', authorizedBy: 'string', authorizedAt: 'string', authorization: 'string', presentedFindingIds: 'array', presentedObligationIds: 'array', selectedFindingIds: 'array', selectedObligationIds: 'array' },
    coverageReviews: { id: 'string', requirementId: 'string', targetRevision: 'number', status: 'string', inspectedSurfaceIds: 'array', uninspectedSurfaceIds: 'array', reviewer: 'string', reviewedAt: 'string', inputDigest: 'string' },
    acceptanceRounds: { id: 'string', targetRevision: 'number', inputDigest: 'string', referenceIds: 'array', executionIds: 'array', findingIds: 'array', coverageReviewIds: 'array', performedAt: 'string', g4: 'string' },
    promisedWork: { id: 'string', description: 'string', status: 'string' },
    repairAttempts: { id: 'string', findingId: 'string', taskId: 'string', at: 'string', outcome: 'string' },
  };
  const limits = value['repairLimits'];
  if (!recordValue(limits) || !Number.isInteger(limits['perFinding'])
    || Number(limits['perFinding']) < 1 || !Number.isInteger(limits['total'])
    || Number(limits['total']) < 1) {
    add('verification.repairLimits', 'finite positive repair limits are required');
  }
  for (const [collection, fields] of Object.entries(collections)) {
    const rows = value[collection];
    if (!Array.isArray(rows)) { add(`verification.${collection}`, 'collection must be an array'); continue; }
    const seen = new Set<string>();
    rows.forEach((row, index) => {
      const at = `verification.${collection}[${index}]`;
      if (!recordValue(row)) { add(at, 'entry must be an object'); return; }
      for (const [field, kind] of Object.entries(fields)) {
        const item = row[field];
        const valid = kind === 'array' ? Array.isArray(item)
          : kind === 'number' ? typeof item === 'number' && Number.isInteger(item)
          : kind === 'string' ? typeof item === 'string' && item !== ''
          : typeof item === 'boolean';
        if (!valid) add(`${at}.${field}`, `${field} must be a ${kind}${kind === 'string' ? ' with content' : ''}`);
        if (kind === 'array' && Array.isArray(item)
          && item.some(part => typeof part !== 'string')
          && !['assertions'].includes(field)) {
          add(`${at}.${field}`, `${field} must contain only strings`);
        }
      }
      if (typeof row['id'] === 'string') {
        if (seen.has(row['id'])) add(`${at}.id`, `duplicate ${collection} ID ${row['id']}`);
        seen.add(row['id']);
      }
    });
  }
  const checks = value['checks'];
  if (Array.isArray(checks)) checks.forEach((item, index) => {
    const fingerprint = recordValue(item) ? item['currentFingerprint'] : undefined;
    validateFingerprint(fingerprint, `verification.checks[${index}].currentFingerprint`, add);
  });
  const executions = value['executions'];
  if (Array.isArray(executions)) executions.forEach((item, index) => {
    const fingerprint = recordValue(item) ? item['fingerprint'] : undefined;
    validateFingerprint(fingerprint, `verification.executions[${index}].fingerprint`, add);
    const assertions = recordValue(item) ? item['assertions'] : undefined;
    if (Array.isArray(assertions)) assertions.forEach((assertion, position) => {
      const at = `verification.executions[${index}].assertions[${position}]`;
      if (!recordValue(assertion) || typeof assertion['name'] !== 'string'
        || typeof assertion['result'] !== 'string'
        || !Array.isArray(assertion['evidenceIds'])
        || assertion['evidenceIds'].some(id => typeof id !== 'string')) {
        add(at, 'assertion needs name, result, and evidence IDs');
      }
    });
  });
  const rounds = value['acceptanceRounds'];
  if (Array.isArray(rounds)) rounds.forEach((item, index) => {
    if (!recordValue(item) || !recordValue(item['requirementResults'])) {
      add(`verification.acceptanceRounds[${index}].requirementResults`, 'requirement result map is required');
    }
  });
  return errors;
}

function validateFingerprint(
  raw: unknown,
  at: string,
  add: (field: string, message: string) => void,
): void {
  if (!recordValue(raw)) { add(at, 'fingerprint must be an object'); return; }
  for (const name of ['reference', 'build', 'data', 'runtime', 'acceptanceInput']) {
    if (typeof raw[name] !== 'string' || raw[name] === '') add(`${at}.${name}`, 'digest is required');
  }
  if (!Array.isArray(raw['relevantPaths']) || raw['relevantPaths'].some(item => typeof item !== 'string')) {
    add(`${at}.relevantPaths`, 'relevantPaths must contain paths');
  }
  if (!recordValue(raw['inputHashes'])) add(`${at}.inputHashes`, 'inputHashes map is required');
  else if (Object.values(raw['inputHashes']).some(hash => typeof hash !== 'string')) {
    add(`${at}.inputHashes`, 'input hashes must be strings');
  }
}

/** Validate referential integrity, ownership, verdict consistency, and closure. */
export function validateVerificationRecord(state: RunState): VerificationViolation[] {
  const errors = validateShape(state.verification);
  if (errors.length > 0) return errors;
  const record = state.verification!;
  const add = (field: string, message: string): void => {
    errors.push({ field, message });
    log.error('verification', message, { field });
  };
  const ids = (entries: Array<{ id: string }>): Set<string> => new Set(entries.map(item => item.id));
  const requirementIds = ids(state.requirements);
  const taskIds = ids(state.tasks);
  const referenceIds = ids(record.references);
  const surfaceIds = ids(record.surfaces);
  const obligationIds = ids(record.obligations);
  const checkIds = ids(record.checks);
  const executionIds = ids(record.executions);
  const evidenceIds = ids(record.evidence);
  const findingIds = ids(record.findings);
  const decisionIds = ids(record.decisions);
  const reviewIds = ids(record.coverageReviews);
  const roundIds = ids(record.acceptanceRounds);
  const references = (
    field: string,
    values: string[],
    known: Set<string>,
  ): void => values.forEach(id => { if (!known.has(id)) add(field, `unknown ID ${id}`); });

  record.references.forEach((item, index) => {
    if (!['authoritative_behavior', 'visual_reference', 'contextual_example', 'other'].includes(item.role)) {
      add(`verification.references[${index}].role`, 'unknown reference role');
    }
    if (item.role === 'other' && !item.roleDescription?.trim()) {
      add(`verification.references[${index}].roleDescription`, 'other role needs a description');
    }
    references(`verification.references[${index}].approvedDeviationIds`, item.approvedDeviationIds, decisionIds);
    if (!item.available && !item.limitation) add(`verification.references[${index}].limitation`, 'unavailable reference needs a limitation');
  });
  record.surfaces.forEach((item, index) => {
    references(`verification.surfaces[${index}].referenceId`, [item.referenceId], referenceIds);
    if (!item.inspected && !item.limitation) add(`verification.surfaces[${index}].limitation`, 'uninspected surface needs a limitation');
  });
  const planFinished = STAGE_IDS.indexOf(state.currentStage) > STAGE_IDS.indexOf('plan')
    || state.stages.some(item => item.id === 'plan' && item.status === 'done');
  record.obligations.forEach((item, index) => {
    const at = `verification.obligations[${index}]`;
    references(`${at}.requirementIds`, item.requirementIds, requirementIds);
    references(`${at}.referenceIds`, item.referenceIds, referenceIds);
    references(`${at}.surfaceIds`, item.surfaceIds, surfaceIds);
    references(`${at}.sourceEvidenceIds`, item.sourceEvidenceIds, evidenceIds);
    references(`${at}.checkIds`, item.checkIds, checkIds);
    references(`${at}.implementationTaskIds`, item.implementationTaskIds, taskIds);
    if (item.targetRevision === record.targetRevision && planFinished
      && item.checkIds.length === 0) {
      add(at, 'current obligation needs required checks after planning');
    }
    if (item.discovery === 'observed' && item.sourceEvidenceIds.length === 0) {
      add(`${at}.sourceEvidenceIds`, 'observed behavior needs reference evidence');
    }
    if (item.discovery === 'observed' && item.sourceEvidenceIds.some(id =>
      record.evidence.find(evidence => evidence.id === id)?.origin !== 'reference')) {
      add(`${at}.sourceEvidenceIds`, 'observed behavior needs reference-origin evidence');
    }
    if (!['observed', 'source_derived', 'unresolved'].includes(item.discovery)) {
      add(`${at}.discovery`, 'unknown discovery status');
    }
  });
  record.checks.forEach((item, index) => {
    const at = `verification.checks[${index}]`;
    references(`${at}.obligationIds`, item.obligationIds, obligationIds);
    references(`${at}.oracleEvidenceIds`, item.oracleEvidenceIds, evidenceIds);
    if (item.executionTaskId) references(`${at}.executionTaskId`, [item.executionTaskId], taskIds);
    else if (planFinished && item.required) add(`${at}.executionTaskId`, 'required check needs execution ownership after planning');
    references(`${at}.integrationDependencies`, item.integrationDependencies, taskIds);
    if (item.supersedes) {
      references(`${at}.supersedes`, [item.supersedes], checkIds);
      if (!item.oracleChangeBasis?.trim() && !item.basisDecisionId) {
        add(at, 'superseding check needs a recorded oracle or mask change basis');
      }
    }
    if (item.basisDecisionId) references(`${at}.basisDecisionId`, [item.basisDecisionId], decisionIds);
    if (item.ignoreMask && !Array.isArray(item.ignoreMask)) add(`${at}.ignoreMask`, 'ignore mask must be an array');
    if (item.ignoreMask?.length && !item.oracleChangeBasis?.trim() && !item.basisDecisionId) {
      add(`${at}.ignoreMask`, 'ignore mask needs a recorded basis');
    }
    if (item.required && item.obligationIds.length === 0) add(at, 'required check needs an obligation');
    validateInputHashes(item.currentFingerprint, `${at}.currentFingerprint`, add);
  });
  record.executions.forEach((item, index) => {
    const at = `verification.executions[${index}]`;
    references(`${at}.checkId`, [item.checkId], checkIds);
    references(`${at}.evidenceIds`, item.evidenceIds, evidenceIds);
    if (item.supersedes) references(`${at}.supersedes`, [item.supersedes], executionIds);
    if (!['not_run', 'passed', 'failed', 'unavailable', 'stale'].includes(item.result)) {
      add(`${at}.result`, 'unknown check result');
    }
    if (item.result === 'passed' && (item.assertions.length === 0 || item.evidenceIds.length === 0)) {
      add(at, 'passed execution needs assertions and evidence');
    }
    if (item.assertions.some(assertion => assertion.result !== 'passed' && assertion.result !== 'failed')) {
      add(`${at}.assertions`, 'assertions must have passed or failed results');
    }
    if (item.result === 'passed' && item.assertions.some(assertion => assertion.result === 'failed')) {
      add(at, 'passed execution contains a failed assertion');
    }
    item.assertions.forEach(assertion => references(`${at}.assertions.evidenceIds`, assertion.evidenceIds, evidenceIds));
    if (item.assertions.some(assertion => assertion.evidenceIds.some(id => !item.evidenceIds.includes(id)))) {
      add(`${at}.assertions`, 'assertion evidence must belong to its execution');
    }
    if (item.result === 'unavailable' && !item.limitation) add(`${at}.limitation`, 'unavailable check needs a limitation');
    validateInputHashes(item.fingerprint, `${at}.fingerprint`, add);
    if (item.evidenceIds.some(id => record.evidence.find(evidence => evidence.id === id)?.origin !== 'execution')) {
      add(`${at}.evidenceIds`, 'execution needs execution-origin evidence');
    }
  });
  record.evidence.forEach((item, index) => {
    if (!['reference', 'execution'].includes(item.origin)) {
      add(`verification.evidence[${index}].origin`, 'unknown evidence origin');
    }
    if (item.origin === 'execution') {
      const owners = record.executions.filter(execution => execution.evidenceIds.includes(item.id));
      if (owners.some(execution => !item.path.startsWith(`evidence/${execution.id}/`))) {
        add(`verification.evidence[${index}].path`, 'execution capture must sit under its execution ID');
      }
    }
  });
  record.findings.forEach((item, index) => {
    const at = `verification.findings[${index}]`;
    references(`${at}.requirementIds`, item.requirementIds, requirementIds);
    references(`${at}.obligationIds`, item.obligationIds, obligationIds);
    references(`${at}.checkIds`, item.checkIds, checkIds);
    references(`${at}.evidenceIds`, item.evidenceIds, evidenceIds);
    if (item.resolutionExecutionId) references(`${at}.resolutionExecutionId`, [item.resolutionExecutionId], executionIds);
    if (item.supersedes) references(`${at}.supersedes`, [item.supersedes], findingIds);
    if (item.status === 'resolved' && !item.resolutionExecutionId) add(at, 'resolved finding needs a resolving execution');
    if (!['open', 'resolved'].includes(item.status)) add(`${at}.status`, 'unknown finding status');
  });
  record.decisions.forEach((item, index) => {
    const at = `verification.decisions[${index}]`;
    references(`${at}.presentedFindingIds`, item.presentedFindingIds, findingIds);
    references(`${at}.presentedObligationIds`, item.presentedObligationIds, obligationIds);
    references(`${at}.selectedFindingIds`, item.selectedFindingIds, findingIds);
    references(`${at}.selectedObligationIds`, item.selectedObligationIds, obligationIds);
    if (item.selectedFindingIds.some(id => !item.presentedFindingIds.includes(id))
      || item.selectedObligationIds.some(id => !item.presentedObligationIds.includes(id))) {
      add(at, 'exception selection must be within the exact presented snapshot');
    }
    if (item.kind === 'scope_amendment'
      && (!item.previousTargetRevision || !item.targetRevision
        || item.targetRevision <= item.previousTargetRevision)) {
      add(at, 'scope amendment must advance the target revision');
    }
    if (!['scope_amendment', 'accepted_exception'].includes(item.kind)) add(`${at}.kind`, 'unknown decision kind');
  });
  record.coverageReviews.forEach((item, index) => {
    const at = `verification.coverageReviews[${index}]`;
    references(`${at}.requirementId`, [item.requirementId], requirementIds);
    references(`${at}.inspectedSurfaceIds`, item.inspectedSurfaceIds, surfaceIds);
    references(`${at}.uninspectedSurfaceIds`, item.uninspectedSurfaceIds, surfaceIds);
    if (item.status === 'complete' && item.uninspectedSurfaceIds.length > 0) {
      add(at, 'complete coverage review cannot leave uninspected surfaces');
    }
    if (!['complete', 'incomplete'].includes(item.status)) add(`${at}.status`, 'unknown coverage status');
  });
  record.acceptanceRounds.forEach((item, index) => {
    const at = `verification.acceptanceRounds[${index}]`;
    references(`${at}.referenceIds`, item.referenceIds, referenceIds);
    references(`${at}.executionIds`, item.executionIds, executionIds);
    references(`${at}.findingIds`, item.findingIds, findingIds);
    references(`${at}.coverageReviewIds`, item.coverageReviewIds, reviewIds);
    if (item.supersedes) references(`${at}.supersedes`, [item.supersedes], roundIds);
    if (!['pending', 'passed', 'failed'].includes(item.g4)) add(`${at}.g4`, 'unknown gate result');
    for (const [id, result] of Object.entries(item.requirementResults)) {
      references(`${at}.requirementResults`, [id], requirementIds);
      if (!['passed', 'failed', 'incomplete'].includes(result)) {
        add(`${at}.requirementResults`, `unknown result for ${id}`);
      }
    }
  });
  record.promisedWork.forEach((item, index) => {
    const at = `verification.promisedWork[${index}]`;
    if (item.acceptanceRoundId) references(`${at}.acceptanceRoundId`, [item.acceptanceRoundId], roundIds);
    if (item.authorizationDecisionId) references(`${at}.authorizationDecisionId`, [item.authorizationDecisionId], decisionIds);
    if (item.status === 'cancelled' && !item.authorizationDecisionId) add(at, 'cancelled promise needs user authorization');
    if (!['open', 'done', 'cancelled'].includes(item.status)) add(`${at}.status`, 'unknown promised-work status');
  });
  const roots = new Map(record.findings.map(item => [item.id, item.supersedes ?? item.id]));
  const rootOf = (id: string): string => {
    let current = id;
    const seen = new Set<string>();
    while (roots.has(current) && roots.get(current) !== current && !seen.has(current)) {
      seen.add(current);
      current = roots.get(current)!;
    }
    return current;
  };
  const repairCounts = new Map<string, number>();
  record.repairAttempts.forEach((item, index) => {
    const at = `verification.repairAttempts[${index}]`;
    references(`${at}.findingId`, [item.findingId], findingIds);
    references(`${at}.taskId`, [item.taskId], taskIds);
    if (!['repaired', 'still_failing', 'unavailable'].includes(item.outcome)) {
      add(`${at}.outcome`, 'unknown repair outcome');
    }
    const root = rootOf(item.findingId);
    repairCounts.set(root, (repairCounts.get(root) ?? 0) + 1);
  });
  if (record.repairAttempts.length > record.repairLimits.total) {
    add('verification.repairAttempts', 'overall repair budget was exceeded');
  }
  for (const [root, count] of repairCounts) {
    if (count > record.repairLimits.perFinding) {
      add('verification.repairAttempts', `repair budget exceeded for stable failure ${root}`);
    }
  }
  if (errors.length > 0) return errors;

  const summary = deriveVerification(state);
  const latestRound = record.acceptanceRounds.find(item => item.id === summary.currentRoundId);
  if (latestRound) {
    if (JSON.stringify(latestRound.requirementResults) !== JSON.stringify(summary.requirementResults)) {
      add('verification.acceptanceRounds', 'stored requirement results disagree with derived results');
    }
    if (latestRound.g4 !== summary.g4) add('verification.acceptanceRounds', 'stored G4 disagrees with derived G4');
  }
  const g4 = state.gates.find(item => item.id === 'G4');
  if ((record.acceptanceRounds.length > 0 || state.lifecycle === 'closed') && g4?.status !== summary.g4) {
    add('gates[G4].status', `G4 must be ${summary.g4} from verification records`);
  }
  if (state.lifecycle === 'active') {
    if (state.outcome || state.finishedAt) add('lifecycle', 'active state cannot have terminal outcome or finishedAt');
  } else if (state.lifecycle === 'closed') {
    if (!state.finishedAt || Number.isNaN(Date.parse(state.finishedAt))) add('finishedAt', 'closed state needs a closure timestamp');
    if (!state.outcome) add('outcome', 'closed state needs an outcome');
    if (record.promisedWork.some(item => item.status === 'open')) add('verification.promisedWork', 'open promised work blocks closure');
    if (state.outcome === 'completed' && summary.g4 !== 'passed') add('outcome', 'completed requires verified passing G4');
    if (state.outcome === 'closed_with_exceptions') {
      const acceptedFindings = new Set(record.decisions.filter(item => item.kind === 'accepted_exception')
        .flatMap(item => item.selectedFindingIds));
      const acceptedObligations = new Set(record.decisions.filter(item => item.kind === 'accepted_exception')
        .flatMap(item => item.selectedObligationIds));
      const outstandingFindings = record.findings.filter(item => item.status === 'open');
      const outstandingObligations = Object.entries(summary.obligationResults)
        .filter(([, result]) => result !== 'passed').map(([id]) => id);
      if (outstandingFindings.length === 0 && outstandingObligations.length === 0) {
        add('outcome', 'exception closure needs a remaining technical gap');
      }
      if (record.decisions.every(item => item.kind !== 'accepted_exception')
        || outstandingFindings.some(item => !acceptedFindings.has(item.id))
        || outstandingObligations.some(id => !acceptedObligations.has(id))) {
        add('outcome', 'exception closure needs bounded acceptance of every outstanding finding and obligation');
      }
    }
    if (state.outcome === 'stopped_incomplete' && !state.stopReason?.trim()) {
      add('stopReason', 'stopped incomplete run needs a reason');
    }
  }
  return errors;
}

/** Published records are history; a later write can append, not rewrite them. */
export function validateVerificationTransition(
  previous: RunState,
  next: RunState,
): VerificationViolation[] {
  if (previous.contractVersion < 4 || !previous.verification || !next.verification) return [];
  const errors: VerificationViolation[] = [];
  const prior = previous.verification;
  const current = next.verification;
  const collections: Array<keyof VerificationRecord> = [
    'references', 'surfaces', 'obligations', 'checks', 'executions',
    'evidence', 'decisions', 'acceptanceRounds',
    'repairAttempts',
  ];
  for (const name of collections) {
    const oldEntries = prior[name] as Array<{ id: string }>;
    const newEntries = current[name] as Array<{ id: string }>;
    for (const original of oldEntries) {
      const successor = newEntries.find(item => item.id === original.id);
      const comparable = (entry: { id: string } | undefined): string => {
        if (name !== 'checks' || !entry) return JSON.stringify(entry);
        const { currentFingerprint: _fingerprint, ...stable } = entry as VerificationCheck;
        return JSON.stringify(stable);
      };
      if (!successor || comparable(successor) !== comparable(original)) {
        errors.push({ field: `verification.${name}[${original.id}]`,
          message: 'published record must remain immutable; append a superseding record' });
      }
    }
  }
  if (current.targetRevision < prior.targetRevision) {
    errors.push({ field: 'verification.targetRevision', message: 'target revision cannot decrease' });
  }
  if (current.targetRevision > prior.targetRevision
    && !current.decisions.some(item => item.kind === 'scope_amendment'
      && item.previousTargetRevision === prior.targetRevision
      && item.targetRevision === current.targetRevision)) {
    errors.push({ field: 'verification.targetRevision',
      message: 'target revision change needs an explicit scope amendment' });
  }
  if (errors.length > 0) log.error('transition', 'published history was rewritten', {
    runId: next.runId, violations: errors.length,
  });
  return errors;
}

function validateInputHashes(
  fingerprint: { relevantPaths: string[]; inputHashes: Record<string, string> },
  at: string,
  add: (field: string, message: string) => void,
): void {
  const paths = new Set(fingerprint.relevantPaths);
  const hashes = Object.keys(fingerprint.inputHashes);
  if (paths.size !== fingerprint.relevantPaths.length || hashes.length !== paths.size
    || hashes.some(item => !paths.has(item))) {
    add(at, 'input hashes must match unique relevant paths exactly');
  }
  for (const [file, hash] of Object.entries(fingerprint.inputHashes)) {
    if (!/^[a-f0-9]{64}$/.test(hash)) add(`${at}.inputHashes`, `invalid SHA-256 for ${file}`);
  }
}
