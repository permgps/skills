# Phase 0a — Dials

Read at the start of preflight, before anything else. Resolve the dials once,
announce them, and record them in the run state. Every later phase applies them
and none of them re-resolves.

## What The Arguments Contain

Everything typed after `/maestro` is four things: a **mode**, a **depth**, a
**finish**, and the бриф. Dials are bare words, no dashes.

**Anything you do not recognise as a dial is бриф text.** A word the user meant
literally is never taken as a dial.

## Modes

Default: `semi`.

| Mode | Russian triggers | English triggers | Human gates |
|---|---|---|---|
| `full` | полный автомат, ничего не спрашивай, сам реши | full, fully automatic, don't ask | none |
| `semi` | полуавтомат | semi | questions, only on genuine forks |
| `interview` | режим интервью, погоняй меня, разбери со мной | interview, grill me, ask me everything | every question the брифинг opens |
| `manual` | ручной режим, согласовывай каждый шаг | manual, approve every step | the same questions, plus the spec and the plan |

`interview` and `manual` differ in exactly two places: the spec gate and the plan
gate. Nowhere else.

## Depths

Default: `normal`.

| Depth | Russian triggers | English triggers | Deepening a требование | New capabilities |
|---|---|---|---|---|
| `strict` | строго по брифу, ничего не добавляй | strict, nothing extra | only what the requirement cannot work without | not allowed |
| `normal` | — | — | by judgement, in proportion to the feature | allowed, each with a parent требование |
| `deep` | проработай глубоко, продумай за меня | deep, think it through | every dimension of every requirement | encouraged, same two limits |

A new capability always attaches to a parent требование. Depth buys thoroughness
beneath the бриф; it never buys a direction away from it.

## Finish

Default: off.

| Finish | Russian triggers | English triggers | Adds |
|---|---|---|---|
| `polish` | доведи до эталона, сравни с образцом | polish | up to three доводка rounds after приёмка, comparing the running build against the user's own reference |

`polish` asks nothing and approves nothing with the user. It changes no mode
cell.

## Resolution

1. Scan the arguments left to right for dial tokens.
2. The first recognised token for a dial sets it. Every other token stays бриф
   text.
3. If a **second, different** token for the same dial appears, the dials are
   ambiguous:
   - in `semi`, `interview` and `manual` — stop before the manifest phase and ask
     which was meant;
   - in `full` — the first token wins, and say so in the announcement, because
     that mode may not ask.
4. Unset dials take their defaults.
5. A trigger phrase inside a longer sentence of бриф text does **not** set a
   dial. Dials are typed as bare words; they are not detected by meaning.

## Announcement

After resolution and before the manifest phase, state in one block:

- the mode,
- the depth,
- whether доводка is on,
- the one consequence the user is most likely to be surprised by.

Use these:

| Dial | Say |
|---|---|
| `full` | no questions will be asked at any point |
| `strict` | nothing beyond the бриф will be added |
| `manual` | the run will wait for your approval twice |
| `polish` | up to three доводка rounds run after приёмка |

The announcement is shown in **every** mode, `full` included. It is a statement,
not a question. Do not wait for a reply.

## Switching Mid-Run

- A dial may change at a phase boundary, never inside a phase.
- The new value applies to phases not yet started. Phases already passed are not
  re-run.
- Switching to a mode with more gates adds those gates for the remaining phases.
  Switching to a mode with fewer never removes a gate that has already passed.
- Record the change in the run state as a `dialChanges[]` entry with the phase at
  which it took effect, so the отчёт can say which parts of the run were produced
  under which settings.

## Output Of This Phase

- `mode`, `depth` and `polish`, resolved.
- The announcement text, composed and ready.

The announcement is **shown by preflight**, once the run state exists — a dial
announced before there is a run to announce it for is a promise with nothing
behind it. Read the preflight file next.
