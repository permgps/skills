# Phase 7b — Доводка

Read only when the finish dial asked for доводка, and only after приёмка has
written its отчёт. If the dial is off, this file is not opened at all.

Приёмка asked whether the build does what the user said. This asks something the
манифест cannot hold: whether it looks and feels like the thing they pointed at.
That standard is in `reference.md`, and nowhere else.

## Steps

### 1. Check that there is a standard to compare against

Read `.maestro/<slug>/reference.md`. If the брифинг recorded no comparables,
**доводка does not run.** Say so and stop: polishing against no reference means
polishing against your own taste, and nothing in the прогон would ever show the
user that is what happened.

### 2. Run a round

One reader, briefed by
[`../prompts/polish-reader.md`](../prompts/polish-reader.md), given the running
build and `reference.md`. Nothing else travels with them — not the манифест, not
`spec.md`, not the отчёт. A reader holding the требования starts reporting
missing features, and приёмка has already answered that question against a
document written for it.

**Up to three rounds. A round that returns nothing ends доводка**, whether it was
the first or the third. Three is a ceiling, not a quota; a round run to use up
the budget comes back with differences invented to fill it.

### 3. Sort what came back

| What came back | It is |
|---|---|
| the build does something differently from the reference | a доводка таск |
| the build would have to do something new | reported in the отчёт, **not built** |
| something the reference does not show | not a difference; record it and move on |

The middle row is the boundary and it does not bend. `S1` says a требование is
removed only by the user; this is that rule from the other side. Work added here
arrives after the last gate has run, so nothing in the прогон is measuring it.

### 4. Cut and hand over the таски

One таск per difference, cut the way the plan phase cuts: it owns its files, it
is one executor's whole job, and it says what *done* means in terms somebody
else can check. Hand each over with
[`../prompts/executor.md`](../prompts/executor.md), one commit each, and send
each one through ревью exactly as a build таск goes.

**You write none of this code** (`S5`), and you do not mark a доводка таск
`done` — that word is written by the review phase, here as everywhere.

### 5. Close доводка

When a round returns nothing, or the third round is finished, **приёмка runs one
more time** and appends its round to `report.md`.

The build the previous отчёт describes no longer exists. That is the same rule a
repaired прогон follows, and it is why the отчёт appends rather than replaces:
the earlier round is what the build was before it was polished.

Once only, after the last round — not after each one. What is being checked is
the build the user keeps.

## When It Does Not Go That Way

**`reference.md` is empty or was never written.** Доводка does not run. Say so;
this is not a failure, it is the dial having been set on a прогон with nothing to
compare against.

**Every round returns the same difference.** The third attempt is not a fourth
round. Stop, and report the difference in the отчёт as one доводка could not
close — three executors failing at the same visible thing is a fact worth
recording, and improvising a fourth attempt hides it.

**The reader asks for the манифест or the отчёт.** Refuse, and record that it
asked. What comes back afterwards is a comparison against the требования wearing
the shape of a comparison against the reference, and nothing downstream can tell
the two apart.

**A difference is a credential in the reference.** `S2`. Stop, name the
variable, advise rotation, re-run redaction over `.maestro/`.

## Gates

None follows доводка itself.

G4 is what follows, through the приёмка re-run in step 5. Доводка does not get a
gate of its own because it has no document of the user's to be measured against
— `reference.md` is what it measures *with*.

## Output Of This Phase

| Artifact | State |
|---|---|
| project code | changed by executors, one commit per доводка таск, each reviewed |
| `.maestro/state.js` | the доводка таски in `tasks[]`, each ending at `done` through ревью |
| `.maestro/<slug>/report.md` | one more приёмка round appended after the last доводка round |
