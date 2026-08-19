# Phases

The order is the product. Project code is written in the second-to-last stage;
everything before it decides what to build, and everything after it proves the
right thing was built.

## The Phases

| Id | Name | Stage | Reads | Produces |
|---|---|---|---|---|
| preflight | Preflight | yes | user arguments, repository state | resolved dials, run state created, dashboard raised |
| manifest | Manifest | yes | бриф from the user | `brief.md`, `manifest.md` |
| briefing | Briefing | yes | `manifest.md` | `answers.md`, `reference.md` |
| spec | Specification | yes | `manifest.md`, `answers.md` | `spec.md` |
| plan | Plan | yes | `spec.md` | `tasks/`, `interfaces.md` |
| build | Build | yes | `tasks/`, `interfaces.md` | project code, `discovered-interfaces.md` |
| review | Review | yes | `tasks/`, project code | `reviews/` |
| acceptance | Acceptance | yes | `manifest.md`, project code | `report.md` |
| memory | Memory | no | project code, `spec.md` | project memory file, decision records |
| repair | Repair | no | a task result that is not done | retried task, spec amendment with a `D##` row |

`memory` runs twice — once during `build`, when the build discovers something
worth outliving the run, and once after `acceptance`, when the finished code can
be described. `repair` runs on demand, whenever a task comes back anything other
than done.

## Loading Rule

**One file at a time, and never ahead.** A phase's rules are read at the moment
that phase starts. The unit of loading is the file, so anything one phase needs
and another does not belongs in its own file.

Reading the next phase's file early does not feel like a mistake — the files are
small and the run is planned. What it does is put a later phase's rules into the
context an earlier phase is thinking in, and leave them there for the rest of the
run.

## Recovery

After a context compaction, a resuming session re-reads **the state, not the
rules**: the run state, `manifest.md`, `interfaces.md`, and the file of the phase
it is actually in. Re-opening earlier phase files to "recover the thread" spends
the context on rules already being executed, and the thread was never in them.

## Task Granularity

The plan phase cuts таски. These numbers are a first guess, never a target: a
plan cut to land inside a band has optimised for the band instead of for the
person who asked.

| Project size | Signal | Таски | Wave width |
|---|---|---|---|
| tiny | one file, one behavior, no new boundary | 1 — the whole spec, uncut | 1 |
| small | one module, no new external dependency | 2–4 | 2 |
| medium | several modules, or one new integration | 5–10 | 3 |
| large | new subsystem, or a data model others depend on | 10–20 | 3, widened only when the dependency graph allows |

Three rules decide the cut, and they outrank the table:

1. **A таск is one executor's whole job.** If it needs a second context to
   finish, it was too big; the handoff exists for surprises, not for planning.
2. **A таск owns its files.** Two таски that edit the same file are one таск, or
   they are sequenced. Parallel width is bounded by file ownership, not by the
   number of executors available.
3. **A таск traces to at least one требование**, and every in-spec требование
   reaches at least one таск. That is G3, and it is what stops the cut from
   drifting into work nobody asked for.

A tiny project produces **one** таск carrying the whole spec, and that is a valid
plan. Cutting one requirement into three таски to look thorough costs three
contexts and three reviews to build what one executor would have finished in one
pass.

One, not none. `S5` says the orchestrator does not write the project's code, so
somebody is handed the work either way — and by `vocabulary.md` the unit one
executor is handed is a таск. A plan with zero таски would make G3 vacuous
exactly when there is nothing else checking that the spec reached anyone, so the
smallest plan is one таск rather than an exemption from the gate.

## Execution

The granularity table above names a wave width and never says what a wave is.

**A wave is the set of таски that can run at the same time**: every id in their
`blockedBy` has finished, and no two of them own the same file. Both halves are
required. The dependency graph alone would let two таски edit one module from
opposite ends, and file ownership alone would start a таск before what it builds
on exists.

The wave is recomputed after each таск returns, not planned once at the start. A
таск that finishes early releases whatever it was blocking, and the next wave
forms around what is actually done rather than around what was expected to be.

### Isolation

**A wave wider than one таск runs with each таск in its own git worktree.** A
wave of one does not: it has no second writer to be protected from, and a tiny
project is one таск carrying the whole spec, which would then pay a merge for
nothing. Isolation is a property of the wave, not of the таск.

Each worktree is merged back when its таск finishes, and the next wave starts
only from the merged result. **A merge conflict between two таски of one wave is
a defect in the cut, not a merge to be resolved** — it is the file-ownership rule
being contradicted after the fact. It is reported against the plan, because
resolving it means deciding what the project's code should say, and that is the
one thing the orchestrator does not do ([`safety.md`](safety.md), `S5`).

### Commits

**One commit per finished таск.** A прогон survives a compaction, a crash and a
closed laptop by what is committed, and a commit per wave loses everything in a
wave that fails halfway. The per-таск history is also what the review phase
reads: a diff belonging to one таск can be judged against that таск's file, and
a wave-sized diff cannot be split back apart afterwards.

### Handoff

A таск that runs out of context before it is done leaves
`tasks/NN-<slug>-handoff.md` — what is finished, what is not, and what the next
executor needs — and the same таск is handed over again with that file added to
what it is given. **This is the only case where one таск is handed over twice.**

The handoff exists for surprises. A plan that produces one per таск cut its
таски too large, and the granularity rules above are what to fix, not the
handoff.

### A таск That Does Not Come Back Done

It goes to the repair phase. Until that phase's rules exist, **the прогон stops
and says which таск and why.** A build that retries a таск by rules nobody wrote
produces a second failure that looks like the first, and the run has no record of
which attempt built what.

## Mode Matrix

| Phase | full | semi | interview | manual |
|---|---|---|---|---|
| preflight | auto | auto | auto | auto |
| manifest | auto | auto | auto | auto |
| briefing | skipped, self-briefed | genuine forks only, sometimes none | every fork the бриф opens | the same |
| spec | auto | auto | auto | shown, waits for approval |
| plan | auto, notify only | auto, interruptible | auto, interruptible | discussed, waits for approval |
| build | auto | auto | auto | auto |
| review | auto | auto | auto | auto |
| acceptance | отчёт with Assumptions | отчёт | отчёт | отчёт |

Two cells are all that separate `interview` from `manual`: spec and plan.

No cell in this table removes a gate from `gates.md` or a rule from
`safety.md`. Those run identically in all four columns, because they are checks
against the user's own words rather than requests for the user's time.
