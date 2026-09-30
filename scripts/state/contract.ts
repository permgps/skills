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
 * have raised nothing on their own, and neither did `explain`, `language` or
 * `heldBy`, each of which arrived later on the same terms.
 *
 * Version 3 renamed one field: `tasks[].commit` became `tasks[].commits`. A
 * repaired таск lands twice, and a field holding one commit records the last
 * and loses the first — which is the one its original review was written
 * against. The dashboard has no handling to add because it never read the field
 * under either name, but it does carry its own copy of this number, and
 * `scripts/validate/state-matches-spec.ts` holds the two together.
 * Version 5 requires source audit, frozen scope and completion safeguards.
 * Version 4 changes completion semantics: lifecycle, outcome and a versioned
 * verification index are required for a new state. Earlier states remain
 * readable without inferred verification; validateState enforces the version
 * boundary rather than narrowing this reader-facing interface.
 */
export const CONTRACT_VERSION = 5;

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

/**
 * Which language the прогон speaks in — the second dial here that produces no
 * part of the build, and here for the register's reason exactly: the dashboard
 * paints its labels and its fourteen explanations in one of two languages, and
 * `state.js` is the only thing the dashboard reads.
 *
 * It appears in no `DialChange` for the same reason `Register` does not.
 */
export type Language = 'ru' | 'en';
export const LANGUAGES: readonly Language[] = ['ru', 'en'];

/**
 * Which session is driving this прогон — a claim, not a lock.
 *
 * `token` is short and random and the session mints it when it opens a прогон
 * that carries none. It is minted rather than discovered because no session
 * identity survives across Claude Code, Codex and Gemini CLI, and a pid or a
 * hostname would name the machine: two sessions on one laptop would look like
 * one holder, and one session outliving a restart would look like two.
 *
 * `since` is when that token was written, `Date.parse`-able like every other
 * stamp in this file.
 *
 * The field **detects** a second orchestrator; it does not prevent one. Nothing
 * here can expire a lease, and a session dies without releasing anything, so a
 * claim that refused would strand the next session in front of a прогон it
 * cannot touch. What it buys is that the second session finds out — and says so
 * to the user rather than deciding, because it cannot tell a live holder from a
 * dead one.
 */
export interface Holder {
  token: string;
  since: string;
}

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

export type Lifecycle = 'active' | 'closed';
export const LIFECYCLES: readonly Lifecycle[] = ['active', 'closed'];

export type ClosureOutcome = 'completed' | 'closed_with_exceptions' | 'stopped_incomplete';
export const CLOSURE_OUTCOMES: readonly ClosureOutcome[] =
  ['completed', 'closed_with_exceptions', 'stopped_incomplete'];

export type VerificationResult = 'passed' | 'failed' | 'incomplete';
export const VERIFICATION_RESULTS: readonly VerificationResult[] =
  ['passed', 'failed', 'incomplete'];

export type CheckResult = 'not_run' | 'passed' | 'failed' | 'unavailable' | 'stale';
export const CHECK_RESULTS: readonly CheckResult[] =
  ['not_run', 'passed', 'failed', 'unavailable', 'stale'];

export type ReferenceRole = 'authoritative_behavior' | 'visual_reference' | 'contextual_example' | 'other';
export type DiscoveryStatus = 'observed' | 'source_derived' | 'unresolved';
export type FindingStatus = 'open' | 'resolved';
export type CoverageStatus = 'complete' | 'incomplete';

/** The source identity and access limits survive even when access is unavailable. */
export interface VerificationReference {
  id: string;
  statement: string;
  role: ReferenceRole;
  roleDescription?: string;
  location: string;
  accessMethod: string;
  available: boolean;
  limitation?: string;
  revision: string;
  conditions: string[];
  approvedDeviationIds: string[];
}

/** An inspected or deliberately uninspected reference surface. */
export interface ReferenceSurface {
  id: string;
  referenceId: string;
  source: string;
  inspected: boolean;
  equivalenceGroup?: string;
  variantIds: string[];
  limitation?: string;
}

export interface VerificationObligation {
  id: string;
  requirementIds: string[];
  referenceIds: string[];
  surfaceIds: string[];
  expectation: string;
  discovery: DiscoveryStatus;
  sourceEvidenceIds: string[];
  variantIds: string[];
  checkIds: string[];
  implementationTaskIds: string[];
  targetRevision: number;
  supersedes?: string;
}

export interface VerificationCheck {
  id: string;
  obligationIds: string[];
  method: string;
  target: string;
  procedure: string[];
  oracle: string;
  oracleEvidenceIds: string[];
  variantIds: string[];
  executionTaskId?: string;
  integrationDependencies: string[];
  required: boolean;
  /** Fingerprint for this check's declared relevant inputs now. */
  currentFingerprint: EvidenceFingerprint;
  /** A changed oracle/mask creates a new check with an authorized basis. */
  supersedes?: string;
  basisDecisionId?: string;
  oracleChangeBasis?: string;
  ignoreMask?: string[];
}

/** Only declared relevant inputs are fingerprinted; no credential values. */
export interface EvidenceFingerprint {
  reference: string;
  build: string;
  data: string;
  runtime: string;
  acceptanceInput: string;
  relevantPaths: string[];
  /** Relative project paths and hashes for declared relevant files. */
  inputHashes: Record<string, string>;
}

export interface VerificationEvidence {
  id: string;
  path: string;
  sha256: string;
  mediaType: string;
  capturedAt: string;
  origin: 'reference' | 'execution';
  basis?: string;
}

export interface CheckAssertion {
  name: string;
  result: 'passed' | 'failed';
  evidenceIds: string[];
}

export interface CheckExecution {
  id: string;
  checkId: string;
  result: CheckResult;
  fingerprint: EvidenceFingerprint;
  invocation: string;
  tool: string;
  host: string;
  executor: string;
  executedAt: string;
  viewport?: string;
  locale?: string;
  authVariant?: string;
  assertions: CheckAssertion[];
  evidenceIds: string[];
  limitation?: string;
  supersedes?: string;
}

export interface VerificationFinding {
  id: string;
  requirementIds: string[];
  obligationIds: string[];
  checkIds: string[];
  evidenceIds: string[];
  origin: 'coordinator' | 'executor' | 'reviewer' | 'independent' | 'user' | 'validator';
  description: string;
  status: FindingStatus;
  resolutionExecutionId?: string;
  supersedes?: string;
}

export interface VerificationDecision {
  id: string;
  kind: 'scope_amendment' | 'accepted_exception';
  authorizedBy: string;
  authorizedAt: string;
  authorization: string;
  /** The exact choices shown to the user when the decision was made. */
  presentedFindingIds: string[];
  presentedObligationIds: string[];
  selectedFindingIds: string[];
  selectedObligationIds: string[];
  previousTargetRevision?: number;
  targetRevision?: number;
  basis?: string;
}

export interface CoverageReview {
  id: string;
  requirementId: string;
  targetRevision: number;
  status: CoverageStatus;
  inspectedSurfaceIds: string[];
  uninspectedSurfaceIds: string[];
  reviewer: string;
  reviewedAt: string;
  inputDigest: string;
  limitation?: string;
}

export interface AcceptanceRound {
  id: string;
  targetRevision: number;
  inputDigest: string;
  referenceIds: string[];
  executionIds: string[];
  findingIds: string[];
  coverageReviewIds: string[];
  requirementResults: Record<string, VerificationResult>;
  g4: GateStatus;
  performedAt: string;
  supersedes?: string;
}

export interface PromisedWork {
  id: string;
  description: string;
  status: 'open' | 'done' | 'cancelled';
  acceptanceRoundId?: string;
  authorizationDecisionId?: string;
}

export interface RepairAttempt {
  id: string;
  findingId: string;
  taskId: string;
  at: string;
  outcome: 'repaired' | 'still_failing' | 'unavailable';
}

export interface RepairLimits {
  perFinding: number;
  total: number;
}

/** The single authoritative verification index, embedded in the state snapshot. */
export interface VerificationRecordV1 {
  version: 1;
  targetRevision: number;
  acceptanceInputDigest: string;
  references: VerificationReference[];
  surfaces: ReferenceSurface[];
  obligations: VerificationObligation[];
  checks: VerificationCheck[];
  executions: CheckExecution[];
  evidence: VerificationEvidence[];
  findings: VerificationFinding[];
  decisions: VerificationDecision[];
  coverageReviews: CoverageReview[];
  acceptanceRounds: AcceptanceRound[];
  promisedWork: PromisedWork[];
  repairLimits: RepairLimits;
  repairAttempts: RepairAttempt[];
}

/** Completion safeguards use exact original-language anchors, never translations. */
export interface SourceSnapshot {
  id: string;
  origin: 'initial' | 'addition';
  text: string;
  sha256: string;
  capturedAt: string;
  targetRevision: number;
}

export interface SourceClause {
  id: string;
  sourceId: string;
  start: number;
  end: number;
  quote: string;
  classification: 'requirement' | 'context';
  requirementIds: string[];
  exclusionReason?: string;
}

export interface ManifestAudit {
  id: string;
  sourceIds: string[];
  sourceDigests: Record<string, string>;
  manifestDigest: string;
  targetRevision: number;
  clauseIds: string[];
  findings: string[];
  result: 'passed' | 'failed' | 'incomplete';
  dispatchId?: string;
  readerId?: string;
  returnId?: string;
  auditedAt: string;
  limitation?: string;
}

export interface ScopeBaseline {
  id: string;
  sourceIds: string[];
  manifestDigest: string;
  auditId: string;
  agreementId: string;
  agreedAt: string;
  requirementIds: string[];
  expectations: Array<{ requirementId: string; clauseIds: string[]; text: string; checkIds: string[] }>;
}

export interface ScopeMapping {
  id: string;
  decisionId?: string;
  originalRequirementId: string;
  currentRequirementIds: string[];
  relation: 'unchanged' | 'changed' | 'split' | 'withdrawn';
  originalCheckIds: string[];
  targetRevision: number;
}

export interface VerificationJourney {
  id: string;
  requirementIds: string[];
  obligationIds: string[];
  checkIds: string[];
  fixture: string;
  variantIds: string[];
  steps: Array<{ action: string; assertion: string }>;
  integrationDependencies: string[];
  executionTaskId: string;
  targetRevision: number;
  reset: string;
  cleanup: string;
}

export interface ControlRun {
  id: string;
  phase: 'clean' | 'mutated' | 'restored';
  result: 'passed' | 'failed';
  oracleDigest: string;
  assertions: CheckAssertion[];
  evidenceIds: string[];
  executedAt: string;
  executor: string;
  invocation: string;
  fingerprint: EvidenceFingerprint;
}

export interface NegativeControl {
  id: string;
  checkId: string;
  targetRevision: number;
  selectionBasis: 'user_condition' | 'acceptance_critical' | 'severe_defect';
  applicability: string;
  defect: string;
  expectedAssertion: string;
  isolationFingerprint: string;
  mainFingerprint: EvidenceFingerprint;
  oracleDigest: string;
  result: 'not_run' | 'passed' | 'failed' | 'unavailable';
  runs: ControlRun[];
  findingId?: string;
  limitation?: string;
  supersedes?: string;
}

export interface RepairAttemptV2 extends RepairAttempt {
  rootFindingId: string;
  predecessorId?: string;
  hypothesis: string;
  diagnosis: string;
  evidenceIds: string[];
  strategy: 'minimal_reproduction' | 'interface_verification' | 'dependency_correction'
    | 'implementation_change' | 'independent_executor';
  action: string;
  followUpCheckIds: string[];
  diagnosisDispatchId?: string;
  diagnosisReturnId?: string;
  novelty?: 'accepted' | 'rejected' | 'unavailable';
}

/** Version dispatch preserves historical verification-1 outcomes verbatim. */
export interface VerificationRecordV2 extends Omit<VerificationRecordV1, 'version' | 'repairAttempts'> {
  version: 2;
  manifestDigest: string;
  sourceSnapshots: SourceSnapshot[];
  sourceClauses: SourceClause[];
  manifestAudits: ManifestAudit[];
  scopeBaseline?: ScopeBaseline;
  scopeMappings: ScopeMapping[];
  journeys: VerificationJourney[];
  negativeControls: NegativeControl[];
  repairAttempts: RepairAttemptV2[];
}

export type VerificationRecord = VerificationRecordV1 | VerificationRecordV2;

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
  /**
   * The commits this таск landed in, in the order they landed.
   *
   * A list rather than one commit because a repaired таск lands twice, and the
   * first is what its original review was written against. `commits[0]^..` to
   * the last, over this таск's own files, is therefore the whole of what it did
   * and nothing another таск did — which is what makes reviewing it possible
   * once later waves are in the tree.
   */
  commits?: string[];
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
  /**
   * Optional, and absent is not `ru`. A state written before the language dial
   * existed lacks it, and the page's own rule decides what to paint then — the
   * contract only says the field may be missing.
   */
  language?: Language;
  /**
   * Optional, and absent means unclaimed rather than free: a прогон nobody
   * claimed carries none, and so does every state written before the field
   * existed. See {@link Holder} for why it detects rather than prevents.
   */
  heldBy?: Holder;
  dialChanges: DialChange[];
  stages: StageEntry[];
  currentStage: StageId;
  tasks: TaskEntry[];
  requirements: RequirementEntry[];
  gates: GateEntry[];
  /** Required for contract 4; absent in a read-only historical state. */
  lifecycle?: Lifecycle;
  /** Required only for a closed contract-4 state. */
  outcome?: ClosureOutcome;
  /** Required for a stopped incomplete run. */
  stopReason?: string;
  /** Required for contract 4; records and verdicts publish atomically. */
  verification?: VerificationRecord;
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
