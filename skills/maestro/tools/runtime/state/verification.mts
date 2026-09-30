// Pure verification aggregation for a coherent contract-4 state.
//
// This module never reads files. Filesystem identity is checked at the read and
// write boundaries, while this module keeps one deterministic result rule for
// gates, reports, metrics, and the dashboard projection.

import { createHash } from 'node:crypto';

import { isDeepStrictEqual } from 'node:util';

import { createLogger } from '../shared/log.mts';
import { STAGE_IDS } from './contract.mts';
import type {
  CheckExecution, CheckResult, RunState, VerificationCheck,
  VerificationObligation, VerificationRecord, VerificationRecordV2, VerificationResult, NegativeControl,
} from './contract.mts';

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
  if (record.version === 2 && check.currentFingerprint.acceptanceInput !== record.acceptanceInputDigest) return 'stale';
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
  const controls = record.version === 2 ? activeControls(record).filter(control => required.some(check => check.id === control.checkId)) : [];
  const controlResults = record.version === 2 ? controls.map(control => controlResult(control, record)) : [];
  const journeyResults = record.version === 2 ? record.journeys.filter(journey => journey.targetRevision === record.targetRevision && journey.obligationIds.includes(obligation.id)).map(journey => journeyResult(journey.id, record, checkResults)) : [];
  if (contradicted || journeyResults.includes('failed') || required.some(check => checkResults[check.id] === 'failed')
    || controlResults.includes('failed')) return 'failed';
  if (controlResults.some(result => result !== 'passed') || journeyResults.some(result => result !== 'passed')) return 'incomplete';
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
  const safeguardsPending = record.version === 2 && (!record.scopeBaseline || !hasFreshManifestAudit(record, state.requirements.map(item => item.id)));
  const g4 = failedIds.length > 0 ? 'failed'
    : Object.keys(requirementResults).length === 0 || incompleteIds.length > 0
      || !roundCurrent || promised || safeguardsPending ? 'pending' : 'passed';

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
  if (value['version'] !== 1 && value['version'] !== 2) add('verification.version', 'verification version must be 1 or 2');
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
  if (value['version'] === 2) {
    collections['sourceSnapshots'] = { id: 'string', origin: 'string', text: 'string', sha256: 'string', capturedAt: 'string', targetRevision: 'number' };
    collections['sourceClauses'] = { id: 'string', sourceId: 'string', start: 'number', end: 'number', quote: 'string', classification: 'string', requirementIds: 'array' };
    collections['manifestAudits'] = { id: 'string', sourceIds: 'array', manifestDigest: 'string', targetRevision: 'number', clauseIds: 'array', findings: 'array', result: 'string', auditedAt: 'string' };
    collections['scopeMappings'] = { id: 'string', originalRequirementId: 'string', currentRequirementIds: 'array', relation: 'string', originalCheckIds: 'array', targetRevision: 'number' };
    collections['journeys'] = { id: 'string', requirementIds: 'array', obligationIds: 'array', checkIds: 'array', fixture: 'string', variantIds: 'array', steps: 'array', integrationDependencies: 'array', executionTaskId: 'string', targetRevision: 'number', reset: 'string', cleanup: 'string' };
    collections['negativeControls'] = { id: 'string', checkId: 'string', targetRevision: 'number', selectionBasis: 'string', applicability: 'string', defect: 'string', expectedAssertion: 'string', isolationFingerprint: 'string', oracleDigest: 'string', result: 'string', runs: 'array' };
    Object.assign(collections['repairAttempts']!, { rootFindingId: 'string', hypothesis: 'string', diagnosis: 'string', evidenceIds: 'array', strategy: 'string', action: 'string', followUpCheckIds: 'array' });
    if (typeof value['manifestDigest'] !== 'string' || !/^[a-f0-9]{64}$/.test(value['manifestDigest'])) {
      add('verification.manifestDigest', 'manifest SHA-256 is required');
    }
    if (value['scopeBaseline'] !== undefined) {
      const baseline = value['scopeBaseline'];
      if (!recordValue(baseline)) add('verification.scopeBaseline', 'baseline must be an object');
      else {
        for (const field of ['id', 'manifestDigest', 'auditId', 'agreementId', 'agreedAt']) {
          if (typeof baseline[field] !== 'string' || !baseline[field]) add(`verification.scopeBaseline.${field}`, 'nonempty string is required');
        }
        for (const field of ['sourceIds', 'requirementIds']) {
          if (!Array.isArray(baseline[field]) || baseline[field].some(id => typeof id !== 'string')) add(`verification.scopeBaseline.${field}`, 'string array is required');
        }
        if (!Array.isArray(baseline['expectations'])) add('verification.scopeBaseline.expectations', 'expectations must be an array');
        else baseline['expectations'].forEach((item, index) => {
          if (!recordValue(item) || typeof item['requirementId'] !== 'string' || typeof item['text'] !== 'string' || !item['text']
            || !Array.isArray(item['clauseIds']) || item['clauseIds'].some(id => typeof id !== 'string')
            || !Array.isArray(item['checkIds']) || item['checkIds'].some(id => typeof id !== 'string')) {
            add(`verification.scopeBaseline.expectations[${index}]`, 'expectation needs requirement, text, clause IDs and check IDs');
          }
        });
      }
    }
    const audits = value['manifestAudits'];
    if (Array.isArray(audits)) audits.forEach((audit, index) => {
      if (recordValue(audit)) for (const field of ['dispatchId', 'readerId', 'returnId', 'limitation']) {
        if (audit[field] !== undefined && typeof audit[field] !== 'string') add(`verification.manifestAudits[${index}].${field}`, 'optional identity/limitation must be a string');
      }
      if (!recordValue(audit) || !recordValue(audit['sourceDigests']) || Object.values(audit['sourceDigests']).some(hash => typeof hash !== 'string')) {
        add(`verification.manifestAudits[${index}].sourceDigests`, 'source digest map is required');
      }
    });
  }
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
          && !['assertions', 'steps', 'runs'].includes(field)) {
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
  if (value['version'] === 2) {
    const journeys = value['journeys'];
    if (Array.isArray(journeys)) journeys.forEach((journey, index) => {
      if (recordValue(journey) && Array.isArray(journey['steps'])) journey['steps'].forEach((step, position) => {
        if (!recordValue(step) || typeof step['action'] !== 'string' || !step['action'].trim()
          || typeof step['assertion'] !== 'string' || !step['assertion'].trim()) {
          add(`verification.journeys[${index}].steps[${position}]`, 'each ordered step needs action and observable assertion');
        }
      });
    });
    const controls = value['negativeControls'];
    if (Array.isArray(controls)) controls.forEach((control, index) => {
      if (!recordValue(control)) return;
      const at = `verification.negativeControls[${index}]`;
      validateFingerprint(control['mainFingerprint'], `${at}.mainFingerprint`, add);
      for (const field of ['findingId', 'limitation', 'supersedes']) {
        if (control[field] !== undefined && typeof control[field] !== 'string') add(`${at}.${field}`, 'optional control field must be a string');
      }
      if (Array.isArray(control['runs'])) control['runs'].forEach((run, position) => {
        const field = `${at}.runs[${position}]`;
        if (!recordValue(run)) { add(field, 'control run must be an object'); return; }
        for (const name of ['id', 'phase', 'result', 'oracleDigest', 'executedAt', 'executor', 'invocation']) {
          if (typeof run[name] !== 'string' || !run[name]) add(`${field}.${name}`, 'nonempty string is required');
        }
        if (!Array.isArray(run['evidenceIds']) || run['evidenceIds'].some(id => typeof id !== 'string')) add(`${field}.evidenceIds`, 'evidence ID array is required');
        if (!Array.isArray(run['assertions'])) add(`${field}.assertions`, 'assertions are required');
        else run['assertions'].forEach(assertion => {
          if (!recordValue(assertion) || typeof assertion['name'] !== 'string' || !['passed', 'failed'].includes(String(assertion['result']))
            || !Array.isArray(assertion['evidenceIds']) || assertion['evidenceIds'].some(id => typeof id !== 'string')) add(`${field}.assertions`, 'assertion needs name, result and evidence IDs');
        });
        validateFingerprint(run['fingerprint'], `${field}.fingerprint`, add);
      });
    });
    const attempts = value['repairAttempts'];
    if (Array.isArray(attempts)) attempts.forEach((attempt, index) => {
      if (!recordValue(attempt)) return;
      for (const field of ['predecessorId', 'diagnosisDispatchId', 'diagnosisReturnId', 'novelty']) {
        if (attempt[field] !== undefined && typeof attempt[field] !== 'string') add(`verification.repairAttempts[${index}].${field}`, 'optional diagnosis field must be a string');
      }
    });
  }
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
  if ((state.contractVersion === 4 && record.version !== 1)
    || (state.contractVersion === 5 && record.version !== 2)) {
    return [{ field: 'verification.version', message: 'contract 4 requires verification 1; contract 5 requires verification 2' }];
  }
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
  if (record.version === 2) errors.push(...validateSourceRecords(state, record), ...validateCompletionRecords(state, record));
  if (errors.length > 0) return errors;

  const summary = deriveVerification(state);
  const latestRound = record.acceptanceRounds.find(item => item.id === summary.currentRoundId);
  if (latestRound) {
    if (!isDeepStrictEqual(latestRound.requirementResults, summary.requirementResults)) {
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
  const planningOpen = previous.lifecycle === 'active'
    && STAGE_IDS.indexOf(previous.currentStage) <= STAGE_IDS.indexOf('plan')
    && !previous.stages.some(stage => stage.id === 'plan' && stage.status === 'done')
    && !previous.gates.some(gate => gate.id === 'G3' && gate.status === 'passed');
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
      const comparable = (entry: { id: string } | undefined): unknown => {
        if (!entry) return entry;
        const stable = { ...entry } as Record<string, unknown>;
        if (name === 'checks') {
          delete stable['currentFingerprint'];
          const before = original as VerificationCheck;
          if (planningOpen && !prior.executions.some(execution => execution.checkId === original.id)) {
            if (before.executionTaskId === undefined) delete stable['executionTaskId'];
            if (before.integrationDependencies.length === 0) delete stable['integrationDependencies'];
          }
        }
        if (name === 'obligations' && planningOpen && !prior.executions.some(execution =>
          prior.checks.some(check => check.id === execution.checkId && check.obligationIds.includes(original.id)))) {
          const before = original as VerificationObligation;
          if (before.implementationTaskIds.length === 0) delete stable['implementationTaskIds'];
          if (before.checkIds.length === 0) delete stable['checkIds'];
        }
        return stable;
      };
      if (!successor || !isDeepStrictEqual(comparable(successor), comparable(original))) {
        errors.push({ field: `verification.${name}[${original.id}]`,
          message: 'published record must remain immutable; append a superseding record' });
      }
    }
  }
  if (prior.version === 2) {
    if (current.version !== 2 || next.contractVersion !== 5) {
      errors.push({ field: 'verification.version', message: 'published v5 safeguards cannot be downgraded' });
    } else {
      for (const name of ['sourceSnapshots', 'sourceClauses', 'manifestAudits', 'scopeMappings', 'journeys', 'negativeControls'] as const) {
        if (!isDeepStrictEqual(current[name].slice(0, prior[name].length), prior[name])) {
          errors.push({ field: `verification.${name}`, message: 'source history must keep its append-only order' });
        }
        for (const original of prior[name]) {
          if (!isDeepStrictEqual(current[name].find(item => item.id === original.id), original)) {
            errors.push({ field: `verification.${name}[${original.id}]`, message: 'published source history is immutable; append a new record' });
          }
        }
      }
      if (current.repairLimits.perFinding > prior.repairLimits.perFinding || current.repairLimits.total > prior.repairLimits.total) {
        errors.push({ field: 'verification.repairLimits', message: 'stable repair budgets cannot increase' });
      }
      if (prior.scopeBaseline && !isDeepStrictEqual(prior.scopeBaseline, current.scopeBaseline)) {
        errors.push({ field: 'verification.scopeBaseline', message: 'original agreement baseline is frozen' });
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
  if (prior.version === 2 && current.version === 2 && errors.length === 0
    && (prior.manifestAudits.length !== current.manifestAudits.length || !prior.scopeBaseline && current.scopeBaseline)) {
    log.info('source-transition', 'audit or baseline appended', { runId: next.runId, audits: current.manifestAudits.length, baseline: !!current.scopeBaseline });
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

const digest = (text: string): string => createHash('sha256').update(text).digest('hex');
const sameIds = (left: string[], right: string[]): boolean =>
  new Set(left).size === left.length && left.length === right.length && left.every(id => right.includes(id));

/** A returned independent pass binds the complete current source/manifest set. */
export function hasFreshManifestAudit(record: VerificationRecordV2, requirementIds: string[] = []): boolean {
  const sources = record.sourceSnapshots;
  if (sources.length === 0) return false;
  const audit = record.manifestAudits.filter(audit => audit.targetRevision === record.targetRevision
    && audit.manifestDigest === record.manifestDigest
    && sameIds(audit.sourceIds, sources.map(source => source.id))
    && sources.every(source => audit.sourceDigests[source.id] === source.sha256)).at(-1);
  if (!audit || audit.result !== 'passed' || !audit.dispatchId?.trim() || !audit.returnId?.trim()
    || !audit.readerId?.trim() || audit.findings.length > 0 || audit.clauseIds.length === 0) return false;
  const clauses = audit.clauseIds.map(id => record.sourceClauses.find(clause => clause.id === id));
  return clauses.every(clause => !!clause && audit.sourceIds.includes(clause.sourceId)
    && (clause.classification === 'context' || clause.requirementIds.length > 0))
    && sources.every(source => clauses.some(clause => clause?.sourceId === source.id))
    && requirementIds.every(id => clauses.some(clause => clause?.requirementIds.includes(id)));
}

/** Source/audit integrity is mechanical; semantic discovery belongs to the reader. */
function validateSourceRecords(state: RunState, record: VerificationRecordV2): VerificationViolation[] {
  const errors: VerificationViolation[] = [];
  const add = (field: string, message: string): void => {
    errors.push({ field, message });
    log.error('source', message, { field });
  };
  const reference = (field: string, values: string[], known: string[]): void => {
    if (new Set(values).size !== values.length) add(field, 'IDs must be unique');
    for (const id of values) if (!known.includes(id)) add(field, `unknown ID ${id}`);
  };
  const moment = (field: string, value: string): void => {
    if (Number.isNaN(Date.parse(value))) add(field, 'timestamp must name a moment');
  };
  const ids = record.sourceSnapshots.map(source => source.id);
  const clauses = record.sourceClauses.map(clause => clause.id);
  const requirements = state.requirements.map(requirement => requirement.id);
  const checks = record.checks.map(check => check.id);
  for (const source of record.sourceSnapshots) {
    const at = `verification.sourceSnapshots[${source.id}]`;
    if (!/^SRC-[1-9][0-9]*$/.test(source.id)) add(at, 'source ID must use SRC-N');
    if (!['initial', 'addition'].includes(source.origin)) add(at, 'unknown source origin');
    if (source.sha256 !== digest(source.text)) add(at, 'source SHA-256 must match exact redacted text');
    if (source.targetRevision < 1 || source.targetRevision > record.targetRevision) add(at, 'source revision is out of range');
    moment(at, source.capturedAt);
  }
  if (record.sourceSnapshots.filter(source => source.origin === 'initial').length > 1) add('verification.sourceSnapshots', 'only one initial source is allowed');
  for (const clause of record.sourceClauses) {
    const at = `verification.sourceClauses[${clause.id}]`;
    if (!/^CL-[1-9][0-9]*$/.test(clause.id)) add(at, 'clause ID must use CL-N');
    reference(at, [clause.sourceId], ids);
    reference(at, clause.requirementIds, requirements);
    const text = Array.from(record.sourceSnapshots.find(source => source.id === clause.sourceId)?.text ?? '');
    if (clause.start < 0 || clause.end <= clause.start || clause.end > text.length
      || text.slice(clause.start, clause.end).join('') !== clause.quote) add(at, 'clause offsets and quote must match source code points');
    if (!['requirement', 'context'].includes(clause.classification)) add(at, 'unknown clause classification');
    if (clause.classification === 'context' && (!clause.exclusionReason?.trim() || clause.requirementIds.length)) add(at, 'context requires exclusion reason and no requirement IDs');
  }
  const dispatches = new Set<string>();
  const returns = new Set<string>();
  for (const audit of record.manifestAudits) {
    const at = `verification.manifestAudits[${audit.id}]`;
    if (!/^MA-[1-9][0-9]*$/.test(audit.id)) add(at, 'audit ID must use MA-N');
    reference(at, audit.sourceIds, ids);
    reference(at, audit.clauseIds, clauses);
    if (!sameIds(Object.keys(audit.sourceDigests), audit.sourceIds)
      || audit.sourceIds.some(id => audit.sourceDigests[id] !== record.sourceSnapshots.find(source => source.id === id)?.sha256)) add(at, 'audit source digests must match declared sources exactly');
    if (!/^[a-f0-9]{64}$/.test(audit.manifestDigest)) add(at, 'audit manifest SHA-256 is malformed');
    if (audit.targetRevision < 1 || audit.targetRevision > record.targetRevision) add(at, 'audit revision is out of range');
    if (!['passed', 'failed', 'incomplete'].includes(audit.result)) add(at, 'unknown audit result');
    if (audit.result === 'passed' && (!audit.dispatchId?.trim() || !audit.returnId?.trim() || !audit.readerId?.trim() || audit.findings.length > 0 || audit.sourceIds.length === 0 || audit.clauseIds.length === 0)) add(at, 'passed audit needs actual independent dispatch/return and complete mappings without findings');
    if (audit.result === 'failed' && audit.findings.length === 0) add(at, 'failed audit needs returned findings');
    if (audit.result === 'incomplete' && !audit.limitation?.trim()) add(at, 'incomplete audit needs a limitation');
    for (const [identity, seen] of [[audit.dispatchId, dispatches], [audit.returnId, returns]] as const) {
      if (!identity) continue;
      if (seen.has(identity)) add(at, 'audit dispatch/return identity cannot be reused');
      seen.add(identity);
    }
    if (audit.clauseIds.some(id => !audit.sourceIds.includes(record.sourceClauses.find(clause => clause.id === id)?.sourceId ?? ''))) add(at, 'audit clauses must belong to its sources');
    moment(at, audit.auditedAt);
  }
  const baseline = record.scopeBaseline;
  if (baseline) {
    const at = 'verification.scopeBaseline';
    reference(at, baseline.sourceIds, ids);
    reference(at, baseline.requirementIds, requirements);
    const audit = record.manifestAudits.find(item => item.id === baseline.auditId);
    if (!audit || audit.result !== 'passed' || audit.manifestDigest !== baseline.manifestDigest
      || !audit.dispatchId || !audit.returnId || !/^AG-[1-9][0-9]*$/.test(baseline.agreementId)) add(at, 'baseline needs an audited manifest and actual agreement identity');
    if (baseline.sourceIds.length !== 1 || !baseline.sourceIds.every(id => record.sourceSnapshots.find(source => source.id === id)?.origin === 'initial')) add(at, 'baseline freezes the initial source only');
    if (!sameIds(baseline.expectations.map(item => item.requirementId), baseline.requirementIds)) add(at, 'baseline must freeze exactly one expectation per original requirement');
    for (const expectation of baseline.expectations) {
      reference(at, expectation.clauseIds, clauses);
      reference(at, expectation.checkIds, checks);
      if (!expectation.clauseIds.length || expectation.clauseIds.some(id => {
        const clause = record.sourceClauses.find(item => item.id === id);
        return !clause || !audit?.clauseIds.includes(id) || !baseline.sourceIds.includes(clause.sourceId) || !clause.requirementIds.includes(expectation.requirementId);
      })) add(at, 'original expectations need matching initial requirement clauses');
    }
    const originalIds = record.sourceClauses.filter(item => audit?.clauseIds.includes(item.id) && baseline.sourceIds.includes(item.sourceId)
      && item.classification === 'requirement').flatMap(item => item.requirementIds);
    if (!sameIds([...new Set(originalIds)], baseline.requirementIds)) add(at, 'baseline cannot omit an initial mapped requirement');
    moment(at, baseline.agreedAt);
  }
  for (const mapping of record.scopeMappings) {
    const at = `verification.scopeMappings[${mapping.id}]`;
    if (!baseline?.requirementIds.includes(mapping.originalRequirementId)) add(at, 'mapping needs an original baseline requirement');
    reference(at, mapping.currentRequirementIds, requirements);
    reference(at, mapping.originalCheckIds, checks);
    if (!['unchanged', 'changed', 'split', 'withdrawn'].includes(mapping.relation)) add(at, 'unknown scope relation');
    if (mapping.targetRevision < 1 || mapping.targetRevision > record.targetRevision) add(at, 'mapping revision is out of range');
    if (mapping.relation !== 'unchanged') {
      const decision = record.decisions.find(item => item.id === mapping.decisionId);
      if (!decision || decision.kind !== 'scope_amendment' || decision.targetRevision !== mapping.targetRevision) add(at, 'changed scope mapping needs user-authorized amendment');
    }
    if (mapping.relation === 'withdrawn' && mapping.currentRequirementIds.length) add(at, 'withdrawn mapping must have no current IDs');
    if (mapping.relation !== 'withdrawn' && !mapping.currentRequirementIds.length) add(at, 'retained scope needs current requirement IDs');
  }
  if ((state.gates.some(gate => gate.id === 'G1' && gate.status === 'passed') || state.outcome === 'completed')
    && (!hasFreshManifestAudit(record, requirements) || !baseline)) add('gates[G1].status', 'passing G1 requires a fresh independent source audit and frozen original agreement');
  log.debug('source', 'source graph validated', { sources: ids.length, audits: record.manifestAudits.length, violations: errors.length });
  return errors;
}

/** Hash the immutable assertion procedure/oracle/mask, independent of field order. */
export function checkOracleDigest(check: VerificationCheck): string {
  return digest(JSON.stringify([check.procedure, check.oracle, check.ignoreMask ?? []]));
}

function activeControls(record: VerificationRecordV2): NegativeControl[] {
  const superseded = new Set(record.negativeControls.flatMap(item => item.supersedes ? [item.supersedes] : []));
  return record.negativeControls.filter(item => !superseded.has(item.id) && item.targetRevision === record.targetRevision);
}

function controlResult(control: NegativeControl, record: VerificationRecordV2): VerificationResult {
  const check = record.checks.find(item => item.id === control.checkId);
  if (!check || !sameFingerprint(control.mainFingerprint, check.currentFingerprint)
    || control.oracleDigest !== checkOracleDigest(check)) return 'incomplete';
  if (control.result === 'failed') return 'failed';
  return control.result === 'passed' ? 'passed' : 'incomplete';
}

/** Controls and repair declarations prove structure, not causal diagnosis quality. */
export function validateCompletionRecords(state: RunState, record: VerificationRecordV2): VerificationViolation[] {
  const errors: VerificationViolation[] = [];
  const add = (field: string, message: string): void => {
    errors.push({ field, message }); log.error('completion', message, { field });
  };
  const reference = (field: string, values: string[], known: string[]): void => {
    if (new Set(values).size !== values.length) add(field, 'linked IDs must be unique');
    values.forEach(id => { if (!known.includes(id)) add(field, `unknown ID ${id}`); });
  };
  const requirements = state.requirements.map(item => item.id);
  const obligations = record.obligations.map(item => item.id);
  const checks = record.checks.map(item => item.id);
  const tasks = state.tasks.map(item => item.id);
  const evidence = record.evidence.map(item => item.id);
  const unique = (field: string, entries: Array<{ id: string }>, prefix: string): void => {
    if (new Set(entries.map(item => item.id)).size !== entries.length) add(field, 'duplicate IDs');
    for (const item of entries) if (!new RegExp(`^${prefix}-[1-9][0-9]*$`).test(item.id)) add(field, `IDs must use ${prefix}-N`);
  };
  unique('verification.journeys', record.journeys, 'J');
  unique('verification.negativeControls', record.negativeControls, 'NC');
  for (const journey of record.journeys) {
    const at = `verification.journeys[${journey.id}]`;
    reference(at, journey.requirementIds, requirements);
    reference(at, journey.obligationIds, obligations);
    reference(at, journey.checkIds, checks);
    reference(at, journey.integrationDependencies, tasks);
    reference(at, [journey.executionTaskId], tasks);
    if (!journey.requirementIds.length || !journey.obligationIds.length || !journey.checkIds.length || !journey.steps.length) add(at, 'journey needs requirements, obligations, required checks and ordered steps');
    if (journey.targetRevision < 1 || journey.targetRevision > record.targetRevision) add(at, 'journey revision is out of range');
    for (const id of journey.checkIds) {
      const check = record.checks.find(item => item.id === id);
      if (!check?.required || check.executionTaskId !== journey.executionTaskId
        || journey.obligationIds.some(obligation => !check.obligationIds.includes(obligation))
        || journey.integrationDependencies.some(task => !check.integrationDependencies.includes(task))) add(at, 'journey check must be required with matching owner, obligations and dependencies');
      if (check && journey.steps.some((step, index) => !check.procedure.includes(step.action) || index > 0 && check.procedure.indexOf(step.action) <= check.procedure.indexOf(journey.steps[index - 1]!.action))) add(at, 'journey check must execute every ordered action');
    }
    for (const id of journey.obligationIds) {
      const obligation = record.obligations.find(item => item.id === id);
      if (obligation && (obligation.targetRevision !== journey.targetRevision
        || !journey.requirementIds.some(requirement => obligation.requirementIds.includes(requirement))
        || !journey.checkIds.some(check => obligation.checkIds.includes(check)))) add(at, 'journey obligations must link its requirements and checks at the same revision');
    }
  }
  const runIds = new Set(record.executions.map(item => item.id));
  for (const control of record.negativeControls) {
    const at = `verification.negativeControls[${control.id}]`;
    reference(at, [control.checkId], checks);
    if (control.targetRevision < 1 || control.targetRevision > record.targetRevision) add(at, 'control revision is out of range');
    if (!['user_condition', 'acceptance_critical', 'severe_defect'].includes(control.selectionBasis)) add(at, 'control needs declared critical selection basis');
    if (!['not_run', 'passed', 'failed', 'unavailable'].includes(control.result)) add(at, 'unknown control result');
    if (!/^[a-f0-9]{64}$/.test(control.isolationFingerprint) || control.isolationFingerprint === control.mainFingerprint.build) add(at, 'control must identify a separate disposable workspace');
    const check = record.checks.find(item => item.id === control.checkId);
    if (!check?.required) add(at, 'selected control needs a required check');
    if (!/^[a-f0-9]{64}$/.test(control.oracleDigest)) add(at, 'control needs oracle SHA-256');
    if (control.result === 'unavailable' && !control.limitation?.trim()) add(at, 'unavailable control needs limitation');
    if (control.supersedes) {
      const previous = record.negativeControls.find(item => item.id === control.supersedes);
      if (!previous || record.negativeControls.indexOf(previous) >= record.negativeControls.indexOf(control) || previous.checkId !== control.checkId || previous.selectionBasis !== control.selectionBasis
        || previous.targetRevision !== control.targetRevision || previous.applicability !== control.applicability || previous.defect !== control.defect || previous.expectedAssertion !== control.expectedAssertion) add(at, 'control supersession cannot change selection/check identity');
      if (record.negativeControls.filter(item => item.supersedes === control.supersedes).length > 1) add(at, 'control supersession must not fork');
    }
    if (control.findingId) reference(at, [control.findingId], record.findings.map(item => item.id));
    if (control.result === 'failed') {
      const finding = record.findings.find(item => item.id === control.findingId);
      if (!finding || !finding.checkIds.includes(control.checkId)) add(at, 'missed detection needs a linked check-quality finding');
    }
    const phases = control.runs.map(item => item.phase);
    if (control.result === 'passed' || control.result === 'failed') {
      if (phases.join(',') !== 'clean,mutated,restored') add(at, 'finished control requires ordered clean/mutated/restored runs');
      const [clean, mutated, restored] = control.runs;
      if (control.result === 'passed' && (clean?.result !== 'passed' || restored?.result !== 'passed'
        || mutated?.result !== 'failed' || !mutated.assertions.some(item => item.name === control.expectedAssertion && item.result === 'failed'))) add(at, 'passed control must detect the expected assertion between clean/restored passes');
    } else if (control.result === 'not_run' && control.runs.length) add(at, 'not-run selection cannot claim run evidence');
    for (const run of control.runs) {
      if (runIds.has(run.id)) add(at, 'control run ID must be separate from production and other control runs');
      runIds.add(run.id);
      reference(at, run.evidenceIds, evidence);
      if (!['clean', 'mutated', 'restored'].includes(run.phase) || !['passed', 'failed'].includes(run.result)) add(at, 'unknown control run phase/result');
      if (!run.evidenceIds.length || !run.assertions.length || Number.isNaN(Date.parse(run.executedAt))) add(at, 'control run needs assertions, immutable captures and timestamp');
      if (run.oracleDigest !== control.oracleDigest) add(at, 'control runs must keep the oracle unchanged');
      if (run.result === 'failed' && !run.assertions.some(item => item.result === 'failed')) add(at, 'failed control run must name its failed assertion');
      if (run.result === 'passed' && run.assertions.some(item => item.result === 'failed')) add(at, 'passing control run contains failed assertion');
      if (run.phase !== 'mutated' && !sameFingerprint(run.fingerprint, control.mainFingerprint)) add(at, 'clean/restored copy must match main input fingerprint');
      if (run.phase === 'mutated' && run.fingerprint.build === control.mainFingerprint.build) add(at, 'mutated copy needs a different build identity');
      validateInputHashes(run.fingerprint, `${at}.runs[${run.id}].fingerprint`, add);
      for (const assertion of run.assertions) {
        if (!assertion.evidenceIds.length || assertion.evidenceIds.some(id => !run.evidenceIds.includes(id))) add(at, 'assertion evidence must belong to its control run');
      }
      for (const id of run.evidenceIds) {
        const capture = record.evidence.find(item => item.id === id);
        if (!capture || capture.origin !== 'execution' || !capture.path.startsWith(`evidence/${run.id}/`)) add(at, 'control capture must live under its separate run ID');
      }
    }
  }
  if (record.repairLimits.perFinding > 2) add('verification.repairLimits', 'per-root retry ceiling is two');
  const roots = new Map(record.findings.map(item => [item.id, item.supersedes]));
  const rootOf = (id: string): string => {
    const seen = new Set<string>();
    let current = id;
    while (roots.get(current)) {
      if (seen.has(current)) { add('verification.findings', 'stable finding chain contains a cycle'); break; }
      seen.add(current); current = roots.get(current)!;
    }
    return current;
  };
  const latest = new Map<string, string>();
  for (const attempt of record.repairAttempts) {
    const at = `verification.repairAttempts[${attempt.id}]`;
    if (!/^RA-[1-9][0-9]*$/.test(attempt.id)) add(at, 'attempt ID must use RA-N');
    const root = rootOf(attempt.findingId);
    if (attempt.rootFindingId !== root) add(at, 'attempt must retain the stable root finding identity');
    reference(at, attempt.evidenceIds, evidence);
    reference(at, attempt.followUpCheckIds, checks);
    if (!attempt.evidenceIds.length || !attempt.followUpCheckIds.length) add(at, 'repair requires diagnostic evidence and follow-up checks');
    if (!['minimal_reproduction', 'interface_verification', 'dependency_correction', 'implementation_change', 'independent_executor'].includes(attempt.strategy)) add(at, 'unknown repair strategy');
    const predecessor = latest.get(root);
    if (attempt.predecessorId !== predecessor) add(at, 'repair predecessor must be the preceding attempt for the same root');
    if (predecessor && (!attempt.diagnosisDispatchId?.trim() || !attempt.diagnosisReturnId?.trim() || attempt.novelty !== 'accepted')) add(at, 'repeat repair requires returned independent accepted diagnosis of strategy novelty');
    if (attempt.novelty && !['accepted', 'rejected', 'unavailable'].includes(attempt.novelty)) add(at, 'unknown strategy novelty');
    latest.set(root, attempt.id);
  }
  log.debug('completion', 'completion graph validated', { journeys: record.journeys.length, controls: record.negativeControls.length, attempts: record.repairAttempts.length, violations: errors.length });
  return errors;
}

function journeyResult(id: string, record: VerificationRecordV2, results: Record<string, CheckResult>): VerificationResult {
  const journey = record.journeys.find(item => item.id === id)!;
  if (journey.checkIds.some(check => results[check] === 'failed')) return 'failed';
  if (!journey.checkIds.length || journey.checkIds.some(check => results[check] !== 'passed')) return 'incomplete';
  const assertions = journey.checkIds.flatMap(id => {
    const check = record.checks.find(item => item.id === id);
    return check ? effectiveExecution(check, record.executions)?.assertions ?? [] : [];
  });
  if (journey.steps.some(step => assertions.some(assertion => assertion.name === step.assertion && assertion.result === 'failed'))) return 'failed';
  return journey.steps.every(step => assertions.some(assertion => assertion.name === step.assertion && assertion.result === 'passed')) ? 'passed' : 'incomplete';
}

export interface ScopeMeasurement {
  status: 'established' | 'not-established' | 'not-applicable';
  passed: number;
  total: number;
  requirementIds: string[];
}

export interface ScopeProgress {
  original: ScopeMeasurement;
  current: ScopeMeasurement;
  addedIds: string[];
  deferredIds: string[];
  droppedIds: string[];
  changedIds: string[];
  exceptionDecisionIds: string[];
}

/** Frozen original expectations and current commitments are distinct measurements. */
export function deriveScopeProgress(state: RunState): ScopeProgress {
  const record = state.verification;
  const summary = state.contractVersion >= 4 && record ? deriveVerification(state) : undefined;
  const currentIds = state.requirements.filter(item => item.status !== 'deferred' && item.status !== 'dropped').map(item => item.id);
  const baseline = record?.version === 2 ? record.scopeBaseline : undefined;
  const originalIds = baseline?.requirementIds ?? [];
  const originalPass = (id: string): boolean => {
    if (!baseline || record?.version !== 2 || !summary) return false;
    const planning = state.requirements.find(item => item.id === id);
    if (!planning || planning.status === 'deferred' || planning.status === 'dropped') return false;
    if (record.findings.some(item => item.status === 'open' && item.requirementIds.includes(id))) return false;
    const mappings = record.scopeMappings.filter(item => item.originalRequirementId === id
      && item.targetRevision === record.targetRevision);
    const mapping = mappings.at(-1);
    const initialRevision = record.manifestAudits.find(audit => audit.id === baseline.auditId)?.targetRevision ?? 1;
    if (record.targetRevision > initialRevision && !mapping) return false;
    if (mapping?.relation === 'withdrawn') return false;
    const current = mapping?.currentRequirementIds ?? [id];
    if (!current.length || current.some(requirement => summary.requirementResults[requirement] !== 'passed')) return false;
    const expectation = baseline.expectations.find(item => item.requirementId === id);
    if (!expectation?.clauseIds.length) return false;
    const changed = mapping && mapping.relation !== 'unchanged';
    const checkIds = changed ? mapping.originalCheckIds : [...new Set([
      ...(expectation.checkIds ?? []), ...(mapping?.originalCheckIds ?? []),
    ])];
    if (changed && checkIds.length === 0) return false;
    return checkIds.every(check => summary.checkResults[check] === 'passed');
  };
  const measurement = (ids: string[], established: boolean, passed: number): ScopeMeasurement => ({
    status: !established ? 'not-established' : ids.length === 0 ? 'not-applicable' : 'established',
    requirementIds: ids, passed, total: ids.length,
  });
  const result: ScopeProgress = {
    original: measurement(originalIds, !!baseline, originalIds.filter(originalPass).length),
    current: measurement(currentIds, !!summary, currentIds.filter(id => summary?.requirementResults[id] === 'passed').length),
    addedIds: baseline ? state.requirements.filter(item => !originalIds.includes(item.id)).map(item => item.id) : [],
    deferredIds: state.requirements.filter(item => item.status === 'deferred').map(item => item.id),
    droppedIds: state.requirements.filter(item => item.status === 'dropped').map(item => item.id),
    changedIds: record?.version === 2 ? [...new Set(record.scopeMappings.filter(item => item.targetRevision === record.targetRevision
      && (item.relation === 'changed' || item.relation === 'split')).map(item => item.originalRequirementId))] : [],
    exceptionDecisionIds: record?.decisions.filter(item => item.kind === 'accepted_exception').map(item => item.id) ?? [],
  };
  log.debug('scope', 'scope progress derived', { original: result.original.passed, originalTotal: result.original.total,
    current: result.current.passed, currentTotal: result.current.total });
  return result;
}
