# Phases

The order is the product. Project code is written in the second-to-last stage;
everything before it decides what to build, and everything after it proves the
right thing was built.

## The Phases

| Id | Name | Stage | Reads | Produces |
|---|---|---|---|---|
| preflight | Preflight | yes | user arguments, repository state, the memory file, the register and earlier runs' `decisions.md` | resolved dials, run state created, dashboard raised, `prior.md` |
| manifest | Manifest | yes | бриф from the user, redacted source snapshots and independent audit return | `brief.md` — written once, then grown by its additions block — and `manifest.md` |
| briefing | Briefing | yes | `manifest.md`, declared references, `prior.md` | `answers.md`, neutral `reference.md` |
| spec | Specification | yes | `manifest.md`, `answers.md`, raw reference, `prior.md` | `spec.md`, obligation and source coverage map |
| plan | Plan | yes | `spec.md`, obligations and checks, the repository's test, typecheck and lint configuration | `tasks/`, `interfaces.md`, ownership map |
| build | Build | yes | task files, relevant raw reference, `interfaces.md`, blockers' `D##` rows | project code, checked execution inputs, `discovered-interfaces.md`, handoff where needed |
| review | Review | yes | task files, obligations, evidence, `interfaces.md`, project code, the project's documented standards | `reviews/` including `reviews/standards.md` once per прогон, findings and check limits |
| acceptance | Acceptance | yes | current manifest/additions, raw reference, integrated build, verification record | reconciled acceptance round, `report.md` |
| polish | Доводка | no | `reference.md`, project code after required parity | optional polished build, `tasks/` of its own |
| memory | Memory | no | `discovered-interfaces.md`, `spec.md`, the Terms table of `interfaces.md`, the seam-level items of `reviews/standards.md`, `prior.md`, project code, run state | the memory block in the host's memory file, `decisions.md` |
| repair | Repair | no | whatever one of its six doors provides | retried таск, `amendments.md` |

`polish` runs only when the finish dial asked for it, inside the acceptance
stage and after приёмка. `memory` runs twice — once during `build`, when the
build discovers something worth outliving the run, and once after `acceptance`,
when the finished code can be described. `repair` runs on demand, through the six doors its own section lists.

## A Change That Arrives Mid-Прогон

The user may withdraw or add a требование at any point after the манифест was
agreed — during брифинг, during the plan, during the build, while a таск is
being reviewed. There is one procedure for it, **owned by the briefing phase**
and cited by every phase after that one, because a procedure copied into five
phases is five procedures and the first drift between them is unattributable.

**The order is the procedure, and the first step is the one that gets skipped:**

1. **The additions block of `brief.md` first** — the user's words verbatim,
   after redaction, in the language they were said in, under that day's entry.
2. **Then the run state** — `dropped`, with the requirement's reason quoting the
   user, or a new `Rnn` with its own status and reason.
3. **Then the plan** — a таск cut for an added требование, a `deferred` row for
   one that will not be built, or a line in the отчёт.
4. **Then one sentence to the user**, saying what the change costs the schedule.
   A требование accepted silently is a schedule the user never agreed to.

The state is second, and never first, for a reason that is not about tidiness.
Writing the status feels like having recorded the change — it is the write that
makes the требование look settled — and the two gates capable of catching a lost
требование, `G2` and `G4`, are **forbidden to read the state**
([`gates.md`](gates.md)). A change that reaches the state and not the бриф is
invisible to both of them: G4 reads the манифест and the additions, so a
withdrawn требование stays in front of it as a live one, and an added one is in
no document it was handed at all. Recorded, and checked by nobody.

The manifest grows by rows and by nothing else. An added требование becomes an
`Rnn` row; a withdrawn one keeps its row and is not edited — the withdrawal lives
in the state and in the additions, which is what keeps the manifest's two
readings comparable.

## Briefing

The briefing proposes and the user disposes. Its aim is that a user who has
never built software answers fast, and is never asked something the repository
already knows.

| The question | What happens |
|---|---|
| a fork — two answers, two different builds | asked, by mode (the Mode Matrix below) |
| a preference the spec can decide | decided, and listed under Assumptions |
| a fact about the user (`S3`) or a consequence (`S4`) | asked; `S4` in every mode, `full` included |
| a fact about the repository | **never asked, read** — in every mode |
| two sentences of the бриф that contradict each other | a fork; both are quoted |
| a бриф that contradicts the existing code | a fork; the sentence and the file are quoted |
| one word used for two things | a fork; both meanings are named |

- **Reading has a ceiling, and it is the same in every mode.** The прогон reads
  the project's files to settle a fact. It never runs the project, drives its
  interface, reproduces a defect or changes a line, and the reading ends in the
  turn that started it.
- **Every question carries options, and one is recommended** with its reason in
  one clause. The recommended option is the answer `full` would self-brief, so it
  is checked against `prior.md` like any self-briefed fork. A fork is put as a
  concrete scenario rather than an abstraction, in both registers.
- **Rounds follow the frontier, and there are at most two.** A question that
  depends on one still unanswered is folded into the parent's options or held
  back. An answer that opens a new fork earns the second round. A fork still
  open after it is recorded `open` with its reason.
- **`R##` never travels alone** in user-facing text: it carries a short gist of
  its требование.
- **«Не понял» is not an answer.** The stop stays open and the question is asked
  again, in the same round, with the premise it was missing. It is not the
  register's trigger, which keeps its own words ([`dials.md`](dials.md)).
- **A delegated reply is recorded as the option it chose.** «Как советуешь» or a
  bare «да» goes into `answers.md` with the selected option's full text on a
  `Chosen:` line, and that text is shown back to the user. The entry shape is in
  [`artifacts.md`](artifacts.md), and [`gates.md`](gates.md) states what G1
  checks of it.

## Loading Rule

**One file at a time, and never ahead.** A phase's rules are read at the moment
that phase starts. The unit of loading is the file, so anything one phase needs
and another does not belongs in its own file.

Reading the next phase's file early does not feel like a mistake — the files are
small and the run is planned. What it does is put a later phase's rules into the
context an earlier phase is thinking in, and leave them there for the rest of the
run.

**The стадия opens first.** A phase's rules are read at the moment that phase
starts, and that moment is itself a write: the previous стадия is closed and this
one opened together, before the file is opened. Read first and open after, and
the preparation — the rules, the diffs, the briefs handed to subagents — falls
into the gap between two стадии and is counted by neither.

## Recovery

After a context compaction, a resuming session re-reads **the state, not the
rules**: the run state, `manifest.md`, `interfaces.md`, and the file of the phase
it is actually in. Re-opening earlier phase files to "recover the thread" spends
the context on rules already being executed, and the thread was never in them.

**A прогон that stopped without finishing is recovered the same way, and never
restarted.** A compaction is not the only thing a session does not survive, and
the other one leaves the same evidence: an open стадия with a `startedAt` and no
`finishedAt`, and artifacts saying how far it actually got. So a session that
meets a live `.maestro/state.js` and is told anything that is not an answer to a
stop — «продолжай», a question, a correction — reads the state first and resumes
at `currentStage`. Starting over would charge the user again for стадии already
paid for, over a directory that already holds their answers.

**And it says who is holding the прогон before it drives one.** `heldBy` in
[`state-contract.md`](state-contract.md) carries the token of the session that
claimed the run. A session opening a прогон that carries none mints one and keeps
it for the whole run; a session meeting a token that is **not its own** says so
and asks. It does not take the прогон, and it does not step away from it either:
it cannot tell a live holder from a dead one, and both answers are the user's to
give. That is the whole of what this rule does — a second orchestrator is
**detected, not prevented**, for the reasons written where the field is defined.

The check that makes the detection real is the one in the update ritual: a writer
re-reads the state immediately before writing and compares `updatedAt` with the
value it last read. A stamp that moved means somebody else wrote in between, and
that is reported rather than overwritten. Two sessions drove `board-sizes` on
2026-08-20 and neither had a way to notice; only an unrelated pause kept them off
the same write.

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
   they are sequenced. That ownership is the таск's **zone**, and it is what
   splits a dependency layer into waves that can actually run together. Parallel
   width is bounded by file ownership, not by the number of executors available.
3. **A таск traces to at least one требование and its applicable obligations.**
   Every active obligation has an implementation owner, and every required
   check has an execution owner; these may be different tasks. This is G3's
   two-directional map, including verification-only work.
4. **A task file is buildable with the executor's actual inputs** — the task,
   `interfaces.md`, relevant obligation and check excerpts, and needed raw
   reference evidence. A separate reader receives the same bounded inputs and
   reports missing execution dependencies before the task runs.

**Four preferences shape the cut inside those rules.** Each is a preference the
plan may decline with a stated reason, never a hard rule, and every declined one
is named with its reason in what the user is shown at the end of the phase.

- **A thin path end to end.** When zones allow, a таск owns a narrow path through
  every layer it touches, and its *done means* is something that visibly works.
  Strict vertical slicing fights parallel width, so a cut resting on the Seams
  table is legitimate. A *done means* item that needs the output of a таск this
  one does not depend on is not: it can be met only against a stand-in.
- **A prefactor to unlock width, in existing code only.** Rule 2 serialises
  таски that share a file or merges them into one. A behaviour-preserving
  wave-1 таск may instead split the shared file so later таски own disjoint
  zones. It traces to the требования of the таски it unblocks and adds no
  behaviour, so the specification's depth limits hold. It is cut only when an
  existing check already covers the shared file's behaviour, and that check is
  its *done means*, passing before and after unchanged. A check the prefactor
  wrote would pass on the old code at once and prove nothing, so with no
  existing check the prefactor is declined and the таски are serialised.
- **Expand, migrate, contract.** A change across many files — a rename, a
  signature — is three таски in that order: expand adds the new form beside the
  old, each migrate таск moves a disjoint set of callers, and contract removes
  the old form after every migrate. Expand and contract share the defining file
  and are ordered through the chain, which is what rule 2 asks.
- **Project conventions written once.** `interfaces.md` opens with them, so no
  executor rediscovers the commands.

A tiny project produces **one** таск carrying the whole spec, and that is a valid
plan. Cutting one requirement into three таски to look thorough costs three
contexts and three reviews to build what one executor would have finished in one
pass.

One, not none. `S5` says the orchestrator does not write the project's code, so
somebody is handed the work either way — and by `vocabulary.md` the unit one
executor is handed is a таск. A plan with zero таски would make G3 vacuous
exactly when there is nothing else checking that the spec reached anyone, so the
smallest plan is one таск rather than an exemption from the gate.

**Each task file states its edges.** It names its Prerequisites, each with the
таск that produces it and its row in the Seams table of `interfaces.md`. It
names its Forbidden writes: always `.maestro/`, plus every zone another таск
owns. It names its Completion artifacts, all inside the files it owns. It
names its Test surface: the signatures from `interfaces.md` its tests go
through, never an internal module. The Seams table gives each seam its
producer, consumers, integration owner and integration check. Fewer seam rows
are better, because each is a contract two executors must both meet. The user
never confirms a seam: they cannot judge one.

**The project's commands are written once.** `interfaces.md` opens with a
Project conventions table of five rows: the test, typecheck and lint commands,
where tests live, and one existing test file as prior art. Values come from the
repository as it is; a row with nothing to name says `none — <why>`, and in a
new project prior art is the таск that writes the first test. Task files cite
the section and never restate a command, so a task whose command disagrees with
it is the plan-consistency reader's stale instruction.

**Each domain word is named once.** After the conventions and before the Seams,
`interfaces.md` carries a Terms table. Its columns are term, meaning, words to avoid, and the user's
wording quoted from the original-language source clause. Terms that an earlier
прогон's memory block carries are taken over unless the манифест changed their
meaning. The task-file reader counts a word to avoid, or a listed term used
with another meaning, as an undefined term. The table exists because a task
file once said «a running score» without saying what it counts, and the README
built from it described a tally the page does not keep.

Every task-file reader sees one таск: the task file and `interfaces.md`,
declared in its brief and held to the reader table in [`gates.md`](gates.md)
like every other reader. A task file with no Test surface row is one of its
findings, because the executor would otherwise choose what its tests call. So is
a *done means* item that needs the output of a таск outside its *Depends on*,
which only a stub could meet. A dependent таск is later also handed its
blockers' `D##` rows; those do not exist when the reader reads, so a task file
must be buildable without them. A plan-consistency reader sees all of them
with `interfaces.md` and without `spec.md` or the манифест. It reports what
lives between таски: collisions, unowned artifacts or writers, completion
artifacts outside allowed writes, prerequisites with no upstream producer, a
producer and consumer that disagree on a route, method, DTO, migration or port,
and stale formatter or project-rule instructions. A finding is a coordination
defect, fixed in the task files before dispatch, and never a reduced
requirement. Repair dispatches the same reader again when a defect crosses
таски. Two таски sharing a file with neither blocking the other is refused
mechanically at G3 as well, because a later wave does not order them by itself.

## Execution

The granularity table above names a wave width and never says what a wave is.

**A wave is the set of таски that can run at the same time**: every id in their
`blockedBy` has finished, and no two of them own the same file. **Finished means
`review` or `done`.** A blocker in `queued`, `running`, `repair` or `failed` holds
its dependents, because what they build on is not yet there or has been found
wrong; launching on it produces downstream evidence the upstream repair will
make stale. Both halves are
required. The dependency graph alone would let two таски edit one module from
opposite ends, and file ownership alone would start a таск before what it builds
on exists.

**The wave number is a layer of the plan, assigned once and never renumbered.**
It is `1 + max(wave of its blockers)`, then split by file ownership: two таски of
one wave whose files overlap are separated, and the later one moves down. The
plan phase computes it when the таски are cut, and it is written into the run
state with them.

What the build recomputes is the *frontier*, not the number. A таск is launched
as soon as every id in its `blockedBy` has finished, even while a wave-mate is
still running — a таск that finishes early releases whatever it was blocking, and
waiting for its whole layer to land buys nothing.

The two were the same rule until the dashboard needed to group the build by wave
and found that a recomputed wave gives a таск no number until it starts. A number
rewritten mid-прогон also moves rows between groups on screen, which a user with
no way to know the numbers changed reads as the прогон losing its own plan.

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

### A Субагент Is A Leaf

**A субагент invokes no skill and dispatches no agent of its own; it does the
work in the context it was handed. Only the orchestrator dispatches.** The
прогон's own trigger — someone describing what they want built — is exactly what
a task file reads like, so a субагент free to invoke skills can take its таск
for a new бриф and start a nested прогон inside the first, and the fan-out
multiplies at every level. Every brief in the bundle carries the rule, and
`bundle-integrity` fails a brief that does not.

It is not a safety rule. A runaway fan-out shows in cost and in time, so it fails
the test [`safety.md`](safety.md) sets in *Why These And Not Others* — a result
the user cannot detect by looking at it.

### The User's Viewer Is Not A Субагент's To Use

**A субагент opens nothing in front of the user. An owned temporary server for
headless verification is allowed and must be cleaned up.** Isolation above is about what a таск may write; this is about what it
may show. The user's screen is carrying the прогон, and the panel is the whole of
what the run puts there ([`dashboard.md`](dashboard.md)) — a page arriving beside
it mid-таск is read as a fault, and has twice cost the panel its place in the
pane.

A question that can only be answered by looking at a rendered page is answered
through real headless input and rendered-state assertions when the capability is
available. Otherwise it is written down as unchecked and carried to whoever
exercises the build next. An item of *done means* is phrased so that this is
possible; one that cannot be is a finding against the task file, caught by the
reader standing where the executor will stand, which is the last moment it is
free.

### Tests An Executor Writes

A check that was never seen failing can pass by construction. On a first
build nothing used to catch that: fail → pass was asked of repairs only. Four
rules close it, all in the executor brief:

- **Red observed.** Every required check an executor writes is seen failing on
  one of its named assertions before the implementation lands. The red run is
  made against a stub of the Test surface signature or against the base, so an
  import error or a harness crash never counts. A repair's red run is the
  counterexample at the parent commit. The run is recorded on the return
  block's `red:` field ([`verification.md`](verification.md), Attribution and
  Dispatch).
- **Expected values come from the task file.** They are taken from its literal
  or oracle, never recomputed the way the code computes them. Tests go through
  the Test surface, not the internals. Only external services, time and
  randomness are mocked.
- **A skipped or pending test is not a pass.** A worktree holds only tracked
  files, so a test that needs an ignored fixture or a credential can skip itself
  and still exit green. Such a check is `unavailable` with its cause.
- **Each таск names its test surface** (Task Granularity above).

The reviewer counts a missing red run, an assertion that recomputes the
implementation, and a skip counted as a pass as blocking check-quality
findings. Whether a red run truly came first is the reviewer's to judge against
the diff. No check can see that.

### Commits

**One commit per finished таск.** A прогон survives a compaction, a crash and a
closed laptop by what is committed, and a commit per wave loses everything in a
wave that fails halfway. The per-таск history is also what the review phase
reads: a diff belonging to one таск can be judged against that таск's file, and
a wave-sized diff cannot be split back apart afterwards.

**A retried таск has more than one, and its commits are appended rather than
replaced.** `tasks[].commits` in [`state-contract.md`](state-contract.md) is a
list for this reason. What a таск did is the union of its commits —
`git diff <first>^..<last>` over that таск's own files — and that is what the
review reads, at first review and at re-review alike. **Not the tree.** By the
time a repair lands, the waves that followed the original are in the tree and
always will be; waiting for a quiet tree would serialise the build, which is the
one thing the wave order exists to avoid. Only the range changes; the diff was
already what the review read.

### Handoff

A таск that runs out of context before it is done leaves
`tasks/NN-<slug>-handoff.md` — what is finished, what is not, and what the next
executor needs — and the same таск is handed over again with that file added to
what it is given. **This is the only case where one таск is handed over twice.**

The handoff exists for surprises. A plan that produces one per таск cut its
таски too large, and the granularity rules above are what to fix, not the
handoff.

### What A Dependent Таск Is Handed

A таск with blockers is handed, beside its task file and `interfaces.md`, the
`D##` rows its direct blockers recorded in `discovered-interfaces.md`. Each row
names the таск it came from, which is how they are selected. The rows were
written for exactly this reader and would otherwise reach no one. They are
facts, not contract: where a row disagrees with `interfaces.md`, the executor
builds to `interfaces.md` and names the row in its return, and the build's
recorded-divergence door routes the disagreement. The review still judges the
таск against its task file and `interfaces.md` alone.

### A таск That Does Not Come Back Done

It goes to the repair phase, which is the first of that phase's three doors and
the only one where nothing has been committed yet. The build says which таск and
why, and stops handing out work in that таск's files until repair has answered.
A build that retries a таск on its own would be running the repair phase without
reading it, and the run would have no record of which attempt built what.

## Review

The build hands over a таск and takes back what an executor says it did. This
phase is where somebody other than that executor looks.

**A reviewer is given one таск's file, the per-commit diffs of exactly that
таск's own commits, and `interfaces.md`.** Under contract 6 a re-review after a
repair answers two questions separately — is the defect verified against its
repair criteria, and which parent criteria remain — and writes `done` only when
none remain. It does not get `spec.md`, the манифест, the plan's
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

**Behaviour nobody asked for is an observation tagged `unrequested`.** It is
behaviour the diff adds that a user or a caller could observe and that no item
of *done means*, no signature in `interfaces.md` and no assigned check accounts
for. Internal structure the таск needed is not behaviour. The tag is not a third
kind: the finding stays an observation, never blocking, because the reviewer is
not told the depth and cannot weigh how much extra the прогон tolerates. Without
it, extra behaviour had no owner — the reviewer counted only what was missing,
and the acceptance reader is told extra is not its question.

**Under `strict`, the orchestrator disposes of each `unrequested` observation.**
`strict` promises «only what the requirement cannot work without», and this is
the one place after the specification that promise is checked. Behaviour no
требование needs may be sent to repair: the orchestrator appends a blocking
finding of its own, origin `coordinator`, quoting the observation verbatim and
the `strict` row. An observation it keeps gets one line naming the требование it
serves. Under `normal` and `deep` it stays an observation and reaches the отчёт.
This is the only cell of the review phase a dial changes, and it changes what the
orchestrator does after the measurement, never the measurement.

**Debug output a repair left behind is blocking.** A repair tags temporary
diagnostics `[maestro-debug:DF-N]` and removes them before return. Before any
reviewer is dispatched, the orchestrator reads each таск's per-commit diffs: a
tagged line one of its commits added and no later commit of the same таск
removed is a blocking finding of the orchestrator's own, origin `validator`,
naming the tag id and the path but never the line. A removal in another таск's
commit does not clear it.

### One Standards Pass

Executors work in isolation and each review sees one таск, so what lives between
таски — duplication, a data clump passed through several seams — is invisible to
both. **One fresh reader sees the whole прогон, once:** the first time the phase
ends with every таск `done`, while `reviews/standards.md` does not yet exist.
That file is the record, so a review round after a repair and a resumed session
do not run the pass again.

The reader, briefed by `prompts/standards-reader.md`, is given every таск's
per-commit diffs and the project's documented standards — the host's memory file
with the Maestro block cut out, `CONTRIBUTING`, and documents they name as the
conventions — and a baseline of nine named code smells. It is withheld
`spec.md`, the манифест, the task files, `interfaces.md`, `reviews/` and
`prior.md` ([`gates.md`](gates.md) holds the list). A standard is quoted; a smell
is labelled `judgement: <smell>` and never called a violation.

Its output is observations only. It moves no таск, writes no state, enters no
`verification.findings`, and is never looped on, because this axis does not
converge. The отчёт carries its observations, and the memory phase reads its
`scope: seam` items. It costs one субагент per прогон and nothing resident.

### The Таск Lifecycle

A таск that has been committed is `review`, not `done`. The build phase writes
that status as it commits; **`done` is written here**, and only for a таск whose
review has no blocking finding. A blocking finding writes `repair` instead.

`done` then means one thing everywhere: reviewed and accepted. While the build
wrote it, it meant "committed" in that phase and "accepted" in every other, and
the dashboard showed a прогон finished at the moment when nothing had been
checked yet.

### A Blocking Finding

**The таск is marked `repair` and goes to the repair phase**, which is that
phase's second door: the таск is already committed, and the finding names what it
contradicts. The review says which таск and quotes which finding, and writes
neither the retry nor the fix — deciding what the code should say is what the
repair phase reads an executor in for. This is the same route the build takes for
a таск that comes back not done.

### Who Writes What

The reviewer returns text. **The orchestrator writes `reviews/NN-<slug>.md`**
from it, quoting findings as they came back rather than summarising them.
*One Writer Each* in [`artifacts.md`](artifacts.md) names one writer for that
directory, and several subagents appending to it at once is exactly the
unattributable disagreement that table exists to prevent.

### No Gate

No gate follows this phase. G4 asks a different question, against a different
document, blind. The debug-tag check is a blocking finding, not a gate: it sends
one таск to repair and stops nothing else. `scripts/gates/debug-tags.ts` holds
its condition executably, in the same way the gate scripts hold theirs.

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

**The independent reader is given `manifest.md`, current dated additions,
neutral reference metadata, raw reference access, and the integrated build.**
It is not given `spec.md`, plan, task files, reviews, prior dispositions, or
the бриф's original text. [`gates.md`](gates.md) owns the exact input boundary.
The initial pass can find behavior absent from the generated inventory. The
orchestrator subsequently reconciles that discovery with scheduled checks and
all other findings. See [`verification.md`](verification.md).

### Startup And Scheduled Verification

Startup code defects route to bounded repair with the startup-defect inputs.
Unavailable tool/service/value marks affected checks unavailable; independent
checks continue. After initial blind discovery reconcile and execute integrated
journeys, applicable startup/persistence/real-integration checks, and selected
isolated controls. Controls never pollute production executions. Pending G4 is
a first-class result. Original/current scope counts derive from one baseline
and verification graph, not task/stage activity.

### The Phase And Its Reader Are Not One Actor

The *phase* opens `brief.md`, `manifest.md`, `reviews/` and the run state,
because the отчёт is composed from all of them. The *reader* receives only
the declared independent inputs above. The review section above drew this
distinction already, for `reviews/`; this is the phase it was drawn for.

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
| Disagreements | G4's findings and failed/incomplete requirements, each against its требование and check evidence |
| Assumptions | every placeholder standing in for a fact nobody supplied, and every wording whose translation was uncertain |
| Observations | the non-blocking findings the reviews carried forward, each `unrequested` one with its tag; then, under their own sub-heading, the standards pass's observations, or one line saying it did not run |
| What is left | deferred and dropped требования, unresolved work, closure outcome, and accepted exceptions without hiding technical failures |

Fixed, because a отчёт whose shape is decided per прогон is a отчёт two прогона
cannot be compared through. A section with nothing in it says so in one line
rather than disappearing; an absent section reads as a section nobody wrote.

When приёмка runs a second time — after a failed G4 sent its disagreements to
repair — the five sections are written again, under that round's date, beneath
the ones already there. The отчёт accumulates rounds rather than replacing them:
the earlier round is what the build did before it was repaired, and nothing else
in the прогон records that.

Assumptions is where `S3` in [`safety.md`](safety.md) sends every invented fact
it replaced with a placeholder, and where the manifest phase sends a translation
it was not sure of. It is the one section that exists to be read even when
everything passed.

**The отчёт is English, and what is said about it in the chat is Russian.**
*Translate Once* in [`artifacts.md`](artifacts.md) has no exception for the last
file, and this is the file most likely to grow one — it is the only artifact
written for the user rather than for a later phase. Labels are resolved through
`vocabulary.md` when the summary is spoken, not stored in the отчёт.

**The round that closes the run publishes its closure before it writes its
отчёт.** Closing takes `--wip` off the run directory
([`state-contract.md`](state-contract.md), *Version 7 Extension*), and an отчёт
written first would name files under a directory that is about to be renamed.
When the outcome needs the user's authorization — `closed_with_exceptions` —
the residual set is presented in the chat first, the closure is published on
their answer, and only then is the отчёт written. Whatever the order, the отчёт
cites run artifacts by paths relative to its own directory. A round that does
not close the run writes its отчёт where the run already is.

### When G4 Disagrees

The отчёт is written either way. It is the record of what disagreed, so
withholding it on a failure would delete the evidence exactly when it matters
most.

What happens after that is in [`gates.md`](gates.md), where the failure
behaviour of every gate lives: G4 is the one gate that cannot send its phase
back, so each disagreement travels to repair through the таски carrying its
`R##`, and приёмка runs again once the build has changed.

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

The project memory file is the instruction file the agent host loads at session
start, in the target project's root. Which file that is differs by host:
[`hosts.md`](hosts.md) records it per host, from each host's documentation. The
прогон owns only the region between `<!-- maestro:begin -->` and
`<!-- maestro:end -->`.

The block goes into, in order:

1. the file that already carries it;
2. otherwise, the first existing file the host loads that may be written;
3. otherwise, any other existing memory file from that table;
4. only when the project has none, the file the host reads, created.

A project never gains a second memory file because a different host wrote to
it. When rule 3 picks a file the host does not load, the прогон tells the user.
The block in two files is a stop. The helper does the splice:
`node .maestro/sync.mts --memory-write --host <id>`, with the body on stdin. A
paragraph re-derived in prose each run is how a user's text gets overwritten.

Everything outside those two markers belongs to the user. It is not edited, not
reformatted, not reordered, and not summarised — not even when it says something
the прогон believes is wrong. A memory phase that improves the user's own
paragraph has done the one thing that makes the whole feature untrustworthy: the
next time they write something there, they will not know whether it will still
be theirs afterwards.

If the file does not exist, it is created containing the block and nothing else.
If it exists without the markers, the block is appended and the existing content
is left exactly as it was. A rewrite keeps the file's permissions.

`safety.md` (`S5`) already names this file as one of the three paths the
orchestrator may write. This section is where it gets a name.

### Decision Records

`.maestro/<dir>/decisions.md`, append-only. One entry per decision that should
outlive the прогон: what was decided, what it was decided instead of, and what
made the difference.

**An entry goes in only when all three hold:**

1. the decision is hard to reverse;
2. a reader without the прогон's context would be surprised by it;
3. there was a real alternative.

A cheap decision is simply redone by the next session, and an obvious one is
simply made again. Recording either only lengthens the file for the reader who
asks why. The threshold is a judgement, so no validator holds it. The phase
file states it where the judgement is made.

**A decision record carries no identifier of its own.** It names the `D##` or
`R##` it came from and the date it was written. The identifier schemes in
[`README.md`](README.md) already assign `D` to a fact the build discovered, and
a decision derived from one of those would otherwise carry two ids for one
thing.

The two writes are for two readers. The memory block is read by whoever opens
the project next — a person or an agent — and is short for that reason.
`decisions.md` is read by somebody asking why, and is as long as the reasoning
was.

### Who Reads It

Preflight reads what earlier прогоны left, once, after its first publish:
`node .maestro/sync.mts --memory-read --run-dir <dir>` writes
`.maestro/<dir>/prior.md`. That file holds the maestro block from every known
memory file and the `decisions.md` of every earlier run listed in the register,
excluding the current run. Runs from before contract 7 have no register row and
are not read. A second call keeps the first `prior.md`. A memory file with
malformed markers is listed as not read and does not stop the run.

Two phases use it, at the moment they decide:

- **Briefing**, for a fork the прогон settles itself.
- **The specification**, for an entry that settles what an earlier прогон
  settled.

Following an earlier decision is cited. Going against it is written
`contradicts <date> decision, because …` and is never a silent override.
`prior.md` is S6 content: it may prompt a question or ground a self-briefed
answer, and it never adds or removes a требование. The memory phase starts its
new block from the one `prior.md` carried, and carries the durable rows of the
plan's Terms table forward, so the next plan names things the same way.

Every blind reader withholds `prior.md` (see [`gates.md`](gates.md)). A reader
holding earlier decisions would confirm the past instead of checking this
run's words.

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

A seam-level item of the standards pass is read here and passes the same test. It
is a fact about how the project is put together across таски — one rule
implemented twice, one clump of values passed through several seams — rather
than something a review found and got fixed, and it enters only when the next
session would otherwise rediscover it.

`S2` applies here with no softening: the memory file is committed and read by
every later session, so a credential reaching it is the worst version of the
same violation. Redaction runs over what this phase writes exactly as it runs
over the бриф.

### No Gate

No gate follows memory, in either of its two runs. There is no question about
the user's words for it to answer — it records what the прогон learned, and a
run that recorded nothing worth keeping is a run that learned nothing worth
keeping rather than a failed one.

## Доводка

Off unless the finish dial asked for it. When it is on, it runs inside the
acceptance stage, after приёмка, for **up to three rounds**.

Доводка addresses optional refinement after required acceptance checks. When
the user required visual or behavior parity with an authoritative reference,
that fidelity is checked during приёмка for every dial setting. `reference.md`
also carries contextual examples for optional polish. A reference can show
spacing, tone, density, or error-message behavior; whether each is mandatory
depends on the user's original request and recorded role, not on this phase.

### A Round

One reader is given the running build and `reference.md`, and returns the
differences it can see. Each difference becomes a таск, cut and handed to an
executor exactly as a build таск is: one commit, one review, `done` written by
the review phase. **Доводка changes what is worked on, never how**; a polish
change that skipped review would be the one change in the прогон nobody checked.

A round that returns nothing ends доводка, whether it was the first or the
third. Three is a ceiling, not a quota, and a second round run to use up the
budget produces differences invented to fill it.

### What Доводка May Not Do

**It never adds a требование.** `S1` in [`safety.md`](safety.md) says a
требование is removed only by the user; this is the same boundary from the other
side. A difference that would need something the манифест never asked for is
reported in the отчёт and not built — doing it anyway would put work into the
build that no gate is measuring, arriving after the last gate has run.

It also does not touch `manifest.md`, `spec.md` or the requirement statuses.
Nothing about what was promised changes because the result was polished.

### After The Last Round

**Приёмка runs once more**, and appends its round to `report.md`.

The build the last отчёт describes no longer exists — доводка changed it — and
the rule that a changed build gets a fresh reading is the same one a repaired
прогон follows. One re-reading after доводка finishes, not one per round: what
is being checked is the build the user will keep.

## Repair

### The Doors

Six things arrive here, and they are the only six. Each names the phase that
opens it, because a door nobody opens is a promise the прогон cannot keep — the
first end-to-end run wrote «carried to the repair phase» into a `D##` row that
had no door, and the divergence it described shipped.

| Door | Opened by | State of the таск | What arrives with it |
|---|---|---|---|
| not-done | build | anything other than done | nothing is committed |
| blocking-review | review | `repair` | committed, and the finding names what it contradicts |
| g4-disagreement | acceptance | `done` | the disagreement and the `R##` it names |
| recorded-divergence | build | `review` or `done` | the `D##`, and what the таск it depends on actually built |
| coverage-omission | acceptance | any relevant task state | stable finding/root ID, R IDs, missing observation, source provenance/evidence, affected obligations/checks, task ownership and current fingerprint |
| startup-defect | acceptance | any relevant task state | exact documented launch command, sanitized error evidence, build fingerprint, affected R/check IDs, owning task and prerequisite assessment |

The first has not been committed. The second has — the build committed it before
the review looked — which is why the build stops short of calling it done.

**recorded-divergence exists because the other three cannot see it.** A `D##`
that says a delivered file disagrees with the build is a fact about the product,
not a finding against a таск: no review blocks over it, because each review
judges one таск against the contract that таск was given, and G4 does not find
it, because G4 reads the build against the манифест and a README the манифест
never mentions is not a disagreement with the user's words. The build opens this
door itself, after its last wave, for every `D##` it recorded as a divergence
rather than as a fact.

A `D##` that merely records what a таск turned out to do — an ordering, a
performance number, a behaviour nobody pinned — is not a divergence and opens
nothing.

This phase decides between two answers and writes one of them down. It never
writes project code: `S5` in [`safety.md`](safety.md) holds here exactly as it
holds in the build, and a retry travels to an executor like everything else.

### What A Retry Is Given

Whatever its door carries, and nothing else. The task file always; then the
failure exactly as it came back, or the review's blocking finding, or the G4
disagreement, or the `D##` together with what the таск it depends on built. The
handoff too, if the таск left one. Not `spec.md`, not the манифест, not the other таски — the same
withholding the build applies, for the same reason [`gates.md`](gates.md) gives:
a finding derived from words the executor never saw is a finding nobody can act
on, and that is as true of a retry's instructions as of a review's findings.

Under contract 6 the brief also names the defect's `DF-N`. Any temporary
diagnostic output the retry adds carries `[maestro-debug:DF-N]` on the same line
and is removed before return; a tag left in a commit is the review phase's
blocking finding against that таск.

### The Budget

**A таск is retried at most twice. The third failure stops the прогон**, which
reports which таск, both attempts, and what each one produced.

This is the number [`gates.md`](gates.md) already uses for a gate failing on the
same finding, and it is the same number deliberately. Two numbers for "how many
times do we try again before admitting we cannot" would be two answers to one
question, and the second one would be found only by somebody who read the
document that disagreed with what they had just done.

### Diagnosis After A Failed Repair

Before another retry, independently dispatch prior hypothesis, action, result,
root finding and sanitized evidence to a bounded diagnosis context. Obtain a
returned falsifying observation and grounded different strategy; unchanged
wording or merely switching executor cannot qualify. Record predecessor/root,
evidence, diagnosis dispatch/return, strategy, action and follow-up check IDs.
Missing diagnosis keeps repair incomplete. Counts follow the stable root across
renames, task and defect splits and executors; per-root at most two. Under
contract 5 the finite global budget never increases; under contract 6 it rises
only by a user-authorized `limit_increase` answering a `request_limit` strategy
review with a closure forecast. See [verification.md](verification.md).

### Defects, Closure Forecasts And Strategy Review

Under contract 6 a repair targets a **defect**, not a whole таск. Before
diagnosis, a broad finding is split into causal defects under its parent таск,
keeping the root and its count. Each repair brief states the defect and its
counterexample, the parent таск, the repair criteria as check IDs, the residual
parent criteria, the foreign prerequisites, the expected progress and a closure
forecast that never promises a таск closure while residual criteria or open
prerequisites remain. Repairs run upstream first, ordered by how many таски
they transitively unlock; a downstream defect waiting on an upstream gap is
recorded `prerequisite_blocked` and routed to the upstream owner.

A batch of attempts that closed no таск, or a cause that survived a materially
similar repair, stops the next attempt until a fresh strategy reviewer answers
seven questions — was the contract consistent, were dependencies ready, could
the environment evaluate the result, did the detector distinguish the behavior,
did the repair target the root cause, did the batch make a таск closable, and
what changes besides the count — and the review decides `change_strategy`,
`stop_incomplete` or `request_limit`. The review spends no repair attempt.

### Retry Or Amendment

A retry says the таск can be built as specified and the attempt was wrong. An
**amendment** says the specification was wrong, and the build is what
demonstrated it.

The test is evidence, not effort. An amendment requires a specific thing the
build tried and a specific way it failed — a signature that cannot exist, a
dependency that does not do what the spec assumed, a requirement that
contradicts another one. "It was hard" and "the executor read it differently"
are retries. **A second reading of the specification is never an amendment**; if
the words were ambiguous, they were ambiguous before the build ran, and what
changed is only who is inconvenienced by them.

An amendment is written to `.maestro/<dir>/amendments.md`, naming the `R##` it
affects and the `D##` that demonstrated it, and it moves that requirement's
status in the run state. It is not written into `spec.md`:
[`artifacts.md`](artifacts.md) gives that file one writer, and a specification
edited by two phases makes the first disagreement between them unattributable.

### Where A Repaired Таск Goes

Back through the review, not around it. A retried таск is committed and returns
to `review` status; `done` is written where it is always written, by the review
phase, and only for a таск whose review has no blocking finding.

The repair's commit is **appended** to `tasks[].commits`, so the re-review is
given the same rule as the first: the per-commit diffs of exactly that таск's
commits, in order, plus the list of paths outside its zone those commits
touched. A range from the first commit's parent to the last would carry every
foreign commit that landed in between. Overwriting the entry
would lose the commit the original review was written against, which is the one
the re-review has to be measured against.

**No gate follows repair.** The таск re-enters a phase that already has one
answer to give about it, and G4 still measures the whole build against the
манифест afterwards — a repair that quietly built something else is caught
there, by a reader that never saw any of this.

## Repair Door Inputs

| Door | Required inputs |
|---|---|
| not-done | taskFile, executorReturn, handoffIfPresent |
| blocking-review | taskFile, executorReturn, blockingFinding, handoffIfPresent |
| g4-disagreement | taskFile, disagreement, requirementIds, fingerprint |
| recorded-divergence | taskFile, divergenceId, dependencyResult |
| coverage-omission | taskFile, rootFindingId, requirementIds, missingObservation, sourceEvidence, obligationIds, checkIds, ownership, fingerprint |
| startup-defect | taskFile, rootFindingId, launchCommand, errorEvidence, fingerprint, requirementIds, checkIds, ownership, prerequisiteAssessment |

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

The briefing row's `self-briefed` is not a fourth kind of answer. It is the
option the other three columns put in front of the user marked as recommended,
taken without asking.

**`auto` means the phase does not wait for approval — not that it says
nothing.** Preflight asks about a dirty working tree and about an English name
for the run; the manifest phase shows the numbered манифест and asks whether
anything was missed. Both ask in `semi`, `interview` and `manual`, and both stop
asking in `full` while still saying what they decided. A cell of this table is
about a human *gate*: a point where the прогон waits. It is not a promise of
silence, and `S4` in [`safety.md`](safety.md) asks about consequence in every
column including the first.


The acceptance row does not vary either, and it used to: the отчёт was described
as carrying Assumptions only in `full`. It carries that section in every mode.
`S3` sends an invented fact there whoever was asked, and the briefing writes
into it whenever it decides a wording instead of raising it. What `full` changes
is how much lands there — not whether the section exists.

No cell in this table removes a gate from `gates.md` or a rule from
`safety.md`. Those run identically in all four columns, because they are checks
against the user's own words rather than requests for the user's time.

## Codex Dispatch And Ownership

On Codex CLI or app, apply the shared execution contract in
[`hosts.md`](hosts.md#shared-codex-execution-contract). Each independent role
uses a native fresh-context dispatch with its existing allowed artifact inputs
and an observed final return. The coordinator owns orchestration, worktree
integration and state publication; executors own project edits in their named
absolute workspaces. Missing concurrency or worktrees narrows editing waves to
one without removing independent sequential readers.
