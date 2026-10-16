# Intermittent Repair Evidence

Open only after observing both a pass and a failure of the same check under the
same build and conditions. A flaky label alone is not evidence. This procedure
adds no capability, viewer, package installation or repair allowance. Under
verification 1/2 do not write verification-3 fields: retain captures, report the
limitation and keep the intermittent repair incomplete.

## Before Further Diagnosis

Preserve the original triggering workload. Record the runnable symptom check,
controllable seed, schedule/interleaving or captured-input replay, environment,
reset, observed failures/sample count and explicit finite run/time limits in a
sanitized conditions capture. Prefer deterministic replay; if control is not
possible, record the observed rate and what varies. Spend this budget on any
minimization/probes too. Do not begin an unbounded search for a failing seed.
If the minimized check does not yet exist, dispatch the owning executor once
with an explicit bounded preparation brief, before the series plan. Supply the
original captures, remaining reproduction limits, owned paths and this procedure
in the task's allowed References. It may create the symptom/replay checks and
minimize the input within those limits; it must not fix the implementation or
run a candidate. It returns every preparation probe as an ordinary execution
block, with conditions and consumed run/time counts, then stops. The coordinator
imports these captures and registers the checks; preserve ordinary ownership,
coverage/G3 and intake rules. One preparation dispatch, no automatic retry;
insufficient budget/capability leaves the repair incomplete. This is available
on the first intermittent repair; the independent diagnostician remains the
existing route for repeated repairs. Preparation is verification work and does
not reset or raise the repair budget.

Keep the original case even when a smaller case fails reliably. If the budget
cannot establish a runnable minimized case, stop incomplete.

## Declare The Series Before Running It

The coordinator publishes observations and conditions captures, then a separate
`verification.intermittentRepairs[]` entry before any baseline/candidate sample.
The entry contains:

- `id`, stable `rootFindingId`, `declaredAt`, `observedExecutionIds` containing
  the original mixed outcomes, and optional `supersedes` for one prior plan
  under this root. Use fresh IDs; never branch a plan chain.
- Exactly two `scenarios`: `role: original` and `role: minimized`, with distinct
  required `checkId`s covering the finding, `sampleCount` >= 2, exact `invocation`
  and `conditionsEvidenceId`. Preserve the original invocation. Checks and
  condition captures already exist. Captures include seeds/schedules, inputs,
  reset and environment; no secret values.
- `maxRuns`, exactly twice the sum of both sample counts (baseline + candidate),
  and positive `maxDurationMs` for total execution time across all four series.
  Choose counts and remaining time within the budget recorded before diagnosis.
  If the remaining budget cannot cover them, stop incomplete.

The executor gets the published plan and only its owned checks, conditions and
input captures. Include this procedure in the task References or embed its
applicable instructions in the brief; no phase/spec files are supplied. It runs each scenario's baseline series on the triggering build,
keeping every sample and observing at least one symptom failure in each. Import
and publish both complete baselines before candidate dispatch. Baselines that
never reproduce the symptom leave the repair incomplete. Diagnosis novelty,
readiness and selected negative controls remain required where already applicable.

After the repair, replay both scenarios for exactly the declared sample counts.
Within each scenario keep invocation, reference/data/runtime/acceptance identity
and viewport/locale/auth variant comparable to baseline; build/source hashes
may change. Each series uses one build. No cherry-picking seeds, dropping failed
samples or rerunning just until green. Stop when the shared time/run budget is
spent; retain the last timed-out result with its limitation. A new candidate
needs a successor plan and the existing repair-budget route. Resampling the same
candidate build through a new plan is refused.

## Return And Import Every Sample

Return an ordinary `maestro-execution-return/1` block per sample, with the actual
assertions, captures, result and red-run/readiness fields. Add all five scalar
labels together (these example values identify one sample):

```text
intermittentPlanId: IP-1
intermittentScenario: original
intermittentPhase: candidate
intermittentSample: 1
intermittentElapsedMs: 25
```

Use `baseline` or `candidate`, `original` or `minimized`, consecutive positive
sample ordinals starting at 1 within each series, and nonnegative elapsed
milliseconds. For a timeout or unavailable capability return `unavailable` with
the existing cause/limitation; do not turn it into a pass. The coordinator runs
the ordinary `--returns-check` command and maps the labels to execution
`intermittent: { planId, scenario, phase, sample, elapsedMs }`. Assign a unique
execution ID and capture directory to every sample. Publish complete candidates
through the ordinary helper; it checks evidence and never executes the tests.

## Close Only With Both Workloads

Both candidate series must be complete, current and entirely passing within the
budget. Keep every failed execution. A later failure on the same check/build
invalidates the series even if the return omitted its series labels. One later
green cannot restore it. The resolving execution is the final candidate sample
after both series; put the original scenario last if only its check is named by
the finding. A defect names the final current execution of each criterion, not
all the intermediate sample IDs. The helper checks the full series separately.

Review checks replay fidelity, minimization and actual provenance; field shape
cannot prove those judgements. Never hand the diagnosis or producer conclusions
to blind readers. Report observed baseline and candidate failures/counts for
both workloads, their conditions and limitations. Zero failures in a finite
sample is bounded evidence, not proof of impossibility. Partial, unavailable or
stale evidence stays incomplete and follows the existing report/closure route.
