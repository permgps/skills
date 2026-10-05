# Phase 8 — Repair

Read when a таск needs another attempt. It runs outside the sequence, and there
are six doors into it:

| Door | Arrived from | State of the таск | What is known |
|---|---|---|---|
| not-done | Разработка | not `done` — the executor stopped, failed, or returned something incomplete | nothing is committed |
| blocking-review | Ревью | `repair` — the review found a blocking finding | the таск is committed, and the finding names what it contradicts |
| g4-disagreement | Приёмка | `done`, and G4 disagreed about a `R##` it carries | the build is finished and the disagreement is against the манифест |
| recorded-divergence | Разработка, after its last wave | `review` or `done` | a `D##` says a delivered file disagrees with what the build does, and no review or gate will say it again |
| coverage-omission | G2, Ревью, or Приёмка | any relevant task state | a valid existing requirement lacked a grounded obligation, implementation assignment, or executable check |
| startup-defect | Приёмка | any relevant task state | reproducible code startup failure, sanitized error and exact command; unavailable prerequisites use the incomplete path |

The fourth exists because the other three cannot see it. A review judges one
таск against the contract that таск was given; G4 reads the build against the
манифест. A README that describes the build wrongly contradicts neither — so
without this door it is found, written down twice, and shipped.

No mode and no depth changes anything here: a таск that failed failed under
whatever dials the прогон is running, and the two answers this phase chooses
between are the same two in every column.

**A требование the user changes while a retry is running does not enter the
retry** — a retry is given what its door carries and nothing else. It goes
through the briefing phase's procedure, in that phase's order: the additions
block of `brief.md` first, then the run state, then the plan.

`S5` holds here with no softening. You decide what to try again and you write
down what was learned; **an executor writes every line of the code**, including
the one-line fix that looks too small to hand over. That fix is exactly where
the rule earns its keep — the прогон has no record of an edit you made yourself,
and the review that follows will judge it as if an executor had.

<!-- maestro:codex:dispatch -->
On Codex CLI or app, open [the native runtime recipe](../references/codex.md)
before each independent role dispatch in this phase. Use a fresh native child,
the full role prompt and only this role's allowed inputs; observe its actual
final return before importing results. The recipe is coordinator-only.

## Steps

### 1. Read only what the door provides

- From Разработка: the task file, what the executor returned, and the handoff
  if it left one.
- From Ревью: the same, plus the review's blocking finding as it was written.
- From Приёмка: the same, plus the G4 disagreement and the `R##` it names.
- From a recorded divergence: the same, plus the `D##` as it was written, and
  what the таск it depends on actually built — that is what the divergence has
  to be made true against, and it is the reason this door opens after the last
  wave rather than when the row was written.

- From coverage omission: stable finding/root ID, R IDs, missing observation,
  source evidence/provenance, affected obligation/check IDs, implementation/check
  owner and integration dependencies, current fingerprint. Fix missing task
  ownership before dispatch; coverage correction is not new scope.
- From startup defect: exact documented launch command, sanitized error evidence,
  build fingerprint, affected R/check IDs, owning task and prerequisite assessment.
  Distinguish reproducible syntax/import/config code defect from missing external
  tool/service/value. External absence records unavailable and avoids code retries.

Under contract 6, also the таск's open defects, their attempts and strategy
reviews, the latest readiness record, and the status of every таск its
Prerequisites name.

Not `spec.md`, not the манифест, not the other таски. You are deciding about one
таск against the contract it was given, and the withholding that makes a review
worth reading makes a retry worth running.

### 2. Decide: retry, coverage repair, or scope amendment

Three distinct paths preserve the user's contract.

| Answer | Means | Requires |
|---|---|---|
| retry | the таск can be built as specified; the attempt was wrong | nothing beyond the failure itself |
| coverage repair | the existing requirement omitted a behavior, owner, or check | a grounded reference/source observation and stable finding ID; no new user scope |
| scope amendment | the user explicitly changed the target, or demonstrated impossibility needs their decision | exact authorization, old/new target revisions, and the demonstrated fact |

**The test is evidence, not effort.** A signature that cannot exist, a
dependency that does not do what the spec assumed, two требования that
contradict each other — those may need a user-authorized scope amendment.
An omitted menu state is coverage repair: the user already asked for fidelity.
"It was hard", "the executor misread it" and "there is a simpler design" are
retries.

For coverage repair, preserve the original `R##` and prior records. Add the
missing grounded obligation and required check, amend task ownership and
integration dependencies, invalidate affected earlier passes, implement,
execute, review, and rerun affected acceptance and shared-component variants.
Do not rewrite the old oracle or present this correction as new user scope.

**A second reading of the specification is never an amendment.** If the words
were ambiguous, they were ambiguous before anybody built anything; what changed
is only who is inconvenienced by them. Re-reading your way out of a failure is
the shortest route to a build that does something nobody asked for.

### 1a. Split the finding into defects

Entry: a blocking finding, failed check or G4 disagreement against one parent
таск, with its stable root finding and the таск's criteria.
1. Write one `DF-N` per causal defect before any attempt targets it: parent
   таск, root finding, counterexample, cause class (`product`, `test`,
   `contract`, `evidence`, `environment`), the check IDs that verify it
   (repair criteria), and the parent criteria it leaves (residual).
2. A broad defect split later becomes successors that `supersede` it under the
   same root. Splitting keeps history and the root's attempt count; it never
   resets a budget. ERROR on any write that would.
3. An `environment` defect is not repaired: it is setup, corrected through a
   superseding readiness record. A defect that crosses таски goes back to the
   plan-consistency reader, briefed by
   [plan-consistency-reader.md](../prompts/plan-consistency-reader.md) with every
   task file and `interfaces.md`, before any executor.
4. Order repairs: ready upstream first, then by the number of таски the repair
   transitively unlocks. A downstream defect whose upstream prerequisite is
   still open is recorded as an attempt with `outcome: prerequisite_blocked`,
   naming the open таски or defects, and routed to the upstream owner. WARN it.
Output: defects with repair criteria and residual criteria, and an order. A
finding with no reproducible counterexample stays incomplete until one exists.
Valid: one finding «orders page broken» becomes DF-3 (totals use the old DTO)
and DF-4 (empty state never renders), each with its own check. Invalid: one
defect «fix the orders page», or a split that names fresh roots to restart the
count. Next action: brief the first ready repair.

### 2a. Diagnose before repeating a failed repair

Entry: stable root and previous attempt, actual failure evidence and finite
remaining budgets. This protocol runs before every repeated repair dispatch.
1. Follow supersedes to the root finding; read all attempts for that root,
   predecessor, hypothesis/action/outcome and affected check fingerprints.
2. If two attempts or global budget exhausted, report unresolved result and
   both attempts; do not dispatch. New task/name/executor is not a reset.
3. Dispatch [repair-diagnostician.md](../prompts/repair-diagnostician.md) in a
   fresh bounded context with the prior hypothesis/action/result, evidence,
   task/interface/check excerpts, root/predecessor and remaining budgets. It is
   briefed for three to five ranked hypotheses, the probe that tells them
   apart, a minimised reproduction and a seam; the brief says how.
4. Wait for actual return. Accepted novelty needs falsifying evidence and a
   substantively different diagnosis/action. Different text alone is rejected.
   Missing context/return/evidence is unavailable; keep incomplete, no retry.
   **A diagnosis that breaks the brief's text is sent back once**: fewer than
   three hypotheses or more than five, a hypothesis without `falsified by:`, a
   missing `Probe:`, `Reproduction:` or seam line, or a `hypothesis` that is
   none of its `H` causes. Dispatch a fresh diagnostician with the same inputs
   and the list of what was missing. A second return that still breaks it is
   unavailable: keep incomplete, no retry. A send-back spends no repair
   attempt. WARN `repair` `diagnosis sent back` with
   `{ rootFindingId, hypotheses, missing }`, where `missing` names labels,
   never text. The publish that appends an attempt carrying such a diagnosis
   is refused; an attempt published before is never judged again.
5. Use accepted diagnosis in next executor brief: its `hypothesis`, its
   reproduction, and its `Probe:` line when the probe runs first there.
   Hypotheses never reach the user — not in a status line, a question or the
   отчёт; only a `noCorrectSeam:` line travels, as a limitation. Append
   actual attempt RA-N only after return: id, findingId, taskId, at, outcome, rootFindingId,
   predecessorId, hypothesis, diagnosis, evidenceIds, strategy, action,
   followUpCheckIds, diagnosisDispatchId, diagnosisReturnId and novelty accepted.
   First attempt has no predecessor; repeats require actual diagnosis receipts.
6. Fresh fingerprints and check executions return through review and affected
   acceptance, including shared-input variants; repair cannot accept itself.
Valid: minimal reproduction falsifies prior interface hypothesis; next action
verifies exports. Invalid: a single hypothesis, same edit renamed, executor
switched without new hypothesis, root ID changed, or budget increased.
INFO door/diagnosis/strategy/attempt; WARN exhaustion/unavailability/send-back;
ERROR reset/routing; DEBUG safe IDs.

### 2b. Strategy review

Entry: the attempts since the latest strategy review, measured by `at`, the
таски closed since the first of them, and the published repair limits.
1. A review is due before the next attempt when the batch holds two or more
   attempts and no таск reached `done` since its first, or when any attempt in
   it repeated the same action or the same cause (`same_action_failed`,
   `different_action_same_cause`). It is also due when attempts reach the
   total limit (`budget_exhausted`) and before asking for more
   (`limit_request`). The state validator refuses the next attempt without it.
2. Dispatch a fresh subagent briefed by
   [strategy-reviewer.md](../prompts/strategy-reviewer.md) with the defects,
   attempts, readiness records, task statuses and limits — not the executors'
   reasoning. Wait for its actual return; a review you write yourself is not one.
3. Record `SR-N` with its seven answers, one sentence each, and the decision:
   `change_strategy` (next attempt follows the new approach), `stop_incomplete`
   (no later attempt) or `request_limit`. A limit request goes to the user in
   their language with the closure forecast and what changes beyond the count;
   only their exact words authorize a `limit_increase` decision, which raises
   the total and never the per-root limit.
Output: SR-N with trigger, attempts, closed таски, answers, decision, next
approach, dispatch and return IDs. INFO the decision; WARN exhaustion.
Valid: eight attempts closed no таск; the review finds the schema таск still in
repair and decides to close it first. Invalid: a ninth attempt with no review,
a review written by the coordinator, or «raise the limit» with no forecast.
Next action: the attempt the decision allows, or closure as stopped_incomplete.

### 3. If it is a retry — hand it over again

Give the executor its task file, `interfaces.md`, the failure exactly as it came
back, and the handoff if there is one, briefed by
[`../prompts/executor.md`](../prompts/executor.md). Set the таск to `running`
and write the state at that transition.

Under contract 6 the brief is about one defect. It states the defect and its
counterexample, the parent таск, the repair criteria as check IDs, the residual
parent criteria, foreign prerequisites, the expected progress, and a closure
forecast. The defect's `DF-N` is the id the executor tags any temporary
diagnostic output with, `[maestro-debug:DF-N]`; the review phase treats a tag
left in a commit as a blocking finding. Expected progress is `defect_verified`, `scenario_verified` or
`task_closure`, and `task_closure` is never promised while residual criteria
or open prerequisites remain. Append the attempt with its `repeatKind`,
`readyUpstreamTaskIds`, `blockingPrerequisites` and `unlocksTaskIds` only
after the actual return. INFO the defect and its forecast.

**A таск is retried at most twice.** On the third failure, stop: name the таск,
both attempts, and what each produced. This stop asks nothing, so it writes
`interruptedAt` in the run state and leaves `awaiting` out. That is the number
[`../SKILL.md`](../SKILL.md) already uses for a gate failing on the same
finding, and it is the same number on purpose.

Also count repair attempts by stable finding identity and under the finite
overall `verification.repairLimits` budget. Repeated attempts to fix the same
failure retain its root ID even if wording or task splits change. A newly
discovered, unrelated omission gets its own identity, while the overall budget
still limits the run. Exhaustion records an unresolved failure and presents
concrete remaining options; it never creates a pass or broad waiver. Presenting
them is a stop on a question — see *Asking A Question* in `SKILL.md`.

### 4. If it is a user-authorized scope amendment — write it down

Append to `.maestro/<dir>/amendments.md`:

- the `R##` it affects, quoted from the манифест,
- the `D##` from `discovered-interfaces.md` that demonstrated it, or the failure
  that stands in for one,
- what was specified, what the build found instead, and what the требование now
  becomes.

Then move that requirement's status in the run state, with the reason recorded —
`deferred` when it waits for something, `dropped` only when the user said so in
their own words (`S1`).

Append a `scope_amendment` decision to verification history with exact user
authorization and the old/new target revisions. Preserve old obligations and
checks as history; create current replacements and require new acceptance.

**Do not edit `spec.md`.** It has one writer and this phase is not it. An
amendment is a new fact about what the build demonstrated, not a correction of
what the spec phase decided, and the two stay in separate files so that the
disagreement between them stays attributable.

### 5. Send it back through the review

A retried таск is committed and returns to `review`. **You never write `done`** —
that word belongs to the review phase, and only for a таск whose review has no
blocking finding. A repair that marks its own work accepted has removed the one
check standing between it and the отчёт.

**Append the new commit to the таск's `commits`; do not replace what is there.**
The таск now has two, and the first is what its original review was written
against — which is exactly what the re-review has to be measured by, because the
tree those files sat in when that review was written no longer exists anywhere
else. A single entry overwritten records the last commit and loses the first, and
then the re-review has nothing to read but the tree, which by now carries every
wave that landed since. Three *done means* items of a real таск became
uncheckable that way.

## When It Does Not Go That Way

**A later wave changed the таск's files.** The retry is against a file that has
moved. Say so and re-cut: the plan gave two таски one file, which is the
file-ownership rule being contradicted after the fact rather than a merge to be
resolved.

**The failure is a credential.** `S2`, immediately: stop, name the variable,
advise rotation, and re-run redaction over everything written so far. The
failure is not repaired first and reported afterwards.

**The executor's report and the diff disagree.** Believe the diff, record both,
and treat the difference as a finding about the таск. A report that describes
work the commit does not contain is the failure mode the per-таск commit exists
to make visible.

**The failure is setup, not product.** A readiness probe failed, or one
prerequisite produced the same error everywhere. Correct it and record a
superseding readiness record; no defect, no attempt, no budget spent.

**A downstream таск keeps failing on what its upstream owes it.** Record the
attempt as `prerequisite_blocked` and repair the upstream defect first. The
downstream таск stays in `repair` until that prerequisite is closed; the state
validator refuses `running` before then.

**Two таски failed on the same file.** That is one defect in the cut wearing two
faces. Report it against the plan rather than repairing both — resolving it
means deciding what the project's code should say, which is the one thing you
do not do.

**The G4 disagreement names a требование no таск carries.** Then the plan never
covered it and G3 passed on a map that was wrong. Say so; the repair is to the
plan, not to a таск.

## Gates

None follows this phase.

The таск re-enters ревью, which already has one answer to give about it, and G4
still measures the whole build against the манифест afterwards. A repair that
quietly built something else is caught there, by a reader that has seen none of
this.

## Output Of This Phase

| Artifact | State |
|---|---|
| project code | changed by an executor, never by you; one commit per retried таск, **appended** to that таск's `commits` |
| `.maestro/<dir>/amendments.md` | one appended entry per amendment, each naming its `R##` and what demonstrated it |
| `.maestro/state.js` | the таск back at `running` then `review`; its repair commit appended to `commits`; a requirement status moved where an amendment moved it |

## Repair Door Inputs

| Door | Required inputs |
|---|---|
| not-done | taskFile, executorReturn, handoffIfPresent |
| blocking-review | taskFile, executorReturn, blockingFinding, handoffIfPresent |
| g4-disagreement | taskFile, disagreement, requirementIds, fingerprint |
| recorded-divergence | taskFile, divergenceId, dependencyResult |
| coverage-omission | taskFile, rootFindingId, requirementIds, missingObservation, sourceEvidence, obligationIds, checkIds, ownership, fingerprint |
| startup-defect | taskFile, rootFindingId, launchCommand, errorEvidence, fingerprint, requirementIds, checkIds, ownership, prerequisiteAssessment |
