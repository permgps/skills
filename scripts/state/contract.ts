// The one type shared between the orchestrator and the dashboard.
//
// Authoritative definition: docs/spec/state-contract.md. This file is the
// executable half of it, and scripts/validate/state-matches-spec.ts fails the
// build when the two disagree — the contract is changed here first, then on
// both sides.

/**
 * Raised only by a removal, a rename, or a changed value set. Adding an
 * optional field raises nothing, because a reader ignores what it does not know.
 *
 * Version 2 changed three value sets at once: a таск can now be `failed`, a
 * stage can be `skipped`, and a требование can be delivered as a `placeholder`.
 * The optional fields that arrived with them — waves, counters, debt — would
 * have raised nothing on their own, and neither did `explain`, which arrived
 * later on the same terms.
 */
export const CONTRACT_VERSION = 2;

/** The stage ids from docs/spec/phases.md, in run order. */
export type StageId =
  | 'preflight'
  | 'manifest'
  | 'briefing'
  | 'spec'
  | 'plan'
  | 'build'
  | 'review'
  | 'acceptance';

export const STAGE_IDS: readonly StageId[] = [
  'preflight', 'manifest', 'briefing', 'spec',
  'plan', 'build', 'review', 'acceptance',
];

export type Mode = 'full' | 'semi' | 'interview' | 'manual';
export const MODES: readonly Mode[] = ['full', 'semi', 'interview', 'manual'];

export type Depth = 'strict' | 'normal' | 'deep';
export const DEPTHS: readonly Depth[] = ['strict', 'normal', 'deep'];

/**
 * How the прогон words what it shows the user — not how much it asks.
 *
 * It is the one dial in this file that produces no part of the build, which is
 * why it appears in no `DialChange`: there is nothing for the отчёт to attribute
 * to it. It is here at all because the dashboard renders its explanations in the
 * chosen register and `state.js` is the only thing the dashboard reads.
 */
export type Register = 'plain' | 'normal';
export const REGISTERS: readonly Register[] = ['plain', 'normal'];

export type StageStatus = 'pending' | 'active' | 'done' | 'failed' | 'skipped';
export const STAGE_STATUSES: readonly StageStatus[] =
  ['pending', 'active', 'done', 'failed', 'skipped'];

export type TaskStatus = 'queued' | 'running' | 'review' | 'repair' | 'done' | 'failed';
export const TASK_STATUSES: readonly TaskStatus[] =
  ['queued', 'running', 'review', 'repair', 'done', 'failed'];

export type RequirementStatus = 'open' | 'in-spec' | 'deferred' | 'dropped' | 'placeholder';
export const REQUIREMENT_STATUSES: readonly RequirementStatus[] =
  ['open', 'in-spec', 'deferred', 'dropped', 'placeholder'];

export type GateStatus = 'pending' | 'passed' | 'failed';
export const GATE_STATUSES: readonly GateStatus[] = ['pending', 'passed', 'failed'];

export type GateId = 'G1' | 'G2' | 'G3' | 'G4';
export const GATE_IDS: readonly GateId[] = ['G1', 'G2', 'G3', 'G4'];

/** Which dial moved, and at which phase boundary it took effect. */
export interface DialChange {
  dial: 'mode' | 'depth' | 'polish';
  from: string;
  to: string;
  atPhase: StageId;
}

/** One suite run, counted rather than described. */
export interface TestResult {
  passed: number;
  failed: number;
}

export interface StageEntry {
  id: StageId;
  status: StageStatus;
  startedAt?: string;
  finishedAt?: string;
  /**
   * One short human phrase, not a log line — «6 вопросов», «5 тасков в 3 волны».
   * A `skipped` stage is never written without one: a stage left unexplained
   * reads as a прогон that stalled there.
   */
  note?: string;
}

export interface TaskEntry {
  /** `NN`, zero-padded, assigned by the plan phase. */
  id: string;
  title: string;
  /** Traceability back to the манифест. Never empty — that is half of G3. */
  requirementIds: string[];
  status: TaskStatus;
  blockedBy: string[];
  /**
   * The dependency layer this таск sits in: `1 + max(wave of its blockers)`,
   * then split so that no two таски in one wave write the same files.
   *
   * Assigned once, by the plan phase, and never renumbered. It describes the
   * plan, not the frontier: when a таск finishes and the next becomes
   * launchable, that is the build moving through the plan. Renumbering as the
   * run progresses makes rows jump between groups on the dashboard, and a user
   * with no way to know the numbers were rewritten reads it as a lost plan.
   */
  wave?: number;
  /** The part of the boundary map this таск owns — why its wave-mates cannot collide with it. */
  zone?: string[];
  /** Restarts from scratch. */
  retries?: number;
  /** Trips through the repair phase. */
  repairs?: number;
  /**
   * Times the таск outgrew a context and was relayed to a fresh one.
   * **Not a defect count**: nothing was found wrong, the таск was long.
   */
  handoffs?: number;
  /** What the таск delivered, as paths. */
  files?: string[];
  startedAt?: string;
  finishedAt?: string;
  tests?: TestResult;
  /** The commit the таск landed in, once it has one. */
  commit?: string;
}

export interface RequirementEntry {
  /** `R01`… , assigned by the manifest phase. */
  id: string;
  status: RequirementStatus;
  /** Required for `deferred`, `dropped`, and for `open` at G1. */
  reason?: string;
}

export interface GateEntry {
  id: GateId;
  status: GateStatus;
  findings: string[];
}

/**
 * What the прогон owes the user but has not settled.
 *
 * `emptyEnv` holds variable **names** only. Safety rule S2 forbids a credential
 * ever reaching disk, and a list of environment variables is the obvious place
 * to break it by accident.
 */
export interface Debt {
  placeholders: string[];
  assumptions: string[];
  emptyEnv: string[];
}

/**
 * The whole file. Written by the orchestrator at phase boundaries and task
 * transitions only; read by the dashboard and by nothing else.
 *
 * **Everything contract 2 added is optional here, and required by
 * `validateState` when the state says it is contract 2.** This type describes
 * any state a reader may meet, including one written under contract 1 — which
 * `isValidState` deliberately still accepts, because the finished прогон this
 * repository can measure was written before these fields existed. Declaring
 * them required would narrow such a state to a type claiming a `wave` it does
 * not have, and the compiler would then carry that claim everywhere. The
 * version gate in the validator is where the promise is actually kept.
 */
export interface RunState {
  contractVersion: number;
  runId: string;
  slug: string;
  /** ISO 8601, written once. */
  startedAt: string;
  /** ISO 8601, restamped at every write — what lets the page say how old it is. */
  updatedAt?: string;
  mode: Mode;
  depth: Depth;
  polish: boolean;
  /**
   * Optional, and absent is not `normal`. Every state written before the
   * register existed lacks it, and a reader that supplied a value on the
   * writer's behalf would report a choice nobody made.
   */
  explain?: Register;
  dialChanges: DialChange[];
  stages: StageEntry[];
  currentStage: StageId;
  tasks: TaskEntry[];
  requirements: RequirementEntry[];
  gates: GateEntry[];
  debt?: Debt;
  /** Delivered beyond what was asked, one line apiece, with the требование it served. */
  additions?: string[];
  /** The last full suite run. */
  tests?: TestResult;
  /** ISO 8601, set by the acceptance phase. */
  finishedAt?: string;
  /** ISO 8601, set when a phase fails or the run stops; cleared on resume. */
  interruptedAt?: string;
}
