# Dials

Everything typed after `/maestro` splits into six parts: the **register**,
the **language**, the **mode**, the **depth**, the **models**, and the бриф. Bare words, no dashes; the models are one bare
`<strong>/<standard>` word.
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

## Language

**Which language the прогон speaks in, not how it words a sentence.** The
register decides whether a sentence is written for someone who has never built
software; the language decides which words it is written in. The two are
independent, and every combination is real: `plain` in `en` is a beginner's
sentence in English.

| Language | Russian triggers | English triggers | What changes |
|---|---|---|---|
| `ru` | по-русски, отвечай по-русски | in russian, russian | every sentence the user reads and every label on screen is Russian — the `Label` column of `vocabulary.md` |
| `en` | по-английски, отвечай по-английски | in english, english | the same sentences and the same labels in English — the `Label (en)` column of the same tables |

**This dial has no built-in default, and no row above is marked one.** Every
other dial applies a value when the user named none; this one reads it off the
бриф, which by then is already there — the бриф is what was typed after
`/maestro`, and the dials are resolved from the same line. A language somebody
has just written a paragraph in is a fact, not a guess, and a built-in default
here would be a guess overruling a fact.

### Where An Unset Language Comes From

| Order | Source | Lives in |
|---|---|---|
| 1 | the arguments of this run | a trigger word the user typed |
| 2 | the project's pinned language | `<project>/.maestro/config.json`, key `language` |
| 3 | the language of the бриф | what the user just wrote |

There is no fourth row. A бриф that is neither clearly Russian nor clearly
English — two words, a URL, a filename — takes `en`, because English is the
language every file this прогон writes is in anyway, and the fallback that
matches the artifacts is the one that surprises least.

The `language` key is read from the config file and **never written to it**. The
first прогон in a project asks about the mode and the register and pins the
answers; it does not ask about the language, because it can see the language.
Pinning one is a thing the user does to the file by hand, for a project whose
брифы will not always be written in the language its owner reads.

### What The Language Does Not Change

Every file the прогон writes stays English in both: the original text of
`brief.md`, `spec.md`, the task files, `report.md`, the code and its comments.
That rule is older than this dial and this dial does not touch it. Two non-English
things live inside artifacts, and neither one is the прогон writing in another
language.

The first is the `Требование` column header of `manifest.md` — the manifest's own
shape, covered where the manifest is specified, not here.

The second is the **additions block of `brief.md`**, and its reason is its own.
The block is a quotation: the user's words, taken down as they were said. This
dial decides which language the прогон *speaks* in, and the additions are not the
прогон speaking — they are the user being quoted for a reader that is measuring
the build against the user's words and is forbidden to read the прогон's
paraphrase of them. Translating the quotation would put a translation of the ruler
into the hands of the one reader whose whole job is to not be measuring against
something the прогон wrote. The additions keep their language for the same shape
of reason Scout's ТЗ draft keeps its own: writing it in English performs a
translation nothing checks, and it does it exactly where the contract stopped
being the прогон's own words.

The slug stays Latin in both, for the same reason it was Latin before: it is
part of a directory name, `<YYYY-MM-DD>-<slug>--wip`.

`en` is not a second product. Nothing about the phases, the gates, the safety
rules or the mode matrix reads differently in it; the same прогон is being
narrated in another language.

### Switching It Mid-Прогон

Like the register, and for the register's reason. It may change **inside** a
phase, it takes effect on the next sentence, and it is recorded in no
`dialChanges[]` entry: it produces no part of the build, so the отчёт has
nothing to attribute to it. The new value reaches `state.js` at the next
ordinary write.

The dashboard follows it at that write. What the reader may already have chosen
in their own browser wins over what the state says — see
[`dashboard.md`](dashboard.md) — because that choice is about the person looking
at the page and not about the прогон.

### The Boundary Of The Proof

The same one the register has, inherited exactly. A validator reads every label
and every explanation this repository ships and holds each of them to its own
column of `vocabulary.md`, in both languages. The chat is composed at run time
and no checker ever sees a word of it; it is covered by a rule in the bundle's
`SKILL.md`, which is a weaker guarantee. Written down here rather than left to
be discovered, because a rule believed to be enforced and a rule that is
enforced fail differently.

## Modes

| Mode | Default | Russian triggers | English triggers | Human gates |
|---|---|---|---|---|
| `full` | | полный автомат, ничего не спрашивай, сам реши | full, fully automatic, don't ask | none |
| `semi` | yes | полуавтомат | semi | questions, only on genuine forks |
| `interview` | | режим интервью, погоняй меня, разбери со мной | interview, grill me, ask me everything | every question the брифинг opens |
| `manual` | | ручной режим, согласовывай каждый шаг | manual, approve every step | the same questions, plus the spec and the plan |

`interview` and `manual` differ in exactly two cells: the spec gate and the plan
gate. If they ever differ anywhere else, one of them is wrong.

No mode changes what a прогон costs. A манифест of two or fewer требования is
told so in every mode: `full` says it and continues, and the other three offer
a stop among the манифест's answers ([`phases.md`](phases.md), The Манифест's
Size).

## Depths

| Depth | Default | Russian triggers | English triggers | Deepening a требование | New capabilities |
|---|---|---|---|---|---|
| `strict` | | строго по брифу, ничего не добавляй | strict, nothing extra | only what the requirement cannot work without | not allowed |
| `normal` | yes | | | by judgement, in proportion to the feature | allowed, each with a parent requirement |
| `deep` | | проработай глубоко, продумай за меня | deep, think it through | every dimension of every requirement | encouraged, same two limits |

A new capability always attaches to a parent требование. Depth buys thoroughness
beneath the бриф; it never buys a direction away from it.

`strict` is checked once more after the specification. The review phase records
behaviour no таск was asked for as an `unrequested` observation, and under
`strict` the orchestrator may send it to repair. The reviewer is never told the
depth; see [`phases.md`](phases.md), Review.

Required appearance and interaction parity is part of acceptance whenever the
user asked to preserve it, in every mode and at every depth; no dial waives a
required fidelity check or turns missing evidence into a pass. See
[`verification.md`](verification.md).

**There is no finish dial.** It was retired in contract 8, and nothing compares
the build against a comparable after приёмка. `polish`, «доведи до эталона» and
«сравни с образцом» are бриф text like any other words; «like X» becomes a
требование that G4 checks, and a comparable reaches the таски that build what
it shows through their task files' *References* row. No notice says the dial
is gone.

## Models

Which model each субагент runs on. There are two **tiers**: `strong` runs every
judge, every `strong` таск and every repair; `standard` runs `standard`
таски, the existing-code reader, the commit reader and the preflight probe. The orchestrator stays
on the session's model.

| Models | Strong | Standard | Default | Note |
|---|---|---|---|---|
| `session/session` | `session` | `session` | yes | the only value on a host that cannot choose a model per субагент |
| `session/next` | `session` | the reported model one tier below the session's | | marked recommended in the question |
| `session/cheapest` | `session` | the cheapest reported model | | |
| `<strong>/<standard>` | as typed | as typed | | a free choice; a `standard` stronger than `strong` is accepted and announced |

`session` means **pass no model**: the субагент inherits the session's, which
is today's behaviour and survives a change of the session's model. "One tier
below" and "cheapest" are ranked by the orchestrator over the names the host
reports at run time, never from a list in this repository. When it cannot rank
them, it offers only `session/session` and the free choice, and says why in one
line.

### The Token

An argument is the models dial when it is one bare word with no whitespace,
holding exactly one `/`, with both halves non-empty, and both halves are model
names this host reports — character for character. Anything else stays бриф
text: a URL (`://`, more than one `/`), a path, `session/sonnet` (`session` is no reported name), a
lone `sonnet`. The scan is the ordinary left-to-right resolution, and a second,
different models token follows the ordinary ambiguity rule. On a host with no
per-dispatch model choice there is no reported list, so no token is ever a dial.

Where each host lists its models, and which effort parameter it takes, is in
[`hosts.md`](hosts.md) › *Where Each Host Lists Its Models*. Effort is passed
equal to the session's wherever the host takes one and the session's is known;
when it is not, none is passed, and the announcement says `standard` таски run
at that model's default effort.

### Who Runs On Which Tier

| Role | Brief | Tier |
|---|---|---|
| preflight probe | — | `standard` |
| G1 source reader | `manifest-reader.md` | `strong` |
| existing-code reader | `existing-code-reader.md` | `standard` |
| commit reader | `commit-reader.md` | `standard` |
| G2 intent reader | `independent-reader.md` | `strong` |
| G2 reference reader | `reference-reader.md` | `strong` |
| G3 task reader | `task-reader.md` | `strong` |
| G3 plan-consistency reader | `plan-consistency-reader.md` | `strong` |
| build executor | `executor.md` | the таск's |
| repair executor | `executor.md` | `strong` |
| reviewer | `reviewer.md` | `strong` |
| standards reader | `standards-reader.md` | `strong` |
| repair diagnostician | `repair-diagnostician.md` | `strong` |
| strategy reviewer | `strategy-reviewer.md` | `strong` |
| G4 acceptance reader | `acceptance-reader.md` | `strong` |

- **A judge never runs `standard`.** A gate rests on its judge being no weaker
  than what it judges; `npm run readers` holds every judge brief to `strong`.
- A **retry** after a failed build attempt is a repair, so it runs `strong`. A
  **context handoff** continues the same build, so it keeps the таск's tier.
- The **preflight probe** runs `standard` because it is the one dispatch whose
  job is to find out whether a per-dispatch model reaches the host
  ([`hosts.md`](hosts.md) › *The Capabilities*). It is trivial, so the tier
  costs nothing.
- Which tier a таск is built on is the plan's mark, `tasks[].model`
  ([`phases.md`](phases.md) › Plan); G3 holds the mechanical half of it.

### Fixed For The Прогон

The models are fixed at the dials phase and the tier of each таск at the cut.
Neither changes inside a прогон, not even at a phase boundary: a `dialChanges`
entry would need a value nothing else uses, and the отчёт's per-model count
would stop meaning one thing. A request to change them is answered in one line:
the change applies from the next прогон, by editing `models.<host>` in
`.maestro/config.json`.

## Where An Unset Mode Or Register Comes From

`semi` and `normal` are the built-in defaults, and a project may pin its own of
each. Three sources, in this order, for both dials:

| Order | Source | Lives in |
|---|---|---|
| 1 | the arguments of this run | what the user typed |
| 2 | the project's pinned default | `<project>/.maestro/config.json` |
| 3 | the built-in default | the Modes and Register tables above |

The file holds those two dials, the models pinned per host, and the version of
its own shape:

```json
{
  "configVersion": 1,
  "mode": "full",
  "explain": "plain",
  "models": { "claude-code": { "strong": "session", "standard": "sonnet" } }
}
```

| Key | Values | Written by |
|---|---|---|
| `configVersion` | `1` | preflight, on a first прогон |
| `mode` | a mode, or `null` | preflight, on a first прогон |
| `explain` | a register, or `null` | preflight, on a first прогон |
| `language` | `ru` or `en` | the user, by hand; never a прогон |
| `models` | one `{ strong, standard }` per host id, each half `session` or a model name that host reports | the helper's `--config-models`, in preflight, once per host |

`mode` is one of the four modes or `null`; `explain` is `plain`, `normal` or
`null`. Unknown keys are ignored, so `depth` can be pinned later
without changing the version, and a `polish` key an older file carries is read
by nothing — and `explain` arriving after `configVersion 1`
was already in use does not change it either, for the same reason: a file
written before the register existed simply carries no `explain`, and a run that
reads one falls through to the built-in default.

**A key outside its set is ignored, and each key is ignored on its own**: an
unreadable `explain` does not throw away a good `mode`, and an invalid
`models` throws away neither. A file that will not
parse at all is ignored whole, the run proceeds on `semi` and `normal`, and the
announcement says the file was unreadable. A setting is never a reason to stop a
run.

### Where Unset Models Come From

| Order | Source | Lives in |
|---|---|---|
| 1 | the arguments of this run | a models token the user typed |
| 2 | this host's pinned models | `<project>/.maestro/config.json`, key `models.<host>` |
| 3 | the question | asked once per project and host |

A host with no model list skips all three: the models are `session/session` and
nothing is asked. **A pin counts only when both halves are `session` or names
this host reports now.** A pin naming a model the host no longer reports is
**stale**: it is treated as absent, the question is asked again, and the
announcement says the pin was stale. A token beside a valid pin holds for this
прогон only and asks nothing; a token with no valid pin asks whether to pin it.

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

### When This Host Has No Pin

The models are asked once per project **and host**: a second host meets a file
the first one wrote. The question comes after the register and the mode, in the
register just chosen, in `full` too and for the same reason. Its options are
the four rows of *Models*, built from what the host reports at run time, each
with the two model names in brackets and `session/next` marked recommended. In
`plain` it first explains the trade-off: the most important work runs on the
strongest model, and the ordinary pieces can go to a simpler one, which is
cheaper and faster, because every piece is checked.

**The answer goes into the existing file through the helper**, which is the one
exception to "never rewrite a file that is already there": `node
.maestro/sync.mts --config-models --host <id>` sets `models.<host>` and keeps
every other key and value, after the copied runtime validates and before the
first publish. It refuses `absent` when there is no file — creating one would
read as "the register and the mode were asked" — and `unreadable` when the file
is not a JSON object, which it leaves byte for byte. Either refusal leaves the
models for this прогон only, and the announcement says so. A hand-merged JSON
edit of the user's file is exactly the ritual a helper exists to remove.

## Resolution

1. Scan the arguments left to right for dial tokens.
2. The first recognised token for a dial sets it; every other token stays бриф text.
3. If a **second, different** token for the same dial appears, the dials are
   ambiguous. In `semi`, `interview` and `manual` the run stops before the
   manifest phase and asks which was meant. In `full` the first token wins and
   the choice is stated in the announcement, because that mode may not ask.
4. An unset depth takes its default. An unset mode or register
   resolves through the order in *Where An Unset Mode Or Register Comes From*.
   An unset language resolves through *Where An Unset Language Comes From*,
   which ends at the бриф rather than at a built-in value.
5. A trigger phrase that appears inside a longer sentence of бриф text does not
   set a dial. Dials are typed as bare words, not detected by meaning.

## Announcement

Once resolved, and before the manifest phase begins, the run states in one block:
the register, the mode, the depth, and the one consequence
the user is most likely to be surprised by (for `full`: that no questions will be
asked; for `strict`: that nothing beyond the бриф will be added; for `manual`:
that the run will wait for approval twice).

The announcement itself is written in the register **and the language** it
names. A block explaining in the vocabulary's own terms that the прогон will
from now on speak plainly is the first sentence of the plain register failing,
and the same block in the wrong language is that failure twice over.

The announcement is shown in every mode, `full` included. It is a statement, not
a question.

It names both models, with `session` given as the session model's actual name,
and where they came from: typed, the pin, the answer, or the built-in default.
A stale pin, a refused pin write, the effort line and a host with no model list
are each one more line.

When a newer Maestro is published than the one running, the announcement
carries one more line naming the new version and `npx skills update`. The
helper composes it in the прогон's language (`sync.mts --update-check`,
preflight step 4c) from `metadata.version` in the installed `SKILL.md` and one
GET of the published one. Offline, a timeout, any error, an equal or older
published version, and `MAESTRO_NO_UPDATE_CHECK=1` all say nothing: a check
that could not answer is never a reason to stop a прогон, and never a line the
user has to read.

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
- **The register and the language are the exceptions on both counts**: either
  may change inside a phase, either takes effect at once, and neither is
  recorded. *Switching It Mid-Прогон*, under *Register* and under *Language*
  above, says why.
- **The models are the exception the other way**: they never change inside a
  прогон at all. *Models* › *Fixed For The Прогон* says why.
