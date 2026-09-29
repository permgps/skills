# Verification Record Procedure

Open this file when writing obligations, checks, executions, findings, or
acceptance rounds. The exact fields and result rules are in the bundled
contract-4 state shape described by `docs/spec/verification.md` in the source
repository; an installed run uses the candidate schema enforced by `sync.py`.

Each live requirement has grounded obligations. Each obligation names its
source, relevant surfaces and variants, the expected observable state, its
implementation owner when implementation is needed, and its required checks.
Each required check names its execution owner, integrated target, procedure,
oracle provenance, prerequisites, and current fingerprint. A source-derived
expectation stays source-derived until a reference execution observes it.

An execution records the exact invocation, tool and host identity, runtime and
fixture conditions, assertions, result, capture IDs, and the fingerprint of
reference, build, data, runtime, acceptance input, and declared relevant files.
The executor writes task-owned captures first. The orchestrator validates paths
and hashes, imports them under `.maestro/<slug>/evidence/<execution-id>/`, then
publishes one coherent candidate with `sync.py --publish`. Never let a task
write the shared state or report a check as passed solely from source inspection.

After a relevant input changes, retain the old execution as history and mark it
stale for the current check. Reuse unaffected evidence only when its declared
dependencies still match. An unavailable tool or reference yields an explicit
limitation and an incomplete affected obligation, while independent checks may
continue. Failed assertions remain failed even if a user later accepts a
bounded exception. Findings from every origin join the same stable-ID set;
resolve them only with a referenced fresh execution or authorized scope change.

The acceptance round records every applicable requirement result and the
derived G4 result. Before closure, compare the round with current additions,
reference identity, target revision, coverage reviews, executions, findings,
and promises. `completed` requires current passing G4. A bounded user
exception may close `closed_with_exceptions` with the failed checks intact.
An explicit stop records `stopped_incomplete` and its reason.
