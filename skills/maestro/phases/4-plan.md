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

### 5. Write the таски into the run state

Every таск gets an entry in `tasks[]` with its id, title, `requirementIds`, and
`blockedBy`.

- `requirementIds` is never empty. That is half of G3, and the state validator
  refuses a таск without it.
- `blockedBy` holds the таск ids that must finish first. It is what bounds the
  wave width, together with file ownership.

### 6. Show it, by mode

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

**G3 runs after this phase.** It passes when the map between требования and таски
holds in **both** directions:

- every `in-spec` требование maps to at least one таск — nothing the user asked
  for was dropped on the way from the spec to the cut;
- every таск traces back to at least one требование — nothing was added that
  nobody asked for.

One direction alone is worth little. A cut can cover every требование and still
carry two таски invented along the way, and it can be entirely traceable while
quietly leaving a требование out.

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
| `.maestro/state.js` | `tasks[]` filled with ids, `requirementIds` and `blockedBy`; `G3` recorded as passed |

Then read the build phase file.
