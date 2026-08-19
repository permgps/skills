// The one type shared between the orchestrator and the dashboard.
//
// Authoritative definition: docs/spec/state-contract.md. This file is the
// executable half of it, and scripts/validate/state-matches-spec.ts fails the
// build when the two disagree — the contract is changed here first, then on
// both sides.

/**
 * Raised only by a removal, a rename, or a changed value set. Adding an
 * optional field raises nothing, because a reader ignores what it does not know.
 */
export const CONTRACT_VERSION = 1;

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

export type StageStatus = 'pending' | 'active' | 'done' | 'failed';
export const STAGE_STATUSES: readonly StageStatus[] = ['pending', 'active', 'done', 'failed'];

export type TaskStatus = 'queued' | 'running' | 'review' | 'repair' | 'done';
export const TASK_STATUSES: readonly TaskStatus[] = ['queued', 'running', 'review', 'repair', 'done'];

export type RequirementStatus = 'open' | 'in-spec' | 'deferred' | 'dropped';
export const REQUIREMENT_STATUSES: readonly RequirementStatus[] =
  ['open', 'in-spec', 'deferred', 'dropped'];

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

export interface StageEntry {
  id: StageId;
  status: StageStatus;
  startedAt?: string;
  finishedAt?: string;
}

export interface TaskEntry {
  /** `NN`, zero-padded, assigned by the plan phase. */
  id: string;
  title: string;
  /** Traceability back to the манифест. Never empty — that is half of G3. */
  requirementIds: string[];
  status: TaskStatus;
  blockedBy: string[];
  startedAt?: string;
  finishedAt?: string;
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
 * The whole file. Written by the orchestrator at phase boundaries and task
 * transitions only; read by the dashboard and by nothing else.
 */
export interface RunState {
  contractVersion: number;
  runId: string;
  slug: string;
  /** ISO 8601, written once. */
  startedAt: string;
  mode: Mode;
  depth: Depth;
  polish: boolean;
  dialChanges: DialChange[];
  stages: StageEntry[];
  currentStage: StageId;
  tasks: TaskEntry[];
  requirements: RequirementEntry[];
  gates: GateEntry[];
  /** ISO 8601, set by the acceptance phase. */
  finishedAt?: string;
  /** ISO 8601, set when a phase fails or the run stops; cleared on resume. */
  interruptedAt?: string;
}
