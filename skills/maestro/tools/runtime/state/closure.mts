// Verification-3 closure records: readiness, defects, strategy reviews and
// evidence attribution, for a contract-6 state.
//
// Kept apart from verification.mts so the contract-4 and contract-5 rules read
// exactly as they were published. This module depends on verification.mts and
// never the reverse. Every rule here exists because a real run did the opposite:
// it ran thousands of tests behind a bootstrap its own isolation broke, repaired
// five causes under one root, scheduled eight bounded repairs that closed no
// task, and asked for a bigger limit instead of a different method.
//
// A repeated repair's diagnosis is read here too. The diagnostician used to
// propose "one grounded next approach", and nothing asked it what else could
// explain the failure, so a repeat could rest on the one cause it thought of
// first. Its `diagnosis` text now names three to five ranked hypotheses, each
// with what falsifies it, the probe, the reproduction and a seam or
// `noCorrectSeam:` — inside the existing string, so the contract does not
// move. Only that shape is held. Whether the probe is the cheapest, the
// reproduction minimal, one variable changed, a baseline measured, or a
// `noCorrectSeam` reason true is the diagnostician's and the executor's
// judgement, and no rule here can see it.

import { isDeepStrictEqual } from 'node:util';

import { createLogger } from '../shared/log.mts';
import {
  DEFECT_CAUSES, DEFECT_STATUSES, EXPECTED_PROGRESS, FAILURE_CAUSES, READINESS_PROBE_KINDS,
  READINESS_PROBE_RESULTS, REPEAT_KINDS, SAME_CAUSE_REPEAT_KINDS, STRATEGY_DECISIONS, STRATEGY_TRIGGERS,
  isMoment,
} from './contract.mts';
import type {
  CheckExecutionV3, Defect, ReadinessProbeKind, ReadinessRecord, RepairAttemptV2, RepairAttemptV3,
  RepairLimits, RunState, TaskEntry, VerificationRecordV3,
} from './contract.mts';
import {
  activeControls, controlResult, deriveVerification, effectiveExecution, validateFingerprint,
  validateInputHashes, validateVerificationTransition, type VerificationViolation,
} from './verification.mts';

const log = createLogger('state');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
/** The instant of a stamp `isMoment` already accepted; only ordering reads it. */
const moment = (value: string): number => Date.parse(value);

/** A blocker is finished when what its dependents build on exists and was not found wrong. */
const FINISHED: readonly string[] = ['review', 'done'];
const ANSWER_FIELDS = ['contractConsistent', 'dependenciesReady', 'environmentEvaluable',
  'detectorDistinguishes', 'rootCauseTargeted', 'taskClosable', 'nextChange'] as const;

export const isV3Attempt = (attempt: RepairAttemptV2 | RepairAttemptV3): attempt is RepairAttemptV3 =>
  'defectId' in attempt;

/** How many ranked hypotheses a repeated repair's diagnosis names. */
export const DIAGNOSIS_HYPOTHESES = { min: 3, max: 5 } as const;

/** A repeated repair's `diagnosis` text, read by its labels. */
export interface DiagnosisReading {
  hypotheses: { rank: number; cause: string; falsifiedBy: string }[];
  probe?: string;
  reproduction?: string;
  seam?: string;
  noCorrectSeam?: string;
  /** What the text lacks, each sentence saying what to send back for. */
  problems: string[];
}

const HYPOTHESIS_LINE = /^H(\d+)\s*:\s*(.*)$/;
const FALSIFIED_BY = /falsified by\s*:/i;
const LABELLED = {
  probe: /^Probe\s*:\s*(.*)$/, reproduction: /^Reproduction\s*:\s*(.*)$/,
  seam: /^Seam\s*:\s*(.*)$/, noCorrectSeam: /^noCorrectSeam\s*:\s*(.*)$/,
} as const;

/**
 * Reads the labelled lines of a diagnosis: `H<n>:` hypotheses with their
 * `falsified by:`, and one each of `Probe:`, `Reproduction:` and `Seam:` or
 * `noCorrectSeam:`. Any other line is free prose and is ignored. A label with
 * nothing after it counts as absent. Only the shape is read here; the attempt's
 * own `hypothesis` is matched by the caller, which holds the attempt.
 */
export function readDiagnosis(text: string): DiagnosisReading {
  const reading: DiagnosisReading = { hypotheses: [], problems: [] };
  const found: Record<keyof typeof LABELLED, string[]> = { probe: [], reproduction: [], seam: [], noCorrectSeam: [] };
  const problem = (message: string): void => { reading.problems.push(message); };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const hypothesis = HYPOTHESIS_LINE.exec(line);
    if (hypothesis) {
      const body = hypothesis[2]!;
      const split = FALSIFIED_BY.exec(body);
      const cause = (split ? body.slice(0, split.index) : body).trim().replace(/[\s—–\-|;,]+$/, '').trim();
      const falsifiedBy = split ? body.slice(split.index + split[0].length).trim() : '';
      reading.hypotheses.push({ rank: Number(hypothesis[1]), cause, falsifiedBy });
      continue;
    }
    for (const [label, pattern] of Object.entries(LABELLED) as [keyof typeof LABELLED, RegExp][]) {
      const value = pattern.exec(line)?.[1]?.trim();
      if (value) found[label].push(value);
    }
  }

  const count = reading.hypotheses.length;
  if (count < DIAGNOSIS_HYPOTHESES.min || count > DIAGNOSIS_HYPOTHESES.max) {
    problem(`a repeat repair's diagnosis names ${count} ${count === 1 ? 'hypothesis' : 'hypotheses'}; send it back to the diagnostician for three to five ranked hypotheses, each with the observation that falsifies it`);
  }
  const ranks = reading.hypotheses.map(item => item.rank);
  if (ranks.some((rank, index) => rank !== index + 1)) {
    problem(`a repeat repair's hypotheses are numbered ${ranks.map(rank => `H${rank}`).join(', ')}; rank them H1 to H${count} in order, most likely first`);
  }
  const seen = new Map<string, number>();
  for (const item of reading.hypotheses) {
    if (!item.cause) problem(`hypothesis H${item.rank} names no cause; send it back for the cause each line ranks`);
    if (!item.falsifiedBy) problem(`hypothesis H${item.rank} names no observation that falsifies it; send it back for a "falsified by:" on every hypothesis`);
    const key = item.cause.toLowerCase();
    const earlier = seen.get(key);
    if (item.cause && earlier !== undefined) problem(`hypotheses H${earlier} and H${item.rank} name the same cause; send it back for distinct causes`);
    else seen.set(key, item.rank);
  }
  const single = (label: 'probe' | 'reproduction', missing: string): string | undefined => {
    const values = found[label];
    if (values.length === 0) problem(`a repeat repair's diagnosis names no ${label}; send it back for ${missing}`);
    else if (values.length > 1) problem(`a repeat repair's diagnosis names ${values.length} ${label} lines; send it back for exactly one`);
    return values.length === 1 ? values[0] : undefined;
  };
  const probe = single('probe', 'the cheapest probe that tells the hypotheses apart');
  if (probe !== undefined) reading.probe = probe;
  const reproduction = single('reproduction', 'the reproduction, minimised until every element in it is needed');
  if (reproduction !== undefined) reading.reproduction = reproduction;
  const [seam, noCorrectSeam] = [found.seam, found.noCorrectSeam];
  if (seam.length + noCorrectSeam.length === 0) problem('a repeat repair\'s diagnosis names no seam; send it back for where the regression check sits, or noCorrectSeam: with why none exists');
  else if (seam.length > 0 && noCorrectSeam.length > 0) problem('a repeat repair\'s diagnosis names both a Seam: and a noCorrectSeam:; send it back for one of the two');
  else if (seam.length + noCorrectSeam.length > 1) problem(`a repeat repair's diagnosis names ${seam.length + noCorrectSeam.length} seam lines; send it back for exactly one`);
  else if (seam[0] !== undefined) reading.seam = seam[0];
  else if (noCorrectSeam[0] !== undefined) reading.noCorrectSeam = noCorrectSeam[0];
  return reading;
}

/** Shape of the verification-3 additions, checked before any typed traversal. */
function validateClosureShape(value: Record<string, unknown>): VerificationViolation[] {
  const errors: VerificationViolation[] = [];
  const add = (field: string, message: string): void => { errors.push({ field, message }); };
  const text = (field: string, raw: unknown): void => {
    if (typeof raw !== 'string' || raw.trim() === '') add(field, 'nonempty string is required');
  };
  const optionalText = (field: string, raw: unknown): void => {
    if (raw !== undefined && (typeof raw !== 'string' || raw.trim() === '')) add(field, 'optional field must be a nonempty string');
  };
  const strings = (field: string, raw: unknown): void => {
    if (!Array.isArray(raw) || raw.some(item => typeof item !== 'string' || item === '')) add(field, 'string array is required');
  };
  const rows = (name: string): Array<Record<string, unknown>> => {
    const raw = value[name];
    if (!Array.isArray(raw)) { add(`verification.${name}`, 'collection must be an array'); return []; }
    return raw.flatMap((row, index) => {
      if (isRecord(row)) return [row];
      add(`verification.${name}[${index}]`, 'entry must be an object');
      return [];
    });
  };
  strings('verification.inheritedExecutionIds', value['inheritedExecutionIds']);
  strings('verification.inheritedAttemptIds', value['inheritedAttemptIds']);
  rows('readiness').forEach((row, index) => {
    const at = `verification.readiness[${index}]`;
    text(`${at}.id`, row['id']);
    text(`${at}.executedAt`, row['executedAt']);
    optionalText(`${at}.supersedes`, row['supersedes']);
    validateFingerprint(row['targetFingerprint'], `${at}.targetFingerprint`, add);
    if (!Array.isArray(row['probes'])) { add(`${at}.probes`, 'probes must be an array'); return; }
    row['probes'].forEach((probe, position) => {
      const field = `${at}.probes[${position}]`;
      if (!isRecord(probe)) { add(field, 'probe must be an object'); return; }
      text(`${field}.kind`, probe['kind']);
      text(`${field}.result`, probe['result']);
      strings(`${field}.evidenceIds`, probe['evidenceIds']);
      optionalText(`${field}.limitation`, probe['limitation']);
    });
  });
  rows('defects').forEach((row, index) => {
    const at = `verification.defects[${index}]`;
    for (const name of ['id', 'parentTaskId', 'rootFindingId', 'causeClass', 'counterexample', 'status']) text(`${at}.${name}`, row[name]);
    for (const name of ['findingIds', 'repairCriteriaCheckIds', 'residualParentCriteria', 'verifiedExecutionIds']) strings(`${at}.${name}`, row[name]);
    optionalText(`${at}.supersedes`, row['supersedes']);
  });
  rows('strategyReviews').forEach((row, index) => {
    const at = `verification.strategyReviews[${index}]`;
    for (const name of ['id', 'at', 'trigger', 'decision', 'nextApproach', 'dispatchId', 'returnId']) text(`${at}.${name}`, row[name]);
    for (const name of ['attemptIds', 'closedTaskIds']) strings(`${at}.${name}`, row[name]);
    const answers = row['answers'];
    if (!isRecord(answers)) add(`${at}.answers`, 'the seven answers are required');
    else for (const name of ANSWER_FIELDS) text(`${at}.answers.${name}`, answers[name]);
  });
  const inherited = new Set(Array.isArray(value['inheritedAttemptIds']) ? value['inheritedAttemptIds'] : []);
  rows('repairAttempts').forEach((row, index) => {
    if (inherited.has(row['id'])) return;
    const at = `verification.repairAttempts[${index}]`;
    for (const name of ['defectId', 'repeatKind', 'expectedProgress']) text(`${at}.${name}`, row[name]);
    for (const name of ['readyUpstreamTaskIds', 'blockingPrerequisites', 'unlocksTaskIds']) strings(`${at}.${name}`, row[name]);
    optionalText(`${at}.commit`, row['commit']);
  });
  rows('checks').forEach((row, index) => {
    if (row['readinessProbes'] !== undefined) strings(`verification.checks[${index}].readinessProbes`, row['readinessProbes']);
  });
  rows('executions').forEach((row, index) => {
    optionalText(`verification.executions[${index}].readinessId`, row['readinessId']);
    optionalText(`verification.executions[${index}].failureCause`, row['failureCause']);
  });
  rows('decisions').forEach((row, index) => {
    const at = `verification.decisions[${index}]`;
    optionalText(`${at}.strategyReviewId`, row['strategyReviewId']);
    optionalText(`${at}.forecast`, row['forecast']);
    for (const name of ['previousLimits', 'limits']) {
      const limits = row[name];
      if (limits === undefined) continue;
      if (!isRecord(limits) || !Number.isInteger(limits['perFinding']) || !Number.isInteger(limits['total'])) {
        add(`${at}.${name}`, 'limits need integer perFinding and total');
      }
    }
  });
  return errors;
}

/** Readiness the execution was measured against, or why there is none to trust. */
function readinessViolations(
  execution: CheckExecutionV3,
  probes: ReadinessProbeKind[],
  readiness: ReadinessRecord | undefined,
): string[] {
  if (!execution.readinessId) return ['execution needs the readiness record it ran against'];
  if (!readiness) return [`unknown readiness record ${execution.readinessId}`];
  const problems: string[] = [];
  if (readiness.targetFingerprint.build !== execution.fingerprint.build
    || readiness.targetFingerprint.runtime !== execution.fingerprint.runtime) {
    problems.push('execution build and runtime must be the ones its readiness record probed; a label copied from history is not a probe');
  }
  const required = [...new Set<ReadinessProbeKind>(['source_identity', ...probes])];
  for (const kind of required) {
    const probe = readiness.probes.find(item => item.kind === kind);
    if (!probe || probe.result === 'not_applicable') {
      problems.push(`required readiness probe ${kind} was not established; probe it before this run`);
    } else if (probe.result === 'setup_failed') {
      problems.push(`readiness probe ${kind} failed setup; correct the verification setup and supersede ${readiness.id} instead of publishing this run`);
    } else if (probe.result === 'unavailable'
      && (execution.result !== 'unavailable' || execution.failureCause !== 'unavailable_capability')) {
      problems.push(`readiness probe ${kind} is unavailable; record this execution unavailable with cause unavailable_capability`);
    }
  }
  return problems;
}

/** Validate the verification-3 graph of a contract-6 or contract-7 snapshot. */
export function validateClosureRecord(state: RunState): VerificationViolation[] {
  const raw = state.verification;
  if (state.contractVersion < 6 || !isRecord(raw) || raw['version'] !== 3) return [];
  const shape = validateClosureShape(raw);
  if (shape.length > 0) {
    for (const item of shape) log.error('closure', item.message, { field: item.field });
    return shape;
  }
  const record = raw as unknown as VerificationRecordV3;
  const errors: VerificationViolation[] = [];
  const add = (field: string, message: string, context: Record<string, unknown> = {}): void => {
    errors.push({ field, message });
    log.error('closure', message, { field, ...context });
  };
  const tasks = new Map(state.tasks.map(task => [task.id, task]));
  const checks = new Map(record.checks.map(check => [check.id, check]));
  const executions = new Map(record.executions.map(execution => [execution.id, execution]));
  const findings = new Map(record.findings.map(finding => [finding.id, finding]));
  const defects = new Map(record.defects.map(defect => [defect.id, defect]));
  const readiness = new Map(record.readiness.map(item => [item.id, item]));
  const reviews = new Map(record.strategyReviews.map(item => [item.id, item]));
  const evidence = new Map(record.evidence.map(item => [item.id, item]));
  const inheritedExecutions = new Set(record.inheritedExecutionIds);
  const inheritedAttempts = new Set(record.inheritedAttemptIds);
  const ids = (field: string, entries: Array<{ id: string }>, prefix: string): void => {
    if (new Set(entries.map(item => item.id)).size !== entries.length) add(field, 'IDs must be unique');
    for (const item of entries) if (!new RegExp(`^${prefix}-[1-9][0-9]*$`).test(item.id)) add(field, `IDs must use ${prefix}-N`);
  };
  ids('verification.readiness', record.readiness, 'RD');
  ids('verification.defects', record.defects, 'DF');
  ids('verification.strategyReviews', record.strategyReviews, 'SR');
  for (const id of record.inheritedExecutionIds) if (!executions.has(id)) add('verification.inheritedExecutionIds', `unknown execution ${id}`);
  for (const id of record.inheritedAttemptIds) if (!record.repairAttempts.some(item => item.id === id)) add('verification.inheritedAttemptIds', `unknown attempt ${id}`);

  // --- readiness ---------------------------------------------------------------
  for (const item of record.readiness) {
    const at = `verification.readiness[${item.id}]`;
    if (!isMoment(item.executedAt)) add(`${at}.executedAt`, 'readiness needs the moment it was probed, an ISO 8601 moment with Z or a ±hh:mm offset');
    validateInputHashes(item.targetFingerprint, `${at}.targetFingerprint`, add);
    if (item.probes.length === 0) add(at, 'readiness needs at least one probe');
    if (new Set(item.probes.map(probe => probe.kind)).size !== item.probes.length) add(at, 'each probe kind appears once per record');
    for (const probe of item.probes) {
      if (!READINESS_PROBE_KINDS.includes(probe.kind)) add(at, `unknown probe kind ${probe.kind}`);
      if (!READINESS_PROBE_RESULTS.includes(probe.result)) add(at, `unknown probe result ${probe.result}`);
      if ((probe.result === 'setup_failed' || probe.result === 'unavailable') && !probe.limitation?.trim()) {
        add(at, `probe ${probe.kind} is ${probe.result} and needs a limitation saying what was tried`);
      }
      if (probe.result === 'passed' && probe.evidenceIds.length === 0) add(at, `passed probe ${probe.kind} needs captured evidence`);
      for (const id of probe.evidenceIds) {
        const capture = evidence.get(id);
        if (!capture || capture.origin !== 'execution' || !capture.path.startsWith(`evidence/${item.id}/`)) {
          add(at, `probe evidence ${id} must be an execution capture under evidence/${item.id}/`);
        }
      }
    }
    if (item.supersedes) {
      if (!readiness.has(item.supersedes) || item.supersedes === item.id) add(at, `unknown superseded readiness ${item.supersedes}`);
      if (record.readiness.filter(other => other.supersedes === item.supersedes).length > 1) add(at, 'readiness supersession must not fork');
    }
  }

  // --- executions: readiness, failure cause and attribution --------------------
  const successors = new Map<string, number>();
  for (const execution of record.executions) {
    if (execution.supersedes && !inheritedExecutions.has(execution.id)) {
      successors.set(execution.supersedes, (successors.get(execution.supersedes) ?? 0) + 1);
    }
  }
  for (const execution of record.executions) {
    if (inheritedExecutions.has(execution.id)) continue;
    const at = `verification.executions[${execution.id}]`;
    const check = checks.get(execution.checkId);
    if (execution.failureCause !== undefined && !FAILURE_CAUSES.includes(execution.failureCause)) add(at, 'unknown failure cause');
    if (execution.result === 'passed' && execution.failureCause) add(at, 'a passed execution carries no failure cause');
    if (execution.result === 'failed' && !['product', 'test', 'setup'].includes(execution.failureCause ?? '')) {
      add(at, 'a failed execution names its cause: product, test or setup');
    }
    if (execution.result === 'unavailable' && !['unavailable_capability', 'setup'].includes(execution.failureCause ?? '')) {
      add(at, 'an unavailable execution names its cause: unavailable_capability or setup');
    }
    const probes = readinessViolations(execution, check?.readinessProbes ?? [],
      execution.readinessId ? readiness.get(execution.readinessId) : undefined);
    for (const message of probes) add(at, message, { executionId: execution.id, readinessId: execution.readinessId ?? null });
    if (probes.length === 0) log.debug('closure', 'readiness matches execution', { executionId: execution.id, readinessId: execution.readinessId });
    if (check && tasks.has(execution.executor) && execution.executor !== check.executionTaskId) {
      add(at, `execution by task ${execution.executor} is attributed to check ${check.id}, which task ${check.executionTaskId ?? '(none)'} owns`,
        { executionId: execution.id, executor: execution.executor, owner: check.executionTaskId ?? null });
    }
    if (execution.supersedes && (successors.get(execution.supersedes) ?? 0) > 1) {
      add(at, `execution ${execution.supersedes} has more than one successor; correct attribution with one superseding record`);
    }
  }

  // --- defects -------------------------------------------------------------------
  const rootOf = (id: string): string => {
    const seen = new Set<string>();
    let current = id;
    while (findings.get(current)?.supersedes && !seen.has(current)) {
      seen.add(current);
      current = findings.get(current)!.supersedes!;
    }
    return current;
  };
  for (const defect of record.defects) {
    const at = `verification.defects[${defect.id}]`;
    if (!tasks.has(defect.parentTaskId)) add(at, `unknown parent task ${defect.parentTaskId}`);
    const root = findings.get(defect.rootFindingId);
    if (!root || root.supersedes) add(at, 'a defect belongs to a stable root finding');
    if (defect.findingIds.length === 0 || defect.findingIds.some(id => !findings.has(id) || rootOf(id) !== defect.rootFindingId)) {
      add(at, 'defect findings must exist and resolve to its root finding');
    }
    if (!DEFECT_CAUSES.includes(defect.causeClass)) add(at, 'unknown defect cause');
    if (!DEFECT_STATUSES.includes(defect.status)) add(at, 'unknown defect status');
    if (defect.repairCriteriaCheckIds.length === 0 || defect.repairCriteriaCheckIds.some(id => !checks.has(id))) {
      add(at, 'a defect needs existing repair-criteria checks');
    }
    for (const id of defect.verifiedExecutionIds) if (!executions.has(id)) add(at, `unknown verifying execution ${id}`);
    if (defect.status !== 'verified' && defect.verifiedExecutionIds.length > 0) add(at, 'only a verified defect names verifying executions');
    if (defect.status === 'verified') {
      const verifying = defect.verifiedExecutionIds.map(id => executions.get(id));
      if (verifying.length === 0 || verifying.some(item => !item || item.result !== 'passed'
        || !defect.repairCriteriaCheckIds.includes(item.checkId))
        || defect.repairCriteriaCheckIds.some(id => !verifying.some(item => item?.checkId === id))) {
        add(at, 'a verified defect needs a passed execution of every repair-criteria check');
      }
      for (const checkId of defect.repairCriteriaCheckIds) {
        if (!record.negativeControls.some(control => control.checkId === checkId && control.result === 'passed')) {
          add(at, `repair-criteria check ${checkId} needs a passed negative control before it can verify a defect`);
        }
      }
    }
    if (defect.supersedes) {
      const prior = defects.get(defect.supersedes);
      if (!prior || prior.id === defect.id || prior.rootFindingId !== defect.rootFindingId) {
        add(at, 'a split defect supersedes one under the same root, so the root keeps its count');
      } else if (prior.status !== 'superseded') add(at, `superseded defect ${prior.id} must be marked superseded`);
    }
    if (defect.status === 'superseded' && !record.defects.some(other => other.supersedes === defect.id)) {
      add(at, 'a superseded defect needs the defects that replace it');
    }
  }
  for (const task of state.tasks) {
    const open = record.defects.filter(defect => defect.parentTaskId === task.id && defect.status === 'open');
    if (task.status === 'done' && open.length > 0) {
      add(`tasks[${task.id}].status`, `task ${task.id} is done with open defects ${open.map(item => item.id).join(', ')}; it closes only through review once they are verified`);
    }
  }

  // --- attempts --------------------------------------------------------------------
  const v3Attempts = record.repairAttempts.filter(item => !inheritedAttempts.has(item.id));
  for (const attempt of v3Attempts) {
    const at = `verification.repairAttempts[${attempt.id}]`;
    if (!isV3Attempt(attempt)) { add(at, 'a contract-6 attempt names its defect'); continue; }
    const fail = (rule: string, message: string): void => add(at, message, { attemptId: attempt.id, rule });
    const defect = defects.get(attempt.defectId);
    if (!defect) fail('defect', `unknown defect ${attempt.defectId}`);
    else {
      if (defect.rootFindingId !== attempt.rootFindingId) fail('defect-root', 'attempt and defect must share the stable root');
      if (defect.parentTaskId !== attempt.taskId) fail('defect-task', 'attempt repairs a defect of its own task');
      if (defect.causeClass === 'environment') fail('environment', 'an environment defect is corrected at readiness, never with a repair attempt');
      if (attempt.outcome === 'defect_verified' && defect.status !== 'verified') fail('verified', 'defect_verified needs the defect verified');
      if (attempt.expectedProgress === 'task_closure'
        && (defect.residualParentCriteria.length > 0 || attempt.blockingPrerequisites.length > 0)) {
        fail('forecast', 'a forecast cannot promise task closure while residual criteria or prerequisites remain');
      }
    }
    if (!REPEAT_KINDS.includes(attempt.repeatKind)) fail('repeat', 'unknown repeat kind');
    if (!EXPECTED_PROGRESS.includes(attempt.expectedProgress)) fail('progress', 'unknown expected progress');
    if ((attempt.repeatKind === 'first') !== (attempt.predecessorId === undefined)) {
      fail('repeat', 'repeatKind is first exactly when the attempt has no predecessor');
    }
    if (attempt.predecessorId !== undefined) {
      const reading = readDiagnosis(attempt.diagnosis);
      log.debug('diagnosis', 'diagnosis read', { attemptId: attempt.id, hypotheses: reading.hypotheses.length,
        probe: reading.probe !== undefined, reproduction: reading.reproduction !== undefined,
        seam: reading.seam !== undefined ? 'seam' : reading.noCorrectSeam !== undefined ? 'noCorrectSeam' : 'missing',
        problems: reading.problems.length });
      for (const problem of reading.problems) fail('diagnosis', problem);
      if (!reading.hypotheses.some(item => item.cause === attempt.hypothesis.trim())) {
        fail('diagnosis', 'the attempt\'s hypothesis is not one of its diagnosis\'s H causes; name as hypothesis the cause the probe left standing, exactly as its H line writes it');
      }
    }
    if (attempt.outcome === 'defect_verified' && !attempt.commit) fail('commit', 'a verified repair names the commit that made it');
    if (attempt.commit && !tasks.get(attempt.taskId)?.commits?.includes(attempt.commit)) {
      fail('commit', `repair commit ${attempt.commit} is missing from task ${attempt.taskId} commits; review would not see it`);
    }
    if (attempt.outcome === 'prerequisite_blocked' && attempt.blockingPrerequisites.length === 0) {
      fail('prerequisite', 'a blocked attempt names what blocked it');
    }
    for (const id of attempt.blockingPrerequisites) if (!tasks.has(id) && !defects.has(id)) fail('prerequisite', `unknown prerequisite ${id}`);
    for (const id of [...attempt.readyUpstreamTaskIds, ...attempt.unlocksTaskIds]) if (!tasks.has(id)) fail('task', `unknown task ${id}`);
  }

  // --- strategy reviews and the batch rule ----------------------------------------
  const dispatches = new Set<string>();
  const returns = new Set<string>();
  for (const review of record.strategyReviews) {
    const at = `verification.strategyReviews[${review.id}]`;
    if (!isMoment(review.at)) add(`${at}.at`, 'review needs the moment it returned, an ISO 8601 moment with Z or a ±hh:mm offset');
    if (!STRATEGY_TRIGGERS.includes(review.trigger)) add(at, 'unknown review trigger');
    if (!STRATEGY_DECISIONS.includes(review.decision)) add(at, 'unknown review decision');
    if (review.trigger === 'budget_exhausted' && review.decision === 'change_strategy') {
      add(at, 'an exhausted budget is answered by stop_incomplete or request_limit');
    }
    for (const id of review.attemptIds) if (!record.repairAttempts.some(item => item.id === id)) add(at, `unknown attempt ${id}`);
    for (const id of review.closedTaskIds) if (!tasks.has(id)) add(at, `unknown task ${id}`);
    if (dispatches.has(review.dispatchId) || returns.has(review.returnId)) add(at, 'review dispatch/return identity cannot be reused');
    dispatches.add(review.dispatchId);
    returns.add(review.returnId);
  }
  for (const attempt of v3Attempts) {
    const when = moment(attempt.at);
    const before = record.strategyReviews.filter(review => moment(review.at) <= when);
    if (before.some(review => review.decision === 'stop_incomplete')) {
      add(`verification.repairAttempts[${attempt.id}]`, 'a strategy review decided to stop; no attempt follows it', { attemptId: attempt.id, rule: 'stopped' });
    }
    const since = Math.max(-Infinity, ...before.map(review => moment(review.at)));
    const batch = v3Attempts.filter(other => other !== attempt && moment(other.at) < when && moment(other.at) > since);
    if (batch.length === 0) continue;
    const opened = Math.min(...batch.map(other => moment(other.at)));
    const closures = state.tasks.filter(task => task.status === 'done' && task.finishedAt
      && moment(task.finishedAt) > opened && moment(task.finishedAt) <= when).length;
    const repeated = batch.some(other => isV3Attempt(other) && SAME_CAUSE_REPEAT_KINDS.includes(other.repeatKind));
    if ((batch.length >= 2 && closures === 0) || repeated) {
      add(`verification.repairAttempts[${attempt.id}]`,
        `${batch.length} attempt(s) since the last strategy review closed ${closures} task(s)${repeated ? ' and a cause survived a similar repair' : ''}; a returned strategy review must precede this attempt`,
        { attemptId: attempt.id, rule: 'strategy-review', batch: batch.length, closures });
    }
  }

  // --- the budget: exhaustion and an authorized raise -----------------------------
  for (const decision of record.decisions.filter(item => item.kind === 'limit_increase')) {
    const at = `verification.decisions[${decision.id}]`;
    const review = decision.strategyReviewId ? reviews.get(decision.strategyReviewId) : undefined;
    if (!review || review.decision !== 'request_limit') add(at, 'a limit raise answers a request_limit strategy review');
    if (!decision.previousLimits || !decision.limits || decision.limits.total <= decision.previousLimits.total
      || decision.limits.perFinding !== decision.previousLimits.perFinding) {
      add(at, 'a limit raise records old and new limits, raises the total only and keeps the per-root limit');
    }
    if (!decision.forecast?.trim()) add(at, 'a limit raise carries the closure forecast the user was shown');
    if (decision.authorizedBy !== 'user') add(at, 'only the user authorizes a limit raise');
  }
  const exhausted = record.repairAttempts.length >= record.repairLimits.total;
  if (state.lifecycle === 'closed' && state.outcome === 'stopped_incomplete' && exhausted
    && !record.strategyReviews.some(review => review.trigger === 'budget_exhausted')) {
    add('outcome', 'a run stopped on an exhausted budget records its budget_exhausted strategy review');
  }
  if (state.lifecycle === 'closed' && state.outcome === 'completed' && record.defects.some(defect => defect.status === 'open')) {
    add('outcome', 'completed closure leaves no open defect');
  }
  log.debug('closure', 'closure graph validated', {
    readiness: record.readiness.length, defects: record.defects.length,
    reviews: record.strategyReviews.length, violations: errors.length,
  });
  return errors;
}

/** What a defect promises cannot move; only its verdict can, once. */
const frozen = ({ status: _status, verifiedExecutionIds: _verified, ...rest }: Defect): Omit<Defect, 'status' | 'verifiedExecutionIds'> => rest;

const open = (id: string, tasks: Map<string, TaskEntry>, defects: Map<string, Defect>): boolean => {
  const task = tasks.get(id);
  if (task) return !FINISHED.includes(task.status);
  return defects.get(id)?.status !== 'verified';
};

/** What only the moment of a write can decide: launches, verification currency, budget moves. */
export function validateClosureTransition(previous: RunState, next: RunState): VerificationViolation[] {
  const current = next.verification;
  const prior = previous.verification;
  if (next.contractVersion < 6 || !current || current.version !== 3 || !prior || prior.version === 1) return [];
  const errors: VerificationViolation[] = [];
  const add = (field: string, message: string, context: Record<string, unknown> = {}): void => {
    errors.push({ field, message });
    log.error('closure-transition', message, { field, ...context });
  };
  const tasks = new Map(next.tasks.map(task => [task.id, task]));
  const before = new Map(previous.tasks.map(task => [task.id, task]));
  const defects = new Map(current.defects.map(defect => [defect.id, defect]));

  // --- carried history -------------------------------------------------------------
  if (prior.version === 2) {
    if (!isDeepStrictEqual([...current.inheritedExecutionIds].sort(), prior.executions.map(item => item.id).sort())
      || !isDeepStrictEqual([...current.inheritedAttemptIds].sort(), prior.repairAttempts.map(item => item.id).sort())) {
      add('verification.inherited', 'a resume names exactly the carried executions and attempts as inherited');
    }
    if (current.readiness.length || current.defects.length || current.strategyReviews.length) {
      add('verification', 'a resume starts readiness, defects and strategy reviews empty; none is inferred from history');
    }
  } else {
    if (!isDeepStrictEqual(current.inheritedExecutionIds, prior.inheritedExecutionIds)
      || !isDeepStrictEqual(current.inheritedAttemptIds, prior.inheritedAttemptIds)) {
      add('verification.inherited', 'inherited history is frozen once published');
    }
    for (const name of ['readiness', 'strategyReviews'] as const) {
      for (const original of prior[name]) {
        if (!isDeepStrictEqual(current[name].find(item => item.id === original.id), original)) {
          add(`verification.${name}[${original.id}]`, 'published record is immutable; append a superseding record');
        }
      }
    }
    for (const original of prior.defects) {
      const successor = defects.get(original.id);
      if (!successor || !isDeepStrictEqual(frozen(successor), frozen(original))) {
        add(`verification.defects[${original.id}]`, 'a defect keeps its cause, criteria and parent; only its status moves');
        continue;
      }
      if (successor.status !== original.status && original.status !== 'open') {
        add(`verification.defects[${original.id}]`, `a ${original.status} defect does not change status again`);
      }
      if (successor.status === original.status && !isDeepStrictEqual(successor.verifiedExecutionIds, original.verifiedExecutionIds)) {
        add(`verification.defects[${original.id}]`, 'verifying executions are recorded once, when the defect is verified');
      }
    }
  }

  // --- a defect verified at this write is verified now ------------------------------
  const newlyVerified = current.defects.filter(defect => defect.status === 'verified'
    && prior.version === 3 && prior.defects.find(item => item.id === defect.id)?.status !== 'verified');
  if (newlyVerified.length > 0) {
    const summary = deriveVerification(next);
    const controls = activeControls(current);
    for (const defect of newlyVerified) {
      for (const id of defect.verifiedExecutionIds) {
        const execution = current.executions.find(item => item.id === id);
        const check = execution && current.checks.find(item => item.id === execution.checkId);
        if (!check || summary.checkResults[check.id] !== 'passed' || effectiveExecution(check, current.executions)?.id !== id) {
          add(`verification.defects[${defect.id}]`, `verifying execution ${id} is not the current passing result of its check`);
        }
      }
      for (const checkId of defect.repairCriteriaCheckIds) {
        if (!controls.some(control => control.checkId === checkId && controlResult(control, current) === 'passed')) {
          add(`verification.defects[${defect.id}]`, `repair-criteria check ${checkId} has no current passed control`);
        }
      }
    }
  }

  // --- appended attempts, executions and reviews -------------------------------------
  const appended = current.repairAttempts.filter(item => !prior.repairAttempts.some(old => old.id === item.id)
    && !current.inheritedAttemptIds.includes(item.id));
  for (const attempt of appended) {
    if (!isV3Attempt(attempt)) continue;
    const at = `verification.repairAttempts[${attempt.id}]`;
    const earlier = prior.version === 3 ? prior.defects.find(item => item.id === attempt.defectId) : undefined;
    if (earlier && earlier.status !== 'open') add(at, `defect ${earlier.id} is ${earlier.status}; repair an open defect`, { attemptId: attempt.id, rule: 'defect-open' });
    for (const id of attempt.readyUpstreamTaskIds) {
      if (!FINISHED.includes(tasks.get(id)?.status ?? '')) add(at, `upstream task ${id} is not ready`, { attemptId: attempt.id, rule: 'upstream' });
    }
    if (attempt.expectedProgress === 'task_closure') {
      for (const blockerId of tasks.get(attempt.taskId)?.blockedBy ?? []) {
        const status = tasks.get(blockerId)?.status ?? 'missing';
        if (!FINISHED.includes(status)) add(at, `task ${attempt.taskId} is not closable while blocker ${blockerId} is ${status}; `
          + 'forecast the defect or scenario instead', { attemptId: attempt.id, rule: 'forecast', blockerId });
      }
    }
    if (attempt.outcome === 'prerequisite_blocked') {
      for (const id of attempt.blockingPrerequisites) {
        if (!open(id, tasks, defects)) add(at, `prerequisite ${id} is already closed; it does not block`, { attemptId: attempt.id, rule: 'prerequisite' });
      }
    }
  }
  const superseded = new Set(current.readiness.flatMap(item => item.supersedes ? [item.supersedes] : []));
  for (const execution of current.executions) {
    if (prior.executions.some(old => old.id === execution.id) || current.inheritedExecutionIds.includes(execution.id)) continue;
    if (execution.readinessId && superseded.has(execution.readinessId)) {
      add(`verification.executions[${execution.id}]`, `readiness ${execution.readinessId} was superseded; run against the current record`,
        { executionId: execution.id, readinessId: execution.readinessId });
    }
  }
  for (const review of current.strategyReviews) {
    if (prior.version === 3 && prior.strategyReviews.some(old => old.id === review.id)) continue;
    if (review.trigger === 'budget_exhausted' && current.repairAttempts.length < prior.repairLimits.total) {
      add(`verification.strategyReviews[${review.id}]`, 'budget_exhausted is recorded only when attempts reach the total limit');
    }
    log.info('closure-transition', 'strategy review accepted', { reviewId: review.id, decision: review.decision });
  }

  // --- the budget moves only by an authorized raise ---------------------------------
  const was: RepairLimits = prior.repairLimits;
  const now: RepairLimits = current.repairLimits;
  if (now.perFinding !== was.perFinding) add('verification.repairLimits', 'the per-root repair limit never changes');
  if (now.total < was.total) add('verification.repairLimits', 'the total repair limit is not lowered');
  if (now.total > was.total) {
    const raise = current.decisions.find(item => item.kind === 'limit_increase'
      && !prior.decisions.some(old => old.id === item.id)
      && isDeepStrictEqual(item.previousLimits, was) && isDeepStrictEqual(item.limits, now));
    if (!raise) add('verification.repairLimits', 'a raised limit needs a user-authorized limit_increase answering a request_limit strategy review');
    else log.info('closure-transition', 'repair limit raised', { reviewId: raise.strategyReviewId, oldTotal: was.total, newTotal: now.total });
  }

  // --- dispatch: launch on finished blockers, repair after prerequisites ------------
  for (const task of next.tasks) {
    const earlier = before.get(task.id);
    // A таск first published already running was launched all the same; letting
    // its absence from the prior state excuse it would make appearing a way round
    // the blockers that a queued таск is held to.
    if (task.status !== 'running' || earlier?.status === 'running') continue;
    for (const blockerId of task.blockedBy) {
      const status = tasks.get(blockerId)?.status ?? 'missing';
      if (!FINISHED.includes(status)) {
        add(`tasks[${task.id}].status`, `task ${task.id} cannot run while blocker ${blockerId} is ${status}`, { taskId: task.id, blockerId, status });
      }
    }
    if (earlier?.status !== 'repair') continue;
    for (const defect of current.defects.filter(item => item.parentTaskId === task.id && item.status === 'open')) {
      const latest = current.repairAttempts.filter((item): item is RepairAttemptV3 => isV3Attempt(item) && item.defectId === defect.id).at(-1);
      if (latest?.outcome !== 'prerequisite_blocked') continue;
      for (const blockerId of latest.blockingPrerequisites.filter(id => open(id, tasks, defects))) {
        add(`tasks[${task.id}].status`, `repair of ${defect.id} waits on open prerequisite ${blockerId}; route it to its owner first`,
          { taskId: task.id, blockerId, status: tasks.get(blockerId)?.status ?? defects.get(blockerId)?.status ?? 'missing' });
      }
    }
  }
  return errors;
}

/** Every rule a write must satisfy against the state it replaces. */
export function validateStateTransition(previous: RunState, next: RunState): VerificationViolation[] {
  return [...validateVerificationTransition(previous, next), ...validateClosureTransition(previous, next)];
}

