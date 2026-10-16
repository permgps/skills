// Deterministic reproductions of intermittency, with real assertions and captures.
// The seed/schedule is held constant across faulty, partial and repaired builds.
import assert from 'node:assert/strict';
import { repairContract6State, sha256, CAPTURES, CONTROL_CAPTURES } from './verification.ts';
import type { CheckExecutionV3, IntermittentRepair, IntermittentScenario } from '../../../skills/maestro/tools/runtime/state/contract.mts';

export function symptom(kind: 'alternating' | 'seeded', sample: number, role: string, build: 'faulty' | 'partial' | 'fixed'): 'passed' | 'failed' {
  const seed = (Math.imul(sample + 17, 1664525) + 1013904223) >>> 0;
  const trigger = kind === 'alternating' ? sample % 2 === 0 : seed % 3 === 0;
  const broken = build === 'faulty' || (build === 'partial' && role === 'original');
  try { assert.equal(broken && trigger, false, 'triggered workload retains its result'); return 'passed'; }
  catch { return 'failed'; }
}

export const stamp = (n: number): string => new Date(Date.parse('2026-09-29T10:00:00Z') + n * 1000).toISOString();
export function intermittentFixture(kind: 'alternating' | 'seeded' = 'alternating') {
  const state = repairContract6State();
  const record = state.verification!;
  state.updatedAt = stamp(10);
  record.checks[0]!.readinessProbes = [];
  record.checks.push({ ...structuredClone(record.checks[0]!), id: 'C-2' });
  record.obligations[0]!.checkIds.push('C-2');
  record.defects[0]!.repairCriteriaCheckIds.push('C-2');
  const control = structuredClone(record.negativeControls[0]!);
  const captureBodies: Record<string, string> = { ...CAPTURES, ...CONTROL_CAPTURES };
  let clock = 11;
  function capture(id: string, body: string, at: string, owner = id): string {
    const file = `evidence/${owner}/capture.txt`;
    captureBodies[file] = body;
    record.evidence.push({ id, path: file, sha256: sha256(body), mediaType: 'text/plain', origin: 'execution', capturedAt: at });
    return id;
  }
  function execution(id: string, role: 'original' | 'minimized', sample: number, build: 'faulty' | 'partial' | 'fixed', at: string): CheckExecutionV3 {
    const checkId = role === 'original' ? 'C-1' : 'C-2';
    const result = symptom(kind, sample, role, build);
    const evidenceId = capture(`E-${id}`, JSON.stringify({ kind, seed: 17, sample, role, build, result }) + '\n', at, id);
    const fingerprint = structuredClone(record.checks.find(c => c.id === checkId)!.currentFingerprint);
    fingerprint.build = build;
    let readiness = record.readiness.find(r => r.targetFingerprint.build === build);
    if (!readiness) {
      readiness = { ...structuredClone(record.readiness[0]!), id: 'RD-' + (record.readiness.length + 1), targetFingerprint: structuredClone(fingerprint) };
      const eid = capture('E-' + readiness.id, 'source_identity:passed secrets_excluded:passed browser:passed\n', readiness.executedAt, readiness.id);
      readiness.probes = readiness.probes.map(p => ({ ...p, evidenceIds: [eid] }));
      record.readiness.push(readiness);
    }
    return { id, checkId, result, fingerprint, readinessId: readiness.id, invocation: `replay ${kind} ${role} seed=17`, tool: 'node:assert', host: 'fixture', executor: 'fixture', executedAt: at,
      assertions: [{ name: 'triggered workload retains its result', result, evidenceIds: [evidenceId] }], evidenceIds: [evidenceId],
      ...(result === 'failed' ? { failureCause: 'product' as const } : {}) };
  }
  function cloneControl(source: typeof control, id: string, checkId: string, build: string) {
    const copy = structuredClone(source);
    copy.id = id; copy.checkId = checkId; copy.mainFingerprint.build = build;
    copy.runs = copy.runs.map((run, i) => {
      const runId = id + '-run-' + i;
      const evidenceId = capture('E-' + runId, 'control ' + run.phase + ': ' + run.result + '\n', run.executedAt, runId);
      return { ...run, id: runId, evidenceIds: [evidenceId], assertions: run.assertions.map(a => ({ ...a, evidenceIds: [evidenceId] })),
        fingerprint: { ...run.fingerprint, build: run.phase === 'mutated' ? 'mutated-copy' : build } };
    });
    return copy;
  }
  record.negativeControls.push(cloneControl(control, 'NC-2', 'C-2', control.mainFingerprint.build));
  const observed = Array.from({ length: 6 }, (_, i) => execution(`OBS-${i+1}`, 'original', i+1, 'faulty', stamp(clock++)));
  record.executions.push(...observed);
  const scenarios: IntermittentScenario[] = (['original', 'minimized'] as const).map(role => ({ role, checkId: role === 'original' ? 'C-1' : 'C-2', sampleCount: 6,
    invocation: `replay ${kind} ${role} seed=17`, conditionsEvidenceId: capture(`CON-${role}`, `kind=${kind}; seed=17; samples=1..6; reset per sample; ${role} input retained; finite sample only\n`, stamp(clock++)) }));
  const plan: IntermittentRepair = { id: 'IP-1', rootFindingId: 'F-1', observedExecutionIds: observed.map(e => e.id), declaredAt: stamp(20),
    maxRuns: 24, maxDurationMs: 1000, scenarios };
  state.updatedAt = stamp(19);
  const beforePlan = structuredClone(state);
  record.intermittentRepairs = [plan]; state.updatedAt = stamp(20); clock = 21;
  function append(phase: 'baseline' | 'candidate', build: 'faulty' | 'partial' | 'fixed', limit = 6): void {
    for (const role of ['minimized', 'original'] as const) for (let sample = 1; sample <= limit; sample++) {
      const e = execution(`${phase}-${role}-${sample}`, role, sample, build, stamp(clock++));
      e.intermittent = { planId: plan.id, scenario: role, phase, sample, elapsedMs: 10 };
      record.executions.push(e);
      record.checks.find(c => c.id === e.checkId)!.currentFingerprint = structuredClone(e.fingerprint);
    }
    state.updatedAt = stamp(clock++);
  }
  function close(): void {
    const latest = (id: string) => record.executions.filter(e => e.checkId === id).at(-1)!;
    record.findings[0]!.status = 'resolved'; record.findings[0]!.resolutionExecutionId = latest('C-1').id;
    record.defects[0]!.status = 'verified'; record.defects[0]!.verifiedExecutionIds = ['C-1','C-2'].map(id => latest(id).id);
    for (const c of [...record.negativeControls]) {
      record.negativeControls.push({ ...cloneControl(c, 'NC-' + (record.negativeControls.length + 1), c.checkId, record.checks[0]!.currentFingerprint.build), supersedes: c.id });
    }
  }
  return { state, record, plan, beforePlan, append, close, captureBodies };
}
