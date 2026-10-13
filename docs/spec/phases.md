# Phases

The order is the product. Project code is written in the second-to-last stage;
everything before it decides what to build, and everything after it proves the
right thing was built.

## The Phases

| Id | Name | Stage | Reads | Produces |
|---|---|---|---|---|
| preflight | Preflight | yes | user arguments, repository state, the memory file, the project glossary, the register and earlier runs' `decisions.md`, the progress file, the history since the last closure, the published `SKILL.md`'s version | resolved dials, run state created with whether the project holds code, dashboard raised, `prior.md` |
| manifest | Manifest | yes | бриф from the user, redacted source snapshots and independent audit return | `brief.md` — written once, then grown by its additions block — and `manifest.md` |
| briefing | Briefing | yes | `manifest.md`, declared references, `prior.md` | `answers.md`, neutral `reference.md` |
| spec | Specification | yes | `manifest.md`, `answers.md`, raw reference, `prior.md`, the repository (through the existing-code reader, once) | `codebase.md`, `spec.md`, obligation and source coverage map |
| plan | Plan | yes | `spec.md`, obligations and checks, the repository's test, typecheck and lint configuration, `prior.md`, `codebase.md` | `tasks/`, `interfaces.md`, ownership map |
| build | Build | yes | task files and the references their *References* rows name, `interfaces.md`, `codebase.md`, blockers' `D##` rows | project code, checked execution inputs, `discovered-interfaces.md`, handoff where needed |
| review | Review | yes | task files, obligations, evidence, `interfaces.md`, project code, the project's documented standards | `reviews/` including `reviews/standards.md` once per прогон, findings and check limits |
| acceptance | Acceptance | yes | current manifest/additions, raw reference, integrated build, verification record | reconciled acceptance round, `report.md`, `PROGRESS.md` (through the closing publish) |
| memory | Memory | no | `discovered-interfaces.md`, `spec.md`, the Terms table of `interfaces.md`, the seam-level items of `reviews/standards.md`, the `noCorrectSeam:` lines of repeated repairs' diagnoses, `prior.md`, project code, run state | the memory block in the host's memory file, `decisions.md` |
| repair | Repair | no | whatever one of its six doors provides | retried таск, `amendments.md` |

`memory` runs twice — once during `build`, when the
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

## The Манифест's Size

A прогон costs the same ceremony whatever it builds. It runs every gate with an
independent reader, a review per таск, a blind acceptance and the evidence each
of them needs. For a change of one or two требования, that ceremony costs more
than the change itself. An outside report (2026-10-13) said exactly this. The
README already said a small fix needs no прогон, but no running прогон reads the
README.

So the manifest phase counts `requirements[]` when it shows the манифест. At
**2 or fewer**, it says in one line, before the list, that a direct edit would
most likely cost less.

- In `semi`, `interview` and `manual`, the question the манифест already asks
  offers one more answer: stop here. That adds an answer, not a stop.
- In `full`, the line is said and the прогон continues.

A chosen stop closes the прогон `stopped_incomplete` with a `stopReason` that
says so and the `result` line every contract-10 closure carries, and only the
memory phase runs after it.

Why a notice and not a lighter mode: no dial removes a gate (`SKILL.md`,
[`gates.md`](gates.md)), and a mode that verified less for a small бриф would
be the first that did. Why the threshold is a count and not a judgement: the
count is in the state at the moment the line is said, and a judgement of
"small" is the orchestrator grading its own work. The прогон never stops itself
on size. The user started it.

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

## Specification

### The Existing Code Is Read Once

Every later step names things the repository may already have, and a guessed
name is a defect found only when the build fails. So preflight decides once
whether the project holds code, and the spec phase spends one fresh reader on
it before the spec is written.

**The rule.** A project holds code when at least one qualifying file exists.
Git is asked first, for tracked files and untracked files it does not ignore;
without git, or outside a work tree, the directory is walked in name order
without following symlinks. A path does not qualify when it lies under
`.maestro/`, `.git/`, `.claude/`, `.agents/`, `.codex/` or `.gemini/` at the
root, has a `.git` segment, is named like a memory file or a project glossary
file at any depth, or is a root-level `README`, `LICENSE`, `LICENCE`,
`COPYING`, `.gitignore`, `.gitattributes` or `skills-lock.json`. Everything
else qualifies, `.github/` included. `--memory-read` reports the answer, and
preflight records it in the run state as `existingCode`
([`state-contract.md`](state-contract.md)).

| `existingCode` | `codebase.md` on disk | The spec phase does |
|---|---|---|
| `true` | no | dispatch the existing-code reader once, write its text verbatim after redaction to `codebase.md`, then write the spec |
| `true` | yes, a resumed phase | no dispatch; read the file |
| `false` | — | no reader; the spec is written as before |
| absent, a run from before the field | — | no reader, as for `false` |
| `true`, the reader fails or returns nothing usable | no | no file; one `existing code not read before the spec:` line in `debt.assumptions`, then the spec |
| `true`, a resumed phase whose `debt.assumptions` already carries that line | no | no dispatch; the spec is written without it, as after the failure |

The reader runs on the `standard` tier. No stop is added, and the user is not
asked anything here. The failure line is what makes the read once per прогон: a resumed phase that finds it does not
spend a second reader or append a second line.

**The reader** is given `manifest.md`, `answers.md` and the repository, and
withholds `brief.md`, `spec.md`, `prior.md` and `codebase.md`. It reports what
exists, never what to build, in English, under six fixed headings: *Where
things live*, *Conventions in use*, *Commands*, *Names the work will touch* (a
table of requirement, kind, name in code and where), *No counterpart yet* and
*Do not touch*. Every line names a path, except under *No counterpart yet*,
which names requirements the repository has nothing for, and the text stays under 300 lines,
because it goes to every executor. It runs on the session's model.

The spec reads `codebase.md` first and names an existing thing by its exact
name in code. Identifiers are English words, never transliterations, and in
existing code the convention `codebase.md` records wins.

## A Line Per Transition

At every стадия transition, and when a wave closes, the orchestrator says one
line in the chat. The line says what closed and what comes next, in the terms
*Reporting Progress* in `SKILL.md` sets: verified scenarios, closed таски and
removed blockers count as progress; commits and counters do not.

This is not the textual progress display that preflight forbids in place of a
dashboard that failed to open. That stand-in imitates the page: it is a running
picture of every таск and clock, and it is harder to remove later than a
missing feature is to notice. A line per transition imitates nothing. It is
what a colleague says on finishing one thing and starting the next.

It is needed because the page is not always in view. It may sit in a folded
pane, or on a host that never opened it, or the user may have looked away. An
outside report (2026-10-13) found the user not told quickly enough where the
work stood. Each transition was written to the state, and nothing was said.

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

### What Stays Resident

The loading rule has one exception, and it is the bundle's `SKILL.md`, which
stays in context for the whole прогон. A rule lives there rather than in a phase
file when every phase performs it. Every phase writes the state, opens a стадия,
can open a page, and speaks to the user, and a rule copied into nine phase files
becomes nine rules that drift apart. The resident groups, by their `SKILL.md`
headings:

- *Recovery* — claiming the прогон with `heldBy` and re-reading `updatedAt`
  before every write;
- *Opening A Стадия* — closing one стадия and opening the next in one write;
- *The Dashboard* — publishing every transition through `sync.mts`, which is
  performed dozens of times in a run;
- the view boundary under *The Dashboard* — the one page in front of the user,
  because a page that lands on their screen mid-таск reads as something going
  wrong to the one person with no way to check;
- *Speaking Plainly* — the `plain` register, because every phase speaks to the
  user;
- *Asking A Question* — what a stop owes its reader, because seven places ask.

Two reasons that used to sit beside their rules in `SKILL.md` live here now.
A прогон that stopped is resumed and never restarted because a restart takes a
run that is three стадии in and charges the user for all three again, over a
directory that already holds their answers. And a stop writes `awaiting`, with
the `kind` that names it, before it asks because a turn that ended on a
question and a прогон nobody is driving are equally silent: the user cannot tell
them apart from outside, and without the field neither can the dashboard, which
would raise its silence alarm over a run that is only waiting for its reader,
nor say what it waits for, nor stop its clocks. The dials questions write nothing,
because they come before preflight and no state of this прогон exists yet; a
gate failing a third time is an interruption rather than a question, and writes
`interruptedAt` instead — the validator refuses a state carrying both. A gate
whose round budget is spent is the other way round: the user decides what
happens next, so it is a question and writes `awaiting` with `kind` `answer`.

`SKILL.md` states these rules and not the reason they are resident. The reason
is maintenance knowledge, and a sentence that changes no behaviour costs context
on every turn of every прогон. `bundle-integrity` holds the file's size; see
[`README.md`](README.md) *Running The Checks*.

**The last two have no reader.** The dashboard's plain strings are held to the
banned list by `dashboard-integrity`, but nothing reads a sentence the
orchestrator composes in the chat, so *Speaking Plainly* is the whole of the
guarantee there. For questions only the recorded side is checked: G1 holds each
`answers.md` entry to its options, its recommendation and its `Chosen:` line. No
validator reads the question as composed, so there the discipline is the whole
of the guarantee.

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

**A resumed прогон checks its commits are still there before it writes.** A
reset, a rebase or a checkout between sessions can take a таск's commit off
`HEAD`'s history while `tasks[].commits` still names it, and a прогон that
builds on it reviews code that is not there. So the first thing any recovery
does after reading the state — a new session, the return after a compaction, the
reopening of a closed run — is `node .maestro/sync.mts --commits-check`. The
helper classifies every recorded sha as `ancestor`, `not-ancestor` or
`missing`, and changes nothing; what a lost commit means is the orchestrator's
to decide, and it writes that through an ordinary `--publish`.

- **A checkout is asked about.** When every lost commit sits on a local branch
  other than the current one (`onBranch`, the first by name when several hold
  them all), the work may be one branch switch away. The прогон names the branch and the таски in one line and stops on an
  `answer` question, resetting nothing until the user replies.
- **Otherwise each таск that lost a commit is named in one line, reset and
  relaunched at once.** The lost shas move to `tasks[].lostCommits`, and the
  таск goes back to `queued` — a `failed` таск stays `failed` and is only
  named, since its budget is spent. A `running` dependent goes back with it. No
  counter moves: a relaunch is not a retry and not a repair, because nothing
  was found wrong with the work.
- **The relaunch happens in the current стадия**, on the таск's own tier, with a
  handoff headed `## Lost Commit` that names the lost shas, the rewritten twin
  if the check found one (same subject, same `Maestro-Run:` trailer), and the
  zone. The code may still be in the zone under a new hash, and the executor
  finishes from it; nothing in that handoff is verified finished. If it changes
  nothing and a twin was named, the twin is appended to `commits`; if it
  changes nothing and none was, the таск lands an empty commit with the usual
  trailers, so the требование stays traceable. Then review, as for a repaired
  таск, and acceptance from the start if the прогон resumed there.
- **History is never rewritten to bring a commit back.** No reset, cherry-pick,
  rebase or checkout is run to restore one. A `git revert` keeps the commit an
  ancestor, so this check cannot see it; the review and acceptance gates do.
- **A git that cannot answer resets nothing.** `result: "unavailable"` is said
  once and the прогон continues, as no прогон stops on its history.

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
never confirms a seam: they cannot judge one. Its header is exactly
`| Seam | Producer task | Consumer tasks | Integration owner | Integration check |`,
and a Producer task cell starts with таск ids — one, several separated by
commas, or a range `02–13` — optionally followed by prose.

**Each task file names who builds it.** Its `Model` row, between *Depends on*
and *Prerequisites*, is `strong` or `standard`, and a `strong` таск says why:
producer of a seam, skeleton, `risk:<category>`, or `hard: <one line>`. The
rule is mechanical first: a таск whose id is in a Producer task cell, and the
sole таск of wave 1 — the skeleton, a wave of its own by definition — are
`strong`, and G3 checks both. Risk and a hard core are judgement calls with
their one-line reason. Everything else is `standard`. The plan writes the
same word into `tasks[].model` and nothing changes it: a repair and a retry run
`strong`, and a context handoff keeps the tier ([`dials.md`](dials.md) ›
*Models*). A contract-7 run, reopened under its own contract, writes no
`model` and no `Model` row, and each of its субагенты runs on the session's
model.

**Each task file names the references it follows.** Its `References` row,
between *User contract and authority* and *Verification map*, cites each
`REF-*` id from the register whose surface, behaviour or look the таск builds,
in backticks and followed by its role and location — or reads `none`. A
location lives in this row only; *User contract and authority* keeps the
quotations and the approved deviations. Every available `visual_reference` and
`contextual_example` is cited by at least one таск, and G3 refuses a plan where
one is not; an authoritative behaviour reaches its таски through
`verification.obligations[].implementationTaskIds` instead, and an unavailable
reference cannot be followed, so neither must be cited. A reference the user
replaced keeps its record, but briefing sets its role to `other` with
`superseded by REF-n; was <its former role>` as its description, so neither G2
nor G3 asks for it, and the plan cites the reference that replaced it. This is how a comparable
reaches the таски that build what it shows: «like X» is a требование that G4
checks, and the comparable itself is inspiration the executor opens. Nothing
compares the build against it after приёмка.

**The project's commands are written once.** `interfaces.md` opens with a
Project conventions table of five rows: the test, typecheck and lint commands,
where tests live, and one existing test file as prior art. Values come from the
repository as it is; a row with nothing to name says `none — <why>`, and in a
new project prior art is the таск that writes the first test. Task files cite
the section and never restate a command, so a task whose command disagrees with
it is the plan-consistency reader's stale instruction.

**Each domain word is named once.** After the conventions and before the Seams,
`interfaces.md` carries a Terms table. Its columns are term, meaning, name in
code, words to avoid, and the user's wording quoted from the original-language
source clause. *Name in code* is the identifier the existing code uses, taken
from `codebase.md`; it is `—` when the term has no counterpart yet, and
`renames <old>` when the plan deliberately renames one, with the таск named in
the Seams table. A word can arrive
with a meaning already, and for one word the манифест outranks the project
glossary, which outranks the memory block. A term the project glossary defines
is taken as it stands, its avoid words included. Terms that an earlier
прогон's memory block carries are taken over unless the манифест changed their
meaning, and a row that departs from one says `contradicts <date> decision,
because …`. When the манифест uses a word the project glossary defines in
another meaning, the манифест wins for this прогон, because it is the agreed
contract. The row says `contradicts project glossary, because …`, and the plan
appends one `debt.assumptions` line that asks the user to fix the project
glossary or the бриф; the отчёт prints it under Assumptions. No stop is added.
Nothing in a прогон writes into the project glossary. The task-file reader counts a word to avoid, or a listed term used
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
must be buildable without them. The executor is also handed `codebase.md` and
the task-file reader is not, for the same reason: a task file is buildable
without it, and it saves an executor a rediscovery without filling a gap. A plan-consistency reader sees all of them
with `interfaces.md` and `codebase.md`, and without `spec.md` or the манифест. It reports what
lives between таски: collisions, unowned artifacts or writers, completion
artifacts outside allowed writes, prerequisites with no upstream producer, a
producer and consumer that disagree on a route, method, DTO, migration or port,
stale formatter or project-rule instructions, and a name that contradicts one
`codebase.md` records with no `renames` row. A finding is a coordination
defect, fixed in the task files before dispatch, and never a reduced
requirement. Repair dispatches the same reader again when a defect crosses
таски. Two таски sharing a file with neither blocking the other is refused
mechanically at G3 as well, because a later wave does not order them by itself.

**Every instruction of a task file is a unit.** *What to build*, *Verification
map* and *Done means* are sections whose items open with an id in backticks,
`` - `U<n>` ``, numbered from `U1` in each file; one unit holds one thing an
executor acts on or checks. The header table keeps its `Model` and `References`
rows, which G3 reads.

**A reader is held to every unit it is asked about.** A task-file reader is
handed the list of unit ids it must judge and returns one verdict line per unit,
`U<n>: ok` or `U<n>: finding — …`, each finding quoted under its line. The
consistency reader returns one line per таск (`T03: …`) and per Seams row
(`seam <Seam cell>: …`). Each return is saved under `plan-reads/` and checked by
`sync.mts --plan-coverage`. A return that skipped a unit goes back to a fresh
reader for the missing units only, within the same round, and is checked
together with the first: `--plan-coverage` takes every return file of that
reader slot in the round. A return never counts until it is covered. Round 1 asks about every unit. After a round whose returns
are all covered, `--plan-units --record` stores each unit's hash. A later round
asks only about changed units — rewritten, citing a fact that changed, every
unit of a таск whose text outside its units changed (the header table,
Boundaries, Prerequisites), or every unit when `interfaces.md` changed — while still handing the reader the whole
file, since a rewritten unit can contradict one that did not move. The
consistency reader then goes out for the таски with a changed unit and the
seams that name them; repair's re-dispatch asks about everything (`--all`).
G3's reading half passes when the last round's returns are covered and carry
no finding, and `--plan-units` reports no violation.

**A fact two таски need lives once, in `shared.md`.** A source row, an oracle,
an approved deviation, an expected value, and every decision about any of them,
is written as `### F-<n> — <title>` when more than one task file needs it. A
task file cites the id inside a unit and never restates it.
`sync.mts --plan-render` copies each cited entry verbatim into the task file's
section between `<!-- maestro:facts:start -->` and `<!-- maestro:facts:end -->`,
so every consumer of a task file — executor, reviewer, both readers — is still
handed one file, and no reader's input list changes. Nothing between the
markers is edited by hand. `--plan-units` reports a stale section, an unknown or
doubly defined fact, and any sentence of 160 characters or more that two task
files restate outside it.

**A finding is fixed by rewriting what it quotes.** The unit, or the fact in
`shared.md`, is changed in place so the file says one thing. A later note that
overrides earlier text — a second decision about the same thing, «supersedes»,
«instead of the above» — is never added. Before a finding is closed, every task
file and `shared.md` is searched for the same term, row or pattern, and every
instance is fixed in the same round.

These four rules exist because of one прогон's G3. It ran sixty-one rounds, and
its readers spent 1.8 billion input tokens. Findings decayed from 244 in the
first round to a tail of one or two per round. That tail was not new text: in
the last twenty rounds, two findings in three quoted text that had been in the
file for ten rounds or more, and that about twenty earlier readers had been
given. A reader handed a 50–268 KB task file and an open question samples it,
and the next fresh reader samples something else. The fixes made it worse in two
ways. They were appended as new decisions beside the old ones, so
decision-against-decision contradictions grew from 1% of findings to 11%. And
each of 167 checklist rows was restated in nearly five task files, so a fix in
one left the other four disagreeing.

### A Check Only The Target Can Run

Some требования are proved only where the build lands, and a прогон never
reaches that place:
- a live database;
- DNS and a TLS certificate;
- the packages the target host has installed;
- a service this machine cannot call.

A local check of these proves nothing about the target. Leaving them uncut
hands the user a sentence where a check should be.

So the spec names such an observation as target-only, and the plan cuts its
check anyway, marked `target:` with the environment in the verification
map's integration prerequisites. The таск that serves the требование writes
the check as a committed command or script with its expected outcome. An
install or deploy требование's check lists every dependency the target needs
and fails naming each one that is missing. The executor returns it
`unavailable` with `failureCause: unavailable_capability`, a limitation
naming the environment, and the command as its invocation. The task reader
reports a `target:` row with nothing to run. The отчёт's *Checks to run on
the target* hands each one over with its command.

This came from an outside report (2026-10-13). A dependency the installer
needed was found missing only on the server, after every local check had
passed. A target check that fails naming the missing dependency would have
said so on the first run there.

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

**The return is checked at intake, not a phase later.** Build step 1 runs
`sync.mts --returns-check` on every executor return before anything in it is
read, its discoveries included: the `D##` rows come after it, so a refused
return hands a dependent nothing. A таск the verification map gives no check
to execute returns no block, and the orchestrator says so with
`--owns-no-check`; without it, an empty return is refused as a lost one. A
return with no red run, a placeholder red run, a capture that does not hash
to what it declares, or a commit that is not the handed base goes back to the
same executor once, in the same wave. It does not go on to the reviewer.
That resend spends no retry and opens no repair, because a format slip is
cheaper for its author to fix than for a diagnostician. A second refusal makes
the таск incomplete, and the repair phase owns it as usual. An outside report
(2026-10-13) found formal acceptance dragging on tests nobody had seen fail.
The rule existed, but only the reviewer ever applied it.

The reviewer counts a missing red run, an assertion that recomputes the
implementation, and a skip counted as a pass as blocking check-quality
findings. Whether a red run truly came first is the reviewer's to judge against
the diff, and so is any fact git could not decide at intake. No check can see
that.

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

**A commit a resume found lost is moved, never dropped.** It leaves `commits`
for `tasks[].lostCommits` (see *Recovery*), so the review never reads a sha
`HEAD` no longer holds and the таск's own history is not rewritten either. A
lost sha never comes back into `commits`; the relaunched work lands in a new
commit.

**Every commit the прогон makes carries a `Maestro-Run:` trailer.** A таск
commit and a repair commit carry two, after a blank line under the subject:
`Maestro-Run: <dir without --wip>` and `Requirements: R01, R02`, the таск's
`requirementIds` in id order. Таск numbers and requirement ids restart every
прогон, so the trailers are what ties a change in the history back to its
требование and its run. For the same reason a requirement is never searched
alone: `git log --grep=R02` crosses runs, and the slice by requirement is
`git log -E --all-match --grep='^Maestro-Run: <dir>$' --grep='^Requirements: (.*, )?R02(,|$)'`.
A fix made without Maestro carries the trailers of what it touches: the run
whose requirement it changes, or the last closed run when it changes none.
`Maestro-Run:` therefore means "the run whose requirements this commit refers
to", on a прогон's own commits and on the user's alike. The closing commit
(see *Memory*) carries `Maestro-Run:` alone.

### Handoff

A таск that runs out of context before it is done leaves
`tasks/NN-<slug>-handoff.md` — what is finished, what is not, and what the next
executor needs — and the same таск is handed over again with that file added to
what it is given. **This is the only case where one таск is handed over twice**,
and the handoff keeps the таск's tier: it continues the same build.

The handoff exists for surprises. A plan that produces one per таск cut its
таски too large, and the granularity rules above are what to fix, not the
handoff.

### What An Executor Opens Of The References

An executor is never handed `reference.md`. It opens, read-only, the references
its task file's *References* row names, each at its location, and no other. It
never writes, moves, reformats or regenerates one. A `contextual_example` is
inspiration, not a ruler: the executor follows it where the task file does not
decide, and where the two disagree the task file wins.

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

The reviewer is not given `reference.md` either. It may open, read-only, the
references the task file's *References* row names, and a difference from a
`contextual_example` is not a defect unless the task file's *Done means* or
*Verification map* makes it one.

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
| blocking | contradicts an item of the task file's *done means*, touches a file the таск does not own, departs from a signature in `interfaces.md`, or is a risk with a concrete counterexample | the таск does not become done |
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

**Risk is checked from the diff, against five categories.** These are sign-in
and permissions, money, deleting data, secrets, and messages sent to third
parties. Four of them use the words `S4` and `S2` already use
([`safety.md`](safety.md)). Sign-in and permissions has no S-rule of its own.

- **Who decides.** The reviewer decides from the diff whether a category applies,
  whatever the task file's `Model` row says. The plan picks who builds, and a
  risky таск may be `strong`; the reviewer still judges every diff against the
  five categories, and neither relies on the other.
- **When it blocks.** A risk finding blocks only with a concrete counterexample:
  an input, a request or a caller the diff lets through to the harm. Without
  one it is an observation. Suspicion is an observation by rule, not by
  hesitation, so the two kinds stay two.
- **The one exception to «absence is not a finding».** The usual hole is a
  protection that is not there, and here that absence is the defect. When the
  task file or `interfaces.md` names who provides the protection, its absence
  from this diff is not a finding.
- **The tag.** The finding is tagged `risk:<category>` the way `unrequested` is
  tagged, and it is not a third kind. It quotes no line, because the task file
  never mentioned the risk. It names the category and the counterexample
  instead.

**What it does not cover:** a gap that spans two таски. An endpoint from one
таск may rely on a permission check another таск never wrote, and no per-таск
reviewer sees both. When nothing names the provider, the reviewer records an
unsettled `risk:` observation that reaches the отчёт, and G4 is what can catch
the gap. The depth does not change any of this: the reviewer is still not told
it.

**Debug output a repair left behind is blocking.** A repair tags temporary
diagnostics `[maestro-debug:DF-N]` and removes them before return. Before any
reviewer is dispatched, the orchestrator reads each таск's per-commit diffs: a
tagged line one of its commits added and no later commit of the same таск
removed is a blocking finding of the orchestrator's own, origin `validator`,
naming the tag id and the path but never the line. A removal in another таск's
commit does not clear it.

**What is hard to undo is recorded from the same diffs.** Before dispatch the
orchestrator also reads each commit's file list and appends to `oneWay` one line
per inward one-way change: a deleted or renamed path no commit of the прогон
added, a new file under a `migrations` or `migrate` directory or under
`alembic/versions`, and a dependency whose leading major changed in
`package.json` (below `1.0`, the minor). A data migration elsewhere and the
other manifests are read by the same rule, by judgement. It is a record for the
отчёт, not a finding, and it blocks nothing. `scripts/gates/one-way.ts` holds
the mechanical half against a real repository; it does not ship with the
bundle.

### One Standards Pass

Executors work in isolation and each review sees one таск, so what lives between
таски — duplication, a data clump passed through several seams — is invisible to
both. **One fresh reader sees the whole прогон, once:** the first time the phase
ends with every таск `done`, while `reviews/standards.md` does not yet exist.
That file is the record, so a review round after a repair and a resumed session
do not run the pass again.

The reader, briefed by `prompts/standards-reader.md`, is given every таск's
per-commit diffs, the project's documented standards and a baseline of nine
named code smells. The standards are found by searching the project root, not
only by following links: the memory file of every supported host — `CLAUDE.md`,
`.claude/CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.override.md`, `AGENTS.md`,
`GEMINI.md` — each with the Maestro block cut out; `CONTRIBUTING*`,
`CODING_STANDARDS*` and `STYLEGUIDE*` at the root and in `.github/`; Markdown
files under `docs/` whose name holds `convention`, `standard`, `style` or
`contributing`; and any document the memory file or the README names as the
conventions. A found file counts only if it describes how code is written, and
lint and format configuration never does. A project's own standards document
that nothing links to was the one most likely to be missed, and it is the one
the project wrote for exactly this purpose. `npm run readers` holds this list in
the phase step, here and in the brief, taking the memory files from the
runtime's host table. It is withheld
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

When the user required visual or behavior parity with an authoritative
reference, that fidelity is checked here, at every mode and depth. A
`contextual_example` is measured only where a требование says so: the
executors followed it as inspiration, through their task files. A reference
can show spacing, tone, density, or error-message behavior; whether each is
mandatory depends on the user's original request and the role the register
recorded, not on this phase.

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

`report.md` has these sections, in this order, and they are fixed:

| Section | Holds |
|---|---|
| What was asked | every `R##`, its status, and where it landed, and one line saying how many таски ran on which model |
| Disagreements | G4's findings and failed/incomplete requirements, each against its требование and check evidence |
| Assumptions | every decision taken on the user's behalf, every unfilled variable by name, and every wording whose translation was uncertain |
| Questions to forward | every placeholder standing in for a fact nobody supplied, as a questionnaire the user can send on to whoever knows |
| Hard to undo | every inward change the прогон made that is hard to take back — migrations, deleted or renamed user files, major dependency upgrades — in plain words |
| Checks to run on the target | every required check that is `unavailable` or never ran, with its требование, what it observes, what was missing, the command to run where the build lands, and the outcome expected |
| Observations | the non-blocking findings the reviews carried forward, each `unrequested` or `risk:` one with its tag; then, under their own sub-heading, the standards pass's observations, or one line saying it did not run; then each `noCorrectSeam:` line of a repeated repair's diagnosis, as a defect repaired without a regression check, with its таск and reason — never the hypotheses |
| What is left | deferred and dropped требования, unresolved work, closure outcome, and accepted exceptions without hiding technical failures; each gate the user moved past at its round budget, with its open findings |

Fixed, because a отчёт whose shape is decided per прогон is a отчёт two прогона
cannot be compared through. A section with nothing in it says so in one line
rather than disappearing; an absent section reads as a section nobody wrote.

*What was asked* ends with `Models: N таски on strong (<name>), M on standard
(<name>)`, counted from `tasks[].model`; `session` is written as the session's
model followed by "(session)". A contract-7 state writes `Models: not recorded —
this прогон began before the models dial`. `npm run report` compares section
names only, so this cell and its twin in `7-acceptance.md` are kept in step by
hand.

When приёмка runs a second time — after a failed G4 sent its disagreements to
repair — the sections are written again, under that round's date, beneath
the ones already there. The отчёт accumulates rounds rather than replacing them:
the earlier round is what the build did before it was repaired, and nothing else
in the прогон records that.

Assumptions is where the прогон lists what it decided for the user, and where
the manifest phase sends a translation it was not sure of. Questions to forward
is where `S3` in [`safety.md`](safety.md) sends every invented fact it replaced
with a placeholder. With Hard to undo and Checks to run on the target, these
are the sections that exist to be read even when everything passed: they hand
over what only the user can do.

**Checks to run on the target is a list of commands, built from the state.**
Every required check whose latest execution is `unavailable`, or that has none,
is one numbered item. Each item gives the требование its obligations serve, what
the check observes, the execution's limitation, the command (the execution's
invocation, or else the check's procedure) and the check's oracle as the
expected outcome. A check with no command recorded says so; the отчёт never
invents one, because a command the прогон never ran is a command nobody has seen
work. The section exists because such checks kept a прогон from `completed`
correctly but were handed over nowhere. An outside report (2026-10-13) had to
work out its live database, DNS and HTTPS from server logs, and the dashboard
spec pointed at a report section that did not exist.

**Questions to forward is a questionnaire, built from the state.** The spec
phase writes each `debt.placeholders` entry as one labelled line —
`question:`, `matters:`, and `ask:` when somebody likely to know is known —
keeping one `question:` text per missing fact. Приёмка groups the lines by that
text, so each idea is asked once and carries every требование that waits on it,
and puts the question more требования wait on first. Each is written with why
it matters, who may know, and a blank for the answer, and the block carries no
id or path, because it is sent to somebody outside the прогон; one line after
it maps question numbers to `R##` for the user. A line without labels is still
asked, quoted as written. **How two questions with the same count are ordered
is the orchestrator's judgement, and no check holds it.** In the chat the
questionnaire is spoken in the прогон's language as one block ready to send on.

**Hard to undo reads `oneWay` and nothing else.** The review phase records each
one-way change from the per-commit diffs (see *Review*); приёмка writes each as
a plain sentence and closes the section by saying these are worth knowing
before building on top. An empty list says nothing hard to undo was recorded; a
state without the field says it was not recorded, because no scan ran.

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

**The closing candidate says what now exists.** From contract 10 it carries
`result` ([`state-contract.md`](state-contract.md), *Version 10 Extension*):
one sentence of at most 200 characters, in the прогон's language, naming what
was built for the user to use. It says "verified" only when the outcome is
`completed`, repeats no count the page already shows, and holds no value the
user would not paste into a chat. The shape is checked at publication; the
claim is not, and cannot be.

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
that found it. **After every closure** — acceptance's, or repair's when it stops
the run as `stopped_incomplete` — when the code exists and can be described,
what is written is what the project now is rather than what a таск ran into.

**The run after a closure always calls the helper and ends with the closing
commit.** An empty body keeps the block already there and refreshes its tail,
so a run that learned nothing still leaves the tail current. Then, after the
redaction this phase runs over what it writes, the прогон's last commit is made
by pathspec: `git add -- .maestro <memory file>` and
`git commit -m "maestro: close <dir>" -m "Maestro-Run: <dir>" -- .maestro <memory file>`,
where `<dir>` is the run directory without `--wip` and `<memory file>` is the
file the helper named. Nothing the user staged is taken. That subject is fixed:
preflight finds the last closure by it. Without version control the step is
said once and skipped. During build nothing is committed by this phase, and
with nothing to write the helper is not called.

**The block ends with the helper's tail.** `--memory-write` cuts the body at
the line `## Working Between Runs` and appends its own copy of that section:
*A Small Fix Without Maestro* (read `PROGRESS.md` and the commits since the
last closure, add a line under *Fixes Without Maestro*, commit with the
trailers) and *Which Slice Of The History* (since the last closure, by
requirement, by file, by fragment, by line — never the whole log). It is
regenerated on every write, so a copy carried through `prior.md` or an edit by
hand never drifts from what the helper and the phase files spell.

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
memory file, the project glossary, and the `decisions.md` of every earlier run
listed in the register, excluding the current run. Runs from before contract 7 have no register row and
are not read. A second call keeps the first `prior.md`. A memory file with
malformed markers is listed as not read and does not stop the run.

**The project glossary** is the user's own file of words: `GLOSSARY.md` or
`CONTEXT.md` at the project root, or a `GLOSSARY-MAP.md` or `CONTEXT-MAP.md`
together with every Markdown file its inline links name inside the project. A
map is followed one level deep, and each file is read once whatever name
reached it. A link that names a missing file or leads outside the project is
listed as not read. One limit, 32 KiB, covers every file the project glossary
adds, because `prior.md` is read into briefing, the spec and the plan. Past
it, preflight reads none of the project glossary rather than a part chosen by
order. It says so in the announcement and appends one `debt.assumptions`
line, so the отчёт carries it under Assumptions. The project glossary is read
and never written: the memory block stays the one region of the user's files a
прогон owns.

Three phases use it, at the moment they decide:

- **Briefing**, for a fork the прогон settles itself.
- **The specification**, for an entry that settles what an earlier прогон
  settled.
- **The plan**, for the Terms table of `interfaces.md`, which takes words from
  the project glossary and the memory block.

Following an earlier decision is cited. Going against it is written
`contradicts <date> decision, because …` and is never a silent override.
`prior.md` is S6 content: it may prompt a question or ground a self-briefed
answer, and it never adds or removes a требование. The memory phase starts its
new block from the one `prior.md` carried, and carries the durable rows of the
plan's Terms table forward as `term — meaning (not: x, y)`, so the next plan names
things the same way and does not give one thing a second name. A term the
project glossary already defines is not carried: each word keeps one source of
truth, and the block stays short.

**Where the work stands** reaches `prior.md` in two more sections. *Where The
Work Stands* is `.maestro/PROGRESS.md` verbatim and fenced, as the last closing
publish wrote it. *Since The Last Closure* lists the commits over code since the
commit that file's header records, newest first and without merges, with the
paths they changed. Commits that touched only `.maestro/` and the memory files
are not code. The read starts from the first of three that holds: the commit
that header records, when it is an ancestor of `HEAD` (`basis: commit`); the
closing commit of that run, the newest commit on `HEAD`'s history whose subject
is exactly `maestro: close <dir>` (`basis: closing-commit`) — a rebase rewrites
both shas and keeps the subject, and a match in a commit body or for a longer
directory name is not one; otherwise the closure's moment (`basis: date`), as
after a reset or on another branch. The section says which, and why the first
did not hold. Without git the section says why it was not read.
Past thirty commits the first read writes nothing and answers
`summary-needed`; preflight dispatches the commit reader on `standard`, and a
second read writes its at most ten lines in place of the list. When the reader
fails, `--no-commit-summary` writes the newest thirty subjects with a count of
the rest, and one `debt.assumptions` line says so. Commit subjects are copied
as git prints them and are not redacted: they come from the user's own history,
and the runtime does not carry the redaction filter.

Each part is used once. An item under *Settled By The User* binds the
specification the way an earlier decision does. *Not Done* and *Known Bugs*
are one question in briefing's first round, `### Leftovers — <gist>`, asked in
`semi`, `interview` and `manual` and never in `full`; an item is never taken
without the user's answer, and the closing publish carries every item nobody
took or dismissed. That question is the one thing `prior.md` may add to what a
mode asks, and it adds no требование by itself. The changed paths go to the
existing-code reader as a plain list.

**`PROGRESS.md` is not memory.** The memory block holds what the project is,
and nothing true only for one прогон. The progress file holds open work —
what was deferred, what failed, what the user settled — and is rewritten whole
at every closure, so it is never older than the last run that closed.

Every blind reader withholds `prior.md` (see [`gates.md`](gates.md)). A reader
holding earlier decisions would confirm the past instead of checking this
run's words, and the project glossary and the progress file reach a blind
reader through nothing else.

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

A `noCorrectSeam:` line from a repeated repair's diagnosis passes the same test.
A place where the project offers no seam for a regression check is a fact about
how it is built, and the next session meets it again when it tries to test the
same thing. It is written without the hypotheses around it.

`S2` applies here with no softening: the memory file is committed and read by
every later session, so a credential reaching it is the worst version of the
same violation. Redaction runs over what this phase writes exactly as it runs
over the бриф.

### No Gate

No gate follows memory, in either of its two runs. There is no question about
the user's words for it to answer — it records what the прогон learned, and a
run that recorded nothing worth keeping is a run that learned nothing worth
keeping rather than a failed one.

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

A retry runs `strong`, whatever its таск's tier. Whatever its door carries, and
nothing else. The task file always; then the
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

The first repair stays undiagnosed, to keep its cost. From the repeated repair
onward the diagnostician is asked for competing hypotheses rather than one
grounded next approach:

- **three to five ranked hypotheses**, most likely first, each with the
  observation that would falsify it;
- **the cheapest probe that tells them apart, run first** — by the
  diagnostician when it writes nothing to the project, otherwise as the first
  step of the next executor's brief, before any change, with its output tagged
  `[maestro-debug:DF-N]`. An executor whose probe contradicts the brief's
  hypothesis stops before the change and returns `still_failing`;
- **a reproduction minimised** until every element in it is needed;
- **one variable changed at a time**, and a performance defect starting from a
  measured baseline;
- **the seam** where the regression check sits, or `noCorrectSeam:` with why
  none exists. That absence is itself the finding: it is carried into the
  отчёт's Observations and offered to the memory phase.

All of it lives inside the existing `diagnosis` text as labelled lines (see
[verification.md](verification.md)), so the state contract does not move. A
diagnosis that breaks the shape is sent back to a fresh diagnostician once; a
send-back spends no repair attempt, and a second malformed return is
`unavailable`. The run state is the floor: the publish that appends a repeated
attempt carrying such a diagnosis is refused. The rule judges an attempt once,
when it is appended — a published attempt is immutable, so one accepted before
the rule existed stays valid rather than leaving the run unable to publish. **Hypotheses never reach the user** — not in a status
line, a question or the отчёт. Whether the probe was the cheapest, the
reproduction minimal or a `noCorrectSeam` reason true is the diagnostician's
judgement, and nothing mechanical holds it.

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
as carrying Assumptions only in `full`. It carries that section in every mode,
and Questions to forward and Hard to undo with it. The briefing writes into
Assumptions whenever it decides a wording instead of raising it, and `S3` sends
an invented fact to Questions to forward whoever was asked. What `full` changes
is how much lands there — not whether a section exists.

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
