# Dashboard

The human view of a прогон. It is opened for the user, not described to them.

## Input

`state.js` and nothing else. The dashboard never reads `manifest.md`, `spec.md`,
a task file, or any path in the repository. A view that reaches into artifacts
becomes a second source of truth, and the second one is silently wrong.

## What It Renders

| Region | Shows | Source |
|---|---|---|
| Прогресс проекта | The whole road as one percentage and one bar | `stages[]`, `tasks[]` |
| Покрытие брифа | The share of live требования that reached the specification | `requirements[]` |
| Этап сейчас | The stage, its position in the eight, and its own clock | `currentStage`, `stages[]` |
| Прошло времени | Working time since `startedAt`, the median таск beneath it, and the calendar span when the two differ | every timestamp in the state |
| Осталось | The estimate as a range, and the critical path it was measured along | `tasks[]` |
| Таски | Finished out of cut, with what is in motion and what was retried | `tasks[]` |
| Долг | Заглушки, допущения and переменные as one number and three | `debt` |
| Тесты | The last full suite | `tests`, or the last таск's own |
| Требования | The манифест counted by status | `requirements[]` |
| Этапы | The eight stages in order, each with its Label, note and duration | `stages[]`, labels from `vocabulary.md` |
| Ход разработки | The таски grouped by волна, each with its status, phase and clock, and a line naming what is running now | `tasks[]` |
| Dials | Mode, depth, доводка on/off, and any mid-run change | `mode`, `depth`, `polish`, `dialChanges[]` |
| Gates | G1–G4 with status, and findings when failed | `gates[]` |

Every visible word comes from `vocabulary.md`. The dashboard defines no term of
its own; if it needs a word that is not there, the word is added to the
vocabulary first.

## The Numbers Are Computed, Never Stored

Every percentage, every clock and the estimate are derived from the marks the
state already carries. Nothing here is written as a duration, and the
orchestrator has no metric to calculate: it records what happened and the page
does the arithmetic. A number stored once goes stale in silence; one derived at
render time cannot.

Two of them are worth stating outright, because both are places where a page
could flatter its прогон:

- **Прогресс weights the stages by how long they take** — разработка six,
  спецификация and ревью two, the rest one — and subdivides разработка by
  finished таски. Equal weights make the bar stand still through the longest
  stage and then jump, which reads as a stuck прогон.
- **Осталось is the median of finished таски along the remaining critical path,
  shown as a range**, and says *рано считать* below two finished таски rather
  than guessing. A precise wall-clock prediction is a fabrication; a range built
  from what already happened is not. Nothing in the chat may offer the user a
  sharper number than the page does.

**`N тасков параллельно` on a волна is read from the clocks, not from the size
of the wave.** A wave says what *may* run together. Claiming parallelism the
прогон did not get is the kind of flattery that makes the rest of the screen
untrustworthy.

## Working Time, Not The Calendar

The clocks show time worked. A прогон someone left for a day must not report a
day of work, and no extra record is needed to know that: the state is full of
timestamps, and a gap between two adjacent ones longer than **45 minutes** is a
person being away rather than a build being slow. Each gap counts up to that
ceiling and no further, so an overnight pause adds 45 minutes and a two-day one
adds the same. The same subtraction applies to each таск, and therefore to the
median and to the estimate.

The calendar span is printed beside the run clock whenever the two have parted
company, and only then: a second number that always equals the first teaches the
reader to ignore the line they will one day need.

A clock belongs to the thing it is timing. A stage or a таск that recorded its
own `finishedAt` is measured between its own two stamps; only what is still
running is measured against the run clock. Timing everything against the run
clock is the cheaper implementation and it makes every finished row report the
same number, which is the whole run's elapsed time wearing a stage's label.

## Lifecycle

- Copied into `.maestro/` during preflight, before the first stage begins, and
  opened for the user at that moment.
- Re-reads `state.js` on its own on a short interval. It never waits for the
  orchestrator to tell it to refresh, because the orchestrator is often busy for
  minutes at a time.
- Survives the run: after `finishedAt` it stays a readable record of what
  happened, with every clock stopped.

## Failed And Interrupted Runs

- A stage with status `failed` is rendered as failed, with the failing gate's
  findings shown inline. It is never rendered as still active.
- When `interruptedAt` is set, the header says the прогон was interrupted and
  when, and every clock stops at that moment. A frozen clock with no explanation
  is the one failure mode this rule exists to prevent.
- A state file that cannot be parsed produces a plain message naming the file,
  not an empty page.
- A page that has already shown a state and then loses the file keeps showing
  it and says the clocks stopped. Reporting an unreadable state there would be
  false: one was read, and it is on the screen.

## Constraints

- One self-contained HTML file. No CDN, no external stylesheet, no font fetch,
  no analytics — the page must render with the network off.
- No build step. It is copied, not compiled.
- Opens from `file://` in a browser, including when the project directory is on
  a path with spaces. **That is a claim about browsers and not about every
  viewer.** An in-app pane typically inlines the page instead of navigating to
  it, which leaves the document with a `null` origin, and from there the state
  file beside it is unreachable by relative `src`, absolute `file://` and
  `fetch` alike. The page therefore carries a snapshot of the state inside
  itself: the snapshot is what makes it show, and the file beside it is what
  makes the clocks move.
- The snapshot is written from the state file and never by hand, so it is equal
  to that file or older than it — never newer, and never in disagreement. A
  missed synchronisation costs a stale view, never a wrong one.
- Readable in both light and dark, since it is opened in whatever the user has.
