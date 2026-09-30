[← Dashboard](dashboard.md) · [Back to README](../README.md)

# Parity Verification

The version-4/5 run state separates activity, conformance, and closure. A passing
G4 requires current applicable check evidence and complete coverage review.
The historical source change request was recorded at SHA-256
`c9176166ffbf2b520b96ec2b08de45bb8a68aa1008965df97f7af032450d77d1`.
This page records the verification commands and their limits without depending
on the source file's local path.

## Commands

| Command | What it checks | Completion role |
|---|---|---|
| `npm run check` | Types, both specifications and bundles, state/dashboard/host/reader boundaries, and unit/integration tests | Required; copied Node runtime integration tests must execute without skips |
| `npm run parity:browser` | Actual pointer input on an integrated local fixture through installed Chrome/Chromium and CDP | Required for UI parity acceptance; exits 1 on failed assertions and 2 when browser or loopback is unavailable |
| `npm run parity:workflow` | Two isolated targets dispatched to the current Codex CLI configuration with hidden grading truth | Required for independent discovery; exits 2 when agent execution is unavailable |
| `npm run completion:workflow` | Caller-supplied provider-neutral adapter; capability probe, eleven completion scenarios and three fresh omitted-limit runs | Required less-capable-model sample; exits 2 when unconfigured/unavailable |
| `npm run completion:workflow:prepare` | Copies thirteen isolated targets and bounded input conversations | Preparation only; no execution credit |
| `npm run parity:workflow:prepare` | Copies the neutral fixture and skill into isolated targets | Preparation only; never counts as discovery |
| `node scripts/validate/parity-workflow.ts --grade-existing <output-dir>` | Regrades the same isolated targets after saved CLI sessions continue past the unattended deadline | Continuation only; preserves the first result and writes `continued-results.json` |
| `node scripts/validate/completion-workflow.ts --grade-recorded <output-dir>` | Grades saved external-host sessions against their prepared inputs and the same independent browser oracle | Actual sessions only; missing host observations remain explicit failures |

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
digest and this limit. An opaque envelope cannot establish permitted reader
inputs; the grader reports that limitation instead of treating observed reads
as proof of the full handoff. A written claim of independent reading without a real
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

## Node Runtime Migration Checkpoint — 2026-09-30

Maestro now ships `tools/sync.mts` and its complete relative `tools/runtime/`
tree. Canonical state/schema/evidence logic lives in that tree; repository
`scripts/state/*.ts` exports retain their existing APIs. The Python helper has
been removed. Contract 5, verification 2, digest algorithms and gate semantics
remain unchanged. Python execution results later on this page describe earlier
checkpoints, not this runtime.

The migration was exercised on **macOS with Node v26.8.1**. The final
`npm run check` passed typechecking, all eleven validator runs and **763 tests**,
with zero failures or skips. The targeted copied-runtime,
installation-independence and bundle checks passed **96 tests**. All owned
temporary viewer processes were stopped, updated documentation's relative
file links resolve, and `git diff --check` passed.

The installed-runtime suite exports the actual skill to temporary directories
outside the repository and installs it by copy or link. All six combinations of
installation mode and target package type (absent, CommonJS, ESM) pass with
spaces in paths, another cwd, an empty child PATH, no Python executable, no
target node_modules, compiler, loader or build. It executes read-only validation,
first publication, an expected-revision update, projection and actual loopback
state polling. These operations need no external network. Disabled native
TypeScript stripping fails before creating state, validation or viewer records.

Copied-helper regressions cover immutable history, reordered object keys versus
significant array order, evidence and source audits, strict revision/holder
checks, atomic replacement failures, localized legacy views and opener behavior.
Real Node HTTP tests cover directory isolation, forgotten-record adoption,
restart/collision, foreign-process preservation, path confinement, MIME types,
index fallback, macOS path aliases and startup timeout cleanup. Upgrade tests preserve run history,
viewer/opened records and unrelated files, removing only the obsolete copied
helper after validating its replacement. Legacy ownership is tested through an
injected exact command and a real ready HTTP page without launching Python.

**Limits:** Node 22.18 itself was not available for execution, so the advertised
minimum is not verified by this newer runtime. Linux/Windows execution and real
platform browser opening were not performed; platform argument selection is
covered deterministically with fake openers. A real pre-existing Python server
was not used for adoption. Orphan discovery uses Unix process-table commands
when available and reports its limitation otherwise; normal Node startup/reuse
does not require them. These checks do not complete the pending Codex CLI/app,
Gemini or less-capable-model workflow acceptance recorded below, and no release
was published.

## Codex Compatibility Checkpoint — 2026-09-30

The shared runtime uses `.agents/skills/maestro` for CLI/app discovery and native
fresh-context delegation. Default `parity:workflow` retains its direct-path
entry. Discovery-based evaluation installs the actual current bundle and sends
`$maestro` with no `SKILL.md` path:

```bash
node scripts/validate/parity-workflow.ts --run --entry installed-copy --scenario fixed
node scripts/validate/parity-workflow.ts --run --entry installed-link --scenario fixed
```

Omit `--scenario fixed` to run both inherited broken/fixed controls. Selecting
one scenario establishes only that scenario, not the previous plan's full
matrix. `--prepare` creates targets only. `--entry direct` preserves the old
invocation mode; installed-link points to the actual development bundle.
Copies and symlinks retain skill-relative helper/assets/references. On macOS
cross-directory links use canonical parent paths so `/var` aliases do not break
their relative destination. The evaluator never installs clients or credentials.

Deterministic checks verify canonical discovery, safe links, demand loading,
explicit delegation, fresh contexts and returned readers. A spawn-call completion
alone is not a child final return. Blind acceptance needs a visible actual
handoff with a `Handoff Inputs` table; prohibited paths/read observations and
opaque envelopes fail the evidence gate. These are parser/structure checks,
not proof of a live complete run.

| Client / configuration | Discovery / execution | Support |
|---|---|---|
| Codex CLI 0.159.2 / observed gpt-6.1-sol, installed-copy | Discovered entry and returned probe/audit/readers; 900023 ms timeout in specification, G1 passed and G2–G4 pending | unverified; no complete run |
| Codex CLI 0.159.2 / observed gpt-6.1-sol, installed-link | Discovered entry and returned probe/audit/readers; 900030 ms timeout in planning, G1/G2 passed and G3/G4 pending | unverified; no complete run |
| Codex app | Separate fresh discovery/full-run entry unavailable through the current authorized tools | unverified; CLI evidence does not transfer |

Both fresh CLI commands exited **2** on the configured 900000 ms deadline.
The independent initial browser oracle passed for the reference and fixed
starter in both targets. The helper published coherent snapshots and rendered
dashboards; the link run also observed page-text movement across a 1.2-second
sample. That broad text sample is not a narrow clock-only assertion. No executor
wave, G4, final report or memory closure was reached. G1/G2 statuses above are
what the published run recorded, not an independent certification of hidden
input envelopes. Saved dispatches expose `fork_turns: "none"` and actual final
returns, but encrypt handoff text: exact permitted input visibility remains
unverified. The grader does not credit an opaque envelope as a bounded reading.

The copy target was `maestro-parity-workflow-wF3o1J/fixed`; the fresh corrected
link target was `maestro-parity-workflow-GTmzvM/fixed`, both under the system
temporary directory with original `results.json` and host transcripts retained.
An earlier link target (`maestro-parity-workflow-Xldpx7/fixed`) was stopped
because its evaluator-created relative symlink was broken by the macOS `/var`
alias; it is not credited as discovery or a complete run. Corrected-link tests
and the fresh target establish the fix. Only owned test viewers/browser
processes and probe worktrees were stopped or removed.

Observed discovery here means skill-relative router or entry-phase reading
after explicit `$maestro` invocation. A client can inject `SKILL.md` at selection
without a shell read, so entry-phase reading also establishes observed routing.
This does not certify a visible skill selector or make opaque role inputs visible.

`npm run check` passed on this unrestricted working tree with 739 tests, zero
failures and zero skips; Python 3.14.7 ran the copied-helper integration tests.
The pre-change baseline passed 727 tests. New link and dispatch regressions
failed before their implementation and pass afterwards.

A separate native two-task probe used two actual git worktrees and two fresh
children (`fork_turns: "none"`), `/root/codex_worktree_probe_one` and
`/root/codex_worktree_probe_two`. Both returned the actual input token and
workspace; their distinct commits changed only their assigned files. Both were
integrated into the owned temporary repository and the worktrees removed.
This establishes the observed mechanism in the current session, not app support
or a complete Maestro run.

The original fast plan's unfinished less-capable-model samples and broader
installed-bundle acceptance remain open. Gemini's previous verification status
is unchanged. Runtime evidence stays in owned temporary targets, not committed
run artifacts.

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

## Completion Extension Verification

Contract 5/verification 2 adds source/audit/baseline identity, integrated journeys,
selected isolated controls, stable repair diagnosis, and separate scope progress.
Structural validators check declared fields and procedure scaffolding. Actual
independent inventory completeness and substantive strategy changes require
workflow evidence; synthetic receipts in unit fixtures do not establish either.

The common valid twenty-requirement fixture is tested through TypeScript,
copied Python, and the dashboard: original 18/20, current 18/18. Controls/journeys
also share deterministic verdict tests. The real browser suite now runs save →
full browser restart → reopen in an owned profile, plus disabled-save and
volatile-only variants, then restores the same oracle and verifies the main
fixture identity. These are controlled fixture observations, not a reliability
claim about runtime agents or production integrations.

Historical v4 conformance remains meaningful; new safeguards read unestablished.
An explicit v5 resume begins with pending gates and no inferred independent
audit/agreement. Original missing source cannot be fabricated.

## Provider-Neutral Agent Adapter

Supply an already authorized host adapter; this repository does not choose a
model, install a client, or create credentials. Both evaluation suites accept:

```bash
npm run completion:workflow -- --adapter /absolute/path/to/adapter.json
npm run parity:workflow -- --adapter /absolute/path/to/adapter.json
```

Focused reruns preserve the full suite's hidden truth and oracle:

```bash
npm run completion:workflow -- --adapter /absolute/path/to/adapter.json --scenario source-limit --repeat 3
```

`--scenario` selects one declared fixture; `--repeat` accepts 1–20 and requires
that selection. A focused sample does not replace the full acceptance matrix.

`MAESTRO_EVAL_ADAPTER` is the equivalent explicit configuration path. The JSON
schema requires `executable`, `argv` (array), `tool`, `model`, `capabilityClass`
(`less-capable` or `current`), `transcript` (`normalized-jsonl` or `codex-json`),
and integer `timeoutMs` (at least 1000). The capability class is the caller's
explicit classification; recorded model identity must match it. A current or
stronger-model result does not satisfy the less-capable-model requirement.

Arguments are passed through `spawn` with `shell:false`. Available literal slots:
`{prompt}`, `{target}`, `{input}`, `{final}`, `{events}`. `{input}` points to JSON
with `target`, `prompt`, and `turns`. Each scheduled turn has `after:"G1"` and
actual user authorization text; the adapter delivers it only after the first G1
agreement so deferrals/relaxation cannot rewrite the baseline. An adapter that
cannot support the conversation leaves those scenarios incomplete.

The neutral adapter emits host-produced JSONL on stdout, not model-authored
receipt JSON. It writes the final answer to `{final}`, or emits a message with
`role:"final"`. Supported normalized events:

| Type | Required observations |
|---|---|
| `session` | actual `contextId`, `tool`, `model` |
| `dispatch` | actual `id`, `parentContextId`, distinct `childContextId`, `forkTurns:"none"`, reader `role`, actual `prompt` and SHA-256 `promptDigest`, `providedInputs` |
| `return` | actual `dispatchId`, `childContextId`, `returnId` |
| `read` | actual child `contextId` and accessed `path` |
| `message` | actual returned `text`, optionally `role:"final"` |

The probe must return two distinct fresh children that actually read a generated
filesystem token and write it back, with observable exact input envelopes.
Missing observed identity/dispatch/return or an opaque child envelope
makes the adapter unavailable. The host also probes the installed browser with
actual clean/mutated/restored restart controls. Transcript output is redacted
before persistence. Raw grader truth is never copied to a target or prompt;
request/authority/bundle identities are protected and actual reads are inspected.
Codex session normalization retains observable dispatch/return/read evidence;
encrypted handoffs that cannot establish exact inputs remain an explicit limit.

The thirteen prepared targets comprise source-limit three times, persistence,
insensitive detector, startup, repeated repair, deferral, relaxed target,
unavailable real integration, repaired control, inherited legacy discovery, and
backend verification. Grading checks published state, actual child receipts,
protected inputs, and final claims. Independent browser probes run against the
final integrated persistence application as well as the inherited menu fixture.
A repeated repair that never occurs does not establish strategy-change coverage;
a completed ordinary task cannot replace that missing scenario evidence.

For an external host, `--grade-recorded` reads caller-owned `sessions.json` in
the evaluation directory. Its `runs` array records `scenario`, `target`,
`inputFile`, `eventsFile`, `finalFile`, `requestedModel`, `agentPath`, and optional
`hostLimitations`. Each input file contains the unchanged preparation result
(`input`, `protectedDigests`, `inputDigest`); each target must be a descendant
of that directory. Events must retain actual host observations in the normalized
format above. Model-authored receipts do not become host attestations. Grading
retains missing/invalid state, missing initial protection hashes, changed authority, unavailable model identity,
and input-envelope limits in `recorded-results.json` rather than crediting them
as a passing session. This path records the host used; it does not claim that
the shell adapter ran.

Each new invocation persists `run-N/prepared.json` before dispatch, including
initial protected identities. Complete UTF-8 stdout lines are redacted and
persisted as they arrive; split credential chunks are buffered until the line is
complete. An interrupted process no longer has to finish to preserve its initial
identity record and received host events. `running` is activity, not completion.

## Execution Checkpoint — 2026-09-30

The inherited workflow command actually started two isolated Codex CLI targets
with the current configuration. Both exited 1 before agent task execution: the
selected model was rejected as unsupported by the account. The suite exited 2.
Results and exact observed identity remain in the temporary evaluation directory
`/var/folders/67/55hlc8mn1956b2qk1hbzkrz80000gn/T/maestro-parity-workflow-3oUpU1`.
These attempts do not establish independent discovery or completion.

The completion workflow command exited 2 because no caller-supplied authorized
adapter/model configuration was available. Its prerequisite record is in
`/var/folders/67/55hlc8mn1956b2qk1hbzkrz80000gn/T/maestro-completion-workflow-RWhp0H`.
Preparation produced thirteen isolated targets in
`/var/folders/67/55hlc8mn1956b2qk1hbzkrz80000gn/T/maestro-completion-workflow-NCV5Q0`;
preparation and deterministic adapter/grader tests do not count as actual model
sessions. These are historical prerequisite failures, not the current host status.

The user subsequently authorized `gpt-6-luna`. Three fresh collaboration-host
runs actually executed in `/tmp/maestro-luna-completion-20260930`. None established
full completion: one stopped at planning, one closed `stopped_incomplete` after a
failed browser check, and one stopped before G1 publication. Independent readers
found omitted source conditions, but this host did not independently expose the
backend model identity or complete raw input envelopes. Its parent-authored event
logs are not normalized host attestations. `recorded-results.json` preserves all
three failed grades and those limitations. A successful browser probe against the
starter or final page alone does not establish completion of the agent workflow.

The runs exposed provisional-manifest, append-only audit-history, planning-owner,
optional-null, and inherited-working-directory problems. Corrections were made in
the owning protocols and validators. A replay of the third run's saved G1
candidate passed through the corrected copied helper while G4 stayed pending;
that replay is not a fresh independent model evaluation.

A separate read-only Codex CLI probe observed `gpt-6-luna` in its host session
record. The caller-owned adapter passes `-m gpt-6-luna` for each invocation without
changing the default model. Its two fresh-child filesystem probe and real browser
controls passed. Three fresh source-limit CLI runs and the full scenario suite
were launched using that adapter. The first full-suite source-limit attempt hit
its 25-minute timeout at planning; the second persistence target reached planning
before the original process session became unavailable. Neither establishes
completion of the thirteen-scenario matrix.

The three additional source-limit runs have recoverable actual host model and
child-dispatch observations, but no persisted terminal transcript or final claim.
Their initial bundle hashes were held in memory by the older harness and were
not preserved before interruption. They remain incomplete:

| Evaluation suffix | Last recorded progress | Limitation |
|---|---|---|
| `8CvBrw` | Build opened; G1–G3 recorded passed | Current source file differs from the published check fingerprint; no fresh passing execution |
| `0Nru1d` | Plan opened; G1–G2 passed; draft audit failed, corrected audit passed | G3/G4 pending; final claim unavailable |
| `2oTauO` | Build opened; G1–G3 passed; draft audit failed, corrected audit passed | Published local dispatch labels do not match host identities; G4 pending |

Each directory is under the system temporary root with prefix
`maestro-completion-workflow-`. Its `recovered-host-observations.json` contains
actual saved-rollout observations and limitations, not a new agent execution or
an invented terminal result. The backend and legacy CLI attempts also hit their
25-minute limits. Legacy publication exposed overlapping stage clocks accepted
by the old copied helper; the owning Python validator now rejects that defect,
gaps, missing/unreadable timestamps and multiple active stages, matching the
TypeScript reader. Historical evaluation targets were not rewritten.
The corrected copied helper also rejected the exact saved legacy state in a
structural replay at `/tmp/maestro-luna-clock-real-replay`; this is rejection
evidence for the observed overlap, not a fresh workflow or passing acceptance.

A stricter actual capability probe in
`/var/folders/67/55hlc8mn1956b2qk1hbzkrz80000gn/T/maestro-completion-workflow-i3ySWe`
observed `gpt-6-luna` and two fresh returned children, but exited 2 because both
saved input envelopes were encrypted. The adapter is unavailable for the required
exact-input attestation; ciphertext is never credited as a plaintext prompt.
The required successful workflow and installed-bundle matrix remain unestablished.

Before the environment restriction changed, `npm run check` passed 725 tests, zero
failures and zero skips, including copied Python execution and all validators.
`npm run parity:browser` also passed; its actual evidence is in
`/var/folders/67/55hlc8mn1956b2qk1hbzkrz80000gn/T/maestro-parity-browser-1Y2i0u`.
These results do not replace the pending actual-agent obligations.

After the stage-clock and durable-transcript fixes, the final managed-environment
check ran 727 tests: 691 passed, 36 failed, zero skipped. Typechecking and all
validators passed. The 36 viewer/publication failures came from prohibited local
port operations (`PermissionError: Operation not permitted`); this is a failed
full check, not a passing or skipped integration run. The new copied-Python stage
clock regression and actual subprocess transcript/timeout regression passed.
Local server/browser publication checks require an environment that permits
their owned loopback operations. No permission or model defaults were changed.

The external historical change-spec file was restored by the user and read on
2026-09-30. Its SHA-256 exactly matches the preserved value
`c9176166ffbf2b520b96ec2b08de45bb8a68aa1008965df97f7af032450d77d1`.
The prior M01–M12/V01–V24 acceptance obligations remain authoritative; verifying
the source identity does not certify the entire installed-bundle matrix.

## See Also

- [Installation and development checks](install.md)
- [Behavior specification](spec/README.md)
- [Dashboard behavior](dashboard.md)
