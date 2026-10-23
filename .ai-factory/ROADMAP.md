# Project Roadmap

> Maestro: one dictated brief becomes a finished, verified project in a single dialogue — modes, gates, parallel executors, and a live dashboard.

## Locked Decisions

These were settled in the planning interview on 2026-08-19 and constrain every milestone below.

| # | Decision | Consequence |
|---|---|---|
| D1 | **Hybrid derivation.** Prompt text (`SKILL.md`, `phases/`) is written from our own behavior spec. Technical artifacts (state schema, dashboard HTML) are our own implementation of the same data contract. | No third-party file is copied, so no attribution file is carried and no external project is referenced anywhere in this repository. **Amended 2026-10-18:** the rule kept derivation clean, and it also forbade naming a format a target project already uses. One external format is now named, OpenSpec, and only as an interoperability target. Maestro reads a project's OpenSpec requirements and, after a closed run, writes one change folder in that format. The name lives only where the bundle reads or writes that format: `SKILL.md`'s outside-the-sequence sentence, the briefing, spec, acceptance and memory phases, `phases/10-openspec.md`, the existing-code, acceptance and OpenSpec-writer briefs, and the runtime's `openspec.mts`, `answers.mts`, `publication.mts`, `progress.mts` and `sync.mts`. Beyond the bundle it lives in their `docs/spec/` sections, tests, hand-written fixtures, the repository tooling that checks them (the `scripts/` facades and the bundle and reader validators), the AI context files and the user documentation. `npm run bundle` holds the Markdown half of that list (`OPENSPEC_HOMES`); the runtime half is held by review, because the bundle check walks Markdown only. No OpenSpec file is copied, so the consequence about attribution still holds. |
| D2 | **One self-contained skill.** A single `maestro` skill; all rules live in `phases/`, read one file at a time, at the moment that phase starts. **Amended 2026-08-19:** the bundle also carries `tools/sync.py`. | The seven companion skills previously drafted in `DESCRIPTION.md` are cancelled. `DESCRIPTION.md` is rewritten, not amended. The amendment is the first non-Markdown file in the bundle: the first end-to-end прогон showed that the state-mirroring ritual runs dozens of times per run, and a ritual performed by hand drifts. Its cost is stated where it lives — `bundle-integrity.ts` walks `.md`, so nothing at `npm run check` covers that file. |
| D3 | **Claude Code is the v1 host.** Real subagent fan-out and worktree isolation are assumed. **Amended 2026-08-19:** assumed is not established. The first end-to-end прогон committed normally and could not raise a worktree — the host settles whether it is inside a repository at session start, and the прогон's `git init` came later. | Other hosts are a later milestone with their degradation documented, not silently tolerated. The amendment makes the same true of this host: the three degrading capabilities are probed in preflight on every host, the phase that spends one carries the cost of its absence, and `npm run hosts` fails when a degradation declared in `docs/spec/hosts.md` has no home in the bundle. |
| D4 | **Everything a прогон writes to a file is English.** Russian appears only in the chat and in dashboard labels. **Narrowed 2026-08-21:** the rule said "everything written to a file", and the second skill made the width matter. | The brief is translated once, in Phase 1. The numbered manifest is shown to the user before any other work, so the contract is agreed rather than silently substituted. In the no-questions mode it is shown without a prompt, and doubtful wordings are listed under Assumptions in the final report. The narrowing is a stated scope boundary rather than an exception: D4's own reason is that a run's artifacts "are read by the next прогон and by whoever maintains the project afterwards", and Scout's ТЗ draft is read by neither — it is read once, by its author, deciding what to paste. Writing it in English would perform a translation nothing checks and then break the check that exists: Maestro translates an already-English бриф **zero times**, and shows the манифест with no original line beneath each требование, which switches off the round-trip check precisely where the contract was not the user's own words. Everything Scout writes that a maintainer reads — its specification, its bundle — is English exactly as before. **Narrowed again 2026-09-27:** the additions block of `brief.md` is a second, and its reason is a different one. Everything the user says about the бриф after it was frozen is appended there verbatim, in the language they said it in. It is a **quotation**, and a quotation keeps the language it was said in — the same rule the отчёт already follows when it quotes a `ru` прогон's findings inside an English file. The reason this one is not merely consistent but necessary is what reads it: the additions are handed to the G4 reader, which measures the build against the user's words with the прогон's paraphrase taken away, and a ruler the прогон translated is a ruler the прогон wrote. Translating them would perform a translation nothing checks, in the one place whose whole purpose is to not be measuring against something the прогон wrote. Everything else the прогон writes, `brief.md`'s own frozen text included, stays English. |
| D5 | **Vertical slice first.** v1 ships one mode (semi) and one depth (normal), but runs phases 0–8 end to end with every gate and the dashboard. | Modes, depths, repair and polish are added after a real run exists, not before. |
| D6 | **Umbrella repository.** The repository is `permgps/skills`; the skills inside it are `maestro` and `scout`. Install: `npx skills add permgps/skills -y`. | A second skill was added without changing any published address, which is what this decision was for. **Corrected 2026-08-19:** the row named `-s maestro`, and the first real install proved the selector unnecessary — the published tree held exactly one `SKILL.md`. **Corrected again 2026-08-21, because that premise is gone.** With two bundles the CLI installs both without a selector and exits `0` — under an agent, which installs non-interactively. A person at a terminal gets a multi-select picker with **nothing pre-selected**, so the published one-liner no longer finishes on its own and `-y` is now part of it. The selector is not mandatory; it is how you install one skill and not the other, and it stays mandatory in a development checkout where the CLI also sees the local agent tooling. Measured against a `git archive HEAD` export and recorded as **F14** in `.ai-factory/dogfood-findings.md`; no push has yet carried two bundles to the default branch. |

## Milestones

- [x] **Behavior Specification** — write the internal specification of the target behavior: modes, depths, finish, the phase order, the four manifest gates, the artifact set, the state contract, and the dashboard event model. Rewrite `DESCRIPTION.md` to match this direction and strip every third-party reference from it.
- [x] **Repository Skeleton and Install Path** — `skills/maestro/` layout, skill frontmatter with the argument hint, agent-directory links, lockfile, and a verified install through `npx skills add`.
- [x] **Run State and Artifact Contract** — the `.maestro/<slug>/` layout, the run-state file schema consumed by the dashboard, the artifact set (brief, manifest, reference, spec, interfaces, tasks), the secret-redaction gate, and the translate-once rule from D4.
- [x] **Preflight and Manifest (phases 0–1)** — resolve the dials, prepare the repository, turn the brief into numbered requirements with statuses, run redaction before anything reaches disk, and pass gate G1.
- [x] **Briefing and Specification (phases 2–3)** — ask only about genuine forks, record answers into the manifest, produce the specification, and pass gate G2 including the independent-reader check.
- [x] **Plan and Tasks (phase 4)** — cut tasks, seed the interface boundaries, and pass gate G3 with traceability proven in both directions.
- [x] **Live Dashboard** — a single self-contained HTML file with Russian labels that reads the run state on its own: stage timeline, current task, live clocks, dependencies, requirement coverage. Offline, no CDN, opened for the user rather than described.
- [x] **Parallel Executors (phase 5)** — subagent fan-out with worktree isolation, the rule that the orchestrator never writes the project's code, and handoff files for a task that outgrows one context.
- [x] **Review Pass (phase 6)** — per-task review against the specification the executor was actually given.
- [x] **Blind Acceptance and Final Report (phase 7)** — acceptance run against the manifest with the specification withheld, gate G4, and the report including Assumptions.
- [x] **Project Memory (phase 9)** — the memory file written between owned markers so the user's own text is never touched, plus decision records for what should outlive the run.
- [x] **v1 Release: First End-to-End Run** — dogfood a throwaway project start to finish, fix what the run exposes, tag the release. **Closed 2026-08-20 against the runs, and split:** four прогона in `../test2` carried a бриф to a finished отчёт with all four gates passed — `tic-tac-toe` (`semi`/`normal`, 5 таски), `run-2026-08-19` (`full`/`strict`, 1 таск), `board-sizes` (`interview`/`deep`, 5 таски and one repair round) and `cube-3d` (`interview`/`deep`, 6 таски). Three of the four modes and all three depths ran. What they exposed is fixed or recorded. **The tag is carved out into its own milestone below**, because the alpha now published is deliberately below `v0.0.1` and the release this line asked for has not been cut.
- [x] **Cut `v0.0.2-alpha`** — supersede the misplaced `v0.0.1-alpha` instead of moving it, and tag the next release on its own bump commit. **Closed 2026-08-20.** `v0.0.1` is skipped: the alpha tag is already on `origin` one commit below its own version bump, and stepping over the gap costs a version number where correcting it would cost a force-push of a published tag. The two findings the third прогон left open do not block this release — they were written as blocking a `v0.0.1` that claims to work, and a continued alpha claims nothing of the kind, so they ship as stated known issues.
- [x] **Modes and Depths Parity** — the remaining three modes and the two non-default depths, with the rule that no mode removes a manifest gate or a safety gate.
- [x] **Repair, Polish and Failure-Mode Catalogue** — the path for a task that comes back anything other than done, specification amendments recorded as demonstrated facts, the polish rounds against the user's own reference, and the checklist of excuses and red flags read at gate failures.
- [x] **Documentation and Run Metrics** — README landing page, docs pages, dashboard screenshots, and a tool that measures a completed run.
- [x] **Additional Agent Hosts** — Codex and Gemini CLI, each with its execution model mapped and its degradation stated in the open.
- [x] **Who Holds The Прогон, And What A Repaired Таск Is Reviewed Against** —
  the two structural findings the third прогон left open. `state.js` carries a
  `heldBy` claim and a writer compares `updatedAt` before writing, so a second
  orchestrator is **detected** — not prevented, which nothing here can do
  honestly. `tasks[].commit` became `tasks[].commits`, `contractVersion` went to
  `3`, and a review reads the union of a таск's commits over its own files
  rather than the tree. Held by `npm run state`, `scripts/state/write.ts`
  refusing the write, and nine new tests. **Closed 2026-08-20.**
- [x] **Scout — Reconnaissance Before The Прогон** — a second skill in the same
  package, upstream of phase 1: it reads the domain across two sweeps, asks only
  the forks that reading exposes, proposes edits to the user's ТЗ one at a time
  in their own words, and prints a бриф to paste after `/maestro`. Its own
  specification under `docs/spec/scout/`, its own bundle under `skills/scout/`,
  its own validator runs (`npm run spec:scout`, `npm run bundle:scout`) and an
  executable contract for the two things it produces that have a readable shape.
  **The boundary is what makes it safe:** Scout produces no ruler — no artifact a
  прогон reads, no требование, no gate — so `G4` still compares the build against
  words that came from outside the model that wrote the specification.
  **Closed 2026-08-21, and it is the first milestone in this repository closed
  without a прогон behind it.** Every amendment here so far was produced by
  evidence from a real run. Scout was built from one run where its absence hurt —
  an `interview deep` прогон whose бриф asked, in its own last paragraph, for
  exactly this reconnaissance and which numbered that request `R42`–`R47` — and
  from no run where its presence helped. That is stated in `docs/spec/scout/`
  itself rather than only here.
- [x] **The User's View Boundary** — the прогон owns exactly one page on the user's screen and it is the dashboard: no субагент opens anything or raises a server on a port of its own, a page that must be looked at is checked without a viewer or named unchecked, the panel is brought back when it is lost, and a moved address is said out loud. Held by `npm run view`. **Closed 2026-08-20.**
- [x] **Close Таски Instead Of Repeating Repairs (Contract 6)** — a real прогон
  spent its budget on repairs that closed nothing: a verification copy that denied
  its own root published thousands of identical bootstrap errors as product
  failures, one root finding held five causes, downstream таски were repaired
  while their upstream schema was still open, eight bounded repairs closed no
  таск, and a larger limit was proposed with no causal review. Contract 6 publishes
  verification 3 and holds each of those exits shut. **Readiness** is recorded
  against a disposable source-only copy before a broad run, and a setup failure
  is corrected with a superseding record instead of being repaired. A finding is
  split into **defects** under its parent таск, each repair targets one defect
  with a closure forecast, and a verified defect does not close a таск while
  criteria remain. A batch that closed nothing stops for a fresh **strategy
  review**, and only the user's words raise the total limit. A таск launches only
  behind blockers in `review` or `done`. G3 refuses unordered таски sharing a
  file and an execution owner that does not transitively wait for its
  prerequisites, and a plan-consistency reader sees every task file at once. G4
  refuses `completed` with an open defect. Reviews read one diff per task commit.
  The dashboard shows defects, the repair budget and readiness. Contract-5 runs
  stay readable and resume as contract 6 with their history marked inherited.
  Held by `npm run state`, `npm run readers`, `npm run bundle`,
  `npm run dashboard`, the G3/G4 gate scripts and a synthetic regression of
  the failed run; 824 tests pass. **Closed 2026-10-01 in three commits on
  `main`, unpushed and unreleased.** Unlike the milestones before it, this one
  came from a прогон's retrospective; like Scout, no прогон has yet run under it.

### Not From A Прогон

Three items, taken in order, and the heading is the point: every amendment to a
locked decision in this repository before them came from a real прогон. These
come from an outside reading of the skill this one was rewritten from, which is a
weaker source than a run and is recorded as a weaker source rather than dressed
up as one. Taking them is not a licence to skip the runs: what each milestone
adopts is re-derived from our own specification and phrased in our own words, no
text is copied from that source, and it is named nowhere here — D1 holds. The
reason it is not named is the standing one: this repository carries no third-party
file and refers to no external project, so a reader here cannot follow a link to
somewhere the rules came from and mistake them for rules this repository reasoned
out.

- [x] **Late Words Reach The Blind Gate** — a требование the user cancels or adds
  after the бриф was frozen reaches the run state today and never the acceptance
  reader, which is given `manifest.md` alone: the cancelled one comes back as a
  false finding, and the added one is never checked at all. `brief.md` becomes
  append-only — the text written in phase 1 frozen, everything said later
  appended under a dated block, verbatim after redaction and keeping the language
  it was said in — a change arriving mid-прогон has one fixed order (the brief
  first, then the run state, then the plan, with what it costs the schedule said
  out loud), and the G4 reader receives `manifest.md` **plus those dated
  additions**, the original бриф staying withheld because it already became the
  manifest and was shown back at G1. Held by `npm run spec`, `npm run bundle`,
  the artifact-writer check and tests. **Closed 2026-09-27.** The change also
  reached past what the milestone named, and both were found while scoping it
  rather than during the work. `S1` had sent the quote into the манифест, which
  holds no statuses and is never edited — the rule was unfollowable as written,
  and it now names the additions block and the run state. And the artifact
  table's `Mutable` cell turned out to be prose nothing read, so changing
  `brief.md` from `no` to `append-only` would have broken no check at all; it is
  now held to three values. The mechanical half is two rules that lived only in
  prose: `npm run readers`, which holds each blind reader's declared inputs to
  what `gates.md` says it is handed, and the `Mutable` value set. **Not from a
  прогон, and it stays recorded as the weaker source** — as with Scout, what was
  adopted is re-derived from our own specification and phrased in our own words.
- [x] **A Run's Directory Says When It Started And Whether It Landed** —
  `.maestro/<slug>/` becomes `.maestro/<YYYY-MM-DD>-<slug>--wip/`: the date is the
  day the run started and never moves, and the suffix answers «этот ещё делается
  или уже сдан» in a collapsed file tree without opening anything. The suffix
  comes off with `git mv` in the final phase, before the отчёт, because the отчёт
  prints paths inside that folder. Every path is built from a new `dir` field in
  the run state and never rebuilt from `slug`, which answers wrongly for the whole
  life of the run — that is, exactly while paths are being written. A second бриф
  landing in an existing run's directory puts the suffix back and returns the
  register row to in-progress, the date staying where it is. Runs from before the
  change keep their names and are not renamed: commits and отчёты the user already
  has point at them. A register in `.maestro/README.md` carries one row per run,
  opened in preflight and closed in the final phase. Cost stated rather than
  discovered: `dir` in the state contract and a `contractVersion` bump, paths in
  every phase, `tools/sync.py`, the dashboard where it shows the run, and
  `scripts/metrics/`. Held by `npm run state`, `scripts/state/paths.ts` and its
  tests.
  **Closed 2026-10-01 in four commits on `main`, unpushed and unreleased.**
  Contract 7 requires `dir`; the date is the UTC day of `startedAt`, and `--wip`
  is on exactly while the run is active, whichever of the three outcomes closes
  it. Three forks the entry left open were settled with the user: the suffix
  comes off at any closure and the outcome lives in the register row; the move
  belongs to `--publish`, which relocates the folder (`git mv` when tracked),
  rolls it back on a refused candidate and rewrites the register between owned
  markers; and "a second бриф landing" means an explicit reopening of a closed
  contract-7 run, while a new прогон still gets its own dated directory. The
  closing publish of the closing round now precedes its отчёт, and the отчёт
  cites run artifacts relatively. Contract-6 runs are never upgraded or
  renamed. The cost list above predates the TypeScript helper: `tools/sync.py`
  is `tools/sync.mts`, and the paths module is
  `skills/maestro/tools/runtime/state/paths.mts` behind the `scripts/state/`
  facade. Held by `npm run state`, `npm run dashboard` (the page's copy of the
  `dir` grammar), and tests in `paths`, `validate`, `verification`, `defects`,
  `register` and `relocation`; 865 pass. The documentation fixtures under
  `docs/assets/` stay at contract 2 and show no date.
- [x] **A Stage That Never Opened Is Not Called «Still Open»** — the chain rule in
  `scripts/state/validate.ts` reports a стадия the прогон walked past as
  `"briefing" is still open, and "spec" has already started`. For a стадия whose
  status is `pending` that sentence is false twice: nothing was open, and nothing
  needs closing. The case keeps its finding and gains its own truthful wording.
  **No mechanism is adopted with it.** The invariant the outside reading solves
  with a tool — a passed стадия closes itself — is already held here by the writer
  closing one and opening the next in a single write, and by the chain rule that
  compares the two stamps; a second writer would cost more than it buys.
  **Closed 2026-10-01.** A `pending` стадия behind a started one is now reported
  as `"<id>" never opened`, against `stages[<id>].status`, with both repairs
  named — `skipped` with a note, or the stamps it ran under. `active` and a
  `done` стадия with an empty `finishedAt` keep «still open», since both were
  opened; `failed` keeps it too, because the contract has not settled whether
  a failed стадия closes. Held by `npm run state` and three tests in
  `scripts/state/validate.test.ts`, two of which failed before the change.

### Not From A Прогон: A Second Outside Reading

Eleven items from a second outside reading, made on 2026-10-04: a side-by-side
comparison of every phase file, prompt and specification page here against a
published collection of agent skills that covers the same ground one step at a
time, with a human driving each step. It is weaker evidence than a run, so it is
labelled that way, just as the three items above are. The same rules apply.
Nothing is copied. Each item is re-derived from our own specification and written
in our own words. The source is not named anywhere in this repository, so D1
still holds.

The reading also produced a filter that every item below passed. **A technique
that needs a person at the keyboard between steps does not transfer.** Our user
does not judge seams, hypotheses or ticket granularity, and in `full` mode nobody
answers at all. So each item is either applied mechanically or decided by the
прогон and recorded for the user to see. None of them adds a stop. The second
filter is cost. Anything that would sit resident in `SKILL.md` has to pay for
itself there, so most of these changes go into phase files and prompts, which are
read only when needed.

Order is by value against cost, and the first item comes first because it is the
cheapest guard against the most expensive failure.

- [x] **Субагенты Stay Leaves** — no субагент may invoke a skill or dispatch an
  agent of its own. Today nothing says so. The ten briefs in `prompts/` contain no
  such rule, and the trigger in our own `description` ("the user describes
  something they want built") is exactly what a task file reads like. That makes
  the failure easy to fall into: an executor reads its таск, recognises a build
  request, starts a nested прогон, and the fan-out multiplies with every level.
  The outside reading records this happening to a review pass, which went past
  fifty agents.
  - **Change:** one sentence in the shared "rules that still hold" part of every
    brief: *invoke no skill and dispatch no agent; do the work in this context.*
  - **Held by:** a `scripts/validate/bundle-integrity.ts` rule that fails when a
    file under `prompts/` does not carry the sentence, plus a test that removes it
    from one prompt and expects the finding.
  - **Cost:** about 25 tokens per brief; nothing resident.
  - **Closed 2026-10-04.** The milestone counted ten briefs, but there were
    eleven. Only five of them already had a "rules that still hold" section;
    those gained a third rule, and the other six gained a section of their own.
    The check matches the sentence itself, with whitespace normalised, and does
    not use a marker the way `viewer-ownership` does. The sentence is the same
    everywhere and is the instruction itself, so a marker would outlive its
    deletion. `docs/spec/phases.md` states the behavior under *A Субагент Is A
    Leaf*, without the prompt's wording. Held by `npm run bundle` and three
    tests in `bundle-integrity.test.ts`, one of them on a copy of the shipped
    bundle with the executor's sentence removed; 873 pass. `SKILL.md` is
    unchanged.

- [x] **Memory The Next Прогон Reads** — phase 9 writes the owned block in the
  memory file and `decisions.md`, yet no phase from 0 to 8 and no brief ever
  reads either of them. Checked by grep across `phases/`, `prompts/` and
  `SKILL.md`. So a decision recorded by one прогон is invisible to the next one,
  and the phase that exists to prevent rediscovery prevents nothing. Four
  changes, in order:
  1. **Read before deciding.** Preflight reads the maestro block of the memory
     file and the `decisions.md` of every earlier run listed in the
     `.maestro/README.md` register. Two places use what preflight read: a fork
     the прогон settles itself in briefing, and the spec. A spec line that goes
     against an earlier decision says so: `contradicts <date> decision, because
     …`. It never silently overrides it. Blind readers do not receive these files.
     `npm run readers` already holds each reader's inputs to `gates.md`, and the
     new rule enters through that list.
  2. **The file the host actually loads.** `MEMORY_FILE = 'AGENTS.md'` is
     hard-coded (`scripts/memory/markers.ts`, `docs/spec/phases.md`). Which file
     each host loads at session start is established per host in
     `docs/spec/hosts.md` before the rule is written. Recorded as a fact, not
     assumed. Then: write into the file the project already has, never create a
     second one, and when neither exists, create the one the host reads.
  3. **A threshold for a decision record.** An entry goes into `decisions.md`
     only when all three hold: it is hard to reverse, it would surprise a reader
     without the context, and there was a real alternative. The "instead of"
     line we already use stays as it is.
  4. **The project's own words.** `interfaces.md` gains a `Terms` table: term,
     meaning, words to avoid, and the user's original wording. `prompts/task-reader.md`
     checks task files against it. Phase 9 carries the durable terms into the
     memory block, so the next прогон names things the same way. The
     running-score incident recorded in `phases/4-plan.md` belongs to exactly
     this class. The table lives inside our owned files, so S5's write boundary
     does not move.
  - **Side fix:** the marker splice is tested only in `scripts/memory/`, so
    during a прогон the block is spliced by prose. Expose it through
    `tools/sync.mts`, the way state publication already is.
  - **Held by:** `npm run readers`, `npm run bundle`, the memory tests, and a new
    test where a prior decision appears in the spec reader's inputs.
  - **Closed 2026-10-04.** The milestone assumed one file per host. The host
    documentation, read on that date, says otherwise: hosts load *precedence
    groups*. Claude Code now reads `AGENTS.md` on its own, but only when no
    `CLAUDE.md` exists. Codex reads `AGENTS.override.md` ahead of `AGENTS.md`.
    Gemini CLI reads `GEMINI.md`.
    - `docs/spec/hosts.md` records the groups, the file each host creates, and
      the evidence. `npm run hosts` holds that table to `MEMORY_FILES_BY_HOST`
      in the new `tools/runtime/memory.mts`.
    - The resolution writes into the file that already carries the block, else
      the host's own file, else any existing memory file. It creates the host's
      file only when there is none. `loadedByHost: false` is said to the user.
    - A rewrite keeps the file's mode. The state's `atomicText` would have
      narrowed it to `0600`.
    - The read had to move from the planned step 3c to step 4b, because the
      helper is copied into `.maestro/` only at step 4. `--run-dir` excludes
      the run's own register row.
    - The read is persisted as `prior.md`, written once by preflight through
      the helper, so briefing and the spec still have it after a compaction.
      Every blind reader withholds it, held as a blanket rule in
      `gate-readers.ts`.
    - `npm run bundle` holds the path with eight literal anchors. No brief may
      mention `prior.md` outside its *What You Are Not Given* section.
    - The decision threshold has no mechanical check, and the phase file says
      so.
    - Runs from before contract 7 have no register row and are not read.
    - `SKILL.md` grew by one cell. 914 tests pass.

- [x] **Briefing Proposes, The User Disposes** — six small rules in
  `phases/2-briefing.md` and in the "Asking A Question" section. The goal is
  that a non-technical user answers faster and is never asked something the
  repository already knows.
  - **A recommended answer on every question.** One option is marked as the
    прогон's choice, with its reason in one clause. It is the same answer `full`
    would self-brief. Scout already does this (`skills/scout/steps/3-grill.md`)
    and the orchestrator does not. The pair that makes it safe: an answer like
    «как советуешь» is recorded in `answers.md` as the full text of the chosen
    option and shown back, because a bare «да» tells the acceptance reader
    nothing.
  - **Facts are looked up in every mode.** Reading the project's files to settle
    a fork is allowed only in `full` today. In `semi` and `interview` the user
    can therefore be asked something the code answers. The fork table gains a
    row: *the answer is a fact about the repository → never asked, read.* The
    read-only ceiling stays exactly as written.
  - **Contradictions and overloaded words are forks.** Three rows join the fork
    table: two sentences of the бриф that contradict each other (quote both), a
    бриф that contradicts the existing code (quote both), and one word used for
    two things. A fork is put to the user as a concrete scenario rather than an
    abstraction, which matters most in the `plain` register.
  - **Rounds by frontier, bounded.** A question whose meaning depends on another
    unanswered question does not go into the same block. It is either folded
    into the parent's options or held back. An answer that opens a new fork
    earns one more round, at most two in total, as Scout already allows. In
    `semi` the second round should be rare. In `interview` it is what makes the
    mode actually deep.
  - **`R##` never travels alone.** In user-facing text an id always carries a
    short gist of its requirement.
  - **«Не понял» is not an answer.** The stop stays open and the question is
    asked again with the missing premise added. Switching register is a
    different thing and keeps its own trigger.
  - **Held by:** `npm run bundle` for the new fork-table rows, and the first
    `semi` and `interview` прогоны under the rule. The answer round-trip is held
    by a test against `answers.md`.
  - **Closed 2026-10-04.** The six rules are in `phases/2-briefing.md`. The
    three that apply to every stop are in `SKILL.md`: the recommended option,
    `R##` with a gist, and «не понял».
    - `answers.md` gained a fixed entry shape: `Asked:`, `Options:` with one
      `(recommended — …)`, `Answer:`, and `Chosen:`. G1 reads entries by
      label, never by phrase. Matching «да» or «как советуешь» in two
      languages would always be one word short. The new
      `scripts/gates/answers.ts` applies six rules. It reports a bare `R##`
      heading, anything other than exactly one recommendation, a missing
      `Answer:`, a missing `Chosen:`, and a `Chosen:` that is neither
      `own answer` nor an offered option. It also reports a `self-briefed`
      answer whose `Chosen:` is not the recommended option. The plan named
      five rules; the sixth follows from its decision that a self-brief *is*
      the recommendation.
    - `/aif-verify` found two false findings in the parser on the same day,
      and both were fixed. An option ending in a full stop failed to match its
      own text copied verbatim. A recommendation whose reason wrapped onto the
      next line had the rest of the reason glued to the option text. Both
      sides of the comparison now go through one normalisation, and a
      continuation line is joined to the raw option before parsing.
    - Entries without options are not read. These are facts settled by
      reading and runs from before the rule. `runGate` gained an optional
      run-artifact check, and a failed read there exits `2`.
    - `npm run bundle` holds ten literals as `BRIEFING_ANCHORS`. It applies
      them only when `SKILL.md` links the briefing phase. A test parses the
      template shipped in `phases/2-briefing.md` and runs the G1 check on it,
      so the format and the parser cannot drift apart.
    - «Не понял» spends no round. A third round is never asked: the fork is
      recorded `open` with its reason.
    - What no check holds: whether a recommendation was right, and whether the
      chosen text was shown back. No `semi` or `interview` прогон has yet
      run under these rules. `SKILL.md` grew by ten lines.

- [x] **Executors Write Tests That Can Fail** — the build phase trusts tests it
  never saw fail. Fail → pass is required for repairs only
  (`prompts/executor.md`, `references/verification-procedures.md`). On a first
  build, a required check can pass by construction, and the reviewer has no rule
  for assertions that recompute what the implementation computes.
  - **Red observed.** Every required check an executor writes is seen failing on
    its named assertion before the implementation lands. The
    `maestro-execution-return/1` block gains a red-observed field. Under
    detector qualification in `prompts/reviewer.md`, a missing red result is
    blocking. This captures the mechanical core of test-first without trusting
    an agent to follow a loop, which agents are known to skip.
  - **How tests are written.** About eight lines in the executor brief:
    - expected values come from the task file's literal or oracle and are never
      recomputed the way the code computes them;
    - tests go through the interface, not the internals;
    - only external services, time and randomness are mocked.

    "An assertion that recomputes the implementation" becomes a blocking
    detector-quality finding.
  - **A skipped test is not a pass.** A worktree holds only tracked files, so a
    test that needs an ignored fixture or a credential skips itself and still
    reports green. Skipped and pending tests are reported as `unavailable` with a
    cause, never as `passed`. One line each in the executor and reviewer briefs.
  - **Each таск names its test surface.** The task file gains a "Test surface"
    row naming the interface from `interfaces.md` that its tests go through, and
    a missing row is a task-reader finding. Plan step 3 states that fewer seam
    rows are better. The user never confirms seams: they cannot judge them.
  - **Held by:** `npm run state` or the return-block validator for the new field,
    `npm run bundle` for the brief text, and a synthetic return with a missing
    red result that must be refused.
  - **Cost:** nothing resident; a few extra test runs per таск.
  - **Closed 2026-10-04.** The four rules are in `prompts/executor.md`,
    `prompts/reviewer.md`, `prompts/task-reader.md` and `phases/4-plan.md`.
    `SKILL.md` is untouched.
    - The red run lives in the return, not in the state. The state never holds
      the executor's return, so `npm run state` is not the holder and
      `CONTRACT_VERSION` stays `7`. The holder is a new repository parser,
      `scripts/gates/execution-return.ts`, which applies seven rules to every
      `format: maestro-execution-return/1` block. It refuses the synthetic
      return the milestone named. It ships nowhere: in a прогон the import step
      and the reviewer do the refusing.
    - The block became a labelled template in the executor brief, and gained
      an explicit `result`. The three prose lists of its fields had already
      disagreed on it. A test runs the shipped template through the parser, so
      the two cannot drift.
    - Red means a named assertion failed. An import error or a harness crash
      names none, so the executor stubs its Test surface signature first.
      `against:` is `stub of …`, `base <commit>` or, for a repair,
      `parent <commit>`. The plan compared it with the block's `commit`; that
      was dropped in implementation, because an executor does not commit and
      the field can name the very base a legitimate red ran on.
    - A skip is `unavailable` with cause `setup` or `unavailable_capability`,
      the two `closure.mts` already allows. No state rule changed.
    - `npm run bundle` holds thirteen literals as `TESTING_ANCHORS`, including
      two in `references/verification-procedures.md`, which the link pass
      never reads.
    - What no check holds: whether a red run truly preceded the
      implementation, whether an «existing check» pre-dates the таск, and
      whether an assertion recomputes the implementation. Those are the
      reviewer's, against the diff. No прогон has yet run under the rule.

- [x] **The Plan Cuts For Width And For Something To Show** — four changes to
  `phases/4-plan.md` step 2, each a preference the plan may decline with a
  stated reason, never a hard rule.
  - **A thin path end to end.** When zones allow, a таск owns a narrow path
    through every layer it touches, and its *done means* is something that
    visibly works. A таск whose *done means* can only be met against stubs of a
    sibling's output is a task-reader finding. It remains a preference, because
    strict vertical slicing conflicts with parallel width, and our contract-first
    `interfaces.md` with its Seams table is a legitimate substitute.
  - **Prefactor to unlock width (existing code only).** The shared-file rule
    either serialises таски or merges them into one oversized таск. A
    behaviour-preserving wave-1 таск may instead split the shared file so later
    таски own disjoint zones. It must trace to the requirements it enables and
    carry a check that existing behaviour is unchanged, so the depth limits in
    `phases/3-spec.md` still hold.
  - **Expand, migrate, contract.** A change that touches many files (a rename, a
    signature) is cut into three таски in that order rather than into one таск
    that hands off over and over. It is rare for our users, so it gets one
    paragraph.
  - **Project conventions written once.** `interfaces.md` gains a "Project
    conventions" section: the test, typecheck and lint commands, where tests
    live, and one existing test file as prior art. Today every executor
    rediscovers these. A dependent таск's handoff also carries the `D##` rows
    its blockers recorded, which are written for exactly that reader and
    currently reach no one.
  - **Held by:** `npm run readers` and the G3 gate script for the new
    task-reader finding, `npm run bundle` for the phase text.
  - **Closed 2026-10-04.** The four preferences are in `phases/4-plan.md`
    step 2. Each is declinable, and step 8 names every declined one to the
    user with its reason. Project conventions opens `interfaces.md`. The
    `D##` hand-over is in `phases/5-build.md` step 4, and each row now reads
    `D## — from таск NN — <fact>`. `SKILL.md` and the state contract are
    untouched.
    - Neither named holder could see a task file. `check-g3.ts` reads the run
      state, and `npm run readers` had no row for the task reader. The task
      reader now declares its inputs in two tables, and `docs/spec/gates.md`
      carries a `G3 task` row, so `npm run readers` holds its blindness name
      for name. The G3 script is unchanged. A regression test shows that it
      refuses a G3 recorded as passed while carrying the new finding.
      `npm run bundle` holds the prose as `CUT_ANCHORS`.
    - The new finding is about *Depends on*, not about stubs in general. A
      *done means* item that needs the output of a таск outside its
      *Depends on* can be met only against a stand-in. When the producer is a
      blocker, the Seams cut stays legitimate, and the red-observed stub of
      the таск's own signature is not this finding.
    - A prefactor is cut only over an existing check, recorded as
      `red: not applicable — existing check`. A preservation check the
      prefactor wrote would be green on the old code, and the red rule would
      refuse it. With no such check, the plan declines the prefactor and
      serialises. The return parser did not change.
    - `D##` rows are facts, not contract. Where one disagrees with
      `interfaces.md`, the executor builds to `interfaces.md` and names the
      row; the recorded-divergence door routes it. The review still judges
      against the task file and `interfaces.md` alone.
    - What no check holds: whether a declined preference's reason is true,
      whether a prefactor really preserves behaviour, and whether a dependent
      used the rows it was handed. These belong to the readers and the review.
      No прогон has yet run under these rules.

- [x] **Review Sees What Nobody Asked For** — the reviewer counts only what is
  missing (`prompts/reviewer.md`), and the acceptance reader is told that extra
  behaviour «is a question for somewhere else», yet no phase owns that
  question. The `strict` depth promises "only what the requirement cannot work
  without", and nothing checks that promise after the spec.
  - **Unrequested behaviour.** The reviewer gets a fifth part: behaviour in the
    diff that no *done means* item, interface or check accounts for becomes an
    observation tagged `unrequested`. `phases/6-review.md` carries it into the
    report's Observations. Under `strict`, the orchestrator may send it to
    repair. The reviewer stays unaware of the depth.
  - **Temporary diagnostics are tagged and removed.** Any debug output a repair
    adds carries `[maestro-debug:<DF-id>]` and is removed before return. A tagged
    line left in a таск's diff is a blocking finding from a mechanical check in
    `scripts/gates/`.
  - **One standards pass over the whole прогон.** Executors work in isolation,
    so duplication and data clumps across таски are invisible to a per-таск
    review. After phase 6, one fresh reader receives the union of the прогон's
    commits, the project's documented standards (the maestro block excluded) and
    a named baseline of code smells, each smell a labelled judgement and never a
    violation. Its output is observations only: never blocking, never looped on,
    because this axis does not converge. Seam-level items go to the memory phase.
  - **Held by:** `npm run readers` for the new reader's inputs, a gate-script
    test for the debug tag, `npm run bundle`.
  - **Cost:** one субагент per прогон; nothing resident.
  - **Closed 2026-10-04.** The reviewer's fifth part is in
    `prompts/reviewer.md`. `phases/6-review.md` gained the debug-tag scan in
    step 2, the `strict` disposition in step 5 and a new step 6, «One standards
    pass». The executor brief tags and removes diagnostics. The new
    `prompts/standards-reader.md` writes `reviews/standards.md`. The отчёт's
    Observations and the memory phase's given table read it. `SKILL.md` and the
    state contract are untouched.
    - The gate script stays repository tooling, by the user's choice. As with
      G1–G4, phase 6 states the condition in the orchestrator's own words.
      `scripts/gates/debug-tags.ts` holds it against real git. The check is net
      per таск, so a later commit of the same таск can remove a tag, but
      another таск's commit cannot. It prints the tag id and the path, never
      the line.
    - Depth now changes one disposition in phase 6, never the measurement. The
      reviewer is still not told the depth. «The Dials Here» says so.
    - The standards pass runs the first time the phase ends all-`done`.
      `reviews/standards.md` is its record. It writes no state, and its
      observations never enter `verification.findings`, so it cannot block G4.
      The memory phase reads only its `scope: seam` items, through its
      existing entry test.
    - `npm run readers` holds the reader to a `standards (no gate)` row in
      `docs/spec/gates.md`. `npm run bundle` holds the prose as
      `REVIEW_ANCHORS`.
    - What no check holds: whether a reviewer recognises unrequested
      behaviour, whether a promotion under `strict` was right, and whether a
      smell judgement is fair. These belong to the readers and the
      orchestrator. No прогон has yet run under these rules.

- [x] **Repair Diagnoses By Competing Hypotheses** — the repair diagnostician
  proposes "one grounded next approach" and asks for a minimal reproduction only
  when the evidence cannot separate causes (`prompts/repair-diagnostician.md`).
  The first repair stays undiagnosed, to keep its cost. From the repeated repair
  onward the brief changes:
  - three to five ranked hypotheses, each with the observation that would falsify
    it;
  - the cheapest probe that tells them apart, run first;
  - the reproduction is always minimised until every element in it is needed;
  - one variable is changed at a time, and a performance defect starts from a
    measured baseline.

  When no correct seam exists for a regression check, that absence is itself the
  finding. It is recorded as a `noCorrectSeam` limitation that reaches the report
  and the memory phase. All of this lives inside the existing `diagnosis` text,
  so the state contract does not move. Hypotheses are never shown to the user.
  - **Held by:** `npm run bundle`, and the synthetic regression of the failed
    contract-6 прогон, extended with a diagnosis that names a single hypothesis
    and must be sent back.
  - **Closed 2026-10-04.** The brief is in `prompts/repair-diagnostician.md`.
    `phases/8-repair.md` step 2a sends a malformed diagnosis back once.
    `prompts/executor.md` runs a writing probe before any change. The отчёт's
    Observations and the memory phase's given table carry `noCorrectSeam:`
    lines. `SKILL.md` and the state contract's shape are untouched.
    - The refusal lives in the shipped runtime, by the user's choice.
      `validateClosureRecord` in `tools/runtime/state/closure.mts` reads the
      diagnosis's labelled lines with `readDiagnosis`: `H1…Hn` with
      `falsified by:`, `Probe:`, `Reproduction:`, and `Seam:` or
      `noCorrectSeam:`. It refuses a repeated attempt that breaks them, so a
      live прогон is refused at `sync`, not only in a test. `CONTRACT_VERSION`
      stays `7`. The rule is therefore retroactive for a contract-6 or
      contract-7 run already in progress with a repeated repair; none has run.
    - First attempts, verification-2 records and `inheritedAttemptIds` keep
      prose diagnoses, as every other contract-6 rule already exempts them.
    - The probe runs in the diagnostician when it writes nothing to the
      project, and otherwise as the executor's first step, tagged
      `[maestro-debug:DF-N]`. An executor whose probe contradicts the brief
      stops before the change and returns `still_failing`. That attempt
      counts, because a change shipped on a falsified hypothesis costs more.
      A send-back of a malformed diagnosis spends nothing.
    - `npm run bundle` holds the prose as `DIAGNOSIS_ANCHORS`.
      `scripts/state/diagnosis.test.ts` and two new tests in
      `retrospective.test.ts` hold the shape.
    - What no check holds: whether the probe is the cheapest, whether the
      reproduction is minimal, whether one variable changed, whether a
      baseline was measured, and whether a `noCorrectSeam` reason is true.
      These are the diagnostician's and the executor's judgement. No прогон
      has yet run under these rules.

- [x] **The Report Hands Over What Only The User Can Do** — two additions to
  the five sections of the отчёт (`phases/7-acceptance.md`, `docs/spec/artifacts.md`
  and its validator).
  - **Placeholders as a ready questionnaire.** A placeholder often waits on
    somebody other than the user («знает бухгалтер»). Today these sit under
    Assumptions as lines. They become a block that can be forwarded as it is:
    one question per idea, why it matters, a blank for the answer, most
    important first.
  - **What is hard to undo.** A short plain-language list of one-way changes the
    прогон made: schema or data migrations, deleted or renamed user files, major
    dependency upgrades. S4 already covers outward-facing actions. This covers
    the inward ones the user should know about before building on top.
  - **Held by:** the artifact validator for the two new sections.
  - **Closed 2026-10-04.** The отчёт's table in `phases/7-acceptance.md` has
    seven rows now. *Questions to forward* and *Hard to undo* follow
    Assumptions, and Assumptions keeps decisions, unfilled variables and
    uncertain translations. The prose no longer states the number of
    sections.
    - **The questionnaire.** `phases/3-spec.md` writes each placeholder as
      `R## — question: … — matters: … — ask: …` and keeps one `question:`
      text per missing fact. Приёмка groups by that text, orders by how many
      требования wait on a question, and writes a blank for the answer. The
      block carries no ids, and the chat speaks it in the прогон's language.
      The S3 row in `SKILL.md` and `safety.md` sends a placeholder there.
    - **Hard to undo.** By the user's choice, the review phase records it from
      the per-commit diffs, in `phases/6-review.md` step 2, into a new
      optional `oneWay` list. Preflight seeds that list empty.
      - The kinds are `deleted`, `renamed`, `migration` and
        `dependency-major`, held by `ONE_WAY_KINDS`.
      - `validate.mts` refuses a line with any other kind.
      - `CONTRACT_VERSION` stays `7`, because an added optional field raises
        nothing.
      - `scripts/gates/one-way.ts` holds the mechanical half against a real
        repository. Like `debug-tags.ts`, it does not ship.
    - **The validator.** By the user's choice it is a repository check:
      `scripts/validate/report-sections.ts` (`npm run report`, in `check`). It
      holds the two Section columns, the bundle's and the spec's, equal,
      requires the two new sections in both, and forbids a stated count.
      Before this change the count was written out six times. It does not read
      a прогон's `report.md`. `REPORT_ANCHORS` holds the composition prose.
    - **The placeholder labels are held by prose and anchors only**, by the
      user's choice. `sync` accepts a line without them, and the отчёт quotes
      such a line as its own question.
    - What no check holds:
      - the order of two questions with the same count;
      - whether a `matters:` line is true;
      - data migrations outside the named directories;
      - every manifest other than `package.json`.

      The phase reads the last two by judgement.
    - No прогон has yet run under these rules.

- [x] **A Leaner Resident Orchestrator** — `SKILL.md` stays in context for the
  whole прогон at 615 lines, and nothing bounds it: `bundle-integrity.ts` checks
  frontmatter keys and links only. One test is applied to every sentence:
  *does it change the прогон's behaviour compared with the default?* A sentence
  that fails is deleted whole, not shortened.
  - The maintainer-facing explanation of why a rule sits in `SKILL.md` rather
    than in a phase file appears six times and changes no behaviour. It moves to
    `docs/spec/`.
  - The rule that a quotation is not translated is stated twice. It is kept once.
  - Recovery of runs older than contract 4 is a rare branch. It moves behind a
    pointer into `references/`.
  - The `description` stops retelling the pipeline in its last sentence. It is
    resident on every turn of every session, so it carries trigger conditions
    only.
  - **A ratchet.** `bundle-integrity.ts` gains a ceiling on the line count of
    `SKILL.md` and on the length of `description`. It may only go down.
  - **A decision for the user, not taken here:** whether the model may start
    `/maestro` on its own or only the user can. It is a heavy skill that opens a
    dashboard and asks questions straight away. Whatever is chosen is recorded
    for both hosts, Claude Code frontmatter and the Codex equivalent, so the two
    do not drift.
  - **Expected:** 40–60 resident lines fewer. S1–S6 keep their prohibitions,
    where a hard negative is the point.
  - **Closed 2026-10-04.** `SKILL.md` went from 625 lines to 552, and the
    `description` from 515 characters to 256. The cut is larger than expected
    because the sentence test also removed history of past прогоны and notes on
    which validator holds what, not only the six explanations. No sentence was
    reworded except one: a pronoun lost its antecedent with a deleted
    sentence, so `SKILL.md` now says "reach a phase" where it said "reach one".
    - The six explanations of why a rule is resident are in
      `docs/spec/phases.md` *What Stays Resident*, with the two rules no
      check reads.
    - Every other deleted fact was already in the specification:
      `artifacts.md`, `state-contract.md`, `phases.md` *Loading Rule* and
      *Recovery*.
    - The quotation rule is kept in *The Бриф And The Манифест*. *Language*
      keeps only the separate fact that the отчёт quotes findings in their
      own language.
    - Recovery below contract 4 is in `references/legacy-recovery.md`, behind
      a one-sentence pointer.
    - **The ratchet.** By the user's choice it is exact, not an upper bound.
      `MAESTRO_BUNDLE.resident` in `bundle-integrity.ts` refuses a file over
      its ceiling and a file under it, until the constant is lowered to match.
      Scout's profile carries none.
    - **The decision.** By the user's choice, only the user starts `/maestro`:
      - `disable-model-invocation: true` in the frontmatter for Claude Code;
      - `policy.allow_implicit_invocation: false` in the new
        `agents/openai.yaml` for Codex;
      - `MAESTRO_BUNDLE.invocation` refuses a bundle that declares one
        without the other;
      - `docs/spec/hosts.md` *Who Starts The Skill* records both, and records
        that Gemini CLI documents no equivalent.
    - What no check holds: whether a kept sentence changes behaviour, and
      Gemini's invocation.
    - No прогон has yet run under these rules.

- [x] **A Retrospective From Recorded Signals** — the прогон records signals that
  nothing carries forward. A reviewer that asked for the withheld spec is told
  "the plan phase is where that is fixed for the next прогон", and nothing takes
  it there. `scripts/metrics/measure.ts` measures durations only. Extend it,
  still deterministic and reading the run state and nothing else, to group signal
  classes:
  - requests for withheld inputs;
  - briefs exceeded;
  - writes outside a таск's files;
  - superseded readiness records;
  - repeated defect causes.

  Each group is labelled **mechanical** (propose a validator) or **judgement**
  (propose a prompt rule) and cites its record ids. The audience is whoever
  maintains Maestro, not the user. A future milestone in this file can then come
  from a measured retrospective rather than from memory of a прогон.
  - **Held by:** `scripts/metrics/` tests over the existing synthetic and
    recorded run states.
  - **Closed 2026-10-04.** Two of the five classes turned out not to be
    recorded anywhere: four phases said "record that it asked" or "record that
    the brief was exceeded" and named no field. A third, writes outside a
    таск's files, lived only in a free-text finding.
    - **By the user's choice**, a new optional `signals` list holds those
      three. Each line is `SIG-<n> <kind> — <subject> — <who>`, and the
      subject is never content. Preflight seeds the list empty. Build, review,
      acceptance and polish append to it. `CONTRACT_VERSION` stays 7.
    - **By the user's choice**, the retrospective measures one прогон.
      `measure.ts` gains a `retrospective` section from
      `scripts/metrics/signals.ts`. It reads the run state and nothing else,
      and only structured fields.
    - Superseded readiness is read as `RD-a→RD-b` with the probes that did
      not pass.
    - Repeated defect causes are read from two sources: attempts whose
      `repeatKind` is a same-cause repeat, and a `causeClass` shared by live
      defects of two or more таски. `product` is excluded from the second,
      because the synthetic retrospective run would otherwise cite all fifteen
      of its routine defects.
    - `SAME_CAUSE_REPEAT_KINDS` moved into the contract, so the repair rule
      and the retrospective read one list.
    - **Held by:**
      - the state validator, for the line grammar and unique ids;
      - `state-matches-spec`, for the kinds;
      - `SIGNAL_ANCHORS`, for the five phase sentences and the seed row;
      - `signals.test.ts` and `measure.test.ts`, over the synthetic
        fixtures, both recorded contract-2 states in `docs/assets/`, and a
        contract-7 state carrying the prescribed lines through the validator
        and `main`.
    - **What no check holds:**
      - whether a proposal is right;
      - whether an orchestrator notices a reader asking;
      - whether every out-of-zone path in the commits reached the list.
    - No прогон has yet run under these rules.

- [x] **An Optional Guard Against Destructive Git** — S4 and the executor brief
  forbid history rewrites in prose only. A TypeScript `PreToolUse` hook script
  ships next to the bundle. It blocks push, force-push, `reset --hard`,
  `clean -f`, `branch -D` and discarding checkouts or restores. No phase uses
  any of these commands, as checked by grep. It is **offered in
  `docs/install.md` at install time and never installed during a прогон**,
  because that would edit the user's settings outside S5's boundary and ask a
  non-technical user a technical question. Codex has no equivalent, so the
  prose rule stays as the floor and the hook only raises it on Claude Code.
  - **Held by:** unit tests of the hook script against each blocked and allowed
    command.
  - **Closed 2026-10-04.** The hook is `skills/maestro/tools/guard-git.mts`,
    beside `sync.mts` rather than under `runtime/`, so preflight never copies
    it into a project.
    - **A correction to the line above:** S4 does not forbid history rewrites,
      it makes them a question; and no prose banned push, `reset` or `clean`
      at all. The executor brief forbids only switching branches, worktrees and
      commits. The guard is therefore stricter than S4 by design: with it
      installed, a push the user approved is the user's to run.
    - **By the user's choice**, an ambiguous `git checkout <word>` is decided
      by syntax and by the filesystem: the word counts as a discard when it
      names an existing path.
    - **By the user's choice**, the list is the roadmap's and its direct
      equivalents: `switch --discard-changes`, `branch -d --force`,
      `clean --force`. Rebase, `commit --amend`, `stash drop`,
      `reset --merge`, `checkout -B` and `worktree remove --force` are
      pinned as allowed by a test, so widening the list is a decision.
    - It reads the command line the way a shell splits it: separators,
      quotes, `$(…)`, backticks, here-documents, wrappers, `bash -c` and
      `eval`. A command it does not refuse is answered with silence, never
      `allow`, so the user's own permission prompt still runs. An unreadable
      payload exits `2`. No log line or deny reason carries the command.
    - **Held by:**
      - `guard-git.test.ts`, for each blocked and allowed form, the hook
        contract through a subprocess, and an installed copy run without
        `package.json` or `PATH` and through a symlink;
      - `guard-git-bundle.test.ts`, which runs every code span and code
        block in both bundles through `classify()` (the roadmap's "as
        checked by grep") and holds that no bundle file names the guard;
      - a dated manual record in `docs/install.md`, piping payloads through
        a real `npx skills add --copy` install.
    - **What no check holds:**
      - that a Claude Code session calls the hook through the settings
        offered;
      - git aliases, scripts and `npm run` targets, and a program name built
        at run time;
      - a command a phase describes in prose instead of a code span;
      - anything on Codex or Gemini CLI, where nothing is shipped.

**Considered and declined in the same reading**, recorded so it is not
re-litigated:
- a final "confirm we understand each other" stop (the манифест is already agreed
  at a stop, and another one costs `semi` time);
- user-confirmed test seams;
- prototypes before the spec, and designing an interface several times in
  parallel (S5, and a measured six-figure token cost);
- a strict red-green loop inside the executor (agents skip it, and Red Observed
  gets the value mechanically);
- installing pre-commit tooling or architecture linters into the user's project
  (unrequested capability, and a failing hook would stall commits in the middle
  of a wave);
- free-form handoff summaries (our handoff is bound to a таск and resume reads
  state, which is stricter);
- interviewing the user to build a domain model (it asks preferences, not forks).

### Not From A Прогон: A Third Outside Reading

Items from a third outside reading, made on 2026-10-09. It compared the later
release of the skill this one was rewritten from against what is already here.
The first reading covered that skill as it stood on 2026-08-19. This weaker
source carries the same label and the same rules as the two readings above:
nothing is copied, each item is re-derived from our own specification, and the
source is named nowhere, so D1 holds. Every candidate was settled in grilling
sessions on 2026-10-09. Each one was either taken below or declined with its
reason at the end of this section.

- [x] **Review Checks What Is Risky To Get Wrong** — no reviewer here checks
  security. `prompts/reviewer.md` asks five questions of a таск's diff and none
  of them is about security. `prompts/standards-reader.md` reads the whole
  прогон and also has no security question. The reviewer gets a sixth part. When
  the diff touches one of five risk categories, the reviewer checks that
  category: sign-in and permissions, money, deleting data, secrets, and messages
  sent to third parties. The reviewer decides from the diff whether a category
  applies. The plan does not mark таски as risky, so the plan phase and G3 stay
  as they are. A finding that comes with a concrete counterexample in the diff
  is blocking and goes through the existing repair path. A concern without one
  is an observation. No new agent, no new stop and nothing resident in
  `SKILL.md`.
  - **What it does not cover, said in place:** a gap that spans two таски, for
    example an endpoint from one таск that relies on a permission check another
    таск never wrote. Each reviewer sees one таск, so that gap is left to G4 and
    the text says so.
  - **Held by:** `npm run bundle`, with four literals in `REVIEW_ANCHORS`, and
    two new tests in `bundle-integrity.test.ts`. Each test removes one literal
    and expects the finding on the right file.
  - **Closed 2026-10-09.** The reviewer brief already said two things that
    contradicted this milestone, and both were resolved in the text rather than
    worked around.
    - A blocking finding had to quote the line it contradicts, and a risk has
      none. Like `unrequested`, a `risk:<category>` finding names the category
      and the counterexample instead.
    - «absence is not a finding» would have excused exactly the missing
      permission check. Part 6 is now the one stated exception.
    - A protection another таск is named to provide is not a finding. One that
      nothing names becomes an unsettled observation, and it reaches the отчёт
      through the Observations row.
    - Found while scoping: the spec's blocking row had lost the file-ownership
      clause the prompt carries, and it was restored.
    - `CONTRACT_VERSION` stays `7`. `SKILL.md` and `tools/` did not change.
      1250 tests pass.
- [x] **The Project's Own Glossary Is Read, Never Written** — most of this item
  already landed on 2026-10-04 in *Memory The Next Прогон Reads*. The Terms
  table is written in phase 4. Phase 9 carries the durable terms into the owned
  memory block, and the block is replaced each time, so a term the прогон proved
  wrong is dropped. The next прогон reads them through `prior.md`. Three gaps
  are left:
  1. **The user's glossary is invisible.** A `GLOSSARY.md` or `CONTEXT.md` at
     the project root carries no maestro marker, and preflight does not read
     it. Preflight now reads it into `prior.md` through the helper. With a
     `GLOSSARY-MAP.md` or `CONTEXT-MAP.md`, preflight reads the map and every
     glossary the map points to. One size limit covers everything read. Past
     that limit, preflight reads none of it and says so in the chat and in the
     report. The exact limit is set at plan time. Blind readers do not get it,
     because they already do not get `prior.md`.
  2. **The user's glossary is authority, and it stays theirs.** The plan's Terms
     table takes a term from the project glossary as it stands. When the
     манифест uses the word in another meaning, the манифест wins for this
     прогон, because it is the agreed contract. The row then says `contradicts
     project glossary, because …`, and the report's *what only the user can do*
     section asks the user to fix either the glossary or the бриф. Maestro never
     writes into the user's glossary, so S5's write boundary does not move. No
     stop is added.
  3. **The words to avoid survive the carry.** Phase 9 writes
     `term — meaning (not: x, y)`, so the next прогон does not give the same
     thing a second name. A term the project glossary already defines is not
     carried at all, so each word has one source of truth and the block stays
     short.
  - **Naming, fixed here so the specification does not blur it:** **project
    glossary** is the user's file. The **Terms** table is one прогон's domain
    words. **Словарь** stays what `SKILL.md` and `docs/spec/vocabulary.md`
    already mean by it: Maestro's own user-facing words. The specification
    calls the user's file nothing but «project glossary».
  - **Held by:** `npm run readers`, which already withholds `prior.md` from
    blind readers, and helper tests for each case: a single glossary, a map,
    the size limit being exceeded, and no glossary at all.
  - **Closed 2026-10-09.** Three things the item left to plan time were settled
    in the text, and two stale lines were found while scoping.
    - The limit is 32 KiB, summed over every file the project glossary adds.
      Past it, the bodies are dropped and the names and the total are kept.
    - The отчёт has no single *what only the user can do* section: Assumptions,
      Questions to forward and Hard to undo each hand part of it over. Both new
      messages are decisions taken for the user, so each is a
      `debt.assumptions` line written by the phase that takes it — preflight
      for the limit, the plan for a contradiction. They reach the отчёт and the
      dashboard's «Ваш ход» with no new field.
    - A map is followed one level deep, by its inline links to `.md` files
      inside the project. A link to a missing file, or one leading outside the
      project, through `..` or a symlink, is a `notRead` entry.
    - Found while scoping: the plan phase already read `prior.md` for Terms, and
      the spec did not list it as a reader. `README.md` called the словарь
      «the glossary». Both were fixed. The naming rule is now a check:
      `npm run bundle` and `npm run spec` refuse a bare «glossary» in prose.
    - `npm run bundle` also holds five new memory anchors and keeps the
      project glossary's file names out of every brief.
    - `CONTRACT_VERSION` stays `7`. `SKILL.md` and the dashboard did not
      change. 1277 tests pass.
- [x] **Existing Code Is Read Once, Before The Spec** — no step reads the
  existing names before the plan fixes them. Phase 4 builds `interfaces.md` from
  the specification («the boundaries you derived from the spec»). Only the five
  Project conventions rows come from the repository. Briefing reads code only to
  settle one fork and writes the result into `answers.md`. So a plan can coin
  `Purchase` where the code has had `Order` for a year, and every executor
  explores the repository from scratch on its own. A repeat прогон on the same
  project is always this case, so it is not rare here.
  1. **Detect existing code once.** Preflight records it in the state: the
     tracked tree holds a file other than `.maestro/`, the memory files and the
     project glossary. The exact rule is fixed at plan time.
  2. **One fresh reader, at the start of phase 3.** Only in a project with code,
     and only once. It reads the repository and changes nothing, just like the
     orchestrator in briefing. It returns where things live, the conventions in
     use, the commands that run the project, and **the exact names of the
     entities, fields and functions the work will touch**. The orchestrator
     writes its text verbatim into `.maestro/<dir>/codebase.md`, as it does for
     reviews. The spec reads it first, so it can say «extend the existing
     `Order`» rather than «create an order». No stop is added, and the user is
     not waiting at that point. Fork-settling reads in briefing stay as they
     are.
  3. **The names enter the shared contract.** Phase 4 takes signatures from the
     existing names. The Terms table gains a **Name in code** column.
     `interfaces.md` stays the authority on names.
  4. **Who gets it.** Executors get `codebase.md` beside their task file and
     `interfaces.md`, and repair executors get it too. Their brief says that
     `interfaces.md` wins when the two disagree. The plan-consistency reader gets
     it, so it can catch a name that contradicts the code. The independent
     reader (G2), the task reader, the reviewer and the acceptance reader (G4)
     do not, because the прогон wrote it. `npm run readers` holds that list.
  - **Naming:** `codebase.md` is what existed **before** the прогон.
    `discovered-interfaces.md` is what the build **added**. They have different
    writers and different moments, and neither is appended to the other.
  - **Model:** `standard`, as set by *A Models Dial: Strong And Standard*.
    Until that item lands, the reader runs on the session's model.
  - **Identifiers are English, never transliterated.** The rule is one line in
    `prompts/executor.md` and one in `phases/3-spec.md`: `order`, not `zakaz`.
    Names that travel through the spec and `interfaces.md` are already English
    under D4. Nothing so far bounded the names an executor coins inside its own
    таск. In existing code, the convention `codebase.md` records wins, which is
    why the rule lives in this item.
  - **Held by:** `npm run readers`, `npm run bundle` for the new artifact row,
    and a state test for the existing-code flag.
  - **Closed 2026-10-11.** The rule left to plan time was fixed, one conflict
    was found while scoping, and one "Held by" line had nothing to hold.
    - The rule lives in `tools/runtime/existing-code.mts` and is reported by
      `--memory-read`. Git is asked for tracked files and untracked files it
      does not ignore, streamed and stopped at the first hit; without git the
      directory is walked in name order without following symlinks. Beyond
      `.maestro/`, the memory files and the project glossary, host and skill
      installs (`.claude/`, `.agents/`, `.codex/`, `.gemini/`), `.git` and
      root-level README, licence and git meta files do not count, so a project
      where Maestro was just installed reads as having none.
    - The task reader is "given exactly what its executor will be given", and
      the executor now gets `codebase.md` while the task reader does not. It
      was resolved as the `D##` rows already are: a task file is buildable
      without `codebase.md`, which saves a rediscovery and never fills a gap.
    - No bundle check reads artifact rows, so "the new artifact row" is held
      as twelve `CODEBASE_ANCHORS` literals in `npm run bundle`, plus the
      `artifacts.md` row that `npm run spec` checks for a single writer.
      `npm run readers` holds the given and withheld list, including the
      executor and reviewer briefs outside the gate table.
    - Two прогона in a real Laravel project showed every failure this item
      names: a misnamed field, a wrong test command, a guessed migration
      order, a guessed route constraint, and a read-only tree nobody named.
    - `CONTRACT_VERSION` stays `7`; `existingCode` is an optional field the
      dashboard does not render. 1320 tests pass.
- [x] **A Models Dial: Strong And Standard** — today every субагент runs on
  the session's model. There are no numbers of our own. The case for this
  item is structural. The source pairs cheaper executors with *dropping* most
  таск reviews. Here every таск is still reviewed (see the declined item
  below), so a cheaper executor's mistake is caught at once, with its таск
  attached. The source fixes the cheaper model in its text. **Here it is a
  dial, by the user's decision**, resolved like the mode and the register.
  1. **Two tiers.** `strong` is used by every judge, every `strong` таск and
     every repair. `standard` is used by `standard` таски and the
     existing-code reader. Judges are every gate reader, the independent
     reader, the task reader, the plan-consistency reader, the reviewer, the
     standards reader, the repair diagnostician, the strategy reviewer and the
     acceptance reader. A judge never runs `standard`: a gate rests on its
     judge being no weaker than what it judges. The orchestrator stays on the
     session's model.
  2. **The dial, in the arguments.** One bare token, `<strong>/<standard>`,
     for example `opus/sonnet` or `opus/opus`. It is a dial only when **both**
     halves are model names this host reports. Any other slash word stays бриф
     text, so a URL, a path or the word «sonnet» in a poetry бриф is never
     taken.
  3. **Where an unset value comes from.** First, the arguments of this run.
     Second, the project's pin in `.maestro/config.json`, stored **per host**:
     `"models": {"claude-code": {"strong": …, "standard": …}, "codex": {…}}`.
     Model names belong to a host, so a pin made from Claude Code must never
     reach a прогон on Codex. Third, a question.
  4. **The question.** It is asked once per project and host, after the
     register and the mode, so it is phrased in the register just chosen. Like
     the other tool questions, it is asked in `full` too, and preflight writes
     the answer. The options come from what the host reports **at run time**,
     never from a list in this repository: Claude Code's subagent tool lists its
     model values, and Codex lists a `<model_catalog>` in its spawn tool.
     `hosts.md` records where each host's list comes from. The options are
     «session / session», «session / the next tier down» (marked recommended),
     «session / the cheapest» and a free choice. In `plain`, the question
     explains the trade-off and puts the model names in brackets: the most
     important work runs on the strongest model, and ordinary pieces can go to a
     simpler one, which is cheaper and faster, because every piece is checked.
     A choice where `standard` is stronger than `strong` is accepted as typed,
     and the announcement states it.
  5. **The plan marks each таск `strong` or `standard`.** `strong` applies
     mechanically when the таск is a **producer** in the Seams table or is the
     таск that lays the skeleton, and G3 checks that. It applies by judgement,
     with a one-line reason, when the таск touches one of the five risk
     categories from *Review Checks What Is Risky To Get Wrong*, or when its
     core is a hard algorithm or an unfamiliar integration. Everything else is
     `standard`. That item and this one look at risk separately, and neither
     relies on the other: the reviewer judges the diff, and the plan picks who
     builds it.
  6. **Hosts.** Codex was checked against its source (tag `rust-v0.161.0`) and
     its documentation, both read on 2026-10-09. `spawn_agent` takes `model`
     and `reasoning_effort`, and a child inherits the parent's model only when
     nothing overrides it. A role file's model overrides any value passed on
     the spawn. So Maestro **never passes `agent_type`** when it dispatches its
     own roles, or a user's role file would quietly override the dial.
     **Reasoning effort is passed equal to the session's** wherever the host
     takes it, because a model named without an effort falls back to that
     model's default and would quietly lower a `high` session. A host that
     cannot pick a model per субагент does not ask the question. It gets a
     declared degradation row, and the announcement says everything runs on
     the session's model. When a host reports a different model than the one
     requested, that is said out loud (D3). Gemini CLI is read from its
     documentation at plan time.
  7. **Recorded and visible.** The announcement names both models. The tier
     goes into the task file and into the state as `tasks[].model`, which is
     contract 8. The report says in one line how many таски ran on which model.
     The dashboard does not change. Without the state field, nobody can later
     check whether `standard` таски fail review more often, and that is this
     item's own revisit condition.
  - **Held by:** `npm run dials` for the new dial and the token rule,
    G3's mechanical check of the producer rule, `npm run state` for the new
    field and the config shape, `npm run hosts` for each host's model-list
    source or degradation row, and `npm run readers` for the list of roles
    that never run `standard`.
  - **Closed 2026-10-11.** The skeleton had no marker, contract 8 needed a
    required field, and the config needed one exception.
    - **The skeleton is fixed as the sole таск of wave 1** — "a wave of its own
      by definition" in `4-plan.md`. A one-таск plan is therefore `strong`.
      G3 reads the Seams table by its fixed header and each task file's `Model`
      row, and nothing else of either.
    - **An optional field raises nothing**, so "contract 8" holds only as a
      required field: `tasks[].model` and `models` are required from 8 and
      refused below it, like `dir` in 7. A contract-7 run keeps running on the
      session's model and is never migrated.
    - **"Never rewrite a file that is already there" gained one exception**,
      owned by the helper: `--config-models --host <id>` sets `models.<host>`,
      keeps every other key, and refuses a missing (`absent`) or non-object
      (`unreadable`) file. A pin naming a model the host no longer reports is
      stale and asked again.
    - **Gemini CLI degrades**: a subagent's model is fixed in its definition
      file or settings, so the question is not asked there. Writing a host
      agent file would edit the user's project outside S5.
    - **The domtut audit прогон's Seams row** reads `02–13, one file each
      (names below)`, a range followed by prose. The G3 parser expands ranges
      and stops at the prose; the test carries that row verbatim.
    - **`SKILL.md` stayed at 551 lines.** The models paragraph and the
      delegation rule were paid for by three cuts of text a phase file already
      holds. `resident.skillLines` was not raised.
    - `npm run check` passes with 1391 tests.
  - **Follow-up, 2026-10-11** (`c6972c0`, `c5f842f`). Three gaps were found
    after the close.
    - **G3's producer parser guessed.** A cell starting with a date such as
      `2026-10-11` expanded into ids, a backwards range was silently swapped,
      and `00000000–99999999` was expanded into memory. A range is now read
      only when its endpoints share a width, run forwards and name at most
      999 ids; anything else ends the ids there. A bold or capitalised `Model`
      row is read for the tier it names, and a таск with no task file is
      reported as missing its file, not a row.
    - **A reopened contract-7 run had no rule.** Contract 8's fields are
      refused below 8, so such a run writes no `models` and no `model`, and
      every dispatch passes no model. Preflight, spec, plan, build, repair and
      the delegation rule in `SKILL.md` say so.
    - **A доводка таск had no tier in state.** From contract 8 it is written
      into `tasks[]` with `model: strong` and a `Model` row reading `strong` —
      доводка; the plan's tier rule does not apply to it.
    - Two new bundle anchors hold the last two, thirteen in all.
      `npm run check` passes with 1399 tests.
- [x] **Retire Доводка; The Reference Reaches The Executor First** — the
  `finish` dial has been off in every прогон on record. Six local прогоны were
  checked on 2026-10-09: four have a recorded state, with 31 таски among them,
  and every state reads `"polish": false`. The source reports the same over
  eight. While it is off, its whole path is rules that no run has carried
  out: `phases/7-polish.md`, `prompts/polish-reader.md`, the `polish` state
  field, its branches in `7-acceptance.md`, the dashboard and the validators.
  What a user with a reference actually needs, required fidelity, is already
  part of acceptance whatever `polish` is set to (`docs/spec/verification.md`).
  1. **Remove the dial and everything behind it.** That is the phase, the
     reader, the state field (the next contract version, shared with *A Models
     Dial* if they land together), the dashboard's доводка stage, and the dials
     row. Required fidelity in G4 is untouched.
  2. **The reference reaches the executor first.** Only `7-polish.md` reads a
     comparable reference today, so removing it without this step would leave
     comparables unread. The plan writes into each UI таск's task file the
     `REF-*` ids it should follow, each with its location. The executor opens
     them read-only. G3 checks that every UI reference in `reference.md` is
     cited by at least one таск. The reviewer sees the same ids through the
     task file it already gets. The whole register is never sent to every
     executor.
  3. **The end-of-run comparison goes away with no replacement.** A comparable is
     inspiration, and its executor has seen it from the start. When the user
     wants «like X», that is a требование in the манифест, and G4 checks it
     honestly.
  4. **The old triggers become бриф text.** `polish`, «доведи до эталона» and
     «сравни с образцом» are no longer dial words. Typed into a бриф, «доведи до
     эталона» becomes a требование, which is the right outcome. No «mode
     removed» notice is added. A `polish` key left in an old `config.json` is
     ignored, as every unknown key already is.
  - **Held by:** `npm run dials`, `npm run state`, `npm run bundle` (no live
    link to the removed files), and G3's mechanical check of the reference
    citations.
  - **Closed 2026-10-11.** Two words of the item needed a reading, and one
    check was added that the item did not name.
    - **It lands in contract 8**, shared with *A Models Dial*: the last tag,
      `v0.0.13-alpha`, is contract 7, so 8 has not shipped. From 8 a `polish`
      field and a `dialChanges[]` entry for it are refused; below 8 `polish`
      stays a required boolean that nothing reads.
    - **"Every UI reference" is read as every available `visual_reference` and
      `contextual_example`.** The register has no UI role. An authoritative
      behaviour already reaches its таски through
      `obligations[].implementationTaskIds`, an unavailable reference cannot be
      followed, and `other` is no look. domtut's first run is the case: REF-3
      and REF-7, superseded by REF-8, and the missing screenshot REF-5 are all
      unavailable, so only REF-8 must be cited.
    - **G3 reads the register from `state.verification.references`**, of which
      `reference.md` is the projection, and each task file's `References` row
      — `none` or backticked `REF-*` ids, each with a location.
    - **`npm run bundle` refuses `7-polish`, `polish-reader` and доводка in
      any shipped file**, because a dead link was already caught and a prose
      mention was not. 1432 tests pass.
- [x] **The Прогон Says When A Newer Maestro Is Out** — during the alpha a
  release follows almost every прогон, and a user on an old bundle keeps hitting
  bugs that are already fixed. The version lives only in `package.json` today.
  1. `skills/maestro/SKILL.md` carries `metadata.version`. No release script
     exists, so `npm run bundle` holds it equal to `package.json`'s version.
  2. In preflight, `tools/sync.mts` reads the published `SKILL.md` from the
     default branch once, with a 2-second timeout. It is a plain GET of a
     public file and sends nothing about the user, the project or the прогон.
  3. Offline, on a timeout or on any error, the check says nothing. A setting
     is never a reason to stop a прогон, and neither is this.
     `MAESTRO_NO_UPDATE_CHECK=1` turns the check off.
  4. When the published version is newer, the announcement carries one line in
     the прогон's language naming the new version and `npx skills update`.
  - **Held by:** `npm run bundle` for the version match, and helper tests for
    newer, equal, offline and disabled.
  - **Closed 2026-10-11.** Four words of the item needed a reading.
    - **"Reads the published `SKILL.md`" needs an installed version to compare
      against**, and the copied helper does not know where the skill is
      installed. Preflight passes the directory step 4 copied from, as
      `--update-check --skill <dir>`, and the helper reads that `SKILL.md`. A
      runtime constant was not added: it would be a third home for one fact.
      `npm run bundle` holds the field through the helper's own parser.
    - **"Says nothing" is read as exit 0 in every case**, against the 0/1/2
      contract every other checker keeps. An exit 2 for an unreadable
      `SKILL.md` would ask the orchestrator to act on a fact it must ignore.
      The reason for `unknown` goes to stderr at DEBUG only.
    - **"One line in the прогон's language" is composed by the helper**, from
      the state's `language`, like the other `sync` lines. The orchestrator
      shows it as it came.
    - **`SKILL.md` stays at its 547-line ceiling.** The two frontmatter lines
      replaced «That preparation is the beginning of the new стадия, and it is
      not small», whose reasoning `docs/spec/phases.md` already carries.
    - The published `SKILL.md` on `origin/main` has no version yet, so every
      real check is `unknown` and silent until this is pushed. A live check on
      2026-10-11 got a 200 from GitHub and exactly that. 1461 tests pass.
- [x] **A Frozen Dashboard Says What To Do** — when the state stops loading, the
  page says «Показан снимок… часы остановлены» and nothing more. A user looking
  at a frozen page does not know whether to wait or act. `snapshotOnly` gains a
  second sentence in both language tables: if the прогон is still going, tell
  the agent to bring the dashboard back. That is the request *The User's View
  Boundary* already answers by restoring the panel.
  - **Held by:** the dashboard's existing label tests for both languages.
  - **Closed 2026-10-11.** Three words of the item needed a reading.
    - **"Tell the agent" became "ask in the chat".** `docs/spec/vocabulary.md`
      lists «агент» as a non-term for «субагент», and the page explains
      «субагент» to a plain reader. Two near-identical words for two different
      things on one screen would confuse exactly that reader.
    - **No prompt changed.** `SKILL.md` already answers a user who says the
      panel is gone with `--reopen`, which mirrors the state again, restarts
      the viewer and opens the address. That is what a frozen page needs, so
      the sentence asks for that request in those words.
    - **"Existing label tests" held nothing yet.** No test read
      `snapshotOnly`. A new one sits beside the C04 label tests in
      `dashboard-logic.test.ts`, through the same `ui(language)` accessor, and
      it failed against the unchanged page first. 1462 tests pass.

**Considered and declined in the same reading**, recorded so it is not
re-litigated:
- **removing the context handoff.** The source removed a relay that fired on a
  tool-call counter, and it fired once in about sixty tickets. The handoff here
  has no counter. It fires only when an executor itself reports that its context
  ran out (`phases/5-build.md`). It cost nothing in 31 recorded таски, where it
  never fired. Without it, that rare case would become a repair, which is the
  most expensive path.
- **accepting every recommendation with one «ок».** This is already here.
  `phases/2-briefing.md` resolves «как советуешь» or a bare «да» against the
  options it answered, and shows the chosen text back in the same turn.
- **the rest of the source's dashboard fixes.** They are already here. The
  clocks are computed from the state's timestamps at render time, so a sleeping
  machine loses no time. A restarted viewer takes its previous port first
  (`tools/runtime/server.mts`) and announces a move out loud. A lost state file
  is named at the top of the page. There is also no auto-refresh switch here
  that a refresh button would need to replace.
- **a glossary file Maestro writes and maintains itself.** The host loads the
  owned memory block at the start of every session. A separate file is read
  only by someone who goes looking for it, and writing it would widen S5's
  write boundary. The terms stay in the block.
- **appending new terms to the user's glossary.** This would widen S5 for
  convenience, and the new terms already reach the memory block.
- **suggesting the glossary be split past a term count.** This repository never
  writes the glossary, so its size is the user's to manage. The read limit above
  covers the cost to the прогон.
- **the orchestrator reading the existing code itself.** It is one agent
  cheaper, but the repository would then sit in the resident context for the
  rest of the прогон, which undoes *A Leaner Resident Orchestrator*.
- **review only foundation and risky таски, plus one review of the whole build
  at the end.** The source's cost came from one reviewer that lived across
  таски. Its context grew to hundreds of thousands of tokens, and its cache went
  cold between таски. Phase 6 here has no such reviewer: each таск gets a fresh
  one with a narrow, fixed handoff, and all of them run at once after the build.
  Taking this would also give up the guarantee that every таск is checked
  against the words its executor was given, and a defect in an ordinary таск
  would surface at G4, later and with no таск attached. **Revisit when** our own
  прогоны show that a таск review almost never blocks: then the reviewers cost
  something and find nothing, whatever shape they have.

### Not From A Прогон: A Fourth Outside Reading

Items from a fourth outside reading, made on 2026-10-11. It went through every
change published since 2026-10-04 in the same collection of agent skills the
second reading compared against. Most of those changes concern an issue tracker,
an install wizard or skills with no counterpart here. The same label and the same
rules apply as above: nothing is copied, each item is re-derived from our own
specification, and the source is named nowhere, so D1 holds. The filter of the
second reading still applies: a technique that needs a person between steps does
not transfer.

- [x] **The Standards Reader Finds The Standards Itself** — phase 6 hands the
  standards reader the memory file outside the Maestro block, `CONTRIBUTING*`,
  and only those other documents that the memory file or the README names as
  the conventions. A project with a `CODING_STANDARDS.md` or a `STYLEGUIDE.md`
  that nothing links to gets «none documented», and its own rules are never
  checked. Phase 6 now searches the repository for documents about how code
  should be written: the memory files of every host this bundle supports, each
  with the Maestro block cut out, `CONTRIBUTING*`, `CODING_STANDARDS*`,
  `STYLEGUIDE*`, and conventions documents under `docs/`. The ones the memory
  file or README names still count. A file the search finds is read only if it
  describes how code is written, so a lint or format configuration stays out,
  as it is today.
  - **What it does not change:** the standards reader is still not given the
    spec, the манифест, the task files, `interfaces.md`, the review files or
    `prior.md`. Only how its one input is gathered changes.
  - **Held by:** `npm run readers`, which holds the reader's declared inputs to
    `docs/spec/gates.md`, and a bundle anchor on the file names in
    `phases/6-review.md` and `docs/spec/phases.md`.
  - **Closed 2026-10-11.** Three points needed a reading.
    - **«Every host this bundle supports» is the whole host table, derived.**
      That is six files: `CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md`,
      `AGENTS.override.md`, `AGENTS.md` and `GEMINI.md`. The check takes them
      from `MEMORY_FILES_BY_HOST` in the runtime, which `npm run hosts`
      already holds to `docs/spec/hosts.md`. A host added later fails
      `npm run readers` until its file is named. The two files phase 9 never
      writes into are included: the host loads them, so what they say about
      code is a standard the user's agent already follows.
    - **The search is a fixed list of places, not a crawl.** `CONTRIBUTING*`,
      `CODING_STANDARDS*` and `STYLEGUIDE*` are searched at the root and in
      `.github/`, where the hosting service looks for `CONTRIBUTING`, in
      any case. Under `docs/`, a Markdown file counts when its name holds
      `convention`, `standard`, `style` or `contributing`. A document
      reached twice is handed once.
    - **The file names are held by `npm run readers`, not by a bundle
      anchor.** `npm run bundle` reads only the bundle and cannot see
      `docs/spec/`. `gate-readers.ts` reads both, so it holds the names in
      the phase step, in *One Standards Pass* and in the brief. The bundle
      anchor holds what only prose can carry: the sentence that a found file is
      read only if it describes how code is written.
- [x] **A Bare «Да» In Scout's Grill Takes The Recommendations** — Scout's grill
  asks one numbered block, and every question carries a recommendation. Step 4
  already prints back what a bulk «yes to all» accepted. Step 3 says nothing
  about a bare «да» or «как советуешь» given to the whole block. A yes/no
  question whose recommendation is «нет» makes that answer ambiguous. Two rules
  for `steps/3-grill.md`:
  1. Word each question so that «да» accepts the recommended answer.
  2. A bare «да» or «как советуешь» to the block is resolved per `Q##` and
     printed back line by line in the same turn, the same way step 4 does.
     Maestro's briefing already follows this rule.
  - **Held by:** Scout's contract tests, with an anchor on both rules in
    `steps/3-grill.md` and `docs/spec/scout/`.
  - **Closed 2026-10-11.** Three points needed a reading.
    - **A fact only the user has carries no recommendation.** Step 3 asks a
      price, a name or a number always, and `B1` forbids inventing one, so
      recommending it would be inventing it. Such a question offers candidates,
      recommends none, and is the one exception to rule 1. Under a bare «да» it
      is printed back as still open and takes the ordinary «не знаю» path.
    - **A delegated answer is recorded as the chosen text.** A proposal cites
      «the user's own answer, quoted, with its `Q##`», and a quoted «да» says
      nothing. The quote is the option the user saw printed back and let
      stand, as with Maestro's `Chosen:` line. `reconcile.md` does not change:
      choosing an offered option was already how a question is answered.
    - **The anchors live in Scout's contract tests, not in `npm run bundle:scout`.**
      That validator reads only the bundle and cannot see `docs/spec/scout/`.
      `scripts/scout/contract.test.ts` reads both files for one literal per
      rule. `scripts/scout/contract.ts` also gains `checkGrillQuestion` and
      `resolveDelegatedReply`. Like the бриф and proposal checks, they read no
      session. They hold the shape: one recommendation, «да» as the
      recommendation of a yes/no question, and one line per resolved `Q##`.
      Phrases are not matched, for the reason `scripts/gates/answers.ts` gives.

**Considered and declined in the same reading**, recorded so it is not
re-litigated:
- **proving that a forced mutation landed before trusting the red.** This is
  already here. A control's mutated copy must carry a build fingerprint different
  from the main one (`tools/runtime/state/verification.mts`). An executor's red
  comes from a stub of the *Test surface*, not from a mutation, and the reviewer
  rejects a red with no named assertion.
- **a note on what each proposed test seam catches and misses.** The note helps
  a person choose between seams. Here the plan sets one *Test surface* per таск
  and nobody chooses, and user-confirmed seams were already declined in the
  second reading.
- **leaving subagent recursion to the harness.** The source decided that skills
  should not guard against a subagent invoking a skill. *Субагенты Stay Leaves*
  stays: of the three hosts this bundle ships to, not every one bounds nesting.
  A recursing субагент costs a whole прогон, and the rule costs one line per
  brief.
- **foreground review subagents whose returned reports are used.** This is
  already here. Phase 6 imports each reviewer's returned file, and nothing
  depends on a background notification.
- **an orchestrator for a long-running goal that improves the environment
  between tasks** (lint rules, standards files, logs). A прогон has one бриф and
  S5's write boundary. Installing tooling into the user's project was already
  declined in the second reading.
- **fetching a ticket by reference, the issue-tracker setup, the handoff temp
  directory, and invoking skills from an implementation step.** None of these
  has a counterpart here. A прогон reads no tracker, its handoff lives in the run
  directory, and a субагент invokes no skill.

### Not From A Прогон: A Fifth Outside Reading

Items from a fifth outside reading, made on 2026-10-11. It went through every
change published since 2026-10-09 in the skill this one was rewritten from, the
same source as the first and third readings. Two releases landed in that window:
a redesigned dashboard, and memory that carries what one run left over to the
next. The same label and the same rules apply as above: nothing is copied, each
item is re-derived from our own specification, and the source is named nowhere,
so D1 holds. The filter of the second reading still applies, and the dashboard
items pass it trivially, because the page is read and never answered.

Two rules of our own constrain every dashboard item below, and none of them
bends them. **The page reads the state and nothing else**: a block that needs a
fact the state does not carry gets a contract field, never a path into the
repository. **Activity is not delivery**: a requirement whose таски are done is
*built*, and only a passed check makes it *verified*, so no new number may blur
the two.

Order: the clock fix first, because the header colour and the working-time card
both read it. Then the dashboard from the top of the page down. Then the three
memory items.

- [x] **Waiting For The User Stops The Clocks** — the orchestrator already writes
  `awaiting` before every stop on a question. The page spends it on one line:
  the silence notice turns calm. The clocks keep running. A pause is counted up
  to `IDLE_CEILING_MS`, 45 minutes. So twenty minutes the user spends thinking
  over a briefing round reads as twenty minutes of work. The median and the
  estimate inherit the error. Four changes:
  1. **Closed waits are kept.** When `awaiting` is cleared, the writer appends
     `{ since, until }` to a `waits[]` list. Working time, stage clocks and the
     таск median subtract every wait whole. The idle ceiling stays for silence
     that was not a question.
  2. **A forgotten clear closes itself.** The next stage or таск transition
     closes an open wait, in `tools/sync.mts`, not in prose.
  3. **The page says what it waits for.** `AWAITING_KINDS` grows from `answer`
     to briefing round, the manual spec gate, the manual plan gate, a one-way
     action, and a stop condition. A note of one line says *what* is awaited and
     never a value. The redaction gate reads it like any other string.
  4. **The tab says it too.** While `awaiting` is set, the document title reads
     «● Ждём вас», so a user in another tab sees it.
  - **Cost stated:** `waits[]` and the wider kinds are a contract change, so
    `contractVersion` goes to 9. Older states have no `waits` and keep today's
    arithmetic.
  - **Held by:** `npm run state` (the kinds, the shape of a wait, a wait with no
    `until` behind a later transition), and `dashboard-logic.test.ts` for the
    subtraction.
  - **Closed 2026-10-12.** Four words of the item needed a reading.
    - **"The writer appends" is read as "publication appends"** (the user's
      choice). The orchestrator only sets and clears `awaiting`;
      `sync.mts --publish` appends the wait that ended when `awaiting` is
      cleared, replaced by a new question, or left open across a transition.
      A candidate carries `waits` only as it last read it. Every `until` comes
      from the candidate's own stamps, never from a clock.
    - **A transition is `currentStage`, a стадия's status or a таск's
      status changing**, matched by id, an entry on one side only counting
      too. A requirement or gate change is not one. Under the same open
      `since` it is a forgotten clear: publication closes the wait, drops
      `awaiting` and logs WARN.
    - **"A stop condition" is read as the spent repair limit**, `repair-limit`.
      S2 and a third gate failure ask nothing and write `interruptedAt`; the
      spent repair budget is the only stop on a question left for the term. The
      six kinds are `answer`, `briefing-round`, `spec-gate`, `plan-gate`,
      `one-way-action` and `repair-limit`, each held by a `STOP_ANCHORS`
      literal in the file that takes the stop.
    - **The page subtracts waits only from contract 9.** The closed waits and
      the open one are cut out first and each piece left is measured by the
      marks-and-ceiling rule, so a wait is never capped at 45 minutes and an
      open one freezes the clocks. A contract-8 state keeps today's
      arithmetic; the notice and the tab title apply at every version.
      `scripts/metrics` still reports calendar spans.

- [x] **The Header Says What Is Happening** — the page opens with a progress bar
  and eight cards. Nothing at the top says, in one glance, whether the run is
  working, waiting for the user, finished or broken. The header becomes one band:
  - **Its colour is the run's condition:** working, waiting for you, finished,
    or failed. Failed covers a failed stage and `stopped_incomplete`. The colour
    is never the only signal: the condition is also a word, for a reader who
    does not see the colour.
  - **One plain sentence,** composed from `tasks[]`: «2 из 6 тасков готовы, ещё
    3 в работе». Beneath it, one line names the таски being written, in review,
    and back for repair, by title, in the quotation marks of the page's
    language.
  - **The eight stages as a strip** with their own clocks. A skipped stage is
    drawn as skipped. The estimate stands at the right of the band.
  - **What it retires:** the `progress` and `stage` regions. Their content moves
    into the band, and `docs/spec/dashboard.md` loses two rows and gains one.
  - **Held by:** `npm run dashboard`, which holds the regions to the spec, and
    logic tests for the sentence. Both languages, all three Russian plural
    forms, and the plain register.
  - **Closed 2026-10-12.** Four points needed a reading.
    - **The estimate moved now, not under *Four Cards*** (the user's choice).
      The bullet "the estimate stands at the right of the band" and *Four
      Cards*' "the estimate moves into the header" are one move; the
      `estimate` region moved into the band whole, with the same key, `i`
      and explanations.
    - **Failed also covers an interrupted run.** `state-contract.md` sets
      `interruptedAt` when a phase fails or the run stops without a question,
      so a run that is not closed and carries it reads «Сбой».
    - **A wait outranks a failed stage.** Either way the user holds the next
      move, and the tab already says «● Ждём вас» from the same reading, so the
      band and the tab cannot disagree. «Завершён» says closed, never verified;
      `closed_with_exceptions` is finished, and the notice beside the band
      keeps the verification wording.
    - **The in-flight line names at most three таски per group**, then «и ещё
      N», so it stays one line on a wide wave. The build block still lists
      every one.

- [x] **Four Cards Instead Of Eight** — eight cards answer two questions, and
  several answer the same one. «Покрытие брифа», the progress bar and the
  «Таски» bar each give a percentage of one road. Four cards stay:
  - **Требования:** built of live, with «в работе» and «отложено» beneath and a
    bar. «Built» means every таск that names the requirement is done. The card
    says *built*, never *done*, until G4 makes it verified.
  - **Таски:** accepted of cut, with one small square per таск in its status
    colour.
  - **Тесты:** the last suite, a failed count beside it, and which таск it ran
    after.
  - **Рабочее время:** working time with the waits taken out, and the average
    per таск beneath it.
  - **What happens to the other four.** The estimate already moved into the
    header with *The Header Says What Is Happening* (2026-10-12), and the
    `stage` card retired into it, so six cards are left and three of them go.
    «Долг» goes into «Ваш ход», which already counts the same lists through the
    same function. The brief-coverage share becomes a line under G2, which is
    the check it measures. Every `i` explanation moves with its number, in both
    registers.
  - **The ring goes with its card.** It is drawn only by «Покрытие брифа», and
    a line under G2 has no room for it.
  - **Closed 2026-10-12.** Five points needed a reading.
    - **R1 — the buckets partition live.** `countRequirements` counts a
      deferred требование as live, so built + in progress + deferred = live,
      and a deferred one is never built even when its таски are done.
    - **R2 — verified needs the current G4.** The figure switches to
      «Прошло проверку» only when the contract is 4 or later and
      `verificationOf(state).g4` is `passed`; it reads the derived record,
      never the G4 row, so a historical run never says verified.
    - **R4 — "which таск it ran after" is derived, no field.** `state.tests`
      is written by acceptance alone, so it is the full suite; otherwise the
      suite is the таск with the latest `finishedAt`. The old array-tail
      choice could name the wrong таск, and that is fixed.
    - **R5 — the median stays** (the user's choice). The item said "average";
      one таск after three repairs would inflate it, and the card and the
      estimate stay on one figure.
    - **R7 — «Ваш ход» gains a total** from `handoverOf(state).total`. It counts
      promised work and one-way changes, which the Долг card never did, so it
      is the whole of what waits on the user. The `Долг` label is retired.

- [x] **Таск Rows Say Why** — a таск row shows a status chip. Why a таск went
  back is visible only after the row is opened. Each row becomes a bar in its
  status colour: done, writing, review, repair, failed, waiting. Under a repair
  bar, one line quotes what review sent back: the open defect's
  `counterexample`, verbatim from the state. Under a failed bar, one line gives
  the last repair outcome. A wave header that has not started says what it waits
  for: «ждёт 02, 03, 04». The opened row keeps everything it shows today.
  - **What it does not adopt:** a line under a review bar saying why that таск
    is reviewed on its own. Every таск is reviewed here, so the line would say
    the same thing on every row.
  - **Closed 2026-10-12.** Four points needed a reading.
    - **R1 — the bars were already bars.** What was missing was the word:
      `done`, `running` and `queued` were told by colour alone. Every bar
      now carries its status label. "Writing" and "waiting" are the existing
      «В работе» and «В очереди», not new words.
    - **R3 — no line before a defect exists.** Review moves a таск to
      `repair` before repair writes the defect, and findings name требования,
      not таски. Between the two, and below contract 6, the bar shows no line
      rather than a reason guessed from a finding.
    - **R4 — the latest attempt by `at`**, ties to the later array entry, read
      from contract 4. Its outcome is labelled from a new `REPAIR_OUTCOME` map
      of five values (`repaired` kept for verification 1–2), held to
      `vocabulary.md` by `npm run dashboard`. Hypotheses never reach the page.
    - **R6 — "has not started"** means every таск in the wave is `queued` with
      no `startedAt`. It waits for its blockers outside the wave that are not
      done, a failed one included, capped at three like the in-flight line.

- [x] **The Estimate Runs To Acceptance** — «Осталось» ends with the last таск.
  Review and acceptance come after it, and on the source's recorded runs they
  were almost half the wall time. The range now adds the review stage and the
  acceptance stage, and its caption says so: «с ревью и приёмкой». Once a stage
  starts, its own clock replaces its share of the estimate.
  - **Open for planning:** where the share comes from before either stage has
    run. Recommended: a constant derived from the review and acceptance clocks
    of our own finished прогоны, read by `scripts/metrics`. The constant is
    written into `docs/spec/dashboard.md` with the runs it came from. If that is
    too few runs, the range stays wide and says why.
  - **Closed 2026-10-12.** Four points needed a reading.
    - **R2 — all six runs, stamps only** (the user's choice). Six finished
      прогоны are on record, and `readState` rejects five of them (contracts
      1–3). Their build, review and acceptance stamps were copied into
      `scripts/metrics/fixtures/recorded-stages.ts`, and nothing else came
      with them. `scripts/metrics/shares.ts` derives the shares from it.
    - **R3 — the quartiles, and the range says why it is wide.** The bounds
      are the lower and upper quartile of each stage's span ÷ build span:
      review 0.09–1.11, acceptance 0.09–0.39. The `i` names the six August
      runs and says their pauses were not taken out.
    - **R4 — "replaces" means the rest of the share.** A started stage owes its
      share of the projected development minus its worked clock, never less
      than a minute. This is the rule a `running` таск already followed.
    - **E10 — no second acceptance round is predicted.** After G4 fails, only
      the repair chain is counted. The estimate also no longer goes blank once
      the last таск is done.

- [x] **A Feed Derived From The State** — nothing on the page says what just
  happened. The feed is a block of events in words, newest first, each with its
  age: a stage started, a таск started, committed to review, done with its test
  count, sent back for repair, a check passed or failed. **It is derived, not
  logged.** Every event is read from a timestamp the state already carries: a
  stage's stamps, a таск's stamps, repair attempts. A gate has no stamp, so its
  event takes the finish of the stage it follows (`GATE_AFTER`). A log field
  would be a second account of the run that a forgotten write leaves wrong. A
  derived feed cannot disagree with the page around it. An event with no stamp
  is not shown, and the block's `i` says which kinds those are. About fifteen
  lines show, and the rest fold.
  - **Closed 2026-10-12.** Four points needed a reading.
    - **R1 — no field for review's verdicts** (the user's choice). Review moves
      a таск to `done` or `repair` and writes no stamp, so neither is an
      event. `finishedAt` is "handed in to review" and carries the test
      count, and each `repairAttempts[].at` is a repair attempt coming back.
      The `i` names the four kinds that are never shown: accepted, sent back,
      restarted, relayed to a fresh subagent. `contractVersion` stays 9.
    - **R2 — G4 by round** (the user's choice). From contract 4 every
      acceptance round carries its own `performedAt` and `g4`, and
      acceptance's stage stamps keep their first-pass values when a failed
      round sends the прогон round again. So G4 gives one event per settled
      round; below contract 4 it follows `GATE_AFTER` like G1–G3.
    - **R3 — a passed round that is no longer current says so.** When the
      latest round passed but `verificationOf(state).currentRoundId` is not
      that round, its line ends «· устарела» / "· since outdated". An earlier
      round needs no suffix: the later round's own event follows it.
    - **R8 — "about fifteen" is `FEED_SHOWN = 15`.** `foldOf` takes the
      limit as an optional third argument; every other group still folds at
      five.

- [x] **Your Words Filter By What Became Of Them** — the requirement list leads
  with the user's own words. On a large бриф it is fifty rows to scroll through.
  It gains filter chips with counts: all, built, in progress, deferred. It shows
  the first rows, with «Показать все N» after them. A deferred or placeholder row
  shows its `reason` inline, without being opened. The chosen filter is a view
  preference, like the theme: it is kept in the browser or not at all, and it
  never reaches the run.
  - **Already in place** (2026-10-12, *Four Cards Instead Of Eight*): the
    three buckets and their words exist — `REQUIREMENT_PROGRESS` and
    vocabulary.md › Requirement Progress — and
    `requirementProgressOf(state).ids` already lists the ids of each bucket.
  - **Closed 2026-10-12.** Four points needed a reading.
    - **R1 — a fifth chip, «Снято»** (the user's choice). The card's three
      buckets add up to live, not to the list, so on both recorded прогоны
      three rows would sit under «Все» and under no other chip. «Снято» is
      drawn only when something is dropped, and built + in progress +
      deferred + dropped = all on every state.
    - **R2 — the reason of a dropped row shows too.** A dropped row is now
      reachable by its own chip, so it shows its reason inline beside the
      deferred and placeholder rows. An `open` row's reason at G1 is a note
      about the stage, so it stays in the opened row.
    - **R3 — "the first rows" is `REQUIREMENTS_SHOWN = 10`.** N in
      «Показать все N» is the chosen chip's count, not the hidden count.
    - **R5 — the chip says built, never verified.** The filter sorts rows by
      build progress; the card alone switches to verified after G4, and each
      row's result column already says where a check passed.

- [x] **A Narrow Pane Gets A Dense Layout** — the page usually lives in a pane
  beside the chat, 380 to 900 pixels wide. Its one breakpoint, `62rem`, only
  splits the cards into rows of four. Below about 900 pixels a dense layout
  applies: the same regions, smaller headline numbers, the header strip wrapped,
  the cards two by two. `docs/dashboard.md` gains a capture at pane width beside
  the two full-width ones.
  - **Closed 2026-10-12.** Five points needed a reading.
    - **R1 — the threshold is `62rem`, not 900 pixels.** The cards already
      turn two by two below `62rem` (992 px), and a second value 92 px away
      would leave a band with dense cards and roomy padding. One threshold
      covers the whole 380–900 pane range.
    - **R2 — the page had two breakpoints, not one.** `48rem` puts the
      estimate beside the band, `62rem` is the rest. The spec now lists both
      in *A Narrow Pane* › Breakpoints, and `npm run dashboard` holds the
      stylesheet's width queries to that table; a narrowing query is a finding,
      because the sheet is narrow-first.
    - **R4 — the strip wraps instead of breaking words.** Four fixed columns at
      380 px broke every stage label mid-word. Below `62rem` the strip is as
      many `6rem` cells as fit, and «Спецификация» fits one whole.
    - **R5 — the capture is 500 pixels wide.** Headless Chrome lays out no
      narrower; 380 px was checked by framing the page in an `<iframe>`.
    - **R7 — the status chips got their look back.** The requirement filter's
      `.chip` rule had restyled the mode, depth and build-status chips; it is
      now scoped to `.chips .chip`.

- [x] **A Finished Run Reads As A Report** — after closure the page shows the
  outcome, a stop reason, and «Ваш ход» in its usual place. It never says in one
  line what now exists. Closure writes a `result` line into the state: «что
  теперь есть», a single sentence. The header shows it in the finished colour.
  «Ваш ход» moves up to just under the header, because after closure it is the
  user's whole next step. Blind-acceptance disagreements are already under G4
  and stay there.
  - **Open for planning:** open review observations. They live in the review
    files, which the page never opens. Recommended: decline them on the page,
    and have the header name the report file by path, without opening it. The
    alternative is a contract field that copies every observation into the
    state.
  - **Closed 2026-10-12.** Five points needed a reading.
    - **R1 — `result` is required at closure, and the contract goes to 10**
      (the user's choice). A closed contract-10 state needs one line of at
      most 200 characters; an active one must not carry it, and below 10 it is
      refused. A contract-9 run keeps closing without it.
    - **R2 — the line takes the band's colour, not the finished one.** A
      `stopped_incomplete` closure reads «Сбой» in `--fail`, and a
      finished-coloured sentence under it would contradict the word.
    - **R3 — the header names the отчёт by path** (the user's choice). Review
      observations stay off the page. «Отчёт: `.maestro/<dir>/report.md`» is
      the one path the page composes, for display, never fetched; the
      "builds no artifact path" rule gained that one exception.
    - **R4 — the path names where the отчёт is or will be.** The closing
      publish comes before `report.md` is written, so the page never says
      the file exists.
    - **R5 — «Ваш ход» moves in the DOM once the run is closed.** Closure is
      the band's own C1/C2 predicate, so an interrupted run keeps the block
      under the cards; CSS `order` was rejected because it leaves the
      reading and tab order behind.

- [x] **Where The Work Stands Between Прогоны** — `prior.md` gives the next
  прогон the memory block and every earlier run's `decisions.md`. Neither says
  what was left unfinished. Deferred requirements, failed таски, G4 mismatches
  left standing and requirements the user dropped stay in a closed run's
  manifest and state. Nothing reads them again. Four changes:
  1. **A progress file.** Closure writes `.maestro/PROGRESS.md` from files
     re-read at that moment. It has four sections: what the user settled (dropped
     requirements with their quotes, assumptions the user confirmed), what is not
     done (deferred requirements, failed таски, coverage not built), known bugs
     (mismatches and concerns left unfixed), and fixes made without Maestro. It
     is rewritten whole at every closure and kept to about sixty lines. Whatever
     `decisions.md` already holds is pointed to, not repeated.
  2. **Preflight reads it.** Preflight reads the file, and the commits since
     the last closure over the code only, excluding `.maestro/`, into
     `prior.md`. Past about thirty commits, one `standard`-tier субагент reads
     them and returns ten lines.
  3. **Each part is used once.** What was settled binds the spec the way an
     earlier decision does: `contradicts …, because …`, never a silent
     override. What is not done, and the known bugs, are offered as one
     question in the first briefing round and never taken without the user. In
     `full` nothing is taken, and the file carries them on. The changed places
     go to the existing-code reader.
  4. **Blind readers never see it.** That already follows from the blanket
     `prior.md` rule in `gate-readers.ts`, and a test pins it.
  - **What it does not change:** S5. The file lives in `.maestro/`, which is
    ours.
  - **Closed 2026-10-12.** Eight points needed a reading.
    - **R1 — the helper writes the file, on every closing publish.** Both
      closures publish — acceptance and the repair stop — so the write hangs
      off publication beside the register, and a failure is `progress:
      failed`, never a failed publish. A ritual done by hand would drift.
    - **R2 — every item is keyed `[<run dir>#<id>]`, and the user's answer is
      state.** A whole rewrite would otherwise lose what nobody took. The new
      optional field `leftovers` records `taken` and `dismissed` with the
      user's words; it raises no contract version.
    - **R3 — the last closure is the commit in the file's header.** Closure
      runs `git rev-parse HEAD`; preflight reads that one line back. When the
      commit is no longer an ancestor of `HEAD`, the read falls back to the
      closure's moment and says so. Nothing `--grep`s yet; that is the next item.
    - **R4 — *Settled* holds only what the state records in the user's words.**
      Nothing records an assumption the user confirmed, so the section holds
      dropped requirements and dismissed leftovers; an accepted exception is
      a mismatch left standing and goes under *Known Bugs* with its quote.
    - **R5 — the leftovers question has a fixed heading.** `### Leftovers —
      <gist>` is the one heading G1 accepts without an `R##`; a taken item
      goes through *A Change That Arrives Later* steps 1–3, because the blind
      G4 reader reads only `brief.md` and `manifest.md`.
    - **R6 — the changed paths reach the existing-code reader as a list.** A
      fourth Given input, never `prior.md`: the paths are a fact about the
      repository, not what earlier runs decided.
    - **R7 — git is read with bounds.** `runtime/history.mts` owns every git
      call that reads output, each under a ten-second timeout and a 4 MiB
      buffer; anything else is `unavailable` with a reason, and no run stops
      on its history.
    - **R8 — `prior.md` is still written once.** Past thirty commits the first
      read writes nothing and answers `summary-needed`; the commit reader's
      lines arrive on a second call with `--commit-summary`, or
      `--no-commit-summary` lists the newest thirty and adds a
      `debt.assumptions` line.

    `npm run check` passes 1811 tests.

- [x] **Commits A Later Session Can Trace** — a таск commit says which таск it
  is, but таск numbers restart every run. Nothing in the history ties a change
  back to a requirement. Every commit the прогон makes carries a
  `Maestro-Run: <dir without --wip>` trailer. A таск commit adds
  `Requirements: R01, R02`. The closing commit has a fixed subject, so the last
  closure can be found by `--grep`. After that, `git log --grep=R02` finds
  every change a requirement ever caused. The memory block gains two short
  sections:
  - **A small fix without Maestro:** read the progress file and the commits
    since the last closure first. Afterwards, add a line under «fixes without
    Maestro» and commit with the trailer.
  - **Which slice of `git log` answers which question:** since the last
    closure, by requirement, by file, by fragment, by line. Never the whole log.
  - **Held by:** `npm run bundle` anchors on the trailer names in
    `phases/5-build.md` and the closing phase, and the memory tests for the two
    sections inside the owned markers.
  - **Closed 2026-10-12.** Eight points needed a reading.
    - **R1 — the closing commit is the last step of the memory run.** Nothing
      committed `.maestro/` before, though the spec says it is committed. The
      memory phase now runs after every closure, acceptance's or repair's, and
      ends with `maestro: close <dir>` and a `Maestro-Run: <dir>` trailer.
    - **R2 — the basis is tried in order: header commit, closing commit, date.**
      The closing commit is the newest on `HEAD`'s history whose subject is
      exactly that run's; `basis` gains `closing-commit`. A rebase rewrites
      both shas and keeps the subject.
    - **R3 — trailers are prose plus anchors.** No helper prints them; nine
      `trace` anchors hold the phase files.
    - **R4 — the helper writes the tail.** `--memory-write` cuts the body at
      `## Working Between Runs` and appends its own copy, so a carried or
      edited tail cannot drift.
    - **R5 — a requirement is named with its run.** `R02` restarts every
      run, so the slice by requirement greps `Maestro-Run:` and
      `Requirements:` together with `--all-match`; `--grep=R02` alone
      crosses runs.
    - **R6 — a fix without Maestro carries the trailers of what it touches.**
      `Maestro-Run:` names the run whose requirements a commit refers to.
    - **R7 — the closing commit uses pathspecs, never `-A`.** Whatever the
      user staged stays staged and uncommitted.
    - **R8 — an empty body no longer exits 2.** It keeps the block already
      there and refreshes the tail, so the erasure the refusal guarded
      against cannot happen; no stdin is still exit 2.

    `npm run check` passes 1839 tests.

- [x] **A Resumed Прогон Checks Its Commits Are Still There** — `tasks[].commits`
  records where each таск landed. A resume trusts it. After a reset, a rebase or
  a checkout of another branch, a `done` таск can point at a commit `HEAD` no
  longer contains, and the прогон builds on code that is not there. On resume,
  `tools/sync.mts` checks each recorded commit for ancestry. A таск that lost
  its commit is named in one line, reset and relaunched. After a rebase, its
  code may still be in the zone under a new hash, and the executor finishes from
  it. History is never rewritten to bring a commit back.
  - **Held by:** runtime tests over a fixture repository with a reset and a
    rebase.
  - **Closed 2026-10-12.** Ten points needed a reading.
    - **R1 — a new read-only command.** No resume command existed; resume is
      prose in `SKILL.md` › *Recovery*. `sync.mts --commits-check` checks and
      reports, and the orchestrator writes the reset through `--publish`, so
      the helper still never changes a таск. Recovery and preflight's reopening
      call it before their first write.
    - **R2 — lost shas move to `tasks[].lostCommits`.** A sha leaves
      `commits` only into that list and never leaves it; the publish refuses
      anything else, and a finished таск sent back to `queued` without a lost
      commit. The repair-attempt rule accepts a sha from either list.
    - **R3 — always relaunch; the twin is a hint.** After a rebase the check
      names the commit with the same subject and `Maestro-Run:` trailer. The
      executor finishes from the zone; if it changes nothing, the twin is
      appended to `commits`.
    - **R4 — a checkout is asked about.** When every lost commit sits on one
      local branch, the прогон names it and stops on an `answer` question,
      resetting nothing.
    - **R5 — the check classifies, it does not guess.** `ancestor`,
      `not-ancestor` or `missing`; a git that cannot answer makes the whole
      result `unavailable`, and nothing is reset.
    - **R6 — what a reset writes, per status.** Counters are kept: a relaunch
      is not a retry and not a repair. A `failed` таск stays `failed`.
    - **R7 — the relaunch happens in the current стадия**, through Разработка
      and review as a repaired таск does, and acceptance starts over if the
      прогон resumed there.
    - **R8 — the handoff is the existing file under `## Lost Commit`.** It
      says nothing in it is verified finished; `handoffs` does not move.
    - **R9 — no change and no twin gives an empty commit** with the usual
      trailers, so the требование stays traceable.
    - **R10 — a running dependent goes back to `queued` too**, in the same
      write and on the same line.

    `npm run check` passes 1889 tests.

**Considered and declined in the same reading**, recorded so it is not
re-litigated:
- **an event log written by the helper.** The source's helper appends each event
  to the state. Here the feed is derived from the stamps the state already
  carries (see above), so there is no second account to fall out of step.
- **a revision counter that forces a redraw.** The page here polls every two
  seconds and redraws on any change of the state it read.
- **removing the critical-path marks.** The source dropped them from its main
  screen. Here «Осталось» is measured along that chain, and the ◆ on each row is
  how a reader checks the estimate against the plan.
- **the helper marking gates from events.** This is already here: the
  mechanical half of each gate is a script under `scripts/gates/`.
- **a logo drawn as one image.** The page carries no brand image, so there is
  nothing to make lighter.
- **English documentation with a Russian README beside it.** This is already
  here: the language policy writes every Markdown file in English.
- **the keys and the decisions made for you, as their own block.** This is
  already here: «Ваш ход» groups empty variables by name and the assumptions.

### Outside Update Check — 2026-10-16

Rechecked the published skill collection used by the second and fourth outside
readings. The comparison window starts with the fourth reading on 2026-10-11;
the 2026-10-06 through 2026-10-09 changes were also inspected for omissions.
A fresh Git clone and a separate remote-head query agreed on the latest
default-branch commit, dated 2026-10-09. There are no later commits on that
branch as of this check. This conclusion covers published default-branch
changes, not unmerged proposals or unpublished work. D1 still holds: no source
files are copied, and the external source remains unnamed here.

**Decision for the recent-update window: no new implementation milestones.** The useful recent changes are
already implemented or covered by an explicit scope decision. This check does
not establish live-run evidence or close any of the Open Items below.

| Recent change | Current evidence and decision |
|---|---|
| Search for all project coding standards before review | Implemented in `skills/maestro/phases/6-review.md`, step 6: host memory files outside the owned block, contribution/style documents, and documents they reference. Covered by **The Standards Reader Finds The Standards Itself**. |
| Phrase interview questions so a bare yes accepts the recommendation | Implemented in `skills/scout/steps/3-grill.md`, including per-question readback and the exception for facts only the user knows. Covered by **A Bare «Да» In Scout's Grill Takes The Recommendations**. |
| Establish that a forced mutation actually changed the tested copy | The existing control validator in `skills/maestro/tools/runtime/state/verification.mts` requires a different build identity for the mutated copy and matching clean/restored fingerprints; the named assertion must fail. Executor red runs have their separate intake and review checks. Retain the fourth reading's decision; do not add a duplicate milestone. |
| Read the actual instructions before explaining or skipping a workflow step | `skills/maestro/SKILL.md` already requires phase-entry reading and refuses reconstruction from an output summary when the file is missing. No separate routing mechanism is needed. |
| Consume reviewers' returned reports | Phase 6 already imports the returned reports. No reliance on an unattended background notification needs replacing. |
| Explain the strengths and limits of proposed test seams | Reconsidered and still declined: the plan owns the Test surface, and user-confirmed seams were explicitly rejected in the second and fourth readings. |
| Fix interactive setup scripts: environment-value quoting, EOF, symlinks, terminal fallback, and editing a running script | These repair a Bash setup wizard that this project neither ships nor runs. They do not justify introducing one: the report hands human-only work to the user, while S2 prohibits credential collection and S5 bounds writes. |
| Always load writing guidance when a retrospective judges instruction files | The recent change records the external workflow's scope policy; it adds no runtime mechanism. Maestro's retrospective is derived from recorded run signals and does not audit or rewrite arbitrary agent instruction files. Keep **A Retrospective From Recorded Signals**. |
| Tracker setup, parent/child tickets, installation documentation, teaching, and experimental long-running orchestration | No new counterpart inside a run. Retain the fourth reading's exclusions and the self-contained bundle and write boundaries. |

Reopen this comparison when the published default branch advances, the user asks
for a broader capability review, or a real run exposes a gap in one of the
mechanisms above. A future implementation item must
name that gap and its acceptance evidence; the existence of an external update
alone is not sufficient.

### Earlier Techniques Reassessed — 2026-10-16

The user requested a broader comparison after the update check above. No new
upstream commit does not mean no useful unadopted technique. This pass inspected
the existing specification, planning, execution, diagnosis, testing, design,
research and retrospective disciplines, including earlier declined proposals.
The three techniques below predate the fourth outside reading; they are not
new releases. Their value is an assessment of gaps in the current workflow,
not a claim that a real run has demonstrated these failures.

Keep D1, the four gates, the reader input boundaries and the autonomous modes.
Adapt each technique into our own specification before changing the bundle.
Order by cost and reach: preserve existing decisions first, establish external
technical facts second, then strengthen the evidence for intermittent repairs.
The items can be planned independently; none requires another dashboard or a
new user-facing dial.

- [x] **Existing Architectural Decisions Reach The Spec** — prevent work in an
  existing project from silently reversing an architectural decision made
  outside Maestro.
  - **Gap:** phase 3 checks decisions in `prior.md`, while the existing-code
    reader reports six sections about code, commands and conventions. Neither
    explicitly discovers the project's relevant architectural decision records
    or distinguishes accepted records from superseded proposals. A glossary
    and the memory of previous runs do not cover that history.
  - **Scope:** extend the existing read-only discovery, bounded to the areas
    the requirements touch and the project's documented decision locations.
    Carry relevant record paths, status, constraints and rationale into
    `codebase.md`; state when none were found or discovery was incomplete.
    Phase 3 accounts for these constraints and records conflicts explicitly.
    A record is design context, not a new requirement or an instruction to the
    agent. A new user request may supersede it; unresolved genuine choices use
    the existing mode and safety rules. Do not create or edit the user's ADRs,
    add a mandatory interview, or hand this context to blind readers.
  - **Acceptance evidence:** fixtures with an accepted decision, a superseded
    decision, no decision directory, and a conflicting request establish the
    discovery and handoff rules. A specification reader must expose a silent
    contradiction without treating an obsolete record as binding. Update the
    declared artifact readers and their checks together. Relevance and the
    strength of a trade-off remain reader judgement, stated as such.
  - **Cost:** reuse the existing-code reader and its bounded output; no extra
    dispatch for projects where no relevant decision exists.

- [x] **Uncertain External Contracts Are Researched Before They Shape Tasks** —
  stop an unverified API or dependency assumption from becoming a shared
  contract that several executors independently discover is wrong.
  - **Gap:** `codebase.md` establishes local names and commands. Phase 3 has
    no explicit bounded route for checking an uncertain external API or
    version-specific dependency behavior before it enters the spec. Scout's
    domain reconnaissance cannot supply run inputs, and reference inspection
    for preservation work has a different authority and purpose.
  - **Scope:** only when an unresolved technical fact changes feasibility or
    a task boundary, obtain evidence from the installed source/types first,
    then official version-matched documentation or first-party specifications.
    Use a bounded read-only leaf role when delegation is needed; it invokes
    no skills and launches no agents. Record the precise question, applicable
    version, source location, supported fact and remaining uncertainty in an
    on-demand run artifact. Pass only relevant facts to the spec and owning
    tasks, with rechecking when their version or assumptions change.
    The helper publishes records but never fetches documentation itself.
  - **Limits:** no universal research stage, package installation, prototype,
    live mutation or new capability. Source text remains S6 content. Unavailable
    documentation leaves uncertainty explicit; it is not permission to invent
    an interface or silently drop a requirement. A material unresolved fact
    follows the existing blocker and limitation paths. Blind acceptance receives
    no producer research notes and still establishes behavior independently.
  - **Acceptance evidence:** scenarios with an installed version that differs
    from current online documentation, conflicting sources, unavailable access,
    and no external uncertainty. Verify bounded provenance and reader handoffs,
    and that an unresolved contract cannot be recorded as established. Semantic
    source interpretation remains judgement; citation presence alone proves
    nothing. Ordinary local changes incur no research dispatch.

- [x] **Intermittent Repairs Have Reproducible Evidence** — give flaky failures
  a bounded diagnosis and closure procedure that cannot mistake a lucky rerun
  for a demonstrated repair.
  - **Gap:** the failure catalogue recommends three runs, and diagnosis requires
    a minimal reproduction, competing hypotheses and a probe. These do not
    specify how to pin a random seed, capture a triggering interleaving, record
    a failure rate, or compare the same workload before and after a repair.
    Current finding resolution requires a later passing execution but carries
    no explicit repeated-run evidence requirement for intermittent defects.
  - **Scope:** trigger only on observed intermittent behavior. Establish a
    runnable symptom check and record controllable conditions, sample count,
    observed failures and a finite time/run budget before further diagnosis.
    Prefer a deterministic schedule, seed or captured-input replay when possible;
    otherwise retain the observed rates and their limitations. Preserve both
    the minimized case and the original triggering scenario, and replay both
    after the fix under comparable conditions. Keep safety and repair budgets;
    increasing reproduction attempts is not permission for unlimited work.
  - **Closure:** plan the evidence criteria before inspecting the candidate's
    results. A single later green or an incomplete series does not satisfy a
    declared repeated-run check. Zero failures in a finite sample is bounded
    evidence, never proof that the failure is impossible. Insufficient evidence
    stays incomplete and reaches the report. Keep all failed executions.
  - **Acceptance evidence:** a deterministic alternating-failure fixture, a
    seeded intermittent fixture and a repair that fixes only the minimized
    case. Exercise executor return intake, current-build fingerprints and
    finding/defect closure against their evidence. The implementation plan must
    settle which facts belong in captures and which need validated contract
    fields; the helper validates evidence structure and never runs the checks.
  - **Cost:** additional executions only for observed intermittent defects;
    ordinary deterministic repairs retain their existing path.

**Still not adopted:** automatic architecture redesign, multiple competing
prototype implementations, user-approved test seams, tracker orchestration,
global instruction rewrites and automatic tooling installation. Their earlier
scope and cost objections still apply. Reading existing decisions does not
require writing new ADRs; targeted technical research does not make Scout a
producer of run artifacts; stronger intermittent evidence does not remove any
repair limit. Existing task-frontier scheduling, vertical slices, red-observed
tests and per-task handoffs already cover those parts of the source material.

### OpenSpec Interoperability — 2026-10-18

Requested by the user after an exploration recorded in `.ai-factory/RESEARCH.md`.
No прогон on an OpenSpec project has run yet, so this is not evidence of the D5
kind; it is a requested capability, and the milestone states what it proves and
what it does not. D1 is amended above to allow naming the format.

- [x] **OpenSpec Requirements Are Read, And A Closed Run Exports What It Verified**
  — a project that keeps its behaviour in OpenSpec gets a run that cannot
  silently break an approved requirement, and that hands back what it verified
  in the project's own format. **Closed 2026-10-18 against fixtures, not a
  прогон.** Hand-written trees and copied-runtime sync tests cover every export
  status and refusal; `npm run check` passed 2208 tests. Fresh-context runs of
  the briefing rule, the existing-code reader and the writer returned the
  expected forks, rows and draft. OpenSpec 1.14.3 validated the writer's change
  under `--strict` and archived it cleanly. That manual check found one defect,
  fixed in the same change: a re-closure after the user's archive was refused
  instead of reported `archived`. A verification pass against OpenSpec's own
  delta parser then found the check reading only the first copy of a repeated
  delta section, so an untraced SHALL could be exported, and REMOVED and
  RENAMED forms OpenSpec silently skips; both were fixed with regression tests,
  and `npm run check` passed 2229 tests. No Maestro run on a real OpenSpec
  project has happened yet; the first one is the evidence D5 asks for.
  - **Gap:** Maestro reads code, memory, the glossary and decision records, but
    not `openspec/specs/`. A requirement there that the brief contradicts is
    invisible until something breaks. And what a run verified at G4 stays
    inside `.maestro/`, in a shape the project's own specification tool cannot
    merge.
  - **Scope, read side:** a project is OpenSpec-initialised when
    `openspec/config.yaml` or `.yml` exists. Briefing reads the requirement
    index and treats a contradiction as the existing «бриф contradicts the
    existing code» fork, with every mode keeping its handling. The
    existing-code reader carries the relevant requirements as rows of its
    *Architectural decisions* section. G4 withholds `openspec/`.
  - **Scope, write side:** after the closure decision, and only for `completed`
    or `closed_with_exceptions`, a writer drafts one change in
    `.maestro/<dir>/openspec/`. The closing publish checks it against the
    verification projection and `answers.md`, then writes
    `openspec/changes/maestro-<dir>/`. Only passed requirements are exported,
    each scenario comes from a recorded check, and MODIFIED, REMOVED and
    RENAMED appear only where the user answered a fork. Maestro never writes
    `openspec/specs/` and never runs `openspec archive`; `PROGRESS.md` lists
    the unarchived change. An export failure never fails the publish.
  - **Acceptance evidence:** hand-written fixtures exercise detection, the
    index bounds, every export status and every refusal together with the
    legal inputs it must still accept. A second run in the same project sees
    the first run's change. A real OpenSpec CLI validates and archives a
    fixture export; that check is manual, needs network and stays outside
    `npm run check`. Whether a requirement is relevant to the brief remains
    reader judgement.
  - **Cost:** nothing for a project without OpenSpec. The phase file and the
    writer brief are read only when OpenSpec is present and the run closed
    with an outcome that exports.

### Not From A Прогон: A Sixth Outside Reading — 2026-10-23

Items from a sixth outside reading, made on 2026-10-23. It covers every change
published since the fifth reading in the skill this one was rewritten from.
Five commits landed between 2026-10-12 and 2026-10-21. Leaving out a version
bump, they make four changes. Executors are sized by the volume of code
instead of the kind of product. Point review moves after the commit and covers
a narrower risk list. The orchestrator handles each event in one message. The
source's cost tool counted each model call once instead of once per log line.
The same label and the same rules apply as above: nothing is copied, each item
is re-derived from our own specification, and the source is named nowhere, so
D1 holds. The filter of the second reading still applies.

This reading has evidence of our own behind it, which the earlier ones mostly
did not. The four multi-таск прогоны in `../test2` committed **18 таски of
16–811 changed lines each** (`git show --numstat`, insertions plus deletions).
The largest *whole run* came to 2,689 lines. Four of those таски were a
README of 19–40 lines, and each one got its own executor, its own landing and
its own reviewer. The source's measurements point the same way from the other
end. Executors that wrote about 2,600 lines each reached 300–420K of context
in a large existing codebase. A list of 18 edits, about 1,300 lines, finished
in one plain context in about an hour. The figures are the source's, and they
are labelled that way wherever they appear below.

Order: measurement first, because it is cheap, ships nothing, and is the only
way to replace the borrowed figures in the other two items with our own. The
second item does not wait for it. The third item does, because its whole case
is a cost we have not measured.

- [x] **A Run's Cost Is Measured From The Host's Own Log** — make our own
  numbers available on tokens, model calls and context size per role, so the
  next decisions about sizing and review rest on measurement rather than a
  reading.
  - **Gap:** `scripts/metrics` reads `state.js` and nothing else by design, so
    it sees no tokens. The Open Item *What review costs is not measured* and the
    revisit condition of the declined *review only foundation and risky таски*
    both wait on numbers nothing here produces. The sizing item below borrows its
    ceiling for the same reason. The source's own cost tool also shows how easy
    this is to get wrong. The host writes one model call as several transcript
    lines, for thinking, text and each tool call, all carrying the same usage. A
    sum over lines overstated every total about 1.8–1.9×.
  - **Scope:** a separate repository command, for example
    `npm run metrics:cost -- <project-dir> [--run <dir>]`, under
    `scripts/metrics/`. It is never shipped in a bundle and never run by a
    прогон. `measure.ts` keeps its state-only rule; the new module reads three
    sources and says which one each number came from:
    1. **The host's transcripts** for the project, main session and subagents.
       Claude Code is the first host. Others answer «not supported» until their
       format is mapped, never a partial number.
    2. **The run's `state.js`**, for the run window, the таски and `waits[]`.
       Time inside a recorded wait counts as idle, so a pause the user spent
       thinking is never counted as work.
    3. **Git**, for changed lines per таск over its `commits`. The
       `Maestro-Run:` trailer identifies the run.
  - **Counting rule:** one model call is one unique message id. Its usage is
    taken once, from the last record of that id. Normalized units weight output,
    cache write, cache read and uncached input by the host's price ratios, and
    are labelled as ratios, not money. A transcript line the tool cannot parse
    is counted and reported, never skipped silently.
  - **Attribution:** every subagent context is assigned a role: orchestrator,
    executor, reviewer, standards reader, gate readers, repair, acceptance,
    other. The plan must settle whether that comes from a stable role prefix
    in the dispatch description, which is one bundle line per dispatching
    phase, or from the existing descriptions as they are. Either way, a context
    the tool cannot attribute is reported as unattributed and never guessed.
  - **Output:** each role's share of the total. Orchestrator calls, in total and
    per landed таск. Per executor: calls, peak context, cache rewrites after a
    cold gap, and its таск's changed lines. Per review: its cost, and whether it
    blocked, read from the review file. Active and idle time. Aggregates only:
    no message text, tool input or file content is printed, and nothing is
    written outside the output path the user names.
  - **Acceptance evidence:** hand-written transcript fixtures. One call spread
    over three lines with identical usage must count once. The set also covers
    a subagent transcript, an unattributable context, a session outside the run
    window, an unparsable line and a missing log directory. They run under
    `npm run check`. One manual measurement of a real прогон is recorded with
    its date and host version. The format is the host's and unversioned, so that
    record goes stale, and it says so.
  - **Cost:** repository tooling only. The bundle changes by at most the
    dispatch-description prefix.
  - **Closed 2026-10-23**, by the user's decision, before the real-прогон
    measurement: that record is pending in `docs/parity-verification.md` ›
    *Cost Measurement*, and a gap it finds is fixed then. Settled in the plan:
    attribution is the prefix `maestro:<brief> [NN]`, one sentence on an
    existing `SKILL.md` line; a таск's later executor contexts count as repair,
    since the state has no repair stage to time them against. Whether a review
    blocked is read from the state's reviewer defects, not from the review file,
    which is prose. The cache-read ratio is per model, so units are a ratio to
    each model's own input price and the output says when models are mixed. The
    reader's run over this repository's own transcripts found 2.03 lines per
    call.

- [x] **The Cut Is Sized By The Volume Of Change** — stop a small build from
  being cut into many thin таски, each paying a cold start, a G3 reading, a
  landing and a reviewer for a few dozen lines.
  - **Gap:** step 2 of `phases/4-plan.md` sizes by a structural signal: one
    file, one module, several modules, a new subsystem. Its bands run 1, 2–4,
    5–10 and 10–20 таски. The task-file guidance under step 4 says outright
    that таски are sized «without a fixed line-count limit». So nothing makes
    the plan estimate how much code a таск actually carries. The recorded прогоны above came to 1,276–2,689 lines for
    the whole run, cut into five and six таски. In existing code, a list of
    edits that touches many files but little code reads as «several modules»
    and lands in the 5–10 band.
  - **Scope:** step 2 opens with a **volume estimate**. That is changed lines,
    tests included, per surface or edit, read from the spec and, in existing
    code, from `codebase.md`. The estimate is stated in one line in step 8's
    report to the user. Then:
    - **Up to the ceiling, one таск.** That means one executor with every
      relevant criterion in its own file, exactly as a tiny project is cut
      today. A list of edits in existing code usually belongs here, however
      many files it touches.
    - **Above it, about one таск per ceiling's worth.** The three rules still
      outrank the count: one executor's whole job, file ownership, and
      traceability. So do the four preferences. Expand, migrate, contract stays
      a chain of three even when each step is small.
    - **The merge pass merges by volume.** Neighbours that together stay under
      the ceiling are merged, even when they could run side by side. Parallel
      width is a reason to split only above the ceiling. A README or a
      self-check page is never a таск of its own: it belongs to the таск whose
      behaviour it describes or checks.
    - **The table is re-expressed in volume.** A count above 12 needs a reason
      recorded in step 8, as a declined preference does. It adds no stop and
      no hard cap.
  - **The ceiling:** it starts at about 3,000 changed lines. That figure is
    borrowed, and the phase text and the item's closure record must label it
    as borrowed. Once the measurement item above exists, the ceiling is
    re-derived from our own executor peak context against changed lines, and
    the revision is recorded.
  - **The plan must settle:** whether the estimate is kept in an optional
    `tasks[].estimatedLines`, so the measurement compares estimate to outcome.
    Following the `existingCode` precedent, an optional field the dashboard
    does not render needs no contract bump. It must also settle whether the
    plan-consistency reader reports a thin таск with a natural neighbour as an
    observation, never a blocker.
  - **Limits:** this adds no new stop, dial or gate. The context handoff stays
    for an executor that runs out of context anyway. A single таск's review
    remains the review of the whole build, as it is for a tiny project today.
    The models dial picks the tier by the rule it already has.
  - **Acceptance evidence:**
    - Fixtures: an 18-item edit list across 12 files, under the ceiling, gives
      one таск, no worktree and one review. A spec estimated at about 7,000
      lines gives about three таски. Two neighbours that would share a wave
      but together stay under the ceiling are merged.
    - Fresh-context readings of the four recorded прогоны' specs through the
      new step 2 cut each of them into one таск. The cut is judgement, so the
      check is a fresh reading and not a script.
    - `npm run bundle` anchors hold the step-2 text, and G3 still refuses an
      unordered pair that shares a file. The first real прогон under the rule
      records its estimate against its actual changed lines.
  - **Cost:** fewer executors, reviews and landings per run. The price is more
    wall-clock per таск and less parallel width on mid-sized builds. That trade
    is the point of the item, and it is stated to the user in step 8's line.
  - **Closed 2026-10-23.** Step 2 of `phases/4-plan.md` opens with the volume
    estimate. The ceiling is «about 3,000 changed lines», and the phase text and
    `docs/spec/phases.md` › *Task Granularity* both mark it as borrowed. The
    volume table has three rows: up to the ceiling, above it, and above 12
    times it. The merge pass merges by volume, a README or a self-check page
    travels with the таск it describes, and more than 12 таски need a reason.
    Step 8 states the estimate and the trade in one line. `SKILL.md` and the
    resident ratchet are unchanged.
    - **Settled with the user:**
      - The estimate is kept in the optional `tasks[].estimatedLines`, a whole
        number of 0 or more, written by step 7 for every таск it writes.
        `CONTRACT_VERSION` stays `10`, as it did for `existingCode`.
        `metrics:cost` prints the estimate beside each executor's changed lines,
        and one run line compares the two. Each таск is counted once there, and
        a таск estimated at zero is named and kept out of the ratio.
      - The plan-consistency reader reports a thin таск as an observation on its
        `ok` line, never a finding, so it cannot fail G3. The plan merges the
        pair or keeps it, naming the reason in step 8. The prompt's «or is the
        right size» line moved into a new *What Is An Observation* section.
        `VERDICT_LINE` already read the line as `ok`, so the runtime did not
        change.
    - **Held by:**
      - the state validator, refusing anything but a whole number at publish,
        with the legal values and an unchanged contract-6 to contract-10 state
        tested beside it;
      - `VOLUME_ANCHORS`, 14 literals with a removal test per file;
      - a test holding the spec's and the phase's volume tables equal row for
        row, shown failing on one changed cell;
      - two `--plan-coverage` tests pinning the observation format;
      - four `metrics:cost` tests;
      - the scenario fixtures in `scripts/validate/fixtures/volume-cut/`.
      - 2313 tests pass.
    - **The fresh readings** are recorded in `docs/parity-verification.md` ›
      *Volume-Sized Cut*. Seven readers covered three scenarios and the four
      recorded прогоны, and every cut matched: one таск for each run, and three
      for the 7,000-line scenario. The readings also showed that every estimate
      of a recorded run came in at 0.3–0.6 of what git counted. The direction
      is safe while those runs sit under the ceiling. But the ceiling is
      compared against an estimate that runs low, so this is the first thing the
      estimate-to-outcome comparison has to settle.
    - **What no check holds:**
      - whether an estimate is accurate;
      - whether a merge or a kept thin таск was right;
      - whether a reason for more than 12 таски is true.
    - The ceiling stays borrowed until a real прогон's `estimatedLines` is
      measured against its changed lines. No прогон has yet run under the rule.

- [x] **One Event, One Turn** — let the orchestrator handle what one event
  needs in a single turn instead of one turn per step, since every turn
  re-reads its whole resident context.
  - **Start only after** the measurement item reports orchestrator calls per
    landed таск on a real прогон. If landing turns turn out to be a small share,
    close this item as not worth it and record the number.
  - **Gap:** a returning таск runs through numbered steps in `phases/5-build.md`.
    The return is checked and its evidence imported. `D##` rows are appended,
    the worktree is merged and the commit is made. Then the state is written as
    a full candidate and published, and the next таск is published `running`
    and launched. Nothing says which of these may share a turn. The publish
    needs the commit's sha in the candidate, which forces a turn boundary
    between the commit and the publish. The source reports about ten
    orchestrator calls saved per six-таск run, each at a context near 200K.
    That number is theirs.
  - **Scope:**
    1. **Land in one command.** The plan must choose one of two ways to chain
       the commit and the publish. One is a helper option, for example
       `sync.mts --publish <candidate> --land <NN>`. After a commit made by
       pathspec, it reads `HEAD` and verifies the subject and both trailers
       against the таск. It then appends the sha to that таск's `commits` in
       the candidate before validation. The other is a fixed order of the
       orchestrator's own calls, if that proves enough.
    2. **Start in one message.** The `running` publish and the executor launches
       go in the same message, with the publish first.
    3. **Report in the same message.** The one-line progress report goes out in
       the message that does the work.
  - **The plan must settle the failure path:** a rejected publish in a message
    whose launches already went out. The next turn reconciles that before
    anything else, and it is never left silent.
  - **Host dependency:** this relies on the calls in one message running in the
    order sent. It is declared per host in `docs/spec/hosts.md`. A host where
    that is not established keeps separate turns, and the degradation has a
    home in the bundle under `npm run hosts`.
  - **Limits:** a step whose output decides the next step is never merged with
    it. The check output is read before the commit, and a return is accepted
    before its evidence is imported. Validation, S5, the gates and the
    holder/`updatedAt` checks are unchanged.
  - **Acceptance evidence:** helper tests cover four cases. The sha is appended
    once. A `HEAD` whose trailers name another таск or run is refused. A
    dirty zone is refused. An identical retry is idempotent. `npm run bundle`
    anchors hold the rule in the phase text, and `npm run hosts` holds the
    ordering capability. The measurement item compares orchestrator calls per
    landed таск before and after on comparable прогоны.
  - **Cost:** one helper option and a paragraph in the build phase. Turns are
    saved on every landing of every run.
  - **Closed 2026-10-23, ahead of its start condition, by the user's decision.**
    The count of orchestrator calls per landed таск on a real прогон is still
    pending (`docs/parity-verification.md` › *Cost Measurement*). The user chose
    to build first. The check the helper makes is worth keeping even if the
    saving turns out small. The "before" figure stays obtainable from a прогон
    at `b2c6400`.
    - **Settled with the user:**
      - **One helper option.** `sync.mts --publish <candidate> --land <NN>`
        runs in `tools/runtime/landing.mts`, inside the publication lock,
        after the waits are kept and before validation. It reads `HEAD` and
        checks it in order:
        - the таск is `review` in the candidate;
        - the subject opens with its id;
        - `Maestro-Run:` and `Requirements:` are given once each and are
          this run's and this таск's, in id order;
        - the sha is in no `lostCommits` and no other таск's `commits`;
        - nothing in the таск's `zone` and `files` is left uncommitted,
          untracked files included.

        Only then does it append the sha. The same `HEAD` landed again appends
        nothing. A refusal names its rule and writes nothing. Git unable to
        answer exits 2. `runName` moved into `history.mts`, so the resume
        check and the landing spell the run one way. No contract bump.
      - **Two messages per landing.** The first holds the `D##` rows, the
        commit by pathspec over the таск's `files` (never its `zone`, since git
        refuses a path the таск never created) and `--publish --land`. A таск
        whose return delivered no file has no commit and lands without it. The second holds the
        `running` publish, the launches and the progress line. The return
        check, the evidence import and the worktree merge each keep their own
        message. The phase says *message*, never *turn*.
      - **Reconcile first.** A rejected `running` publish whose launches
        already went out is handled before anything else. A launch the
        validator refuses has its return discarded and is relaunched once
        legal; that relaunch is not a retry. It is logged as WARN `build`
        `launch outran publish` and stated in one chat line.
      - **The repair phase lands the same way.**
      - **`ordered tool calls` is a degrading capability.** It is probed on
        the fan-out probe: a shell call writes a token after a 20-second delay,
        and the subagent sent after it in the same message reads it. On Codex
        and dsh it rides on their recipes' own file-reading probe. Without it,
        every step is its own message.
    - **Held by:**
      - `landing-sync.test.ts`, 34 tests through the copied helper on a real
        repository: the build phase's own commit command, the four roadmap cases, every refusal beside its legal
        inputs, the order proof, and a 200 KB subject;
      - `npm run hosts`, with a removal test for each of the capability's two
        markers;
      - `LANDING_ANCHORS`, 11 literals with a removal test per anchor.
    - `SKILL.md` and the resident ratchet are unchanged. 2362 tests pass.
    - **The probe on Claude Code 2.1.309 answered *ordered*:** the shell
      finished writing at 10:59:32Z, and the subagent read the token at
      10:59:35Z. Recorded in `docs/parity-verification.md` › *One Event, One
      Turn*.
    - **What no check holds:**
      - whether a host really ran the calls of a message in order on a given
        прогон, beyond what the probe saw;
      - whether a message really held what the rule says;
      - the probe's blind spot: a concurrent host whose subagent reads slower
        than the delay.
    - **Pending:** orchestrator calls per landed таск before and after, on
      comparable прогоны through `npm run metrics:cost`. If landing messages
      turn out to be a small share, that number is recorded and the helper's
      check stays.

**Considered and declined in the same reading**, recorded so it is not
re-litigated:
- **point review only for the foundation and a narrow risk list.** This stays
  declined, for the third reading's reason. The source's new evidence is that
  review held each ticket for 15–40 minutes before its commit, and that
  «touches access rights» marked 12 tickets of 15. Neither applies here. A
  таск is committed and marked `review` before any reviewer runs
  (`phases/5-build.md`, step 4), and dependents launch behind a blocker in
  `review`. So no review holds a commit or a wave. Our five risk categories
  decide *what* a reviewer checks, not *whether* a таск is reviewed. The revisit
  condition is unchanged, and the measurement item above makes it checkable.
- **review after the commit, beside the next wave.** This is already here, for
  the same reason as above.
- **one re-review per таск, scoped to the fix, with the rest left to a final
  review.** A repaired таск here is re-reviewed against the union of its
  commits. Only the first commit is what its original review was written
  against (`phases/8-repair.md`, step 5). Contract 6 already bounds repair by
  defect, by closure forecast and by a total budget only the user raises. A
  fix-only re-review would stop checking whether a fix broke the таск's other
  criteria.
- **telling таски in flight about an interface a blocking fix changed.** No
  таск is in flight here when a review blocks. The review phase opens only when
  every таск sits at `review`.
- **dropping `@` before the memory file in the skill text.** The host expands an
  `@`-mention in a skill's text the way it does in a user message, so the file
  would be attached twice. This already holds. `SKILL.md`, `phases/`,
  `prompts/` and `references/` carry no `@`-mention, as checked on
  2026-10-23. A validator rule for one absent string is not worth its upkeep;
  review covers it.
- **the source's executor-load thresholds** (under 150K «merge», over 450K
  «split»). They are their numbers. The measurement item reports peak context
  per executor, and our thresholds come from our own runs.

## Completed

| Milestone | Date |
|-----------|------|
| One Event, One Turn | 2026-10-23 |
| The Cut Is Sized By The Volume Of Change | 2026-10-23 |
| A Run's Cost Is Measured From The Host's Own Log | 2026-10-23 |
| OpenSpec Requirements Are Read, And A Closed Run Exports What It Verified | 2026-10-18 |
| Intermittent Repairs Have Reproducible Evidence | 2026-10-16 |
| Uncertain External Contracts Are Researched Before They Shape Tasks | 2026-10-16 |
| Existing Architectural Decisions Reach The Spec | 2026-10-16 |
| Behavior Specification | 2026-08-19 |
| Repository Skeleton and Install Path | 2026-08-19 |
| Run State and Artifact Contract | 2026-08-19 |
| Preflight and Manifest (phases 0–1) | 2026-08-19 |
| Briefing and Specification (phases 2–3) | 2026-08-19 |
| Plan and Tasks (phase 4) | 2026-08-19 |
| Live Dashboard | 2026-08-19 |
| Parallel Executors (phase 5) | 2026-08-19 |
| Review Pass (phase 6) | 2026-08-19 |
| Blind Acceptance and Final Report (phase 7) | 2026-08-19 |
| Project Memory (phase 9) | 2026-08-19 |
| Repair, Polish and Failure-Mode Catalogue | 2026-08-19 |
| Modes and Depths Parity | 2026-08-19 |
| Documentation and Run Metrics | 2026-08-19 |
| Additional Agent Hosts | 2026-08-19 |
| v1 Release: First End-to-End Run | 2026-08-20 |
| Cut `v0.0.2-alpha` | 2026-08-20 |
| The User's View Boundary | 2026-08-20 |
| Scout — Reconnaissance Before The Прогон | 2026-08-21 |
| Who Holds The Прогон, And What A Repaired Таск Is Reviewed Against | 2026-08-20 |
| Late Words Reach The Blind Gate | 2026-09-27 |
| Close Таски Instead Of Repeating Repairs (Contract 6) | 2026-10-01 |
| A Stage That Never Opened Is Not Called «Still Open» | 2026-10-01 |
| A Run's Directory Says When It Started And Whether It Landed | 2026-10-01 |
| Субагенты Stay Leaves | 2026-10-04 |
| Memory The Next Прогон Reads | 2026-10-04 |
| Briefing Proposes, The User Disposes | 2026-10-04 |
| Executors Write Tests That Can Fail | 2026-10-04 |
| The Plan Cuts For Width And For Something To Show | 2026-10-04 |
| Review Sees What Nobody Asked For | 2026-10-04 |
| Repair Diagnoses By Competing Hypotheses | 2026-10-04 |
| The Report Hands Over What Only The User Can Do | 2026-10-04 |
| A Leaner Resident Orchestrator | 2026-10-04 |
| A Retrospective From Recorded Signals | 2026-10-04 |
| An Optional Guard Against Destructive Git | 2026-10-04 |
| Review Checks What Is Risky To Get Wrong | 2026-10-09 |
| The Project's Own Glossary Is Read, Never Written | 2026-10-09 |
| Existing Code Is Read Once, Before The Spec | 2026-10-11 |
| A Models Dial: Strong And Standard | 2026-10-11 |
| Retire Доводка; The Reference Reaches The Executor First | 2026-10-11 |
| The Прогон Says When A Newer Maestro Is Out | 2026-10-11 |
| A Frozen Dashboard Says What To Do | 2026-10-11 |
| The Standards Reader Finds The Standards Itself | 2026-10-11 |
| A Bare «Да» In Scout's Grill Takes The Recommendations | 2026-10-11 |
| Waiting For The User Stops The Clocks | 2026-10-12 |
| The Header Says What Is Happening | 2026-10-12 |
| Four Cards Instead Of Eight | 2026-10-12 |
| Таск Rows Say Why | 2026-10-12 |
| The Estimate Runs To Acceptance | 2026-10-12 |
| A Feed Derived From The State | 2026-10-12 |
| Your Words Filter By What Became Of Them | 2026-10-12 |
| A Narrow Pane Gets A Dense Layout | 2026-10-12 |
| A Finished Run Reads As A Report | 2026-10-12 |
| Where The Work Stands Between Прогоны | 2026-10-12 |
| Commits A Later Session Can Trace | 2026-10-12 |
| A Resumed Прогон Checks Its Commits Are Still There | 2026-10-12 |

## Open Items

- **`v0.0.1` was never cut, and will not be.** `v0.0.1-alpha` sits on `c2b1c1b`,
  one commit below the bump that made the version `0.0.1-alpha`, and it is
  already on `origin`. The release after it is numbered `0.0.2-alpha`, which
  steps over the gap rather than closing it: the misplaced tag stays where it
  is as a historical marker, and the next tag is placed on the commit that
  carries its own bump. Nothing installs by tag — `npx skills add
  permgps/skills` reads the default branch — so the tag names a moment for
  people, and the push of `main` is what actually ships. `CHANGELOG.md` at the repository
  root carries an entry per release and states this, so the numbering is
  explained where a reader looks for it rather than only here.
- **What an in-app pane does with a second preview session is not established,
  and cannot be fixed here.** Both прогоны that lost the panel had a second page
  opened in the same pane first, and the surviving tabs were always the most
  recently opened — consistent with a viewer that keeps one preview at a time,
  and not proof of it. Settling it needs a person opening two addresses in that
  pane and reporting the tab strip; no browser automation reaches into it, and
  headless Chrome keeps both tabs, which says nothing. The bundle's answer does
  not depend on the answer: it stops creating the situation, and brings the
  panel back when it happens anyway. Recorded as **F12** in
  `.ai-factory/dogfood-findings.md`.
- **Two orchestrators on one прогон are detected, not prevented, and that is as
  far as this can honestly go.** The rule that closed the finding says the
  second session finds out: it compares `updatedAt` before writing, and it
  reports a foreign `heldBy` token to the user rather than deciding. What stays
  open is the case underneath — a session that died holding a claim looks
  exactly like one that is still working, and nothing here can tell them apart.
  A lease would need something to expire it; a лок that refused would strand the
  next session in front of a прогон nobody is driving. So the user is asked, and
  the reason is written where the field is defined rather than left as a gap
  somebody rediscovers.
- **No прогон has yet run under either new rule.** `heldBy` is written by no
  finished прогон, and no таск has been repaired since `commits` became a list.
  Both are held by `npm run state`, by `scripts/state/write.ts` refusing the
  write, and by tests — but a rule a real run has not exercised is a rule this
  repository has been wrong about before.
- **No прогон has yet run under contract 6.** Readiness, defects, strategy
  reviews and the new G3/G4 rules are held by validators, gate scripts and a
  synthetic regression of the failed run, and by nothing that has met a real
  build. Two live scenarios, `setup-readiness` and `batch-without-closure`,
  are prepared in the completion workflow and have not been run against any agent
  host. The executor return format and detector qualification are held by prompts
  and review only; no validator reads them.
- **`manual` is the one mode no прогон has run.** `full`, `semi` and `interview`
  each have a finished отчёт behind them; `manual` differs from `interview` in
  exactly two cells — the spec gate and the plan gate — and neither has been
  exercised by a real run.
- **The state's list contract is honoured by the page, not yet by a writer.**
  `board-sizes` recorded gate findings, `debt.assumptions` and `additions` as
  records where the contract says strings; the dashboard stopped printing
  `[object Object]` and `SKILL.md` now tells the writer the shape, but no прогон
  has yet been started under that rule.
  **For `tasks[].status` this is now closed at the writer as well.** The same
  прогон wrote a таск `pending`, which is a стадия's word; `sync.py` runs after
  every write and rejects a status the contract does not define, and
  `scripts/validate/state-matches-spec.ts` holds its copy of the four sets to
  the specification. The remaining gap is the list fields above, which no
  checker present in a run reads.
- **No Scout session has been run.** The skill is held by two validator runs,
  nineteen contract tests and its own specification, and by nothing that has met
  a user. Everything the specification says about judgement made at run time —
  whether a question is a fork or a preference, whether a proposal's stated source
  really is a contradiction, whether a sweep's finding is a fact or a заявление —
  is held by the text and nothing more, and it says so in place. The first real
  sessions are what turn any of it into evidence.
- **Nothing checks a находка, and nothing can from here.** Under fan-out the
  orchestrator never sees the pages, so a wrong finding does not announce itself:
  it becomes a plausible question, the user answers it, and the answer becomes a
  требование. Every gate in this repository works by holding one artifact against
  another; Scout's findings are held against nothing. The mitigation is honesty
  rather than a gate — findings carry their source, marketing is marked as a
  claim, and `B2` keeps a находка from becoming a требование on its own, so the
  worst case is a wrong question rather than a wrong requirement. Whether that is
  enough is a question for the first real sessions.
- **The fetch surface is the width of the sweep.** Fifty automatically retrieved
  pages is an instruction surface fifty pages wide, and the path out of it is
  page → субагент summary → находка → question → the user's answer → ТЗ →
  манифест. By the last hop an injected instruction is indistinguishable from the
  user's own decision. `B3` is written into Scout's boundary and into every
  субагент briefing, and — like `S6` in Maestro — it is a rule nothing validates.
- **The two-bundle install is measured, not published.** `npx skills add
  permgps/skills` still reaches a default branch holding one `SKILL.md`. What
  F14 establishes is what the CLI does with two, against a `git archive HEAD`
  export. The install page says which of the two it is describing.
- **The Codex dispatch example describes a schema this machine does not run.**
  `references/codex.md` gives the `multi_agent_v2` shape (`task_name`,
  `fork_turns: "none"`). The local `codex-cli 0.161.0` has v2 disabled and v1
  enabled, and v1 takes `fork_context` and no `task_name`. This was read from the
  Codex source on 2026-10-09. The recipe is written conditionally ("with a
  schema exposing these fields") and tells the agent to inspect the actual
  tool, so it is not wrong. Its only worked example is just for the other
  version. Fix it when *A Models Dial* touches that file.
- **What review costs is not measured.** `scripts/metrics` reads the run state
  and nothing else, so it sees no tokens. The decision to keep a review for
  every таск (third outside reading, 2026-10-09) rests on how phase 6 is built,
  not on numbers. Its revisit condition, «a таск review almost never blocks», can
  be read from the review files of finished прогоны without measuring tokens.
  **2026-10-23:** *A Run's Cost Is Measured From The Host's Own Log* (sixth
  outside reading) is the item that produces the numbers. The tool exists
  (`npm run metrics:cost`); no прогон has been measured with it yet.
- The Codex and Gemini CLI rows in `docs/spec/hosts.md` read **unverified**: the
  bundle installs on both and no прогон has been run on either. A row moves to
  *supported* when one has, and not when the documentation says a capability
  exists.
