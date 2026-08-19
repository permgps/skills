# The Dashboard

One self-contained HTML file, copied into `.maestro/` during preflight and
opened for the user at that moment. It reads `state.js` on its own, on a short
interval, because the orchestrator is often busy for minutes at a time and a
view that waits to be told to refresh shows a run that looks frozen.

Its only input is the run state — carried twice: as a snapshot written into the
page, and as `state.js` beside it. The snapshot is what lets the page show a
прогон when it is opened with no address at all, which is what an in-app pane
does to it; the file is what makes the clocks move. Whichever loaded last wins,
and a load that fails never replaces a state that worked. It never opens
`manifest.md`, a task file, or any path in the repository — a view that reaches into artifacts becomes a second
source of truth about a run, and the second one is silently wrong.

## A run in flight

![The dashboard during the build stage](assets/dashboard-running.png)

The stage timeline is the run: eight stages in order, the current one marked.
Every visible word comes from `docs/spec/vocabulary.md` — the state stores ids
and the page resolves them at render time, so a wording change never requires a
state migration. Those words are Russian, because the interface is: the
screenshots show `Разработка` where this page says the build stage, and the
mapping between the two is the vocabulary file.

The task table shows what is happening now, including what each task is waiting
for. Two tasks running at once is a wave, and the wave is recomputed after each
task returns rather than planned once at the start.

Requirement coverage is counted rather than claimed: every task carries the
requirement ids it traces to, which is what G3 checks in both directions.

## A finished run

![The dashboard after acceptance](assets/dashboard-finished.png)

After `finishedAt` the page stays a readable record with every clock stopped,
and each stage shows its own duration rather than the run's. A frozen clock with
no explanation is the one failure mode the header notice exists to prevent: an
interrupted run says it was interrupted and when.

## The fixtures behind these images

`docs/assets/state-running.fixture.js` and `state-finished.fixture.js` are the
two states the screenshots were rendered from. They are fixtures, not the record
of a real run — a real one belongs to the project it built and is never
committed here.

To reproduce a capture:

```bash
mkdir -p /tmp/shot && cp skills/maestro/assets/dashboard.html /tmp/shot/
cp docs/assets/state-finished.fixture.js /tmp/shot/state.js
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --hide-scrollbars --allow-file-access-from-files \
  --virtual-time-budget=4000 --window-size=1280,1240 \
  --screenshot=docs/assets/dashboard-finished.png file:///tmp/shot/dashboard.html
```

The clocks in a capture of the in-flight state are measured against the moment
of the capture, so re-running the command produces a different image. That is
the page working, not the fixture drifting.

## What is checked

`npm run dashboard` proves the page is self-contained — no CDN, no external
stylesheet, no font fetch, no network API — and that the labels, stage order and
gate map it carries still match `vocabulary.md`, `phases.md` and `gates.md`. The
page holds those copies because the state stores ids; an unchecked copy drifts.

Its DOM-free logic is exercised separately by `scripts/validate/dashboard-logic.test.ts`,
which evaluates the page's own `<script id="logic">` block in a VM rather than
reimplementing it.

The behavior this page owes the user is specified in
[`spec/dashboard.md`](spec/dashboard.md).
