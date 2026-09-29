// Contract-4 regressions for false completion and bounded exception closure.
//
// Each negative case would have passed the version-3 validator because it did
// not know about obligations, current evidence, or closure outcomes.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { CAPTURES, fingerprint, sha256, verifiedState } from './fixtures/verification.ts';
import { deriveVerification } from './verification.ts';
import { validateState, InvalidStateError } from './validate.ts';
import { importEvidence, validateEvidence } from './evidence.ts';
import { formatAcceptanceTable, prepareLegacyResume, projectAcceptanceReport, projectState } from './projection.ts';
import { readState } from './read.ts';
import { writeState } from './write.ts';

const copy = () => structuredClone(verifiedState());
const fields = (state: ReturnType<typeof copy>) => validateState(state).map(item => item.field);

test('a current version-4 delivery has one derived passing verdict', () => {
  const state = copy();
  assert.deepEqual(validateState(state), []);
  assert.equal(deriveVerification(state).g4, 'passed');
  assert.equal(projectState(state).verificationEstablished, true);
});

test('report rows use derived conformance and retain accepted exception failures', () => {
  const state = copy();
  state.verification!.executions[0]!.result = 'failed';
  state.outcome = 'closed_with_exceptions';
  state.verification!.decisions.push({ id: 'D-1', kind: 'accepted_exception',
    authorizedBy: 'user', authorizedAt: state.finishedAt!, authorization: 'Close with known defect',
    presentedFindingIds: [], presentedObligationIds: ['O-1'],
    selectedFindingIds: [], selectedObligationIds: ['O-1'] });
  const report = projectAcceptanceReport(state);
  assert.equal(report.g4, 'failed');
  assert.equal(report.rows[0]?.result, 'failed');
  assert.deepEqual(report.acceptedExceptionIds, ['D-1']);
  assert.match(formatAcceptanceTable(report), /\| R01 \| in-spec \| failed \| O-1 \|/);
});

test('V03 and V09: a signature or matching metadata cannot fill a missing browser execution', () => {
  const state = copy();
  state.verification!.executions[0]!.result = 'unavailable';
  state.verification!.executions[0]!.limitation = 'browser unavailable';
  state.verification!.checks.push({
    ...state.verification!.checks[0]!, id: 'C-signature', method: 'source-signature',
    required: false,
  });
  state.verification!.executions.push({
    ...state.verification!.executions[0]!, id: 'X-signature', checkId: 'C-signature',
    result: 'passed', evidenceIds: ['E-signature'],
    assertions: [{ name: 'module signature exists', result: 'passed', evidenceIds: ['E-signature'] }],
  });
  state.verification!.evidence.push({ id: 'E-signature', path: 'evidence/X-signature/signature.txt',
    sha256: sha256('signature'), mediaType: 'text/plain',
    capturedAt: '2026-09-29T09:15:00Z', origin: 'execution' });
  assert.equal(deriveVerification(state).requirementResults['R01'], 'incomplete');
  assert.ok(fields(state).includes('outcome'));
});

test('V10: a reader omission cannot be stored as a passing requirement result', () => {
  const state = copy();
  state.verification!.acceptanceRounds[0]!.requirementResults = {};
  assert.ok(fields(state).includes('verification.acceptanceRounds'));
});

test('V11: a coordinator finding invalidates an earlier independent pass', () => {
  const state = copy();
  state.verification!.findings.push({ id: 'F-1', requirementIds: ['R01'], obligationIds: ['O-1'],
    checkIds: ['C-1'], evidenceIds: ['E-1'], origin: 'coordinator',
    description: 'Menu panel is hidden', status: 'open' });
  const summary = deriveVerification(state);
  assert.equal(summary.requirementResults['R01'], 'failed');
  assert.equal(summary.g4, 'failed');
  assert.ok(fields(state).includes('outcome'));
});

test('V12 and V13: accepting F1 does not accept a later F2', () => {
  const state = copy();
  const finding = { id: 'F-1', requirementIds: ['R01'], obligationIds: ['O-1'],
    checkIds: ['C-1'], evidenceIds: ['E-1'], origin: 'user' as const,
    description: 'Menu remains hidden', status: 'open' as const };
  state.verification!.findings.push(finding, { ...finding, id: 'F-2', description: 'Image absent' });
  state.verification!.decisions.push({ id: 'D-1', kind: 'accepted_exception',
    authorizedBy: 'user', authorizedAt: '2026-09-29T09:19:00Z', authorization: 'Accept F1',
    presentedFindingIds: ['F-1'], presentedObligationIds: ['O-1'],
    selectedFindingIds: ['F-1'], selectedObligationIds: ['O-1'] });
  state.outcome = 'closed_with_exceptions';
  state.gates[3]!.status = 'failed';
  state.verification!.acceptanceRounds[0]!.g4 = 'failed';
  state.verification!.acceptanceRounds[0]!.requirementResults = { R01: 'failed' };
  assert.ok(fields(state).includes('outcome'));
});

test('V14: bounded exception closure retains the technical failure', () => {
  const state = copy();
  state.verification!.executions[0]!.result = 'failed';
  state.verification!.findings.push({ id: 'F-1', requirementIds: ['R01'], obligationIds: ['O-1'],
    checkIds: ['C-1'], evidenceIds: ['E-1'], origin: 'independent',
    description: 'Menu remains hidden', status: 'open' });
  state.verification!.decisions.push({ id: 'D-1', kind: 'accepted_exception',
    authorizedBy: 'user', authorizedAt: '2026-09-29T09:19:00Z', authorization: 'Close with F1',
    presentedFindingIds: ['F-1'], presentedObligationIds: ['O-1'],
    selectedFindingIds: ['F-1'], selectedObligationIds: ['O-1'] });
  state.verification!.acceptanceRounds[0]!.findingIds = ['F-1'];
  state.verification!.acceptanceRounds[0]!.requirementResults = { R01: 'failed' };
  state.verification!.acceptanceRounds[0]!.g4 = 'failed';
  state.gates[3]!.status = 'failed';
  state.outcome = 'closed_with_exceptions';
  assert.deepEqual(validateState(state), []);
  assert.equal(projectState(state).verificationEstablished, false);
  assert.equal(projectState(state).g4, 'failed');
});

test('V15 and V22: a promised round or failed G4 prevents completed closure', () => {
  const state = copy();
  state.verification!.promisedWork.push({ id: 'P-1', description: 'Run acceptance again', status: 'open' });
  assert.ok(fields(state).includes('verification.promisedWork'));
  assert.ok(fields(state).includes('outcome'));
});

test('V18: changed shared asset fingerprint makes the old pointer pass stale', () => {
  const state = copy();
  state.verification!.checks[0]!.currentFingerprint = { ...fingerprint(), build: 'integrated-build-2' };
  const summary = deriveVerification(state);
  assert.equal(summary.checkResults['C-1'], 'stale');
  assert.equal(summary.g4, 'pending');
  assert.ok(fields(state).includes('outcome'));
});

test('V19: changed additions invalidate acceptance input and prior success', () => {
  const state = copy();
  state.verification!.acceptanceInputDigest = 'manifest-and-additions-2';
  assert.equal(deriveVerification(state).g4, 'pending');
  assert.ok(fields(state).includes('gates[G4].status'));
});

test('V20: one missing production detail does not exempt its passing sibling', () => {
  const state = copy();
  state.lifecycle = 'active';
  delete state.outcome;
  delete state.finishedAt;
  state.requirements[0]!.status = 'placeholder';
  state.requirements[0]!.reason = 'Production image unavailable';
  state.verification!.obligations.push({ ...state.verification!.obligations[0]!,
    id: 'O-image', expectation: 'Production image is present', checkIds: ['C-image'],
    discovery: 'source_derived', sourceEvidenceIds: [] });
  state.verification!.checks.push({ ...state.verification!.checks[0]!, id: 'C-image',
    obligationIds: ['O-image'], method: 'asset-check' });
  state.gates[3]!.status = 'pending';
  state.verification!.acceptanceRounds = [];
  assert.equal(deriveVerification(state).obligationResults['O-1'], 'passed');
  assert.equal(deriveVerification(state).obligationResults['O-image'], 'incomplete');
});

test('V21: distinct findings have separate repair counts under one finite global budget', () => {
  const state = copy();
  const finding = { id: 'F-1', requirementIds: ['R01'], obligationIds: ['O-1'],
    checkIds: ['C-1'], evidenceIds: ['E-1'], origin: 'coordinator' as const,
    description: 'Menu missing', status: 'open' as const };
  state.verification!.findings.push(finding, { ...finding, id: 'F-2', description: 'Image missing' });
  state.verification!.repairAttempts.push(
    { id: 'A-1', findingId: 'F-1', taskId: '01', at: '2026-09-29T09:17:00Z', outcome: 'still_failing' },
    { id: 'A-2', findingId: 'F-1', taskId: '01', at: '2026-09-29T09:18:00Z', outcome: 'still_failing' },
    { id: 'A-3', findingId: 'F-2', taskId: '01', at: '2026-09-29T09:19:00Z', outcome: 'unavailable' },
  );
  state.verification!.findings.push({ ...finding, id: 'F-1-renamed', supersedes: 'F-1' });
  state.verification!.repairAttempts.push({ id: 'A-4', findingId: 'F-1-renamed',
    taskId: '01', at: '2026-09-29T09:20:00Z', outcome: 'still_failing' });
  assert.ok(validateState(state).some(item => item.message.includes('stable failure F-1')));
  state.verification!.repairAttempts.pop();
  state.verification!.repairLimits.total = 2;
  assert.ok(validateState(state).some(item => item.message.includes('overall repair budget')));
});

test('V23: a historical finished state remains readable but unverified', () => {
  const state = copy();
  state.contractVersion = 3;
  delete state.lifecycle;
  delete state.outcome;
  delete state.verification;
  state.gates[3]!.status = 'failed';
  assert.deepEqual(validateState(state), []);
  assert.equal(projectState(state).notice, 'verification not established');
  assert.equal(projectState(state).g4, 'failed');
});

test('historical resume requires a reconstructed record and never carries a prior pass', () => {
  const historical = copy();
  const candidate = structuredClone(historical.verification!);
  historical.contractVersion = 3;
  delete historical.lifecycle;
  delete historical.outcome;
  delete historical.verification;
  candidate.executions = [];
  candidate.acceptanceRounds = [];
  candidate.coverageReviews = [];
  const resumed = prepareLegacyResume(historical, candidate);
  assert.equal(resumed.lifecycle, 'active');
  assert.equal(resumed.gates.find(item => item.id === 'G4')?.status, 'pending');
  assert.equal(resumed.finishedAt, undefined);
  assert.equal(deriveVerification(resumed).g4, 'pending');
  assert.deepEqual(validateState(resumed), []);
  candidate.executions = copy().verification!.executions;
  assert.throws(() => prepareLegacyResume(historical, candidate), /fresh executions/);
});

test('a missing, tampered, or escaping capture cannot be published', async () => {
  const project = await mkdtemp(path.join(tmpdir(), 'maestro-evidence-'));
  try {
    const state = copy();
    const runDir = path.join(project, '.maestro', state.slug);
    await mkdir(runDir, { recursive: true });
    const missing = await validateEvidence(state, project);
    assert.ok(missing.some(item => item.message.includes('missing')));
    await assert.rejects(() => writeState(path.join(project, '.maestro'), state), InvalidStateError);

    for (const [relative, body] of Object.entries(CAPTURES)) {
      const file = path.join(runDir, relative);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, body);
    }
    await writeState(path.join(project, '.maestro'), state);
    assert.deepEqual(await readState(path.join(project, '.maestro')), state);
    const capture = path.join(runDir, 'evidence/X-1/pointer.txt');
    await writeFile(capture, 'tampered');
    await assert.rejects(() => readState(path.join(project, '.maestro')), InvalidStateError);
    assert.match(await readFile(capture, 'utf8'), /tampered/);

    state.verification!.evidence[1]!.path = '../elsewhere';
    assert.ok((await validateEvidence(state, project)).some(item => item.message.includes('capture path')));
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test('task-owned captures are hashed, confined, and sealed before publication', async () => {
  const project = await mkdtemp(path.join(tmpdir(), 'maestro-import-'));
  const taskRoot = await mkdtemp(path.join(tmpdir(), 'maestro-task-captures-'));
  try {
    const state = copy();
    await mkdir(path.join(taskRoot, 'raw'));
    await writeFile(path.join(taskRoot, 'raw/reference.txt'), CAPTURES['evidence/REF-1/source.txt']!);
    await writeFile(path.join(taskRoot, 'raw/pointer.txt'), CAPTURES['evidence/X-1/pointer.txt']!);
    const sources = { 'E-REF': 'raw/reference.txt', 'E-1': 'raw/pointer.txt' };
    assert.deepEqual(await importEvidence(state, project, taskRoot, sources), []);
    assert.deepEqual(await validateEvidence(state, project), []);
    await writeFile(path.join(taskRoot, 'raw/pointer.txt'), 'tampered');
    assert.ok((await importEvidence(state, project, taskRoot, sources))
      .some(item => /does not match/.test(item.message)));
    assert.match(await readFile(path.join(project, '.maestro', state.slug,
      'evidence/X-1/pointer.txt'), 'utf8'), /initial:hidden/);
    assert.ok((await importEvidence(state, project, taskRoot, { 'E-1': '../elsewhere' }))
      .some(item => /relative/.test(item.message)));
  } finally {
    await rm(project, { recursive: true, force: true });
    await rm(taskRoot, { recursive: true, force: true });
  }
});

test('a symlinked evidence root outside the project cannot certify a pass', async () => {
  const project = await mkdtemp(path.join(tmpdir(), 'maestro-evidence-link-'));
  const elsewhere = await mkdtemp(path.join(tmpdir(), 'maestro-evidence-outside-'));
  try {
    const state = copy();
    const runDir = path.join(project, '.maestro', state.slug);
    await mkdir(runDir, { recursive: true });
    await symlink(elsewhere, path.join(runDir, 'evidence'));
    assert.ok((await validateEvidence(state, project))
      .some(item => /evidence root escapes/.test(item.message)));
  } finally {
    await rm(project, { recursive: true, force: true });
    await rm(elsewhere, { recursive: true, force: true });
  }
});

test('import refuses a symlinked run root before creating evidence outside the project', async () => {
  const project = await mkdtemp(path.join(tmpdir(), 'maestro-import-link-'));
  const elsewhere = await mkdtemp(path.join(tmpdir(), 'maestro-import-outside-'));
  try {
    await symlink(elsewhere, path.join(project, '.maestro'));
    const state = copy();
    const violations = await importEvidence(state, project, project, {});
    assert.ok(violations.some(item => /evidence root escapes/.test(item.message)));
    await assert.rejects(() => readFile(path.join(elsewhere, state.slug, 'evidence', 'X-1', 'pointer.txt')));
  } finally {
    await rm(project, { recursive: true, force: true });
    await rm(elsewhere, { recursive: true, force: true });
  }
});

test('published oracle history cannot be rewritten to hide a failed behavior', async () => {
  const project = await mkdtemp(path.join(tmpdir(), 'maestro-history-'));
  try {
    const state = copy();
    const stateDir = path.join(project, '.maestro');
    const runDir = path.join(stateDir, state.slug);
    for (const [relative, body] of Object.entries(CAPTURES)) {
      const file = path.join(runDir, relative);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, body);
    }
    await writeState(stateDir, state);
    const changed = copy();
    changed.updatedAt = '2026-09-29T09:21:00Z';
    changed.verification!.checks[0]!.oracle = 'panel stays hidden';
    assert.deepEqual(validateState(changed), []);
    await assert.rejects(() => writeState(stateDir, changed, state.updatedAt), InvalidStateError);
    assert.deepEqual(await readState(stateDir), state);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test('a changed current fingerprint is allowed while the prior round remains historical', () => {
  const original = copy();
  const changed = copy();
  changed.lifecycle = 'active';
  delete changed.outcome;
  delete changed.finishedAt;
  changed.gates[3]!.status = 'pending';
  changed.verification!.checks[0]!.currentFingerprint.build = 'integrated-build-2';
  assert.deepEqual(validateState(changed), []);
  assert.equal(deriveVerification(changed).currentRoundId, undefined);
  assert.equal(deriveVerification(changed).checkResults['C-1'], 'stale');
  // The old round and execution are retained byte-for-byte.
  assert.deepEqual(changed.verification!.acceptanceRounds, original.verification!.acceptanceRounds);
});

test('an ignore mask requires a recorded basis', () => {
  const state = copy();
  state.verification!.checks[0]!.ignoreMask = ['.promo'];
  assert.ok(fields(state).includes('verification.checks[0].ignoreMask'));
  state.verification!.checks[0]!.oracleChangeBasis = 'User-approved mask for dynamic timestamp';
  assert.deepEqual(validateState(state), []);
});

test('relevant input content is checked at the filesystem boundary', async () => {
  const project = await mkdtemp(path.join(tmpdir(), 'maestro-input-'));
  try {
    const state = copy();
    const stateDir = path.join(project, '.maestro');
    const runDir = path.join(stateDir, state.slug);
    for (const [relative, body] of Object.entries(CAPTURES)) {
      const file = path.join(runDir, relative);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, body);
    }
    await writeFile(path.join(project, 'shared.css'), 'menu visible on hover');
    const inputs = { 'shared.css': sha256('menu visible on hover') };
    const relevantPaths = ['shared.css'];
    state.verification!.checks[0]!.currentFingerprint.inputHashes = inputs;
    state.verification!.checks[0]!.currentFingerprint.relevantPaths = relevantPaths;
    state.verification!.executions[0]!.fingerprint.inputHashes = inputs;
    state.verification!.executions[0]!.fingerprint.relevantPaths = relevantPaths;
    await writeState(stateDir, state);
    await writeFile(path.join(project, 'shared.css'), 'menu broken');
    await assert.rejects(() => readState(stateDir), InvalidStateError);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test('an authorized scope amendment advances the target without rewriting history', () => {
  const state = copy();
  state.lifecycle = 'active';
  delete state.outcome;
  delete state.finishedAt;
  state.verification!.targetRevision = 2;
  state.verification!.decisions.push({ id: 'D-scope', kind: 'scope_amendment',
    authorizedBy: 'user', authorizedAt: '2026-09-29T09:22:00Z',
    authorization: 'Menu scope now includes keyboard input',
    presentedFindingIds: [], presentedObligationIds: [],
    selectedFindingIds: [], selectedObligationIds: [],
    previousTargetRevision: 1, targetRevision: 2 });
  state.gates[3]!.status = 'pending';
  assert.equal(deriveVerification(state).requirementResults['R01'], 'incomplete');
  assert.deepEqual(validateState(state), []);
});

test('unknown execution and evidence IDs are rejected after planning', () => {
  const state = copy();
  state.verification!.obligations[0]!.implementationTaskIds = [];
  state.verification!.checks[0]!.executionTaskId = '99';
  state.verification!.executions[0]!.evidenceIds = ['unknown'];
  const violations = validateState(state).map(item => item.message);
  assert.ok(violations.some(item => item.includes('unknown ID 99')));
  assert.ok(violations.some(item => item.includes('unknown ID unknown')));
});

test('V24: a non-UI obligation can pass through a fresh output check', () => {
  const state = copy();
  state.verification!.references = [];
  state.verification!.surfaces = [];
  state.verification!.obligations[0]!.referenceIds = [];
  state.verification!.obligations[0]!.surfaceIds = [];
  state.verification!.obligations[0]!.discovery = 'source_derived';
  state.verification!.obligations[0]!.sourceEvidenceIds = [];
  state.verification!.obligations[0]!.expectation = 'Document contains the required section';
  state.verification!.checks[0]!.method = 'document-output';
  state.verification!.checks[0]!.oracleEvidenceIds = [];
  state.verification!.coverageReviews[0]!.inspectedSurfaceIds = [];
  state.verification!.acceptanceRounds[0]!.referenceIds = [];
  assert.deepEqual(validateState(state), []);
});

test('the fixture captures use stable real SHA-256 values', () => {
  assert.equal(copy().verification!.evidence[0]!.sha256, sha256(CAPTURES['evidence/REF-1/source.txt']!));
});
