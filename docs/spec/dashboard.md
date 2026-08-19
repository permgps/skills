# Dashboard

The human view of a прогон. It is opened for the user, not described to them.

## Input

`state.js` and nothing else. The dashboard never reads `manifest.md`, `spec.md`,
a task file, or any path in the repository. A view that reaches into artifacts
becomes a second source of truth, and the second one is silently wrong.

## What It Renders

| Region | Shows | Source |
|---|---|---|
| Stage timeline | The eight stages in order, each with its Label, current one marked | `stages[]`, labels from `vocabulary.md` |
| Run clock | Time since `startedAt`, stopped at `finishedAt` | `startedAt`, `finishedAt` |
| Stage clock | Time in the current stage; a finished stage shows its own duration | `stages[].startedAt`, `stages[].finishedAt` |
| Dials | Mode, depth, доводка on/off, and any mid-run change | `mode`, `depth`, `polish`, `dialChanges[]` |
| Task table | Each таск: title, status, its own clock, what blocks it | `tasks[]` |
| Requirement coverage | How many требования are in-spec, deferred, dropped, still open | `requirements[]` |
| Gates | G1–G4 with status, and findings when failed | `gates[]` |

Every visible word comes from `vocabulary.md`. The dashboard defines no term of
its own; if it needs a word that is not there, the word is added to the
vocabulary first.

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
