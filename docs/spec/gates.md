# Gates

Four gates. Each one runs after a phase, in every mode, at every depth. A gate
that fails is not a warning: the phase is redone.

| Gate | After phase | Pass condition |
|---|---|---|
| G1 | briefing | Every требование has a status, and none is left open without a recorded reason |
| G2 | spec | Every live требование is in-spec, deferred, or dropped with zero left open, **and** an independent reader given only `brief.md` and `spec.md` finds nothing missing |
| G3 | plan | Every in-spec требование maps to at least one таск, **and** every таск traces back to at least one требование |
| G4 | acceptance | The build is checked against `manifest.md` with `spec.md` withheld, and every disagreement is reported |

## Evidence

| Gate | What proves it |
|---|---|
| G1 | The requirement status map in the run state has no `open` entries lacking a reason |
| G2 | The status map plus the independent reader's findings, recorded as a list that is empty or acted upon |
| G3 | The two-directional map between requirement ids and task ids, with no unmatched entry on either side |
| G4 | The acceptance findings, each naming the requirement id it disagrees with |

## Why The Manifest Is Checked Twice

G2 and G4 are the same question asked at the two ends of the run: does this match
what the user actually said, with our paraphrase of it taken away. G2 asks while
the answer is still a paragraph of spec and cheap to change. G4 asks when it is
the last chance to know.

Everything between them measures against `spec.md`, because that is the contract
the executors were given. Judging an executor against words it never saw produces
findings nobody can act on.

## What "Blind" Means

At G4 the acceptance check is performed by a reader that has `manifest.md` and
the running build, and does **not** have `spec.md`, the plan, the task files, or
the review notes. The withholding is the mechanism: a reader who has seen the
specification will confirm the specification, not the бриф.

## Failure Behavior

- A failed gate returns control to the phase it follows. That phase runs again
  with the gate's findings as input.
- A gate may fail twice on the same finding. On the third failure the run stops
  and reports what cannot be satisfied, rather than looping.
- A gate is never "passed with notes". Findings are either acted on, or recorded
  as an explicit deferral against a requirement id, which itself changes that
  requirement's status.
