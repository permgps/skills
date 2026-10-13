# Phase 4 — План

Read when the specification has passed G2, or the user moved past it at its round
budget. This phase cuts `spec.md` into таски and writes down the boundaries
between them. It ends at G3, and it is the last phase before project code exists.

You do not build anything here, and you will not build anything after it either
— `S5` holds for the whole прогон. What this phase decides is who gets handed
what, and what they may assume about each other.

**A требование the user withdraws or adds while the таски are being cut is not
a таск you quietly re-scope.** It goes through the briefing phase's procedure, in
that phase's order — the additions block of `brief.md` first, then the run state,
then the plan — and the plan is that third step, so an added требование becomes a
таск here, a `deferred` row if it will not be built, and a withdrawn one stops
the таски that carried it.

<!-- maestro:codex:dispatch -->
On Codex CLI or app, open [the native runtime recipe](../references/codex.md)
before each independent role dispatch in this phase. Use a fresh native child,
the full role prompt and only this role's allowed inputs; observe its actual
final return before importing results. The recipe is coordinator-only.

## Steps

### 1. Read `spec.md`

It is the contract. Every таск you cut comes out of it, and a таск that cannot
point at a part of it is work nobody asked for.

Read `.maestro/<dir>/prior.md` as well, when preflight wrote one. The Terms
table of `interfaces.md` takes words from its project glossary and its memory
block, and it decides nothing else here.

Read `.maestro/<dir>/codebase.md` too, when the прогон has one. It is what the
repository held before this прогон, as the existing-code reader returned it.
Signatures in `interfaces.md` take the names it records.

### 2. Size the work

| Project size | Signal | Таски | Wave width |
|---|---|---|---|
| tiny | one file, one behavior, no new boundary | 1 — the whole spec, uncut | 1 |
| small | one module, no new external dependency | 2–4 | 2 |
| medium | several modules, or one new integration | 5–10 | 3 |
| large | new subsystem, or a data model others depend on | 10–20 | 3, widened only when the dependency graph allows |

**These numbers are a first guess, never a target.** A plan cut to land inside a
band has optimised for the band instead of for the person who asked.

Three rules decide the cut, and they outrank the table:

1. **A таск is one executor's whole job.** If it needs a second context to
   finish, it was too big. The handoff exists for surprises, not for planning.
2. **A таск owns its files.** Two таски that edit the same file are one таск, or
   they are sequenced. Parallel width is bounded by file ownership, not by how
   many executors are available.
3. **A таск traces to at least one требование**, and every `in-spec` требование
   reaches at least one таск. That is G3, and it is what stops the cut from
   drifting into work nobody asked for.

Four preferences shape the cut inside those rules. Each is a preference the
plan may decline with a stated reason, never a hard rule; step 8 says where the
reason goes.

- **A thin path end to end.** When zones allow, a таск owns a narrow path
  through every layer it touches, and its *done means* is something that
  visibly works through its Test surface. Strict vertical slicing fights
  parallel width, so a cut that rests on the Seams table instead — each side
  built to the contract `interfaces.md` states — is legitimate. What is never
  legitimate is a *done means* item that needs the output of a таск this one
  does not depend on: its executor could meet it only against a stand-in, and
  nothing would visibly work when it returns. The task reader reports it.
- **Prefactor to unlock width (existing code only).** Rule 2 either serialises
  таски that share a file or merges them into one oversized таск. A
  behaviour-preserving wave-1 таск may instead split the shared file so the
  later таски own disjoint zones. It owns the shared file and the files it
  splits into, and every таск it unblocks lists it in `blockedBy`. Its
  требования are those of the таски it unblocks, so rule 3 holds without a
  требование of its own. It adds no behaviour, which is why the limits in
  `3-spec.md` still hold: it is not a new capability. Cut it only when an
  existing check already covers the shared file's behaviour. Its *done means*
  names that check, passing before and after unchanged, and its return records
  `red: not applicable — existing check <path>`. With no such check, decline
  it — «no existing check covers `<file>`» — and serialise. A check the
  prefactor wrote for itself would pass on the old code at once, and a check
  never seen failing proves nothing. In a new project there is nothing to
  split: `interfaces.md` gives each таск its own files from the start.
- **Expand, migrate, contract.** A change that touches many files — a rename, a
  signature — is cut into three таски in that order, rather than into one таск
  that hands off over and over. *Expand* adds the new form beside the old and
  owns the defining file. Each *migrate* таск owns a disjoint set of callers and
  waits for *expand*; migrate таски may share a wave. *Contract* removes the
  old form, owns the defining file again, and waits for every *migrate* таск,
  so the one path *expand* and *contract* share is ordered through the chain.
  All three trace to the требование the change serves. This is rare for the
  people Maestro is built for, and it gets this one paragraph.
- **Project conventions written once.** Step 3 opens `interfaces.md` with them,
  so no executor rediscovers the test command on its own.

A tiny project produces **one** таск carrying every relevant spec criterion in
its own file — one, not none. The executor is not given `spec.md` separately.
Somebody is handed the work either way, and the unit one executor is handed is a
таск. Cutting one требование into three таски to look thorough costs three
contexts and three reviews to build what one executor finishes in one pass.

### 3. Write `interfaces.md`

The boundaries **you derived from the spec**, named after the code where the
code already has the thing: module names, function and endpoint signatures,
data shapes, and which таск owns which files. This is how two таски
running at the same time agree without talking to each other.

- Written once, by this phase. **Never appended to later.**
- What finished таски actually built goes to `discovered-interfaces.md`, whose
  writer is the build phase. Two files exist because one file written by two
  phases has no owner, and the first disagreement between them would be
  unattributable.
- A boundary you are guessing at is a boundary the cut is wrong about. Re-cut so
  the guess is inside one таск.
- It opens with **Project conventions**, a table of exactly five rows:

  | Convention | Value |
  |---|---|
  | Test command | |
  | Typecheck command | |
  | Lint command | |
  | Where tests live | |
  | Prior art | |

  *Prior art* names one existing test file an executor can copy the shape of.
  Take the values from `codebase.md`'s *Commands* and *Conventions in use*
  when it exists, and otherwise from the repository as it is — its manifests,
  scripts and CI configuration, and the documented start and test commands preflight's
  readiness entry already read. A row with nothing to name says `none — <why>`;
  in a new project, prior art reads `none yet — таск NN writes the first`.
  Task files cite this section and never restate a command: a task file whose
  command disagrees with it is the plan-consistency reader's stale
  instruction. Without it, every executor rediscovers the same commands, and
  two of them rediscover them differently.
- After the conventions, it carries a **Terms** table, one row per domain word
  that more than one task file uses, or that the user said:

  | Term | Meaning | Name in code | Words to avoid | User's wording |
  |---|---|---|---|---|

  *Meaning* says what the word counts, holds or names, in one line an executor
  can build from. *Name in code* is the exact identifier, or identifiers, the
  existing code uses for it, taken from `codebase.md` (`Order`,
  `orders.total_cents`). It is `—` when the term has no counterpart yet; the
  signature in `interfaces.md` then fixes the new name, in English. When the
  plan deliberately renames an existing thing, the cell says `renames <old>`
  and the таск that does it is named in the Seams table. That is the only way
  a signature may differ from a name `codebase.md` records. *Words to avoid*
  lists the near-synonyms that would make two таски name one thing two ways.
  *User's wording* quotes the original-language
  span from the run state's `verification.sourceClauses` when the term came
  from the user, and `—` when the прогон coined it. This table exists because
  of the incident step 5 tells: a task file used «a running score» and never
  said what it counts.

  A word can already have a meaning before this прогон. Two places in
  `prior.md` carry one, and for a single word the манифест outranks the project
  glossary, which outranks the memory block:
  - **The project glossary** is the user's own file of words, and it is
    authority. A term it defines is taken as it stands: its meaning, and its
    avoid words into *Words to avoid*. *User's wording* stays `—` unless the
    user also said the word. A term the memory block carries as well is taken
    from the project glossary.
  - **The memory block** is what earlier прогоны carried. Its terms are taken
    over as they are, unless the манифест changed their meaning. If it did, the
    row says `contradicts <date> decision, because …`.
  - **When the манифест uses a word the project glossary defines, in another
    meaning**, the манифест wins for this прогон, because it is the agreed
    contract. The row's *Meaning* is the манифест's, followed by
    `contradicts project glossary, because …`. Then append one line per such
    term to `debt.assumptions`, which the отчёт prints under Assumptions:

    ```text
    project glossary: «<term>» means <its meaning there> in <file>, and <манифест meaning> in R## — this прогон used the манифест's meaning; fix the project glossary or the бриф
    ```

    No stop is added: the user settles it after the прогон, in whichever of the
    two files is wrong.

  The project glossary is the user's file. No phase and no таск of this прогон
  writes into it. A таск whose work seems to need it changed says so in its
  return and leaves the file as it is. When `prior.md` says the project
  glossary was not read, the table is built without it; preflight has already
  recorded that.
- It ends with a **Seams** table — seam, producer task, consumer tasks,
  integration owner, integration check — one row per route, DTO, migration,
  port or file that one таск produces and another consumes. Its header is
  exactly `| Seam | Producer task | Consumer tasks | Integration owner | Integration check |`.
  A **Producer task** cell starts with таск ids — `02`, `02, 05`, a forward
  range `02–13` or `02-13` — and may go on in prose after them
  (`02–13, one file each`); G3 reads the ids and nothing else, so a producer
  named only in words is a finding. A seam with no row is a seam two
  executors will each guess at. Fewer seam rows are better: each row is a
  contract two executors must both meet. The user never confirms
  a seam, because they cannot judge one.
- `interfaces.md` stays the authority on names. Where `codebase.md` and a
  signature here differ without a `renames` row, the plan is wrong.

### 3b. Write `shared.md`

**A fact two or more task files need is written once**, in
`.maestro/<dir>/shared.md`, as a third-level heading and its body:

```markdown
### F-12 — Row 3.24.9: password field
Old behaviour, new behaviour, the oracle a check compares against, and every
decision taken about it.
```

A source row, an oracle, an approved deviation, an expected value, and every
decision about any of them belong here when more than one таск needs them —
the таск that builds it, the таск that verifies it, the таск that records it.
A task file cites the id inside its units (`as F-12 says`) and never restates
the fact. A fact only one таск needs stays in that task file. Number facts
`F-1` upward, once each.

Run `node .maestro/sync.mts --plan-render` after every change to `shared.md`.
It copies each cited entry, verbatim, into the task file's facts section,
between `<!-- maestro:facts:start -->` and `<!-- maestro:facts:end -->`, so an
executor and a reader are still handed one task file. Nothing between those
markers is ever edited by hand: change `shared.md` and render again. A cited id
`shared.md` does not define stops the render, and nothing is written.

**Why once.** A прогон restated each of its 167 checklist rows in nearly five
task files, and then recorded decisions about a row in each task separately.
Three task files came to say three things about one row, and every round of
G3 found another such pair. A fact with one home cannot disagree with itself.

### 4. Write the task files

One file per таск at `.maestro/<dir>/tasks/NN-<slug>.md`, numbered in dependency
order. **An executor is given its task file and `interfaces.md`, and, when the
прогон has one, `codebase.md`, and nothing else** — it does not get `spec.md`.
A dependent таск is also handed its
blockers' `D##` rows, which step 5 says it must never need. Anything from the spec the таск needs must
therefore be *in* the task file.

Each file carries:

| | |
|---|---|
| Id and title | `NN` and one line saying what will exist when it is done |
| Требования | the ids it serves, so the review and G3 can both find them |
| What to build | the relevant part of the spec, restated in full — not a pointer to it — except a fact cited from `shared.md`, which the render copies in |
| User contract and authority | exact redacted request/addition quotations with their SRC/CL IDs and source digest, and approved deviations; no unrelated spec or rationale |
| References | each `REF-*` id this таск follows, in backticks, then its role and location: `` `REF-8` — visual reference: https://domtut2-old.test, 1440 and 390 ``; or `none` |
| Verification map | obligation/check IDs, observable behavior, implementation owner if needed, execution owner, integration prerequisites, and applicable variants |
| Boundaries | which files this таск owns, and which signatures from `interfaces.md` it must meet |
| Test surface | the signatures from `interfaces.md` this таск's tests go through — never an internal module |
| Done means | what the executor checks before returning, in terms it can check |
| Depends on | the таск ids that must finish first, or none; execution-only tasks may have no implementation files |
| Model | `strong` or `standard`; a `strong` таск says why: producer of <seam>, skeleton, risk:<category>, or hard: <one line> |
| Prerequisites | each thing this таск consumes, named with the таск that produces it and its row in the Seams table of `interfaces.md` |
| Forbidden writes | always `.maestro/`, plus every zone another таск owns |
| Completion artifacts | what must exist when the таск is done; every one lies inside the files this таск owns |

**Every instruction is a unit.** *What to build*, *Verification map* and *Done
means* are written as sections whose items are units: a list item that opens
with its id in backticks, numbered from `U1` in each task file.

```markdown
## Done means

- `U7` The search spec passes with `?rooms=2` kept on reload, as F-12 says.
```

One unit holds one thing an executor acts on or checks. The `| Model |` and
`| References |` rows stay in the header table, where G3 reads them. Units are
what a reader is held to in step 5, so an instruction outside a unit is one no
reader is asked about.

**The References row is how a comparable reaches the таск.** Cite in it, by its
`REF-*` id from `reference.md`, each reference whose surface, behaviour or look
this таск builds, with its role and the location the executor opens. Every
available `visual_reference` and `contextual_example` is cited by at least one
таск, and G3 refuses a plan where one is not. Write `none` when the таск follows
no reference. Never paste the whole register into a task file: the executor
never sees `reference.md`, and a row is what it opens. When one reference
supersedes another, cite the superseding id — a superseded id still cited sends
the executor to the look the user replaced. G3 holds the row from contract 8; a
reopened contract-7 run may write it, and nothing checks it there.

First map each live requirement to grounded obligations, then each obligation
to implementation tasks when code is needed and to required executable checks
with an execution owner. A verification-only task is legitimate: it has a
requirement and check to execute, but invents no implementation ownership.
Required integrated checks depend on the tasks that provide their application
surface, transitively through `blockedBy`. Two таски that share a path in
their files or zone are ordered, one blocking the other; G3 refuses an
unordered pair. Preserve `NN` task IDs, `blockedBy`, stable waves, and file zones.
Size tasks around observable surfaces and independent ownership, without a
fixed line-count limit.

A task file that assumes context the executor does not have is the defect this
phase produces most often. Read each one back as if you had never seen the spec.

An ID or hash names an input; it does not supply its content. For each relevant
source clause, copy the exact quotation into the task file and define how its
check observes that condition. For example, `CL-1 / SRC-1 / sha256: …` alone
leaves the reader unable to tell what C01 must test. The quotation plus ordered
actions, named assertions and capture paths supplies that boundary. Do not send
the full manifest or other clauses to fill the gap.

**An item of *done means* is answerable against this таск's own diff.** The
executor is judged on what it did, and the review reads exactly that — the union
of the таск's commits over the таск's own files, never the tree, which by then
carries every wave that landed since. So an item measured against the tree, or
against a total another таск also moves, stops being answerable the moment the
build moves on. `board-sizes` T02 failed three items that were true when they
were written: «35 of 35 self-checks pass», where another таск later took the
total to 96; «`git status` shows one modified file», after T03 landed; and
«`index.html` as it was before the прогон», which stopped being true for reasons
that had nothing to do with T02. None of the three was about T02's work.

Write items about **this** таск's files, this таск's assertions, this таск's
exit code. A count that includes work other таски produce belongs to приёмка,
which measures the whole build and is the only reader entitled to a whole-build
number.

**A rendered behavior can be a required *done means* item** when an existing
headless browser can execute it without taking over the user's dashboard. Name
the integrated route, trigger, visible state, exit, variant, and evidence
required. A component fixture may support diagnosis but cannot replace an
integrated-app check. If the browser is unavailable, the owner records an
unavailable check and limitation for later acceptance; it cannot silently
substitute source signatures or a synthetic event. A human-visible viewer still
belongs to the orchestrator and never to a task.

### 5. Have each task file read by somebody standing where the executor will

Hand every task file to its own subagent, briefed by
[`../prompts/task-reader.md`](../prompts/task-reader.md), together with
`interfaces.md`. **Nothing else** — not `spec.md`, not the манифест, not the
other task files. It is given exactly what its executor will be given, and asked
one question: could you build this without asking a question? With them goes
the list of unit ids it must judge, one verdict line each.

A dependent таск's executor will also be handed the `D##` rows its blockers
record, and those do not exist yet. So a task file is buildable without the
`D##` rows: they save an executor a rediscovery, they never fill a gap the task
file left.

The task reader is not handed `codebase.md` either, for the same reason: a task
file is buildable without `codebase.md`. It saves an executor a rediscovery and
never fills a gap the task file left.

They are independent of each other, so they go out at once and the wave is as
wide as the host allows.

**A reader is held to every unit it is asked about.** Save each return as
`plan-reads/r<round>-<NN>.md` and run
`node .maestro/sync.mts --plan-coverage <NN> <that file>`. It names the units the
return skipped, invented or judged twice. An incomplete return goes back to a
fresh reader for its missing units only, in the same round. Save that return
beside the first as `plan-reads/r<round>-<NN>-2.md`, then `-3`, and run
`--plan-coverage <NN>` with every return file of that таск in this round, first
one first: the units are covered together, and a unit judged in two returns is
judged twice. A return never counts until it is covered. This is what turns a reader from a sampler into an
enumeration: a reader handed a large task file and an open question reports
what it happened to notice, and the next fresh reader notices something else.

**Round 1 reads every unit; a later round reads only what changed.** Before
round 1, run `node .maestro/sync.mts --plan-units`: it lists each task file's
units and exits 1 on a violation — a unit id twice, a file with no unit, an
unknown or doubly defined fact, a stale facts section, or a passage restated in
two task files. Each violation is a finding of this round. When every return
of a round is covered, run `node .maestro/sync.mts --plan-units --record`. In
the next round, after the fixes and `--plan-render`, `--plan-units` marks a unit
changed when its text changed, when a fact it cites changed, or when
`interfaces.md` changed. An edit outside every unit — the header table,
Boundaries, Prerequisites, Forbidden writes, a heading — marks every unit of
that таск changed, because each unit is judged against it. Only a таск with a changed unit gets a reader, asked
for verdicts on its changed units only. It is still handed the whole task file,
because a rewritten unit can contradict one that did not move, and such a
contradiction is reported on the changed unit. Log INFO `round` with
`{ round, readers, requestedUnits, findings }` once per round.

The reader checks ownership and feasibility: **a task requiring a visible
viewer takeover, a missing headless prerequisite, or work another task owns is
a finding.** A required rendered criterion with an executable headless path is
valid. The reader must also see each obligation/check ID and enough raw oracle
provenance to know what result the task should test.

Then hand **every** task file at once, with `interfaces.md` and, when the
прогон has one, `codebase.md`, to one more fresh
subagent briefed by
[`../prompts/plan-consistency-reader.md`](../prompts/plan-consistency-reader.md).
It is not given `spec.md` or the манифест. It looks between tasks: collisions,
unowned artifacts or writers, completion artifacts outside allowed writes,
prerequisites no upstream task produces, producer/consumer disagreement on a
route, method, DTO, migration or port, and stale formatter or project-rule
instructions. A signature or task-file name that contradicts a name
`codebase.md` records, with no `renames` row, is a `CD-N` too. Each `CD-N` it
returns is a coordination defect, fixed in the
task files or `interfaces.md` before dispatch; it never reduces a requirement.
Log INFO with the verdict and the counts of tasks and findings, and WARN once
per `CD-N`. The same reader is dispatched again when repair finds a defect
that crosses tasks.

It returns one verdict line per таск it is asked about (`T03: ok`) and per row
of the Seams table (`seam <Seam cell>: ok`), each `CD-N` under the verdict it
belongs to. Save it as `plan-reads/r<round>-consistency.md`;
`--plan-coverage consistency <that file>` holds it to that list. In
round 1 the list is every таск and every seam. In a later round it is the
таски with a changed unit and the seams that name them, and the reader goes
out only when some unit, fact or `interfaces.md` changed. Facts sections are
generated copies of `shared.md`: identical copies in two task files are not a
collision.

The reading half of G3 passes when every return of the last round is covered
and carries no finding, and `--plan-units` exits 0.

**Act on a finding by rewriting the text it quotes, in place, so the file says
one thing.** Here, before any executor sees it:

- **Rewrite; never append.** Change the unit, or the fact in `shared.md`, that
  the finding quotes. Never add a later note that overrides earlier text — a
  second decision about the same thing, «supersedes», «instead of the above».
  A file carrying both the old instruction and its correction is the
  contradiction the next reader will find.
- **A fix to anything two таски need is made in `shared.md`**, then rendered.
  A `restated` passage from `--plan-units` is such a fact: move it to
  `shared.md` and cite it.
- **Fix the class, not the instance.** Before closing a finding, search every
  task file and `shared.md` for the same term, the same row, the same pattern,
  and fix every instance in this round. Log INFO `sweep` with
  `{ finding, swept }`.

Then record them in the G3 entry of the run state, one line per failed round as
*Gates* below says — an empty list is a real answer, and a gate passed while
carrying findings is not passed.

**Why units, rewrites and one home for a fact.** A прогон ran G3 for sixty-one
rounds. Its first round found 244 things, and the tail never ended: in the last
twenty rounds, two findings in three quoted text that had been in the file for
ten rounds or more, and that about twenty earlier readers had been given. The
fixes were appended as new decisions beside the old ones, so contradictions
between decisions grew from 1% of findings to 11%. One row restated in several
task files gave the rest. The readers spent 1.8 billion input tokens.

**Why this is a gate half and not a proofread.** The first end-to-end прогон cut
five таски, and four of the five task files contradicted themselves or left a
term undefined. Every executor resolved its own correctly, three of them by
falling back on `interfaces.md`, which wins by rule — so the code was right and
nothing failed. The fourth had nothing to fall back on: its task file said «a
running score for the session» without saying what the score counts, and the
README it produced described a tally the page does not keep. That file shipped.
Reading a task file back yourself is what produced all four; the withholding is
what would have caught them.

### 6. Compute the waves

`blockedBy` says what cannot start yet. **A wave says what may start at the same
time**, and computing it is not optional: without waves the прогон flies one таск
at a time, and a plan whose таски are genuinely independent takes two or three
times longer than it needs to, for no reason anybody chose.

1. **`wave = 1 + max(wave of its blockers)`.** Everything with no blockers is
   wave 1.
2. **Then split each wave by zone.** A таск's **zone** is the part of
   `interfaces.md` it owns — the files it may write. Two таски in one wave whose
   zones overlap cannot run together: move the later one into the next wave.
   Same files, always serialise. Two executors editing one file overwrite each
   other and the loss is silent.

A wave of one is a normal answer. The таск that lays the shell, the schema and
the shared primitives is a wave of its own by definition, and a tiny project is
one таск carrying the whole spec.

**Do not manufacture parallelism.** Splitting a таск in two so a wave looks wider
spends two contexts to save one. Waves are *discovered* in the dependency graph,
never designed into it. If everything genuinely depends on everything, the answer
is N waves of one — say so and run it.

**A wave number is assigned once, here, and is never recomputed.** It describes
the plan, not the frontier: when a таск finishes and the next becomes launchable,
that is the build moving through the plan, not the plan changing. The build is
free to launch anything whose blockers are done — what it may not do is renumber.
Rows that jump between groups on the dashboard read, to a user with no way to
know the numbers were rewritten, as the прогон losing its own plan. If a wave
genuinely has to change, that is a re-cut: one line to the user saying why, and a
`D##` row if the code forced it.

### 6b. Which model builds it

Mark each таск `strong` or `standard` now, after the waves, because the
skeleton rule needs them. In this order:

1. **Mechanical.** A таск is `strong` when its id appears in a **Producer
   task** cell of the Seams table, or when it is the sole таск of wave 1 — the
   skeleton, a wave of its own by definition. A one-таск plan is therefore
   `strong`. G3 checks both.
2. **By judgement.** A таск is `strong` when it touches one of the five risk
   categories — `access`, `money`, `deletion`, `secrets`, `messages` — or its
   core is a hard algorithm or an unfamiliar integration. Its `Model` row
   gives the reason in one line: `risk:money`, `hard: <what is hard>`.
3. **Everything else is `standard`.**

The tier is fixed here and never changed. A repair and a retry run `strong`
whatever the row says; a context handoff keeps the таск's tier. The plan picks
who builds, the reviewer still judges every diff against the five categories
whatever the row says, and neither relies on the other.

### 7. Write the таски into the run state

**The whole `tasks[]` array is written now, when the таски are cut** — not as
each one starts. Every entry carries its id, title, `status`, `requirementIds`,
`blockedBy`, `wave`, `zone`, `model`, and the three counters at zero.

- `status` is **`queued`**, and that is the only status a cut таск may be
  written with. `pending` is a стадия's word and a гейт's — `0-preflight.md` two
  files back writes the стадии that way, and that analogy is exactly how a real
  прогон came to write a таск `pending`. The dashboard cannot count a status it
  cannot name: it shows such a таск as written and grades its progress at
  nothing, which is honest and is not what you meant.
- `requirementIds` is never empty. That is half of G3, and the state validator
  refuses a таск without it.
- `blockedBy` holds the таск ids that must finish first.
- `wave` and `zone` come from step 6. The dashboard groups the build by wave;
  the zone is why two таски in one wave can be trusted not to collide.
- `model` comes from step 6b, the same word as the task file's `Model` row.
  A contract-7 run writes no `model`, and its task files carry no `Model`
  row: a run reopened under contract 7 is refused every field from 8, and
  each of its субагенты runs on the session's model.
- `retries`, `repairs` and `handoffs` all start at `0`, and `files` starts empty.
  A counter created halfway through a прогон is a counter somebody increments
  from nothing, and the arithmetic downstream never says so.

An array published only as таски start makes the dashboard state three false
things at once, at the moment the user is most likely to look: that the таски
were never cut, while the files are on disk and the build is running; that there
is no build to show; and a progress bar that cannot move with the work because
the share it measures is zero out of zero.

### 8. Show it, by mode

| Mode | What happens |
|---|---|
| `full` | the plan is written and the прогон continues; the user is notified, not asked |
| `semi`, `interview` | the plan is written and the прогон continues, interruptible |
| `manual` | the plan is discussed and the прогон waits for approval: a stop on a question whose `awaiting.kind` is `plan-gate` |

`manual` and `interview` differ in exactly two places, and this is the second.

**A declined preference is named, never silent.** Every preference from step 2
that the cut declined goes into what the user is shown or asked to approve, one
line each, with its reason — «prefactor declined: no existing check covers
`src/store.ts`». Log INFO `plan` `preference declined` with
`{ preference, reason, tasks }` for each. Nothing checks the reason; it is for
the user, and for whoever reads this plan after the прогон.

**Depth has already been spent, and the cut does not spend it again.** `strict`,
`normal` and `deep` decided how far beneath the бриф `spec.md` reaches; by the
time you are cutting, that decision is in the document in front of you. A `deep`
прогон produces more таски because the specification grew, never because the same
work was cut finer — splitting one таск in three to look thorough costs three
contexts and three reviews to build what one executor would have finished in one
pass.

## Gates

**G3 runs after this phase.** It has two halves, and the second one is step 5:
the task-file readers and the plan-consistency reader. *Journey And Control
Ownership*, below, publishes its graph before G3 runs.

The map between требования and таски holds in **both** directions:

- every `in-spec` требование maps to at least one таск — nothing the user asked
  for was dropped on the way from the spec to the cut;
- every таск traces back to at least one требование — nothing was added that
  nobody asked for.

The mechanical half also refuses two таски that share a path in their files or
zone with neither blocking the other, and a check whose execution owner does
not transitively depend on each of its integration prerequisites. From
contract 8 it refuses a producer or the skeleton that is not `strong`, a
Producer task cell that names no таск id, a producer id that is not a таск of
the plan, and a task file whose `Model` row disagrees with `tasks[].model`.

One direction alone is worth little. A cut can cover every требование and still
carry two таски invented along the way, and it can be entirely traceable while
quietly leaving a требование out.

And every task file is buildable by a reader who has only what its executor will
have. The map measures coverage; this measures the thing the executor is
actually handed, and a task file can be perfectly traceable while contradicting
itself.

- A failed G3 returns control here: this phase runs again with the findings as
  input. It may fail twice on the same finding; on the third the прогон stops and
  reports what cannot be satisfied rather than looping.
- **G3 runs at most 60 rounds, whatever each one found.** A round is one
  evaluation of the gate: the mechanical half, every reader dispatched for it,
  and what came back; an incomplete return sent back for its missing units
  belongs to the same round. A failed round appends one line to G3's `findings` that
  opens with its round number and says in short what was found and what was
  done; the number on the last line is the count a compaction cannot lose. When
  round 60 fails, and each sixtieth after it, log WARN once with the gate, the
  round and the open findings, then stop on a question — `awaiting.kind`
  `answer`, the note naming G3 and how many findings are open — showing that
  round's open findings with three answers: another 60 rounds; the build now,
  with G3 left `failed` and those findings quoted in the отчёт's *What is left*;
  or stop the прогон here. Findings that change every round are what this
  budget is for; one finding failing a third time still stops the прогон first.
- **G3 is never passed with notes.** A finding is acted on, or recorded as an
  explicit deferral against a requirement id — which is itself a status change,
  and one only the user can make.

## Output Of This Phase

| Artifact | State |
|---|---|
| `.maestro/<dir>/interfaces.md` | written once, the boundaries derived from the spec |
| `.maestro/<dir>/shared.md` | every fact two or more таски need, once, as `### F-<n>`; absent when none is shared |
| `.maestro/<dir>/tasks/units.json` | the unit, frame, fact and `interfaces.md` hashes `--plan-units --record` took after the last covered round |
| `.maestro/<dir>/plan-reads/` | each G3 reader return of each round, as `r<round>-<NN>.md` or `r<round>-consistency.md` |
| `.maestro/<dir>/tasks/NN-<slug>.md` | one file per таск, each self-sufficient |
| `.maestro/state.js` | `tasks[]` filled whole — ids, `requirementIds`, `blockedBy`, `wave`, `zone`, counters at zero; `G3` recorded as passed |

## Journey And Control Ownership

Entry: current journey/check specifications and selected critical controls.
Open [verification-procedures.md](../references/verification-procedures.md).
1. Allocate J-N and required C IDs. Record complete journey fields and ordered
   actions/assertions, fixture/variants/reset/cleanup. Check/task owners match.
2. Cut verification-only tasks after every integration dependency; populate
   blockedBy, executionTaskId and integrationDependencies accordingly. Their
   briefs contain commands, setup, expected observations, oracle provenance,
   relevant inputs, tool requirements, capture schema and cleanup, not a link
   to full spec or phase files.
3. Allocate NC-N not_run selections with critical basis/applicability and named
   defect, unchanged expectedAssertion/oracleDigest, main/isolation fingerprints.
4. Task-reader checks the actual complete brief with the executor's bounded
   inputs. Missing procedure, assertion, isolation or dependency is a finding.
5. Publish graph before G3. Valid: verification task waits for reviewed startup
   and persistence implementation. Invalid: execution scheduled before required
   dependency or a task that must open spec.md to discover its assertions.
Output: executable owned journeys/control selections. Next action: G3 and build dispatch. Missing tool/capability
remains an explicit unavailable path in the task, never permission to pass.

Then read the build phase file.
