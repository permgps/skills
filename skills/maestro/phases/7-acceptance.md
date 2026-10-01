# Phase 7 — Приёмка

Read when every таск is `done` and its review is written. This is the last phase
of the прогон, and the only one that measures what was built against what the
user actually asked for rather than against something the прогон wrote about it.

You compose here, and you do not fix. `S5` holds at the end exactly as it held
at the start: a disagreement found now is not a defect you may put right before
writing it down. What you produce is the отчёт and a run state that says how it
ended.

**A требование the user withdraws or adds while приёмка is running is not a
finding for you to weigh.** It goes through the briefing phase's procedure, in
that phase's order — the additions block of `brief.md` first, then the run state,
then the plan — and that happens before the reader is handed anything, because
the additions are one of its inputs and a change that reached the state and not
the бриф is invisible to it.

<!-- maestro:codex:dispatch -->
On Codex CLI or app, open [the native runtime recipe](../references/codex.md)
before each independent role dispatch in this phase. Use a fresh native child,
the full role prompt and only this role's allowed inputs; observe its actual
final return before importing results. The recipe is coordinator-only.

## Steps

### 1. Bring the build up

The reader is given the project as it runs, not as it reads. Start it, or bring
it to the closest thing a project of this kind has to running. Record readiness
for this candidate first, under the Readiness Protocol in
[verification-procedures.md](../references/verification-procedures.md): a
readiness record from the build phase is current only while its build and
runtime identity equal this candidate's.

If startup fails, classify before routing:
0. A failed readiness probe is setup, not product: correct it, record a
   superseding RD-N, and spend no repair attempt on it.
1. Capture exact documented launch command, sanitized error evidence, current
   build fingerprint, affected R/check IDs and owning task.
2. Assess prerequisites: missing external tool/service/value makes affected
   checks unavailable and G4 pending unless another observed failure exists.
   Continue independent checks; do not retry code for an absent service.
3. Reproducible syntax/import/startup code defect creates a stable finding and
   opens startup-defect with command/error/fingerprint/ownership/prerequisites.
   <!-- maestro:opens:startup-defect -->
4. Missing owner first repairs task coverage. Dispatch bounded repair via the
   resident router; it returns through review, relaunch and fresh acceptance.
   The startup observation can fail its check; an unperformed blind pass is
   still missing, never fabricated. Report both observed failure and unchecked work.
Valid: wrong import routes to owning task. Invalid: missing browser/service
starts an import-edit retry loop, or failure merely stops without repair route.

### 2. Hand it over blind

One reader, briefed by
[`../prompts/acceptance-reader.md`](../prompts/acceptance-reader.md), given
`manifest.md`, **the complete current additions block of `brief.md`**, neutral
raw reference locations/capture identity, and the integrated running build.
Compute and record a digest of this exact dispatched input set and target
revision before handing it off. If additions or another relevant input change,
invalidate the affected pass and dispatch fresh readers/checks.

**Nothing else travels with them** — not `spec.md`, the plan, task rationale,
task files, `reviews/`, previous verdicts/approvals, derived coverage, or the
бриф's original text. The original text is
withheld because it already became the манифест and was shown back to the user at
G1 as the agreed contract; the additions are handed over because they never
passed that gate and are the only record of what the user changed afterwards.
Hand the additions as they stand — the dated entries, quotation first, your own
line under each — and nothing else from that file.

You are holding all of those. That is the difference between you and the reader,
and it is the whole mechanism of this gate: what you know about how the
specification was written is exactly what would make a reader confirm it instead of
checking it.

The reader gets the whole манифест, including требования you know were deferred
or dropped. It is not told which; that is decided against its answer, in the next
step, and telling it beforehand would hand it the conclusion. The additions are
the exception, and only because they are the user's own record of that decision —
a withdrawal the user announced is not a conclusion you are leaking, it is
evidence they are owed.

The reader's initial exploration is independent of the generated inventory.
After it reports observations and limitations, reconcile against the current
obligation/check graph. Add omitted behavior as a stable-ID finding and use the
coverage-repair door; do not narrow the oracle to existing rows.
<!-- maestro:opens:coverage-omission -->

### 2b. Execute the scheduled verification contract

Separately replay every required check whose current fingerprint lacks an
applicable execution. Use the integrated build, applicable variants, real
browser input for UI interactions, and explicit non-UI checks elsewhere.
<!-- maestro:degrades:browser-verification -->
Validate invocation, assertions, reference/build/data/runtime identity and
hashed captures before importing results. A missing production value affects
its own obligation; independent obligations may still pass. Shared CSS/JS or
assets invalidate every check that declares them relevant. A digest or module
signature cannot pass a hover, visibility, or resource obligation. Preserve
customer review as a separate obligation when requested; automation cannot
impersonate the customer.

### 3. Sort what came back

Each thing the reader returned is one of four, and the run state's requirement
statuses are what tell them apart:

| What came back | Against a требование that is | It is |
|---|---|---|
| a finding | `in-spec` | a **disagreement** — a G4 finding, recorded against its `R##` |
| a finding | `deferred` or `dropped` | confirmation that what was set aside really was not built — it belongs in *What is left*, not in G4 |
| reported as withdrawn | `dropped` | the same confirmation, said the other way round: the user removed it and the reader read the addition saying so. It belongs in *What is left* with the withdrawal named |
| unchecked | any | carried into the отчёт as unchecked — neither passed nor failed |

The third row is the one this milestone added, and the second row is why it
matters. A reader that is not handed the additions can only see a withdrawn
требование as one the build never implemented, and reports it as a finding — the
false «R03 не реализовано» this phase used to produce. A reader that *is* handed
them can tell a removal from a gap, and the two rows stay apart.

A finding naming an `R##` that is not in the манифест at all is about the прогон,
not about a требование: record it as it came and say so, rather than dropping it
because it did not fit the table.

**Do not reclassify a disagreement into an observation** because the build is
otherwise finished. `in-spec` means the прогон undertook to build it.

Union substantiated findings from coordinator, executor, reviewer, independent
reader, user, and validator by stable failure ID. Origin records provenance,
not priority. Derive each applicable requirement as `passed`, `failed`, or
`incomplete` from current obligations, checks, coverage review, and open
findings. Preserve both failed and incomplete rows. An independent reader that
omits a requirement supplies no pass for it; a later coordinator finding can
invalidate an earlier reader pass.

### 4. Write the отчёт

**If this round closes the run, do step 5 first and write the отчёт after it.**
The closing publish takes `--wip` off the run directory, and an отчёт written
before it would name files under a directory that is about to be renamed. When
the outcome needs the user's authorization — `closed_with_exceptions` — present
the residual set in the chat, publish the closure on their answer, then write
the отчёт into the directory the result names as `relocated.to`. A round that
does not close the run writes the отчёт here, where the run already is.

`.maestro/<dir>/report.md`, written **by you**, in five sections and in that
order. Cite every run artifact by a path relative to the отчёт's own directory
(`tasks/03-hero.md`, `evidence/X-1/pointer.png`), never through
`.maestro/<dir>/`, so a later reopening cannot break a link. A second приёмка — after repair, or after доводка — appends its own five
sections under its own date rather than replacing what is there:

| Section | Holds |
|---|---|
| What was asked | every `R##`, its status, and where it landed |
| Disagreements | the G4 findings, each quoted against its требование |
| Assumptions | `debt` as the прогон recorded it — every placeholder standing in for a fact nobody supplied, every decision taken on the user's behalf, every unfilled variable by name — plus any wording whose translation was uncertain |
| Observations | the non-blocking findings carried out of `reviews/` |
| What is left | deferred and dropped требования, each with the reason recorded against it |

Build the acceptance table and closure summary from the same derived
verification projection used for G4: each applicable `R##` has a planning
status, `passed`/`failed`/`incomplete` result, obligation IDs, and open finding
IDs. Include current failures and incomplete checks together, accepted
exception scope, stale evidence, and outstanding promised work. Analysis may
explain a row but never replace its structured result or declare an unsupported
`completed` outcome.

A section with nothing in it says so in one line. An absent section reads as a
section nobody wrote.

**Assumptions is read out of the state, not reconstructed from memory.** The
phases wrote `debt` as they incurred it; assembling the list again here would
produce a second answer to the same question, and the two would differ exactly
on what was forgotten. What this phase adds is the last full suite result into
`tests`, and `finishedAt`.

Findings are quoted as they came back, not summarised — yours is the copy
anybody checking the прогон will read, and a rewritten finding cannot be checked
against its original. **The отчёт is English**, like every other file this прогон
writes.

### 5. Close the round

Publish an acceptance-round record with input digest, current reference IDs,
execution IDs, coverage-review IDs, finding IDs, per-requirement results, and
derived G4. G4 is `failed` when a current failure exists; otherwise `pending`
for missing, unavailable, stale, or promised evidence; `passed` only with full
current coverage. The phase's activity status does not decide this result.

Mark the acceptance stage `done` when its work for this round has run, even if
G4 failed. Close the lifecycle only when no promised work remains. `completed`
requires current passing G4. A user may authorize the exact presented residual
finding/obligation set and choose `closed_with_exceptions`; keep failed checks
and G4 visible. An explicit stop, unavailable prerequisite, or exhausted
repair budget uses `stopped_incomplete` with a reason. Stamp `finishedAt` only
at that closure transition, and in the same candidate set `dir` to the name
without `--wip` — every closure takes it off, whichever outcome. Publication
moves the folder and returns `relocated`; from then on every path, the отчёт's
included, is under the new name. Record any promised further round before offering
closure; a promise left open blocks every outcome.

Then say, in the прогон's language, what the отчёт contains — what was asked
and what was delivered, what disagreed, what was assumed. Labels are resolved
from the словарь at that moment, out of the column that language owns; the
отчёт itself stores none of them, and `report.md` on disk stays English either
way.

## When It Does Not Go That Way

**G4 has findings.** The отчёт is written anyway — it is the record of what
disagreed, and withholding it deletes the evidence at the moment it matters
<!-- maestro:opens:g4-disagreement -->
most. Then each disagreement travels to the repair phase — `SKILL.md` names the
file — through the таски that carry its `R##`. When those have been repaired and
re-reviewed, this phase runs again and appends a second round to the отчёт. A
disagreement that survives two repairs stops the прогон and is reported as one
nobody could close.

If the user changes the target, append a `scope_amendment` decision with old
and new target revisions and exact authorization, then verify the new target.
If the user accepts residual nonconformance, append an `accepted_exception`
decision with the exact displayed and selected finding/obligation IDs and
authorization. “All” means all in that captured presentation only; later
findings remain unaccepted. Neither decision rewrites a failed check as passed.

**The reader asks for `spec.md` or the бриф.** Refuse, and record that it asked.
Handing either over ends the gate — not the reading, the gate — because the
answer that comes back afterwards is no longer blind and nothing in the прогон
can tell that it was not.

**Everything came back unchecked.** That is not a passed gate with an asterisk.
The affected results are incomplete and G4 remains pending unless another
current failure exists. Name the limitations in the report.

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

**G4**, and it is the last one. Mandatory appearance and behavior fidelity
remain in G4 for every mode, depth, and `polish` setting.

It passes only when current required evidence and complete coverage pass after
blind discovery against manifest/additions, with spec withheld. Current failure
means failed; missing/unavailable/stale evidence or return means pending.
Reporting disagreements alone cannot pass. It is the twin of G2 asked at
the other end of the прогон: the same question — does this match what the user
actually said, with our paraphrase of it taken away — asked when it is the last
chance to know rather than when it is still cheap to change.

## Output Of This Phase

| Artifact | State |
|---|---|
| `.maestro/<dir>/report.md` | five sections for this round, appended; findings quoted as they came back |
| `.maestro/state.js` | G4 `passed`, `failed`, or `pending`; stage activity separate; `finishedAt` only at authorized lifecycle closure |
| project code | unchanged — this phase writes none of it |

The прогон is over unless one of two things is due, and both have rules of their
own that `SKILL.md` names: **доводка**, if the finish dial asked for it, and then
the **memory** phase, which runs last because it describes the code as it finally
is.

## Scope Progress Projection

Entry: frozen source agreement and current verification graph.
1. Derive original/current ScopeProgress from the same state as G4; do not count
   task/stage activity. Original denominator includes later exclusions.
2. Original numerator needs full frozen expectations with fresh evidence on
   this candidate. Unchanged conditions may reuse complete current checks;
   changed/split conditions require explicit original-compatible checks and
   complete coverage. Easier replacement, exclusion, split IDs or exceptions
   cannot inflate it. Current numerator counts fully passing live R IDs only.
3. Report each ratio once: e.g. original 18/20, current 18/18, two authorized
   deferrals. List added/deferred/dropped/changed R IDs and exception decisions
   separately. Missing baseline means not-established; empty scope means
   not-applicable, never 100%.
4. Current authorized target may close while original scope remains incomplete;
   preserve this distinction in report and memory. A historical v4 outcome stays
   meaningful while its new source/coverage safeguards remain unestablished.
Valid: 18/20 beside 18/18 and quoted decisions. Invalid: rewrite original total
into 18, count commits as proof, or turn accepted defects into passed R IDs.
Output: projection, not an independently editable scope verdict.

## Completion Reconciliation After Blind Discovery

Entry inputs: actual blind-reader return, current verification graph, integrated
build fingerprints, scheduled journey/control/readiness records, and scope
projection. Initial blind discovery keeps its existing withheld inputs.

1. Import the blind return and compare its independent observations with the
   scheduled graph only after discovery returns.
2. Execute every missing required journey step, clean start, restart, and real
   integration check under the declared scope. An omitted observation remains
   incomplete; a sandbox result covers its sandbox only.
3. Complete selected isolated controls with the unchanged oracle. Keep expected
   defect-copy failures out of production execution history.
4. Route reproducible startup defects and coverage omissions through repair,
   review, then fresh affected acceptance. Missing capability remains unavailable.
5. Derive G4 and scope progress, append the actual round, and use that projection
   for final wording. Full/strict/polish=false keeps every mandatory check.

Return: acceptance round identity, execution/finding/coverage IDs, projected G4,
original/current scope fractions or explicit unknown states, and limitations.
Valid: authorized deferral yields original 18/20 and current 18/18, with current
target completed only if G4 passes. Invalid: stage done or passing unit tests
called completed while restart was unobserved. Missing evidence keeps G4 pending.
