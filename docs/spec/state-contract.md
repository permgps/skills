# Run-State Contract

One authoritative state snapshot, owned by the orchestrator. The bundled
helper validates and publishes `state.js` atomically; the dashboard reads the
snapshot and its validation envelope. Verification records are embedded in the
snapshot, while immutable captures live under the run's `evidence/` directory.
See [`verification.md`](verification.md) for the entity graph and result rules.

## Fields

| Field | Type | Written in | Read by |
|---|---|---|---|
| `contractVersion` | integer | preflight | dashboard |
| `runId` | string | preflight | dashboard |
| `slug` | string | preflight | dashboard |
| `dir` | string, the run directory under `.maestro/`, required from contract 7 | preflight | dashboard |
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
| `tasks[]` | list of `{ id, title, requirementIds[], status, blockedBy[], wave, zone[], retries, repairs, handoffs, files[], startedAt?, finishedAt?, tests?, commits[] }` | plan | dashboard |
| `requirements[]` | list of `{ id, status, reason? }` | manifest | dashboard |
| `gates[]` | list of `{ id, status, findings[] }`, each finding a string | preflight | dashboard |
| `lifecycle` | `active` \| `closed` in contracts 4–7 | preflight | dashboard |
| `outcome` | `completed` \| `closed_with_exceptions` \| `stopped_incomplete`, only when closed | acceptance | dashboard |
| `stopReason` | string, required for `stopped_incomplete` | acceptance | dashboard |
| `verification` | versioned verification index, required in contracts 4–7 | preflight | dashboard |
| `debt` | `{ placeholders[], assumptions[], emptyEnv[] }`, three lists of strings | preflight | dashboard |
| `additions` | list of strings | preflight | dashboard |
| `tests` | `{ passed, failed }` | build | dashboard |
| `finishedAt` | ISO 8601 closure timestamp, only when closed in contracts 4–7 | acceptance | dashboard |
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

**`tasks[].commits` is a list because a repaired таск has more than one.**
A таск lands in one commit, and that commit's diff is the whole of what it did —
which is what makes a review of it possible at all. A таск that came back and was
repaired lands in a second one, and a field holding a single commit records the
last and loses the first. The first is exactly what the original review was
written against, so losing it loses what the re-review has to be measured by. The
entries are in the order they landed, and a таск's own work is the ordered
union of exactly these commits, read one commit at a time. A range from the
first commit's parent to the last is not that union once later waves land in
the tree: it carries every foreign commit between the two. See
[`phases.md`](phases.md) for what a re-review reads, and why it is not the tree.

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
| `lifecycle` | `active`, `closed` |
| `outcome` | `completed`, `closed_with_exceptions`, `stopped_incomplete` |
| `verification.executions[].result` | `not_run`, `passed`, `failed`, `unavailable`, `stale` |
| `verification.obligations[].result` | `passed`, `failed`, `incomplete` |
| `verification.readiness[].probes[].kind` | `source_identity`, `secrets_excluded`, `autoload`, `bootstrap`, `storage_and_cwd`, `database`, `listener`, `browser`, `write_boundary` |
| `verification.readiness[].probes[].result` | `passed`, `setup_failed`, `unavailable`, `not_applicable` |
| `verification.executions[].failureCause` | `product`, `test`, `setup`, `unavailable_capability` |
| `verification.defects[].causeClass` | `product`, `test`, `contract`, `evidence`, `environment` |
| `verification.defects[].status` | `open`, `verified`, `superseded` |
| `verification.repairAttempts[].outcome` | `defect_verified`, `still_failing`, `unavailable`, `prerequisite_blocked` |
| `verification.repairAttempts[].repeatKind` | `first`, `same_action_failed`, `different_action_same_cause`, `new_cause_same_surface`, `prerequisite_blocked`, `coordination_correction` |
| `verification.repairAttempts[].expectedProgress` | `defect_verified`, `scenario_verified`, `task_closure` |
| `verification.strategyReviews[].trigger` | `batch_without_closure`, `same_cause_survived`, `budget_exhausted`, `limit_request` |
| `verification.strategyReviews[].decision` | `change_strategy`, `stop_incomplete`, `request_limit` |

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
  not there to compare. A стадия still `pending` behind one that has started is
  the same rule with a different sentence: it never opened, so it is reported
  as *never opened* rather than *still open*, against its `status` rather than
  its `finishedAt`, and repaired by marking it `skipped` with a `note` or by
  stamping the interval it actually ran. Nothing closes or skips it
  automatically — the write that opens the next стадия already owns that.

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

  **The enforcement reaches each publication boundary.** Repository readers
  and writers use `scripts/state/validate.ts`; a real run supplies the complete
  candidate to the bundled `.maestro/sync.mts`, which validates before atomic
  publication. It checks the same version-4 graph, lifecycle, evidence
  integrity, statuses, timestamps, and spoken-field constraints. A rejected
  candidate is exposed as a diagnostic, never as an apparent successful run.
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
  A real прогон asks `.maestro/sync.mts` to publish the complete candidate with
  the expected revision and holder. This optimistic check detects a stale
  candidate; it is not a lock or a full compare-and-swap. That is why
  [`../../skills/maestro/SKILL.md`](../../skills/maestro/SKILL.md) still states
  the orchestrator's re-read step.
- Every write is a whole-file write of a valid state. A partially written state
  is a broken dashboard, so the file is written to a temporary name and moved
  into place.
- `interruptedAt` is set when a phase fails or the run stops, and cleared when a
  resumed run passes its next phase boundary. It is what lets the dashboard show
  an interrupted прогон as interrupted rather than as frozen.
- **Three fields are written in the прогон's language; every other one is
  English.** `gates[].findings`, `tasks[].title` and `stages[].note` are the
  only free text the page prints word for word — it has labels for everything
  else and no vocabulary at all for a line somebody composed — so these are read
  by the user and carry `language`. The boundary is what the page renders, not
  what the field holds: `debt` reaches it as three counts, `additions` is not
  rendered there, and `requirements[].reason` is read out of the отчёт instead.
  The rule and its reasoning live in
  [`../../skills/maestro/SKILL.md`](../../skills/maestro/SKILL.md) under
  *Language*, because it is the orchestrator that has to obey it.

  **`.maestro/sync.mts` holds it for `ru` only, and that edge is written here
  beside the enforcer.** A Russian line contains Cyrillic and an English one
  does not, so `ru` is decided by the alphabet. The mirror is not decidable — an
  English finding quoting the user's own Russian sentence is correct — and a
  check that failed the honest case would be worse than none. For `en` the rule
  in `SKILL.md` is the whole of the guarantee. Two languages reached one screen
  this way on 2026-08-22, and nothing anywhere noticed.
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
`skills/maestro/tools/runtime/state/contract.mts` — never against an illustration.

## Version 5 Extension

Contract 5 requires verification version 2, including `manifestDigest`,
`sourceSnapshots`, `sourceClauses`, `manifestAudits`, `scopeMappings`, `journeys`,
and `negativeControls`. `scopeBaseline` is created at initial agreement and
then frozen. Exact nested fields, ownership, ID formats, digest/span rules and
missing-capability outcomes are specified in
[verification.md](verification.md#completion-extension-verification-2).
Contract 4 continues to use verification 1 with its historical completion rules.
Versions 1–3 keep their historical fields. New safeguards remain unestablished
until explicitly reconstructed from actual inputs and independent returns.
No version conversion invents an original source, agreement or audit.

## Version 6 Extension

Contract 6 requires verification version 3: readiness records, failure causes,
defects, extended repair attempts, strategy reviews and the `limit_increase`
decision, specified with exact fields in
[verification.md](verification.md#closure-extension-verification-3). It also
gives `tasks[].blockedBy` one meaning: a blocker is finished when it is
`review` or `done`, and a таск is never moved to `running` while a blocker is
`queued`, `running`, `repair` or `failed`. A таск with an open defect is never
`done`.

A contract-5 run stays readable and strictly validated as contract 5. An
explicit resume writes it as contract 6 with every verification-2 record
preserved verbatim, names the carried executions and attempts in
`inheritedExecutionIds` and `inheritedAttemptIds`, and starts `readiness`,
`defects` and `strategyReviews` empty. No resume fabricates readiness, a defect
or a review the run never had.

## Version 7 Extension

Contract 7 keeps verification version 3 and every contract-6 rule, and adds
`dir`: the name of the run directory under `.maestro/`. Every path a прогон
writes is built from `dir`, never rebuilt from `slug`, because a name derived
from `slug` alone answers wrongly for the whole life of the run.

- **Grammar.** `<YYYY-MM-DD>-<slug>`, followed by `--wip` while the run is
  active. The slug is the canonical slug of the state, and `--` can never occur
  inside it, so the name parses one way.
- **The date never moves.** It is the UTC day of `startedAt`, built by the same
  function that names `<YYYY-MM-DD>-brief.md`, so the two dates in one
  directory cannot disagree.
- **`--wip` iff active.** `dir` ends in `--wip` exactly when `lifecycle` is
  `active`. Any closure — `completed`, `closed_with_exceptions` or
  `stopped_incomplete` — takes the suffix off; reopening a closed contract-7
  run puts it back, with the date and the slug unchanged. The outcome is told
  apart in the register ([`artifacts.md`](artifacts.md)), not in the name.
- **Frozen identity.** Between two published contract-7 states `runId`, `slug`
  and `startedAt` do not change, so neither part of `dir` can drift through a
  later write.
- **Relocation belongs to publication.** A phase changes `dir` together with
  `lifecycle`; `--publish` moves the folder (see *Autonomous Runtime* below).

A contract-6 or older state carries no `dir`, resolves its directory from
`slug` and is never relocated or upgraded: it keeps its name, its contract, and
its place outside the register. A contract-6 run continues as contract 6, and
the legacy resume conversion still targets contracts 4–6. A `dir` on a state
below contract 7 is refused, because the field would carry a meaning that
contract does not have.

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

**Version 7** requires a new field, `dir`, and gives the run directory a
meaning it did not have: a dated name whose suffix tracks the lifecycle. The
dashboard's `KNOWN_CONTRACT_VERSION` moves with it, and a contract-6 state
renders as it did, titled by its slug alone.

**Version 6** changes four value sets — the repair outcome gains
`defect_verified` and `prerequisite_blocked` and loses `repaired`, decisions
gain `limit_increase`, and readiness, defect and strategy-review values arrive —
and gives `blockedBy` a defined meaning. The dashboard's
`KNOWN_CONTRACT_VERSION` moves with it, and a contract-5 state renders as it
did, without the new regions.

**Version 5** requires the source audit, frozen scope and completion
safeguards of verification 2.

**Version 4** changes the meaning of completion, so it requires `lifecycle`,
`verification`, and (for closed states) `outcome` and `finishedAt`. The
verification index has its own `version: 1`. Active states have neither terminal
outcome nor closure timestamp. `completed` is possible only with current passing
coverage, G4 passed, and no outstanding promises. Earlier versions remain
readable as historical, unverified records; their `finishedAt` does not assert
verified completion. A resume creates a new candidate and requires fresh
evidence. See [`verification.md`](verification.md) for all closure cases.

**Version 2** raised the number because three value sets changed at once, not
because of the fields that arrived with them:

| Change | Why it was needed |
|---|---|
| `tasks[].status` gains `failed` | A таск that a retry could not rescue is not `queued`, `running` or `done`, and rendering it as any of those is the dashboard reporting work that is not happening |
| `stages[].status` gains `skipped` | A stage consciously not run — briefing in the mode that asks nothing — left `pending` forever reads as a прогон stuck there. `skipped` is always written with a `note` saying why |
| `requirements[].status` gains `placeholder` | Safety rule `S3` already produces требования delivered as visible placeholders. The status gives the thing a name the отчёт and the dashboard can count, instead of `in-spec` claiming it was met |

The optional fields in the same version — `wave`, `zone`, the three counters,
`files`, `tests`, `commit` (renamed in version 3, below), `note`, `debt`,
`additions`, `updatedAt` — would
have raised nothing on their own. **`explain` arrived later and still raised
nothing**, for exactly that reason: it is an optional field and it widened no
value set. **`language` arrived later still, on the same terms and with the same
result.** **A state written under version 1 stays
readable**: the dashboard renders what it can, and the fields it does not find
render as absent rather than as zero.

**Version 3** raised the number for one rename:

| Change | Why it was needed |
|---|---|
| `tasks[].commit` becomes `tasks[].commits`, a list of strings in the order they landed | A repaired таск lands twice, and one field records the last and loses the first — which is the commit its original review was written against |

The rule above says a rename "must land in the same change as the dashboard
update that handles it", and this one is named rather than skipped, because a
change that quietly does not honour the clause is indistinguishable from one that
forgot. **The dashboard has no handling to add: it never read this field**, under
either name. What it does carry is its own `KNOWN_CONTRACT_VERSION`, a copy of
the number that moves with it — a dashboard left behind at `2` tells the user
their прогон "used a newer contract" over a field it does not render.
`scripts/validate/state-matches-spec.ts` compares the two, so the copy cannot be
left behind quietly.

## Autonomous Runtime and Publication Boundary

The sole installed command is `node .maestro/sync.mts`; its relative
`runtime/` tree ships beside it. Canonical state modules live in
`skills/maestro/tools/runtime/state/*.mts`; repository `scripts/state/*.ts`
exports are compatibility facades. The installed helper imports only its own
modules and `node:*` built-ins. It resolves the run directory from the copied
entrypoint and the project root from that directory's parent, irrespective of
cwd or the target's package type. It publishes contracts 4, 5, 6 and 7; each keeps its own verification version,
and contract 7 shares verification 3 with contract 6. The contract version of a
run does not change between two published states except through the legacy
resume conversion.

**Relocation and the register.** When a contract-7 `--publish` candidate names a
`dir` other than the published one, publication moves `.maestro/<published>` to
`.maestro/<candidate>` after the structural checks and before the evidence
checks, which then run against the new location. The move is `git mv` when the
folder holds tracked files and a plain rename otherwise. A target that already
exists refuses the publish with nothing moved; any rejection after the move puts
the folder back by the same method. `--validate` and `--project` never move
anything. After every successful contract-7 publish, publication rewrites the
run's row in `.maestro/README.md` from the published state; a register write that
fails does not undo the publish, is reported in the result, and is repaired by
the next publish.

`--validate <candidate>` and `--project <candidate>` are read-only: no state,
diagnostic, snapshot, viewer or opener writes. JSON actions emit one result on
stdout: exit 0 for valid/current/legacy/published, 1 for invalid/rejected state,
2 for unreadable input or JSON parsing failure. Legacy projection preserves
historical gates with verification explicitly not established.

**Memory.** The helper has two actions outside the state, and neither touches
`state.js`, the viewer or the opener. Each emits one JSON line under the same
exit codes.

- `--memory-read --run-dir <dir>` writes `.maestro/<dir>/prior.md` from the
  maestro block of every known memory file and the `decisions.md` of each
  register row except `<dir>`. It reports `action: "written"`, `blockFiles`,
  `runs` and `notRead`. An existing `prior.md` is kept, with `action: "kept"`.
  Malformed markers are reported under `notRead` and still exit 0. A missing,
  malformed or absent run directory exits 2.
- `--memory-write --host <claude-code|codex|gemini-cli>` reads the block body
  from stdin and splices it into the memory file [`hosts.md`](hosts.md)
  resolves for that host. It reports `path`, `file`, `bytes`,
  `action` (`created`, `appended` or `replaced`), `loadedByHost` and `reason`.
  - Exit 1: the block is in two files (`files`), the markers are malformed
    (`file`, `lines`), or the body carries a marker.
  - Exit 2: the host is missing or unknown, or the body is empty or not piped.
  - Canonical module: `tools/runtime/memory.mts`. `scripts/memory/markers.ts`
    is its facade.

Strict `--publish <candidate> [--expect <revision>] [--holder <token>]`
requires a matching expected revision whenever state exists, checks both prior
and candidate holders, refuses unreadable or invalid history, and validates
immutable records and confined evidence/input hashes. Object key order does not
change record identity; array order remains significant. Digest algorithms do
not change. The compatibility `writeState` API retains its documented optional
expect behavior; it is not the strict publication boundary.

Each replacement uses an exclusive temporary file in the destination directory,
write, fsync, close and rename, removing temporary files on failure. Immediately
before replacing state, publication re-reads the prior revision and holder.
This detects concurrent changes without claiming a lease, exclusive lock or
multi-file transaction. Rejection preserves the last state and updates the
validation envelope/snapshot; a viewer failure may yield the file snapshot.
