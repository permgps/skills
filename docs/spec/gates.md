# Gates

Four gates. Each one runs after a phase, in every mode, at every depth. A gate
that fails is not a warning: the phase is redone.

| Gate | After phase | Pass condition |
|---|---|---|
| G1 | briefing | Every требование has a status, and none is left open without a recorded reason |
| G2 | spec | Every live требование is in-spec, deferred, or dropped with zero left open, **and** an independent reader given only `brief.md` and `spec.md` finds nothing missing |
| G3 | plan | Every in-spec требование maps to at least one таск, **and** every таск traces back to at least one требование, **and** a reader given exactly what an executor will be given finds every task file buildable without asking a question |
| G4 | acceptance | The build is checked against `manifest.md` and the dated additions in `brief.md`, with `spec.md` and the бриф's original text withheld, and every disagreement is reported |

## Evidence

| Gate | What proves it |
|---|---|
| G1 | The requirement status map in the run state has no `open` entries lacking a reason |
| G2 | The status map plus the independent reader's findings, recorded as a list that is empty or acted upon |
| G3 | The two-directional map between requirement ids and task ids, with no unmatched entry on either side, plus the task-file reader's findings, recorded as a list that is empty or acted upon |
| G4 | The acceptance findings, each naming the requirement id it disagrees with |

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

Two gates are decided in part by a subagent — G2 and G4 — and each of those
readers is handed a fixed list of things. The same list otherwise lives in five
places: this table, the phase table, the phase file, the reader's own brief, and
`SKILL.md`. The last of those is the one that drifts, because it is the one
nothing compares.

So the list gets a machine-readable form. `scripts/validate/gate-readers.ts`
holds every reader's brief to the two columns below, name for name: a name
present in one and not the other is a finding that names both places.

| Gate | Reader's brief | Given | Withheld |
|---|---|---|---|
| G2 | `independent-reader.md` | `brief.md`, `spec.md` | the манифест, `answers.md`, this phase's own reasoning |
| G4 | `acceptance-reader.md` | `manifest.md`, the additions block of `brief.md`, the running build | `spec.md`, the plan, the task files, `reviews/`, the бриф's original text |

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
attempts. A требование nobody can build is a fact about the требование, and it
is reported rather than retried a third time.
