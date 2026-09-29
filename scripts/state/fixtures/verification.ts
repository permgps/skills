// Shared synthetic version-4 state and immutable capture contents.
//
// The strings are deliberately credential-free so TS, Python, and the copied
// runtime can exercise the same artifact hashes without production data.

import { createHash } from 'node:crypto';

import type { EvidenceFingerprint, RunState } from '../contract.ts';

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

export function verifiedState(): RunState {
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
