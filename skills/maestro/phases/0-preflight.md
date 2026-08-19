# Phase 0b — Preflight

Read after the dials are resolved. Prepare the place the прогон will write to,
create its state, and show the announcement. No requirement is read here and no
question about the бриф is asked.

## Steps

### 1. Check the repository

- If the working tree is dirty, say so and ask whether to continue. Maestro
  writes into `.maestro/` and, later, executors write project code; starting on
  top of uncommitted work makes it impossible to tell afterwards what the прогон
  did.
- In `full` mode do not ask: state that the tree was dirty at the start and
  continue. It is a question about consequence only if something is about to be
  overwritten, and nothing here overwrites.
- If there is no repository at all, say so and continue. Version control is how
  the отчёт is later checked, not how the run works.

### 1b. Resolve the host

If you are running under Claude Code, everything the прогон assumes is present:
subagent fan-out with a context you control, worktrees, commits, file writes.
Note it and move on. **The dashboard is not one of these**: whether the user can
watch the прогон depends on the viewer, not the host, and it is established in
step 5 by looking — on every host, this one included.

**Otherwise, open [`../references/hosts.md`](../references/hosts.md)** and
establish the five capabilities it lists by trying them rather than by believing
the product's description. Two answers are stop conditions — no subagent whose
context you control, and no way to write project files — and the rest narrow the
wave. Record what you found; it goes into the announcement in step 6.

### 2. Choose the slug

The slug names the run's directory and appears in every artifact path.

- Use a short English name from what the user typed.
- If the бриф is entirely in Russian, ask for a short English name in `semi`,
  `interview` and `manual`. In `full`, use `run-<YYYY-MM-DD>` and record the
  choice for the отчёт rather than inventing a translation of their words.
- Lowercase, dash-separated, no other characters.
- If `.maestro/<slug>/` already exists, this is a second прогон for the same
  feature. Do not reuse it and do not delete it: add a numeric suffix. Nothing
  under `.maestro/` is ever removed by a later прогон.

### 3. Create the run directory

```text
.maestro/<slug>/
```

Create the directory and nothing inside it yet. The manifest phase writes the
first two files.

### 4. Write the first state

Write `.maestro/state.js` through the state writer. It carries:

| Field | Value at preflight |
|---|---|
| `contractVersion` | the current contract version |
| `runId` | stable for the whole прогон |
| `slug` | from step 2 |
| `startedAt` | now, ISO 8601, written once and never again |
| `mode`, `depth`, `polish` | as resolved by the dials phase |
| `dialChanges` | empty |
| `stages` | all eight, `preflight` active, the rest `pending` |
| `currentStage` | `preflight` |
| `tasks`, `requirements` | empty |
| `gates` | all four — `G1`, `G2`, `G3`, `G4` — `pending`, with no findings |

Write the whole file, validated, at once. Never edit it in place, and never
write it on a timer — the state changes at phase boundaries and task transitions
only.

**The object literal must be valid JSON, not merely valid JavaScript**: every
key quoted, no trailing comma, no comment inside it. The page will render a
loose literal perfectly well — it is JavaScript, and the page is a browser — so
nothing on screen tells you the file is wrong. The tool that measures a finished
прогон reads it through `JSON.parse` and cannot open it at all, which is
discovered after the run, when the file is final and nothing can be measured
again. `python3 .maestro/sync.py` checks this on every call; that is what the
check is for.

### 5. Raise the dashboard

Copy two files into `.maestro/`, beside the state you just wrote —
[`../assets/dashboard.html`](../assets/dashboard.html) and
[`../tools/sync.py`](../tools/sync.py) — then run the tool once:

```bash
python3 .maestro/sync.py
```

It mirrors the state into the page, puts `index.html` beside it, raises a static
server for this directory on the loopback interface if one is not already
answering, and prints the address. **What it prints is what you open.**

- **The state is written first.** The mirror copies `state.js`; run before step
  4 there is nothing to copy.
- **Copy the page, never edit it.** Everything the user sees comes from the
  state. The one part of the page that changes is the snapshot block, and the
  tool is what changes it.
- **Open it once.** The page keeps itself current — it re-reads the state on its
  own interval, because you are often busy for minutes at a time and it must not
  wait for you. Do not reopen it at every stage, and do not announce each
  refresh.
- **It outlives the прогон.** After приёмка it stays as the record of what
  happened, with every clock stopped. Nothing deletes it at the end.

**Path A — inside the window the user is already looking at, and it goes over
http.** If your harness can show a local page in that window — a preview pane, an
in-app browser, a webview — use it. A dashboard exists to be glanceable, and a
separate browser window gives away half of that.

Three things about such a pane are worth knowing before you open one, because
each of them fails quietly:

- **Do not hand it a `file://` path.** A pane typically inlines the page rather
  than navigating to it, which leaves the document with a `null` origin — and
  from there the file beside it is unreachable by every route: relative `src`,
  absolute `file://`, and `fetch` alike. The snapshot means the прогон is still
  shown; nothing would make it move. This is why the server exists.
- **The navigation is one move in two parts.** Start the preview at the origin
  the tool printed (`preview_start`), then navigate to `/dashboard.html`. A
  navigate to a local port that no preview call preceded is refused. Use
  `localhost` in that address — `127.0.0.1` is refused where `localhost` is
  accepted, even though the server binds to `127.0.0.1` either way.
- **A pane silences navigation, not sub-resource loading.** `location.reload()`
  and `<meta http-equiv="refresh">` do nothing there. The page knows this and
  re-loads the state with a fresh script tag instead, so it keeps ticking and
  keeps its scroll position. Do not add a refresh of your own.

If the preview tool is not in your tool list, look for it before concluding
there is no pane — in some sessions it loads on demand, and "no viewer here"
sends a run to Path B on a machine that had one.

**Path B — the system browser.** No pane, or no `python3`. Hand the file to the
operating system; a real browser opens `file://` as a page and loads `state.js`
from the same directory, so the poll works with no server at all.

**Then look at what you opened, once.** A stage list and a running clock is a
dashboard; a title above an error is a page that rendered and could not reach
the state. Those look alike from the outside and only one of them is worth
announcing — the прогон that produced this rule reported an open dashboard for a
whole phase while the state file sat unread beside it.

**Say the address out loud in the chat on both paths.** How a client presents a
pane varies — sometimes beside the chat, sometimes as a card the user still has
to press — and one printed line covers every case and leaves them independent of
a button.

**Do not open anything in a remote session.** If `SSH_CONNECTION` or `CI` is
set, print the path and move on: a window on someone else's machine helps nobody.

If the copy fails — no `assets/` in the installed bundle, an unwritable
`.maestro/` — say so plainly and continue. A прогон without a live view is a
прогон the user cannot watch, not a прогон that cannot run. **Do not substitute a
textual progress display**: a stand-in that looks like the dashboard is harder to
remove later than a missing feature is to notice.

A server that will not start is not a failure either. The page carries its
snapshot, so the user sees where the прогон is and the clocks stand still. Say
it in one line, name the file, and carry on. Do not retry and do not install
anything.

### 6. Announce the dials

Show the announcement composed by the dials phase, in Russian, in one block:
mode, depth, whether доводка is on, and the one consequence most likely to
surprise.

**Add what step 1b found**, if anything was missing: name the capability and what
it costs, one line each. A прогон that quietly ran its таски one at a time
because the host had no fan-out looks exactly like a прогон whose plan cut one
таск, and this is the cheapest place to tell the two apart.

It is a statement, not a question. Do not wait for a reply, in any mode.

## Gates

None. Preflight is the only stage with no gate after it, because there is
nothing yet to check against the user's words.

## Output Of This Phase

| Artifact | State |
|---|---|
| `.maestro/<slug>/` | created, empty |
| `.maestro/state.js` | written, `preflight` active |
| `.maestro/dashboard.html` | copied, mirrored, and opened |
| `.maestro/sync.py`, `index.html` | copied and placed |
| the announcement | shown, with any missing host capability named |

Then read the manifest phase file.
