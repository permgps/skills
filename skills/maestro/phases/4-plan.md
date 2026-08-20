# Phase 4 — План

Read when the specification has passed G2. This phase cuts `spec.md` into таски
and writes down the boundaries between them. It ends at G3, and it is the last
phase before project code exists.

You do not build anything here, and you will not build anything after it either
— `S5` holds for the whole прогон. What this phase decides is who gets handed
what, and what they may assume about each other.

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

A tiny project produces **one** таск carrying the whole spec — one, not none.
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

### 4. Write the task files

One file per таск at `.maestro/<slug>/tasks/NN-<slug>.md`, numbered in dependency
order. **An executor is given its task file and `interfaces.md`, and nothing
else** — it does not get `spec.md`. Anything from the spec the таск needs must
therefore be *in* the task file.

Each file carries:

| | |
|---|---|
| Id and title | `NN` and one line saying what will exist when it is done |
| Требования | the ids it serves, so the review and G3 can both find them |
| What to build | the relevant part of the spec, restated in full — not a pointer to it |
| Boundaries | which files this таск owns, and which signatures from `interfaces.md` it must meet |
| Done means | what the executor checks before returning, in terms it can check |
| Depends on | the таск ids that must finish first, or none |

A task file that assumes context the executor does not have is the defect this
phase produces most often. Read each one back as if you had never seen the spec.

### 5. Have each task file read by somebody standing where the executor will

Hand every task file to its own subagent, briefed by
[`../prompts/task-reader.md`](../prompts/task-reader.md), together with
`interfaces.md`. **Nothing else** — not `spec.md`, not the манифест, not the
other task files. It is given exactly what its executor will be given, and asked
one question: could you build this without asking a question?

They are independent of each other, so they go out at once and the wave is as
wide as the host allows.

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
the share of finished таски is zero out of zero.

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

**G3 runs after this phase.** It has two halves, and the second one is step 5.

The map between требования and таски holds in **both** directions:

- every `in-spec` требование maps to at least one таск — nothing the user asked
  for was dropped on the way from the spec to the cut;
- every таск traces back to at least one требование — nothing was added that
  nobody asked for.

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
| `.maestro/<slug>/interfaces.md` | written once, the boundaries derived from the spec |
| `.maestro/<slug>/tasks/NN-<slug>.md` | one file per таск, each self-sufficient |
| `.maestro/state.js` | `tasks[]` filled whole — ids, `requirementIds`, `blockedBy`, `wave`, `zone`, counters at zero; `G3` recorded as passed |

Then read the build phase file.
