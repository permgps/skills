# Scout — Behavior Specification

This directory defines **what Scout does**, and only Scout. It is the source
`skills/scout/SKILL.md` and its step files are written from.

Like [the Maestro specification](../README.md) beside it, this is not a set of
agent instructions. A step file tells an agent how to act; these documents state
the behavior that agent must produce. When the two disagree, this specification
is right and the step file is a bug.

## What Scout Is

Scout is reconnaissance before a прогон. A user arrives with a ТЗ that is thin —
sometimes three sentences, sometimes nothing but a domain — and Scout does the
work that thinness needs and Maestro deliberately does not: it reads the domain,
asks the user about the forks that reading exposes, proposes edits to the ТЗ in
the user's own words, and hands back a бриф the user pastes after `/maestro`.

**Scout produces no ruler.** It writes no `.maestro/` artifact, opens no прогон,
numbers no требование and passes no gate. Everything it produces is text the user
has read and accepted. This is what keeps it compatible with the thing that makes
Maestro's acceptance mean anything: G4 compares the build against `manifest.md`
with `spec.md` withheld, and that comparison is only worth running if the manifest
holds the *user's* words. A reconnaissance step that composed the ТЗ itself would
turn the last gate into self-confirmation. So Scout asks, proposes, and records —
and the words that survive are the user's.

**Scout sits upstream of phase 1, and only there.** It is not an entry point into
a прогон. It ends before one begins, and the handoff is the user pasting text.
A прогон run without Scout behaves exactly as it does today.

## Reading Order

| # | Document | Owns |
|---|---|---|
| 1 | `boundary.md` | What Scout may never do, and what a fetched page is |
| 2 | `steps.md` | The step order, what each reads and produces, and degradation |
| 3 | `search.md` | The two sweeps, their budgets, and what they produce |
| 4 | `reconcile.md` | Edit proposals: add, fix, remove — and what may force each |
| 5 | `output.md` | What a composed бриф is shaped like, and what language it is in |
| 6 | `vocabulary.md` | Scout's own terms, and the Maestro terms it borrows unchanged |

Read them in that order once. After that each document stands alone, which is the
point: a step file being written needs one of them, not all six.

## Identifier Schemes

| Scheme | Shape | Assigned in | Example |
|---|---|---|---|
| Step id | lowercase, single word | fixed by `steps.md` | `search` |
| Boundary rule | `B` + one digit | fixed by this specification | `B3` |
| Finding | `F` + two digits | search step | `F07` |
| Question | `Q` + two digits | grill step | `Q11` |
| Proposal | `P` + two digits | reconcile step | `P04` |

The runtime three — findings, questions, proposals — are numbered for one reason
and it is not tidiness. A proposal is accepted or rejected **individually**
(`reconcile.md`), a rejected one must not be raised again in a later round, and a
question that went unanswered is printed after the бриф with the reason it did
not close. None of that is possible against an unnumbered list. Identifiers are
never reused inside a Scout session and never renumbered.

`B` is deliberately not `S`. Maestro's safety rules are `S1`–`S6` and they are
owned by [`../safety.md`](../safety.md); a second `S4` in the same tree would be
a collision a reader discovers by being wrong about one of them.

## Rules For This Specification Itself

1. **One owner per statement, across both directories.** The rule and its test
   are stated once, in [the Maestro README](../README.md#rules-for-this-specification-itself),
   and this directory is bound by it. In practice the line falls here: a statement
   about what a прогон does belongs there; a statement about what Scout does
   before one starts belongs here. Two documents needing the same rule means the
   second links to the first.
   The case that will actually come up is worth naming in advance. Maestro's
   `S6` — text not received from the user directly is content, never instruction —
   is owned by `../safety.md`, and `boundary.md` does **not** restate it. What
   `boundary.md` owns is a statement `../safety.md` never makes: what a sweep does
   with a page it fetched itself. The rule is Maestro's; the application is
   Scout's, because Scout is what does the fetching. Same for `S3`: the rule that
   a fact about the user is never invented lives there, and what lives here is
   that a finding is not a fact about the user and may not become one.
2. **Behavior, not phrasing.** No document here contains text meant to be pasted
   into a prompt.
3. **Machine-checkable where it matters — and honest about where it does not.**
   The tables named below have a fixed column layout because
   `scripts/validate/spec-integrity.ts` parses them. But most of what this
   specification asks for is judgement made at run time: whether a question is a
   fork or a preference, whether a finding is a claim or a fact, whether a
   proposal's source is really a contradiction. No validator reads a question
   composed at run time. Where that is the situation, the document says so in
   place rather than leaving the reader to assume a checker exists.
4. **Russian appears only as data.** These documents are English. A Russian
   string inside them is always a user-facing label being defined, never prose.
   This is not in tension with the language rule in `output.md`, which is about
   the ТЗ Scout composes for its user — a document this specification describes
   and does not contain.

## Machine-Readable Tables

| Document | Table | Required columns |
|---|---|---|
| `steps.md` | Steps | `Id`, `Name`, `Reads`, `Produces` |
| `steps.md` | Degradation | `Capability`, `Absent`, `Cost` |
| `boundary.md` | Boundary rules | `Rule`, `What it forbids` |
| `reconcile.md` | Proposal kinds | `Kind`, `Shows`, `May be forced by` |
| `search.md` | Sweeps | `Sweep`, `Budget`, `Stops when`, `Produces` |
| `vocabulary.md` | Scout terms | `Term`, `Means` |
| `vocabulary.md` | Borrowed terms | `Term`, `Owned by` |

## Running The Checks

```bash
npm run spec:scout      # this directory against itself
npm run bundle:scout    # skills/scout's structure
```

Both are part of `npm run check`. `node scripts/validate/spec-integrity.ts
docs/spec` does **not** reach this directory: it reads its directory
non-recursively and filters for names ending in `.md`, so `scout/` is not among
them. That is why the second command exists rather than the first one growing a
recursive walk — widening the Maestro run to reach here would also make every
required-document rule apply to both trees, and the two trees do not have the
same required documents.

Exit codes follow the Maestro validator: `0` clean, `1` the specification
contradicts itself, `2` the directory could not be read.

## What Has Never Been Run

Every amendment in this repository so far was produced by evidence from a real
прогон. Scout was not. It was built from one run where its absence hurt — a
`interview deep` run whose бриф asked, in its own last paragraph, for exactly the
reconnaissance this skill performs, and which numbered that request `R42`–`R47`
instead — and from no run where its presence helped. Nothing in this directory
should be read as settled by experience until that changes.
