# Phase 0a — Dials

Read at the start of preflight, before anything else. Resolve the dials once,
announce them, and record them in the run state. Every later phase applies them
and none of them re-resolves.

## What The Arguments Contain

Everything typed after `/maestro` is six things: a **register**, a **language**,
a **mode**, a **depth**, a **finish**, and the бриф. Dials are bare words, no
dashes.

**Anything you do not recognise as a dial is бриф text.** A word the user meant
literally is never taken as a dial.

## Register

How you word what the user reads — not how much you ask them. Built-in default
for `explain`: `normal`. A project may pin its own — see below.

| Register | Russian triggers | English triggers | What changes |
|---|---|---|---|
| `plain` | по-простому, простыми словами, объясняй проще | plain, simple, explain simply | every sentence the user reads is written for someone who has never built software |
| `normal` | как обычно, обычным языком | usual, as usual | the terms of the словарь are used as they stand, unexplained |

`normal` is **not** a trigger word. It is the built-in value of this dial and of
the depth at once, and a bare word setting two dials would be ambiguous by
construction.

**What `plain` requires of you is in `SKILL.md`, under *Speaking Plainly***,
because every phase speaks to the user and this file is closed after preflight.
Resolve the dial here; obey it everywhere.

### Changing It Mid-Прогон

Unlike every other dial, this one may change **inside** a phase, and it takes
effect on the next sentence. It is not recorded in `dialChanges[]` and it earns
no write of its own: it produces no part of the build, so there is nothing for
the отчёт to attribute to it. The new value reaches `state.js` at the next
ordinary write.

## Language

Which language you speak in — not how you word a sentence. The register decides
whether a sentence is written for a beginner; this decides which words it is
written in. **This dial has no built-in default**: it is read off the бриф,
which you already have.

| Language | Russian triggers | English triggers | What changes |
|---|---|---|---|
| `ru` | по-русски, отвечай по-русски | in russian, russian | every sentence the user reads and every label on the panel is Russian |
| `en` | по-английски, отвечай по-английски | in english, english | the same sentences and the same labels in English |

Take the first of these that supplies a value:

1. a trigger word in the arguments,
2. the `language` key of `.maestro/config.json`, when its value is `ru` or `en`,
3. the language the бриф is written in.

A бриф that is neither clearly one nor the other — two words, a URL, a
filename — takes `en`. Every file you write is English anyway, so that is the
fallback that surprises least. **Do not ask** which language: you are holding
the answer, and a question whose answer is already on screen reads as a tool
that did not look.

Write the resolved value into `state.js` as `language`, so the panel paints
itself in it. Everything else about the dial is in `SKILL.md`, under *Language*.

### Changing It Mid-Прогон

Like the register: it may change **inside** a phase, it takes effect on the next
sentence, it is recorded in no `dialChanges[]` entry, and it earns no write of
its own. The new value reaches `state.js` at the next ordinary write.

## Modes

Built-in default for `mode`: `semi`. A project may pin its own — see below.

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

## The Project's Defaults

Read `.maestro/config.json` before resolving, if it is there.

```json
{ "configVersion": 1, "mode": "full", "explain": "plain" }
```

Each of the two comes from the first of these that supplies it:

1. a token for that dial in the arguments,
2. its key in the file, when the value is one of the set,
3. `semi` for the mode, `normal` for the register.

A file may also carry `"language": "ru"` or `"language": "en"`, added by hand by
a user whose брифы will not always be in the language they read. Read it if it
is there; **never write it** — nothing asked for it.

Ignore a key whose value is outside its set, **one key at a time**: an
unreadable `explain` does not throw away a good `mode`. Ignore the file whole if
it will not parse, continue on `semi` and `normal`, and say in the announcement
that it was unreadable. Ignore keys you do not recognise — a later version may
pin more than these two. A setting never stops a прогон.

### When The File Is Not There

This is the first прогон in this project. Ask once, before anything else runs.

**Ask the register first**, and put the mode question in the register just
chosen. Asked the other way round, the one user who most needs plain words meets
a table with a `Human gates` column before anything has offered to speak
plainly, and the question that would have fixed it arrives too late.

| What the arguments named | What you ask |
|---|---|
| neither | the two registers, then the four modes |
| a register | pin that register? then the four modes, in it |
| a mode | the two registers, then pin that mode? |
| both | pin them? |

**The two registers**, marked so a user who does not care can take the default:

| Register | What you get |
|---|---|
| `plain` — по-простому | всё объясняется простыми словами, без сокращений |
| `normal` — обычный, built-in | рабочие термины как есть |

**The four modes.** In `normal`, this table:

| Mode | You are asked | The прогон decides |
|---|---|---|
| `full` | nothing | every fork, on its own |
| `semi` — built-in default | at a genuine fork, and only there | the rest |
| `interview` | every question the брифинг opens | nothing about the бриф |
| `manual` | the same, and you approve the spec and the plan | nothing before you have seen it |

In `plain`, the same four choices in ordinary words, with no column called
`Human gates` and no term left unexplained:

| Mode | По-русски |
|---|---|
| `full` | ничего не спрашиваю — решаю всё сам и в конце показываю, что решил |
| `semi` — по умолчанию | спрашиваю только там, где без вас не решить |
| `interview` | спрашиваю подробно обо всём, что важно для вашего проекта |
| `manual` | спрашиваю то же самое, и вы ещё утверждаете, что и как я буду делать |

**Ask these in `full` as well.** They are the questions that mode does not
remove. `full` frees the user from questions about what is being built; these
are about the tool, and they are asked once in a project's lifetime rather than
once a прогон.

Either answer produces a file: the chosen values, or `null` for a dial the user
declined to pin. **You do not write it here** — hand the decision to preflight,
which creates everything under `.maestro/`.

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
4. An unset depth or finish takes its default. An unset mode or register comes
   from *The Project's Defaults* above. An unset language comes from the бриф,
   through the three steps under *Language*.
5. A trigger phrase inside a longer sentence of бриф text does **not** set a
   dial. Dials are typed as bare words; they are not detected by meaning.

## Announcement

After resolution and before the manifest phase, state in one block:

- the register,
- the mode,
- the depth,
- whether доводка is on,
- the one consequence the user is most likely to be surprised by.
- where the mode or the register came from, whenever it was not typed: the path
  of the config file, or the built-in default. An argument that overrode a
  pinned value is said to hold for this прогон only.

**Write the announcement in the register and the language it names.** A block
explaining, in the словарь's own terms, that the прогон will speak plainly from
now on is the plain register failing in its first sentence — and the same block
in a language the user did not choose fails before it is read at all.

Use these:

| Dial | Say |
|---|---|
| `full` | no questions will be asked at any point |
| `strict` | nothing beyond the бриф will be added |
| `manual` | the run will wait for your approval twice |
| `polish` | up to three доводка rounds run after приёмка |
| `plain` | всё объясняется простыми словами; сказать «как обычно» — и вернётся обычный язык |

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
- **The register and the language are the exceptions to all three.** Either may
  change inside a phase, either takes effect on the next sentence, and neither
  is recorded anywhere — see *Changing It Mid-Прогон* under *Register* and under
  *Language* above.

## Output Of This Phase

- `explain`, `language`, `mode`, `depth` and `polish`, resolved.
- The announcement text, composed and ready, in the resolved register.
- The config decision, when this is a first прогон: the values to pin, each of
  them or `null`.

The announcement is **shown by preflight**, once the run state exists — a dial
announced before there is a run to announce it for is a promise with nothing
behind it. Read the preflight file next.
