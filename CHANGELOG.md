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

- **A resumed прогон checks its commits are still there.** Every recovery —
  a new session, the return after a compaction, a reopened run — first runs
  `sync.mts --commits-check`, a read-only command that classifies each
  recorded sha against `HEAD` as `ancestor`, `not-ancestor` or `missing`,
  names the rewritten twin a rebase left and the local branches a checkout left
  it on. A таск that lost a commit is named in one line, its sha moved to the
  new optional `tasks[].lostCommits`, and relaunched with a `## Lost Commit`
  handoff that makes the zone the starting point; a checkout onto one branch is
  asked about first. The publish refuses a sha dropped from `commits` without
  that move, and a finished таск sent back to `queued` without a lost commit.
  A git that cannot answer resets nothing. `npm run check` holds it through
  eight `resume` anchors in `npm run bundle` and fixture-repository tests
  over a real reset, rebase and checkout.
- **Commits a later session can trace.** Every таск and repair commit carries
  `Maestro-Run: <dir>` and `Requirements: R01, R02` trailers, because таск
  numbers and requirement ids restart every прогон. The memory phase now runs
  after every closure, acceptance's or repair's, and ends with a closing commit
  `maestro: close <dir>` over `.maestro/` and the memory file only, by
  pathspec. When a rebase rewrote the commit `PROGRESS.md` names, preflight
  finds the last closure by that subject (`basis: closing-commit`) before it
  falls back to the date. `--memory-write` ends the block with a tail it
  regenerates on every write, *Working Between Runs*: a small fix without
  Maestro, and which slice of the history to read. An empty body no longer
  exits 2; it keeps the block and refreshes the tail. `npm run check` holds it
  through nine `trace` anchors in `npm run bundle`, a test tying the phase
  file's subject to `history.mts`, and new `history`, `markers` and
  `memory-sync` tests.
- **Where the work stands survives between прогоны.** Every closing publish
  rewrites `.maestro/PROGRESS.md` from the closed state: *Settled By The User*,
  *Not Done*, *Known Bugs* and *Fixes Without Maestro*, each item keyed
  `[<run dir>#<id>]` so another run's open work is carried until the user
  takes or dismisses it, and a header naming the commit `HEAD` was at. The
  next preflight copies it into `prior.md` with the commits over code since
  that commit and the paths they changed; past thirty, `--memory-read` answers
  `summary-needed` and a new `standard`-tier commit reader sums them up for
  `--commit-summary`. Briefing offers the open items once under
  `### Leftovers — <gist>`, the one heading G1 accepts without an `R##`, and
  never in `full`; the user's answer lands in a new optional state field,
  `leftovers`, which raises no contract version. The existing-code reader is
  handed the changed paths. `npm run check` holds it through the new
  `progress`, `history` and `progress-sync` tests, five memory anchors, and a
  `gate-readers` test that no reader is handed `PROGRESS.md` or `prior.md`.

`CONTRACT_VERSION` moves to `10`.

- **BREAKING: a closed contract-10 state requires `result`.** One line of at
  most 200 characters, in the прогон's language, saying what now exists;
  acceptance writes it in the closing candidate. An active state must not carry
  it — a reopened run drops it with `outcome` and `finishedAt` — and it is
  refused below contract 10, so a contract-9 run keeps closing without it.
  `result` is the fifth field written in the прогон's language, and
  `sync.mts` holds it for `ru` like the other four. Publication accepts
  contracts 4 through 10.
- **A finished run reads as a report.** Once closed, the header shows the
  прогон's sentence under the condition word in the band's colour and names
  the отчёт as «Отчёт: `.maestro/<dir>/report.md`» — the one path the page
  composes, for display, never fetched. «Ваш ход» moves in the DOM to just
  under the header, and back under the cards if the run is reopened.

Earlier in this release `CONTRACT_VERSION` moved to `9`.

- **BREAKING: contract 9 keeps the time a прогон waited for you.** `waits` is
  a new optional list of closed waits, `{ since, until }`, kept by
  `sync.mts --publish`: it appends one when `awaiting` is cleared, replaced by a
  new question, or left open across a stage or таск transition (a forgotten
  clear, logged as WARN and closed for the orchestrator). Every edge comes from
  the candidate's own stamps. A candidate may carry `waits` only as it last
  read it; a rewritten list is refused with field `waits`, and `writeState`
  refuses a later state that dropped or rewrote a closed wait. `awaiting.kind`
  widens from `answer` to six stops — `briefing-round`, `spec-gate`,
  `plan-gate`, `one-way-action`, `repair-limit` — and an optional one-line
  `awaiting.note` says what is awaited, in the прогон's language. All three are
  refused below contract 9, and a contract-8 run keeps running under 8.
- **The dashboard opens with a band that says what is happening.** It names
  the прогон's condition as a word and a colour — «Идёт работа», «Ждёт вас»,
  «Завершён» or «Сбой» — read from `lifecycle`, `outcome`, `interruptedAt`,
  `awaiting` and `stages[]`. A wait outranks a failed stage, and «Завершён»
  never claims the work was verified. Under the word are the bar, one sentence
  about the таски («2 из 6 тасков готовы, ещё 3 в работе»), the таски in work,
  in review and in repair by title, and the eight stages as a strip with their
  clocks. The `progress` and `stage` regions are retired into the band, and
  the `estimate` region moved to its right. `npm run dashboard` holds the four
  condition words to the new *Run Condition* table in `vocabulary.md`. No
  contract change.
- **The dashboard's cards go from six to four**: Требования, Таски, Тесты and
  Рабочее время. Требования counts live требования built — every таск naming
  one is done — with «в работе» and «отложено» beneath, and says «Прошло
  проверку» only once the current G4 has passed; a state older than contract 4
  never does. Таски loses its bar and «% пути» for one square per таск in its
  status colour, the statuses also counted in words. Тесты shows the failed
  count beside the passed one and names its source: the full suite at
  acceptance, or the таск that finished last — by `finishedAt`, where the page
  used to take the last таск in the list. Brief coverage moved to a line under
  G2 in Гейты, and Долг became the total line of «Ваш ход», which also counts
  promised work and one-way changes; each `i` explanation moved with its
  number. «Прошло времени» is now «Рабочее время». `npm run dashboard` holds
  the three progress words to the new *Requirement Progress* table in
  `vocabulary.md`. No contract change.
- **Every таск bar in the build block says why.** Each bar says its status in
  a word, so no status is told by colour alone. A repair bar quotes what was
  sent back — the first open defect's `counterexample`, verbatim — once repair
  has written it. A failed bar names the last repair attempt's outcome, in five
  words the new `verification.repairAttempts[].outcome` rows of
  `vocabulary.md` define and `npm run dashboard` holds the page to. A wave
  that has not started names what it waits for: «Волна 4 · ждёт 04». No
  contract change.
- **«Осталось» runs to acceptance.** The range adds the review and acceptance
  stages still ahead, and its caption says so: «… · с ревью и приёмкой». Before
  a stage starts it counts as a share of the projected development — the lower
  to the upper quartile of six finished прогоны of August 2026, derived by the
  new `scripts/metrics/shares.ts` from their recorded stamps and held to the
  page and to `docs/spec/dashboard.md` by tests and `npm run dashboard`. Once
  a stage starts, its own clock replaces its share. The estimate no longer goes
  blank while review and acceptance run, and `measure` prints each прогон's
  review and acceptance share of development. No contract change.
- **The dashboard gains «Лента»: what just happened**, newest first, each line
  with its age — a stage started, a таск started or handed in to review with
  its test count, a repair attempt with its outcome, a check passed or not.
  Every event is read from a stamp the state already carries; from contract 4
  the finished-work check is one line per acceptance round, and the latest
  passed round that is no longer current says «устарела». Review's verdicts are
  not shown, because they leave no stamp, and the region's `i` says so.
  Fifteen lines show and the rest fold. No contract change.
- **The requirement list filters your words by what became of them.** Chips
  with counts sit over the rows: all, built, in progress, deferred, and
  dropped when there are any, and together they add up to all. Ten rows show
  before «Показать все N», and a deferred, placeholder or dropped row shows its
  reason inline. The chosen chip stays in the browser and never reaches the
  run. No contract change.
- **The status chips keep their pill and their colour again.** The mode and
  depth chips in the header and the build-status chips over the waves had
  lost their round shape and their status border to the requirement filter's
  chips, which were styled under the same class; the filter's rule is now
  scoped to its own row.
- **A narrow pane gets a dense layout.** Below `62rem` the page uses tighter
  padding, smaller headline numbers and the cards two by two, and the stage
  strip wraps into as many `6rem` cells as fit instead of breaking labels
  mid-word. The regions, their order and the full-width page are unchanged.
  The stylesheet is narrow-first, and `npm run dashboard` holds its width
  queries to the new breakpoint table in `docs/spec/dashboard.md` › *A Narrow
  Pane*. No contract change.
- **A wait for the user stops the clocks.** From contract 9 the dashboard cuts
  every closed wait and the open one out of working time, the stage clocks, the
  таск durations, the median and the estimate before the 45-minute ceiling
  measures what is left. A wait is subtracted whole, and an open one freezes
  the clocks until the reply is written. The working-time explanations say so.
- **The page and the tab say what the прогон waits for.** The waiting line
  names the stop — «Ждёт вашего одобрения спецификации в чате с …» — and
  appends the note. While the прогон waits, the browser tab reads «● Ждём вас» /
  «● Waiting for you».
- **Each stop names its kind.** `SKILL.md`, the брифинг, spec, plan and repair
  phases name the kind their stop writes, preflight seeds contract 9, and one
  `STOP_ANCHORS` literal per kind holds each file to it.

Earlier in this release `CONTRACT_VERSION` moved to `8`.

- **A bare «да» in Scout's grill takes the recommendations.** Step 3 now words
  every question so that «да» accepts its recommendation; a yes/no question
  recommending «нет» is reworded. A bare «да» or «как советуешь» to the block is
  resolved per `Q##` and printed back in the same turn, one line per question
  with the chosen answer in full, as step 4 already does for «yes to all». A
  mixed reply resolves only what it delegated. A fact only the user has (a
  price, a name, a number) carries no recommendation, so it stays open. A
  resolved answer is recorded as the chosen text, which is what a proposal
  quotes. `scripts/scout/contract.ts` holds the shape of a question and the
  print-back, and Scout's contract tests hold both rules in `steps/3-grill.md`
  and `docs/spec/scout/steps.md`.
- **The standards reader finds the standards itself.** Phase 6 handed the
  standards reader the memory file, `CONTRIBUTING*` and only the documents they
  or the README named, so a `CODING_STANDARDS.md` or a `STYLEGUIDE.md` that
  nothing linked to was never checked. The step now searches the project root:
  the memory file of every supported host (`CLAUDE.md`, `.claude/CLAUDE.md`,
  `CLAUDE.local.md`, `AGENTS.override.md`, `AGENTS.md`, `GEMINI.md`), each
  with the Maestro block cut out; `CONTRIBUTING*`, `CODING_STANDARDS*` and
  `STYLEGUIDE*` at the root and in `.github/`; and conventions documents under
  `docs/`. Named documents still count. A found file is handed over only if it
  describes how code is written. What the reader is given and withheld is
  unchanged. `npm run readers` holds the list in phase 6, the spec and the
  brief, taking the memory files from the runtime's host table.
- **A frozen dashboard says what to do.** When `state.js` beside the page stops
  loading, the message named the file and said the clocks stopped, and nothing
  more. It now adds, in both languages: if the прогон is still going, ask in the
  chat to bring the dashboard back — the request `--reopen` already answers. It
  names the chat, not an agent, because «агент» is the словарь's non-term for
  «субагент», a word the page already explains. No prompt changes.
- **The прогон says when a newer Maestro is out.** `skills/maestro/SKILL.md`
  carries `metadata.version`, and `npm run bundle` holds it equal to
  `package.json`'s version, so a release bumps both in one commit. Preflight
  step 4c runs `node .maestro/sync.mts --update-check --skill <dir>`: the helper
  reads the installed version and makes one GET of the published `SKILL.md` on
  the default branch, with a 2-second timeout, a 64 KiB limit and no query
  string, header or body of its own. When the published version is newer, the
  announcement carries one line, in the прогон's language, naming it and
  `npx skills update`. Offline, a timeout, any error, an equal or older version
  and `MAESTRO_NO_UPDATE_CHECK=1` all say nothing, and the command always exits
  0. The published `SKILL.md` gains its version only when this is pushed;
  until then every check finds no published version and stays silent. `SKILL.md` stays
  at its 547-line ceiling: the frontmatter's two lines replaced a sentence whose
  reasoning `docs/spec/phases.md` already carries.
- **Доводка is retired; the reference reaches the executor first.** The finish
  dial is gone, with `phases/7-polish.md`, the polish reader, its tier rows, the
  dashboard's доводка chip and every branch that read it. `polish`, «доведи до
  эталона» and «сравни с образцом» are бриф text now, and no notice says the
  dial left; a `polish` key in `.maestro/config.json` is ignored like any
  unknown key. Contract 8 refuses a `polish` field and a `dialChanges[]` entry
  for it; below 8 `polish` stays a required boolean that nothing reads, so a
  reopened contract-7 run keeps its value as written. In its place the plan
  writes a `References` row into every task file: each `REF-*` id the таск
  follows, in backticks, with its role and location, or `none`. The executor
  opens what its row names, read-only, and never receives `reference.md`; a
  `contextual_example` is inspiration it follows where its task file does not
  decide. The reviewer may open the same references and does not count a
  difference from an example as a defect unless the task file does. «Like X»
  is a требование that G4 checks, and required fidelity in G4 is unchanged.
  From contract 8 `check-g3` reads the `References` rows against
  `state.verification.references`: a missing or unreadable row, an id with no
  location, an id the register does not hold, and an available
  `visual_reference` or `contextual_example` no таск cites are findings;
  authoritative, `other` and unavailable references may stay uncited, which is
  what domtut's run needed for its missing screenshot. A reference the user
  replaced, as REF-8 replaced REF-3 there, is kept by briefing with role
  `other` and `superseded by REF-n; was <its former role>`, so neither G2 nor
  G3 asks for it and no executor is sent to the replaced look. `npm run
  bundle` holds seven new literals in
  `REFERENCE_ANCHORS` and refuses any mention of `7-polish`, `polish-reader`
  or доводка in a shipped file; `npm run readers` holds `reference.md` out of
  the executor's and the reviewer's briefs. `SKILL.md` comes down to 547
  lines; 1435 tests pass.
- **A models dial: judges strong, таски by tier.** Two tiers: `strong` runs
  every judge (the gate readers, the reviewer, the standards, diagnosis,
  strategy and acceptance readers), every repair and retry, and every таск
  the plan marks `strong`; `standard` runs
  the other таски, the existing-code reader and the preflight probe. The
  orchestrator stays on the session's model. The dial is one bare
  `<strong>/<standard>` token, a dial only when both halves are model names
  the host reports; then the per-host pin `models.<host>` in
  `.maestro/config.json`; then a question asked once per project and host, in
  `full` too, with options built from what the host reports. Built-in default
  `session/session`, where `session` passes no model. Claude Code and Codex
  pass the model and the session's effort per dispatch, and Codex never passes
  `agent_type`; Gemini CLI degrades to the session's model and the
  announcement says so. Preflight pins the answer through the new helper
  command `--config-models`, the one change a прогон makes to an existing
  config, which keeps every other key and refuses a missing or unreadable file.
  The plan marks each таск in a `Model` row: a producer in the Seams table and
  the sole таск of wave 1 are `strong` by rule, and `check-g3` holds that from
  contract 8, reading the Seams table and the `Model` rows and nothing else;
  risk and a hard core are `strong` by judgement, and the reviewer still judges
  every diff whatever the row says. A Producer task cell is read only as ids
  and forward ranges of one width, at most 999 ids, so a date is never
  expanded; a bold or capitalised `Model` row counts, and a таск with no task
  file is reported as such. The отчёт's *What was asked* ends with a
  `Models:` line, and `npm run metrics` counts таски, retries and repairs per
  tier. `npm run dials`, `readers`, `hosts`, `state` and `bundle` hold the
  dial, the tier table, the host model lists, the config keys and eleven
  anchors; 1399 tests pass. `CONTRACT_VERSION`
  is `8`; a contract-7 run, reopened too, keeps running on the session's model
  and writes no `models` and no `model`.
- **Existing code is read once, before the spec.** Preflight's `--memory-read`
  also says whether the project already holds code: git is asked for tracked
  and untracked files it does not ignore, and without git the directory is
  walked. Maestro's own record, host installs, memory files, project glossary
  files and root-level README, licence and git meta files do not count.
  Preflight records the answer as the optional `existingCode` field. In a
  project with code, the spec phase dispatches one fresh existing-code reader,
  which changes nothing and returns where things live, the conventions, the
  commands, the exact names the work will touch, what has no counterpart yet
  and what not to touch. Its text goes verbatim into `codebase.md`, and a failed
  read becomes a `debt.assumptions` line. The spec reads it first, identifiers
  are English, and the Terms table gains *Name in code*, with `interfaces.md`
  still the authority on names. Build and repair executors and the
  plan-consistency reader are handed `codebase.md`; every other reader
  withholds it, and a task file stays buildable without it. `npm run readers`
  holds who is handed it, and `npm run bundle` holds twelve new literals in
  `CODEBASE_ANCHORS`; 1320 tests pass. `CONTRACT_VERSION` stays `7`.
- **Review checks what is risky to get wrong.** The reviewer has a sixth part:
  sign-in and permissions, money, deleting data, secrets, and messages sent to
  third parties. The reviewer decides from the diff whether a category
  applies; nothing in the plan marks a таск as risky. A finding blocks only
  with a concrete counterexample, and without one it stays an observation.
  This is the one place an absence counts as a finding: a permission check that
  is not there is the defect, unless the task file or `interfaces.md` names who
  provides it. Risk findings are tagged `risk:<category>` and quote no line,
  just as `unrequested` ones are, and they reach the отчёт's Observations
  through that tag. A gap that spans two таски is out of any per-таск
  reviewer's sight. It is recorded as an unsettled observation and left to G4.
  The spec's blocking row also regains the file-ownership clause the prompt
  already had. `npm run bundle` holds four new literals in `REVIEW_ANCHORS`;
  1250 tests pass.
- **The project's own glossary is read, never written.** Preflight's
  `--memory-read` also reads `GLOSSARY.md` or `CONTEXT.md` at the project root,
  and a `GLOSSARY-MAP.md` or `CONTEXT-MAP.md` with every file it links to inside
  the project, into a fenced `## Project Glossary` section of `prior.md`. One
  32 KiB limit covers all of it. Past it, none is read, the announcement says
  so, and a `debt.assumptions` line carries it to the отчёт. The plan's Terms
  table takes a project-glossary term as it stands. Where the манифест means
  the word differently, the манифест wins for the прогон, the row says
  `contradicts project glossary, because …`, and Assumptions asks the user to
  fix the project glossary or the бриф. Phase 9 carries terms as
  `term — meaning (not: x, y)` and drops any the project glossary defines.
  Nothing writes into the user's file. `npm run bundle` holds five new
  memory anchors, keeps the project glossary's file names out of every brief,
  and, with `npm run spec`, refuses a bare «glossary» in prose: the user's file
  is the project glossary, Maestro's words are the словарь, and one прогон's
  words are the Terms table. The spec now lists the plan among `prior.md`'s
  readers, as the plan phase already was.

## v0.0.13-alpha — 2026-10-05

The second прогон in one project. `CONTRACT_VERSION` stays `7`; a closed run's
last state now also lives in its own folder.

- **A second прогон can start in a project whose last run closed.** `state.js`
  is one per project, and `--publish` judged any state on disk as the same
  run: the closed run's holder token, its fixed `runId`, `slug` and
  `startedAt` and its immutable records all refused the new run's first write,
  leaving deleting the file by hand as the only way on. A closed prior state is
  now succeeded by an active contract-7 run with another id: `--expect` still
  names the closed revision, the closed state is kept byte for byte as
  `.maestro/<dir>/state.js` before it is replaced, and an active prior run is
  never replaced by another.

## v0.0.12-alpha — 2026-10-05

The second fix found by the прогон that could not close: a rule added after its
history was published no longer refuses that history. `CONTRACT_VERSION` stays
`7`; no published state changes shape.

- **A repeat repair published before the diagnosis shape stays valid.** The
  ranked-hypotheses rule was checked over the whole state, so a run whose
  repeat attempt was accepted by an earlier runtime with a prose diagnosis was
  refused on every read and publish after the update — and the attempt, being
  published, could never be rewritten. The rule now judges an attempt once, at
  the publish that appends it.

## v0.0.11-alpha — 2026-10-05

A fix found by a прогон that reached G4 and could not close. `CONTRACT_VERSION`
stays `7`; no published state changes shape.

- **A run whose checks cite its own task files can close.** A fingerprint
  keeps the path its input had when it was hashed, so every check that named
  `.maestro/<dir>--wip/tasks/…` made the closing publish fail its evidence
  check once the folder lost `--wip`, and published records could not be
  rewritten to follow it. An input under the run folder's other spelling is now
  read under the name the folder has now, with its hash still compared, in both
  directions — closing and reopening.

## v0.0.10-alpha — 2026-10-05

Fixes from a whole-project review. `CONTRACT_VERSION` stays `7`, but the
validator is stricter: a state with loose stamps or duplicate ids that used to
pass is now refused.

- **The git guard reads commands the way the shell and git do.** An apostrophe
  in a here-document commit message (`Don't`) no longer hides the command after
  it, a `$(…)` whose quote never closes is refused as `unreadable`, and an
  abbreviated long option such as `--har` or `--forc` counts as the option git
  takes it for.
- **State text can no longer run as code in the dashboard.** A snapshot or
  validation end marker spelled inside a state string stopped the next rewrite
  early and left the old tail in the page as script. The markers now own whole
  lines, and `*/` is escaped inside the literal.
- **The secret gate is linear and catches more.** The assignment rule no longer
  slows quadratically on long words, and backtick- or punctuation-wrapped
  values, quoted values with spaces, URL credentials containing `@` or `/`,
  JWTs, PGP and unterminated private keys, Slack app tokens and webhooks, and
  npm tokens are redacted. Key names match by segment, so `AUTHOR` is no longer
  taken for a key, and a provider token behind `Authorization:` is named by its
  provider. The sweep skips build directories only at its root.
- **A symlinked memory file stays a symlink.** Writing the block through
  `CLAUDE.md -> AGENTS.md` replaced the link with a regular file; the write now
  lands on the file the link points at, one file under two names counts once,
  and a link to nothing is refused.
- **The viewer answers only its own loopback name**, so a page rebound to
  127.0.0.1 cannot read `.maestro/`, and every response carries `nosniff`.
- **The run state refuses what used to contradict itself.** Stamps are strict
  ISO 8601 moments from contract 4 on and are ordered as moments, so a later
  failure in another zone no longer hides behind an earlier pass; duplicate ids
  in stages, tasks, requirements and gates are refused; a task that first
  appears already running waits on its blockers.
- **The bundle keeps its own promises.** Every phase file ends at its hand-off,
  so no step sits where a reader that obeys it never looks; review has the
  promised no-version-control branch; the executor carries S4; a stop that asks
  nothing writes `interruptedAt`; and the executor's `commit:` names the HEAD it
  worked on, since only the orchestrator commits. `bundle-integrity` holds each.
- **A refused write no longer blanks the dashboard.** When `sync.mts` rejected a
  candidate, the page hid every region until the next accepted write, leaving
  only the header and the error. The last accepted прогон now stays on screen
  under the error tied to the refused revision; only a verified-success line it
  no longer backs is withdrawn.

## v0.0.9-alpha — 2026-10-05

The dashboard now shows what the state already carried. `CONTRACT_VERSION`
stays `7`: the two new fields are optional, and a run without them renders as
before.

- **«Ваш ход»**, a new region: empty variables by name, placeholders, open
  promised work, one-way changes grouped by kind, and assumptions. The Долг card
  counts the same lists.
- **Таск rows open** to the требования they serve, blockers, files, owned area,
  short commit hashes, restarts, trips to repair, passes to a fresh субагент,
  tests and defects. The critical path is marked, and its count on «Осталось» is
  the number of marked rows.
- **Требование rows open** to the user's quoted words (verification 2+), the
  таски that name them, each check with its derived result and failure cause,
  open findings and live defects. A требование no таск names is marked. The
  words heard but not taken, and what was delivered beyond the ask, are folded
  below the list.
- **A stopped run prints its `stopReason`**; the raised silence notice names the
  run's claim token, in words in the plain register.
- **`awaiting { kind: 'answer', since }`**, new and optional: written before
  every stop on a question once the run has a state — the манифест, the брифинг,
  the manual gates, an S4 action, a spent repair limit — it turns the silence
  line into a calm «waiting for your reply». The validator refuses any other
  `kind`, and refuses the field on a closed or interrupted run.
- **`requirements[].title`**, new and optional: one English line from the
  manifest phase, shown under the quote.
- Keyboard focus survives the two-second redraw: every row and toggle carries a
  key, and the page hands focus back to it. A focused row is outlined, not only
  tinted.
- The language rule now names what the page quotes as written — `debt` and
  `oneWay` lines, `additions`, `stopReason`, a требование's `title`, the
  verification record's text — and keeps them English: they are record lines
  the отчёт and the gates read too.
- `dashboard-integrity` holds six new value maps to the vocabulary, refuses
  links, markup or windows built at run time, holds the page's one-way kinds to
  the contract, and refuses a focusable node the redraw could not find again.

The README now teaches the whole product rather than only its design.

- **New sections:** a quick start, every install form with updating and
  removal, the command grammar, all five dials with their Russian and English
  trigger words, defaults and precedence, every stop with what can be answered,
  what can be said to a run in progress, what a run leaves in the project, the
  dashboard's regions and commands, Scout end to end, host status and
  degradations, limitations, every npm script, and a map of the documentation.
- **Corrected:** the README said the dialogue language "is not a dial". It is
  one — `ru` or `en`, set by a trigger word, a hand-written `language` key in
  `config.json`, or the language of the бриф.
- **Corrected:** `docs/install.md` said the first run asks one thing. It asks
  two — the register, then the mode in that register — and `config.json` carries
  `explain` beside `mode`. Its table of checks gains `report` and
  `parity:workflow:prepare`.
- **`scripts/validate/readme-references.ts`** holds the README to the
  repository: every relative link and anchor resolves, every `npm run` names a
  real script, every `sync.mts` flag is one the helper parses, and the sections
  and dial values are all there. It runs inside `npm run test`, so the twelve
  validator runs of `npm run check` are unchanged.

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
