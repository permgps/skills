# Phase 6 — Ревью

Read when the build has come back and every таск sits at `review`. This phase
decides which of them become `done`, and it is the only look at the work against
the words its executor was actually given.

You judge here, and you do not fix. `S5` holds after the build exactly as it
held during it: a finding is not a defect you may put right between two
paragraphs, and a таск whose review blocked goes to repair rather than to your
keyboard.

**A требование the user changes while a review is running is not a review
finding, and it does not turn a таск red** — a reviewer judges one таск against
the file its executor was given, and that file did not change. It goes through
the briefing phase's procedure, in that phase's order: the additions block of
`brief.md` first, then the run state, then the plan.

<!-- maestro:codex:dispatch -->
On Codex CLI or app, open [the native runtime recipe](../references/codex.md)
before each independent role dispatch in this phase. Use a fresh native child,
the full role prompt and only this role's allowed inputs; observe its actual
final return before importing results. The recipe is coordinator-only.

## Steps

### 1. Read the таски

The run state's `tasks[]`, and the task file behind each one. That is what the
executors were handed, and this phase asks nothing that is not in them.

You are still holding `spec.md` from three phases ago. **The reviewers are
not**, and what you know from it does not enter a review: a finding that comes
out of the specification is a finding about the cut, and the cut was checked at
G3.

### 2. Take each таск's diff

**A таск's diff is the ordered union of its own commits — each one, and only
those:**

```
git show <commit> -- .        for every commit in tasks[].commits, in order
```

Before dispatch, confirm that every commit in that list exists and that the build
recorded it for this таск at its commit step. A commit git cannot show, or one the
list and the build disagree on, is a build defect to report, not a list to
reconcile by guessing.

**Not a range.** `commits[0]^..commits[-1]` carries every foreign commit that
landed between the original and its repair, and a reviewer handed it judges
other таски' code as this one's. Per-commit diffs ask the one question this phase
may ask: what did *this* таск do?

**Do not filter the diffs to the таск's zone.** List, beside the diffs, every
path those commits touched outside the files the task file owns. A write outside
the zone is exactly what the files check exists to catch, and a filter would hide
it.

**Then look for debug output a repair left behind.** In each таск's per-commit
diffs, a line added with `[maestro-debug:` that no later commit of the same таск
removes is a blocking finding of your own, before any reviewer is dispatched.
Write it into that таск's review file and import it into `verification.findings`
with origin `validator`. It names the tag id and the path, never the line: the
line is debug output, and debug output is where a value that should not travel
tends to sit. A tag whose id is not a `DF-N` counts the same — any
`[maestro-debug:` left behind is debug output left behind — and a removal in
another таск's commit does not clear it. Log WARN `review` `debug tag left` with
`{ taskId, commit, path, tagId }`.

**Then record what is hard to undo.** The отчёт tells the user which changes
are one-way before they build on top, and it reads them only from `oneWay` in
the run state. Read each commit's file list with
`git show --name-status --format= -M <commit>` and append one line per change:

| Kind | When |
|---|---|
| `deleted` | a `D` path that no run commit added — a run commit is any commit in any `tasks[].commits`, so a file the прогон created and later removed is not the user's |
| `renamed` | an `R` whose source path no run commit added; write `old → new` |
| `migration` | an added path under a directory named `migrations` or `migrate`, or under `alembic/versions`. A data migration elsewhere, named as one by the task file or the executor's return, is added by judgement |
| `dependency-major` | a version in `package.json`'s `dependencies`, `devDependencies`, `peerDependencies` or `optionalDependencies`, for a package on both sides, whose leading major changed — below `1.0` the minor counts as the major. A new package is not an upgrade. Read other manifests (`pyproject.toml`, `requirements.txt`, `Cargo.toml`, `go.mod`, `Gemfile`) by the same rule |

Each line reads `<kind> — <subject> — <taskId> <first seven of the commit>`,
for example `deleted — config/legacy.json — T03 a1b2c3d` or
`dependency-major — react ^18.2.0 → ^19.0.0 — T04 9f8e7d6`. Append a line once:
a review after a repair does not add a line that is already there. This is a
record, not a finding — it blocks nothing and goes to no reviewer. Log INFO
`review` `one-way changes recorded` with `{ taskId, kinds }`, where `kinds`
counts lines per kind and names no path.

**Do not review the tree.** By the time a repair lands, later waves are in it and
always will be — waiting for a quiet tree would serialise the build, which is the
one thing the wave order exists to avoid. A finding about what another таск put
in the tree is a finding about the wrong таск, and it has cost a real прогон
three uncheckable items already.

A таск with no commit to point at did not finish the way the build recorded it.
That is a build defect: report it and stop, rather than reviewing whatever sits
in the working tree and attributing it to a таск.

<!-- maestro:degrades:version-control -->
Where preflight found no version control, no таск has a commit, and this is the
one case the tree is read. Hand each reviewer the current text of the files its
task file owns in place of its diffs, and say once in the chat and in each review
file that the review read the working tree rather than the таск's own changes.
The debug-tag check reads those files: a `[maestro-debug:` line in one is left
behind. `oneWay` cannot be read without commits, so append nothing to it and say
so in the отчёт. Every other step of this phase runs unchanged.

### 3. Hand every таск over, all at once

Give each reviewer its task file, that таск's per-commit diffs with the list of
out-of-zone paths, and `interfaces.md` — for a repaired таск also the defect
under repair with its repair criteria and the residual parent criteria — briefed
by [`../prompts/reviewer.md`](../prompts/reviewer.md). **Nothing else** — not
`spec.md`, not the манифест, not another таск's file or diff.

Include the task-owned check result records and capture index for criteria the
task was assigned to execute. The reviewer checks whether the invocation,
assertions, integrated target, oracle, variants, and hashes adequately support
the claimed result. Static diff review and executed verification are separate:
the former cannot turn a missing or unavailable interaction check into `passed`.
The reviewer may inspect raw reference authority to identify an omitted
behavior outside the generated task list; report that as an upstream coverage
finding rather than quietly expanding this task's scope.

A review reads the project and writes nothing into it, so nothing here needs a
worktree, an order, or a wave. Every таск is reviewed at the same time as every
other.

### 4. Write down what came back

One `reviews/NN-<slug>.md` per таск, written **by you** from the reviewer's
text: findings quoted as they arrived, each still marked blocking or
observation. A reviewer's keyboard does not reach `.maestro/`, and a review
rewritten in your words is a review whose original nobody can check.

An observation is recorded and stops nothing; the отчёт reads these files later.
An `unrequested` observation is written with its tag, as it came back.
A `risk:` finding is written with its tag, as it came back, and a blocking one
is imported like any other blocking finding.
Import every substantiated finding into `verification.findings` with a stable ID,
origin, affected requirement/obligation/check IDs, and evidence links. Route an
upstream omitted obligation to coverage repair and an integration-evidence gap
to its execution owner. A reviewer's note never overrides a structured check
result or silently accepts a defect.

### 5. Move each таск

| The review says | The таск becomes |
|---|---|
| no blocking finding | `done` |
| one blocking finding or more | `repair` |

A blocking finding of your own counts the same as a reviewer's: a debug tag left
behind, or an `unrequested` observation sent to repair.

**Under `strict`, you dispose of each `unrequested` observation.** Ask whether
the behaviour is something a требование cannot work without — the `strict` row,
«only what the requirement cannot work without». If it is not, you may send it
to repair. Append a blocking finding of your own to the review file that quotes
the reviewer's observation verbatim and the `strict` row; import it with origin
`coordinator`. The observation itself is never rewritten. In repair, the
counterexample is the unrequested behaviour and the repair criterion is a check
that it is gone. Log INFO `review` `unrequested sent to repair` with
`{ taskId, findingId }`. An observation you keep under `strict` gets one line in
the review file naming the требование it serves. Under `normal` and `deep`, an
`unrequested` observation stays an observation and goes to the отчёт.

This disposition is yours, not the review's. It uses what you hold, and no
reviewer is told the depth.

**A repaired таск is answered twice, separately.** First: is the defect the
repair targeted verified against its repair criteria? Second: which of the
parent таск's criteria remain? The defect can be verified while criteria remain;
then the defect is closed and the таск stays in `repair` for the next one. The
таск becomes `done` only when no open defect and no residual criterion remain.
Log INFO with the verdict and `{ defectVerified, residualCount }`.

Write the state at the transition, never on a timer. **`done` is written here
and nowhere else.** It means reviewed and accepted, and the build stopped one
step short of it on purpose.

### 6. One standards pass

Executors worked apart, and a per-таск review sees one таск at a time, so
duplication and data clumps across таски are invisible to both. **One fresh
reader looks at the whole прогон, once.**

It runs the first time this phase ends with every таск `done` and
`.maestro/<dir>/reviews/standards.md` does not exist yet. That file is the
record: a review round after a repair, or a session that resumes the прогон,
finds it and does not run the pass again. A прогон that never reaches
all-`done` has no standards pass. It is never looped on — its observations are
not repaired and the pass is not repeated after they are read.

Give the reader, briefed by
[`../prompts/standards-reader.md`](../prompts/standards-reader.md):

- every таск's per-commit diffs, labelled with the таск id, in the order they
  landed — the same `git show` per commit as step 2;
- the project's documented standards: the host's memory file with the region
  between `<!-- maestro:begin -->` and `<!-- maestro:end -->` cut out,
  `CONTRIBUTING*`, and any document the memory file or the README names as the
  project's conventions. Lint and format configuration is not a document; the
  lint command already enforces it. With none found, say «none documented».

**Nothing else** — not `spec.md`, not the манифест, not the task files, not
`interfaces.md`, not the review files, not `prior.md`.

Write `reviews/standards.md` from its text, quoted as it came back. Its output is
observations only, so it moves no таск and writes no state; none of it enters
`verification.findings`. The отчёт carries its observations, and the memory
phase reads its seam-level items. Log INFO `review` `standards pass` with
`{ commits, observations, seamItems }`.

## When It Does Not Go That Way

Each of these has its own visible outcome. None of them is handled by picking up
the keyboard.

**A review has a blocking finding.** Write the review file, mark the таск
<!-- maestro:opens:blocking-review -->
`repair`, say which таск and quote which finding — then go to the repair phase,
which `SKILL.md` names. The review file and the state are what it reads; whether
that таск is retried or the specification is amended is decided there, and
neither is decided here.

**A diff touched a file its task file does not own.** Blocking, whatever else
the review says and however good the change is. That list is the only thing
keeping parallel таски apart; a write outside it landed in a file another таск
may have been holding, and no later reading of the history can say whose it was.
Once the finding is imported, append one line per path to `signals`:
`SIG-<n> out-of-zone-write — <path> — <taskId> <first seven of the commit> <F-N>`,
`n` being the list's length plus one. Log INFO `review` `signal recorded` with
`{ id, kind, taskId }`.

**A reviewer asks for `spec.md`.** Refuse, and append
`SIG-<n> withheld-request — spec.md — reviewer <taskId>` to `signals`, logged as
above. It is the same signal as an executor asking: a task file that sends its
reader looking for the specification did not carry what it needed, and the plan
phase is where that is fixed for the next прогон.

**A reviewer returns a patch instead of a finding.** Do not apply it. Take the
finding out of it, discard the code, and append
`SIG-<n> brief-exceeded — patch instead of finding — reviewer <taskId>` to
`signals`, logged as above. Applying it would put project code in your hands —
which is the one thing this phase and the previous one agree about.

## The Dials Here

**No mode changes this phase. Depth changes one disposition, never the
measurement.** A review measures one таск against the task file its executor was
handed. That file was written under whatever mode and depth the прогон is
running, and the measurement against it is the same in every one of them. What
`strict` changes is what you do afterwards with an `unrequested` observation
(step 5): you may send it to repair. No reviewer is told the depth.

## Gates

**None.** G4 runs after приёмка and asks a different question against a
different document: the build against the манифест, with `spec.md` withheld.

A gate here would be that question asked early with the wrong material. This
phase's whole input is the task files, and a task file is the specification's
own paraphrase of itself. What checks a прогон against what the user actually
said is one gate, at the end, blind.

## Output Of This Phase

| Artifact | State |
|---|---|
| `.maestro/<dir>/reviews/NN-<slug>.md` | one per таск, findings quoted as they came back |
| `.maestro/<dir>/reviews/standards.md` | once per прогон, the standards pass's observations quoted as they came back |
| `.maestro/state.js` | every таск `done`, or `repair` where a review blocked it; `oneWay` appended from the per-commit diffs; `currentStage` moved on |
| project code | unchanged — this phase writes none of it |

## Verify Execution Handoffs

Entry: task-owned journey/control returns and capture identities. Open
[verification-procedures.md](../references/verification-procedures.md).
1. Reviewer receives relevant task procedures/results, not unrelated spec.
2. Check all ordered journey observations, startup command, restart process
   identity and promised integration environment against actual captures.
3. Check control separation, critical selection basis, clean/mutated/restored
   sequence, unchanged oracle and main fingerprint. An insensitive detector
   creates a blocking check-quality finding; static review cannot fill evidence.
4. Return findings with R/O/C and capture IDs; missing execution/capability is
   unchecked/incomplete, never passed. Orchestrator records and routes them.
Valid: failed persistence observation goes to owning implementation task.
Invalid: call a missing restart assertion a non-blocking note because unit tests
passed. Output: returned evidence review; next action repair or acceptance.

Then read the acceptance phase file.
