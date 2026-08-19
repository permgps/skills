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
│   ├── report.md
│   └── decisions.md
├── state.js
└── dashboard.html
```

The dashboard is opened directly and there is no second entry point beside it.
An `index.html` pointing at a self-contained page would be an artifact with no
writer, which is how it survived unnoticed in this tree until the dashboard was
actually built.

## One Writer Each

| Artifact | Writer | Readers | Mutable |
|---|---|---|---|
| `brief.md` | manifest | manifest, acceptance | no |
| `manifest.md` | manifest | briefing, spec, plan, acceptance, G1, G2, G3, G4 | append-only |
| `answers.md` | briefing | spec | append-only |
| `reference.md` | briefing | acceptance | append-only |
| `spec.md` | spec | plan, build, review | yes, by amendment only |
| `interfaces.md` | plan | build, review | no |
| `discovered-interfaces.md` | build | build, memory | append-only |
| `tasks/NN-<slug>.md` | plan | build, review, G3 | no |
| `tasks/NN-<slug>-handoff.md` | build | build, review | no |
| `reviews/NN-<slug>.md` | review | repair, acceptance | append-only |
| `report.md` | acceptance | the user | no |
| `decisions.md` | memory | the user, a later прогон | append-only |
| `state.js` | preflight | dashboard | yes |
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

`reference.md` is read by доводка, which runs inside the acceptance stage after
приёмка and has no rules file yet. The row above names `acceptance` because the
stage is where that reading happens — a reader arriving with a later milestone
is a different thing from a reader that never existed, and the two are worth
keeping apart in a table whose job is to say who opens what.

A handoff exists only for a таск that ran out of context before it was done. It
is written by the orchestrator from what the executor returned — the executor's
keyboard reaches project code and nothing else — and it holds what is finished,
what is not, and what the next executor needs in order to continue the same
таск. **Its absence is the normal case.** A run where every таск has one is a run
whose plan cut таски too large, and the handoff is the symptom rather than the
remedy.

The project memory file is **not in that table**, and its absence is deliberate.
It is `AGENTS.md` in the target project's root — not a run artifact, not under
`.maestro/`, and not written once per прогон but added to across many. Its
single writer is named where the write permission is granted rather than here:
`safety.md` (`S5`) limits the orchestrator to run artifacts, the project memory
file, and version control, and [`phases.md`](phases.md) says what goes in it and
which region of it the прогон owns.

Requirement **statuses are not in `manifest.md`.** The manifest holds requirement
text, written once; the statuses live in the run state, whose writer is the
preflight-created state file. That keeps the manifest immutable and gives the
gates a single place to read from.

## Lifecycle

- `brief.md` is dated in its filename because a feature slug outlives one sitting.
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
once, in the manifest phase, and never again:

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
