// Shared synthetic version-4 state and immutable capture contents.
//
// The strings are deliberately credential-free so repository tooling and the copied
// runtime can exercise the same artifact hashes without production data.

import { createHash } from 'node:crypto';

import type { EvidenceFingerprint, RunState, VerificationRecordV1, VerificationRecordV2 } from '../contract.ts';

export const CAPTURES: Record<string, string> = {
  'evidence/REF-1/source.txt': 'Reference menu opens on pointer entry.\n',
  'evidence/X-1/pointer.txt': 'initial:hidden hover:visible panel:usable exit:hidden\n',
};

export const sha256 = (body: string): string => createHash('sha256').update(body).digest('hex');

export function fingerprint(): EvidenceFingerprint {
  return {
    reference: 'reference-revision-1',
    build: 'integrated-build-1',
    data: 'fixture-1',
    runtime: 'desktop-1920x1080-en',
    acceptanceInput: 'manifest-and-additions-1',
    relevantPaths: [],
    inputHashes: {},
  };
}

export function verifiedState(): RunState & { verification?: VerificationRecordV1 } {
  return {
    contractVersion: 4,
    runId: 'run-synthetic-1',
    slug: 'synthetic-menu',
    startedAt: '2026-09-29T09:00:00Z',
    updatedAt: '2026-09-29T09:20:00Z',
    mode: 'semi', depth: 'normal', polish: false, dialChanges: [],
    stages: [{ id: 'acceptance', status: 'done', startedAt: '2026-09-29T09:10:00Z', finishedAt: '2026-09-29T09:19:00Z' }],
    currentStage: 'acceptance',
    tasks: [{
      id: '01', title: 'Implement menu', requirementIds: ['R01'], status: 'done',
      blockedBy: [], wave: 1, zone: ['src/menu'], retries: 0, repairs: 0,
      handoffs: 0, files: ['src/menu.js'], commits: ['abcdef0'],
    }],
    requirements: [{ id: 'R01', status: 'in-spec' }],
    gates: [
      { id: 'G1', status: 'passed', findings: [] },
      { id: 'G2', status: 'passed', findings: [] },
      { id: 'G3', status: 'passed', findings: [] },
      { id: 'G4', status: 'passed', findings: [] },
    ],
    debt: { placeholders: [], assumptions: [], emptyEnv: [] }, additions: [],
    lifecycle: 'closed', outcome: 'completed', finishedAt: '2026-09-29T09:20:00Z',
    verification: {
      version: 1, targetRevision: 1, acceptanceInputDigest: 'manifest-and-additions-1',
      references: [{ id: 'REF-1', statement: 'Preserve the existing menu', role: 'authoritative_behavior',
        location: 'reference/', accessMethod: 'local-files', available: true, revision: 'reference-revision-1',
        conditions: ['desktop'], approvedDeviationIds: [] }],
      surfaces: [{ id: 'S-1', referenceId: 'REF-1', source: 'reference/menu.html', inspected: true,
        equivalenceGroup: 'shared-header', variantIds: ['desktop'] }],
      obligations: [{ id: 'O-1', requirementIds: ['R01'], referenceIds: ['REF-1'],
        surfaceIds: ['S-1'], expectation: 'Pointer opens and closes the menu',
        discovery: 'observed', sourceEvidenceIds: ['E-REF'], variantIds: ['desktop'],
        checkIds: ['C-1'], implementationTaskIds: ['01'], targetRevision: 1 }],
      checks: [{ id: 'C-1', obligationIds: ['O-1'], method: 'browser-interaction',
        target: 'integrated-app', procedure: ['Move pointer onto menu trigger'],
        oracle: 'reference observation E-REF', oracleEvidenceIds: ['E-REF'],
        variantIds: ['desktop'], executionTaskId: '01', integrationDependencies: ['01'],
        required: true, currentFingerprint: fingerprint() }],
      executions: [{ id: 'X-1', checkId: 'C-1', result: 'passed', fingerprint: fingerprint(),
        invocation: 'headless browser pointer action', tool: 'chromium-cdp', host: 'test-host',
        executor: 'test-runner', executedAt: '2026-09-29T09:15:00Z', viewport: '1920x1080',
        locale: 'en', assertions: [{ name: 'panel opens', result: 'passed', evidenceIds: ['E-1'] }],
        evidenceIds: ['E-1'] }],
      evidence: [
        { id: 'E-REF', path: 'evidence/REF-1/source.txt', sha256: sha256(CAPTURES['evidence/REF-1/source.txt']!),
          mediaType: 'text/plain', capturedAt: '2026-09-29T09:02:00Z', origin: 'reference' },
        { id: 'E-1', path: 'evidence/X-1/pointer.txt', sha256: sha256(CAPTURES['evidence/X-1/pointer.txt']!),
          mediaType: 'text/plain', capturedAt: '2026-09-29T09:15:00Z', origin: 'execution' },
      ],
      findings: [], decisions: [],
      coverageReviews: [{ id: 'CR-1', requirementId: 'R01', status: 'complete',
        targetRevision: 1,
        inspectedSurfaceIds: ['S-1'], uninspectedSurfaceIds: [], reviewer: 'independent-reader',
        reviewedAt: '2026-09-29T09:16:00Z', inputDigest: 'manifest-and-additions-1' }],
      acceptanceRounds: [{ id: 'AR-1', inputDigest: 'manifest-and-additions-1',
        targetRevision: 1,
        referenceIds: ['REF-1'], executionIds: ['X-1'], findingIds: [],
        coverageReviewIds: ['CR-1'], requirementResults: { R01: 'passed' },
        g4: 'passed', performedAt: '2026-09-29T09:19:00Z' }],
      promisedWork: [],
      repairLimits: { perFinding: 2, total: 8 }, repairAttempts: [],
    },
  };
}

/** Synthetic audit receipts test structure; they do not establish real workflow execution. */
export function sourceVerifiedState(): RunState & { verification?: VerificationRecordV2 } {
  const old = verifiedState();
  const text = 'Не сохранять больше 3 записей. Меню открывается при наведении.';
  const manifest = 'R01: Do not retain more than 3 entries; menu opens on hover.\n';
  const manifestDigest = sha256(manifest);
  const sourceId = 'SRC-1';
  const sourceDigest = sha256(text);
  const record: VerificationRecordV2 = {
    ...old.verification!, version: 2, manifestDigest,
    sourceSnapshots: [{ id: sourceId, origin: 'initial', text, sha256: sourceDigest,
      capturedAt: old.startedAt, targetRevision: 1 }],
    sourceClauses: [{ id: 'CL-1', sourceId, start: 0, end: Array.from(text).length,
      quote: text, classification: 'requirement', requirementIds: ['R01'] }],
    manifestAudits: [{ id: 'MA-1', sourceIds: [sourceId], sourceDigests: { [sourceId]: sourceDigest },
      manifestDigest, targetRevision: 1, clauseIds: ['CL-1'], findings: [], result: 'passed',
      dispatchId: 'synthetic-dispatch-1', readerId: 'synthetic-reader-1', returnId: 'synthetic-return-1',
      auditedAt: '2026-09-29T09:01:00Z' }],
    scopeBaseline: { id: 'BASE-1', sourceIds: [sourceId], manifestDigest, auditId: 'MA-1',
      agreementId: 'AG-1', agreedAt: '2026-09-29T09:02:00Z', requirementIds: ['R01'],
      expectations: [{ requirementId: 'R01', clauseIds: ['CL-1'], text, checkIds: ['C-1'] }] },
    scopeMappings: [], journeys: [], negativeControls: [], repairAttempts: [],
  };
  return { ...old, contractVersion: 5, verification: record };
}

/** Failed draft clauses remain historical; only the returned corrected audit binds agreement. */
export function correctedSourceAuditState(): ReturnType<typeof sourceVerifiedState> {
  const state = sourceVerifiedState();
  const record = state.verification!;
  const clause = record.sourceClauses[0]!;
  record.sourceClauses = [{ ...clause, requirementIds: [] }, { ...clause, id: 'CL-2' }];
  const audit = record.manifestAudits[0]!;
  record.manifestAudits = [
    { ...audit, manifestDigest: sha256('R01: Save entries.\n'), result: 'failed',
      findings: ['The candidate omits the maximum and negation.'], auditedAt: '2026-09-29T09:00:30Z' },
    { ...audit, id: 'MA-2', clauseIds: ['CL-2'], dispatchId: 'synthetic-dispatch-2',
      readerId: 'synthetic-reader-2', returnId: 'synthetic-return-2', auditedAt: '2026-09-29T09:01:30Z' },
  ];
  record.scopeBaseline!.auditId = 'MA-2';
  record.scopeBaseline!.expectations[0]!.clauseIds = ['CL-2'];
  return state;
}

/** Ownership is assigned by Plan after the specification graph is published. */
export function planningOwnershipState(assigned = false): ReturnType<typeof sourceVerifiedState> {
  const state = sourceVerifiedState();
  state.lifecycle = 'active'; delete state.outcome; delete state.finishedAt;
  state.currentStage = 'plan';
  state.stages = [
    { id: 'spec', status: 'done', startedAt: '2026-09-29T09:00:00Z', finishedAt: '2026-09-29T09:10:00Z' },
    { id: 'plan', status: 'active', startedAt: '2026-09-29T09:10:00Z' },
  ];
  state.tasks = assigned ? [{ ...state.tasks[0]!, status: 'queued' }] : [];
  state.gates[2]!.status = 'pending'; state.gates[3]!.status = 'pending';
  const record = state.verification!;
  record.executions = []; record.evidence = record.evidence.filter(item => item.origin === 'reference');
  record.coverageReviews = []; record.acceptanceRounds = [];
  record.obligations[0]!.implementationTaskIds = assigned ? ['01'] : [];
  record.checks[0]!.integrationDependencies = assigned ? ['01'] : [];
  if (assigned) record.checks[0]!.executionTaskId = '01'; else delete record.checks[0]!.executionTaskId;
  return state;
}

export const SOURCE_MANIFEST = 'R01: Do not retain more than 3 entries; menu opens on hover.\n';

export const CONTROL_CAPTURES: Record<string, string> = {
  'evidence/NCX-1/result.txt': 'healthy save passes\n',
  'evidence/NCX-2/result.txt': 'disabled save fails persistence assertion\n',
  'evidence/NCX-3/result.txt': 'restored save passes\n',
};

export function controlledState(): RunState & { verification?: VerificationRecordV2 } {
  const state = sourceVerifiedState();
  const record = state.verification!;
  const check = record.checks[0]!;
  const oracleDigest = sha256(JSON.stringify([check.procedure, check.oracle, []]));
  record.negativeControls = [{ id: 'NC-1', checkId: 'C-1', targetRevision: 1,
    selectionBasis: 'acceptance_critical', applicability: 'Persistence assertion must detect disabled handler',
    defect: 'Disable save handler in disposable copy', expectedAssertion: 'panel opens',
    isolationFingerprint: sha256('isolated-copy'), mainFingerprint: fingerprint(), oracleDigest,
    result: 'passed', runs: (['clean', 'mutated', 'restored'] as const).map((phase, index) => {
      const id = `NCX-${index + 1}`;
      const evidenceId = `ENC-${index + 1}`;
      const result = phase === 'mutated' ? 'failed' as const : 'passed' as const;
      const content = CONTROL_CAPTURES[`evidence/${id}/result.txt`]!;
      record.evidence.push({ id: evidenceId, path: `evidence/${id}/result.txt`, sha256: sha256(content),
        mediaType: 'text/plain', capturedAt: state.updatedAt!, origin: 'execution' });
      return { id, phase, result, oracleDigest,
        assertions: [{ name: 'panel opens', result, evidenceIds: [evidenceId] }], evidenceIds: [evidenceId],
        executedAt: state.updatedAt!, executor: 'synthetic-control-runner', invocation: 'unchanged assertion',
        fingerprint: { ...fingerprint(), ...(phase === 'mutated' ? { build: 'mutated-copy' } : {}) } };
    }) }];
  return state;
}

/** One structurally valid shared fixture for original/current scope parity. */
export function deferredScopeState(): RunState & { verification?: VerificationRecordV2 } {
  const state = sourceVerifiedState();
  const record = state.verification!;
  const ids = Array.from({ length: 20 }, (_, index) => `R${String(index + 1).padStart(2, '0')}`);
  state.requirements = ids.map((id, index) => ({ id, status: index < 18 ? 'in-spec' : 'deferred',
    ...(index >= 18 ? { reason: 'User defers this outcome' } : {}) }));
  state.tasks[0]!.requirementIds = ids;
  record.sourceClauses[0]!.requirementIds = ids;
  record.scopeBaseline!.requirementIds = ids;
  record.scopeBaseline!.expectations = ids.map(id => ({ requirementId: id, clauseIds: ['CL-1'],
    text: `Original expectation ${id}`, checkIds: ['C-1'] }));
  record.targetRevision = 2;
  record.obligations = ids.map((id, index) => ({ ...record.obligations[0]!, id: `O-${index + 1}`,
    requirementIds: [id], targetRevision: 2 }));
  record.checks[0]!.obligationIds = record.obligations.map(item => item.id);
  record.coverageReviews = ids.slice(0, 18).map((id, index) => ({ ...record.coverageReviews[0]!,
    id: `CR-${index + 1}`, requirementId: id, targetRevision: 2 }));
  record.decisions.push({ id: 'D-1', kind: 'scope_amendment', authorizedBy: 'user',
    authorizedAt: state.updatedAt!, authorization: 'Defer R19 and R20',
    presentedFindingIds: [], selectedFindingIds: [], presentedObligationIds: ['O-19', 'O-20'],
    selectedObligationIds: ['O-19', 'O-20'], previousTargetRevision: 1, targetRevision: 2 });
  record.manifestAudits.push({ ...record.manifestAudits[0]!, id: 'MA-2', targetRevision: 2,
    dispatchId: 'synthetic-dispatch-2', readerId: 'synthetic-reader-2', returnId: 'synthetic-return-2' });
  record.scopeMappings = ids.map((id, index) => ({ id: `SM-${index + 1}`, originalRequirementId: id,
    currentRequirementIds: [id], relation: 'unchanged', originalCheckIds: ['C-1'], targetRevision: 2 }));
  record.acceptanceRounds[0]!.targetRevision = 2;
  record.acceptanceRounds[0]!.coverageReviewIds = record.coverageReviews.map(item => item.id);
  record.acceptanceRounds[0]!.requirementResults = Object.fromEntries(ids.slice(0, 18).map(id => [id, 'passed']));
  return state;
}
