# Run Artifacts

Everything a прогон writes into the target project. The record lives with the
project that was built, not with Maestro.

```text
<target-project>/.maestro/
├── <feature-slug>/
│   ├── <YYYY-MM-DD>-brief.md
│   ├── manifest.md
│   ├── answers.md
│   ├── reference.md
│   ├── spec.md
│   ├── interfaces.md
│   ├── discovered-interfaces.md
│   ├── tasks/NN-<slug>.md
│   ├── tasks/NN-<slug>-handoff.md
│   ├── reviews/NN-<slug>.md
│   ├── evidence/<execution-id>/...
│   ├── report.md
│   ├── decisions.md
│   └── amendments.md
├── config.json
├── state.js
└── dashboard.html
```

**`config.json` is the one artifact that outlives the run that created it.** It
holds the mode this project starts in when the arguments do not say — its shape,
its precedence and the question that fills it belong to
[`dials.md`](dials.md). It sits beside the run directories rather than inside
one because a setting that lived in `<feature-slug>/` would be a setting the
next прогон could not find. Preflight writes it on the first run in a project
and never again; after that the user edits it, which is why it is the only
mutable artifact here with no phase that rewrites it.

The dashboard is opened directly and there is no second entry point beside it.
An `index.html` pointing at a self-contained page would be an artifact with no
writer, which is how it survived unnoticed in this tree until the dashboard was
actually built.

## One Writer Each

| Artifact | Writer | Readers | Mutable |
|---|---|---|---|
| `brief.md` | manifest | manifest, G2, acceptance (the manifest plus the additions) | append-only |
| `manifest.md` | manifest | briefing, spec, plan, acceptance, G1, G2, G3, G4 | append-only |
| `answers.md` | briefing | spec | append-only |
| `reference.md` | briefing | G2 reference reader, acceptance reference reader, polish | append-only |
| `spec.md` | spec | plan, build, review | yes, by amendment only |
| `interfaces.md` | plan | build, review | no |
| `discovered-interfaces.md` | build | build, memory | append-only |
| `tasks/NN-<slug>.md` | plan | build, review, G3 | no |
| `tasks/NN-<slug>-handoff.md` | build | build, review | no |
| `reviews/NN-<slug>.md` | review | repair, acceptance | append-only |
| `report.md` | acceptance | the user | append-only |
| `evidence/<execution-id>/...` | acceptance | verification validator, acceptance | no |
| `decisions.md` | memory | the user, a later прогон | append-only |
| `amendments.md` | repair | build, review, acceptance | append-only |
| `config.json` | preflight | preflight | yes |
| `state.js` | preflight | dashboard, gates, metrics | yes |
| `dashboard.html` | preflight | the user | no |

The single-writer rule is the reason two artifacts exist where one would read
more naturally. `interfaces.md` holds the boundaries the plan derived from the
spec; `discovered-interfaces.md` holds what finished таски actually built. One
file written by two phases has no owner, and the first disagreement between them
is unattributable.

The review phase is **not** among its readers. A review judges one таск against
the task file its executor was handed and the boundaries in `interfaces.md`;
what other таски discovered afterwards was not part of that contract, and
measuring against it would be judging an executor by words it never saw.

Each task file contains the relevant user-contract and reference excerpts, the
observable obligation IDs and check IDs it serves, its implementation owner
when implementation is required, the check execution owner, variants, and
integration prerequisites. `interfaces.md` carries shared boundaries; the
executor does not receive the unrelated full specification. A verification-only
task can own an execution without claiming implementation files. G3 validates
both requirement-to-obligation-to-task and obligation-to-check-to-owner paths,
including dependency cycles and integrated-app prerequisites. Headless rendered
criteria are valid task checks; a visible viewer takeover is not.

`reference.md` is a neutral projection of declared source identity, role,
availability, and conditions. The independent G2 and G4 reference passes may
open it and inspect the raw reference. It carries no check verdicts, accepted
exceptions, or implementation rationale. A contextual example cannot silently
become authoritative behavior. The verification index in `state.js` is the
single verdict source; neither this file nor `report.md` may override it.

Executors and browser runners write captures in their own temporary locations.
The orchestrator imports verified captures into the immutable run-owned
`evidence/<execution-id>/` directory before publishing the new snapshot.
The table names acceptance as the owner of the evidence shape; imports may occur
during build or review as well, under the same orchestrator-owned protocol.
Evidence paths and hashes are indexed in `state.js`; the dashboard still reads
no artifact files. See [`verification.md`](verification.md).

A handoff exists only for a таск that ran out of context before it was done. It
is written by the orchestrator from what the executor returned — the executor's
keyboard reaches project code and nothing else — and it holds what is finished,
what is not, and what the next executor needs in order to continue the same
таск. **Its absence is the normal case.** A run where every таск has one is a run
whose plan cut таски too large, and the handoff is the symptom rather than the
remedy.

`report.md` is append-only rather than written once, and that is a consequence
of a failed G4 routing to repair. A прогон whose disagreements were repaired
reaches приёмка a second time, against a build that has changed. The second
reading appends its own five sections under its own date; it does not replace the
first, because the first is the record of what the build did before it was
repaired, and that is the part somebody checking the прогон afterwards has no
other way to see.

`amendments.md` exists because `spec.md` already has a writer. When the build
demonstrates that a требование cannot be built as it was specified, the record of
that is not an edit to the specification — it is a new fact, written by the
phase that established it, and read by everyone downstream. Two phases editing
one file would leave the first disagreement between them with no owner, which is
the single thing this table exists to prevent.

### What The `Mutable` Column Means

`Mutable` is a column of values rather than a sentence. Three values, and no
fourth: `no` — the file is written once and never changes; `yes` — the file is
rewritten by its own writer; `append-only` — it grows, and nothing already in it
is touched. A row may qualify its value after a comma, as `spec.md` does with
"by amendment only"; the qualifier is prose and this section is where it is read.

`append-only` means three things at once:

- the text already in the file is **never edited** — not corrected, not
  reordered, not summarised;
- an append is **additive**: a reader who knew the earlier version of the file
  can still find all of it;
- **the shape of what is appended is owned by the one phase in the `Writer`
  cell**, while the appending itself happens in whichever phase the words
  arrive. Those are two different things and only the first one is the single
  writer's.

The last clause is what makes this value usable for `brief.md`, whose appends
happen in whichever phase the user speaks in and whose shape is still the
manifest phase's to define. A row carrying `append-only` states its own appender
rule in the prose of this section — what a well-formed entry is, and in what
order the entries go down. **Nothing checks that sentence**, because the check
that reads this table can read a value and cannot read prose; the rule is
text-held and is written down here rather than left to be discovered.

Two rows carry a rule that is more than "append at the end", and each is written
where its artifact is:

- **`brief.md`** — the additions block, specified under *Translate Once* below.
  It is the one row whose appender is not its writer.
- **`report.md`** — a round of приёмка appended under its own date, which is the
  paragraph just above.

The project memory file is **not in that table**, and its absence is deliberate.
It is `AGENTS.md` in the target project's root — not a run artifact, not under
`.maestro/`, and not written once per прогон but added to across many. Its
single writer is named where the write permission is granted rather than here:
`safety.md` (`S5`) limits the orchestrator to run artifacts, the project memory
file, and version control, and [`phases.md`](phases.md) says what goes in it and
which region of it the прогон owns.

Requirement **statuses are not in `manifest.md`.** The manifest holds requirement
text and nothing else, growing by rows; the statuses live in the run state, whose
writer is the preflight-created state file. That keeps the manifest free of the
one column two readers could disagree about, and gives the gates a single place
to read a status from. A requirement the user adds later becomes another row; a
withdrawn one keeps its row unchanged, because the withdrawal is a status and
belongs in the state. The two documents stay comparable only while they are both
lists of requirement text — the moment one of them carries a status, S1's
comparison of them has two answers to choose from.

## Lifecycle

- `brief.md` is dated in its filename because a feature slug outlives one
  sitting. The date marks the sitting, and one sitting is one бриф: a бриф
  dictated on a later day is a new file under that day's date, not an append to
  this one. What grows inside one file is the additions block, which holds the
  changes the user made while this прогон was running.
- `.maestro/` is committed, not ignored. It is the user's record of what was
  promised and what was delivered; a прогон that leaves nothing behind did not
  happen.
- Nothing under `.maestro/` is deleted by a later прогон. A second feature gets
  a second slug directory.

## Redaction Gate

Every piece of user text — the бриф, every answer, every pasted fragment —
passes redaction **before it reaches a file**, never after.

- A detected secret becomes `[REDACTED:<VAR_NAME>]`. The variable name survives;
  the value does not.
- "Verbatim" always means "verbatim after redaction". The two rules are one rule.
- Before the first commit, redaction runs again over the whole of `.maestro/`.
- A secret found in an already-written file is rule `S2` from `safety.md`: a stop
  condition, reported with rotation advice.

## Translate Once

Every file is English; the user speaks Russian. The conversion happens exactly
once, in the manifest phase, and never again — with one exception, under *The
Additions Block* below, which is the user's own words quoted and not a text this
прогон composed:

1. The user's бриф is redacted, then rendered into English as `brief.md`.
2. The requirements are numbered from that English text into `manifest.md`.
3. The numbered манифест is **shown to the user in Russian** before any other
   work begins, so the translated contract is agreed rather than substituted.
4. In `full` mode the манифест is still shown, without a question, and any
   wording whose translation was uncertain is listed under Assumptions in
   `report.md`.

No later phase re-translates anything. A phase that finds an English requirement
unclear asks about the requirement, not about the translation — asking about the
translation would reopen the contract after it was agreed.

### The Additions Block

`brief.md` is written once, in the manifest phase, and appended to afterwards.
The text written in phase 1 is frozen — it is the version G1 was agreed against,
and the frozen part is what makes an append recognisable as one. The file holds
two things, in this order:

1. the frozen text from the manifest phase;
2. one dated entry per change the user made after that, oldest first — the
   additions block.

An entry is two parts, and the order is the rule:

- **The user's words, verbatim after redaction, in the language they were said
  in.** This is the second place inside an artifact where a language other than
  English is allowed, and [`dials.md`](dials.md) carries the reasoning with the
  first. In short: the entry is a quotation, and a quotation keeps the language
  it was said in.
- **One line, visibly ours**, naming the `R##` the quotation touches and what was
  done about it — the requirement was dropped, a new `Rnn` was added, or it was
  deferred. The line is English, like the rest of the file. **Where the line and
  the quotation disagree, the quotation wins**, because the quotation is the
  ruler and the line is our reading of it.

The appends happen in whichever phase the user speaks in; the shape above is the
manifest phase's, which is the phase this table names as the writer.
