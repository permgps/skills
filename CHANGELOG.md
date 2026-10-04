# Changelog

Every released version of this repository, newest first.

A release here is an annotated git tag on the commit that carries its own version
bump. Nothing installs by tag — `npx skills add permgps/skills` reads the default
branch — so a tag names a moment for people rather than an artifact anyone
downloads. Pushing `main` is what actually ships.

The numbers are deliberately below `v0.1.0`. Four прогона have carried a бриф to
a finished отчёт with all four gates passed, but one of the four modes has never
been run at all and two findings about concurrent orchestrators stand open. A
number that claimed more than that would be claiming it falsely.

## Unreleased

## v0.0.8-alpha — 2026-10-04

Eleven changes from a second outside reading of the skill, each re-derived from
our own specification and written in our own words. None of them adds a stop,
and most live in phase files and prompts rather than in `SKILL.md`.
`CONTRACT_VERSION` stays `7`, so a contract-7 прогон already in progress is read
unchanged; the new `signals` and `oneWay` lists are optional.

**Upgrade notes.** Three changes are visible without reading the specification:
- the skill starts only when the user invokes it — `disable-model-invocation`
  on Claude Code, `agents/openai.yaml` on Codex;
- the memory block goes into the file the host loads at session start, which is
  no longer always `AGENTS.md`;
- the git guard is optional, offered in `docs/install.md`, and never installed
  by a прогон.

**An optional guard against destructive git.** `tools/guard-git.mts` is a
Claude Code `PreToolUse` hook that refuses:
- `git push`, forced or not;
- `reset --hard`;
- a forced `clean`;
- `branch -D`;
- a checkout, switch or restore that overwrites the working tree.

It finds these behind pipes, wrappers, `bash -c`, `eval` and `$(…)`. An
ambiguous `git checkout <word>` counts as a discard when the word exists on
disk. Everything else goes on to the usual permission prompt, because the guard
never answers `allow`.

`docs/install.md` offers it at install. A прогон never installs it, since that
would edit the user's settings outside S5's boundary. It is shipped for Claude
Code only; on Codex and Gemini CLI the S4 question stays the floor.

What holds it:
- `guard-git.test.ts` checks each blocked and allowed form, the hook contract
  through a subprocess, and an installed copy;
- `guard-git-bundle.test.ts` checks that no bundle file uses a refused command
  or names the guard.

No check holds that a Claude Code session calls the hook, or catches git
aliases and scripts.

**A retrospective from recorded signals.** Four phases said "record that it
asked" or "record that the brief was exceeded" and named no place to record it.
A new optional `signals` list in the run state holds those signals, one line
apiece: `SIG-<n> <kind> — <subject> — <who>`.
- Build appends an executor asking for `spec.md`.
- Review appends a reviewer asking for it, a reviewer returning a patch, and
  each path a таск's commits touched outside its files.
- Acceptance appends the G4 reader asking for `spec.md` or the бриф.
- Polish appends its reader asking for the манифест or the отчёт.
- Preflight seeds the list empty. `CONTRACT_VERSION` stays 7, and the
  dashboard does not render it.

`npm run metrics` closes with a `retrospective` section for whoever maintains
Maestro. It groups five classes, each labelled mechanical or judgement and
citing its record ids:
- withheld requests;
- briefs exceeded;
- writes outside a таск's files;
- superseded readiness records;
- repeated defect causes.

A list the прогон predates prints "not recorded", never zero. The state
validator holds the line grammar, `state-matches-spec` the kinds, and
`SIGNAL_ANCHORS` the phase sentences. No check holds whether a proposal is
right, or that every out-of-zone path in the commits reached the list.

**A leaner resident orchestrator, started only by the user.** `SKILL.md` stays
in context for a whole прогон, and every sentence in it was put to one test:
does it change the прогон's behaviour? A sentence that failed was deleted whole.
The file went from 625 lines to 552.
- Gone: the six explanations of why a rule is resident, the history of past
  прогоны, and the notes on which validator holds what.
- The reasoning now lives under *What Stays Resident* in `docs/spec/phases.md`.
- The rule that a quotation is not translated is stated once.
- Recovery of a run below contract 4 moved to `references/legacy-recovery.md`.
- The description dropped its retelling of the pipeline and keeps trigger
  conditions only, going from 515 characters to 256.

`bundle-integrity` now holds both numbers as exact ceilings. A file over its
ceiling is refused, and so is a file under it until the constant comes down to
match, so the numbers can only fall. Only the user starts the skill:
`disable-model-invocation: true` for Claude Code, and
`policy.allow_implicit_invocation: false` in the new `agents/openai.yaml` for
Codex. The checker refuses a bundle that declares one without the other. Gemini
CLI documents no equivalent. No check holds whether a kept sentence passes the
test.

**The отчёт hands over what only the user can do.** Two sections follow
Assumptions. *Questions to forward* turns the placeholders into a questionnaire
the user can send on unchanged to whoever knows the answer. It asks one question
per idea, says why each matters and who may know, leaves a blank for the
answer, and puts the most important question first. In the chat it is spoken in
the прогон's language. To feed it, the spec phase writes each placeholder as a
labelled line (`question:`, `matters:`, optional `ask:`), and S3 now sends an
invented fact there instead of to Assumptions. *Hard to undo* lists, in plain
words, the inward one-way changes the прогон made: deleted or renamed user
files, migrations, and major dependency upgrades. The review phase records them
from the per-commit diffs into a new optional `oneWay` list in the run state,
and preflight seeds it empty. An absent list reads "not recorded", never
"nothing". `CONTRACT_VERSION` stays `7`. `scripts/gates/one-way.ts` holds the
scan's mechanical half against git. `npm run report` holds the отчёт's section
list in the bundle and the specification and forbids a stated count.
`REPORT_ANCHORS` holds the prose. The placeholder labels are not refused at
`sync`, and ordering two equally weighted questions is judgement.

**Repair diagnoses by competing hypotheses.** The first repair stays
undiagnosed. From the repeated repair onward, the diagnostician no longer
proposes one grounded next approach. It ranks three to five hypotheses, each
with the observation that would falsify it, and runs the cheapest probe that
tells them apart first. When the probe needs a change, it becomes the
executor's first step, before any change. The reproduction is minimised until
every element is needed, one variable changes at a time, and a performance
defect starts from a measured baseline. The diagnosis names where the
regression check sits, or writes `noCorrectSeam:` with why none exists. That
line reaches the отчёт's Observations and the memory phase; the hypotheses
never reach the user. All of it lives as labelled lines inside the existing
`diagnosis` text, so the state contract is unchanged. The closure rules refuse
a repeated attempt whose diagnosis breaks that shape. The repair phase sends
such a diagnosis back once, without spending an attempt. The synthetic
regression of the failed contract-6 прогон now refuses a single-hypothesis
diagnosis, and `npm run bundle` holds the text as `DIAGNOSIS_ANCHORS`.

**Review sees what nobody asked for.** The reviewer has a fifth part.
Behaviour the diff adds that no *done means* item, interface or assigned check
accounts for is an observation tagged `unrequested`. It never blocks, and the
reviewer is never told the depth. Under `strict`, the orchestrator may send such
an observation to repair with a blocking finding of its own. That is the one
check after the specification that `strict` really means «only what the
requirement cannot work without». A repair tags any temporary diagnostic output
`[maestro-debug:DF-N]` and removes it before return. Before review, the
orchestrator treats a tagged line that survives a таск's commits as a blocking
finding that names the tag and the path, never the line.
`scripts/gates/debug-tags.ts` holds that condition against real git. Once per
прогон, after every таск is `done`, a new standards reader reads the union of
the commits. It also reads the project's documented standards, without the
Maestro block, and a baseline of nine named smells, each a judgement and never a
violation. It writes observations only, to `reviews/standards.md`. The отчёт
carries them, the memory phase reads the seam-level ones, and the pass is never
repeated. The acceptance reader's «extra is a question for somewhere else» now
names its owner. `npm run readers` holds the new reader's inputs, and
`npm run bundle` holds the text as `REVIEW_ANCHORS`. The state contract and
`SKILL.md` are unchanged.

**The plan cuts for width and for something to show.** The plan phase now states
four preferences, and it may decline any of them with a reason it names to the
user. The first is a thin path end to end, so a таск's *done means* is something
that visibly works. The second is a prefactor: a wave-1 таск in existing code
that splits a shared file so later таски can run side by side. It is cut only
when an existing check already covers that file's behaviour. The third cuts a
many-file rename into expand, migrate and contract. The fourth opens
`interfaces.md` with a Project conventions table: the test, typecheck and lint
commands, where tests live, and one test file as prior art. Task files cite it,
and the plan-consistency reader checks commands against it. A dependent таск is
now handed the `D##` rows its blockers recorded, each naming the таск it came
from. The rows are facts, not contract, and `interfaces.md` still wins. The task
reader reports a *done means* item that needs the output of a таск outside its
*Depends on*, which only a stub could meet. It also declares its inputs in its
brief, so `npm run readers` holds it to a new `G3 task` row. `npm run bundle`
holds the text as `CUT_ANCHORS`. The state contract and `SKILL.md` are
unchanged.

**Executors write tests that can fail.** A required check an executor writes now
has to be seen failing before it counts as passing. It fails on one of its named
assertions, against a stub of the таск's Test surface signature or the base,
before the implementation lands. The executor's `maestro-execution-return/1`
block is now a labelled template with an explicit `result` and a `red:` run.
`scripts/gates/execution-return.ts` reads it and refuses a block with no red run,
a red run on no named assertion, a skipped or pending test reported as a result,
and a passed result with a skipped assertion. A skip is `unavailable` with its
cause. Expected values come from the task file's literal or oracle and are never
recomputed the way the code computes them. Tests go through the Test surface,
and only external services, time and randomness are mocked. Every task file
names its Test surface, and the task reader reports a missing one. The reviewer
counts a missing red run, a recomputing assertion and a skip counted as a pass
as blocking. `npm run bundle` holds the text as `TESTING_ANCHORS` and runs the
shipped template through the parser. The state contract is unchanged: the red
run lives in the return.

**The briefing proposes, and the user disposes.** Every question now arrives
with one option marked as the прогон's choice, with its reason in one clause. It
is the same answer `full` would self-brief. A reply like «как советуешь» or a
bare «да» is recorded in `answers.md` as the full text of the option it chose,
on a `Chosen:` line, and shown back to the user. G1 checks the entry's fixed
shape through `scripts/gates/answers.ts`. Facts about the repository are read in
every mode, never asked, and the read-only ceiling is unchanged. Two
contradicting sentences of the бриф, a бриф that contradicts the code, and one
word used for two things are now forks, put to the user as a concrete scenario.
Rounds follow the frontier, at most two. In user-facing text an `R##` always
carries a gist of its требование. «Не понял» keeps the stop open and re-asks with
the missing premise. `npm run bundle` holds these rules as `BRIEFING_ANCHORS`
and checks the shipped `answers.md` template against the G1 parser.

**The next прогон reads what the last one remembered.** Phase 9 wrote the memory
block and `decisions.md`, and nothing ever read either. Preflight now runs
`sync.mts --memory-read` and writes `prior.md`: the block plus every earlier run's
decisions from the register. Briefing and the specification consult it, and a
choice that goes against an earlier decision says `contradicts <date> decision,
because …`. Every blind reader withholds `prior.md`, held by `npm run readers`.
The memory file is no longer always `AGENTS.md`. It is the file the host loads at
session start, recorded per host in `docs/spec/hosts.md`. The block goes into the
file the project already has and never into a second one. Phase 9 writes through
`sync.mts --memory-write`. A decision is recorded only when it is hard to reverse,
surprising without context, and had a real alternative. `interfaces.md` gains a
Terms table that the task reader holds task files to.

**Every субагент is a leaf.** Each of the eleven briefs in `prompts/` now tells
its субагент to invoke no skill and dispatch no agent, and to do the work in its
own context. Before this, an executor could read its таск as a new бриф and start
a nested прогон. Five briefs already had a "rules that still hold" section and
gained a third rule there; the other six gained the section. `npm run bundle`
fails a brief that does not carry the sentence. `SKILL.md` is unchanged, so
nothing resident grew.

**A `</script>` in the state no longer blanks the dashboard.** The state is
inlined into `dashboard.html` inside a script element, and a commitment text
containing `</script>` closed that element early, so the page never received
its state. Both the state snapshot and the validation snapshot now write `<`
as `<` before `script`, `/script` and `!--`, which is the same character
inside a string literal. `scripts/state/dashboard-snapshot.test.ts` holds it.

**Verification status:** `npm run check` passes 1141 tests with zero failures
and zero skips on macOS with Node v26.8.1. No real прогон has run under any of the
rules in this release; each is held by validators, gate scripts and tests.

## v0.0.7-alpha — 2026-10-01

**Contract 7: a run's directory says when it started and whether it landed
(breaking).** A new run writes into `.maestro/<YYYY-MM-DD>-<slug>--wip/` and
carries that name in the new required `dir` field. The date is the UTC day the
run started; `--wip` stays exactly while the run is active. Closing a run
takes the suffix off through `--publish`, which moves the folder with `git mv`
when it is tracked and puts it back if the publish is refused; an explicit
reopening puts the suffix back. Every successful contract-7 publish rewrites
the run's row in the register `.maestro/README.md`, between owned markers. The
dashboard title names the start date. Runs from before contract 7 keep their
slug directories and their contract; anything that joins `.maestro` with
`slug` must resolve the directory from `dir` instead.

**Contract 6: close таски instead of repeating repairs (breaking).** Contract 6
requires verification 3. It records readiness against a disposable source-only
copy before broad runs, so a setup failure is corrected instead of filed as
product failures. It splits findings into defects that close separately from
their таск, scopes each repair to one defect with a closure forecast, and stops
a batch that closed nothing for a fresh strategy review. A larger repair limit
needs the user's words. A plan-consistency reader joins G3. The gate refuses
unordered таски that share a file, and an execution owner that does not
transitively wait for its integration prerequisites. G4 refuses `completed`
with an open defect. Reviews read one diff per task commit, never a range. The
dashboard shows defects, the repair budget and readiness. Contract-5 runs remain
readable and resume as contract 6 with inherited history.

**A стадия that never opened is not called «still open».** The chain rule used
to report a `pending` стадия the прогон walked past as `"<id>" is still open`,
which was false twice: nothing was open and nothing needed closing. It now says
the стадия never opened, points at `stages[<id>].status` instead of its
`finishedAt`, and names both repairs — `skipped` with a note, or the stamps it
ran under. The finding is kept; no mechanism closes or skips a стадия on its own.

**Verification status:** `npm run check` passes 868 tests with zero failures
and zero skips on macOS with Node v26.8.1. No real run has exercised contract 6
or contract 7 yet; see [the run directory checkpoint](docs/parity-verification.md#contract-7-run-directory-checkpoint--2026-10-01)
and [the closure checkpoint](docs/parity-verification.md#contract-6-closure-checkpoint--2026-10-01).

## v0.0.6-alpha — 2026-09-30

**Autonomous Node runtime.** Replace the Python helper with `sync.mts` and a
self-contained `.mts` runtime for Node.js 22.18+ with native type stripping.
Repository state/logger exports now reuse the shipped implementations. Strict
publication retains revision/holder, immutable-history, evidence and diagnostic
guarantees; the owned detached viewer verifies readiness and directory/instance
identity. Preflight probes actual capability and copies the whole runtime.
Copied and installed-copy/link regressions run without Python, target build,
compiler, loader or npm install. Contract 5/verification 2 and client support
claims remain unchanged; historical Python evidence below remains historical.

**Runtime requirement:** Maestro now requires Node.js 22.18+ with native
TypeScript stripping enabled instead of Python. Upgrade by copying `sync.mts`
and the complete `runtime/` tree together, preserving run history and viewer
records; remove only the obsolete copied helper after validating the replacement.

**Verification status:** `npm run check` passes 763 tests with zero failures
and zero skips on macOS with Node v26.8.1. Installed-copy/link tests execute
outside the repository with an empty child PATH, no Python and no target
toolchain. Node 22.18 itself, Linux/Windows execution and real legacy Python
server adoption remain unverified. Pending full client/workflow acceptance is
unchanged. See [the migration checkpoint](docs/parity-verification.md#node-runtime-migration-checkpoint--2026-09-30).

## v0.0.5-alpha — 2026-09-30

**Native Codex compatibility (verification pending).** Maestro's development
link now uses `.agents/skills/maestro` for CLI and app discovery. A demand-loaded
runtime recipe explicitly delegates independent roles through exposed native
tools with fresh contexts, observed returns and absolute executor workspaces.
Missing concurrency/worktrees narrows editing waves; missing isolation, returns
or required browser evidence cannot become a passing gate. Structural checks
and regressions enforce these declarations. The workflow evaluator adds
`--entry installed-copy|installed-link` for `$maestro` discovery while preserving
its direct-path mode. CLI and app support claims require separate complete runs;
installation or synthetic parser receipts alone do not establish support.

**Source-audited completion protocols (preview).** Contract 5/verification 2
preserves redacted original-language source and requires an independent
source-to-manifest audit before agreement. Integrated journeys, readiness checks
and selected isolated negative controls contribute to acceptance. Repeated
repairs retain stable finding identities and finite budgets and require an
independent changed diagnosis. Original scope keeps its frozen denominator;
current scope, deferrals, additions and exceptions are displayed separately.
TypeScript, the bundled standard-library Python helper and the dashboard consume
the same atomic state. Historical v4 outcomes remain readable; explicit resume
reconstructs the new safeguards without inventing audits or evidence.

Actual Luna evaluations exposed publication and handoff defects that were fixed:
provisional manifest creation, retained audit history, planning-time owner
assignment, optional null fields, inherited working directories and stage-clock
overlaps. The provider-neutral evaluation harness now persists initial protected
identities before dispatch and redacted host events before timeout or interruption.

**Verification status:** `npm run check` passes all 739 tests with zero failures
and zero skips, including actual Python helper integration. Fresh Codex CLI
0.159.2 runs with observed gpt-6.1-sol discover Maestro through `$maestro` from
copied and linked bundles and return fresh independent children. Both hit the
15-minute deadline before final acceptance/report/memory; the Codex app has no
separate run evidence. Encrypted saved handoffs prevent exact-input attestation.
The fresh Luna samples and broader installed-bundle matrix remain open. This is
an alpha preview, not a claim of fully verified completion. See
[the execution record](docs/parity-verification.md).

## v0.0.4-alpha — 2026-09-29

**Verification contract v4 (preview).** The run now separates planning
status, task activity, observed conformance, and closure outcome. Reference
preservation is registered from user intent, independently inventoried from raw
authority at G2 and G4, and remains mandatory when optional polish is off.
Obligations, checks, executions, findings, decisions, coverage reviews, and
promised work live in one atomic state snapshot; immutable captures are
referenced by hash. The bundled Python helper validates candidates before
publication, while the dashboard, report projection, and metrics show failed,
incomplete, exception, and legacy-unverified states distinctly. Structural and
contract checks pass. The browser suite passes against the correct menu and
rejects ten broken variants using the same real-input oracle. `npm run check`
passes 667 tests, including Python helper integration.

**Known verification limit:** the independent end-to-end workflow evaluation was
stopped before final acceptance. Its harness now checks actual child-agent
dispatches and grades the final build with the browser oracle, but the copied
bundle has not passed the full acceptance matrix. This alpha release does not
claim that the new workflow is fully verified.

## v0.0.3-alpha — 2026-09-27

**The бриф grows, and the blind check reads what the user said after it was frozen.** `brief.md` was written once in phase 1 and never edited, and `manifest.md` holds requirement text and no statuses by design — so a требование the user withdraws at таск four was `dropped` in the run state, where nothing in the acceptance path reads it, and the blind reader reported a false «R03 не реализовано»; one the user *adds* at таск four was in no document that reader was handed, and was checked by nobody at all. The two independent gates are the only checks capable of catching a lost требование, and a change that reached the run state and not the бриф was invisible to both. `brief.md` is now append-only: the phase-1 text frozen, then one dated entry per change, so the numbered list a gate measures against and the words it measures stay in step. The additions are **quoted rather than translated** — each entry is the user's words verbatim, in the language they were said in, with one line of the прогон's own under it naming the `R##` and what was done about it — because the block is the ruler the blind reader holds the build against, and a ruler the прогон translated is a ruler the прогон wrote. G4 is handed the manifest plus the additions and still **not** the бриф's original text: that text already became the manifest and was shown back to the user at G1 as the agreed contract, while an addition never passed a gate and so travels as the user's words alone. The reader is told the two rules it needs to use them honestly — a quotation is not evidence of anything by itself, and where our line under it disagrees with it the quotation wins — and a требование the additions show was withdrawn now comes back as withdrawn rather than as missing, which is the false finding this change exists to stop. The briefing phase owns the one procedure for a change arriving mid-прогон and every later phase cites it: the additions first, the run state second, the plan third, and one sentence to the user saying what it costs the schedule. The state is second and never first because writing a status feels like having recorded the change, and the two readers that could catch a loss are forbidden to read the state. `S1`, which had sent the quote into the манифест — a file that holds no statuses and is never edited — now names the additions block and the run state, the two places the quote and the decision actually go. Two rules that lived only in prose gained a mechanical half: `Mutable` in the artifact table is held to three values, and `npm run readers` holds each blind reader's declared inputs to what `docs/spec/gates.md` says it is handed.

**Three fields of the state are written in the прогон's language, and `sync.py` says when they are not.** `SKILL.md` held two rules that both covered `state.js` and pointed in opposite directions: every file the прогон writes is English, and everything the user reads is in the dial's language. The state is a file, and three of its fields are printed on the дашборд word for word, so the collision was real and the orchestrator resolved it twice in one run — a прогон carrying `"language": "ru"` wrote eighteen Russian таск titles and, above them, seventeen English gate findings. The rule now names the exception and its boundary is visibility rather than shape: `gates[].findings`, `tasks[].title` and `stages[].note` carry the dial's language because the page prints them and has no vocabulary to translate a composed line against; `debt` reaches the page as three counts, `additions` is not rendered there at all, and a требование's `reason` is read out of the отчёт, so all three stay English. A quotation keeps the language it was said in, which is why an English отчёт carries Russian findings inside it. `python3 .maestro/sync.py` holds the three fields for `ru`, names each offending line and quotes it, and prints its report after the address for the same reason the status check does — a дашборд nobody can reach helps nobody. It deliberately does not hold `en`: a Russian line contains Cyrillic and an English one does not, so `ru` is decided by the alphabet, while an English finding quoting the user's own sentence is correct and no check can tell it from a breach. That edge is written beside the enforcer rather than left to be discovered.

**The дашборд opens itself, and `sync.py` is what remembers that it did.** Opening was the orchestrator's job, carried in prose, and a прогон on a desktop client printed the address, opened nothing, and left its user to find the page minutes later by pressing the browser icon. A step carried only in prose is a step that is sometimes skipped, and this is the most visible one there is. Four properties come with moving it into the tool, and each exists because the alternative was observed: it opens **once per address rather than once per call**, held in `opened.json` beside the state rather than by the orchestrator, and an address that *moved* is opened again because by then the tab the user holds is dead; nothing opens under `SSH_CONNECTION`, `SSH_TTY` or `CI`, where a window on someone else's machine helps nobody; `--no-open` stands the opener down for a host that shows the page in a pane of its own, which is the one case that would otherwise produce two; and an opener that is missing or fails leaves the address printed and true rather than stopping the прогон. `--reopen` is now the whole of the recovery, replacing a paragraph of prose performed by someone who has just been told the thing they were watching is gone. `SKILL.md`, `0-preflight.md` and `hosts.md` relay what the tool printed instead of tracking any of it themselves.

**The «Сейчас» line is gone from the дашборд.** It named the таски in flight and their statuses on one row under the build block — every word of which the таск rows above it were already showing, in colour, with a clock apiece and a counting chip at the top. A second copy of a live number is worse than none: the two are written by different code and a reader who notices them disagree has no way to tell which one lied. `docs/spec/vocabulary.md` lost the label with it, which is what keeps the page and the specification from drifting — the screen-labels check fails on a word the spec promises and the page no longer carries.

**A прогон says who is holding it, and a writer that lost a race says so instead
of overwriting.** `state.js` carries an optional `heldBy` — a token the session
mints when it opens a прогон that has none, and the moment it minted it — and
`SKILL.md` tells the orchestrator to re-read the state immediately before every
write and compare `updatedAt` with the value it last read. `scripts/state/write.ts`
refuses such a write outright. It **detects** a second orchestrator rather than
preventing one, and that limit is written where the field is defined: nothing
here can expire a lease, and a claim that refused would strand the next session
in front of a прогон it cannot touch. Two sessions drove one прогон on
2026-08-20 and neither had a way to notice.

**A таск's commits are a list, because a repaired таск has two.**
`tasks[].commit` became `tasks[].commits` and `contractVersion` went to `3`. A
review reads the union of a таск's commits over that таск's own files —
`git diff <first>^..<last>` — and explicitly not the tree, which by the time a
repair lands carries every wave that followed the original. The repair phase
appends rather than replaces, so the commit the first review was written against
stays findable. The plan phase closes the cheap half: a *done means* item is
answerable against the таск's own diff, which three items of a real таск were
not. The dashboard needed no field handling — it never read that field — but its
own copy of the version number moved with the contract, and
`state-matches-spec.ts` now holds the two together so the copy cannot be left
behind quietly.

**The прогон owns exactly one page on the user's screen, and it is the
dashboard.** No субагент opens a page or raises a server on a port of its own, a
question that can only be answered by looking at a rendered page is either
answered without a viewer or written down unanswered, and the one route for
something that truly has to be seen is in `phases/0-preflight.md`. The rule is
stated once in `SKILL.md` and carried in its own words by each of the six
prompts. `npm run view` holds it: a marker scan for the three roles a document
can have, plus a literal scan of the phase files for an address, because a phase
that starts instructing an open has no reason to declare it.

**`sync.py` says when the panel's address moved.** It always had three cases and
only ever showed one. A live server of ours keeps its address silently; a dead
server whose port is still free gets the same address again, also silently,
because the link the user is holding still works; a port taken by a stranger
gets a new address with a line above it naming the dead one, in the прогон's own
language, and `previousPort` in `serve.json` so the move survives the call that
made it.

**A стадия explains itself.** Every region of the dashboard carries an `i` that
says what it is showing, written in whichever register the project chose, and a
прогон that has fallen silent now says how long it has been silent and what
restarts it. `npm run dashboard` fails a стадия that cannot explain itself and a
synonym the vocabulary does not allow.

**The тасks card counts what is in flight.** The build's progress bar measures a
share of the work rather than a count of finished таски, a passed gate's findings
are shown as a record instead of an alarm, and `sync.py` refuses a state whose
statuses are not the contract's — the only place a real прогон can catch that at
all, since `scripts/state/validate.ts` does not travel into `.maestro/`.

## v0.0.2-alpha — 2026-08-20

**The panel and the прогон speak the user's language.** A language dial (`ru` /
`en`) joins mode and depth; the бриф can choose it, the state carries it, and the
dashboard ships both vocabularies in the page and paints the one it is told. The
reader can also switch the panel's theme between day and night.

**A project can ask to be spoken to plainly.** The register dial (`plain` /
`normal`) is asked before the question about how much to ask, and it changes every
sentence the user is shown, in every stage — no `G2`, no shorthand.

**Fixes to what a state may claim.** A стадия's status is now held to the clock it
claims, closing one стадия and opening the next happens in one write, and a
стадия nobody closed is a finding rather than a silence.

### `v0.0.1` was skipped, not lost

`v0.0.1-alpha` sits one commit below the bump that made the version
`0.0.1-alpha`, and it was already on `origin` when that was noticed. Moving a
published tag costs a force-push; stepping over the gap costs a version number.
The misplaced tag stays where it is as a historical marker and the next release
was numbered `0.0.2-alpha` on the commit carrying its own bump.

## v0.0.1-alpha — 2026-08-20

The first tagged alpha. One Agent Skill: installing it copies a directory of
Markdown, and nothing is compiled or run at install time.

**The phases.** `0-dials` and `0-preflight` through `9-memory` — dials, preflight,
manifest, briefing, specification, plan, build, review, acceptance, polish,
repair and memory. Four modes (`full`, `semi`, `interview`, `manual`) and three
depths (`strict`, `normal`, `deep`), with the rule that no mode removes a
manifest gate or a safety gate. The mode a прогон starts in can be pinned per
project, in that project's `.maestro/config.json`, where updating the skill
cannot erase it.

**Four gates.** `G1` through `G4`, the last one run blind: acceptance reads the
user's original numbered требования with the specification withheld, and answers
what it could not check rather than guessing.

**The dashboard.** One self-contained HTML page, offline, no CDN, reading the run
state on its own: stage timeline, current таск, live clocks, dependencies and
requirement coverage. `tools/sync.py` mirrors the state into it, keeps it
reachable on the loopback, and says the address.

**Parallel executors.** Fan-out with worktree isolation, the rule that the
orchestrator never writes the project's code, and handoff files for a таск that
outgrows one context.

**The repair path.** A таск that comes back anything other than done routes to
`8-repair.md`; a gate failure opens `references/failure-modes.md`, the checklist
of excuses and red flags, instead of keeping it resident.

**Measuring a finished прогон.** `scripts/metrics/measure.ts` reads a run's
`state.js` and reports durations, coverage and gate outcomes.

**Other hosts.** Codex and Gemini CLI each have their execution model mapped in
`docs/spec/hosts.md`. Both install into the same `./.agents/skills/` directory
and both rows say *unverified*: installing proves the skills directory and
nothing else.
