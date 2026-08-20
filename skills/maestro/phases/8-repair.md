# Phase 8 — Repair

Read when a таск needs another attempt. It runs outside the sequence, and there
are exactly four doors into it:

| Door | Arrived from | State of the таск | What is known |
|---|---|---|---|
| not-done | Разработка | not `done` — the executor stopped, failed, or returned something incomplete | nothing is committed |
| blocking-review | Ревью | `repair` — the review found a blocking finding | the таск is committed, and the finding names what it contradicts |
| g4-disagreement | Приёмка | `done`, and G4 disagreed about a `R##` it carries | the build is finished and the disagreement is against the манифест |
| recorded-divergence | Разработка, after its last wave | `review` or `done` | a `D##` says a delivered file disagrees with what the build does, and no review or gate will say it again |

The fourth exists because the other three cannot see it. A review judges one
таск against the contract that таск was given; G4 reads the build against the
манифест. A README that describes the build wrongly contradicts neither — so
without this door it is found, written down twice, and shipped.

No mode and no depth changes anything here: a таск that failed failed under
whatever dials the прогон is running, and the two answers this phase chooses
between are the same two in every column.

`S5` holds here with no softening. You decide what to try again and you write
down what was learned; **an executor writes every line of the code**, including
the one-line fix that looks too small to hand over. That fix is exactly where
the rule earns its keep — the прогон has no record of an edit you made yourself,
and the review that follows will judge it as if an executor had.

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

Not `spec.md`, not the манифест, not the other таски. You are deciding about one
таск against the contract it was given, and the withholding that makes a review
worth reading makes a retry worth running.

### 2. Decide: retry, or amendment

Two answers, and no third.

| Answer | Means | Requires |
|---|---|---|
| retry | the таск can be built as specified; the attempt was wrong | nothing beyond the failure itself |
| amendment | the specification was wrong, and the build demonstrated it | a specific thing that was tried and a specific way it failed |

**The test is evidence, not effort.** A signature that cannot exist, a
dependency that does not do what the spec assumed, two требования that
contradict each other — those are amendments. "It was hard", "the executor
misread it" and "there is a simpler design" are retries.

**A second reading of the specification is never an amendment.** If the words
were ambiguous, they were ambiguous before anybody built anything; what changed
is only who is inconvenienced by them. Re-reading your way out of a failure is
the shortest route to a build that does something nobody asked for.

### 3. If it is a retry — hand it over again

Give the executor its task file, `interfaces.md`, the failure exactly as it came
back, and the handoff if there is one, briefed by
[`../prompts/executor.md`](../prompts/executor.md). Set the таск to `running`
and write the state at that transition.

**A таск is retried at most twice.** On the third failure, stop: name the таск,
both attempts, and what each produced. That is the number
[`../SKILL.md`](../SKILL.md) already uses for a gate failing on the same
finding, and it is the same number on purpose.

### 4. If it is an amendment — write it down

Append to `.maestro/<slug>/amendments.md`:

- the `R##` it affects, quoted from the манифест,
- the `D##` from `discovered-interfaces.md` that demonstrated it, or the failure
  that stands in for one,
- what was specified, what the build found instead, and what the требование now
  becomes.

Then move that requirement's status in the run state, with the reason recorded —
`deferred` when it waits for something, `dropped` only when the user said so in
their own words (`S1`).

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
| `.maestro/<slug>/amendments.md` | one appended entry per amendment, each naming its `R##` and what demonstrated it |
| `.maestro/state.js` | the таск back at `running` then `review`; its repair commit appended to `commits`; a requirement status moved where an amendment moved it |
