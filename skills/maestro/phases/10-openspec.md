# Phase 10 — OpenSpec Export

Read once per closure, never as part of the sequence: after acceptance has
decided the run closes `completed` or `closed_with_exceptions`, before the
closing publish, and only when `node .maestro/sync.mts --openspec-index`
reports `present: true`. A `stopped_incomplete` closure never reaches this
phase: the behaviour is partly built, and a resumed run closes again anyway.

The project keeps its approved behaviour in OpenSpec. The run knows,
requirement by requirement, what it verified. This phase hands that back as one
OpenSpec change the project's own tool can merge — and nothing it did not
verify.

No mode and no depth changes this phase, and nobody is asked anything.

## Why Only Now

Blind acceptance is over. Anything derived from the run's own restatement of
the requirements, placed in the tree before the G4 reader finished, would have
been a ruler the run wrote. That is why the draft is written after the closure
decision and not a moment earlier, and why G4 is told not to open `openspec/`:
earlier runs' exports sit in the tree it inspects.

## Steps

### 1. Hand the draft to a writer

Dispatch one fresh subagent briefed by
[`../prompts/openspec-writer.md`](../prompts/openspec-writer.md), on the
`strong` model: the run state's `models.strong`, none at all for `session` or
for a run with no `models` (contract 7). Hand it exactly:

- `manifest.md` and `answers.md`;
- `spec.md`, for `design.md` only;
- the title of every таск and the `R##` each serves;
- the verification projection: for each requirement its result, and for each
  `passed` one the checks recorded against it — method, target, procedure,
  oracle and the execution result;
- the `--openspec-index` JSON, and the main `spec.md` of every capability a
  fork in `answers.md` names in an `OpenSpec:` line;
- the run directory's name without `--wip`, and the closing day.

Nothing else: not `brief.md`, not `reviews/`, not `prior.md`, not
`codebase.md`, not `research/`. The writer writes into
`.maestro/<dir>/openspec/` and nowhere else.

### 2. Redact the draft

S2 applies at full strength. The change is committed and merged into the
project's specification, so run the redaction gate over every file of the draft
before the closing publish reads it, exactly as over the бриф.

### 3. Publish the closure

The closing publish of acceptance's step 5 checks the draft against the
published state and `answers.md`, writes `openspec/changes/maestro-<dir>/`, and
reports `openspec` in its result. A failure never fails the publish.

| `openspec.status` | What it means | What you do |
|---|---|---|
| `written` | the change was written, or rewritten whole | say where it is |
| `kept` | the same change was already there | say where it is |
| `refused` | a check failed; nothing was written | say the first problem in one line; `PROGRESS.md` lists it |
| `archived` | the user already merged this run's change | nothing |
| `failed` | a write failed | say so in one line; an identical closing publish retries it |

`validation` says whether the OpenSpec command line accepted the change:
`passed`, `failed` (its first lines are in `problems`), or `unavailable` when
it is not installed. A `refused` or `failed` export, and a failed validation,
are said and not stopped on: the run's own record is complete without them.

### 4. Tell the user

One line, after the publish, in the прогон's language: the folder, its status,
and that merging is theirs —
`openspec archive maestro-<dir>`. Maestro never runs it and never writes
`openspec/specs/`. Log INFO `openspec` `draft written` with the file count, and
WARN `openspec` `export <status>` for `refused` and `failed`; never log
requirement text.

The memory phase's closing commit takes the folder when the status is
`written` or `kept`.

## When It Does Not Go That Way

**The writer has nothing it may export.** Every requirement failed, is
excepted, or was kept against an approved one. Then no draft is written: no
folder appears and the publish carries no `openspec` key. Say so in one line.

**The draft is refused.** Do not edit the change folder by hand, and do not
write into `openspec/` yourself. Correct the draft in `.maestro/<dir>/openspec/`
— a fresh writer, given the problems — and publish the same closed state again.
One retry; after that the refusal stands in `PROGRESS.md`.

## Gates

None. The check the closing publish runs is not a gate: it decides whether a
change is written, never whether the run passed.

## Output Of This Phase

| Artifact | State |
|---|---|
| `.maestro/<dir>/openspec/` | the draft, redacted, kept with the run's record |
| `openspec/changes/maestro-<dir>/` | written by the closing publish when the draft passed its checks |
| `openspec/specs/`, `openspec/changes/archive/` | unchanged — merging is the user's |
| project code | unchanged |
