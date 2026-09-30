# Executable Verification Procedures

Open only for specification, task planning, execution, review or acceptance that
needs these procedures. Copy relevant instructions into a task handoff; a
subagent must not open phase files or the unrelated specification to execute.
The orchestrator imports returns; this reference never authorizes deployment,
production writes, credential disclosure, reference mutation or viewer takeover.

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
The orchestrator assigns execution IDs and seals captures before publication.

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
actual independent/executor return. Missing return stays incomplete.
