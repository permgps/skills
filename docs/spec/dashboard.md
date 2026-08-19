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
| Stage clock | Time in the current stage | `stages[].startedAt` |
| Dials | Mode, depth, доводка on/off, and any mid-run change | `mode`, `depth`, `polish`, `dialChanges[]` |
| Task table | Each таск: title, status, its own clock, what blocks it | `tasks[]` |
| Requirement coverage | How many требования are in-spec, deferred, dropped, still open | `requirements[]` |
| Gates | G1–G4 with status, and findings when failed | `gates[]` |

Every visible word comes from `vocabulary.md`. The dashboard defines no term of
its own; if it needs a word that is not there, the word is added to the
vocabulary first.

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

## Constraints

- One self-contained HTML file. No CDN, no external stylesheet, no font fetch,
  no analytics — the page must render with the network off.
- No build step. It is copied, not compiled.
- Opens from `file://`, including when the project directory is on a path with
  spaces.
- Readable in both light and dark, since it is opened in whatever the user has.
