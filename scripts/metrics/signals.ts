// Groups what a прогон recorded about itself into five signal classes, for
// whoever maintains Maestro rather than for the user.
//
// The rule `measure.ts` follows holds here too: the input is the run state and
// nothing else, and only structured fields are read. A `counterexample` or a
// `diagnosis` is prose, and grouping prose by resemblance would make the
// retrospective an opinion about which two sentences mean the same thing. What
// the state could not have recorded — a list the прогон predates, a
// verification record older than version 3 — is reported as not recorded,
// never as zero: a zero claims somebody looked.
//
// Each class is labelled by what it would propose: **mechanical** for a
// validator, **judgement** for a prompt rule. The proposals are prompts for a
// maintainer, not findings; nothing at `npm run check` proves that one is
// right, and that is the cost of printing them.

import { createLogger } from '../shared/log.ts';
import { isV3Attempt } from '../state/closure.ts';
import {
  SAME_CAUSE_REPEAT_KINDS,
  SIGNAL_KINDS,
  type Defect,
  type RepairAttemptV3,
  type RunState,
  type SignalKind,
  type VerificationRecordV3,
} from '../state/contract.ts';

const log = createLogger('metrics');

export type SignalClassId = 'withheld-requests' | 'briefs-exceeded' | 'writes-outside-files'
  | 'superseded-readiness' | 'repeated-defect-causes';

export interface SignalGroup {
  class: SignalClassId;
  label: 'mechanical' | 'judgement';
  status: 'recorded' | 'not recorded';
  /** `0` when not recorded. */
  count: number;
  /** In state order; empty when not recorded. */
  recordIds: string[];
  /** Printed only when something was cited. */
  proposal: string | null;
}

interface SignalClass {
  id: SignalClassId;
  label: SignalGroup['label'];
  /** The `signals` kind this class reads, for the three that read the list. */
  kind?: SignalKind;
  proposal: string;
}

/** The five classes, in the order they are reported. */
export const SIGNAL_CLASSES: readonly SignalClass[] = Object.freeze([
  { id: 'withheld-requests', label: 'judgement', kind: 'withheld-request',
    proposal: 'a reader asked for an input it is denied; propose a prompt rule in the phase that wrote its brief' },
  { id: 'briefs-exceeded', label: 'judgement', kind: 'brief-exceeded',
    proposal: 'a reader did work its brief forbids; propose a prompt rule in that reader\'s brief' },
  { id: 'writes-outside-files', label: 'mechanical', kind: 'out-of-zone-write',
    proposal: 'a таск wrote outside its zone; propose a validator over per-commit paths against tasks[].zone' },
  { id: 'superseded-readiness', label: 'mechanical',
    proposal: 'readiness was probed again after a setup failure; propose a preflight validator for the probe kinds that failed' },
  { id: 'repeated-defect-causes', label: 'judgement',
    proposal: 'a cause survived a repair or recurred across таски; propose a prompt rule for the diagnostician or the plan' },
] satisfies SignalClass[]);

/** The id and kind of a `signals` line; the grammar is the state validator's. */
const SIGNAL_LINE = new RegExp(`^(SIG-[1-9][0-9]*) (${SIGNAL_KINDS.join('|')}) — \\S.* — \\S`);

/** A probe that says nothing went wrong, and so says nothing about why readiness was redone. */
const QUIET_PROBE_RESULTS: readonly string[] = ['passed', 'not_applicable'];

/**
 * The `product` cause is the one repair exists for, so a product defect in
 * several таски is a прогон doing its work. The other causes recurring across
 * таски point at the method — the contract, the tests, the evidence, the
 * environment — which is what a retrospective is for.
 */
const ROUTINE_CAUSE: Defect['causeClass'] = 'product';

/** Signal ids by kind, in state order. `null` when the list is absent. */
function signalIds(state: RunState): Map<SignalKind, string[]> | null {
  if (state.signals === undefined) return null;
  const byKind = new Map<SignalKind, string[]>(SIGNAL_KINDS.map(kind => [kind, []]));
  state.signals.forEach((line, position) => {
    const match = typeof line === 'string' ? SIGNAL_LINE.exec(line) : null;
    if (match === null) {
      // Only a state nobody validated can carry one; counting it would count a guess.
      log.warn('retrospective', 'signal line unreadable', { position });
      return;
    }
    byKind.get(match[2] as SignalKind)!.push(match[1]!);
  });
  return byKind;
}

const v3Record = (state: RunState): VerificationRecordV3 | null =>
  state.verification?.version === 3 ? state.verification as VerificationRecordV3 : null;

/** `RD-a→RD-b`, then each probe of the superseded record that did not pass. */
function supersededReadiness(record: VerificationRecordV3): string[] {
  const successor = new Map(record.readiness.flatMap(item => item.supersedes === undefined ? [] : [[item.supersedes, item.id]]));
  return record.readiness.flatMap(item => {
    const next = successor.get(item.id);
    if (next === undefined) return [];
    const failed = item.probes.filter(probe => !QUIET_PROBE_RESULTS.includes(probe.result))
      .map(probe => `${probe.kind}:${probe.result}`);
    return [[`${item.id}→${next}`, ...failed].join(' ')];
  });
}

/** Attempts that repeated a cause, then non-routine causes shared across таски. */
function repeatedCauses(record: VerificationRecordV3): string[] {
  const attempts = record.repairAttempts
    .filter((attempt): attempt is RepairAttemptV3 =>
      isV3Attempt(attempt) && SAME_CAUSE_REPEAT_KINDS.includes(attempt.repeatKind))
    .map(attempt => `${attempt.id} (${attempt.defectId})`);

  const live = record.defects.filter(item => item.status !== 'superseded' && item.causeClass !== ROUTINE_CAUSE);
  const shared = live.filter(item =>
    new Set(live.filter(other => other.causeClass === item.causeClass).map(other => other.parentTaskId)).size >= 2);
  return [...attempts, ...shared.map(item => `${item.id} (${item.causeClass})`)];
}

function grouped(spec: SignalClass, recordIds: string[] | null): SignalGroup {
  const group: SignalGroup = recordIds === null
    ? { class: spec.id, label: spec.label, status: 'not recorded', count: 0, recordIds: [], proposal: null }
    : { class: spec.id, label: spec.label, status: 'recorded', count: recordIds.length, recordIds,
      proposal: recordIds.length > 0 ? spec.proposal : null };
  log.debug('retrospective', 'group read', { class: group.class, status: group.status, count: group.count });
  return group;
}

export function retrospect(state: RunState): SignalGroup[] {
  const signals = signalIds(state);
  const record = v3Record(state);
  return SIGNAL_CLASSES.map(spec => {
    if (spec.kind !== undefined) return grouped(spec, signals?.get(spec.kind) ?? null);
    if (record === null) return grouped(spec, null);
    return grouped(spec, spec.id === 'superseded-readiness' ? supersededReadiness(record) : repeatedCauses(record));
  });
}
