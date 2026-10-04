# Phase 4 — План

Read when the specification has passed G2. This phase cuts `spec.md` into таски
and writes down the boundaries between them. It ends at G3, and it is the last
phase before project code exists.

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

A tiny project produces **one** таск carrying every relevant spec criterion in
its own file — one, not none. The executor is not given `spec.md` separately.
Somebody is handed the work either way, and the unit one executor is handed is a
таск. Cutting one требование into three таски to look thorough costs three
contexts and three reviews to build what one executor finishes in one pass.

### 3. Write `interfaces.md`

The boundaries **you derived from the spec**: module names, function and endpoint
signatures, data shapes, and which таск owns which files. This is how two таски
running at the same time agree without talking to each other.

- Written once, by this phase. **Never appended to later.**
- What finished таски actually built goes to `discovered-interfaces.md`, whose
  writer is the build phase. Two files exist because one file written by two
  phases has no owner, and the first disagreement between them would be
  unattributable.
- A boundary you are guessing at is a boundary the cut is wrong about. Re-cut so
  the guess is inside one таск.
- Before the Seams, it carries a **Terms** table, one row per domain word that
  more than one task file uses, or that the user said:

  | Term | Meaning | Words to avoid | User's wording |
  |---|---|---|---|

  *Meaning* says what the word counts, holds or names, in one line an executor
  can build from. *Words to avoid* lists the near-synonyms that would make two
  таски name one thing two ways. *User's wording* quotes the original-language
  span from the run state's `verification.sourceClauses` when the term came
  from the user, and `—` when the прогон coined it. Terms the memory block in
  `prior.md` carries are taken over as they are, unless the манифест changed
  their meaning. If it did, the row says `contradicts <date> decision,
  because …`. This table exists because of the incident step 5 tells: a task
  file used «a running score» and never said what it counts.
- It ends with a **Seams** table — seam, producer task, consumer tasks,
  integration owner, integration check — one row per route, DTO, migration,
  port or file that one таск produces and another consumes. A seam with no
  row is a seam two executors will each guess at.

### 4. Write the task files

One file per таск at `.maestro/<dir>/tasks/NN-<slug>.md`, numbered in dependency
order. **An executor is given its task file and `interfaces.md`, and nothing
else** — it does not get `spec.md`. Anything from the spec the таск needs must
therefore be *in* the task file.

Each file carries:

| | |
|---|---|
| Id and title | `NN` and one line saying what will exist when it is done |
| Требования | the ids it serves, so the review and G3 can both find them |
| What to build | the relevant part of the spec, restated in full — not a pointer to it |
| User contract and authority | exact redacted request/addition quotations with their SRC/CL IDs and source digest; neutral raw reference locations and conditions, and approved deviations; no unrelated spec or rationale |
| Verification map | obligation/check IDs, observable behavior, implementation owner if needed, execution owner, integration prerequisites, and applicable variants |
| Boundaries | which files this таск owns, and which signatures from `interfaces.md` it must meet |
| Done means | what the executor checks before returning, in terms it can check |
| Depends on | the таск ids that must finish first, or none; execution-only tasks may have no implementation files |
| Prerequisites | each thing this таск consumes, named with the таск that produces it and its row in the Seams table of `interfaces.md` |
| Forbidden writes | always `.maestro/`, plus every zone another таск owns |
| Completion artifacts | what must exist when the таск is done; every one lies inside the files this таск owns |

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
one question: could you build this without asking a question?

They are independent of each other, so they go out at once and the wave is as
wide as the host allows.

The reader checks ownership and feasibility: **a task requiring a visible
viewer takeover, a missing headless prerequisite, or work another task owns is
a finding.** A required rendered criterion with an executable headless path is
valid. The reader must also see each obligation/check ID and enough raw oracle
provenance to know what result the task should test.

Then hand **every** task file at once, with `interfaces.md`, to one more fresh
subagent briefed by
[`../prompts/plan-consistency-reader.md`](../prompts/plan-consistency-reader.md).
It is not given `spec.md` or the манифест. It looks between tasks: collisions,
unowned artifacts or writers, completion artifacts outside allowed writes,
prerequisites no upstream task produces, producer/consumer disagreement on a
route, method, DTO, migration or port, and stale formatter or project-rule
instructions. Each `CD-N` it returns is a coordination defect, fixed in the
task files or `interfaces.md` before dispatch; it never reduces a requirement.
Log INFO with the verdict and the counts of tasks and findings, and WARN once
per `CD-N`. The same reader is dispatched again when repair finds a defect
that crosses tasks.

Act on every finding by editing the task file, here, before any executor sees
it. Then record them in the G3 entry of the run state — an empty list is a real
answer, and a gate passed while carrying findings is not passed.

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

### 7. Write the таски into the run state

**The whole `tasks[]` array is written now, when the таски are cut** — not as
each one starts. Every entry carries its id, title, `status`, `requirementIds`,
`blockedBy`, `wave`, `zone`, and the three counters at zero.

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
| `manual` | the plan is discussed and the прогон waits for approval |

`manual` and `interview` differ in exactly two places, and this is the second.

**Depth has already been spent, and the cut does not spend it again.** `strict`,
`normal` and `deep` decided how far beneath the бриф `spec.md` reaches; by the
time you are cutting, that decision is in the document in front of you. A `deep`
прогон produces more таски because the specification grew, never because the same
work was cut finer — splitting one таск in three to look thorough costs three
contexts and three reviews to build what one executor would have finished in one
pass.

## Gates

**G3 runs after this phase.** It has two halves, and the second one is step 5:
the task-file readers and the plan-consistency reader.

The map between требования and таски holds in **both** directions:

- every `in-spec` требование maps to at least one таск — nothing the user asked
  for was dropped on the way from the spec to the cut;
- every таск traces back to at least one требование — nothing was added that
  nobody asked for.

The mechanical half also refuses two таски that share a path in their files or
zone with neither blocking the other, and a check whose execution owner does
not transitively depend on each of its integration prerequisites.

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
- **G3 is never passed with notes.** A finding is acted on, or recorded as an
  explicit deferral against a requirement id — which is itself a status change,
  and one only the user can make.

## Output Of This Phase

| Artifact | State |
|---|---|
| `.maestro/<dir>/interfaces.md` | written once, the boundaries derived from the spec |
| `.maestro/<dir>/tasks/NN-<slug>.md` | one file per таск, each self-sufficient |
| `.maestro/state.js` | `tasks[]` filled whole — ids, `requirementIds`, `blockedBy`, `wave`, `zone`, counters at zero; `G3` recorded as passed |

Then read the build phase file.

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
