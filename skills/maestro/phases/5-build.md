# Phase 5 — Разработка

Read when the plan has passed G3. This is the only phase where project code
appears, and it is the one phase where you do not write any of it.

`S5` is not a preference here, it is the mechanism the whole order rests on. You
hold `spec.md`, the манифест and the plan; an executor holds one таск and the
boundaries. Handing over is what keeps those two facts apart, and a two-line fix
you make yourself collapses them for the rest of the прогон.

## Steps

### 1. Read `tasks/` and `interfaces.md`

Every task file, and the boundaries the plan derived. Nothing else of the plan's
reasoning — you are executing a cut, not re-deciding it.

If a task file is missing something an executor would need, that is a G3 finding
arriving late. Say so and re-cut rather than filling the gap in the handover
message, which no artifact records.

### 2. Form the wave

A wave is the set of таски that can run at the same time:

- every id in their `blockedBy` has finished, **and**
- no two of them own the same file.

Both halves. The dependency graph alone lets two таски edit one module from
opposite ends; file ownership alone starts a таск before what it builds on
exists.

Recompute the wave after each таск returns, not once at the start. A таск that
finishes early releases what it was blocking, and the next wave should form
around what is actually done.

### 3. Raise the worktrees — only if the wave is wider than one

| Wave | Where each таск runs |
|---|---|
| one таск | the project itself |
| two or more | one git worktree per таск, merged back as each finishes |

Isolation is a property of the wave, not of the таск. A wave of one has no
second writer to be protected from, and a tiny project is one таск carrying the
whole spec — putting it in its own tree charges a merge for nothing.

<!-- maestro:degrades:worktree-isolation -->
<!-- maestro:degrades:subagent-fan-out -->

**If a worktree does not come up, the wave is one таск wide.** Not two таски in
the project directory with a check afterwards that they touched different files:
that check passes on the прогон where it did not matter and is unavailable on
the one where it did — an executor that has already written over another's file
leaves the same tree as one that never tried. Narrow the wave, say in one line
that isolation was unavailable and what it cost in wall-clock, and carry on.
**A degraded прогон is a прогон.** The same is true when the host has no
subagent fan-out at all, arrived at from the other side: one таск per wave, and
every gate still runs.

Do not go looking for a repair. `git init` mid-прогон does not give the host a
worktree it decided it could not make; preflight settled that question and this
phase spends the answer.

### 4. Hand each таск over

Give the executor its task file and `interfaces.md`, briefed by
[`../prompts/executor.md`](../prompts/executor.md). **Nothing else** — not
`spec.md`, not the манифест, not the other task files.

Set the таск to `running` in the run state at the moment you hand it over, and
write the state then: at the transition, never on a timer.

The executor writes project code and returns text. It does not write into
`.maestro/` — you do, from what it returned.

### 5. Take the result back

For each таск that returns done, in this order:

1. **Append what it discovered** to `discovered-interfaces.md` as `D##` rows —
   one per fact another таск would otherwise learn again. An interface that came
   back different from `interfaces.md` is such a fact, and the difference is
   recorded rather than reconciled: `interfaces.md` has one writer and it is not
   this phase.
2. **Merge its worktree back**, if it had one.
3. **Commit**, one commit per finished таск. A прогон survives a compaction and
   a crash by what is committed, and the review phase judges each таск against
   the diff of its own commit.
   <!-- maestro:degrades:version-control -->
   Where preflight found no version control, there is nothing to commit: say so
   once, and tell the review phase it will be reading the working tree rather
   than one таск's diff. The прогон continues and every gate still runs.
4. **Mark it `review`** in the run state — the таск is committed, not
   accepted. `done` is written by the review phase, which has not run yet;
   writing it here would mean the same word described a checked таск in one
   place and an unchecked one in another.

Then form the next wave and go back to step 3.

## When It Does Not Go That Way

Each of these has its own visible outcome. None of them is handled by picking up
the keyboard.

**A таск comes back anything other than done.** It belongs to the repair phase.
Say which таск and why, leave its files alone, and go there — `SKILL.md` names
the file. Do not retry it here: the decision between another attempt and an
amendment is what that phase exists to make, and a retry started without it looks
exactly like the failure it is repeating.

**A таск ran out of context.** Its executor said what is finished, what is not,
and what the next one needs. Write that to `tasks/NN-<slug>-handoff.md` and hand
the **same** таск over again with the handoff added to what it is given. This is
the only case where one таск is handed over twice.

A handoff is for surprises. If several таски produce one, the cut was too large
— say so, because that is a fact about the plan and the next прогон inherits it.

**Two таски of one wave conflict on merge.** That is the file-ownership rule
being contradicted after the fact: the cut said they owned different files and
they did not. Report it against the plan. **Do not resolve the conflict** —
resolving it means deciding what the project's code should say, which is the one
thing this phase may not do.

**An executor asks for `spec.md`.** Refuse, and record that it asked. A task file
that sends its executor looking for the specification is a task file that did not
carry what it needed, and that is worth knowing before the next таск repeats it.

## The Dials Here

**No mode changes this phase.** All four columns of the mode matrix say the same
thing about Разработка, and the reason is that nothing here is a question of
preference: what gets built was settled at G3, and how it gets built is not the
user's to be asked about.

**No depth changes it either, and this is where that is worth saying.** An
executor does not deepen its таск because the прогон is `deep`, and does not trim
it because the прогон is `strict`. Depth is a decision about scope, scope was
decided in the specification, and a таск file is the whole of what its executor
is measured against. A build that re-applied the depth dial would be adding work
no требование carries and no gate is looking at.

## Gates

**None.** Разработка is the second stage with no gate after it, and the only one
that produces code. What was built is checked by the review phase against the
task each executor was actually given, and at G4 against the манифест with the
specification withheld.

That is deliberate: a gate here would check the build against `spec.md`, which is
the document this phase already handed out. It would confirm the specification,
not the бриф.

## Output Of This Phase

| Artifact | State |
|---|---|
| project code | written by executors, one commit per finished таск |
| `.maestro/<slug>/discovered-interfaces.md` | `D##` rows appended as each таск returned |
| `.maestro/<slug>/tasks/NN-<slug>-handoff.md` | only for a таск that ran out of context; normally absent |
| `.maestro/state.js` | every таск `review`, `currentStage` moved on |

Then read the review phase file.
