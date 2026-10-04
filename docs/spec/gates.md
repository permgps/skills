# Gates

Four gates. Each one runs after a phase, in every mode, at every depth. A gate
that fails is not a warning: the phase is redone.

| Gate | After phase | Pass condition |
|---|---|---|
| G1 | briefing | Every требование has a status and no unexplained open entry; contract 5 also requires a fresh returned independent source audit and frozen initial agreement |
| G2 | spec | Every live требование is dispositioned; independent intent and raw-reference passes find no unresolved mandatory coverage gap |
| G3 | plan | Every in-spec требование maps to an obligation and implementation owner; every required check has an execution owner that transitively depends on each integration dependency; no two таски share a file unless one transitively blocks the other; a task reader finds each task executable, and a plan-consistency reader given every task file finds no coordination defect between them |
| G4 | acceptance | Current, applicable evidence and independent discovery cover the current contract; failures and incomplete checks are reconciled under [`verification.md`](verification.md); contract 6 also closes `completed` with no open defect, and stops after an exhausted budget only with a `budget_exhausted` strategy review |

## Evidence

| Gate | What proves it |
|---|---|
| G1 | The status map has no unexplained open entries; v5 has a current source/manifest audit and initial agreement baseline |
| G2 | Status map, obligation/source coverage map, independent intent and raw-reference discovery findings |
| G3 | Requirement → obligation → implementation task and obligation → check → execution task mappings, including verification-only tasks |
| G4 | Current check executions, complete coverage reviews, union of substantiated findings, and a fresh acceptance round |

The requirement id is what makes a finding evidence rather than an opinion. A
G4 finding that names no `R##` cannot be counted against the coverage the
dashboard renders, cannot be handed to whoever repairs it, and cannot be told
apart from a remark about the build — so it does not satisfy the gate it was
produced by.

## Why The Manifest Is Checked Twice

G2 and G4 are the same question asked at the two ends of the run: does this match
what the user actually said, with our paraphrase of it taken away. G2 asks while
the answer is still a paragraph of spec and cheap to change. G4 asks when it is
the last chance to know.

Everything between them measures against the contract the executors were
actually given — the task file the plan cut out of `spec.md`, and the
boundaries in `interfaces.md`. Not `spec.md` itself: an executor never sees
it, and judging one against words it never saw produces findings nobody can
act on.

## What "Blind" Means

At G4 the acceptance check is performed by a reader that has `manifest.md`, the
dated additions in `brief.md`, and the running build, and does **not** have
`spec.md`, the plan, the task files, the review notes, or the бриф's original
text. The withholding is the mechanism: a reader who has seen the specification
will confirm the specification, not the бриф.

**The бриф's original text is withheld, and its additions are not.** That reads
like an inconsistency and it is not one. The original text is what the манифест
was numbered from, and it was shown back to the user at G1 as the agreed
contract — so a reader holding both would be holding two copies of one thing and
would answer from the looser one exactly where they disagree, which is the
disagreement this gate exists to surface. An addition never passed G1. It is
what the user said *after* the contract was agreed, and no reading of it has
been agreed by anybody, which is precisely why it has to travel as the user's
words alone rather than as a paraphrase — and why the reader is told, in its own
brief, that the quotation wins over any line the прогон wrote beside it.

### What Each Independent Reader Is Given

Source audit precedes agreement and is a G1 prerequisite; G2 and G4 also use
independent subagents. Each of those
readers is handed a fixed list of things. The same list otherwise lives in five
places: this table, the phase table, the phase file, the reader's own brief, and
`SKILL.md`. The last of those is the one that drifts, because it is the one
nothing compares.

So the list gets a machine-readable form. `scripts/validate/gate-readers.ts`
holds every reader's brief to the `Given` and `Withheld` columns below, name for name: a name
present in one and not the other is a finding that names both places.

| Gate | Reader's brief | Given | Withheld |
|---|---|---|---|
| G1 source | `manifest-reader.md` | redacted source snapshots, candidate manifest | coordinator clause inventory, spec.md, answers.md, tasks, prior audit conclusions, `prior.md` |
| G3 consistency | `plan-consistency-reader.md` | every task file, `interfaces.md` | `spec.md`, `manifest.md`, `prior.md` |
| G2 intent | `independent-reader.md` | `brief.md`, `spec.md` | the манифест, `answers.md`, this phase's own reasoning, `prior.md` |
| G2 reference | `reference-reader.md` | user preservation request and current additions, neutral reference register, raw reference sources | generated inventory conclusions, implementation rationale, prior verdicts, `prior.md` |
| G4 | `acceptance-reader.md` | `manifest.md`, the additions block of `brief.md`, neutral raw reference register and capture identity, the running build | `spec.md`, the plan, the task files, `reviews/`, prior dispositions, the бриф's original text, `prior.md` |

The reference reader's first discovery pass is not bounded by the generated
inventory. The orchestrator then reconciles its findings with all other
origins and executes the scheduled checks. A source signature or matching
digest cannot satisfy a browser behavior check. A browser capability limit
makes affected checks incomplete, with G4 `pending` unless an established
failure already makes it `failed`. Required parity is checked even when polish
is disabled. A completed acceptance stage says the phase ran; it does not
imply G4 passed or the product is verified.

A name in `Given` is something the reader's brief must declare it has; a name in
`Withheld` is one it must declare it does not have and will not ask for. The
list is short on purpose — a reader handed more than this stops being a reader
and becomes a second opinion on work it has already seen.

## Failure Behavior

- A failed gate returns control to the phase it follows. That phase runs again
  with the gate's findings as input.
- A gate may fail twice on the same finding. On the third failure the run stops
  and reports what cannot be satisfied, rather than looping.
- A gate is never "passed with notes". Findings are either acted on, or recorded
  as an explicit deferral against a requirement id, which itself changes that
  requirement's status.
- A G3 finding from the plan-consistency reader, or a mechanical collision, is a
  coordination defect. It is fixed in the task files or `interfaces.md` before
  any executor is dispatched and never reduces a requirement.

### G4 Cannot Send Its Phase Back

The first rule above was written for the three gates that can. Приёмка re-run
against the same манифест and the same build produces the same finding: acting
on a disagreement means changing the build, and the build is not what this phase
touches.

So G4 fails sideways rather than backwards. `report.md` is written whether the
gate passed or not — it is the record of what disagreed, and withholding it on a
failure would delete the evidence at the moment it matters most. G4 is recorded
`failed` with its findings, and **each disagreement travels to the repair phase
through the таски that carry its `R##`.** When those таски have been repaired and
re-reviewed, приёмка runs again — against a build that is now different, which is
the one condition under which asking the same question twice can produce a
different answer.

The two-failure budget above is what stops this from circling. A disagreement
that survives two repairs stops the прогон, which names the требования and both
attempts. Under contract 6 the stop follows the repair budget and its strategy
reviews: a disagreement becomes defects under the таски that carry its `R##`,
a batch that closed no таск triggers a strategy review, and a stop after an
exhausted budget carries the `budget_exhausted` review. A требование nobody can build is a fact about the требование, and it
is reported rather than retried a third time.

## Completion Extension Routing

Source audit is not a fifth gate. Read the bounded original-language snapshots
and candidate manifest in a fresh dispatch, discover clauses independently, and
return anchored mappings/findings before agreement. Later blind acceptance gets
neither snapshots, clause/audit conclusions, nor planned journeys or controls
in its initial handoff. Scheduled execution follows independent discovery.

G4 `pending` is an explicit output when checks, controls, independent returns or
required external prerequisites are missing. A startup code defect opens
`startup-defect`; a service/tool/value limitation records unavailable checks.
A coverage omission opens `coverage-omission` and adds check/task ownership,
invalidating affected passes. Repair never passes G4 itself. All mode/depth
combinations and polish off keep these rules. Exact records and transitions
live in [verification.md](verification.md).

Under contract 6, a failed readiness probe opens no repair door at all: it is
setup, corrected by a superseding readiness record. An unavailable probe makes
only the checks that declare it unavailable, and G4 `pending`. A product
failure on a ready candidate opens its door as before, as a defect under the
parent таск. Progress between rounds is reported as defects verified and таски
closed, never as findings filed.

## Codex Gate Dispatch

The [shared host contract](hosts.md#shared-codex-execution-contract) applies to
CLI and app independently. No reader receives coordinator history or the runtime
recipe. Use the declared Given/Withheld inputs and a full role prompt, with
fresh context explicitly selected. Missing isolation, an actual final return,
or trustworthy input evidence cannot establish a gate pass. Opaque envelopes
remain opaque; filesystem visibility and prompt inputs are separate evidence.
