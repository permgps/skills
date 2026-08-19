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
| build | Build | yes | `tasks/`, `interfaces.md` | project code, `discovered-interfaces.md`, a handoff where one was needed |
| review | Review | yes | `tasks/`, `interfaces.md`, project code | `reviews/` |
| acceptance | Acceptance | yes | `manifest.md`, `brief.md`, `reviews/`, project code | `report.md` |
| memory | Memory | no | `discovered-interfaces.md`, `spec.md`, project code, run state | the memory block in `AGENTS.md`, `decisions.md` |
| repair | Repair | no | a task result that is not done, or a review with a blocking finding | retried task, spec amendment with a `D##` row |

`memory` runs twice — once during `build`, when the build discovers something
worth outliving the run, and once after `acceptance`, when the finished code can
be described. `repair` runs on demand, and it has two entrances: a task that
comes back anything other than done, and a task whose review found something
blocking. The second one arrives already committed, which is why the build
stops short of calling it done.

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

The *Wave width* column above is a consequence of the cut, not a ceiling on it.
It says how wide the waves of a well-cut plan of that size tend to be; it does
not cap what this rule computes. A plan whose graph allows eight таски at once
runs eight — and if that is wrong, it is wrong in the cut, where it can still be
fixed against the требования.

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

## Review

The build hands over a таск and takes back what an executor says it did. This
phase is where somebody other than that executor looks.

**A reviewer is given one таск's file, the diff of that таск's own commit, and
`interfaces.md`.** It does not get `spec.md`, the манифест, the plan's
reasoning, or any other таск. That is the rule [`gates.md`](gates.md) already
states for everything between G2 and G4: the measurement is against the contract
the executor was actually given, because a finding derived from words the
executor never saw is a finding nobody can act on. The task file is that
contract, and `interfaces.md` is the rest of it — the boundaries the таск was
told to meet.

A reviewer holding `spec.md` would report the distance between the specification
and one таск's slice of it as a defect in the таск. It is not one. It is a
defect in the cut, and the cut is what G3 checks.

### Scope And Width

**One review per таск, and every таск is reviewed at once.** A review reads the
project and writes nothing into it, so neither of the two things that bound a
build wave — file ownership and `blockedBy` — bounds anything here. No
worktrees, no merges, no ordering.

The unit stays the таск because the diff is per таск. One commit per finished
таск exists so that this phase has something it can read whole.

### What A Finding Is

Two kinds, and no third:

| Kind | Means | Consequence |
|---|---|---|
| blocking | contradicts an item of the task file's *done means*, or a signature in `interfaces.md` | the таск does not become done |
| observation | anything else worth recording | carried into `report.md` |

A middle grade is where a defect goes to be politely ignored: everything
unpleasant lands in it and the прогон continues. Two kinds force an answer to
the only question this phase asks — did the таск do what it was told.

A design the reviewer would have chosen differently is not a finding, and
neither is a style the task file never asked for. Nor is a patch: a reviewer
that edits code to demonstrate a finding has stopped being a reviewer, and the
project's code has one route into a прогон either way
([`safety.md`](safety.md), `S5`).

### The Таск Lifecycle

A таск that has been committed is `review`, not `done`. The build phase writes
that status as it commits; **`done` is written here**, and only for a таск whose
review has no blocking finding. A blocking finding writes `repair` instead.

`done` then means one thing everywhere: reviewed and accepted. While the build
wrote it, it meant "committed" in that phase and "accepted" in every other, and
the dashboard showed a прогон finished at the moment when nothing had been
checked yet.

### A Blocking Finding

**The прогон stops and says which таск and which finding.** Repairing it belongs
to the repair phase, whose rules do not exist yet — and a repair improvised from
the table describing it produces a second failure that looks like the first,
with no record of which attempt built what. This is the same rule the build
applies to a таск that comes back not done, for the same reason.

### Who Writes What

The reviewer returns text. **The orchestrator writes `reviews/NN-<slug>.md`**
from it, quoting findings as they came back rather than summarising them.
*One Writer Each* in [`artifacts.md`](artifacts.md) names one writer for that
directory, and several subagents appending to it at once is exactly the
unattributable disagreement that table exists to prevent.

### No Gate

No gate follows this phase. G4 asks a different question, against a different
document, blind.

The acceptance phase reads `reviews/` — `artifacts.md` lists it as a reader —
and the blind reader inside that phase does not. Those two statements only look
contradictory if a phase and its subagent are read as one thing: the phase
composes `report.md` from everything the прогон knows, while the reader it
consults about the манифест is given the манифест and the build and nothing
else.

## Acceptance

The last phase asks the question the прогон was started for: does what was built
do what the user asked. It is the only phase that measures against the манифест
instead of against something the прогон wrote about the манифест.

**The reader is given `manifest.md` and the running build, and nothing else.**
Not `spec.md`, not the plan, not the task files, not `reviews/` — and not
`brief.md` either. The first four are withheld by [`gates.md`](gates.md), which
owns G4 and says why: a reader who has seen the specification confirms the
specification. `brief.md` is withheld on the same reasoning carried one step
further. The манифест is the numbered form of the бриф, agreed with the user
before any other work began; a reader holding both would answer from the looser
of the two exactly where they disagree — and that disagreement is the thing
worth knowing.

### The Phase And Its Reader Are Not One Actor

The *phase* opens `brief.md`, `manifest.md`, `reviews/` and the run state,
because the отчёт is composed from all of them. The *reader* it consults about
the манифест gets the two inputs above and nothing more. The review section
above drew this distinction already, for `reviews/`; this is the phase it was
drawn for.

Withholding binds the reader, not the orchestrator. A phase that could not read
the run state could not record a finding against a требование, and one that
could not read `reviews/` would drop every observation the прогон collected on
its way here.

### A Disagreement Names A Требование

Every G4 finding carries the `R##` it disagrees with, and the requirement text
quoted from the манифест. A finding that names nothing cannot be acted on,
cannot be counted against the requirement coverage the dashboard renders, and
cannot be told apart from an opinion about the build.

A требование the reader could not check — one needing data, credentials, or a
running service it was not given — is neither a finding nor a pass. It is named
as unchecked and carried into the отчёт as such. Failing it for being awkward
and passing it quietly are the same mistake made in opposite directions.

### The Отчёт

`report.md` has five sections and they are fixed:

| Section | Holds |
|---|---|
| What was asked | every `R##`, its status, and where it landed |
| Disagreements | G4's findings, each against its требование |
| Assumptions | every placeholder standing in for a fact nobody supplied, and every wording whose translation was uncertain |
| Observations | the non-blocking findings the reviews carried forward |
| What is left | deferred and dropped требования, with the reason recorded against each |

Fixed, because a отчёт whose shape is decided per прогон is a отчёт two прогона
cannot be compared through. A section with nothing in it says so in one line
rather than disappearing; an absent section reads as a section nobody wrote.

Assumptions is where `S3` in [`safety.md`](safety.md) sends every invented fact
it replaced with a placeholder, and where the manifest phase sends a translation
it was not sure of. It is the one section that exists to be read even when
everything passed.

**The отчёт is English, and what is said about it in the chat is Russian.**
*Translate Once* in [`artifacts.md`](artifacts.md) has no exception for the last
file, and this is the file most likely to grow one — it is the only artifact
written for the user rather than for a later phase. Labels are resolved through
`vocabulary.md` when the summary is spoken, not stored in the отчёт.

### When G4 Disagrees

The отчёт is written either way. It is the record of what disagreed, so
withholding it on a failure would delete the evidence exactly when it matters
most.

What happens after that is in [`gates.md`](gates.md), where the failure
behaviour of every gate lives: G4 is the one gate that cannot send its phase
back, so the прогон stops and names the требования.

## Memory

The next session starts cold. Everything the прогон worked out — why a boundary
is where it is, which of two plausible shapes the data took, what the build
tried first and abandoned — is in a context that ends when the прогон does. This
phase is what survives that.

It runs twice, and the two runs have different things to say. **During build**,
when a таск returns having discovered something the rest of the project will
keep running into, the fact is recorded while it is still attached to the таск
that found it. **After acceptance**, when the code exists and can be described,
what is written is what the project now is rather than what a таск ran into.

### Where It Writes

The project memory file is **`AGENTS.md` in the target project's root**, and the
прогон owns only the region between `<!-- maestro:begin -->` and
`<!-- maestro:end -->`.

Everything outside those two markers belongs to the user. It is not edited, not
reformatted, not reordered, and not summarised — not even when it says something
the прогон believes is wrong. A memory phase that improves the user's own
paragraph has done the one thing that makes the whole feature untrustworthy: the
next time they write something there, they will not know whether it will still
be theirs afterwards.

If the file does not exist, it is created containing the block and nothing else.
If it exists without the markers, the block is appended and the existing content
is left exactly as it was.

`safety.md` (`S5`) already names this file as one of the three paths the
orchestrator may write. This section is where it gets a name.

### Decision Records

`.maestro/<slug>/decisions.md`, append-only. One entry per decision that should
outlive the прогон: what was decided, what it was decided instead of, and what
made the difference.

**A decision record carries no identifier of its own.** It names the `D##` or
`R##` it came from and the date it was written. The identifier schemes in
[`README.md`](README.md) already assign `D` to a fact the build discovered, and
a decision derived from one of those would otherwise carry two ids for one
thing.

The two writes are for two readers. The memory block is read by whoever opens
the project next — a person or an agent — and is short for that reason.
`decisions.md` is read by somebody asking why, and is as long as the reasoning
was.

### What Qualifies

A fact qualifies when the next session would otherwise have to rediscover it,
and rediscovering it would cost more than reading it.

Two things do not qualify, and they are the two that fill a memory file with
noise:

- **Anything the code already says.** A list of the modules, the framework in
  use, the name of the entry point. The next session can read those faster than
  it can trust a copy of them, and a copy is wrong the first time somebody
  renames something.
- **Anything true only for this прогон.** Which таск ran in which wave, how long
  a stage took, what a review found and got fixed. That is what the отчёт and
  the run state are for, and they already hold it.

`S2` applies here with no softening: the memory file is committed and read by
every later session, so a credential reaching it is the worst version of the
same violation. Redaction runs over what this phase writes exactly as it runs
over the бриф.

### No Gate

No gate follows memory, in either of its two runs. There is no question about
the user's words for it to answer — it records what the прогон learned, and a
run that recorded nothing worth keeping is a run that learned nothing worth
keeping rather than a failed one.

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
| acceptance | отчёт | отчёт | отчёт | отчёт |

Two cells are all that separate `interview` from `manual`: spec and plan.

The acceptance row does not vary either, and it used to: the отчёт was described
as carrying Assumptions only in `full`. It carries that section in every mode.
`S3` sends an invented fact there whoever was asked, and the briefing writes
into it whenever it decides a wording instead of raising it. What `full` changes
is how much lands there — not whether the section exists.

No cell in this table removes a gate from `gates.md` or a rule from
`safety.md`. Those run identically in all four columns, because they are checks
against the user's own words rather than requests for the user's time.
