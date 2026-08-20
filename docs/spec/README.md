# Behavior Specification

This directory defines **what Maestro does**. It is the source every future
`skills/maestro/SKILL.md` and `phases/*.md` file is written from.

It is not a set of agent instructions. A phase file tells an agent how to act;
these documents state the behavior that agent must produce. When the two
disagree, this specification is right and the phase file is a bug.

## Reading Order

| # | Document | Owns |
|---|---|---|
| 1 | `vocabulary.md` | Every user-facing term, the stage labels, and the banned synonyms |
| 2 | `safety.md` | The rules that hold at every setting, and what happens when one breaks |
| 3 | `dials.md` | Modes, depths, the polish finish, their triggers and resolution |
| 4 | `phases.md` | The phase order, what each reads and produces, the per-mode matrix |
| 5 | `gates.md` | G1–G4: when each runs, what passes it, what a failure does |
| 6 | `artifacts.md` | Every file a run writes, its single writer, its lifecycle |
| 7 | `state-contract.md` | The run-state schema, who writes it, how it is versioned |
| 8 | `dashboard.md` | What the dashboard renders, and what it may never read |
| 9 | `hosts.md` | What a прогон needs from an agent host, and what a missing capability costs |

Read them in that order once. After that each document stands alone, which is
the point: a phase file being written needs one of them, not all nine.

## Identifier Schemes

| Scheme | Shape | Assigned in | Example |
|---|---|---|---|
| Requirement | `R` + two digits | manifest phase | `R07` |
| Task | `T` + two digits | plan phase | `T03` |
| Gate | `G` + one digit | fixed by this specification | `G2` |
| Safety rule | `S` + one digit | fixed by this specification | `S4` |
| Stage id | lowercase, single word | fixed by `phases.md` | `briefing` |
| Discovered fact | `D` + two digits | build phase | `D01` |

Identifiers are never reused inside a run and never renumbered. A dropped
requirement keeps its id and gains a status; it does not vanish, because a
manifest whose numbering shifts cannot be checked against anything.

## Rules For This Specification Itself

1. **One owner per statement.** A rule lives in exactly one document. If two
   documents need it, the second links to the first. Two copies drift, and the
   drift stays invisible until a gate disagrees with itself.
2. **Behavior, not phrasing.** No document here contains text meant to be pasted
   into a prompt.
3. **Machine-checkable where it matters.** The tables named in the next section
   have a fixed column layout because `scripts/validate/spec-integrity.ts`
   parses them. Renaming a column is a breaking change to that script.
4. **Russian appears only as data.** These documents are English. A Russian
   string inside them is always a user-facing label being defined, never prose.

## Machine-Readable Tables

| Document | Table | Required columns |
|---|---|---|
| `vocabulary.md` | Stage labels | `Stage id`, `Label` |
| `vocabulary.md` | Banned synonyms | `Banned`, `Use instead` |
| `phases.md` | Phases | `Id`, `Name`, `Stage`, `Reads`, `Produces` |
| `phases.md` | Mode Matrix | `Phase`, then one column per mode defined in `dials.md` |
| `dials.md` | Modes | `Mode`, `Default`, `Human gates` |
| `dials.md` | Register | `Register`, `Default`, `What changes` |
| `gates.md` | Gates | `Gate`, `After phase`, `Pass condition` |
| `artifacts.md` | Run artifacts | `Artifact`, `Writer`, `Readers`, `Mutable` |
| `state-contract.md` | State fields | `Field`, `Type`, `Written in`, `Read by` |

`dials.md`'s `Default` column has a second reader:
`scripts/validate/dials-defaults.ts` holds each dial's value set and its marked
default to the same answer in this document, the bundle's `phases/0-dials.md`
and its `SKILL.md`. The bundle has no column to put a default in, so it declares
one in a sentence — «Built-in default for `mode`: `semi`» — and that phrasing is
the contract the checker reads. **The sentence names the dial**, because a file
declaring two of them would otherwise read as one dial's default stated twice.
A project's own pinned default lives in the user's `.maestro/config.json` and is
outside anything this repository can check.

The validator enforces that gates point at phases that exist, that every
artifact has exactly one writer, that every state field is produced and consumed,
that the stage sets in `phases.md` and `vocabulary.md` are identical, that the
mode matrix has one row per stage and one column per mode with no cell left
empty, and that no banned synonym appears in any defined label.

## Running The Checks

```bash
npm run check                                          # everything below, in order

node scripts/validate/spec-integrity.ts docs/spec      # the specification vs itself
node scripts/validate/bundle-integrity.ts skills/maestro   # the skill bundle's structure
node scripts/validate/dashboard-integrity.ts \
  skills/maestro/assets/dashboard.html docs/spec           # the dashboard asset
node scripts/validate/state-matches-spec.ts docs/spec  # the contract vs its code
node scripts/validate/host-degradation.ts \
  docs/spec skills/maestro                               # host degradations vs the bundle
node scripts/validate/repair-doors.ts \
  docs/spec skills/maestro                               # the repair phase's doors
node scripts/validate/dials-defaults.ts \
  docs/spec skills/maestro                               # the mode set and its default
node --test 'scripts/**/*.test.ts'                     # the checkers themselves

LOG_LEVEL=DEBUG node scripts/validate/spec-integrity.ts docs/spec
```

Scripts are TypeScript and run directly: Node 22.18+ strips the types, so there
is no build step between the source and the command above. `npm run typecheck`
runs `tsc --noEmit` separately when only the types are in question.

`dashboard-integrity` takes the asset and the specification directory, and
defaults to both paths above. It proves the page is self-contained and that the
labels, stage order and gate map it copies still match `vocabulary.md`,
`phases.md` and `gates.md` — the page holds those copies because the state
stores ids and labels are resolved at render time, and an unchecked copy drifts.

`host-degradation` takes the same two paths and proves that a capability
[`hosts.md`](hosts.md) marks as degrading has both of its halves inside the
bundle: preflight establishes it by trying it, and the phase that spends it says
what its absence costs. The first end-to-end прогон is why the check exists —
the rule for a missing worktree lived only in `references/hosts.md`, which is
opened only on a host the прогон was not running on, so the wave that lost its
isolation had nothing to read. The two halves are marked in the phase files with
`<!-- maestro:probes:<capability> -->` and `<!-- maestro:degrades:<capability> -->`,
and a capability the specification calls a stop condition may not carry the
second one. It also holds the bundle's own `references/hosts.md` against this
document: every degrading capability owes a cost row there, each row names the
capability it is the runtime half of, and a row that stops the прогон where the
specification says it narrows — or the reverse — is the same defect seen from
the reference side.

`repair-doors` proves that every door into the repair phase declared in
[`phases.md`](phases.md) is listed by the bundle's own repair phase and marked
`<!-- maestro:opens:<door> -->` in the phase that sends work through it. The same
прогон is why: the specification's prose said repair had two entrances, a
paragraph forty lines below described a third, the bundle said three, and the
build wrote «carried to the repair phase» into a row for which none of them
existed. A door nobody opens is a promise, and this is the check that reads it
as a defect.

Pass a directory to the validator to check a different tree; it defaults to
`docs/spec`. `LOG_LEVEL` accepts `DEBUG`, `INFO`, `WARN`, `ERROR` and defaults to
`INFO`, so a CI run can be quietened without editing the script. Use the glob
form for the tests — a bare directory argument is not resolved as a test target.

Exit codes: `0` clean, `1` the specification contradicts itself, `2` the
directory could not be read.

## Measuring A Finished Прогон

```bash
node scripts/metrics/measure.ts <run-dir>   # or: npm run metrics -- <run-dir>
node scripts/metrics/measure.ts <run-dir> --json
```

It reads `state.js` and nothing else, which is the rule
[`dashboard.md`](dashboard.md) sets for the same reason: a measurement that
reached into `manifest.md` or a task file would be a second source of truth about
a прогон. What the state does not record is printed as a dash rather than
inferred from a neighbouring field.

Exit codes are `0` measured and `2` the state could not be read. There is no `1`:
this script checks nothing, and a прогон that went badly is measured exactly as
successfully as one that went well.

## Running The Gates

```bash
node scripts/gates/check-g1.ts <run-dir>   # after брифинг: every требование has a status
node scripts/gates/check-g2.ts <run-dir>   # after the spec: none left open
node scripts/gates/check-g3.ts <run-dir>   # after the plan: the map holds both ways
node scripts/gates/check-g4.ts <run-dir>   # after приёмка: the disagreements were recorded
```

Two of the four have a half no script can reach: the reader at G2 and the blind
reader at G4 are judged by what they were handed, and no field of the run state
records that. Those two check what was written down afterwards instead — that a
verdict exists, that it agrees with the findings under it, and that each finding
names a требование somebody can act on.

These are **not** part of `npm run check`, and no phase file names them. They
read a прогон's `state.js` — a file this repository never contains — so there is
nothing here for them to run against. `<run-dir>` defaults to `.maestro`.

What they are for is making each gate's pass condition executable and tested
rather than only described. `scripts/` ships with this repository and not inside
the skill bundle, so a прогон in a target project cannot reach them; the phase
file states the same condition in the orchestrator's own terms, and these say it
in a form that can be proven.

Exit codes: `0` the gate passes, `1` it fails with findings, `2` the state could
not be read at all. The last is kept distinct because an unreadable state is not
a failed gate — nothing was checked, and reporting it as a failure would send a
phase back to redo work that was never judged.
