# A Resumed Прогон Lost A Commit

Opened from `SKILL.md` *Recovery* and from preflight's reopening of a closed
run, when `node .maestro/sync.mts --commits-check` reported `lost` or
`onBranch`, and closed again. Nothing is written before this file is read.

The check read every `tasks[].commits` against `HEAD` and changed nothing. A
reset, a rebase or a checkout between sessions took those commits off `HEAD`'s
history, and a прогон that builds on them reviews code that is not there.

## What The Answer Means

- **`not-ancestor`** — the commit still exists, and `HEAD`'s history does not
  contain it: a reset below it, a rebase that rewrote it, or a checkout of
  another branch.
- **`missing`** — git cannot name it at all (garbage-collected, a fresh clone)
  or the entry is not a sha. It sits on no branch.
- **`rewritten`** — on a `not-ancestor` commit, the commit on `HEAD`'s history
  with the same subject and the same `Maestro-Run:` trailer that no таск
  records: most likely what a rebase made of it. A hint, never a substitute.
- **`branches`** — the local branches that still hold a `not-ancestor` commit.
- **`onBranch`** — the one branch every lost commit is on, set only when no
  lost commit is `missing`. That is what a checkout looks like.

`result: "unavailable"` means git did not answer. Say so once, reset nothing,
and continue: no прогон stops on its history.

## A Checkout First

If `onBranch` is set, the work may be one checkout away, and rebuilding it here
would be the wrong answer to a branch switch. Say one line that names the
branch and the таски, for example:

> Коммиты тасков 03 и 05 есть в ветке `main`, но не в текущей — похоже,
> переключилась ветка. Вернуться на `main` или пересобрать эти таски здесь?

Then stop with `awaiting.kind: "answer"` and reset nothing. If the user switches
back, run the check again. If they say to rebuild here, go on below.

## The One Line

For every таск that lost a commit, say one line before the write, for example:

> Таск 03 потерял коммит `abc1234` — его нет в истории HEAD. Сбрасываю и
> запускаю заново.

A `running` таск that depends on a reset one goes back with it and is named on
the same line.

## The Reset, By Status

All of it is one `--publish` with `--expect` and `--holder`. Every lost sha
moves from `commits` to `lostCommits`, and the rest of `commits` keeps its
order. A sha never leaves `lostCommits`, and the publish refuses a sha that
leaves `commits` any other way. `retries`, `repairs` and `handoffs` are never
reset and never raised: a relaunch is not a retry and not a repair, because
nothing was found wrong with the executor's work.

| Status before | Status after | `startedAt`, `finishedAt`, `files`, `tests` | Relaunch |
|---|---|---|---|
| `review`, `done` | `queued` | cleared | yes, on its own tier, once its blockers are finished |
| `repair` | `queued` | cleared | yes; its open defects stay open, and the repair door takes them up after the relaunched таск is reviewed again |
| `running` (its own repair commit lost) | `queued` | cleared | yes |
| `failed` | `failed` | kept | no: its budget is spent and its stop was said, so it is only named |
| `queued` with commits | `queued` | — | yes, as it was going to be |
| `running`, a dependent of a reset таск, its own commits intact | `queued` | cleared | yes, after its blocker |

A finished таск goes back to `queued` only in a write that adds to its
`lostCommits`; the publish refuses it otherwise.

## The Handoff

Write `tasks/NN-<slug>-handoff.md` for each relaunched таск that lost a commit,
under this heading:

```markdown
## Lost Commit

Lost: abc1234 (not-ancestor), def5678 (missing)
Rewritten as: 9f8e7d6 — a hint from the subject and the run trailer
Zone: src/cart/, src/api/cart.ts

Nothing in this file is verified finished. The zone may already hold some or
all of this таск's work under a new hash, or none of it.
```

Leave out the `Rewritten as` line when no twin was named. Hand it over the way a
handoff is handed over, with the task file. `handoffs` does not move: the таск
did not outgrow a context.

## After The Executor Returns

Follow Разработка steps 1a–4, with two exceptions at the commit:

- **It changed nothing and a twin was named.** Append the twin to `commits` and
  make no new commit: the rebase already landed the work.
- **It changed nothing and no twin was named.** The code reached `HEAD` some
  other way, for example a squash. Commit `--allow-empty` with the usual subject
  and trailers, so the требование stays traceable. Tell the review to read the
  таск's zone from the tree, as it does without version control.

Then the review, as for a repaired таск. The стадия does not move. If the
прогон resumed at Приёмка, acceptance starts over once every relaunched таск is
reviewed: the checks bound to the old revision are stale and are replayed, and
evidence is never deleted.

## What This Never Does

No command is run to bring a commit back: no reset, no cherry-pick, no rebase,
no checkout. History is never rewritten to restore a commit, and the branch is
switched only by the user.

A `git revert` of a таск's commit is not detected here. The commit stays an
ancestor and its code is gone, so the review and acceptance gates catch it.

<!-- maestro:degrades:version-control -->
Without version control there are no commits to check: the check reports
`unavailable` or nothing checked, and the прогон continues as it would have.
