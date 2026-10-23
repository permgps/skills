# Phase 5 — Разработка

Before any product/test repair dispatch, read and follow **Durable repair dispatch** in [verification procedures](../references/verification-procedures.md). Publish the reservation and dispatch receipt before invocation; pending work consumes budget. Settle the actual RA/check/evidence return before task advancement. On resume/reopen, reconcile pending entries and missing legacy accounting; never reset them.

Before discarding a workspace, follow **Durable import before workspace cleanup** and **Preserve reusable tools** in [verification procedures](../references/verification-procedures.md). Require the successful import/publication receipt. On resume verify declared replay bytes with `--project`; missing replay is unavailable. `_orchestrator/` is coordinator-only; blind readers receive none of it.

Read when the plan has passed G3, or the user moved past it at its round budget.
This is the only phase where project code appears, and it is the one phase where
you do not write any of it.

`S5` is not a preference here, it is the mechanism the whole order rests on. You
hold `spec.md`, the манифест and the plan; an executor holds one таск and the
boundaries. Handing over is what keeps those two facts apart, and a two-line fix
you make yourself collapses them for the rest of the прогон.

**A требование the user withdraws or adds mid-build does not go through your own
judgement about which таски it touched.** It goes through the briefing phase's
procedure, in that phase's order — the additions block of `brief.md` first, then
the run state, then the plan — and you stop handing out work in the files it
changes until that has happened.

<!-- maestro:codex:dispatch -->
On Codex CLI or app, open [the native runtime recipe](../references/codex.md)
before each independent role dispatch in this phase. Use a fresh native child,
the full role prompt and only this role's allowed inputs; observe its actual
final return before importing results. The recipe is coordinator-only.

<!-- maestro:dsh:dispatch -->
On dsh, open [the dsh recipe](../references/dsh.md) before each independent
role dispatch here: a fresh `subagent` child, never a fork or a reused one.

## External-contract freshness

Before dispatching affected work, compare every cited research fact's version
and assumptions to the current project. A changed or contradicted contract
requires the coordinator to open
[technical-research.md](../references/technical-research.md), publish a
superseding recheck, and revalidate affected spec/task facts under existing
D## amendment and G2/G3 rules. A new unresolved record invalidates the old fact.
An executor returns a blocker rather than silently replacing an interface.
No full research/ records or producer notes enter its dispatch.

## Steps

### 1. Read `tasks/` and `interfaces.md`

Every task file, and the boundaries the plan derived. Nothing else of the plan's
reasoning — you are executing a cut, not re-deciding it.

If a task file is missing something an executor would need, that is a G3 finding
arriving late. Say so and re-cut rather than filling the gap in the handover
message, which no artifact records.

### 2. Launch what is ready — the wave is already numbered

The plan phase assigned every таск a `wave` and a `zone`, and **neither is
recomputed here.** A таск is launchable when every id in its `blockedBy` has
finished; launch it then, even if a wave-mate is still running. A таск that
finishes early releases what it was blocking, and waiting for its whole layer to
land buys nothing.

Two rules bound what may fly together, and both still hold:

- every id in their `blockedBy` has finished, **and**
- no two of them own the same file — which is what the zones settle.

The dependency graph alone lets two таски edit one module from opposite ends;
file ownership alone starts a таск before what it builds on exists.

**Finished means `review` or `done`.** A blocker in `queued`, `running`,
`repair` or `failed` holds its dependents: what they would build on is not there
yet or has been found wrong, and their evidence would go stale the moment the
upstream repair lands. The run-state validator refuses the launch, so check
before you write `running`, not after.

When several таски are ready, launch first the one that unlocks the most
transitively blocked таски. A run closes by closing таски, and a ready upstream
таск that holds five others back is worth more than five independent leaves.

**What changed here, and why it is worth a paragraph.** This step used to say
«recompute the wave after each таск returns». Under that rule a таск had no wave
number until the moment it started, so there was nothing for the dashboard to
group by — and a number that is rewritten mid-прогон makes rows jump between
groups, which a user reads as the прогон losing its plan. The layer is now the
plan's, fixed at the cut; the frontier is still yours, recomputed every time a
таск lands.

### 3. Raise the worktrees — only if the wave is wider than one

| Wave | Where each таск runs |
|---|---|
| one таск | the project itself |
| two or more | one git worktree per таск, merged back as each finishes |

Isolation is a property of the wave, not of the таск. A wave of one has no
second writer to be protected from, and a build under the volume ceiling is
one таск carrying the whole spec — putting it in its own tree charges a merge
for nothing.

<!-- maestro:degrades:worktree-isolation -->
<!-- maestro:degrades:subagent-fan-out -->

**If a worktree does not come up, the wave is one таск wide.** Not two таски in
the project directory with a check afterwards that they touched different files:
that check passes on the прогон where it did not matter and is unavailable on
the one where it did — an executor that has already written over another's file
leaves the same tree as one that never tried. Narrow the wave, say in one line
that isolation was unavailable and what it cost in wall-clock, and carry on.
**A degraded прогон is a прогон.** The same is true when the host has no
subagent fan-out at all, arrived at from the other side: one таск per wave, and
every gate still runs.

Do not go looking for a repair. `git init` mid-прогон does not give the host a
worktree it decided it could not make; preflight settled that question and this
phase spends the answer.

### 4. Hand each таск over

Give the executor its task file and `interfaces.md`, and, when the прогон has
one, `codebase.md`, briefed by [`../prompts/executor.md`](../prompts/executor.md).
`codebase.md` is what the repository held before this прогон; it saves the executor a
rediscovery and never overrides `interfaces.md`. **Nothing else** — not
`spec.md`, not the манифест, not the other task files — with one named
addition: a таск with blockers is also handed the `D##` rows its blockers
recorded, taken from `discovered-interfaces.md` by the таск each row names,
for the таски in its own `blockedBy` and no further back. Those rows were
written for exactly this reader, and without this hand-over they reach no one. They are
facts, not contract: `interfaces.md` still wins, an executor that finds a row
disagreeing with it builds to `interfaces.md` and says so, and the review still
judges the таск against its task file and `interfaces.md` alone.

The task file's facts section, between the `maestro:facts` markers, was copied
from `shared.md` by the helper. It binds the executor like the rest of the file.
An executor that finds it wrong reports that in its return and never edits it:
the fact lives in `shared.md`, and a fix there reaches every таск that cites it.

**Dispatch the executor on its таск's tier**: the model the run state's
`models` names for `tasks[].model`, none at all for `session` or for a run
with no `models` (contract 7), and effort equal to the session's, as the
delegation rule in `SKILL.md` says. A retry is a repair
and runs `strong`; that is the repair phase's to dispatch, never this one's.

Name the absolute owned workspace as operational metadata, including when the
wave has one task and no worktree. Require the executor to verify it before any
write and set it explicitly on every shell call. Parent shell `cwd` changes do
not establish a child's default directory. Assign a capture location under that
workspace; never accept a result captured in another project as its evidence.

Set the таск to `running` in the run state at the moment you hand it over, and
write the state then: at the transition, never on a timer.

The executor writes project code and returns text. It does not write into
`.maestro/` — you do, from what it returned.

The same handoff assigns each required check its execution owner and integrated
prerequisites. A verification-only таск may own no implementation files. Give
the executor the relevant request excerpt inside its task file, never your prior
verdict or the unrelated full spec. References travel as the task file's
*References* row, and `reference.md` is never handed to an executor: it opens,
read-only, only the references that row names. For
browser checks, an owned headless local server may run the integrated app;
record its address and cleanup, without opening a user-visible viewer.

### 5. Take the result back

For an intermittent return, preserve all five attribution labels as execution
`intermittent` fields and import every sample, including failures. Follow
[intermittent-repairs.md](../references/intermittent-repairs.md); never import a
partial series as a completed repair. Newly observed mixed outcomes route through
repair before further diagnosis or additional unplanned runs.

For each таск that returns done, in this order:

1. **Check the return, then import its evidence.** Before reading anything
   else in it, run
   `node .maestro/sync.mts --returns-check <return file> --root <its worktree, or the project root> --base <the commit the таск was handed>`.
   Add `--owns-no-check` when the verification map names no check this таск
   executes: an implementation таск whose checks a verification-only таск
   runs returns no block, and without the flag an empty return is refused as
   a lost one.
   - Exit `1`: send the return back to the same executor once, in this wave,
     on the same tier, quoting each finding as the command printed it. **A
     resend is not a retry**: `retries` does not move, no repair is opened,
     and the executor finishes its own return. A second exit `1` makes the
     таск come back incomplete, and it goes to the repair phase like any
     other. Nothing of a refused return is read, its discoveries included.
   - Exit `2`: no return was read. Treat it as a missing return.
   - `unchecked` facts: git could not decide them. Hand them to the review in
     one line; they refuse nothing here.

   WARN `build` `return refused` with `{ taskId, findings, resend }`, where
   `findings` lists rules, never text. Then read each check-level result
   and its task-owned captures. Verify the check/obligation IDs, invocation,
   assertions, reference and integrated-build identity,
   fixture/runtime/variant and relevant input hashes. Copy captures into
   `.maestro/<dir>/evidence/<execution-id>/` under orchestrator ownership,
   seal them, and add the execution/evidence records to the same state
   candidate. Publish through `sync.mts --publish` only after validation.
   Preserve an unavailable or failed result as such. A block the verification
   procedures refuse for a reason the command cannot see goes back the same
   way, once, and never in as a pass. Keep earlier executions immutable after
   replay.
1a. **Append what it discovered** to `discovered-interfaces.md` as `D##` rows —
    one per fact another таск would otherwise learn again. Only a return
    step 1 accepted is read for them. An interface that came
    back different from `interfaces.md` is such a fact, and the difference is
    recorded rather than reconciled: `interfaces.md` has one writer and it is not
    this phase. Each row names the таск it came from — `D## — from таск NN —
    <fact>` — because step 4 hands a dependent its blockers' rows by that name.
2. **Merge its worktree back**, if it had one. The merge keeps its own message:
   its output decides whether there is anything to commit, and a conflict is
   reported against the plan, never committed.
3. **Commit and land it**, one commit per finished таск — yours, never the executor's, whose
   `commit:` only names the HEAD it worked on. A прогон survives a compaction and
   a crash by what is committed, and the review phase judges each таск against
   the diff of its own commit.

   The subject is the таск's id and title. After a blank line come exactly
   these two trailers, `Requirements:` listing the таск's `requirementIds` in
   id order, separated by a comma and a space:

   ```text
   Maestro-Run: <dir without --wip>
   Requirements: R01, R02
   ```

   Таск numbers and requirement ids restart every прогон, so the trailers are
   what ties a change in the history back to its требование and its run.

   Commit by pathspec over the таск's `files` — the paths its return
   delivered, which exist or were deleted — never over its `zone`: a zone is
   planned ownership, and `git add` and `git commit` fail on a zone path the
   таск never created. Publish the candidate that records it in the same
   message, in this order:

   ```sh
   git add -- <the таск's files>
   git commit -m "<id> <title>" --trailer "Maestro-Run: <dir>" --trailer "Requirements: <ids>" -- <the таск's files>
   node .maestro/sync.mts --publish <candidate> --land <NN> --expect '<last-updatedAt>' --holder '<token>'
   ```

   The candidate already carries the таск `review` (step 4), its `files`,
   `tests` and `finishedAt`. **Never copy the sha by hand:** `--land` reads
   `HEAD`, checks that the subject opens with the таск's id, that both trailers
   are this run's and this таск's, and that nothing in the таск's `zone` or
   `files` was left out of the commit, and only then appends the sha to
   `commits`. A commit that
   failed leaves a `HEAD` it refuses, so the commit's output need not be read
   before the publish. Log INFO `build` `landed` with `{ taskId, sha }`.

   A refusal names its rule, and the same command is never sent again
   unchanged. `land-dirty` means a path was left out: add it to the таск's
   `files`, make a second commit, and land again. `land-subject`, `land-run` or `land-requirements`
   means the commit itself is wrong for this таск: say so in one line and hand
   out no work in its paths until it is put right.

   **A таск whose return delivered no file has no commit.** A
   verification-only таск that only ran checks is the usual case: publish it at
   `review` without `--land`, and its `commits` stays as it was.
   <!-- maestro:degrades:version-control -->
   Where preflight found no version control, there is nothing to commit: say so
   once, and tell the review phase it will be reading the working tree rather
   than one таск's diff. There is no `--land` either: the plain `--publish`
   carries the таск to `review`. The прогон continues and every gate still
   runs.
4. **Mark it `review`** in the candidate the landing publishes — the таск is
   committed, not accepted. `done` is written by the review phase, which has
   not run yet; writing it here would mean the same word described a checked
   таск in one place and an unchecked one in another.

**Before launching the next wave, check the panel is still there.** If anything
in the wave's output mentions a user-visible page opened, or the `sync.mts`
call after the state write reported that the address moved, bring the panel back
the way step 5 of preflight says. This phase is the only one that runs субагенты,
so it is the only one where the panel is at risk from the прогон's own work; the
rest inherit the rule from `SKILL.md` and need nothing here.

Then take whatever became launchable and go back to step 3.

**Write each transition into `tasks[]` as it happens**, not in a batch at the
end. `running` and `startedAt` go in **before** the executor goes out, earlier in the same
message; `files`, `tests` and `finishedAt` when it returns, with the commit that
`--land` appends to `commits`. `retries`, `repairs` and
`handoffs` are incremented when they are spent. A таск left `queued` while its
executor is flying makes the screen a lie, and one left `running` through its
whole review does the same thing more quietly.

`handoffs` counts the times a таск outgrew a context and was relayed to a fresh
one. **It is not a defect count** — nothing was found wrong; the таск was long.
Its status stays `running` across a handoff, so the user sees one таск still
being written rather than one that failed and restarted.

**Debt is recorded when it is incurred, never assembled at the end.** A decision
taken on the user's behalf because nobody was asked joins `debt.assumptions` the
moment it is taken; an environment variable the build needs and nobody has filled
joins `debt.emptyEnv` **by name only** — S2 forbids a credential reaching disk,
and this list is where that is broken by accident rather than on purpose;
anything delivered beyond what was asked joins `additions` with the `R##` it
served. A debt card that reads zero for the whole прогон and fills at приёмка is
a claim nobody checked.

A relevant shared CSS/JS, reference, fixture, generated asset, or runtime
change invalidates only executions whose declared fingerprints depend on it.
Keep those executions as history, mark the current check stale, and schedule
fresh evidence. Record the exact oracle capture or authorized amendment behind
every baseline, threshold, or ignore mask. A mask tuned to make the current
output pass is a finding, not an oracle change.

A таск that comes back wrong and cannot be rescued by its retries is `failed`.
Leaving it `queued` or `running` reports work that is not happening; the one
door it opens is `not-done`, in the repair phase.

### What Shares A Message

Every message you send re-reads the whole of what is resident, so a landing
taken one step per message pays that read once per step. Steps that do not
decide each other share a message, sent in order:

- **Message A, the landing:** the `D##` rows, `git add`, the commit and
  `--publish <candidate> --land <NN>`, as step 3 says.
- **Message B, the start:** the `running` publish first, then the executor
  launches, then the one-line progress line when a wave closed. Whether a
  launch is legal depends on the landing's result, so A and B never share a
  message. The progress line goes out in B, never in a message of its own.

**A step whose output decides the next step keeps its own message:** the return
check, the evidence import, and the merge keeps its own message when the wave
was wider than one таск. This is a count of messages, not of turns: a turn
still ends only at a stop or at the end of the run.

**A rejected publish in a message whose launches already went out is the first
thing the next message handles, before anything else.** Read the refusal,
correct the candidate and publish it again with the launched таски `running`,
since they are. When the refusal is about the launch itself — a blocker not
finished, a file a running таск owns — that executor's return is never imported,
and the таск is launched again once the launch is legal; that relaunch is not a
retry, and `retries` does not move. Log WARN `build` `launch outran publish`
with `{ taskIds, violations, legal }` and say it in one line, for example
«публикация `running` отклонена после запуска T03: блокер T01 ещё не на ревью —
возврат T03 не принимаю, перезапущу после T01». It is never left silent.

<!-- maestro:degrades:ordered-tool-calls -->
**Where preflight found no ordered tool calls, every step is its own message:**
the commit, then `--publish --land`, then the `running` publish, then the
launches. `--land` still verifies `HEAD`, and nothing is skipped. Say once
that landings take more messages on this host; that is the whole cost.

## When It Does Not Go That Way

Each of these has its own visible outcome. None of them is handled by picking up
the keyboard.

<!-- maestro:opens:not-done -->
**A таск comes back anything other than done.** It belongs to the repair phase.
Say which таск and why, leave its files alone, and go there — `SKILL.md` names
the file. Do not retry it here: the decision between another attempt and an
amendment is what that phase exists to make, and a retry started without it looks
exactly like the failure it is repeating.

**A таск ran out of context.** Its executor said what is finished, what is not,
and what the next one needs. Write that to `tasks/NN-<slug>-handoff.md` and hand
the **same** таск over again with the handoff added to what it is given. This is
the only case where one таск is handed over twice, and the handoff keeps the
таск's tier: it continues the same build.

A handoff is for surprises. If several таски produce one, the cut was too large
— say so, because that is a fact about the plan and the next прогон inherits it.

**Two таски of one wave conflict on merge.** That is the file-ownership rule
being contradicted after the fact: the cut said they owned different files and
they did not. Report it against the plan. **Do not resolve the conflict** —
resolving it means deciding what the project's code should say, which is the one
thing this phase may not do.

**An executor asks for `spec.md`.** Refuse, and append
`SIG-<n> withheld-request — spec.md — executor <taskId>` to `signals`, `n` being
the list's length plus one. Log INFO `build` `signal recorded` with
`{ id, kind, taskId }`. A task file that sends its executor looking for the
specification is a task file that did not carry what it needed, and that is worth
knowing before the next таск repeats it.

### 6. Before leaving: open the door for what you recorded

<!-- maestro:opens:recorded-divergence -->
Read back the `D##` rows this phase wrote. A row that says a **delivered file
disagrees with what the build does** sends its таск to the repair phase now,
after the last wave, together with what the таск it depends on actually built.

That is a narrow set and it is worth stating what falls outside it. A row that
pins behaviour nobody specified, records an ordering, a performance number or a
signature that came back richer than planned, is a fact and opens nothing. A row
that reports a defect in a task file which the executor then resolved correctly
is also a fact — the code is right and the plan is what was wrong. What goes
through this door is the case where the product itself now says two things.

**Nothing else will catch it.** A review reads one таск against the contract that
таск was given, and a file that follows its own task file faithfully has no
blocking finding. G4 reads the build against the манифест, and a требование the
user never stated cannot be disagreed with. The first end-to-end прогон wrote
«carried to the repair phase» into such a row, no door existed, and the
divergence shipped — in a README describing a score the page does not keep.

## The Dials Here

**No mode changes this phase.** All four columns of the mode matrix say the same
thing about Разработка, and the reason is that nothing here is a question of
preference: what gets built was settled at G3, and how it gets built is not the
user's to be asked about.

**No depth changes it either, and this is where that is worth saying.** An
executor does not deepen its таск because the прогон is `deep`, and does not trim
it because the прогон is `strict`. Depth is a decision about scope, scope was
decided in the specification, and a таск file is the whole of what its executor
is measured against. A build that re-applied the depth dial would be adding work
no требование carries and no gate is looking at.

## Gates

**None.** Разработка is the second stage with no gate after it, and the only one
that produces code. What was built is checked by the review phase against the
task each executor was actually given, and at G4 against the манифест with the
specification withheld.

That is deliberate: a gate here would check the build against `spec.md`, which is
the document this phase already handed out. It would confirm the specification,
not the бриф.

## Output Of This Phase

| Artifact | State |
|---|---|
| project code | written by executors, one commit per finished таск |
| `.maestro/<dir>/discovered-interfaces.md` | `D##` rows appended as each таск returned |
| `.maestro/<dir>/tasks/NN-<slug>-handoff.md` | only for a таск that ran out of context; normally absent |
| `.maestro/state.js` | every таск `review`, or `repair` where a recorded divergence sent it back; `currentStage` moved on |

## Execute Journeys And Selected Controls

Entry: integrated reviewed prerequisites and complete verification-only brief.
Open [verification-procedures.md](../references/verification-procedures.md).
0. Before any broad suite, browser or integrated run, follow its Readiness
   Protocol for this candidate: a source-only copy without `.maestro/`, legacy
   trees, private settings or escaping symlinks, probes tried rather than read,
   and an RD-N record. `setup_failed` is yours to correct with a superseding
   record and spends no repair attempt; `unavailable` leaves dependent checks
   unavailable. After mass identical errors from one prerequisite, preserve and
   classify the run as `setup` and do not rerun it until readiness passes.
1. Dispatch the task with its full relevant journey/control procedure and no
   unrelated specification. It returns captures/results; you do not execute
   project code yourself or author its observations.
2. Import actual journey observations into ordinary executions. Require every
   ordered assertion, current fingerprint, readinessId, and failureCause on a
   failed or unavailable result. Missing result stays not_run.
3. Import control clean/mutated/restored returns separately. Compare unchanged
   oracle, isolated identity and main before/after identity; seal immutable
   captures under control-run IDs. Append superseding NC outcome, never a
   production execution for the intentionally broken copy.
4. A missed defect opens check-quality finding to check owner; unavailable tool
   leaves selected control incomplete. Preserve unrelated actual passes.
5. Cleanup only owned disposable servers/data. Route code/readiness failure to
   repair and fresh review; review never accepts a repair's own assertion alone.
Valid: restored pass and unchanged main input hashes. Invalid: oracle/mask
changed to accommodate a defect, or sandbox pass reported as real integration.
Output: sealed evidence and actual results; next action review then acceptance.

Then read the review phase file.
