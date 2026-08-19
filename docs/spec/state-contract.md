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
| `updatedAt` | ISO 8601 string | preflight | dashboard |
| `mode` | `full` \| `semi` \| `interview` \| `manual` | preflight | dashboard |
| `depth` | `strict` \| `normal` \| `deep` | preflight | dashboard |
| `polish` | boolean | preflight | dashboard |
| `dialChanges[]` | list of `{ dial, from, to, atPhase }` | preflight | dashboard |
| `stages[]` | list of `{ id, status, startedAt?, finishedAt?, note? }` | preflight | dashboard |
| `currentStage` | stage id | preflight | dashboard |
| `tasks[]` | list of `{ id, title, requirementIds[], status, blockedBy[], wave, zone[], retries, repairs, handoffs, files[], startedAt?, finishedAt?, tests?, commit? }` | plan | dashboard |
| `requirements[]` | list of `{ id, status, reason? }` | manifest | dashboard |
| `gates[]` | list of `{ id, status, findings[] }` | preflight | dashboard |
| `debt` | `{ placeholders[], assumptions[], emptyEnv[] }` | preflight | dashboard |
| `additions` | list of strings | preflight | dashboard |
| `tests` | `{ passed, failed }` | build | dashboard |
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

**`tasks[].wave` is a layer, not a frontier.** It is `1 + max(wave of its
blockers)`, then split so no two таски in one wave write the same files, and it
is assigned once — by the plan phase, when the таски are cut. It is never
renumbered as the run progresses: a таск finishing and releasing what it blocked
is the build moving through the plan, not the plan changing. Renumbering makes
rows jump between groups on the dashboard, and a user with no way to know the
numbers were rewritten reads that as a lost plan. The build is still free to
launch anything whose blockers are done; what it may not do is rewrite the
number.

**The whole `tasks[]` array is written when the таски are cut**, every entry
`queued`, with its `blockedBy`, `wave`, `zone`, and the three counters at zero.
A counter created halfway through a run is a counter somebody increments from
`undefined`. An array published only as таски start makes the dashboard say the
таски were never cut while the build is running — the one moment the user is
most likely to look.

`retries`, `repairs` and `handoffs` count different things and only two of them
are about defects. **`handoffs` is not a defect count**: nothing was found
wrong, the таск outgrew a context and was relayed to a fresh one. Showing it
beside the other two as though it were the same kind of number is how a long
таск is read as a broken one.

**`debt` is what the прогон owes the user and has not settled**, and it is
written as it is decided rather than assembled at the end: a card that reads
zero for the whole run is a claim nobody checked. `emptyEnv` holds variable
**names** only — safety rule `S2` in [`safety.md`](safety.md) forbids a
credential ever reaching disk, and a list of environment variables is the
obvious place to break that by accident.

**Nothing here is a duration or a percentage.** Every clock, every share and
every estimate on the dashboard is derived from the marks above. A number stored
once is a number that goes stale silently; a number derived at render time
cannot.

## Value Sets

| Field | Values |
|---|---|
| `stages[].status` | `pending`, `active`, `done`, `failed`, `skipped` |
| `tasks[].status` | `queued`, `running`, `review`, `repair`, `done`, `failed` |
| `requirements[].status` | `open`, `in-spec`, `deferred`, `dropped`, `placeholder` |
| `gates[].status` | `pending`, `passed`, `failed` |

`requirements[].reason` is required whenever the status is `deferred`, `dropped`,
`placeholder`, or still `open` at G1 — which is exactly what G1 checks. For a
`placeholder` the reason names what is still missing, because a требование
delivered as a visible gap and no note of what fills it is indistinguishable
from one that was met.

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

Both are settled here, and this document is where they are settled: any
illustration of the state elsewhere shows the shape, not the whole field list.
`scripts/validate/state-matches-spec.ts` checks this document against
`scripts/state/contract.ts` — never against an illustration.

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

**Version 2** raised the number because three value sets changed at once, not
because of the fields that arrived with them:

| Change | Why it was needed |
|---|---|
| `tasks[].status` gains `failed` | A таск that a retry could not rescue is not `queued`, `running` or `done`, and rendering it as any of those is the dashboard reporting work that is not happening |
| `stages[].status` gains `skipped` | A stage consciously not run — briefing in the mode that asks nothing — left `pending` forever reads as a прогон stuck there. `skipped` is always written with a `note` saying why |
| `requirements[].status` gains `placeholder` | Safety rule `S3` already produces требования delivered as visible placeholders. The status gives the thing a name the отчёт and the dashboard can count, instead of `in-spec` claiming it was met |

The optional fields in the same version — `wave`, `zone`, the three counters,
`files`, `tests`, `commit`, `note`, `debt`, `additions`, `updatedAt` — would
have raised nothing on their own. **A state written under version 1 stays
readable**: the dashboard renders what it can, and the fields it does not find
render as absent rather than as zero.
