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
| `heldBy` | optional `{ token, since }` | preflight | — |
| `mode` | `full` \| `semi` \| `interview` \| `manual` | preflight | dashboard |
| `depth` | `strict` \| `normal` \| `deep` | preflight | dashboard |
| `polish` | boolean | preflight | dashboard |
| `explain` | `plain` \| `normal` | preflight | dashboard |
| `language` | `ru` \| `en` | preflight | dashboard |
| `dialChanges[]` | list of `{ dial, from, to, atPhase }` | preflight | dashboard |
| `stages[]` | list of `{ id, status, startedAt?, finishedAt?, note? }` | preflight | dashboard |
| `currentStage` | stage id | preflight | dashboard |
| `tasks[]` | list of `{ id, title, requirementIds[], status, blockedBy[], wave, zone[], retries, repairs, handoffs, files[], startedAt?, finishedAt?, tests?, commit? }` | plan | dashboard |
| `requirements[]` | list of `{ id, status, reason? }` | manifest | dashboard |
| `gates[]` | list of `{ id, status, findings[] }`, each finding a string | preflight | dashboard |
| `debt` | `{ placeholders[], assumptions[], emptyEnv[] }`, three lists of strings | preflight | dashboard |
| `additions` | list of strings | preflight | dashboard |
| `tests` | `{ passed, failed }` | build | dashboard |
| `finishedAt` | ISO 8601 string | acceptance | dashboard |
| `interruptedAt` | ISO 8601 string | preflight | dashboard |

**`language` is the second such dial, and it is here for the same reason.** The
dashboard has to paint its labels and its explanations in one of two languages,
and `state.js` is the only thing the dashboard reads. It is **optional** on the
same terms as `explain`: a state written before the dial existed carries no
`language`, and a reader that met an absent one and supplied `ru` on the
writer's behalf would be reporting a choice nobody made. What the page does with
an absent value is the page's own rule, stated in [`dashboard.md`](dashboard.md);
what the contract says is only that the field may not be there.

`contractVersion` does not move for it. See *Version 2* below, where `explain`
is recorded as having arrived later and raised nothing — an optional field that
widens no existing value set is exactly the case that changes no version.

**`explain` is the one dial the state carries that produces no part of the
build.** It is here because the dashboard has to render its fourteen
explanations in the register the user chose, and `state.js` is the only thing
the dashboard reads. It is **optional**: every state written before the register
existed has no `explain`, and the page renders such a state exactly as it
rendered it then. A reader that met an absent `explain` and supplied `normal` on
the writer's behalf would be reporting a choice nobody made.

**`Written in` names the phase that creates a field, not every phase that later
changes it.** `stages[]` is the example: preflight writes all eight entries and
each later phase only moves a status. `gates[]` works the same way — preflight
seeds G1–G4 as `pending`, and the phase each gate follows fills in that gate's
own status and findings. The column has room for one phase because there is one
writer; a field with two creators would have no owner.

**`Read by` names readers outside the orchestrator, which is why every row but
one says `dashboard` and nothing else.** The orchestrator reads its own state
constantly — on recovery after a compaction, and in the repair phase, which
learns from `tasks[].status` which таск arrived and by which entrance. Listing
itself as a reader of what it writes would turn a column about the integration
point into a list of everywhere the state is opened, and the one thing that
column has to say is that the dashboard is the only party outside this process
that reads it.

`heldBy` is the row that says nothing there, and a dash is the honest cell: its
only reader is the orchestrator. Writing `dashboard` to keep the column's shape
would make the column lie about the one thing it exists to say.

**`heldBy` says which session is driving this прогон, and it is a claim rather
than a lock.** It carries a short random token the session mints when it opens a
прогон that carries none, and `since`, the moment that token was written —
`Date.parse`-able like every other stamp here. It is **optional**: a прогон
nobody claimed has no `heldBy`, and so does every state written before the field
existed.

The token is **minted, not discovered.** There is no session identity this
bundle can rely on across Claude Code, Codex and Gemini CLI, and a pid or a
hostname would name the machine instead — two sessions on one laptop would look
like one holder, and one session that outlived a restart would look like two.

**It detects a second orchestrator; it does not prevent one.** Nothing available
here prevents it honestly: there is no daemon, no lease that expires, and a
session dies without releasing anything, so a claim that refused would strand
the next session in front of a прогон it cannot touch — a failure worse than the
one being fixed, and silent besides. What the field buys is that the second
session finds out. A session meeting a token that is not its own says so and
asks: it cannot tell a live holder from a dead one, and deciding that on the
user's behalf is the one thing it is not equipped to do.

`contractVersion` does not move for it, on the same terms as `explain` and
`language` — an optional field that widens no value set raises nothing.

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

**`gates[].findings`, the three lists inside `debt`, and `additions` hold
strings, one line each.** The rows above say so and the validator enforces it;
it is repeated here because the phase writing one of them is pulled the other
way. A finding names a требование, quotes what the reader said, and records what
was done about it, which reads like three fields — and a writer that gives it
three fields produces a state the dashboard prints as `[object Object]`, the
metrics tool counts as nothing, and G4's own checker cannot read at all. The id
goes inside the line. Prose that does not fit a line belongs in the phase's
document, which is where a прогон keeps its prose; the state carries what the
dashboard shows.

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

**`pending` is a стадия's word and a гейт's, and never a таск's.** The three
sets sit one under another above and the middle one is the odd column out, which
is exactly how a real прогон came to write six таски with `pending` on one of
them: the phase file two steps earlier says the стадии are written `pending`,
and nothing said the таски were different. A cut таск is written `queued`. The
dashboard cannot count what it cannot name — it shows such a таск as written
rather than dropping it, and grades its progress at nothing.

`requirements[].reason` is required whenever the status is `deferred`, `dropped`,
`placeholder`, or still `open` at G1 — which is exactly what G1 checks. For a
`placeholder` the reason names what is still missing, because a требование
delivered as a visible gap and no note of what fills it is indistinguishable
from one that was met.

## Update Ritual

- The state is written at **phase boundaries and task transitions only**, never
  on a timer. A run with no state changes produces no writes.
- **A register change earns no write of its own.** It takes effect in the chat
  at once and reaches the state at the next ordinary write. It is not recorded
  in `dialChanges[]` either: that list says which part of the build was produced
  under which settings, and the register produces no part of the build. This is
  what keeps `contractVersion` at `2` — `dialChanges[].dial` keeps its three
  values, and `explain` arrives as an optional field, which raises nothing.
- A стадия is opened by the same write that closes the one before it. For
  consecutive non-`skipped` стадии, `finishedAt` of one is `startedAt` of the
  next, so the стадии account for the whole прогон and no interval belongs to
  none of them. `skipped` стадии are stepped over — they carry a `note` and need
  no timestamps of their own — and `polish` is outside the stage order and
  outside the chain. `scripts/state/validate.ts` enforces this as three rules:
  the two stamps meet, no more than one стадия is `active`, and no стадия is
  left open behind one that has already started. The last of those is the half
  of the write that gets forgotten — the next стадия is opened and the previous
  one is never closed — and until it was written down the chain gave up on that
  pair rather than reporting it, because one of the two stamps it compares was
  not there to compare.

  **A стадия's status is a claim about its own clock**, and the same validator
  holds it to that claim: a `done` стадия carries both stamps, an `active` one
  carries a `startedAt` and no `finishedAt`, a `pending` one carries neither,
  and a `failed` one carries a `startedAt` — nothing writes a failed стадия yet,
  and whether it closes is not settled here. `skipped` is asked for no stamps
  and refused none: it needs no timestamps of its own, which is not the same as
  being forbidden them. The three chain rules compare neighbours and can only
  speak once both sides are stamped, so a half-written стадия stays invisible to
  them until a later one arrives to be measured against it; these rules speak
  about one стадия alone, and catch it while it is still the only thing wrong.

  **A stamp is a moment, not a note.** Whatever a стадия carries must be
  readable by `Date.parse`, which is what every reader of this state uses — the
  chain rule, `scripts/metrics/`, and the page alike. A string none of them can
  read is reported as its own finding rather than as a missing stamp, because
  the repair differs: one field has to be written, the other corrected.

  **The enforcement reaches the state where this repository's own tooling reads
  and writes it** — `scripts/state/read.ts`, and `scripts/state/write.ts`, which
  refuses to write a state that fails. A прогон writes `state.js` itself and
  runs `.maestro/sync.py` after every write, and that tool checks that the file
  parses as JSON and nothing beyond it. So a broken chain is caught when the
  прогон is measured, not at the moment it is written. A specification that
  names an enforcer is read as a claim about coverage, which is why the edge of
  the coverage is written beside it.
- **`currentStage` may not name a стадия that has not begun.** The dashboard
  believes this field over the стадии themselves — `currentStage()` in
  `dashboard.html` takes the entry carrying this id and searches for the
  `active` стадия only when no entry has it — so a value pointing at a `pending`
  стадия puts the wrong phase on screen, at the wrong position in the eight,
  under the word «ожидает». Only `pending` is a contradiction: `done` is what a
  прогон that reached the end carries, and a `currentStage` naming a стадия that
  another one has overtaken is the truthful half of that defect, which the rules
  above attribute to `stages[]` where it belongs. A стадия absent from `stages[]`
  is not a finding here, for the same reason the chain steps around one: a record
  that does not mention a стадия says nothing about it.
- **A writer re-reads the file immediately before writing and compares
  `updatedAt` with the value it last read.** A stamp that moved means somebody
  else wrote in between, and that write is refused and reported rather than laid
  over the top. This is the whole of the concurrency rule, and it takes two
  fields to say it: `heldBy` names who claimed the прогон, `updatedAt` says
  whether the claim still held at the moment it mattered. A `heldBy` token that
  belongs to another session is reported with the refusal, because *who* is the
  first thing the user will ask.

  `scripts/state/write.ts` enforces it — `writeState` accepts the `updatedAt`
  the caller last read and refuses when the file on disk carries a different one.
  A прогон writes `state.js` itself and does not go through that module, so for
  a real run the re-read is a step the orchestrator performs rather than a
  property it can assume. That is why [`../../skills/maestro/SKILL.md`](../../skills/maestro/SKILL.md)
  states it as a step, and why the edge of the enforcement is written here beside
  the enforcer, as it is for the стадия chain above.
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
have raised nothing on their own. **`explain` arrived later and still raised
nothing**, for exactly that reason: it is an optional field and it widened no
value set. **`language` arrived later still, on the same terms and with the same
result.** **A state written under version 1 stays
readable**: the dashboard renders what it can, and the fields it does not find
render as absent rather than as zero.
