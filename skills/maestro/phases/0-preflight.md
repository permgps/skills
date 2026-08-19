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
| `tasks`, `requirements`, `gates` | empty |

Write the whole file, validated, at once. Never edit it in place, and never
write it on a timer — the state changes at phase boundaries and task transitions
only.

### 5. Raise the dashboard

**This step is specified and currently inert.** It copies `assets/dashboard.html`
into `.maestro/` and opens it for the user before the first stage begins.

The asset does not exist in this bundle yet; it arrives with the **Live
Dashboard** milestone. Until then: skip the step, and say once that the прогон
has no live view. Do not substitute a textual progress display — a stand-in that
looks like the dashboard is harder to remove later than a missing feature is to
notice.

### 6. Announce the dials

Show the announcement composed by the dials phase, in Russian, in one block:
mode, depth, whether доводка is on, and the one consequence most likely to
surprise.

It is a statement, not a question. Do not wait for a reply, in any mode.

## Gates

None. Preflight is the only stage with no gate after it, because there is
nothing yet to check against the user's words.

## Output Of This Phase

| Artifact | State |
|---|---|
| `.maestro/<slug>/` | created, empty |
| `.maestro/state.js` | written, `preflight` active |
| the announcement | shown |

Then read the manifest phase file.
