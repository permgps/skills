# Dials

Everything typed after `/maestro` splits into four parts: the **mode**, the
**depth**, the **finish**, and the бриф. Bare words, no dashes. Anything not
recognised as a dial is бриф text — a word the user meant literally is never
stolen by a dial.

The dials are resolved once, before the manifest phase, and every later phase
only applies them.

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

## Where An Unset Mode Comes From

`semi` is the built-in default and a project may pin its own. Three sources, in
this order:

| Order | Source | Lives in |
|---|---|---|
| 1 | the arguments of this run | what the user typed |
| 2 | the project's pinned default | `<project>/.maestro/config.json` |
| 3 | the built-in default | the Modes table above |

The file holds one dial and the version of its own shape:

```json
{
  "configVersion": 1,
  "mode": "full"
}
```

`mode` is one of the four modes or `null`. Unknown keys are ignored, so `depth`
and `polish` can be pinned later without changing the version. **A file that
cannot be parsed, or a `mode` outside the set, is ignored**: the run proceeds on
`semi` and the announcement says the file was unreadable. A setting is never a
reason to stop a run.

### The First Run In A Project

When no `.maestro/config.json` exists, the run asks once, at the point the dials
are resolved and before the manifest phase.

| What the user typed | What is asked |
|---|---|
| no mode | the four modes, one line each, with `semi` marked as the built-in default |
| a mode | whether to pin that mode as this project's default |

**The answer is written either way.** `"mode": null` records a user who was
asked and chose not to pin one, so the question is asked once per project rather
than once per run. The file existing is what says the question was asked.

**This question is asked in `full` as well.** It is the one place a mode's own
rule is set aside, and the reason is written here rather than left to be
rediscovered: `full` buys freedom from questions about the project being built,
this one is about the tool, it is asked once in a project's lifetime, and
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
4. An unset depth or finish takes its default. An unset mode resolves
   through the order in *Where An Unset Mode Comes From*.
5. A trigger phrase that appears inside a longer sentence of бриф text does not
   set a dial. Dials are typed as bare words, not detected by meaning.

## Announcement

Once resolved, and before the manifest phase begins, the run states in one block:
the mode, the depth, whether доводка is on, and the one consequence the user is
most likely to be surprised by (for `full`: that no questions will be asked; for
`strict`: that nothing beyond the бриф will be added; for `manual`: that the
run will wait for approval twice).

The announcement is shown in every mode, `full` included. It is a statement, not
a question.

When the mode did not come from the arguments, the announcement names where it
did come from — the path of the config file, or the built-in default. A run that
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
