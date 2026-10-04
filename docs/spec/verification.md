# Verification and Closure

This document defines contract version 6's verification record and preserves
contract 4's and 5's historical rules. The source
request is the user's declared scope; a reference is authoritative only for the
behavior or appearance the user asked to preserve. The orchestrator is the sole
writer of the state snapshot and imports task-owned captures after checking
their identity. `state.js` embeds the versioned `verification` index; there is
no second editable verdict file. `reference.md` and `report.md` are readable
projections. Captures under `evidence/<execution-id>/` are immutable inputs
referenced by path and SHA-256.

## When Verification Applies

Every committed requirement needs a concrete way to verify the requested
outcome. A migration, clone, rewrite, or refactor that preserves an observable
interface needs a reference inventory and behavior checks. A backend or document
change without such an interface needs proportionate non-UI checks; it does not
need screenshots or pointer tests. Required fidelity remains part of acceptance
for every mode and depth, including `polish=false`. Optional refinement may run
in polish after required fidelity has passed.

The user may name an existing application, repository, deployment, screenshot,
archive, or URL without saying “reference.” Preservation intent registers that
source. An inaccessible source remains registered with its limitation. The
orchestrator must not replace it with an implementation-generated mockup or
record an unexercised source inference as a browser observation.

Reference discovery is bounded to relevant routes, templates, shared
components, assets, handlers, and configuration. It excludes unrelated uploads,
caches, vendor trees, and credential-bearing material. Record inspected and
uninspected surfaces, representative equivalence groups, and materially distinct
viewport, locale, authentication, and data variants. The coverage map explains
why selected variants represent their group. It does not demand a full Cartesian
product. A source scan helps discovery but cannot prove behavioral completeness.

## Record Shape and Ownership

`VerificationRecord.version` is `3` for contract 6, `2` for contract 5, and `1`
for contract 4.
Its `targetRevision` changes only
with an authorized scope amendment; `acceptanceInputDigest` identifies the
current manifest and additions snapshot. IDs are stable within the run. Existing task
IDs remain zero-padded `NN` and requirement IDs remain `R##`. An obligation can
have an implementation owner and a separate check execution owner, including a
verification-only task. Every required check names an execution task and its
integration dependencies.

| Entity | Required fields and meaning |
|---|---|
| `references[]` | Stable ID; user's identifying statement; authority role; location, access method, availability and limitation; revision/capture identity, conditions and authorized deviations. |
| `surfaces[]` | Reference ID, inspected source or route, inspected flag, equivalence group, variants and limitation. This is the source coverage map. |
| `obligations[]` | Requirement IDs, reference/surface IDs where applicable, observable expectation, `observed` / `source_derived` / `unresolved` discovery, source evidence IDs, applicable variants, check IDs, implementation task IDs and target revision. |
| `checks[]` | Obligation IDs, method, integrated target, reproducible procedure, oracle and provenance IDs, variants, required flag, execution owner, integration dependencies, and current relevant input fingerprint. |
| `executions[]` | Check ID, actual result, assertions, invocation, tool/host/executor identity, timestamp, evidence IDs, environment variants, relevant input fingerprint, optional superseded execution and limitation. |
| `evidence[]` | Stable ID, run-local path, SHA-256, media type, capture timestamp, reference/execution origin and recorded basis when an oracle changes. |
| `findings[]` | Stable ID, affected requirement/obligation/check IDs, evidence, origin, description, open/resolved state, and resolving execution when resolved. |
| `decisions[]` | Scope amendment or accepted exception, exact authorization and provenance, presented finding/obligation snapshot, selected IDs, old/new target revisions when applicable, and basis. |
| `coverageReviews[]` | Requirement ID, target revision, complete/incomplete result, inspected/uninspected surface IDs, reviewer, input digest, timestamp and limitation. |
| `acceptanceRounds[]` | Target revision, input digest, included reference/execution/finding/review IDs, derived requirement results and G4, timestamp and superseded round. |
| `promisedWork[]` | Outstanding acceptance round or other named work, its open/done/cancelled status and authorizing decision for cancellation. |
| `repairLimits` / `repairAttempts[]` | Finite per-finding and overall limits; attempts name stable finding and task IDs, time, and outcome. A superseding finding inherits its original failure's count. |

The reference register given to an independent reader is a neutral projection of
`references[]` and `surfaces[]`: source identity, role, access, conditions,
availability, and limitations. It excludes check results, findings, decisions,
and prior verdicts. The reader can inspect the raw authority and integrated
build without receiving the implementation rationale. Initial discovery is not
limited to existing obligations. After that pass, reconcile newly found behavior
with the inventory and every existing finding origin.

Source-derived expectations preserve their source citation and status. An
execution against the integrated build is recorded separately. A digest or
module signature establishes identity or structure only; it cannot satisfy a
check whose assertion concerns browser visibility, focus, pointer input, or
layout. When those outcomes matter, perform real browser input and capture
initial, activated, panel-entry, and exit states as applicable. Where browser
execution is unavailable, name the missing capability and mark affected checks
`unavailable`; continue independent checks.

## Completion Extension (Verification 2)

Contract 5 requires verification 2. Contract 4 requires verification 1 and keeps
its old outcomes; contracts 1–3 retain their historical activity fields. No
reader upgrades a historical record. New safeguards on an old run are
`not-established`. Explicit resume constructs an active candidate at the current contract, recovers
actual redacted sources, dispatches fresh readers, and reruns affected checks.
Missing original text cannot be invented: keep the baseline absent and explain
the limitation. It cannot establish passing G1 or completed closure under contract 5 or 6.

All records below are embedded in the same atomic snapshot. Arrays are required,
including empty arrays during preflight; `manifestDigest` is required; `scopeBaseline` is optional until
agreement. `manifestDigest` is SHA-256 of UTF-8 manifest.md bytes (LF endings,
no other normalization). Source text is redacted before hashing or offsetting;
its SHA-256 uses its exact UTF-8 bytes. Offsets are zero-based with end exclusive
and count Unicode code points rather than UTF-16 code units so emoji retain
stable offsets.
Identifiers are monotonically allocated, never recycled: `SRC-N`, `CL-N`,
`MA-N`, `J-N`, `NC-N`, `RA-N`, and `AG-N` for sources, clauses, audits,
journeys, controls, repair attempts, and agreements respectively (N positive
integer). Existing requirement/task/graph IDs retain their formats.

| Entity | Exact fields (a trailing ? means optional) | Owner / publication |
|---|---|---|
| verification-2 record | inherited fields plus `version`, `manifestDigest`, `sourceSnapshots[]`, `sourceClauses[]`, `manifestAudits[]`, `scopeBaseline?`, `scopeMappings[]`, `journeys[]`, `negativeControls[]`, `repairAttempts[]` | orchestrator; version 2 only under contract 5 |
| `sourceSnapshots[]` | `id`, `origin` (`initial` / `addition`), `text`, `sha256`, `capturedAt`, `targetRevision` | manifest; capture before translation; additions before status changes |
| `sourceClauses[]` | `id`, `sourceId`, `start`, `end`, `quote`, `classification` (`requirement` / `context`), `requirementIds[]`, `exclusionReason?` | manifest; exact span; contextual exclusion needs reason and no requirement IDs |
| `manifestAudits[]` | `id`, `sourceIds[]`, `sourceDigests` (source ID → SHA-256), `manifestDigest`, `targetRevision`, `clauseIds[]`, `findings[]` (returned text), `result` (`passed` / `failed` / `incomplete`), `dispatchId?`, `readerId?`, `returnId?`, `auditedAt`, `limitation?` | manifest; publish actual return; incomplete dispatch needs limitation |
| `scopeBaseline` | `id`, `sourceIds[]`, `manifestDigest`, `auditId`, `agreementId`, `agreedAt`, `requirementIds[]`, `expectations[]` | manifest; freeze at initial agreement; immutable after publication |
| baseline expectation | `requirementId`, `clauseIds[]`, `text`, `checkIds[]` | exact original condition; no checks known at agreement is an empty array; later original-compatible checks use scope mappings |
| `scopeMappings[]` | `id`, `decisionId?`, `originalRequirementId`, `currentRequirementIds[]`, `relation` (`unchanged` / `changed` / `split` / `withdrawn`), `originalCheckIds[]`, `targetRevision` | briefing amendment; original-compatible evidence explicit; immutable |
| `journeys[]` | `id`, `requirementIds[]`, `obligationIds[]`, `checkIds[]`, `fixture`, `variantIds[]`, `steps[]` (objects with `action`, `assertion`), `integrationDependencies[]`, `executionTaskId`, `targetRevision`, `reset`, `cleanup` | plan; before G3; ordinary required checks execute ordered observations; execution assertion names must cover every step assertion |
| `negativeControls[]` | `id`, `checkId`, `targetRevision`, `selectionBasis` (`user_condition` / `acceptance_critical` / `severe_defect`), `applicability`, `defect`, `expectedAssertion`, `isolationFingerprint`, `mainFingerprint`, `oracleDigest`, `result` (`not_run` / `passed` / `failed` / `unavailable`), `runs[]`, `findingId?`, `limitation?`, `supersedes?` | plan selects; build/acceptance append outcome superseding selection |
| control run | `id`, `phase` (`clean` / `mutated` / `restored`), `result` (`passed` / `failed`), `oracleDigest`, `assertions[]`, `evidenceIds[]`, `executedAt`, `executor`, `invocation`, `fingerprint` | verification-only executor returns captures; separate from ordinary executions |
| extended `repairAttempts[]` | existing fields plus `rootFindingId`, `predecessorId?`, `hypothesis`, `diagnosis`, `evidenceIds[]`, `strategy` (`minimal_reproduction` / `interface_verification` / `dependency_correction` / `implementation_change` / `independent_executor`), `action`, `followUpCheckIds[]`, `diagnosisDispatchId?`, `diagnosisReturnId?`, `novelty?` (`accepted` / `rejected` / `unavailable`) | repair; append after result; repeat requires independent diagnosis before dispatch |

All new arrays require unique IDs and valid references. A requirement clause
maps to at least one existing R ID; context maps to none and states why. Spans
must be nonempty and match their snapshot exactly. One initial source is
captured; additions each have a separate source. Reader discovery can add clauses
missing from the coordinator's proposed inventory. Mechanical validation checks
these declarations, never semantic completeness of an inventory or novelty of
a strategy. Source/audit/baseline histories cannot be edited or removed.

A passed audit covers every current source and its own returned clause set, binds all
source digests and the current manifest digest and target revision, contains no
findings, and has nonempty actual dispatch, reader, and return identities. The
same dispatch/return cannot be reused for another audit. A failed audit contains
findings; an incomplete audit states its limitation. Changing the source set,
manifest, or target revision invalidates a prior pass. Agreement and passing G1
require a fresh pass; G1 stays after briefing. The baseline captures only initial
requirements and clauses, the audited manifest identity, and real agreement
identity (in full mode this is the recorded presentation, not an invented reply).
A source/manifest change invalidates agreement until re-audited. Later amendments
preserve the baseline and require user authorization; additions get new R IDs.

Identity format follows the host: a canonical child/context name is usable when
the dispatch and returned host event actually expose it; UUID syntax is not
required. Record that format limitation. A guessed label is not an identity.
An available child name does not establish hidden prompt contents, filesystem
reads, or backend model identity: record those observation limits separately.
Compute input hashes over exact UTF-8 bytes, preserving final newlines; decoded
JSON strings and file content must identify the same supplied input.

Freshness uses the latest appended audit for the exact current source/manifest
and target identities. A later failed or incomplete audit of those same inputs
invalidates an earlier pass. Validate the selected audit's clause IDs, source
coverage and current requirement mappings; retained rows from failed drafts do
not have to be reattributed to that reader. Baseline expectations bind only the
clauses in the initial passed audit named by `scopeBaseline.auditId`. Historical
rows cannot supply a missing current mapping or enlarge that frozen agreement.

### Selection and Execution Rules

1. At specification, enumerate outcomes that cross requirement boundaries;
   for each, name fixture, ordered actions/assertions, variants, reset/cleanup,
   implementation dependencies, and required check IDs. Save → restart → reopen
   is one journey; three passing unit tests cannot replace it.
2. Add clean documented startup when the request promises a runnable application;
   add restart persistence when it promises retained data; add real integration
   checks when it promises that integration. A document/local prototype receives
   proportional checks. Sandbox success proves sandbox behavior only. Missing
   required service/tool/value leaves affected checks unavailable. No credential
   solicitation, production mutation, deployment or payment without S2/S4.
3. Select a control only with one declared basis: explicit user condition,
   acceptance-critical outcome, or observed severe defect. Explain applicability.
   Selection is mandatory once recorded; unavailable execution remains incomplete.
4. On a disposable isolated copy, prove clean pass, introduce one named defect,
   execute the identical check/oracle and require its expected assertion to fail,
   then restore and prove pass. Fingerprint the main build before/after unchanged.
   The oracleDigest hashes compact JSON `[procedure, oracle, ignoreMask-or-empty-array]`
   in that order with UTF-8 SHA-256. Store all three captures; never append the intentional defect to production
   `executions[]`. Never change oracle, masks, source authority or production data.
5. A selected detector that misses its defect yields failed control and an open
   check-quality finding. A detected defect with clean/restored pass yields passed
   control. Missing isolation, tool or capture yields unavailable, never passed.
   Superseding controls retain the check and selection basis; stale fingerprints
   make the result incomplete. Unrelated requirements may still pass.

### Decision Table

| Condition | Record / owner | Next action / exit |
|---|---|---|
| Lost number, quantifier, negation, exception, normative example or reference | failed audit / manifest | correct draft and clause map; redispatch up to two corrections; unresolved third failure stops incomplete |
| Fresh complete audit | passed audit and baseline / manifest | present agreement; briefing then G1 |
| Missing independent context or return | incomplete audit / manifest | explain capability; G1 pending; never self-audit |
| Added source or altered manifest | append source/mapping/audit / manifest | invalidate affected acceptance; re-audit before agreement |
| Unit checks pass but journey fails | ordinary failed check / acceptance | finding to owning task through repair; fresh review and acceptance |
| Selected control detects / misses / unavailable | passed / failed / unavailable control | proceed / repair check quality / G4 pending unless another failure establishes failed |
| Reproducible startup code defect | finding and startup-defect door / acceptance | diagnose bounded repair; review; relaunch; fresh G4 |
| Missing startup prerequisite | unavailable checks / acceptance | continue independent checks; ask only for required nonsecret information; no code retry loop |
| Repair still fails | attempt / repair | preserve root/budget; independent diagnosis with falsifying evidence; different grounded strategy before next dispatch |
| Unchanged strategy or missing diagnosis | rejected/unavailable novelty / repair | no retry; obtain valid diagnosis or stop incomplete |
| Readiness probe `setup_failed` (v3) | superseding readiness record / coordinator | correct the verification setup; no `RA-N`; no broad execution against that record |
| Readiness probe `unavailable` (v3) | dependent executions `unavailable` with `unavailable_capability` / build or acceptance | continue checks that do not declare the probe; no code repair |
| Bounded repair verifies its defect, parent criteria remain (v3) | defect `verified`; task stays `repair` | dispatch the next defect or review; the task closes only through review |
| Batch closed no task, or the same cause survived (v3) | strategy review / repair | no further `RA-N` until a returned strategy review records a decision |
| Budget exhausted | unresolved finding / repair | report attempts and stable roots; v3 records a `budget_exhausted` strategy review; stop incomplete, exact authorized exception, or a user-authorized `limit_increase` |
| Current authorized target passes while original does not | two scope measurements / acceptance | may close current target; preserve original deficit and decisions |
| Missing/zero original baseline | not-established / not-applicable progress | show unknown / no ratio; never fabricate 100% |

A renamed finding, split task, split defect, new executor or strategy cannot
reset per-root or global counts. Per-finding limit is at most two and never
rises; the total limit is finite. Under verification 2 it never changes. Under
verification 3 it rises only through a `limit_increase` decision carrying the
user's exact authorization, the `request_limit` strategy review it answers, the
old and new limits and a closure forecast; a silent or coordinator-initiated
raise, and any decrease, is rejected. Independent diagnosis consumes the prior
hypothesis, action, result and evidence. Textual variation alone does not prove
novelty.

### Scope Progress

`ScopeProgress` is derived, never persisted as a second verdict. It contains
`original` and `current` measurements with `status` (`established`,
`not-established`, `not-applicable`), `passed`, `total`, and `requirementIds[]`,
plus `addedIds[]`, `deferredIds[]`, `droppedIds[]`, `changedIds[]`, and
`exceptionDecisionIds[]`. A zero denominator has no percentage.

Original total is the frozen baseline R ID set, including later exclusions.
Its numerator requires all frozen clause expectations proved by fresh checks
on the candidate, without open contradicting findings. Unchanged current
requirements can reuse complete current evidence; changed/split targets need
explicit checks that still prove the full original expectation, plus complete
coverage. Easier replacement, split IDs, accepted exception, task activity and
scope removal never increase that numerator. Current total is the committed
current R set, excluding only authorized deferrals/withdrawals; numerator is
fully passing requirements from the common aggregation. Added requirements,
changes and exceptions are listed separately. Original 18/20 and current 18/18
with two authorized deferrals must agree in report/dashboard/metrics.

Valid: source “Do not retain more than 3 entries” has an exact clause preserving
negation and maximum, a returned independent audit, and a check asserting the
fourth save is rejected. Invalid: “retain entries” maps that span but loses its
limit; a self-authored audit or always-passing check cannot establish completion.
Valid control: disabled save handler causes the unchanged persistence assertion
to fail only in the disposable copy, then restored copy passes. Invalid: change
the assertion to accommodate the broken copy, or call the expected control
failure the main build's latest execution.

## Closure Extension (Verification 3)

Contract 6 requires verification 3. It keeps every verification-2 record and
rule and adds four things a real run lacked: a readiness record that separates
a broken verification setup from a product failure, defects that close
separately from the task that owns them, strategy reviews that stop a repeated
repair strategy, and evidence attribution checked before publication. Contract
5 keeps verification 2 and its rules unchanged; no reader upgrades it.

Identifiers follow the same monotonic rule: `RD-N` readiness records, `DF-N`
defects and `SR-N` strategy reviews. A task is still the only unit that becomes
`done`, and only through review; a defect is the unit a bounded repair can
close.

| Entity | Exact fields (a trailing ? means optional) | Owner / publication |
|---|---|---|
| verification-3 record | verification-2 fields plus `version`, `checks[]`, `executions[]`, `decisions[]`, `readiness[]`, `defects[]`, `strategyReviews[]`, `repairAttempts[]`, `inheritedExecutionIds[]`, `inheritedAttemptIds[]` | orchestrator; version 3 only under contract 6 |
| `readiness[]` | `id`, `targetFingerprint`, `executedAt`, `probes[]`, `supersedes?` | build or acceptance, before a broad run; immutable; correction is a superseding record |
| readiness probe | `kind` (`source_identity` / `secrets_excluded` / `autoload` / `bootstrap` / `storage_and_cwd` / `database` / `listener` / `browser` / `write_boundary`), `result` (`passed` / `setup_failed` / `unavailable` / `not_applicable`), `evidenceIds[]`, `limitation?` | probe by trying the capability; captures under `evidence/<RD-N>/` |
| extended `checks[]` | inherited fields plus `readinessProbes?` | plan; the probes this check's result depends on, besides `source_identity` |
| extended `executions[]` | inherited fields plus `readinessId?`, `failureCause?` (`product` / `test` / `setup` / `unavailable_capability`) | executor returns, orchestrator imports; required for every non-inherited execution |
| extended `decisions[]` | inherited fields plus `kind` (adds `limit_increase`), `strategyReviewId?`, `previousLimits?`, `limits?`, `forecast?` | repair; a raise needs the user's exact words |
| `defects[]` | `id`, `parentTaskId`, `rootFindingId`, `findingIds[]`, `causeClass` (`product` / `test` / `contract` / `evidence` / `environment`), `counterexample`, `repairCriteriaCheckIds[]`, `residualParentCriteria[]`, `status` (`open` / `verified` / `superseded`), `verifiedExecutionIds[]`, `supersedes?` | repair, before the attempt that targets it; only `status` and `verifiedExecutionIds` change, once |
| extended `repairAttempts[]` | verification-2 attempt fields plus `outcome` (`defect_verified` / `still_failing` / `unavailable` / `prerequisite_blocked`), `defectId`, `repeatKind` (`first` / `same_action_failed` / `different_action_same_cause` / `new_cause_same_surface` / `prerequisite_blocked` / `coordination_correction`), `expectedProgress` (`defect_verified` / `scenario_verified` / `task_closure`), `readyUpstreamTaskIds[]`, `blockingPrerequisites[]`, `unlocksTaskIds[]`, `commit?` | repair; append after result |
| `strategyReviews[]` | `id`, `at`, `trigger` (`batch_without_closure` / `same_cause_survived` / `budget_exhausted` / `limit_request`), `attemptIds[]`, `closedTaskIds[]`, `answers`, `decision` (`change_strategy` / `stop_incomplete` / `request_limit`), `nextApproach`, `dispatchId`, `returnId` | repair; a fresh strategy reviewer's actual return |
| strategy answers | `contractConsistent`, `dependenciesReady`, `environmentEvaluable`, `detectorDistinguishes`, `rootCauseTargeted`, `taskClosable`, `nextChange` | one returned sentence each, never empty |

`inheritedExecutionIds[]` and `inheritedAttemptIds[]` name the executions and
repair attempts carried verbatim from verification 2 when a contract-5 run
resumes as contract 6. They are empty for a run begun under contract 6, frozen
once published, and must equal the prior record's IDs exactly at the resume
write. The rules below that demand a new field skip exactly these records and
nothing else, so history stays readable without inventing readiness or defects
it never had.

A repeated attempt — one with a `predecessorId`, not named in
`inheritedAttemptIds` — carries its diagnosis as labelled lines inside the
existing `diagnosis` string; no field is added and the contract version does
not move. The labels are fixed English tokens; any other line is free prose:

```
H1: <cause> — falsified by: <observation>
H2: <cause> — falsified by: <observation>
H3: <cause> — falsified by: <observation>
Probe: <the cheapest probe that tells them apart> — result: <what it showed>
Reproduction: <the minimised reproduction>
Seam: <where the regression check sits>      (or)      noCorrectSeam: <why none exists>
```

The closure rules refuse the attempt unless: three to five `H` lines are
numbered `H1` to `Hn` in order; each has a cause and a non-empty
`falsified by:`; no two causes are the same; there is exactly one non-empty
`Probe:`, one `Reproduction:`, and one of `Seam:` or `noCorrectSeam:`; and the
attempt's `hypothesis` is one of the `H` causes, written as its line writes it.
`DIAGNOSIS_HYPOTHESES` in `tools/runtime/state/closure.mts` is the one home of
the three-to-five bound. A first attempt and every verification-2 attempt keep
a prose diagnosis. Only the shape is held: whether the probe was the cheapest
or the reproduction minimal is judgement.

### Readiness

1. A readiness record names the candidate it probed in `targetFingerprint`.
   Probe kinds are unique within a record. `setup_failed` and `unavailable`
   carry a limitation; `passed` carries evidence. A record is immutable; a
   corrected setup is a new record that `supersedes` it, with at most one
   successor.
2. Every non-inherited execution names `readinessId`, an unsuperseded record
   whose `targetFingerprint.build` and `targetFingerprint.runtime` equal the
   execution fingerprint's. A runtime label copied from history therefore
   cannot be published against a fresh candidate.
3. The probes an execution depends on are `source_identity` plus its check's
   `readinessProbes`. Any of them `setup_failed` rejects the execution: the
   coordinator corrects the setup and probes again, and no repair attempt is
   spent. Any of them `unavailable` forces the execution to `unavailable` with
   `failureCause: unavailable_capability`. A required probe that is absent or
   `not_applicable` rejects the execution. A check that declares no `database`
   probe proceeds while the database is unavailable — independence is a
   declaration the plan makes and review can contest.
4. `failed` and `unavailable` executions carry `failureCause`; `passed` never
   does. `failed` takes `product`, `test` or `setup`; `unavailable` takes
   `unavailable_capability` or `setup`.

### Defects, Attempts and Strategy Reviews

1. A defect belongs to one parent task and one stable root finding. Its
   `findingIds` resolve to that root. Splitting a broad defect appends
   successors that `supersede` it under the same root, so the root's attempt
   count is inherited and never reset. An `environment` defect never receives a
   repair attempt: setup is corrected at readiness.
2. A defect becomes `verified` only with passed executions of its repair-criteria
   checks, current at the write that verifies it, and a passed negative control
   for each of those checks. Verification never moves its parent task. A task
   with an open defect cannot be `done`.
3. Every non-inherited attempt names a defect of its root and of its own task.
   `repeatKind` is `first` exactly when there is no predecessor. `defect_verified`
   requires the defect verified and a `commit` listed in the task's `commits`.
   `prerequisite_blocked` names open tasks or defects in `blockingPrerequisites`.
   `expectedProgress: task_closure` is refused while the defect lists residual
   parent criteria or blocking prerequisites, and, at the write that appends
   the attempt, while any `blockedBy` task of its task is not `review` or
   `done`. `readyUpstreamTaskIds` are in
   `review` or `done` at the write that appends the attempt.
4. Measured by `at`, the attempts since the latest strategy review form a batch.
   When a batch holds two or more attempts and no task reached `done` since its
   first attempt, or any of its attempts is a `same_action_failed` or
   `different_action_same_cause` repeat, the next attempt requires a newer
   strategy review. A review after `stop_incomplete` admits no later attempt.
   Dispatch and return identities are required and never reused.
5. When attempts reach the total limit, a `budget_exhausted` review follows
   before a stopped closure. A raise follows a `request_limit` review and a
   `limit_increase` decision whose previous limits equal the published ones;
   the per-root limit never moves.

### Attribution and Dispatch

1. An execution whose `executor` names a task must name the check's
   `executionTaskId`; role executors keep their role identities. A superseded
   execution has at most one successor.
2. An attempt's `commit` is one of its task's `commits`. Review input is the
   ordered union of exactly those commits, never a range that can carry a
   foreign commit.
3. A task moves to `running` only when every `blockedBy` task is `review` or
   `done`; a blocker in `queued`, `running`, `repair` or `failed` holds it. A
   task leaves `repair` for `running` only when no prerequisite named by its
   latest blocked attempt is still open.
4. An executor returns each check result as one `maestro-execution-return/1`
   block: check ID, result, invocation, actual exit code, tool and host
   identity, readiness ID, fingerprint, assertions, its red run, captures with
   hashes, commit, and the failure cause of a failed or unavailable result. The
   result is `passed`, `failed` or `unavailable`. A skipped or pending test is
   `unavailable` with cause `setup` or `unavailable_capability`, never
   `passed`. It never assigns an execution ID; the orchestrator does at import.
5. A repaired task's review answers two questions separately: is the defect
   verified against its repair criteria, and which parent criteria remain. The
   task becomes `done` only when no open defect and no residual criterion
   remains. Review input lists every path the task's commits touched outside
   its owned files instead of filtering them away.
6. A detector qualifies before its pass counts: every required check an
   executor writes is seen failing on one of its named assertions before the
   implementation lands, against a stub of its Test surface signature or the
   base (its red run); a repair's follow-up check fails on the counterexample
   at the parent commit and passes after restore; a test-framework exception
   is never the expected domain failure; the default runner discovers the
   file and the file holds the claimed suites; the harness forwards every
   required parameter and the capture key carries route, locale, viewport and
   state; goldens come only from the reference origin. Rules 4–6 are procedure,
   held by review and the bundle's verification procedures; the validator holds
   rules 1–3. It can check that an attempt's commit is among its task's
   commits, but not that `commits` lists every commit an executor returned:
   the state never holds the executor's return, so that comparison is the
   orchestrator's before review dispatch. The same is why the red run lives in
   the return and not in the state. The block's shape, the red run included,
   is held by `scripts/gates/execution-return.ts` against the template the
   executor brief ships. Whether the red run truly preceded the implementation,
   and whether an assertion recomputes it, is review's to judge.

Valid: a readiness record shows `bootstrap: setup_failed` because the
verification copy denied its own root; the coordinator allows the copy's root,
appends `RD-2` that supersedes it, and the broad suite publishes against `RD-2`.
Invalid: 2148 identical bootstrap errors published as a failed suite against
`RD-1`. Valid: `DF-3` (authentication text translated after mount) is verified
by its two checks and their controls while task 12 stays `repair` with three
residual criteria. Invalid: a ninth attempt appended after eight that closed no
task, with no strategy review between them.

## Evidence Identity and Currentness

Each execution fingerprints only its declared relevant reference revision,
source/build inputs (including dirty files and generated assets), fixture/data
snapshot, runtime configuration, and acceptance input set. Record viewport,
locale, authentication variant, invocation, tool version or identity, host,
timestamp, assertions, capture paths and hashes. Never store credentials or
sensitive session contents. A reference observation identifies the oracle;
an execution identifies what happened in the candidate build. Neither a hash
nor a screenshot alone asserts correctness.

`relevantPaths` and `inputHashes` pair each declared project-relative input
with its SHA-256. The filesystem validator recomputes these hashes when the
candidate is read or published. The current fingerprint lives on each check;
the execution carries the fingerprint it actually used.

A changed oracle or widened ignore mask creates a new check ID with
`supersedes` and an explicit `oracleChangeBasis` or `basisDecisionId`; the prior check remains in history. An
existing check's oracle, procedure, and mask are immutable across published
snapshots. A baseline or mask change without recorded authorization is rejected.

Specification publishes checks before tasks exist. While the run is active,
Plan is unfinished and G3 has not passed, previously empty ownership fields may
be filled once: an obligation's `implementationTaskIds`/`checkIds`, and a
check's absent `executionTaskId`/empty `integrationDependencies`. This exception
requires no execution for that check or obligation. Populated fields, all
semantic expectations/oracles and execution history remain immutable. Once G3
passes, Plan finishes or execution exists, later graph changes use explicit
superseding records rather than rewriting ownership.

An evidence path must remain inside the run's evidence directory, name an
existing immutable file, and match its stored SHA-256. A missing file or a
changed relevant fingerprint makes its execution stale. A changed shared CSS/JS
asset invalidates checks that depend on it across represented variants. An
unrelated file change does not. A changed additions block invalidates the
acceptance input digest and affected readers/checks. Record the basis for a
changed expected baseline or broader mask before rechecking; tuning either to
make a failure disappear is invalid. The validator checks declared dependencies
and integrity; independent execution and review judge whether declarations and
assertions are substantively adequate.

## Aggregation

Planning `requirements[].status` remains `open`, `in-spec`, `deferred`,
`dropped`, or `placeholder`; it is never a verification verdict. An applicable
check's effective result is its latest unsuperseded execution for the current
target and matching fingerprint: `not_run`, `passed`, `failed`, `unavailable`,
or `stale`. Preserve prior executions and supersession links. A reader's omitted
result is `not_run`, never a pass.

For each active obligation, an open substantiated contradicting finding or a
current failed check makes the result `failed`. Otherwise every required
applicable check must currently pass and there must be at least one such check;
missing, unavailable, stale, and not-run checks make it `incomplete`. Report
all failed and incomplete checks together, even when failure determines the
headline. An obligation marked `unresolved` at discovery is incomplete until
its expectation and coverage are resolved with evidence.

A committed requirement is `passed` only when it has applicable obligations,
every one passes, its current coverage review is complete, and no open
contradicting finding remains. An explicit non-UI obligation and check satisfy
this rule for backend/document work. A requirement is `failed` when any active
obligation or substantiated finding fails; otherwise it is `incomplete`.
`placeholder` identifies a missing production value; only the affected
obligation is incomplete. It never exempts sibling obligations.

G4 uses the same current results: any failure gives `failed`; otherwise any
incomplete requirement, missing acceptance round, stale acceptance input, or
unfinished promised work gives `pending`; only full current coverage gives
`passed`. `gates[].findings` remain display strings, with structured finding IDs
in verification records. The acceptance round, report rows, dashboard and
metrics derive from the same records; their stored projections must agree.
Stage `done` and task activity do not alter conformance.

## Decisions, Repair, and Closure

A coverage omission under an existing requirement is repaired by adding its
obligation/check and task ownership, invalidating affected earlier passes, and
re-executing affected checks. It is not new user scope. An actual user scope
change creates a `scope_amendment` with the old and new target revisions and
exact authorization; the previous target and evidence remain in history.

An `accepted_exception` records the exact displayed finding/incomplete
obligation set, the user's selection, and provenance. “All” resolves against
that displayed snapshot. It does not cover a later finding or another gap under
the same requirement. The observed failure remains failed. “Continue” or “run
acceptance” is not an exception decision. Repair attempts are counted by stable
failure identity, with a finite overall budget; renaming a finding does not
reset it. Exhaustion leaves an unresolved result.

Contract-4–6 `lifecycle` is `active` or `closed`. Active state has no `outcome` or
`finishedAt`. Closed state has `finishedAt` as closure time and exactly one
outcome: `completed` requires G4 passed and all promised work done;
`closed_with_exceptions` requires an explicit bounded user decision covering
every remaining failed/incomplete item while retaining technical results; and
`stopped_incomplete` requires a reason. A promised acceptance round must happen
or be explicitly changed by the user before closure. A phase may finish while
G4 fails. Closure never converts that failure into a pass.

### State examples

| Case | Lifecycle / outcome | Verification and G4 |
|---|---|---|
| Verified delivery | `closed` / `completed` | All active obligations and coverage reviews pass; fresh acceptance round; G4 `passed`; promises done. |
| Accepted residual defect | `closed` / `closed_with_exceptions` | Failed check and G4 `failed` remain; exact outstanding IDs are selected in a user decision. |
| Stopped run | `closed` / `stopped_incomplete` | G4 `failed` or `pending`; reason names unavailable prerequisite, user stop, or exhausted budget. |
| Active work | `active` / no outcome | Incomplete checks and G4 `pending` are valid while work continues. |
| Non-UI change | `closed` / `completed` | A document/API obligation has an owned non-UI check with fresh output evidence and complete coverage review. |
| Legacy finished state | No contract-4 lifecycle/outcome | Preserve original fields; show “verification not established,” including any historical failed G4. |

## Runtime and Compatibility Boundary

Contract versions 1–3 remain readable without rewriting or fabricating
evidence. Their `finishedAt` is historical activity, not a version-4
`completed` outcome. A resumed historical run explicitly constructs a new
contract-6 candidate from current sources, fresh source audit/agreement and obligations, open findings, stale evidence,
and promised work; fresh checks are required to complete it.

The shipped TypeScript helper validates a complete candidate before atomically
publishing `state.js`. It may inspect declared evidence files and relevant
fingerprint inputs, but cannot execute checks, invent records, select decisions,
or author transitions. It rechecks the expected revision and holder at
publication; the existing optimistic stamp comparison is not a lock. An
invalid candidate leaves an accessible diagnostic that names its revision and
suppresses an old success display, including on first startup. The dashboard
reads the coherent snapshot and validation envelope only.

Use structured, configurable stderr logs: INFO for lifecycle, acceptance round,
and publication transitions; WARN for unavailable/stale/legacy evidence; ERROR
for rejected completion and invalid record references; DEBUG for affected IDs
and nonsecret fingerprints. Machine-readable stdout remains parseable.

## Invariant Ownership

| Invariants | Enforcement and behavioral proof |
|---|---|
| M01–M03 | Reference register, source coverage map, independent G2 discovery, obligation graph, workflow evaluation. |
| M04–M05 | Current execution/evidence validation and real browser regression. |
| M06 | Neutral raw-reference handoff plus independent acceptance dispatch evaluation. |
| M07–M08 | Union of findings, bounded exception decisions, derived failed/incomplete outcomes. |
| M09 | Explicit lifecycle/outcome/G4 separation in state and consumers. |
| M10 | Relevant fingerprints, capture integrity and stale-evidence regression. |
| M11 | Shipped TypeScript validation before atomic publication. |
| M12 | Missing hover binding fails with the original oracle, then passes after repair; negative bypass controls and positive runs. |

Runtime diagnostics use the shared configurable logger on stderr. LOG_LEVEL
selects INFO/WARN/ERROR or diagnostic DEBUG; MAESTRO_SYNC_DEBUG=1 retains
compatibility debug control. JSON action stdout contains one parseable result.
Logs name safe paths, affected fields and counts, never state/source bodies,
evidence content or holder credentials. The autonomous TypeScript helper and
repository consumers share schema, evidence and transition implementations;
installed-copy tests establish execution independence rather than comparing a
shared function to itself.
