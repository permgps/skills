// Optional intermittent-repair evidence. Counts come from immutable executions,
// never a reported aggregate; the helper validates records and runs no checks.
import { isDeepStrictEqual } from 'node:util';
import { isMoment, type CheckExecutionV3, type CheckResult, type IntermittentRepair,
  type RunState, type VerificationRecord, type VerificationRecordV3 } from './contract.mts';
import { sameFingerprint } from './fingerprint.mts';
import { createLogger } from '../shared/log.mts';

const log = createLogger('state');
type Problem = { field: string; message: string };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const integer = (v: unknown, min = 1): v is number => Number.isSafeInteger(v) && (v as number) >= min;
const unique = (values: unknown[]): boolean => new Set(values).size === values.length;
const roles = ['original', 'minimized'];
const phases = ['baseline', 'candidate'];

/** Validate unknown nested data before verdict derivation traverses it. */
export function validateIntermittentShape(raw: unknown): Problem[] {
  if (!object(raw)) return [];
  const problems: Problem[] = [];
  const add = (field: string, message: string): void => { problems.push({ field, message }); };
  const plans = raw['intermittentRepairs'];
  if (plans !== undefined) {
    if (raw['version'] !== 3 || !Array.isArray(plans)) add('verification.intermittentRepairs', 'optional plans require a verification-3 array');
    else for (const [i, plan] of plans.entries()) {
      const at = `verification.intermittentRepairs[${i}]`;
      if (!object(plan)) { add(at, 'plan must be an object'); continue; }
      for (const key of ['id', 'rootFindingId']) if (!text(plan[key])) add(at, `${key} must be nonempty`);
      if (!isMoment(plan['declaredAt'])) add(at, 'declaredAt must be a zoned timestamp');
      for (const key of ['maxRuns', 'maxDurationMs']) if (!integer(plan[key])) add(at, `${key} must be a positive safe integer`);
      if (plan['supersedes'] !== undefined && !text(plan['supersedes'])) add(at, 'supersedes must be nonempty');
      const observed = plan['observedExecutionIds'];
      if (!Array.isArray(observed) || observed.length < 2 || !observed.every(text) || !unique(observed)) add(at, 'observedExecutionIds needs distinct mixed-outcome executions');
      const scenarios = plan['scenarios'];
      if (!Array.isArray(scenarios) || scenarios.length !== 2) { add(at, 'exactly original and minimized scenarios are required'); continue; }
      for (const scenario of scenarios) {
        if (!object(scenario)) { add(at, 'scenario must be an object'); continue; }
        if ((!text(scenario['role']) || !roles.includes(scenario['role']))) add(at, 'unknown scenario role');
        for (const key of ['checkId', 'invocation', 'conditionsEvidenceId']) if (!text(scenario[key])) add(at, `${key} must be nonempty`);
        if (!integer(scenario['sampleCount'], 2)) add(at, 'sampleCount must be a safe integer >= 2');
      }
      if (scenarios.every(object) && (!unique(scenarios.map(s => s['role'])) || !unique(scenarios.map(s => s['checkId'])))) add(at, 'scenario roles and check IDs must be distinct');
    }
  }
  if (Array.isArray(raw['executions'])) for (const [i, execution] of raw['executions'].entries()) {
    if (!object(execution) || execution['intermittent'] === undefined) continue;
    const at = `verification.executions[${i}].intermittent`;
    const sample = execution['intermittent'];
    if (raw['version'] !== 3 || !object(sample)) { add(at, 'sample attribution requires a verification-3 object'); continue; }
    if (!text(sample['planId']) || !text(sample['scenario']) || !roles.includes(sample['scenario']) || !text(sample['phase']) || !phases.includes(sample['phase'])
      || !integer(sample['sample']) || !integer(sample['elapsedMs'], 0)) add(at, 'sample needs planId, original/minimized scenario, baseline/candidate phase, positive sample and nonnegative elapsedMs safe integers');
  }
  return problems;
}

const samples = (plan: IntermittentRepair, record: VerificationRecordV3): CheckExecutionV3[] =>
  record.executions.filter(e => e.intermittent?.planId === plan.id);
const series = (plan: IntermittentRepair, record: VerificationRecordV3, role: string, phase: string): CheckExecutionV3[] =>
  samples(plan, record).filter(e => e.intermittent!.scenario === role && e.intermittent!.phase === phase)
    .sort((a, b) => a.intermittent!.sample - b.intermittent!.sample);
const activePlans = (record: VerificationRecordV3): IntermittentRepair[] => {
  const plans = record.intermittentRepairs ?? [];
  const replaced = new Set(plans.map(p => p.supersedes));
  return plans.filter(p => !replaced.has(p.id));
};

/** Same workload/environment identity; build and source hashes may change for repair. */
function comparable(a: CheckExecutionV3, b: CheckExecutionV3): boolean {
  return (['reference', 'data', 'runtime', 'acceptanceInput'] as const).every(key =>
    a.fingerprint[key] === b.fingerprint[key])
    && a.invocation === b.invocation && a.viewport === b.viewport && a.locale === b.locale && a.authVariant === b.authVariant;
}
// A setup failure never reached the symptom oracle. Test defects can themselves
// be repaired, but both product and test failures need a captured failed assertion.
function symptomFailure(execution: CheckExecutionV3): boolean {
  return execution.result === 'failed' && ['product', 'test'].includes(execution.failureCause ?? '')
    && execution.assertions.some(assertion => assertion.name.trim().length > 0
      && assertion.result === 'failed' && assertion.evidenceIds.length > 0);
}

function observedSymptom(plan: IntermittentRepair, record: VerificationRecordV3): boolean {
  return record.executions.some(e => plan.observedExecutionIds.includes(e.id) && symptomFailure(e));
}

function baselineComplete(plan: IntermittentRepair, record: VerificationRecordV3, requireSymptomEvidence = true): boolean {
  return plan.scenarios.every(s => {
    const runs = series(plan, record, s.role, 'baseline');
    const failed = (e: CheckExecutionV3): boolean => requireSymptomEvidence ? symptomFailure(e) : e.result === 'failed';
    const failures = runs.filter(failed).length;
    const unusable = runs.filter(e => e.result !== 'passed' && !failed(e)).length;
    const complete = runs.length === s.sampleCount && unusable === 0 && failures > 0;
    log.debug('intermittent', '[FIX] baseline eligibility checked', {
      planId: plan.id, scenario: s.role, samples: runs.length, expected: s.sampleCount,
      requireSymptomEvidence, failures, unusable, complete,
    });
    return complete;
  });
}

export function intermittentPlanResult(plan: IntermittentRepair, record: VerificationRecordV3, current = true, requireSymptomEvidence = current): CheckResult {
  const all = samples(plan, record);
  if (all.length > plan.maxRuns || all.reduce((n, e) => n + e.intermittent!.elapsedMs, 0) > plan.maxDurationMs) return 'unavailable';
  // Historical snapshots keep their original structural rules; current results
  // and new publication transitions must establish an actual symptom failure.
  if (requireSymptomEvidence && !observedSymptom(plan, record)) return 'unavailable';
  if (!baselineComplete(plan, record, requireSymptomEvidence)) return 'unavailable';
  for (const s of plan.scenarios) {
    const runs = series(plan, record, s.role, 'candidate');
    const check = record.checks.find(c => c.id === s.checkId);
    if (current && runs.some(e => !check || !sameFingerprint(e.fingerprint, check.currentFingerprint)
      || e.fingerprint.acceptanceInput !== record.acceptanceInputDigest)) return 'stale';
    if (runs.some(e => e.result === 'failed')) return 'failed';
    // A later failure cannot disappear merely by omitting the series label and
    // following it with another green run of the same candidate.
    const first = runs[0];
    if (first && record.executions.some(e => e.checkId === s.checkId
      && e.fingerprint.build === first.fingerprint.build
      && Date.parse(e.executedAt) >= Date.parse(first.executedAt) && e.result === 'failed')) return 'failed';
  }
  return plan.scenarios.every(s => {
    const runs = series(plan, record, s.role, 'candidate');
    return runs.length === s.sampleCount && runs.every(e => e.result === 'passed');
  }) ? 'passed' : 'unavailable';
}

export function intermittentCheckResult(checkId: string, record: VerificationRecord, requireSymptomEvidence = true): CheckResult | undefined {
  if (record.version !== 3) return undefined;
  const plans = activePlans(record).filter(p => p.scenarios.some(s => s.checkId === checkId));
  if (!plans.length) return undefined;
  const results = plans.map(p => intermittentPlanResult(p, record, true, requireSymptomEvidence));
  return results.includes('failed') ? 'failed' : results.includes('stale') ? 'stale'
    : results.every(r => r === 'passed') ? 'passed' : 'unavailable';
}

function rootOf(id: string, record: VerificationRecordV3): string {
  const seen = new Set<string>();
  while (!seen.has(id)) {
    seen.add(id);
    const parent = record.findings.find(f => f.id === id)?.supersedes;
    if (!parent) break;
    id = parent;
  }
  return id;
}

/** At historical closure use only the plans and evidence that existed then. */
function closureProblems(record: VerificationRecordV3, root: string, at: string, current: boolean): boolean {
  const cutoff = Date.parse(at);
  const visible: VerificationRecordV3 = current ? record : { ...record,
    intermittentRepairs: (record.intermittentRepairs ?? []).filter(p => Date.parse(p.declaredAt) <= cutoff),
    executions: record.executions.filter(e => Date.parse(e.executedAt) <= cutoff) };
  return activePlans(visible).filter(p => p.rootFindingId === root).some(p => intermittentPlanResult(p, visible, current) !== 'passed');
}

/** Semantic checks leave partial and unavailable series publishable as evidence. */
export function validateIntermittentRecord(record: VerificationRecordV3): Problem[] {
  const errors: Problem[] = [];
  const add = (field: string, message: string): void => { errors.push({ field, message }); };
  const plans = record.intermittentRepairs ?? [];
  if (!unique(plans.map(p => p.id))) add('verification.intermittentRepairs', 'plan IDs must be unique');
  for (const plan of plans) {
    const at = `verification.intermittentRepairs[${plan.id}]`;
    const root = record.findings.find(f => f.id === plan.rootFindingId);
    if (!root || root.supersedes) add(at, 'plan must name a stable root finding');
    const prior = plans.find(p => p.id === plan.supersedes);
    if (plan.supersedes && (!prior || prior.rootFindingId !== plan.rootFindingId || Date.parse(prior.declaredAt) >= Date.parse(plan.declaredAt))) add(at, 'successor must follow an earlier plan under the same root');
    if (plans.filter(p => p.rootFindingId === plan.rootFindingId && p.supersedes === plan.supersedes).length > 1) add(at, 'one linear plan chain per root; do not fork reruns');
    if (plan.maxRuns !== 2 * plan.scenarios.reduce((n, s) => n + s.sampleCount, 0) || !Number.isSafeInteger(plan.maxRuns)) add(at, 'maxRuns must equal the four planned series');
    let elapsed = 0;
    for (const run of samples(plan, record).sort((a, b) => Date.parse(a.executedAt) - Date.parse(b.executedAt))) {
      if (elapsed >= plan.maxDurationMs) add(at, 'a sample starts after the time budget was exhausted');
      elapsed += run.intermittent!.elapsedMs;
    }
    const original = plan.scenarios.find(s => s.role === 'original')!;
    if (!root?.checkIds.includes(original.checkId)) add(at, 'original scenario must exercise a root finding check');
    const observed = plan.observedExecutionIds.map(id => record.executions.find(e => e.id === id));
    if (observed.some(e => !e || e.checkId !== original.checkId || Date.parse(e.executedAt) >= Date.parse(plan.declaredAt))
      || !observed.some(e => e?.result === 'failed') || !observed.some(e => e?.result === 'passed')
      || observed.some(e => e && observed[0] && (!sameFingerprint(e.fingerprint, observed[0].fingerprint) || !comparable(e, observed[0])))) add(at, 'trigger needs earlier mixed outcomes of the original check under the same fingerprint and conditions');
    if (observed[0]?.invocation !== original.invocation) add(at, 'the original invocation must preserve the observed trigger');
    for (const scenario of plan.scenarios) {
      const check = record.checks.find(c => c.id === scenario.checkId);
      const conditions = record.evidence.find(e => e.id === scenario.conditionsEvidenceId);
      if (!check?.required || !root?.obligationIds.some(id => check.obligationIds.includes(id))) add(at, 'both scenarios must be required checks covering the finding');
      if (!conditions || Date.parse(conditions.capturedAt) > Date.parse(plan.declaredAt)) add(at, 'conditions capture must exist before declaration');
      const baseline = series(plan, record, scenario.role, 'baseline');
      for (const phase of phases) {
        const runs = series(plan, record, scenario.role, phase);
        if (runs.length > scenario.sampleCount || runs.some((e, i) => e.intermittent!.sample !== i + 1)) add(at, 'sample ordinals must be consecutive and within the planned count');
        if (runs.some((e, i) => i > 0 && Date.parse(e.executedAt) <= Date.parse(runs[i - 1]!.executedAt))) add(at, 'sample timestamps must follow ordinal order');
        for (const e of runs) {
          if (e.checkId !== scenario.checkId || e.invocation !== scenario.invocation || Date.parse(e.executedAt) <= Date.parse(plan.declaredAt)
            || e.evidenceIds.length === 0) add(at, 'sample must match its check/invocation, follow declaration and retain captures');
          if (runs[0] && (!sameFingerprint(e.fingerprint, runs[0].fingerprint) || !comparable(e, runs[0]))) add(at, 'one series uses one fingerprint and conditions');
          if (phase === 'candidate' && baseline[0] && !comparable(e, baseline[0])) add(at, 'candidate must replay comparable baseline conditions');
          if (phase === 'baseline' && observed[0] && e.fingerprint.build !== observed[0].fingerprint.build) add(at, 'both baselines must retain the observed triggering build');
          if (phase === 'baseline' && scenario.role === 'original' && observed[0]
            && (!sameFingerprint(e.fingerprint, observed[0].fingerprint) || !comparable(e, observed[0]))) add(at, 'original baseline must retain the observed triggering build and conditions');
          if (phase === 'candidate' && (!baselineComplete(plan, record, false) || samples(plan, record).some(b => b.intermittent!.phase === 'baseline' && Date.parse(b.executedAt) >= Date.parse(e.executedAt)))) add(at, 'both complete failing baselines must precede candidate samples');
          if (phase === 'candidate' && plans.some(p => p.rootFindingId === plan.rootFindingId && Date.parse(p.declaredAt) < Date.parse(plan.declaredAt)
            && samples(p, record).some(old => old.intermittent!.phase === 'candidate' && old.fingerprint.build === e.fingerprint.build))) add(at, 'a successor cannot resample the same candidate build to obtain a lucky pass');
        }
      }
    }
  }
  for (const e of record.executions) if (e.intermittent && !plans.some(p => p.id === e.intermittent!.planId)) add(`verification.executions[${e.id}]`, 'sample names an unknown intermittent plan');
  for (const finding of record.findings) if (finding.status === 'resolved') {
    const run = record.executions.find(e => e.id === finding.resolutionExecutionId);
    if (run && closureProblems(record, rootOf(finding.id, record), run.executedAt, false)) add(`verification.findings[${finding.id}]`, 'intermittent resolution requires both complete passing series at closure');
  }
  for (const defect of record.defects) if (defect.status === 'verified') {
    const runs = record.executions.filter(e => defect.verifiedExecutionIds.includes(e.id));
    const latest = runs.sort((a, b) => Date.parse(b.executedAt) - Date.parse(a.executedAt))[0];
    if (latest && closureProblems(record, defect.rootFindingId, latest.executedAt, false)) add(`verification.defects[${defect.id}]`, 'intermittent verification requires both complete passing series at closure');
  }
  log.debug('intermittent', 'validated repeated-run evidence', { plans: plans.length, violations: errors.length });
  return errors;
}

/** Publication order proves predeclaration; timestamps alone cannot do so. */
export function validateIntermittentTransition(previous: RunState, next: RunState): Problem[] {
  const current = next.verification;
  if (current?.version !== 3) return [];
  const prior = previous.verification;
  const oldPlans = prior?.version === 3 ? prior.intermittentRepairs ?? [] : [];
  const plans = current.intermittentRepairs ?? [];
  const errors: Problem[] = [];
  const add = (field: string, message: string): void => { errors.push({ field, message }); };
  for (const old of oldPlans) if (!isDeepStrictEqual(old, plans.find(p => p.id === old.id))) add(`verification.intermittentRepairs[${old.id}]`, 'published plan is immutable; append a successor');
  for (const plan of plans.filter(p => !oldPlans.some(old => old.id === p.id))) {
    if (!observedSymptom(plan, current)) add(`verification.intermittentRepairs[${plan.id}]`, '[FIX] observed trigger needs a captured failed symptom assertion with product or test cause');
    if (Date.parse(plan.declaredAt) < Date.parse(previous.updatedAt ?? previous.startedAt ?? "") || Date.parse(plan.declaredAt) > Date.parse(next.updatedAt ?? next.startedAt ?? "")) add(`verification.intermittentRepairs[${plan.id}]`, 'declare a plan at this publication, never backdate it');
    if (plan.observedExecutionIds.some(id => !prior?.executions.some(e => e.id === id))
      || plan.scenarios.some(s => !prior?.evidence.some(e => e.id === s.conditionsEvidenceId))) add(`verification.intermittentRepairs[${plan.id}]`, 'publish observed executions and conditions before the plan');
  }
  for (const e of current.executions.filter(e => e.intermittent && !prior?.executions.some(old => old.id === e.id))) {
    const plan = oldPlans.find(p => p.id === e.intermittent!.planId);
    const at = `verification.executions[${e.id}].intermittent`;
    if (!plan) { add(at, 'publish the plan in a prior write before any samples'); continue; }
    if (prior?.version !== 3) continue;
    if (!activePlans(prior).some(p => p.id === plan.id)) add(at, 'do not append samples to a superseded plan');
    const before = samples(plan, prior);
    if (before.reduce((n, run) => n + run.intermittent!.elapsedMs, 0) >= plan.maxDurationMs) add(at, 'time budget exhausted; retain incomplete evidence and stop');
    if (e.intermittent!.phase === 'candidate' && (!observedSymptom(plan, prior) || !baselineComplete(plan, prior))) add(at, '[FIX] publish complete baseline series with captured symptom failures before candidate samples');
  }
  for (const finding of current.findings) if (finding.status === 'resolved' && prior?.findings.find(f => f.id === finding.id)?.status !== 'resolved') {
    if (closureProblems(current, rootOf(finding.id, current), next.updatedAt ?? next.startedAt ?? "", true)) add(`verification.findings[${finding.id}]`, 'new intermittent closure needs qualifying symptom evidence and every sample on the current candidate');
    for (const plan of activePlans(current).filter(p => p.rootFindingId === rootOf(finding.id, current))) {
      const resolution = current.executions.find(e => e.id === finding.resolutionExecutionId);
      const last = Math.max(...samples(plan, current).map(e => Date.parse(e.executedAt)));
      if (resolution?.intermittent?.planId !== plan.id || resolution.intermittent.phase !== 'candidate'
        || Date.parse(resolution.executedAt) < last) add(`verification.findings[${finding.id}]`, 'resolve with the final candidate sample after both series, not a prior green');
    }
  }
  for (const defect of current.defects) if (defect.status === 'verified' && (prior?.version !== 3 || prior.defects.find(d => d.id === defect.id)?.status !== 'verified')) {
    if (closureProblems(current, defect.rootFindingId, next.updatedAt ?? next.startedAt ?? "", true)) add(`verification.defects[${defect.id}]`, 'new intermittent closure needs qualifying symptom evidence and every sample on the current candidate');
  }
  for (const error of errors) log.error('intermittent', error.message, { field: error.field });
  return errors;
}

/** A new run has no prior publication that could establish a repeated-run plan. */
export function validateInitialIntermittent(state: RunState): Problem[] {
  return state.verification?.version === 3 && ((state.verification.intermittentRepairs?.length ?? 0) > 0
    || state.verification.executions.some(e => e.intermittent))
    ? [{ field: 'verification.intermittentRepairs', message: 'publish initial observations first; a new run cannot import predeclared intermittent plans or samples' }] : [];
}
