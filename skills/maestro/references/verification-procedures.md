# Executable Verification Procedures

Open only for specification, task planning, execution, review or acceptance that
needs these procedures. Copy relevant instructions into a task handoff; a
subagent must not open phase files or the unrelated specification to execute.
The orchestrator imports returns; this reference never authorizes deployment,
production writes, credential disclosure, reference mutation or viewer takeover.

## Readiness Protocol

Entry: the integrated candidate's fingerprint (build and runtime identity), the
checks about to run with their `readinessProbes`, the project's documented
start/test commands and the variable names (never values) of its settings.
Record readiness before any broad suite, browser run or integrated run, and
again whenever the candidate's build or runtime identity changes. A runtime
label copied from an earlier record is not readiness for a new candidate.

1. Build a disposable source-only verification copy. Copy tracked source and
   test files only; physically omit `.maestro/`, legacy trees such as `old/`,
   private env files, config caches, real credentials and any symlink that
   resolves outside the copy. Write synthetic settings with test values under
   the same variable names. Probe `source_identity` (the copy matches the
   candidate's relevant paths and hashes) and `secrets_excluded` (none of the
   omitted kinds exist in the copy).
2. When the host restricts file access, allow the copy's root rather than
   denying the project root: a deny on the project root makes every probe below
   `setup_failed` for a reason no product change can fix.
3. Probe each remaining kind the checks need by trying it, never by reading a
   config file: `autoload` and `bootstrap` (the documented entry starts),
   `storage_and_cwd` (the working directory and writable storage the app
   expects), `database` (connect, migrate and read a disposable test schema),
   `listener` (bind and answer on an owned local port), `browser` (launch
   headless and load the started page), `write_boundary` (below). A kind no
   check needs is `not_applicable`.
4. `write_boundary`: read-only SQL is not read-only HTTP. Before any check
   drives the app through requests, bound what the app may write: an owned test
   database and owned storage directory inside the copy, nothing shared with a
   development or production instance. Never delete rows you did not create to
   hide a write; an unbounded write is `setup_failed`.
5. Classify every probe. `passed` carries evidence under `evidence/<RD-N>/`.
   `setup_failed` is the coordinator's own setup error: correct it and record a
   new readiness record that supersedes this one — no repair attempt, no `RA-N`,
   no finding against a task. `unavailable` is a capability this host does not
   have: record the limitation and continue the checks that do not declare that
   probe; the ones that do stay `unavailable` with
   `failureCause: unavailable_capability`.
6. Run the broad suite only against an unsuperseded record whose required
   probes passed. When one prerequisite produces many identical errors in a
   run, stop: preserve that run's output, classify its executions with
   `failureCause: setup`, record a superseding readiness record after the fix,
   and do not repeat the broad run until readiness passes. A product failure —
   the setup is ready and the assertion still fails — goes through the repair
   door with `failureCause: product` or `test`.

Output: RD-N with id, targetFingerprint, executedAt, probes [{kind, result,
evidenceIds, limitation?}] and supersedes when it corrects a record; then
every execution returns readinessId and, for failed or unavailable results,
failureCause.

Valid: bootstrap fails because the copy omitted a generated autoloader; the
coordinator regenerates it in the copy, records RD-2 superseding RD-1, and the
broad suite then fails only one assertion, which becomes a product finding.
Invalid: the same bootstrap failure is filed as forty product findings, a
repair attempt is spent on it, the broad suite is re-run unchanged, or test
rows the app wrote into a shared database are deleted to make the next run
look clean. Next action: a passed record lets journeys and controls run; an
unavailable probe leaves its dependent checks incomplete for acceptance.

Logs: INFO the readiness verdict with RD-N and counts per result; WARN each
`unavailable` probe with its kind; ERROR each `setup_failed` probe with its
kind. Never log a setting's value, a credential or a connection string.

## Journey Protocol

Entry: requested observable outcomes, existing R/O/C IDs, fixture/variants and
implementation ownership. A journey tests a cross-feature transition, not a
list of unrelated unit tests. Add clean startup for a runnable app, restart for
promised retained data, real integration for a promised real integration.
A document/prototype gets proportional checks and no invented deployment work.

1. Write the initial fixture and exact setup/reset command using safe test data.
2. Enumerate ordered actions and observations; assign an assertion name to every
   step. Include failure/interrupt variants implied by the requested outcome.
3. Allocate J-N; record requirementIds, obligationIds, checkIds, fixture,
   variantIds, steps [{action, assertion}], integrationDependencies,
   executionTaskId, targetRevision, reset and cleanup. Empty check set is invalid.
4. Link ordinary required checks with matching owner/obligations/dependencies.
   Their procedure includes the ordered actions. A verification-only task waits
   until all implementation dependencies are reviewed and integrated.
5. Put the whole setup, commands, actions/assertions, source oracle, relevant
   paths/hashes, invocation, runtime/variant identity and cleanup in its task.
6. Execute on the integrated candidate. Capture each named observation; return
   ordinary CheckExecution with assertions whose names cover all journey steps.
   Capture the before/after restart states; a page reload alone does not prove
   persistence across a process restart when restart persistence is requested.
7. Failed observation → failed execution and owning-task finding. Missing tool,
   data, service or value → unavailable with limitation; independent checks may
   continue. Missing assertion → incomplete, never a unit-test substitution.

Return fields: checkId, obligationIds, result, fingerprint (reference/build/data/
runtime/acceptanceInput/relevantPaths/inputHashes), invocation, tool, host,
executor, executedAt, assertions [{name,result,evidenceIds}], evidenceIds,
task-local captures [{id,path,sha256,mediaType,capturedAt}], optional limitation.
The executor returns these as one `format: maestro-execution-return/1` block
per check, adding the actual exit code, readinessId, its `red:` run, commit and,
for a failed or unavailable result, failureCause; the executor brief's template
is the one shape. It never invents an execution ID. The
orchestrator assigns execution IDs and seals captures before publication.

Valid: save → stop owned server/process → start by documented command → reopen
shows the same entries with captures at every step. Invalid: save/read unit
functions pass while the restart loses data, or sandbox pass claimed as actual
production integration readiness. Missing real service stays unavailable; use
variable names only and follow S2/S4 before any irreversible external action.
Exit: return actual results, stop owned servers and remove disposable fixture
state; review then fresh acceptance decides completion.

## Selective Negative-Control Protocol

Entry: selected required check C ID with one declared basis (user_condition,
acceptance_critical, severe_defect), explained applicability, a safe named defect,
unchanged assertion/oracle, and isolated disposable workspace. Never control
every test by default. A selected control cannot be silently skipped.

1. Allocate NC-N with checkId, targetRevision, selectionBasis, applicability,
   defect, expectedAssertion, isolationFingerprint, mainFingerprint,
   oracleDigest, result not_run and runs []. Hash compact UTF-8 JSON
   [check.procedure, check.oracle, check.ignoreMask or []] for oracleDigest.
   Fingerprint declared main inputs; isolationFingerprint identifies a distinct
   disposable root and fixture. Source/oracle/reference/masks stay immutable.
2. Copy the integrated candidate into the disposable workspace; use safe test
   data and owned local servers. If no isolation/tool exists, append unavailable
   outcome with limitation and stop this control, leaving affected work incomplete.
3. Run the unchanged check on clean copy; require passed assertions and captures.
4. Apply exactly one named defect in owned implementation files on that copy.
   Example: disable save binding. Do not alter assertions, expected output,
   baseline, source authority, production data, or ignore masks.
5. Run the same invocation/oracle; require expectedAssertion to fail, with actual
   capture. An always-passing test is a failed detector, not successful control.
6. Restore the copy from clean inputs, run the same check, require pass, and prove
   clean/restored fingerprint matches the original main input set. Rehash main
   files before/after; any change is an ERROR and invalidates the control.
7. Return fields: separate control runs in clean/mutated/restored order. Each has id,
   phase, result, oracleDigest, assertions, evidenceIds, executedAt, executor,
   invocation and fingerprint. Mutated build fingerprint must differ; capture
   paths use evidence/<control-run-id>/ and IDs never collide with production.
8. Orchestrator seals captures and appends superseding NC record. Keep selection
   and prior results immutable. Passed requires clean/restored pass and expected
   mutated failure. Missed detection → failed plus findingId linking check-quality
   finding; fix the check via its owner, then run new controls. Unavailable →
   limitation and incomplete. Never append control runs to normal executions.

Detector qualification, for every required check an executor writes, every
repair's follow-up checks and every check a control selects. A check an
executor writes is seen failing on one of its named assertions before the
implementation lands, against a stub of its Test surface signature or the base:
its red run. A repair's red run is the counterexample at the parent commit; the
check fails on the counterexample, then passes once the repair is restored
(fail → restore → pass). A test-framework exception —
assertion error, timeout, harness crash — is never caught as the expected domain
failure. Confirm the default runner discovers the file and that the file holds
the suites the result claims. Confirm the harness forwards every required
parameter and that the capture key carries route, locale, viewport and state, so
variants never share a capture. Goldens and expected images come only from the
reference origin, never from the candidate build.

Valid: disabled handler fails the unchanged “retained after restart” assertion,
then restored copy passes and main fingerprint is unchanged. Invalid: loosen the
assertion to pass the broken copy, edit a reference, report failed mutation as
latest production failure, or delete the selected control to obtain green G4.
Exit: clean up owned disposable root/servers; preserve sealed results. A failed
or unavailable selected control blocks affected coverage until fresh proof.

## Logs And Return Discipline

INFO: journey step/control phase/import IDs and result. WARN: missing capability,
stale fingerprint or unavailable integration. ERROR: failed assertion, changed
main identity or invalid evidence. DEBUG: safe fixture/digest/command identity,
never credentials or raw user text. No summary you author substitutes for an
actual independent/executor return. Missing return stays incomplete. A return
that is not one `maestro-execution-return/1` block per check, or whose commit
is not among the таск's commits, is not imported. Nor is a block with no red
run and no allowed `red: not applicable`, or a skipped or pending test reported
as `passed`: that test is `unavailable` with its cause. INFO the review verdict of a
repaired таск with `{ defectVerified, residualCount }`; WARN a detector that
fails qualification.
