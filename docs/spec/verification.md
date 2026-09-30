# Verification and Closure

This document defines contract version 5's verification record and preserves
contract 4's historical rules. The source
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

`VerificationRecord.version` is `2` for contract 5, and `1` for contract 4.
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
`not-established`. Explicit resume constructs an active v5 candidate, recovers
actual redacted sources, dispatches fresh readers, and reruns affected checks.
Missing original text cannot be invented: keep the baseline absent and explain
the limitation. It cannot establish passing G1 or completed v5 closure.

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
| Budget exhausted | unresolved finding / repair | report both attempts and stable root; stop incomplete or exact authorized exception |
| Current authorized target passes while original does not | two scope measurements / acceptance | may close current target; preserve original deficit and decisions |
| Missing/zero original baseline | not-established / not-applicable progress | show unknown / no ratio; never fabricate 100% |

A renamed finding, split task, new executor or strategy cannot reset per-root or
global counts. Per-finding limit is at most two; total limit is finite and cannot
increase during a run. Independent diagnosis consumes the prior hypothesis,
action, result and evidence. Textual variation alone does not prove novelty.

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

Contract-4/5 `lifecycle` is `active` or `closed`. Active state has no `outcome` or
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
contract-5 candidate from current sources, fresh source audit/agreement and obligations, open findings, stale evidence,
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
