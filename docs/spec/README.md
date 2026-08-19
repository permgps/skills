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

Read them in that order once. After that each document stands alone, which is
the point: a phase file being written needs one of them, not all eight.

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
| `gates.md` | Gates | `Gate`, `After phase`, `Pass condition` |
| `artifacts.md` | Run artifacts | `Artifact`, `Writer`, `Readers`, `Mutable` |
| `state-contract.md` | State fields | `Field`, `Type`, `Written in`, `Read by` |

The validator enforces that gates point at phases that exist, that every
artifact has exactly one writer, that every state field is produced and consumed,
that the stage sets in `phases.md` and `vocabulary.md` are identical, and that no
banned synonym appears in any defined label.

## Running The Checks

```bash
npm run check                                         # everything below, in order
node scripts/validate/spec-integrity.ts docs/spec     # check the specification
node --test 'scripts/**/*.test.ts'                    # check the checker
LOG_LEVEL=DEBUG node scripts/validate/spec-integrity.ts docs/spec
```

Scripts are TypeScript and run directly: Node 22.18+ strips the types, so there
is no build step between the source and the command above. `npm run typecheck`
runs `tsc --noEmit` separately when only the types are in question.

Pass a directory to the validator to check a different tree; it defaults to
`docs/spec`. `LOG_LEVEL` accepts `DEBUG`, `INFO`, `WARN`, `ERROR` and defaults to
`INFO`, so a CI run can be quietened without editing the script. Use the glob
form for the tests — a bare directory argument is not resolved as a test target.

Exit codes: `0` clean, `1` the specification contradicts itself, `2` the
directory could not be read.
