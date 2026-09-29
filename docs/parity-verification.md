# Parity Verification

The version-4 run state separates activity, conformance, and closure. A passing
G4 requires current applicable check evidence and complete coverage review.
The source change request was verified at SHA-256
`c9176166ffbf2b520b96ec2b08de45bb8a68aa1008965df97f7af032450d77d1`.
This page records the verification commands and their limits without depending
on the source file's local path.

## Commands

| Command | What it checks | Completion role |
|---|---|---|
| `npm run check` | Types, both specifications and bundles, state/dashboard/host/reader boundaries, and unit/integration tests | Required; Python integration tests must actually execute |
| `npm run parity:browser` | Actual pointer input on an integrated local fixture through installed Chrome/Chromium and CDP | Required for UI parity acceptance; exits 1 on failed assertions and 2 when browser or loopback is unavailable |
| `npm run parity:workflow` | Two isolated targets dispatched to the current Codex CLI configuration with hidden grading truth | Required for independent discovery; exits 2 when agent execution is unavailable |
| `npm run parity:workflow:prepare` | Copies the neutral fixture and skill into isolated targets | Preparation only; never counts as discovery |
| `node scripts/validate/parity-workflow.ts --grade-existing <output-dir>` | Regrades the same isolated targets after saved CLI sessions continue past the unattended deadline | Continuation only; preserves the first result and writes `continued-results.json` |

`MAESTRO_BROWSER` may point to an already installed Chrome/Chromium executable.
On macOS, the runner prefers an installed Playwright `chrome-headless-shell` and
passes that choice to the workflow agents; otherwise it uses installed Chrome.
The browser suite does not install one. It serves a credential-free fixture on a
local port and records initial, hover, panel-entry, and exit screenshots with
SHA-256 hashes. It tests a correct reference against missing binding, unmounted
handler, synthetic-only trigger, early close, absent column/promotion/image,
hidden panel, changed shared asset, and failed image resource. The same browser
oracle grades the broken and correct variants. A passing control imports its
captures through the run evidence validator and confirms a changed relevant
input invalidates the capture.

The workflow suite copies the Maestro bundle into each temporary target. The
agent sees a neutral request, `legacy/` authority, and a starter `src/` tree;
the grader's interaction expectation stays in repository tooling. The grader
checks reference registration, interaction discovery, check ownership,
independent coverage, acceptance history, and final state. Its deterministic
grader tests verify the grading rules; they do not count as an agent discovery.
The result retains dispatch events and their digests. Current Codex JSON omits
`spawn_agent` events, so the runner also checks the local saved rollout for
the spawn call, a completed child thread, fresh context, and observed file
access. Codex encrypts the prompt text in that rollout; the result records its
digest and this limit. A written claim of independent reading without a real
child return cannot satisfy that layer.
The CLI uses its current configured model. The runner reads the observed model
from the saved rollout because the JSON event stream does not expose it; if the
rollout is unavailable, the result records that limit rather than guessing.
`MAESTRO_EVAL_MODEL` may record a manually declared label separately.
The target has a fixture-owned `.maestro/config.json` that selects `full` mode
and `normal` explanations so an unattended evaluation does not stop at the
first-run preference question. `MAESTRO_EVAL_TIMEOUT_MS` sets the per-agent
deadline (default: 900000). A timeout is recorded explicitly. The workflow
grader probes both reference and final build with real pointer input; a repaired
starter may pass, while an unfixed menu cannot support a `completed` claim.
The isolated Codex targets use `danger-full-access` because Maestro must bind a
loopback viewer port. The runner sets `MAESTRO_SYNC_NO_OPEN=1` and instructs
agents to pass `--no-open` to the viewer helper. It stops each target's
viewer server after grading. The CLI run is saved locally because its
`--ephemeral` mode cannot provide the child-thread evidence needed for this
evaluation.

## Current Execution Record

On 2026-09-29, `npm run check` passed with 667 tests, zero failures, and zero
skips, including copied Python helper integration. `npm run parity:browser`
passed with Chrome 154 and again with HeadlessChrome 151: the correct menu
passed, all ten broken variants failed the same pointer oracle, the workflow
reference passed, its broken starter failed, and a changed build input
invalidated the old evidence. The earlier
`ENOTEMPTY` teardown failure was corrected by waiting for Chrome to close
before removing its temporary profile. Chrome 154 also produced macOS crash
dialogs when invoked by workflow agents; those agents were stopped and the
headless-shell selection was added before resuming the evaluation.

The earlier workflow attempt timed out after 120 seconds per target before
publishing a run state. The fixture now pins noninteractive dials and allows a
longer, recorded per-agent deadline. In the subsequent 600000 ms run, both
targets reached build and timed out before acceptance. They wrote G2/G3 reader
summaries, but each event trace contained zero agent dispatches; their final
states also failed evidence validation (stale build fingerprints in the broken
target, missing execution-origin evidence in the fixed target). Those summaries
are not independent evidence. The resident skill now explicitly requires a real
dispatch, and the workflow grader inspects dispatch events. A full independent
workflow result is still required before V01/V04 and installed-bundle acceptance
can be credited.

A subsequent diagnostic run exposed two harness problems: ephemeral CLI
sessions prevented child-agent creation, and host constraints in the user prompt
were copied into the target's requirements. The runner now uses saved sessions,
checks actual child rollouts, and places host constraints in target `AGENTS.md`.
The fresh isolated run was stopped before final acceptance to limit evaluation
time. It is not a passing workflow result.

## Acceptance Matrix

| Cases | Current evidence | Required next result |
|---|---|---|
| V01, V04 | The first longer run registered `legacy/` and named the menu but recorded no actual reader dispatch | Demonstrate a separate raw-reference reader in the next workflow run |
| V02–V09 | Real browser suite passed the correct menu and rejected ten broken variants with one oracle | Confirm the generated workflow uses the same evidence rules |
| V10–V15, V20–V24 | Contract, Python candidate, dashboard, report, metrics, and legacy checks passed in `npm run check` | Verify the copied bundle and final user-facing claim end to end |
| V16–V19 | Unavailable/stale/additions/dial rules have contract coverage; changed-input invalidation passed in the browser suite | Observe the corresponding agent dispatch and acceptance transitions |

No release claim follows from these partial checks. The implementation plan
retains tasks 11–12 as open until the independent workflow run and
copied-bundle acceptance matrix execute successfully in a capable host.

## See Also

- [Installation and development checks](install.md)
- [Behavior specification](spec/README.md)
- [Dashboard behavior](dashboard.md)
