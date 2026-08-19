# Run-State Contract

One file, one writer, one reader. The orchestrator writes `state.js`; the
dashboard reads it. Nothing else touches it, and nothing else is the dashboard's
input.

## Fields

| Field | Type | Written in | Read by |
|---|---|---|---|
| `contractVersion` | integer | preflight | dashboard |
| `runId` | string | preflight | dashboard |
| `slug` | string | preflight | dashboard |
| `startedAt` | ISO 8601 string | preflight | dashboard |
| `mode` | `full` \| `semi` \| `interview` \| `manual` | preflight | dashboard |
| `depth` | `strict` \| `normal` \| `deep` | preflight | dashboard |
| `polish` | boolean | preflight | dashboard |
| `dialChanges[]` | list of `{ dial, from, to, atPhase }` | preflight | dashboard |
| `stages[]` | list of `{ id, status, startedAt?, finishedAt? }` | preflight | dashboard |
| `currentStage` | stage id | preflight | dashboard |
| `tasks[]` | list of `{ id, title, requirementIds[], status, blockedBy[], startedAt?, finishedAt? }` | plan | dashboard |
| `requirements[]` | list of `{ id, status, reason? }` | manifest | dashboard |
| `gates[]` | list of `{ id, status, findings[] }` | preflight | dashboard |
| `finishedAt` | ISO 8601 string | acceptance | dashboard |
| `interruptedAt` | ISO 8601 string | preflight | dashboard |

**`Written in` names the phase that creates a field, not every phase that later
changes it.** `stages[]` is the example: preflight writes all eight entries and
each later phase only moves a status. `gates[]` works the same way — preflight
seeds G1–G4 as `pending`, and the phase each gate follows fills in that gate's
own status and findings. The column has room for one phase because there is one
writer; a field with two creators would have no owner.

**`Read by` names readers outside the orchestrator, which is why every row says
`dashboard` and nothing else.** The orchestrator reads its own state constantly —
on recovery after a compaction, and in the repair phase, which learns from
`tasks[].status` which таск arrived and by which entrance. Listing itself as a
reader of what it writes would turn a column about the integration point into a
list of everywhere the state is opened, and the one thing that column has to say
is that the dashboard is the only party outside this process that reads it.

`stages[].id` is the stage id set defined in `phases.md`; it is not re-listed
here, because two lists of the same thing drift. Labels come from
`vocabulary.md` and are never stored in the state — the dashboard maps id to
label at render time, so a label change never requires a state migration.

## Value Sets

| Field | Values |
|---|---|
| `stages[].status` | `pending`, `active`, `done`, `failed` |
| `tasks[].status` | `queued`, `running`, `review`, `repair`, `done` |
| `requirements[].status` | `open`, `in-spec`, `deferred`, `dropped` |
| `gates[].status` | `pending`, `passed`, `failed` |

`requirements[].reason` is required whenever the status is `deferred`, `dropped`,
or still `open` at G1 — which is exactly what G1 checks.

## Update Ritual

- The state is written at **phase boundaries and task transitions only**, never
  on a timer. A run with no state changes produces no writes.
- Every write is a whole-file write of a valid state. A partially written state
  is a broken dashboard, so the file is written to a temporary name and moved
  into place.
- `interruptedAt` is set when a phase fails or the run stops, and cleared when a
  resumed run passes its next phase boundary. It is what lets the dashboard show
  an interrupted прогон as interrupted rather than as frozen.
- The orchestrator never reads the dashboard's rendering of the state back. The
  state file is the only direction of travel.

## Precedence Over ARCHITECTURE.md

The architecture document carries an illustrative `RunState` type. Where it and
this contract disagree, **this contract wins**, and the illustration is corrected
to match rather than left to argue with it.

Two points were settled that way, and are recorded here because the reasoning is
not recoverable from the result:

| Point | First written as | Settled as | Why |
|---|---|---|---|
| Last stage id | `final` | `acceptance` | The stage is named after what it does, and the same word is used by `phases.md`, `gates.md` and the отчёт. `final` describes a position in a list, not an activity |
| `stages[].label` | stored in the state | absent | Labels live in `vocabulary.md` and are resolved at render time. Storing them would mean a wording change requires a state migration, and would give the same string two owners |

The illustration in `.ai-factory/ARCHITECTURE.md` now reflects both. It remains an
illustration: it shows the shape, not the whole field list, and
`scripts/validate/state-matches-spec.ts` checks this document against
`scripts/state/contract.ts` — never against the architecture example.

## Versioning

- `contractVersion` starts at `1` and is stored in every state file.
- **Adding an optional field** raises nothing. The dashboard ignores fields it
  does not know.
- **Removing or renaming a field, or changing a value set,** raises
  `contractVersion` and must land in the same change as the dashboard update that
  handles it. A dashboard that meets a higher `contractVersion` than it knows
  renders what it can and says plainly that the прогон used a newer contract.
- The contract is changed in `scripts/state/` before it is changed on either
  side. That is what makes the single integration point real rather than
  aspirational.
