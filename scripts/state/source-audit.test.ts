// Source-intent regressions exercise version dispatch and immutable original scope.
// Synthetic receipts prove mechanical validation only; actual dispatch is evaluated separately.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { correctedSourceAuditState, sourceVerifiedState, verifiedState, sha256, CAPTURES, SOURCE_MANIFEST } from './fixtures/verification.ts';
import { validateState } from './validate.ts';
import { validateVerificationTransition } from './verification.ts';
import { validateEvidence } from './evidence.ts';
import { checkG1 } from '../gates/check-g1.ts';

const fields = (state: unknown) => validateState(state).map(item => item.field);

test('a returned source audit and original agreement establish G1 for version 5', () => {
  const state = sourceVerifiedState();
  assert.deepEqual(validateState(state), []);
  assert.deepEqual(checkG1(state), []);
  assert.deepEqual(validateState(verifiedState()), []);
  assert.deepEqual(checkG1(verifiedState()), []);
});

test('numeric limits and negation retain their exact original-language span', () => {
  const state = sourceVerifiedState();
  const clause = state.verification!.sourceClauses[0]!;
  assert.match(clause.quote, /Не сохранять больше 3/);
  clause.quote = 'Сохранять записи';
  assert.ok(fields(state).some(field => field.includes('sourceClauses')));
});

test('a corrected audit establishes agreement without rewriting failed draft clauses', () => {
  const state = correctedSourceAuditState();
  assert.deepEqual(validateState(state), []);
  assert.deepEqual(checkG1(state), []);
  assert.deepEqual(state.verification!.sourceClauses[0]!.requirementIds, []);
  state.verification!.sourceClauses[0]!.requirementIds = ['R01'];
  state.verification!.scopeBaseline!.expectations[0]!.clauseIds = ['CL-1'];
  assert.ok(fields(state).includes('verification.scopeBaseline'));
});

test('historical mappings cannot replace a missing row in the current passed audit', () => {
  const state = correctedSourceAuditState();
  state.requirements.push({ id: 'R02', status: 'in-spec' });
  state.verification!.sourceClauses[0]!.requirementIds = ['R02'];
  assert.ok(checkG1(state).length > 0);
});

test('a later failed audit of the same inputs invalidates an earlier pass', () => {
  const state = correctedSourceAuditState();
  const record = state.verification!;
  record.manifestAudits.push({ ...record.manifestAudits[1]!, id: 'MA-3', result: 'failed',
    findings: ['A condition was missed'], dispatchId: 'dispatch-3', readerId: 'reader-3', returnId: 'return-3',
    auditedAt: '2026-09-29T09:03:00Z' });
  assert.ok(checkG1(state).length > 0);
  assert.ok(fields(state).includes('gates[G1].status'));
  record.manifestAudits.push({ ...record.manifestAudits[1]!, id: 'MA-4', dispatchId: 'dispatch-4',
    readerId: 'reader-4', returnId: 'return-4', auditedAt: '2026-09-29T09:04:00Z' });
  assert.deepEqual(validateState(state), []);
  assert.deepEqual(checkG1(state), []);
});

test('emoji anchors count code points rather than UTF-16 code units', () => {
  const state = sourceVerifiedState();
  const record = state.verification!;
  const source = record.sourceSnapshots[0]!;
  source.text = '🧭 ' + source.text;
  source.sha256 = sha256(source.text);
  record.sourceClauses[0]!.start = 2;
  record.sourceClauses[0]!.end += 2;
  record.manifestAudits[0]!.sourceDigests['SRC-1'] = source.sha256;
  assert.deepEqual(validateState(state), []);
});

test('wrong source hashes, span bounds and duplicate IDs cannot certify an audit', () => {
  for (const mutate of [
    (state: ReturnType<typeof sourceVerifiedState>) => { state.verification!.sourceSnapshots[0]!.sha256 = '0'.repeat(64); },
    (state: ReturnType<typeof sourceVerifiedState>) => { state.verification!.sourceClauses[0]!.end = 999; },
    (state: ReturnType<typeof sourceVerifiedState>) => { state.verification!.sourceSnapshots.push({ ...state.verification!.sourceSnapshots[0]! }); },
  ]) {
    const state = sourceVerifiedState(); mutate(state);
    assert.ok(validateState(state).length > 0);
  }
});

test('unmapped, omitted and contextual clauses cannot silently establish agreement', () => {
  const state = sourceVerifiedState();
  state.verification!.sourceClauses[0]!.requirementIds = [];
  assert.ok(checkG1(state).length > 0);
  assert.ok(fields(state).includes('gates[G1].status'));
  state.verification!.sourceClauses = [];
  state.verification!.manifestAudits[0]!.clauseIds = [];
  assert.ok(checkG1(state).length > 0);
});

test('a valid contextual exclusion needs a reason and remains outside original requirements', () => {
  const state = sourceVerifiedState();
  const record = state.verification!;
  record.sourceClauses.push({ ...record.sourceClauses[0]!, id: 'CL-2',
    classification: 'context', requirementIds: [], exclusionReason: 'Background example without a requested outcome' });
  record.manifestAudits[0]!.clauseIds.push('CL-2');
  assert.deepEqual(validateState(state), []);
  delete record.sourceClauses[1]!.exclusionReason;
  assert.ok(fields(state).some(field => field.includes('sourceClauses')));
});

test('a changed manifest or added source invalidates G1 despite a prior pass', () => {
  const state = sourceVerifiedState();
  state.verification!.manifestDigest = sha256('different manifest');
  assert.ok(checkG1(state).length > 0);
  assert.ok(fields(state).includes('gates[G1].status'));
  const added = sourceVerifiedState();
  added.verification!.sourceSnapshots.push({ id: 'SRC-2', origin: 'addition', text: 'Also reopen.',
    sha256: sha256('Also reopen.'), capturedAt: added.startedAt, targetRevision: 1 });
  assert.ok(checkG1(added).length > 0);
});

test('a missing actual independent return remains incomplete even when called passed', () => {
  const state = sourceVerifiedState();
  delete state.verification!.manifestAudits[0]!.returnId;
  assert.ok(checkG1(state).length > 0);
  assert.ok(fields(state).some(field => field.includes('manifestAudits')));
});

test('incomplete active drafts are valid without claiming agreement', () => {
  const state = sourceVerifiedState();
  state.lifecycle = 'active'; delete state.outcome; delete state.finishedAt;
  state.gates[0]!.status = 'pending'; state.gates[3]!.status = 'pending';
  const record = state.verification!;
  record.sourceClauses = []; record.acceptanceRounds = [];
  delete record.scopeBaseline;
  record.manifestAudits[0]!.result = 'incomplete';
  record.manifestAudits[0]!.clauseIds = [];
  record.manifestAudits[0]!.limitation = 'Fresh reader dispatch unavailable';
  assert.deepEqual(validateState(state), []);
  assert.ok(checkG1(state).length > 0);
});

test('published original baseline and source history cannot be rewritten or removed', () => {
  const original = sourceVerifiedState();
  for (const mutate of [
    (state: ReturnType<typeof sourceVerifiedState>) => { state.verification!.scopeBaseline!.expectations[0]!.text = 'Easier target'; },
    (state: ReturnType<typeof sourceVerifiedState>) => { state.verification!.sourceSnapshots[0]!.text = 'Easier source'; },
    (state: ReturnType<typeof sourceVerifiedState>) => { state.verification!.manifestAudits = []; },
  ]) {
    const next = sourceVerifiedState(); mutate(next);
    assert.ok(validateVerificationTransition(original, next).length > 0);
  }
});

test('source audit digest is checked against the real manifest at publication boundary', async () => {
  const project = await mkdtemp(path.join(tmpdir(), 'maestro-source-audit-'));
  try {
    const state = sourceVerifiedState();
    const run = path.join(project, '.maestro', state.slug);
    for (const [relative, body] of Object.entries({ ...CAPTURES, 'manifest.md': SOURCE_MANIFEST })) {
      await mkdir(path.dirname(path.join(run, relative)), { recursive: true });
      await writeFile(path.join(run, relative), body);
    }
    assert.deepEqual(await validateEvidence(state, project), []);
    await writeFile(path.join(run, 'manifest.md'), 'R01: retain any number of entries');
    assert.ok((await validateEvidence(state, project)).some(item => item.field === 'verification.manifestDigest'));
  } finally { await rm(project, { recursive: true, force: true }); }
});
