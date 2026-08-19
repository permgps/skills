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
| `gates[]` | list of `{ id, status, findings[] }` | briefing | dashboard |
| `finishedAt` | ISO 8601 string | acceptance | dashboard |
| `interruptedAt` | ISO 8601 string | preflight | dashboard |

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

## Divergence From ARCHITECTURE.md

The architecture document carries an illustrative `RunState` type. Where it and
this contract disagree, this contract wins, and the two differences are
deliberate:

| Point | Architecture example | This contract | Why |
|---|---|---|---|
| Last stage id | `final` | `acceptance` | The stage is named after what it does, and the same word is used by `phases.md`, `gates.md` and the отчёт. `final` describes a position in a list, not an activity |
| `stages[].label` | stored in the state | absent | Labels live in `vocabulary.md` and are resolved at render time. Storing them would mean a wording change requires a state migration, and would give the same string two owners |

Everything else — field names, value sets, and the single-writer rule — matches.

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
