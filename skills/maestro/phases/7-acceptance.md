# Phase 7 — Приёмка

Read when every таск is `done` and its review is written. This is the last phase
of the прогон, and the only one that measures what was built against what the
user actually asked for rather than against something the прогон wrote about it.

You compose here, and you do not fix. `S5` holds at the end exactly as it held
at the start: a disagreement found now is not a defect you may put right before
writing it down. What you produce is the отчёт and a run state that says how it
ended.

## Steps

### 1. Bring the build up

The reader is given the project as it runs, not as it reads. Start it, or bring
it to the closest thing a project of this kind has to running.

If it will not come up, **that is not a failed gate — it is a build defect.**
Report it, stop, and say what would not start. A gate that could not be run has
checked nothing, and recording it as failed would send a прогон into repair over
a требование nobody looked at.

### 2. Hand it over blind

One reader, briefed by
[`../prompts/acceptance-reader.md`](../prompts/acceptance-reader.md), given
`manifest.md` and the running build. **Nothing else travels with them** — not
`spec.md`, not the plan, not the task files, not `reviews/`, and not `brief.md`.

You are holding all of those. That is the difference between you and the reader,
and it is the whole mechanism of this gate: what you know about how the
specification was written is exactly what would make a reader confirm it instead of
checking it.

The reader gets the whole манифест, including требования you know were deferred
or dropped. It is not told which; that is decided against its answer, in the next
step, and telling it beforehand would hand it the conclusion.

### 3. Sort what came back

Each thing the reader returned is one of three, and the run state's requirement
statuses are what tell them apart:

| What came back | Against a требование that is | It is |
|---|---|---|
| a finding | `in-spec` | a **disagreement** — a G4 finding, recorded against its `R##` |
| a finding | `deferred` or `dropped` | confirmation that what was set aside really was not built — it belongs in *What is left*, not in G4 |
| unchecked | any | carried into the отчёт as unchecked — neither passed nor failed |

A finding naming an `R##` that is not in the манифест at all is about the прогон,
not about a требование: record it as it came and say so, rather than dropping it
because it did not fit the table.

**Do not reclassify a disagreement into an observation** because the build is
otherwise finished. `in-spec` means the прогон undertook to build it.

### 4. Write the отчёт

`.maestro/<slug>/report.md`, written **by you**, in five sections and in that
order. A second приёмка — after repair, or after доводка — appends its own five
sections under its own date rather than replacing what is there:

| Section | Holds |
|---|---|
| What was asked | every `R##`, its status, and where it landed |
| Disagreements | the G4 findings, each quoted against its требование |
| Assumptions | every placeholder standing in for a fact nobody supplied, and every wording whose translation was uncertain |
| Observations | the non-blocking findings carried out of `reviews/` |
| What is left | deferred and dropped требования, each with the reason recorded against it |

A section with nothing in it says so in one line. An absent section reads as a
section nobody wrote.

Findings are quoted as they came back, not summarised — yours is the copy
anybody checking the прогон will read, and a rewritten finding cannot be checked
against its original. **The отчёт is English**, like every other file this прогон
writes.

### 5. Close the round

Write the state once, at this boundary: G4 `passed` with no findings, or `failed`
with them.

`finishedAt` and the acceptance stage's `done` are written **only when nothing
else is due** — G4 passed, and either the finish dial is off or доводка has
already run. A round that sends disagreements to repair leaves both unset: a
прогон marked finished while work is still routed out of it is a dashboard
telling the user something that is not true.

Then say in Russian what the отчёт contains — what was asked and what was
delivered, what disagreed, what was assumed. Labels are resolved from the
словарь at that moment; the отчёт itself stores none of them.

## When It Does Not Go That Way

**G4 has findings.** The отчёт is written anyway — it is the record of what
disagreed, and withholding it deletes the evidence at the moment it matters
<!-- maestro:opens:g4-disagreement -->
most. Then each disagreement travels to the repair phase — `SKILL.md` names the
file — through the таски that carry its `R##`. When those have been repaired and
re-reviewed, this phase runs again and appends a second round to the отчёт. A
disagreement that survives two repairs stops the прогон and is reported as one
nobody could close.

**The reader asks for `spec.md` or the бриф.** Refuse, and record that it asked.
Handing either over ends the gate — not the reading, the gate — because the
answer that comes back afterwards is no longer blind and nothing in the прогон
can tell that it was not.

**Everything came back unchecked.** That is not a passed gate with an asterisk.
The build was not exercised at all, and the отчёт says so plainly, in the
Disagreements section rather than tucked into a list at the end.

**A таск is not `done`.** Приёмка arrived early: the review phase either has not
run or found something blocking, and the build in front of the reader is not the
build the прогон would accept. Stop and say which таск.

## The Dials Here

**No mode changes this phase.** The отчёт is written in all four columns, and
Assumptions is a section of it in all four — `full` changes how much lands there,
never whether the section exists.

**No depth changes what G4 checks.** The манифест is the same document at every
depth: it is the user's own words numbered, and depth decided only how far
beneath them the прогон worked. A `strict` run is checked against the same
требования as a `deep` one, and a reader told the depth would start grading the
build against how thorough it was expected to be rather than against what was
asked.

## Gates

**G4**, and it is the last one.

It passes when the build has been checked against `manifest.md` with `spec.md`
withheld, and every disagreement has been reported. It is the twin of G2 asked at
the other end of the прогон: the same question — does this match what the user
actually said, with our paraphrase of it taken away — asked when it is the last
chance to know rather than when it is still cheap to change.

## Output Of This Phase

| Artifact | State |
|---|---|
| `.maestro/<slug>/report.md` | five sections for this round, appended; findings quoted as they came back |
| `.maestro/state.js` | G4 `passed` or `failed` with its findings; the stage `done` and `finishedAt` only when nothing else is due |
| project code | unchanged — this phase writes none of it |

The прогон is over unless one of two things is due, and both have rules of their
own that `SKILL.md` names: **доводка**, if the finish dial asked for it, and then
the **memory** phase, which runs last because it describes the code as it finally
is.
