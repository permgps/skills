# Dials

Everything typed after `/maestro` splits into five parts: the **register**, the
**mode**, the **depth**, the **finish**, and the бриф. Bare words, no dashes.
Anything not recognised as a dial is бриф text — a word the user meant literally
is never stolen by a dial.

The dials are resolved once, before the manifest phase, and every later phase
only applies them.

## Register

**How the прогон talks, not how much it asks.** The mode decides how many
questions reach the user; the register decides what those questions — and every
other sentence the user reads — are worded like. The two are independent:
`full` in the plain register asks nothing and explains in plain words
everything it decided, while `interview` in the normal register asks everything
in the vocabulary's own terms.

| Register | Default | Russian triggers | English triggers | What changes |
|---|---|---|---|---|
| `plain` | | по-простому, простыми словами, объясняй проще | plain, simple, explain simply | every sentence the user reads is written for someone who has never built software: no technical shorthand at all, and a term from `vocabulary.md` carries one clause of explanation the first time it appears |
| `normal` | yes | как обычно, обычным языком | usual, as usual | the vocabulary's terms are used as they are throughout this specification, unexplained |

**`normal` is not a trigger word for anything.** It is the built-in value of two
dials at once — this one and the depth — and a bare word that set two dials
would be ambiguous by construction. Both are reached through the question,
through the project's pinned value, or by being left alone.

### What The Register Does Not Change

The register is language and nothing else. The same forks are found, the same
questions are put, the same gates run, the same phases execute in the same
order. A fork about technique reaches the user in `plain` exactly as it does in
`normal` — worded so that it can be answered without knowing the words, but
still asked. A fact about the user that `S3` forbids inventing still becomes a
visible заглушка in `full`.

Whether a beginner should be asked *different* questions rather than the same
questions differently is a separate feature. It would change the fork table in
the брифинг phase, the mode matrix and `S3`; it would not change this dial.

### What A Plain Sentence May Not Contain

The list of banned technical words lives in [`vocabulary.md`](vocabulary.md),
beside the labels, because it is a fact about wording. What is settled here is
the **boundary of the proof**. A validator reads every plain string this
repository ships — the dashboard's explanations — and holds each of them to that
list. The chat is composed at run time and no checker ever sees it; it is
covered by a rule in the bundle's `SKILL.md`, which is a weaker guarantee. The
boundary is written down rather than left to be discovered, because a rule
believed to be enforced and a rule that is enforced fail differently.

### Switching It Mid-Прогон

A register change takes effect in the chat at once: the next sentence the user
reads is in the new register. It is **not** recorded in `dialChanges[]`, and
that is deliberate. The list exists so the отчёт can say which part of the
прогон was produced under which settings, and the register produces no part of
the build — the same требования, the same таски, the same code, the same
reviews. Recording it there would mean widening the value set of
`dialChanges[].dial`, which raises `contractVersion` for a field the отчёт would
then have nothing to say about.

Because it produces nothing, it also earns no write of its own: the new value
reaches `state.js` at the next ordinary write, at a phase boundary or a task
transition, like everything else.

## Modes

| Mode | Default | Russian triggers | English triggers | Human gates |
|---|---|---|---|---|
| `full` | | полный автомат, ничего не спрашивай, сам реши | full, fully automatic, don't ask | none |
| `semi` | yes | полуавтомат | semi | questions, only on genuine forks |
| `interview` | | режим интервью, погоняй меня, разбери со мной | interview, grill me, ask me everything | every question the брифинг opens |
| `manual` | | ручной режим, согласовывай каждый шаг | manual, approve every step | the same questions, plus the spec and the plan |

`interview` and `manual` differ in exactly two cells: the spec gate and the plan
gate. If they ever differ anywhere else, one of them is wrong.

## Depths

| Depth | Default | Russian triggers | English triggers | Deepening a требование | New capabilities |
|---|---|---|---|---|---|
| `strict` | | строго по брифу, ничего не добавляй | strict, nothing extra | only what the requirement cannot work without | not allowed |
| `normal` | yes | | | by judgement, in proportion to the feature | allowed, each with a parent requirement |
| `deep` | | проработай глубоко, продумай за меня | deep, think it through | every dimension of every requirement | encouraged, same two limits |

A new capability always attaches to a parent требование. Depth buys thoroughness
beneath the бриф; it never buys a direction away from it.

## Finish

| Finish | Default | Russian triggers | English triggers | Adds |
|---|---|---|---|---|
| `polish` | off | доведи до эталона, сравни с образцом | polish | up to three доводка rounds after приёмка, comparing the running build against the user's own reference |

`polish` asks the user nothing and approves nothing with them. It changes no
mode cell.

## Where An Unset Mode Or Register Comes From

`semi` and `normal` are the built-in defaults, and a project may pin its own of
each. Three sources, in this order, for both dials:

| Order | Source | Lives in |
|---|---|---|
| 1 | the arguments of this run | what the user typed |
| 2 | the project's pinned default | `<project>/.maestro/config.json` |
| 3 | the built-in default | the Modes and Register tables above |

The file holds those two dials and the version of its own shape:

```json
{
  "configVersion": 1,
  "mode": "full",
  "explain": "plain"
}
```

`mode` is one of the four modes or `null`; `explain` is `plain`, `normal` or
`null`. Unknown keys are ignored, so `depth` and `polish` can be pinned later
without changing the version — and `explain` arriving after `configVersion 1`
was already in use does not change it either, for the same reason: a file
written before the register existed simply carries no `explain`, and a run that
reads one falls through to the built-in default.

**A key outside its set is ignored, and each key is ignored on its own**: an
unreadable `explain` does not throw away a good `mode`. A file that will not
parse at all is ignored whole, the run proceeds on `semi` and `normal`, and the
announcement says the file was unreadable. A setting is never a reason to stop a
run.

### The First Run In A Project

When no `.maestro/config.json` exists, the run asks once, at the point the dials
are resolved and before the manifest phase.

**The register is asked first, and the mode question is then put in the register
just chosen.** Asked the other way round, the one user who most needs plain
words meets a table with a `Human gates` column before anything has offered to
speak plainly — and the question that would have fixed it arrives too late to.

| What the user typed | What is asked |
|---|---|
| neither | the two registers, then the four modes — each one line per value, with the built-in default marked |
| a register | whether to pin that register, then the four modes, in it |
| a mode | the two registers, then whether to pin that mode |
| both | whether to pin them |

**The answer is written either way.** `"mode": null` and `"explain": null`
record a user who was asked and chose to pin neither, so the questions are asked
once per project rather than once per run. The file existing is what says they
were asked.

**These questions are asked in `full` as well.** It is the one place a mode's
own rule is set aside, and the reason is written here rather than left to be
rediscovered: `full` buys freedom from questions about the project being built,
these are about the tool, they are asked once in a project's lifetime, and
without the exception the mode most worth pinning would be the only one that
cannot be pinned from a run that uses it.

The dials phase asks; **preflight writes the file**, beside the run state. That
is the split this phase already has — it composes an announcement preflight
shows — and it keeps everything created under `.maestro/` with one writer.

## Resolution

1. Scan the arguments left to right for dial tokens.
2. The first recognised token for a dial sets it; every other token stays бриф text.
3. If a **second, different** token for the same dial appears, the dials are
   ambiguous. In `semi`, `interview` and `manual` the run stops before the
   manifest phase and asks which was meant. In `full` the first token wins and
   the choice is stated in the announcement, because that mode may not ask.
4. An unset depth or finish takes its default. An unset mode or register
   resolves through the order in *Where An Unset Mode Or Register Comes From*.
5. A trigger phrase that appears inside a longer sentence of бриф text does not
   set a dial. Dials are typed as bare words, not detected by meaning.

## Announcement

Once resolved, and before the manifest phase begins, the run states in one block:
the register, the mode, the depth, whether доводка is on, and the one consequence
the user is most likely to be surprised by (for `full`: that no questions will be
asked; for `strict`: that nothing beyond the бриф will be added; for `manual`:
that the run will wait for approval twice).

The announcement itself is written in the register it names. A block explaining
in the vocabulary's own terms that the прогон will from now on speak plainly is
the first sentence of the plain register failing.

The announcement is shown in every mode, `full` included. It is a statement, not
a question.

When the mode or the register did not come from the arguments, the announcement
names where it did come from — the path of the config file, or the built-in default. A run that
has stopped asking questions must be able to say why, and "a file settled this
once" is only useful when the file is named. When an argument overrides a pinned
mode, the announcement says the override holds for this run only.

## Switching Mid-Run

- A dial may be changed at any phase boundary, never inside a phase.
- The new value applies to phases not yet started. Phases already passed are not
  re-run; a run does not go backwards because the user changed their mind about
  how much to be asked.
- Switching to a mode with more gates adds those gates for the remaining phases.
  Switching to a mode with fewer never removes a gate that has already passed.
- The change is recorded in the run state with the phase at which it took effect,
  so the final отчёт can say which parts of the run were produced under which
  settings.
- **The register is the exception on both counts**: it may change inside a phase,
  it takes effect at once, and it is not recorded. *Switching It Mid-Прогон*
  under *Register* above says why.
