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

### 3. Write `brief.md`, in English, once

Render the redacted бриф into English and write it to
`.maestro/<slug>/<YYYY-MM-DD>-brief.md`.

- This is the **only** translation in the whole прогон. No later phase
  re-translates anything.
- Translate; do not summarise, tidy, or resolve. An ambiguity in the бриф is
  carried into English as an ambiguity, and belongs to the брифинг phase.
- Where a translation was genuinely uncertain, note it — it goes under
  Assumptions in `report.md` at the end.
- The file is dated because a feature slug outlives one sitting, and it is
  written once.

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
- **`manifest.md` holds text and nothing else.** No status column, no notes. It
  is written once and never edited: that is what makes S1 checkable.

### 5. Write the statuses into the run state

Every требование gets an entry in `requirements[]` in the run state with status
`open`. Statuses live in the state, not in the manifest, so the manifest stays
immutable and the gates have one place to read.

A status of `open`, `deferred` or `dropped` requires a recorded reason. At this
point every требование is `open` with the reason "not yet briefed"; G1 is what
later insists that none of them stayed that way without an answer.

### 6. Show the манифест to the user, in Russian

Before any other work begins, show the numbered list back in Russian:

```text
R01 — …
R02 — …
```

- This is the translated contract being agreed rather than substituted.
- In `semi`, `interview` and `manual`: ask whether anything is missing or
  misread, and wait. **Offer the answers** — see *Asking A Question* in
  `SKILL.md`. Three of them, at least: that it is right and the брифинг may
  begin, that a требование is wrong or missing and here is which, and their own
  words for anything neither covers. Say which requirement they would be
  naming — `R02`, not «одно из них» — and say that this is the last moment the
  манифест is open to you, because after this phase only they can change it.
- In `full`: show it anyway, **without a question**, and continue. Any wording
  whose translation was uncertain goes to Assumptions in `report.md`.
- If the user corrects a требование, correct `manifest.md` before it is
  considered written — this is the one moment it is still open. After this
  phase, a требование is removed only by the user, in their own words, quoted
  into the манифест.

## Gates

None after this phase. G1 runs after брифинг, and it reads the statuses this
phase created.

## Output Of This Phase

| Artifact | State |
|---|---|
| `.maestro/<slug>/<YYYY-MM-DD>-brief.md` | written once, English, redacted |
| `.maestro/<slug>/manifest.md` | written once, numbered требования, no statuses |
| `.maestro/state.js` | `requirements[]` filled, every entry `open` with a reason |
| the манифест | shown to the user in Russian |

Then read the briefing phase file.
