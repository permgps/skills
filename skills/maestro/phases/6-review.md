# Phase 6 — Ревью

Read when the build has come back and every таск sits at `review`. This phase
decides which of them become `done`, and it is the only look at the work against
the words its executor was actually given.

You judge here, and you do not fix. `S5` holds after the build exactly as it
held during it: a finding is not a defect you may put right between two
paragraphs, and a таск whose review blocked goes to repair rather than to your
keyboard.

## Steps

### 1. Read the таски

The run state's `tasks[]`, and the task file behind each one. That is what the
executors were handed, and this phase asks nothing that is not in them.

You are still holding `spec.md` from three phases ago. **The reviewers are
not**, and what you know from it does not enter a review: a finding that comes
out of the specification is a finding about the cut, and the cut was checked at
G3.

### 2. Take each таск's diff

One commit per finished таск is why this is possible at all — the diff of that
commit is the whole of what the таск did.

A таск with no commit to point at did not finish the way the build recorded it.
That is a build defect: report it and stop, rather than reviewing whatever sits
in the working tree and attributing it to a таск.

### 3. Hand every таск over, all at once

Give each reviewer its task file, that таск's diff, and `interfaces.md`, briefed
by [`../prompts/reviewer.md`](../prompts/reviewer.md). **Nothing else** — not
`spec.md`, not the манифест, not another таск's file or diff.

A review reads the project and writes nothing into it, so nothing here needs a
worktree, an order, or a wave. Every таск is reviewed at the same time as every
other.

### 4. Write down what came back

One `reviews/NN-<slug>.md` per таск, written **by you** from the reviewer's
text: findings quoted as they arrived, each still marked blocking or
observation. A reviewer's keyboard does not reach `.maestro/`, and a review
rewritten in your words is a review whose original nobody can check.

An observation is recorded and stops nothing; the отчёт reads these files later.

### 5. Move each таск

| The review says | The таск becomes |
|---|---|
| no blocking finding | `done` |
| one blocking finding or more | `repair` |

Write the state at the transition, never on a timer. **`done` is written here
and nowhere else.** It means reviewed and accepted, and the build stopped one
step short of it on purpose.

## When It Does Not Go That Way

Each of these has its own visible outcome. None of them is handled by picking up
the keyboard.

**A review has a blocking finding.** Write the review file, mark the таск
`repair`, say which таск and quote which finding — then go to the repair phase,
which `SKILL.md` names. The review file and the state are what it reads; whether
that таск is retried or the specification is amended is decided there, and
neither is decided here.

**A diff touched a file its task file does not own.** Blocking, whatever else
the review says and however good the change is. That list is the only thing
keeping parallel таски apart; a write outside it landed in a file another таск
may have been holding, and no later reading of the history can say whose it was.

**A reviewer asks for `spec.md`.** Refuse, and record that it asked. It is the
same signal as an executor asking: a task file that sends its reader looking for
the specification did not carry what it needed, and the plan phase is where that
is fixed for the next прогон.

**A reviewer returns a patch instead of a finding.** Do not apply it. Take the
finding out of it, discard the code, and record that the brief was exceeded.
Applying it would put project code in your hands — which is the one thing this
phase and the previous one agree about.

## Gates

**None.** G4 runs after приёмка and asks a different question against a
different document: the build against the манифест, with `spec.md` withheld.

A gate here would be that question asked early with the wrong material. This
phase's whole input is the task files, and a task file is the specification's
own paraphrase of itself. What checks a прогон against what the user actually
said is one gate, at the end, blind.

## Output Of This Phase

| Artifact | State |
|---|---|
| `.maestro/<slug>/reviews/NN-<slug>.md` | one per таск, findings quoted as they came back |
| `.maestro/state.js` | every таск `done`, or `repair` where a review blocked it; `currentStage` moved on |
| project code | unchanged — this phase writes none of it |

Then read the acceptance phase file.
