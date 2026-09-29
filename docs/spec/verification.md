# Verification and Closure

This document defines contract version 4's verification record. The source
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

`VerificationRecord.version` starts at `1`. Its `targetRevision` changes only
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

Contract-4 `lifecycle` is `active` or `closed`. Active state has no `outcome` or
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
contract-4 candidate from current obligations, open findings, stale evidence,
and promised work; fresh checks are required to complete it.

The shipped Python helper validates a complete candidate before atomically
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
| M11 | Shipped Python validation before atomic publication. |
| M12 | Missing hover binding fails with the original oracle, then passes after repair; negative bypass controls and positive runs. |
