# Phase 1 — Manifest

Read when preflight is done. This phase turns what the user said into numbered
требования. It is the only phase that translates, and the manifest it writes is
the contract every later gate measures against.

Nothing here is designed. A требование records what the user asked for, in their
terms. What it will take to build is the specification's job, two phases later.

## Steps

### 1. Take the бриф

Everything the user typed that was not a dial. If the бриф is a single sentence,
that is a valid бриф — do not pad it, and do not ask for more here. The брифинг
phase exists for questions.

### 2. Redact, before anything reaches disk

Run redaction over the бриф **first**, in memory. A detected credential becomes
`[REDACTED:<VAR_NAME>]`; the name survives, the value does not.

- "Verbatim" from here on means "verbatim after redaction". The two rules are
  one rule.
- If anything was redacted, tell the user which variable names were removed and
  advise rotating them. This is safety rule S2 — it is a stop condition, so
  report before continuing, in every mode.

### 3. Write `brief.md`, in English, once — then grow it, and never edit it

Render the redacted бриф into English and write it to
`.maestro/<slug>/<YYYY-MM-DD>-brief.md`.

- This is the **only** translation in the whole прогон. No later phase
  re-translates anything.
- **When the бриф is already English, it is translated zero times.** The file is
  the redacted бриф as it was typed. There is nothing here to render, and a
  pass that "tidied" it into better English would be the one thing this step
  forbids: the бриф is the user's words, and improving them is substituting
  them.
- Translate; do not summarise, tidy, or resolve. An ambiguity in the бриф is
  carried into English as an ambiguity, and belongs to the брифинг phase.
- Where a translation was genuinely uncertain, note it — it goes under
  Assumptions in `report.md` at the end.
- The file is dated because a feature slug outlives one sitting. The date marks
  the sitting: a бриф dictated on a later day is a new file under that day's
  date, not an append to this one.

**What you write here is frozen.** Nothing after this phase edits it — not a
correction, not a tidy-up, not a re-reading against the code. It is the version
the user agreed to at G1, and the frozen part is what makes everything appended
under it readable as an addition rather than as the бриф itself.

#### The additions block

After this phase the file grows. Everything the user says about the бриф while
the прогон is running is appended below the frozen text, oldest first, one dated
entry each. **You own the shape**, and only the shape: the appending happens in
whichever phase the words arrive, which is why the shape is written down here
rather than there.

An entry is two parts, and the order is the rule:

1. **The user's words, verbatim after redaction, in the language they were said
   in.** Do not translate them. `brief.md` is English and this is its one
   exception: the entry is a quotation, and a quotation keeps the language it was
   said in. Translating it would hand the acceptance reader a translation of the
   very ruler it measures against — and that reader is forbidden to read your
   paraphrase of the user's words, which is the whole reason it exists.
2. **One line of your own, visibly yours**, naming the `R##` the quotation
   touches and what was done about it — `dropped`, a new `Rnn`, or `deferred`.
   That line is English, like the rest of the file.

Two rules keep the block usable, and both are about who wins:

- **The quotation goes down first, always.** The order is what lets a reader
  tell the user's words from ours without reading for tone.
- **Where your line and the quotation disagree, the quotation wins.** Your line
  is a reading of the quotation, not a summary of it, and a reading is the part
  that can be wrong. The acceptance reader is told the same thing, so the two of
  you resolve a disagreement the same way.

```markdown
## 2026-09-27

> Слушай, убери требование про экспорт в CSV — передумал.

`R07` dropped at the user's request. No таск carries it and the schedule is one
таск shorter.
```

### 4. Number the требования into `manifest.md`

From the English `brief.md`, cut out every distinct thing asked for and number
it:

```markdown
| Id | Требование |
|---|---|
| R01 | … |
| R02 | … |
```

- Ids are `R01`, `R02`, … in the order they appear in the бриф.
- One asked-for thing per row. Two things joined by "and" are two rows.
- Include what the user said, not what it implies. An implication is depth, and
  depth is applied in the specification phase.
- **`manifest.md` holds text and nothing else.** No status column, no notes. An
  added требование becomes another row; a withdrawn one keeps its row unchanged.
  The manifest is the one document a gate can compare against `brief.md`, and two
  documents compared is one comparison — a status column here would give S1 two
  answers to choose from, which is why the statuses live in the run state and the
  reason for a removal lives in the additions block.

### 5. Write the statuses into the run state

Every требование gets an entry in `requirements[]` in the run state with status
`open`. Statuses live in the state, not in the manifest, so the manifest stays
immutable and the gates have one place to read.

A status of `open`, `deferred` or `dropped` requires a recorded reason. At this
point every требование is `open` with the reason "not yet briefed"; G1 is what
later insists that none of them stayed that way without an answer.

At the same write, detect preservation intent in the original request. “Clone
`legacy/`,” “port the current application,” and “make this behave like the old
site” declare authority without using the word “reference.” Give every named
repository tree, deployment, URL, screenshot, archive, or document a stable
`REF-*` record in `verification.references`, preserving the user statement,
role, location, access method, availability and limitation, revision identity,
conditions, and stated deviations. Do not create an unnamed reference for a
backend-only request with no declared authority. Open
[`../references/parity-migrations.md`](../references/parity-migrations.md) for
the bounded procedure when preservation intent is present.

### 6. Show the манифест to the user, in the прогон's language

Before any other work begins, show the numbered list back:

```text
R01 — …
R02 — …
```

- This is the contract being agreed rather than substituted.
- **When the бриф and the dial are in different languages, each line carries the
  original beneath it**, in the user's own words as they typed them:

  ```text
  R01 — Users can reset their password by email
        Пользователь может сбросить пароль по почте
  ```

  This gate is a round-trip check — the user is being asked whether what came
  back is what they said — and a round trip that shows only the far end is not
  one. It is the single place in the прогон where hiding a translation costs
  something, so it is the single place the original is shown beside it.
- **When they agree, there is no second line**, because there was no
  translation. A line repeated under itself would teach the user that the second
  line means nothing.
- **`manifest.md` is unchanged by all of this.** §4 stands: the file holds text
  and nothing else, it is written once, and what is written in it is the English
  требование. The second line lives in this display and nowhere on disk — the
  file the gates read must have one wording, or S1 has two documents to compare
  against and no way to choose.
- In `semi`, `interview` and `manual`: ask whether anything is missing or
  misread, and wait. **Offer the answers** — see *Asking A Question* in
  `SKILL.md`. Three of them, at least: that it is right and the брифинг may
  begin, that a требование is wrong or missing and here is which, and their own
  words for anything neither covers. Say which requirement they would be
  naming — `R02`, not "one of them" — and say that this is the last moment the
  манифест is open to you, because after this phase only they can change it.
- In `full`: show it anyway, **without a question**, and continue. Any wording
  whose translation was uncertain goes to Assumptions in `report.md`.
- If the user corrects a требование, correct `manifest.md` before it is
  considered written — this is the one moment it is still open. After this
  phase, a требование is removed only by the user, in their own words, quoted
  into the additions block of `brief.md`, with the decision recorded against it
  in the run state. The briefing phase owns that procedure; this phase only
  hands it over.

## Gates

None after this phase. G1 runs after брифинг, and it reads the statuses this
phase created.

## Output Of This Phase

| Artifact | State |
|---|---|
| `.maestro/<slug>/<YYYY-MM-DD>-brief.md` | the frozen English text, redacted; it grows afterwards by the additions block — the user's words quoted in their own language, each with one line of ours |
| `.maestro/<slug>/manifest.md` | numbered требования, no statuses and no notes; new rows appended when the user adds one |
| `.maestro/state.js` | `requirements[]` filled, every entry `open` with a reason |
| verification register | declared references recorded, including unavailable ones |
| the манифест | shown to the user in the прогон's language, with the original beside it when the two differ |

Then read the briefing phase file.
