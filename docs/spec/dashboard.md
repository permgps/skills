# Dashboard

The human view of a прогон. It is opened for the user, not described to them.

## Input

**The data it renders comes from `state.js` and nothing else.** The dashboard
never reads `manifest.md`, `spec.md`, a task file, or any path in the
repository. A view that reaches into artifacts becomes a second source of truth,
and the second one is silently wrong.

Contract-4/5 verification records and their validation envelope arrive through
that same snapshot. The page derives requirement results and run outcome from
them; it does not open evidence files or treat `finishedAt`, completed tasks,
or a finished acceptance stage as proof of conformance. An invalid candidate
must leave an accessible error tied to its revision and suppress an older green
success display; the last accepted state stays visible under that error. A historical pre-verification state remains readable with an
explicit “verification not established” label, including its original G4.

A **view preference** is not data about the прогон, and the rule above does not
reach it. Which theme the page is painted in, and which of its two languages a
particular reader is reading, are properties of that reader's eyes and their
browser. They are kept in that browser, they are no path in the repository, and
nothing about the прогон changes when one of them moves. *The Reader's Own Two
Controls* below is the whole of what they are allowed to be.

The rule is stated this way round because the words are absolute and the next
reader would otherwise call a remembered theme a violation of it. What is
forbidden is a second source for the прогон, not a reader remembering how they
like to look at it.

## What It Renders

| Key | Region | Shows | Source |
|---|---|---|---|
| `dials` | Dials | Mode, depth, the register when the state names one, and any mid-run change | `mode`, `depth`, `explain`, `dialChanges[]` |
| `header` | Что происходит | The run's condition as a colour and a word, the share of the road, one sentence about the таски, the таски in flight by title, and the eight stages as a strip with their clocks | `stages[]`, `tasks[]`, `currentStage`, `awaiting`, `lifecycle`, `outcome`, `interruptedAt` |
| `estimate` | Осталось | The estimate as a range — the remaining critical path plus the review and acceptance stages still ahead — and what it covers; shown at the right of the header band | `tasks[]`, `stages[]` |
| `requirements` | Требования (счёт) | Live требования built, in progress and deferred, with a bar; verified instead of built once the current G4 passed | `requirements[]`, `tasks[]`, `verification` |
| `tasks` | Таски | Accepted of cut, one square per таск in its status colour, with what is in motion, failed or retried in words | `tasks[]` |
| `tests` | Тесты | The last suite's passed count, the failed count beside it, and the таск it ran after or the full suite at acceptance | `tests`, or the own suite of the таск that finished last |
| `elapsed` | Рабочее время | Working time since `startedAt`, the median таск beneath it, and the calendar span when the two differ | every timestamp in the state |
| `handover` | Ваш ход | What only the user can settle: empty variables by name, placeholders, open promised work, one-way changes by kind, assumptions, and the total, which the retired Долг card counted | `debt`, `verification.promisedWork`, `oneWay` |
| `feed` | Лента | What just happened, newest first, each event with its age; fifteen shown, the rest folded | `stages[]`, `tasks[]`, `gates[]`, `verification.repairAttempts`, `verification.acceptanceRounds` |
| `stages` | Этапы | The eight stages in order, each with its Label, note and duration | `stages[]`, labels from `vocabulary.md` |
| `build` | Ход разработки | The таски grouped by волна, each a bar in its status colour with its status in a word and its clock; a repair bar quotes what was sent back, a failed bar names the last repair outcome, and a wave not yet started names what it waits for | `tasks[]`, `verification` |
| `requirement-list` | Требования (список) | The манифест one требование at a time, with technical result, filtered by chips that partition the list; ten rows show before «Показать все N», a deferred, placeholder or dropped row shows its reason inline, a row opens to its chain, and folded below are the words heard but not taken and what was delivered beyond the ask | `requirements[]`, `verification`, `tasks[]`, `additions` |
| `gates` | Gates | G1–G4 with status, derived G4 evidence, and findings, and, under G2, the share of live требования that reached the specification | `gates[]`, `verification`, `lifecycle`, `outcome`, `requirements[]` |

The `Key` column is the region's name in the page: it is the `data-region`
attribute in the markup and the entry in `EXPLAIN_ORDER` in the logic block.
`scripts/validate/dashboard-integrity.ts` checks all three against each other,
so a region cannot be added to one and forgotten in the others.

**Findings under a check that passed are a record, not an alarm.** A gate is
never passed with notes left standing — `SKILL.md` and `phases/4-plan.md` both
say so — which makes a finding under a passed gate a line about something that
was already dealt with. It is shown folded: one line saying how many there are,
opening the list on a press, in the muted tone this page uses for everything
settled. The colour of failure stays with failure, where it means what it says.
A passed gate with an empty list shows nothing at all.

The decision — whether to show, whether folded, in which tone — is made in the
logic block and not inside the render, so that it can be called by a test. The
defect this rule replaced shipped because the rule was written in a branch no
test in the repository could reach.

## The Title Names The Run

The header's title is the slug and, for a state of contract 7 or later, the day the run
started, read out of `dir` — «Прогон: <slug> · <YYYY-MM-DD>». A state whose
`dir` is absent or does not parse is titled by its slug alone, as every state
before contract 7 was. The page reads the date and nothing else out of `dir`:
it builds no artifact path, and whether the run is still in progress is said by
the lifecycle the page already renders, not by the suffix. The page carries its
own copy of the `dir` grammar because it imports nothing; the copy is compared
with the runtime's by `npm run dashboard`.

**The tab says when the прогон waits for you.** While `awaiting` holds a wait
the page would show — an active run, a `since` that parses — the browser tab's
title is «● Ждём вас» / «● Waiting for you», so a tab in the background says so;
otherwise it is the static `Maestro`. This applies at every contract version.

## The Header Says What Is Happening

The page opens with a band under the title and the controls, above the notices.
It holds two regions side by side: `header` on the left and `estimate` on the
right. The band itself is a container, not a region, because a region nested in
another would have its `i` hung on the inner heading.

**The condition is one of four words, read from fields every contract already
carries.** The page adds no field for it. The rows are checked in order, and the
first match wins:

| # | State | Condition | Word |
|---|---|---|---|
| C1 | `lifecycle: closed`, `outcome: stopped_incomplete` | failed | Сбой / Failed |
| C2 | `lifecycle: closed`, any other outcome; or below contract 4 with `finishedAt` | finished | Завершён / Finished |
| C3 | not closed, `interruptedAt` set | failed | Сбой / Failed |
| C4 | not stopped, `awaiting` holds a wait the page would show | waiting | Ждёт вас / Waiting for you |
| C5 | not stopped, no wait, some `stages[].status` is `failed` | failed | Сбой / Failed |
| C6 | anything else, including a state with no stages | working | Идёт работа / Working |

**A wait outranks a failed стадия (C4 before C5).** The reader holds the next
move either way. «Сбой» over a question would send them looking for a fault
instead of answering it. The tab reads the same wait, so the band and the tab
cannot disagree. Nothing writes a failed стадия yet ([`state-contract.md`](state-contract.md)),
so C5 is defensive.

**Finished says closed, never verified.** `closed_with_exceptions` is finished.
Whether the work was verified is said by the run notice beside the band, in the
wording of [`vocabulary.md`](vocabulary.md) › *Verification and Closure
Wording*. The `header` explanation quotes that notice and does not restate it.

**A frozen chat still reads as working.** The page cannot tell a dead chat
from a busy one. The silence notice under the band says so in words.

**The colour is never the only signal.** The condition sets the band's left
border and the colour of its word: working `--info`, waiting `--warn`, finished
`--accent`, failed `--fail`. The background stays the panel's, so the four
tokens keep the contrast they already have in both themes. The script sets a
class and the stylesheet owns the colour.

**The bar and its caption** carry the share of the road from the rule in *The
Numbers Are Computed, Never Stored*. The percent is printed once, in the
caption «Прогресс проекта — N%».

**One sentence about the таски**, the same in both registers:

| # | Таски | ru | en |
|---|---|---|---|
| S1 | none | Тасков пока нет | No tasks yet |
| S2 | 2 done of 6, 3 active | 2 из 6 тасков готовы, ещё 3 в работе | 2 of 6 tasks done, 3 more in progress |
| S3 | 1 done of 21, none active | 1 из 21 таска готов | 1 of 21 tasks done |
| S4 | 5 done of 5 | 5 из 5 тасков готовы | 5 of 5 tasks done |
| S5 | 0 done of 1, 1 active | 0 из 1 таска готовы, ещё 1 в работе | 0 of 1 task done, 1 more in progress |
| S6 | 1 off-contract among 4 | … · вне контракта 1 | … · off-contract 1 |

"Done" counts accepted таски, the figure the Таски card shows. "Active" counts
`running`, `review` and `repair` together. In Russian, the noun after «из N» is
the genitive of N — «таска» for one, «тасков» otherwise — and the verb is
«готов» when the count of done таски takes the singular form, «готовы»
otherwise. A failed таск is counted in the total and named by the build block;
the sentence gives it no clause of its own.

**The in-flight line** names the таски in work, in review and in repair, in
that order. Each group starts with its status label. Titles are quoted «…» in
Russian and “…” in English, and a таск without a title is named by its id. At
most three titles per group are shown, then «и ещё N» / "and N more". Groups
are joined by « · ». The line is hidden when nothing is in flight.

**The strip** shows the eight stages in road order, a stage the state never
wrote drawn as pending. Each cell carries the stage label and its own working
clock, the same clock as the timeline row. A skipped or failed cell shows its
status label («Пропущен», «Сбой») instead of a clock. A pending cell shows a
dash. The current stage carries `aria-current="step"` and a heavier weight.
The strip is eight columns where there is room and four otherwise, and never
scrolls sideways.

**The `stages` region stays.** The strip is a summary. The timeline below keeps
each stage's note, the findings of a failed check, and its own `i`.

**The band replaced two regions.** `progress` became the bar, and `stage`
became the strip and the `header` explanation. The `estimate` region moved
into the band whole, with the same key, `i` and explanation.

## Four Cards

Under the band sit four cards, in this order: Требования, Таски, Тесты,
Рабочее время. They are one row of four at `62rem` and wider, and two by two
below it. Every card reads fields every contract already carries — no
contract change made them.

### Требования: built, never done

The figure is built of live, with a bar of the same share. The line beneath it
names the other two buckets: «Построено · в работе 5 · отложено 2». *Naming
таски* are the таски whose `requirementIds` contain the требование's id.

| # | Status | Naming таски | Bucket | Counted in live |
|---|---|---|---|---|
| P1 | `dropped` | any | — | no |
| P2 | `deferred` | any, including all `done` | deferred | yes |
| P3 | `open`, `in-spec` or `placeholder` | none | in progress | yes |
| P4 | same | ≥ 1, every one `done` | built | yes |
| P5 | same | ≥ 1, one `running`, `review`, `repair` or `queued` | in progress | yes |
| P6 | same | ≥ 1, one `failed` or off-contract | in progress | yes |

The three buckets partition live: **built + in progress + deferred = live**,
on every state. A deferred требование is live, because the coverage line
divides by the same number, yet it is never built — the user put it off, and
work that happens to touch it does not settle it. A placeholder is built once
its таски are done; the placeholder itself waits in Ваш ход, where the user
settles it. Activity is not delivery: one таск still in motion, failed or
off-contract keeps a требование in progress, and so does having no таск at all.

**Verified replaces built only after the current G4.** With contract 4 or later
and `verificationOf(state).g4 === 'passed'`, the figure counts the требования
whose derived result is `passed`, and the line leads with «Прошло проверку» /
"Passed the check" instead of «Построено». The rule reads the derived record,
never the G4 row in `gates`: the row is what a phase wrote, the record is what
was checked. A state older than contract 4 has no record and never says
verified, whatever its G4 row says. The bucket words are owned by
[`vocabulary.md`](vocabulary.md) › Requirement Progress, and
`requirementProgressOf` returns the ids of each bucket, which the requirement
list's chips reuse — *Your Words, Filtered*.

### Таски: one square per таск

The figure stays accepted of cut. Below it, one small square per таск in
`tasks[]` order, in the chip palette: done, running, review, repair and failed
take their chip colours, a queued square is hollow and an off-contract one is
dashed. **Status is never colour-only.** Each square carries a title and an
`aria-label` of «<id> — <status label>», and the line beneath counts what is in
motion, failed, off-contract or retried in words. The line is hidden when none
of those is above zero. The card has no bar and no percentage: the band's bar
is the one share of the road, and a second one here was a second rendering of
the same number. The repair-attempts line stays.

### Тесты: which suite, from where

| # | State | Figure | Beside it | Line beneath, ru / en |
|---|---|---|---|---|
| T1 | no `tests`, no таск with `tests` | — | nothing | Прогон ещё не запускал тесты / The run has not run any tests yet |
| T2 | no `tests`; таски carry `tests` | passed of the таск that finished last | its failed | После таска 02 «…» / After task 02 “…” |
| T3 | `tests` set | its passed | its failed | Полный набор на приёмке / Full suite at acceptance |
| T4 | any suite with `failed > 0` | passed | «упало N», in the fail tone | as T2 or T3 |

The failed count is always shown beside a suite, «упало 0» included. `tests` is
written by acceptance alone, so when it is there it *is* the full suite. Before
that the suite is the own suite of the таск with the latest `finishedAt`, not
the last one in `tasks[]`: parallel таски finish out of plan order, and the
array tail named a таск that had not run its tests most recently. A таск with
no `finishedAt` loses to one that has it; between two without it, the later in
the list wins. A таск with no title is named by its id alone.

### Рабочее время: the median stays

The `elapsed` card is unchanged but for its Russian label: working time with
the pauses and the waits taken out, and the median таск beneath it. The median
stays rather than an average: one таск after three repairs does not inflate
it, and the card and the estimate stay on one figure.

### Where the other cards went

- **Покрытие брифа** became a line under G2 in Гейты, after the row and its
  findings, at every G2 status: «Покрытие брифа: 8 из 10 требований в
  спецификации — 80%». The ring is gone; the label stays as the line's caption.
  No line is drawn when the gates list holds no G2.
- **Долг** became the total line of Ваш ход (see *Your Move*). The label is
  retired.
- **The estimate** moved into the band with *The Header Says What Is
  Happening*.

Each card's `i` explanation moved with its number: the coverage paragraph
lives in `gates`, the debt paragraph — including that only variable names are
kept — in `handover`, in both registers and both languages.

## The Reader's Own Two Controls

Two switches in the header, and everything true of one is true of the other:

| Control | Values | Kept in | Reaches the прогон |
|---|---|---|---|
| Theme | light, dark, and *neither chosen* | the browser | never |
| Language | `ru`, `en`, and *neither chosen* | the browser | never |

**Three states apiece, and the third one is the one that matters.** Before a
reader presses anything there is no choice at all: the theme follows the screen
the page was opened on, and the language follows what the прогон decided. A
press writes a choice, and from then on the choice wins. The stylesheet owns all
three theme states — no `data-theme` attribute means the media query governs —
so no colour is ever decided in script.

**The theme is in no state field, no config key and no dial.** Two people
watching one прогон may legitimately want different ones, so a single stored
answer would be wrong for one of them. `contractVersion` does not move for it,
`state-contract.md` does not mention it, and neither does `config.json`.

**The language control changes the view and nothing else, and the header does
not explain that.** It cannot change the language the прогон speaks in: the page
reads `state.js` and has no channel back — that is the *Input* rule above,
working as intended. The page once carried a sentence beside the control saying
so, and it was removed: a paragraph of caveat sat permanently in the header for
a misreading that costs one press to discover and undo, and the reader who
pressed the button and saw only the page change has learned the whole of it.
Nothing checks for that sentence any more; the table above is where the *never*
is recorded.

## The Language It Paints In

The page carries **both** label sets and paints one of them. `state.language`
is what the прогон decided and is what a page shows on first sight; a reader's
own choice, kept in their browser, overrides it for that browser and reaches the
прогон never. Absent both, Russian — that is what a state written before the
language dial existed means, and the only reading that invents no choice.

Inside the page the two sets live under one root nested by language, and
`scripts/validate/dashboard-integrity.ts` walks that root rather than naming a
map per language. That is the point of the nesting: a language can be
incomplete, and it is then reported; it cannot be silently absent, because there
is no constant name to forget.

Every **term** the dashboard shows comes from `vocabulary.md`, in the column its
language owns. The dashboard defines no term of its own; if it needs a word that
is not there, the word is added to the vocabulary first.

The rule governs terms, not prose. A region's explanation — see below — is built
from the vocabulary's own labels and the numbers in the state, and the sentences
joining them are not terms, in the same way that «Медиана появится после двух
готовых тасков» has never been one. What may never happen is a region naming a
status, a стадия, a dial or a требование in words of its own rather than
resolving the label.

## Every Region Explains Itself

Each region above carries a small `i`. Pressing it opens **one** popover: the
page holds a single node for all of them, so moving it is what closes the
previous explanation, and no card shifts under the reader while they read about
the number on it.

An explanation is about *this* прогон rather than about dashboards in general.
It names the region, then says what the region currently holds and what that was
computed from — which median, how long a chain, how many требования are in the
denominator and why. It is built by calling the same functions the region
renders with, so an explanation cannot drift from the figure beside it. The
empty state is explained too: that is when a reader is least able to guess.

The texts live in the page's own logic block rather than in `vocabulary.md`. The
vocabulary names terms; these are sentences, and a paragraph per region there
would buy synchronisation work and nothing else.

**Each region is explained twice, once per register.** A state carrying
`explain: "plain"` gets explanations written for a reader who has never built
software; anything else gets the ones written in the vocabulary's own terms. The
plain variant is built from the same functions as the normal one, for the same
reason both are built from the region's own: an explanation that recomputed its
numbers could disagree with the figure beside it, and the plain reader is the
last person able to notice. `scripts/validate/dashboard-integrity.ts` requires
both, so a region cannot be explained in one register and left silent in the
other.

What the plain register may not say is in [`vocabulary.md`](vocabulary.md), and
so is the one exemption: a label the screen shows is not shorthand. «Гейты» and
`G1`…`G4` stay on the page in both registers, and the `i` beside that block is
the thing that teaches them — a popover forbidden from naming what the reader
just clicked on could not.

**The dials row shows the register only when the state carries one.** Every
прогон written before the field existed renders exactly as it did; absent is
not `normal`, and a chip claiming a choice nobody made is the one thing the row
must not do. The chip is named — «Объяснения: Простые» — because the depth's
own label is «Обычная» and two bare chips a word apart read as one setting
stated twice.

## Every Стадия Explains Itself Too

The eight rows of the `stages` region carry the same small `i` the regions do,
and they open the same single popover. What a row's explanation holds is two
things: what that стадия is responsible for, and where it stands in *this*
прогон — its status, its clock, the note it left, and the findings of the gate
that failed after it. The first half is the same sentence in every прогон; the
second is read from the state, and is why the `i` is on the row rather than in
the documentation.

The texts live in `STAGE_EXPLAIN` and `STAGE_EXPLAIN_PLAIN` in the page's logic
block, keyed by the стадия ids of [`phases.md`](phases.md) — the same ids the
timeline already renders from. **Both registers are required**, exactly as for a
region, and for the same reason: a стадия explained only for the reader who did
not need it is a стадия that ships mute. Every status, стадия and dial in those
sentences is resolved through the page's own label lookup rather than worded
inline, so a стадия's popover cannot say «Готово» about a row the vocabulary has
renamed. `scripts/validate/dashboard-integrity.ts` holds both maps against
`STAGE_ORDER` in both directions and calls every entry, the way it already does
for the regions.

**A стадия is not a region, and must never be added to the table above.** A
region is a block of the screen: declared in the `Key` column, marked exactly
once with `data-region` in the markup, listed in `EXPLAIN_ORDER`, and held to all
three by the checker. A стадия is a row inside the `stages` region, drawn from
state and rebuilt on every poll — it satisfies none of the three. The `stages`
region keeps its own `i` and its own text, which explains the timeline; the eight
new ones explain the стадии in it.

**The popover is opened by key, not by node.** Because the rows are rebuilt on
every successful poll, a button captured when the popover opened is a node that
has left the document seconds later. So the page remembers which стадия is open
and re-finds its button after each render through a `data-explains` attribute:
the explanation follows its row across a redraw, and closes by itself when the
row it belongs to is gone.

## Silence

The state is written at transitions and nowhere else, so a прогон is quiet for
long stretches by design. A прогон that has **stopped** is quiet in exactly the
same way, and until the two could be told apart the page went on counting over a
run nobody was driving: the стадия had no `finishedAt` to stop its clock, and a
session that died set no `interruptedAt` either.

`updatedAt` is what separates them, and this is what that field is read for. The
notice says how long ago the state was last written, and raises the line once
that exceeds the longest quiet interval the прогон has already survived. The
threshold is the run's own: a манифест that legitimately said nothing for ten
minutes has earned ten minutes, while a прогон writing at every таск has not.
A fixed number would be wrong in both directions.

Nothing is said about a finished or interrupted прогон. That silence is lawful,
and the run notice already names it.

**A прогон stopped on a question is waiting, not quiet.** While an active state
carries `awaiting`, the silence line is replaced by «Ждёт вашего ответа в чате с
2026-08-19 21:27» — the date beside the time, as every moment on the page is
printed — and it is never raised, however long the wait: the reader owes the next
move, not the run. Without the field the page cannot tell the two apart, which
is why a stop writes it before it asks. A finished or interrupted run, or an
`awaiting` whose `since` does not parse, falls back to the ordinary rule above.

The sentence names the stop, one per `awaiting.kind`
([`state-contract.md`](state-contract.md)), each ending «в чате с <moment>»:

| `kind` | ru | en |
|---|---|---|
| `answer` | Ждёт вашего ответа | Waiting for your reply |
| `briefing-round` | Ждёт ваших ответов на вопросы брифинга | Waiting for your answers to the briefing questions |
| `spec-gate` | Ждёт вашего одобрения спецификации | Waiting for your approval of the specification |
| `plan-gate` | Ждёт вашего одобрения плана | Waiting for your approval of the plan |
| `one-way-action` | Ждёт вашего разрешения на необратимое действие | Waiting for your permission for an irreversible action |
| `repair-limit` | Попытки исправления исчерпаны: ждёт вашего решения | Repair attempts are spent: waiting for your decision |

A kind the page does not know reads as `answer`. The прогон's `awaiting.note`,
when it is one non-empty line, follows the moment after « — »; anything else is
dropped rather than printed as a paragraph.

The notice is worded in the register too. Plain, it says nothing has changed for
however long; the normal wording names the write, which is a fact about the file
rather than about the project.

**The raised notice names what restarts the прогон, and the calm one does not.**
A reader told that the work may have stopped, and nothing else, is worse off than
before: they now know something is wrong and still have no move. So the alarming
wording adds the one that works — a message in the chat, which resumes the run at
the стадия the state holds. The calm notice proposes nothing, because nothing has
gone wrong yet and a suggestion there would invent a problem.

## The Numbers Are Computed, Never Stored

Every percentage, every clock and the estimate are derived from the marks the
state already carries. Nothing here is written as a duration, and the
orchestrator has no metric to calculate: it records what happened and the page
does the arithmetic. A number stored once goes stale in silence; one derived at
render time cannot.

Two of them are worth stating outright, because both are places where a page
could flatter its прогон:

- **Прогресс, the bar in the header band, weights the stages by how long they take** — разработка six,
  спецификация and ревью two, the rest one — and subdivides разработка by how
  far its таски have got. Equal weights make the bar stand still through the
  longest stage and then jump, which reads as a stuck прогон.
- **A таск's share of the road is graded by its status**, and the scale is the
  mirror of the one `Осталось` grades the remainder by: `done` 1, `review` 0.8,
  `repair` and `running` 0.5, `queued` and `failed` 0. Two figures on one screen
  must not disagree about the same таск, which is what taking the numbers from
  anywhere else would buy. Counting only `done` was worse than imprecise: `done`
  is written by the ревью phase, so the bar stood at its floor through the whole
  of разработки — hours of work, and the one stretch a user watches.
  **`running` is a flat half rather than measured against its own clock.** The
  estimate has to look at the clock; a bar does not, and making it would turn a
  pure function into one depending on the clock, the median and the pause
  arithmetic. Eighteen transitions across six таски is movement enough.
  **The bar may fall, and that is correct.** A таск sent from ревью back to
  ремонт drops from 0.8 to 0.5 because work reappeared. A bar that only ever
  rises lies once, quietly, at the moment a review fails.
- **Осталось is the median of finished таски along the remaining critical path,
  plus the review and acceptance stages still ahead, shown as a range**, and
  says *рано считать* below two finished таски rather than guessing. A precise
  wall-clock prediction is a fabrication; a range built from what already
  happened is not. Nothing in the chat may offer the user a sharper number than
  the page does. How the two stages are counted is in *Осталось Runs To
  Acceptance*.

**`N тасков параллельно` on a волна is read from the clocks, not from the size
of the wave.** A wave says what *may* run together. Claiming parallelism the
прогон did not get is the kind of flattery that makes the rest of the screen
untrustworthy.

## Осталось Runs To Acceptance

Review and acceptance come after the last таск, and on the recorded прогоны
they took about as long again as development. An estimate that ended with the
last таск went blank exactly while they ran. The range now runs to the end of
acceptance, and its caption says what it covers.

**Before a stage starts, it is a share of development.** For each recorded
прогон, the share is the stage's span divided by the build stage's span, from
the raw stamps. The bounds are the **lower and the upper quartile** of those
ratios, by index — `sorted[floor(n/4)]` and `sorted[ceil(3n/4) − 1]` — rounded
to two decimals. A mean would let one прогон whose review spanned a weekend move
the whole range; the quartiles keep the middle half.

| Stage | Low | High |
|---|---|---|
| `review` | 0.09 | 1.11 |
| `acceptance` | 0.09 | 0.39 |

The page holds these as `STAGE_SHARE`. `node scripts/metrics/shares.ts`
derives them from `scripts/metrics/fixtures/recorded-stages.ts`, which holds the
build, review and acceptance stamps of six finished прогоны and nothing else.
`shares.test.ts` holds the page to that output, and `npm run dashboard` holds
this table to the page.

| Run | Contract | Review ÷ build | Acceptance ÷ build |
|---|---|---|---|
| `maestro-tic-tac-toe-20260819` | 1 | 0.414 | 0.218 |
| `maestro-run-2026-08-19-daynight` | 1 | 0.995 | 0.389 |
| `maestro-board-sizes-2026-08-19` | 2 | 1.114 | 0.089 |
| `maestro-cube-3d-2026-08-20` | 2 | 0.074 | 0.213 |
| `maestro-run-2026-08-20` | 2 | 0.091 | 2.018 |
| `school-timetable-2026-08-21b` | 3 | 2.661 | 0.000 |

The six are every finished прогон on record, all from August 2026. Five were
written by contracts 1–3, which `readState` rejects, so only their stamps were
copied. None recorded its waits, so every span is wall time with the user's
pauses inside it, while the share multiplies a development clock with the waits
taken out (*Working Time, Not The Calendar*). `school-timetable` was stamped
after the fact: its review spans two days and its acceptance is zero-width.
That is a thin sample, which is why the range is wide. The `estimate`
explanation says so in both registers. A finished прогон is added by appending
its three stages, which `measure` prints as `review ÷ build` and
`acceptance ÷ build`, and re-running the command.

**The share multiplies the projected development:** what the build stage has
worked so far, plus the critical path still ahead. It does not multiply the
median, because review and acceptance read the whole build and not one таск.

**Once a stage starts, its own clock replaces its share.** Each bound becomes
the share minus the stage's worked clock, and never less than one minute. This
is the rule a `running` таск follows. A stage that has outrun the recorded
прогоны is still not over until the state says so. A `failed` stage is
counted on its clock, the same way.

**What each state adds:**

| # | State | Value | Caption |
|---|---|---|---|
| E1 | fewer than two finished таски | Рано считать | Нужно два готовых таска |
| E2 | таски left; review and acceptance `pending` | chain + both shares | Критический путь: N тасков в цепочке · с ревью и приёмкой |
| E3 | таски left; review `active` (alone, or beside an active build) | chain + review rest + acceptance share | same as E2 |
| E4 | review `done`; acceptance ahead | chain + acceptance part | … · с приёмкой |
| E5 | review `skipped`; acceptance ahead | chain + acceptance part | … · с приёмкой |
| E6 | a stage entry absent | that stage adds 0 | names only what was added; «· с ревью» when acceptance is the one absent |
| E7 | every таск done; a stage ahead | the stage parts only | На ревью и приёмку / На ревью / На приёмку |
| E8 | every таск done; review and acceptance `done` or `skipped`; no `finishedAt` | — | Осталось закрыть прогон |
| E9 | `finishedAt` set | — | Прогон завершён |
| E10 | acceptance `done`, G4 failed, таски back in `repair` | the repair chain only | Критический путь: … with no stage named |

English: "· with review and acceptance", "· with review", "· with acceptance",
"For review and acceptance", "For review", "For acceptance", "Only closing the
run is left".

- **An absent stage adds nothing.** The page does not invent a stage the state
  never wrote. A contract-9 state always carries all eight (`state-contract.md`).
- **Overlap is read, not rejected.** The contract allows one `active` stage,
  but the contract-2 running fixture has development and review active
  together. Each stage is read on its own status, so the overlap adds the
  review's rest beside the chain.
- **No second acceptance round is predicted.** After G4 fails, acceptance is
  `done`, its таски go back to repair, and acceptance runs again once they
  return (`7-acceptance.md`). The estimate counts the repair chain and not
  that round. Predicting it would mean predicting that the gate fails again.
- **This is not `STAGE_WEIGHT`.** The progress bar weighs review 2 and
  acceptance 1 against development 6. Those weights say how the bar creeps.
  `STAGE_SHARE` predicts minutes, and neither may be read as the other.

## Working Time, Not The Calendar

The clocks show time worked. A прогон someone left for a day must not report a
day of work, and no extra record is needed to know that: the state is full of
timestamps, and a gap between two adjacent ones longer than **45 minutes** is a
person being away rather than a build being slow. Each gap counts up to that
ceiling and no further, so an overnight pause adds 45 minutes and a two-day one
adds the same. The same subtraction applies to each таск, and therefore to the
median and to the estimate.

The calendar span is printed beside the run clock whenever the two have parted
company, and only then: a second number that always equals the first teaches the
reader to ignore the line they will one day need.

A clock belongs to the thing it is timing. A stage or a таск that recorded its
own `finishedAt` is measured between its own two stamps; only what is still
running is measured against the run clock. Timing everything against the run
clock is the cheaper implementation and it makes every finished row report the
same number, which is the whole run's elapsed time wearing a stage's label.

**Waiting for the user is not work, from contract 9.** The closed `waits` and
the open `awaiting`, which runs to the reference time, are cut out of every
span first; each piece left is then measured by the marks-and-ceiling rule
above. A wait is subtracted whole — a fifty-minute wait is fifty minutes off,
never capped at 45 — and its edges split the gap it sits in. An open wait
therefore freezes every clock until the reply is written. The stage clocks,
the таск durations, the median and the estimate all inherit the rule; the
calendar span does not, so the run's calendar line appears whenever a wait
over a minute happened. The ceiling stays for silence that was not a question.
A state below contract 9 keeps the arithmetic above, open `awaiting` included,
and the working-time explanation says a wait is not counted only where it is so.

## Lifecycle

- Copied into `.maestro/` during preflight, before the first stage begins, and
  opened for the user at that moment.
- Re-reads `state.js` on its own on a short interval. It never waits for the
  orchestrator to tell it to refresh, because the orchestrator is often busy for
  minutes at a time.
- Survives the run: after contract-4/5 `lifecycle: closed` and `finishedAt` it
  stays a readable record of what happened, with every clock stopped. Earlier
  versions remain historical and unverified.

## Failed And Interrupted Runs

- A stage with status `failed` is rendered as failed, with the failing gate's
  findings shown inline. It is never rendered as still active.
- When `interruptedAt` is set, the header says the прогон was interrupted and
  when, and every clock stops at that moment. A frozen clock with no explanation
  is the one failure mode this rule exists to prevent.
- A state file that cannot be parsed produces a plain message naming the file,
  not an empty page.
- A page that has already shown a state and then loses the file keeps showing
  it and says the clocks stopped. Reporting an unreadable state there would be
  false: one was read, and it is on the screen. The same message then says what
  to do: if the прогон is still going, ask in the chat to bring the dashboard
  back, which `--reopen` answers. A frozen page that names its cause and not
  the next step leaves its reader unable to tell waiting from acting. It names
  the chat, not an agent: «агент» is the словарь's non-term for «субагент», a
  word this page already explains.
- A таск carrying a status the contract does not define is counted in the total,
  shown with its status as written, and worth nothing on the bar. Silently
  dropping it is what let a real прогон put six таски on the screen and chips
  that summed to five: a page whose own numbers do not add up has stopped being
  a record. It is never repainted into a status the contract does define —
  guessing which one is the writer's job, and the page is the reader.
- A list item the contract declares a string and the state wrote as something
  else is shown as it was written, never as `[object Object]`. The page is the
  reader, not the writer: it cannot repair the state, and printing the name of a
  JavaScript type in place of a finding hides both the finding and the fault.

## The Only Page The Прогон Opens

The panel is raised once, in preflight, and no second page joins it. That is a
rule about the user's attention before it is a rule about the viewer: their
screen is showing a run in progress, and a page arriving on it mid-таск is read
as something going wrong — by the one person with no way to check.

**The pane costs more than attention.** Two прогоны put a second page in the pane
the panel was in — a субагент's own checks, served on a port it raised for
itself — and afterwards the panel was gone from the tab strip while the run went
on writing state nobody could see. Whether an in-app viewer keeps only one
preview session at a time is a property of that viewer and is not established
here; creating the situation is the прогон's own doing and is what stops.

**And a page opened the wrong way lies about the build.** The same file with
ninety-six assertions answers «Прошло проверок: 96» over http and «Не прошло
проверок: 96» opened over `file://` out of a worktree, because the module beside
it is unreachable from a `null` origin. That number is not noise on the user's
screen; it contradicts an отчёт about to call the build finished, and the
failure belongs to the route rather than to the code.

**Verification pages stay out of the user's viewer.** An owned temporary local
server and available headless browser may exercise a reference or integrated
build with real input and recorded evidence. Neither may take over the dashboard
pane or an unowned server. If the capability is absent, affected checks remain
unavailable and reach *What You Could Not Check* at приёмка and the отчёт.

**A moved address is announced.** The panel's server can lose its port to
another process between one state write and the next. When that happens the
tool that raised it says so above the new address, naming the dead one, and the
прогон repeats the new address in the chat once. The alternative is a user
holding a link that will never tick again, with nothing anywhere explaining it.

**Opening is the tool's, not the orchestrator's.** It was the orchestrator's
until a прогон on a desktop client printed the address, opened nothing, and the
user found the дашборд minutes later by pressing the browser icon; a step carried
only in prose is a step that is sometimes skipped, and this is the most visible
step there is. So `sync.mts` hands the address to the platform opener itself.

Four properties come with that, and each of them exists because the alternative
was observed:

- **Once per address, not once per call.** A run calls the tool dozens of times
  and must not open dozens of tabs, so the address it opened is recorded beside
  the state. An address that *moved* is opened again, because by then the tab
  the user holds is dead.
- **Nothing opens in a remote session.** `SSH_CONNECTION`, `SSH_TTY` or `CI`
  set means the path is printed instead. A window on someone else's machine
  helps nobody.
- **A host with a pane of its own says so.** `--no-open` stands the opener down
  for a прогон that will show the page in a preview panel itself. Without it that
  host gets two pages, which is the one thing this section forbids outright.
- **A refusal is one line, not a stop.** An opener that is missing or fails
  leaves the address printed and true, exactly as a server that will not start
  leaves the snapshot readable.

**And a panel that vanished comes back with one line.** `--reopen` opens the
current address again. It exists because the recovery used to be a paragraph of
prose about running the tool and opening what it prints, performed by someone
who has just been told the thing they were watching is gone.

## Constraints

- One self-contained HTML file. No CDN, no external stylesheet, no font fetch,
  no analytics — the page must render with the network off.
- No build step. It is copied, not compiled.
- Opens from `file://` in a browser, including when the project directory is on
  a path with spaces. **That is a claim about browsers and not about every
  viewer.** An in-app pane typically inlines the page instead of navigating to
  it, which leaves the document with a `null` origin, and from there the state
  file beside it is unreachable by relative `src`, absolute `file://` and
  `fetch` alike. The page therefore carries a snapshot of the state inside
  itself: the snapshot is what makes it show, and the file beside it is what
  makes the clocks move.
- The snapshot is written from the state file and never by hand, so it is equal
  to that file or older than it — never newer, and never in disagreement. A
  missed synchronisation costs a stale view, never a wrong one.
- Readable in both light and dark, since it is opened in whatever the user has.
- **It is the only page the прогон opens.** Nothing else — a project's checks
  page, a coverage report, a built page, a log — is put in front of the user by
  the orchestrator or by anything it launches. The panel is what the run owns on
  their screen, and it owns nothing else there.

## Original And Current Scope

Render the pure scope projection once in the requirements region. Original scope
uses the frozen baseline denominator; current scope uses committed requirements
excluding authorized deferrals/withdrawals. For twenty original requirements with
two deferred, show original `18/20` and current `18/18`. A relaxed target counts
toward original scope only with fresh checks declared compatible with the full
frozen expectation. Additions and splits never multiply original requirements.

Show additions, deferred, dropped, changed, and accepted-exception counts beside
those measurements. Use the same ordinary-language labels in normal/plain
registers, in both Russian and English. Missing baseline reads “not established”;
a zero denominator reads “not applicable”, never 100%. Historical v4 retains its
original conformance verdict and marks completion safeguards unestablished.

For v5, a missing fresh source audit/agreement makes G4 pending. Required journey
observations and selected control results affect coverage; a production pass
cannot mask omitted restart evidence or unavailable controls. Completed tasks or
stage clocks remain activity measures and cannot replace verified scope.

## Defects, Budget And Readiness

A contract-6 page adds three readings, each derived once from the
verification-3 record and rendered in one place:

- **Дефекты / Defects** sits beside the status word of a таск in `review`,
  `repair` or `failed`, as verified and open counts of that таск's unsuperseded
  defects. A verified defect closes no таск: a таск with one verified defect and
  residual criteria still reads «На исправлении», and defects never move the
  таски share or the Таски card's accepted count. The line under a repair bar
  quotes the first open one; see [Таск Rows Say Why](#таск-rows-say-why).
- **Попытки исправления / Repair attempts** sits on the Таски card as attempts
  used out of the current total limit, followed by the latest strategy review's
  decision when one exists.
- **Готовность к проверке / Readiness** sits in the requirements region under
  the verification results. It reads the latest unsuperseded readiness record:
  `setup_failed` when any probe failed in setup, else `unavailable` when any
  capability is missing, else passed, naming the probe kinds that did not pass.
  No record reads "not recorded".

A contract-5 or earlier page renders none of the three. The labels are the
value and screen labels in [`vocabulary.md`](vocabulary.md), in both languages.

## Why It Stopped

A прогон closed as `stopped_incomplete` must carry `stopReason`, and the page
prints it on its own line beside the closure notice, labelled «Причина
остановки». The outcome alone says that the run stopped; the reason is the only
thing that says whether the user has a move. A state without the field says
nothing more than it did — the page never composes a reason of its own.

## Who Holds It

`heldBy` is shown in exactly one place: inside the **raised** silence notice, as
the claim's token and the moment it was written — «Метка прогона: k7f2 с
2026-08-19 21:27»; the plain register says it in words, «Прогон заняла сессия
чата с меткой k7f2», without the label. It is the same token the chat names when a second chat finds the run
claimed, so the reader can match the two. The calm notice never shows it, and
neither does a finished or interrupted прогон: nothing has gone wrong there,
and a token on a calm screen invites a question nobody needs to ask.

The page claims nothing about whether the holder is alive. It cannot know, and
neither can the orchestrator — the contract records the claim, not a lease.

## Your Move

The `handover` region sits directly under the cards, above the stages and the
lists: a requirement list can run to dozens of rows, and what only the user can
settle must not wait at the bottom of it. It gathers, in this order:
empty environment variables (**names only** — S2), placeholders, open promised
work, one-way changes grouped by kind, then assumptions. A group longer than five
lines is folded and opens on a press. An empty region says so in one muted line.

The region opens with one total line — «Всего N пунктов» / "In all N items" —
drawn only when something waits. The total is `handoverOf(state).total`, the
same function the groups are drawn from, so the line and the groups cannot
disagree. It replaced the Долг card, and it counts more than the card did:
promised work and one-way changes are in it too, because they also wait on the
user. Open promised work
appears only from contract 4, where the verification record carries it. A
one-way line whose kind the contract does not define is kept in its own group,
as written — never dropped and never guessed into a known kind.

## A Feed Derived From The State

The `feed` region sits under «Ваш ход» and above «Этапы», so "what just
happened" is read before the detailed blocks. It lists events in words, newest
first, each with its age.

**Derived, not logged.** `feedOf(state)` reads `stages[]`, `tasks[]`, `gates[]`
and `verification`, and nothing else. No field is written for it, and the
contract does not change. A feed written into the state would be a second
account of the прогон beside the stamps, and the first forgotten write would
leave the two disagreeing with no way to tell which one lied. So the feed says
exactly what the stamps still say, and an event with no stamp is not shown.

| Kind | Read from | Present when | Line (ru, normal) | Line (en) |
|---|---|---|---|---|
| `stage-started` | `stages[].startedAt` | the stamp parses | Начался этап «Разработка» | Development started |
| `task-started` | `tasks[].startedAt` | the stamp parses | Таск 03 «Title» взят в работу | Task 03 "Title" started |
| `task-handed-in` | `tasks[].finishedAt`, `tasks[].tests` | the stamp parses | Таск 03 «Title» сдан на ревью · 41 тест пройден | Task 03 "Title" handed in to review · 41 tests passed |
| `repair-attempt` | `verification.repairAttempts[].at`, `.outcome`, `.taskId` | contract 4 or later, the list is an array, the stamp parses | Таск 03 «Title»: попытка исправления — `REPAIR_OUTCOME` | Task 03 "Title": repair attempt — `REPAIR_OUTCOME` |
| `gate` (G1–G3, and G4 below contract 4) | `gates[].status`; the `finishedAt` of the stage `GATE_AFTER` names | status `passed` or `failed`, and that stage has a `finishedAt` that parses | G2 · пройдена проверка спецификации | G2 · the specification check passed |
| `gate` (G4 from contract 4) | `verification.acceptanceRounds[].performedAt`, `.g4` | the round's `g4` is `passed` or `failed` | G4 · пройдена проверка готовой работы [· устарела] | G4 · the finished-work check passed [· since outdated] |

- A failed check reads «не пройдена» / "did not pass".
- With `tests.failed > 0` the hand-in line reads «· 40 тестов пройдено, 1
  упал» / "· 40 passed, 1 failed". With no `tests` it has no suffix. Russian
  counts take all three plural forms.
- In the `plain` register a check's line drops its id — «Пройдена проверка
  спецификации» — because G1–G4 are shorthand there
  ([`vocabulary.md`](vocabulary.md) › *Plain Words*). Every other line reads the
  same in both registers: each is a fact, in terms the vocabulary defines.
- A таск title comes from `tasks[]`. A repair attempt for an id `tasks[]` does
  not hold is shown by its id alone: «Таск 07: попытка исправления — …». Only an
  attempt's outcome is shown, never its hypothesis, diagnosis or action
  (`8-repair.md` › 2a), the same rule as the таск row's reason.

**The order.** Events are sorted by their moment, newest first. At one instant
the event that happens later in the run comes first. The order in which events
happen, earliest to latest, is `gate` → `repair-attempt` → `task-handed-in` →
`stage-started` → `task-started`: a check closes a stage, then the next stage
opens, then its first таск goes out. Ties within one kind go by id, descending.
`FEED_KIND_ORDER` in the page holds the five kinds in that order, and
[`vocabulary.md`](vocabulary.md) › *Feed* holds their words in the same order.

**The age** is calendar time since the stamp, not worked time, because it
answers "how long ago". Under a minute, or a stamp ahead of the reader's clock,
it is «только что» / "just now". Under a day it is «N мин назад» or «Ч ч ММ мин
назад», printed through the page's one minutes formatter. From a day on it is
the moment itself, with no "ago". A closed прогон is measured from now as well,
so its feed honestly says it was yesterday. Ages move with the clocks, every
second.

**Fifteen lines show**, and the rest fold behind one «Показать ещё N»; the open
state is remembered like every other group's. Every other group still folds at
five: `foldOf` takes the limit as an optional third argument.

**What the feed never shows, and why.** The region's `i` names four kinds of
event that leave no stamp:

- **A таск accepted by review, and a таск sent back for repair.** Review's
  verdicts (`6-review.md`) move a таск to `done` or `repair` and date nothing.
  Adding a `reviewedAt` field was considered and declined: the user's choice of
  2026-10-12 was no contract field. The hand-in, `finishedAt`, carries the test
  count instead.
- **A restart.** A retry re-sets `running`, and `startedAt` and `finishedAt`
  move. A `finishedAt` earlier than the current `startedAt` is still shown,
  because it is a true past hand-in.
- **A relay to a fresh context.** A handoff writes a count, not a stamp.

**What the stamps cannot say.** A таск sent out again shows only its latest
start and hand-in. A check carries no stamp of its own: G1–G3 take the finish
of the stage they follow, and so does G4 below contract 4. A stage's finish is
not an event of its own, because under the chain rule
([`state-contract.md`](state-contract.md)) it is the next stage's start, and
the check after the stage is dated by that same finish.

**G4 by round, from contract 4.** Every acceptance round carries its own
`performedAt` and `g4` (`7-acceptance.md`), and acceptance's stage stamps keep
their first-pass values when a failed round sends the прогон round again. So
from contract 4 G4 gives one event per settled round, at its `performedAt`,
with that round's verdict — the user's choice of 2026-10-12. A `pending` round
gives none. Below contract 4, G4 follows `GATE_AFTER` like G1–G3.

**A passed round that is no longer current says so.** A round's verdict is
history and keeps its word. But when the latest round says `passed` and
`verificationOf(state).currentRoundId` is not that round, because an input
moved after it, its line ends «· устарела» / "· since outdated": the page never
says "verified" from a stored row the derived record disagrees with. An earlier
round superseded by a later one needs no suffix, because the later round's own
event follows it.

| # | State | Feed |
|---|---|---|
| F1 | `{}`, or no stamps at all | Empty: «Пока ничего не произошло.» / "Nothing has happened yet." |
| F2 | contract 1–3, no `verification` | Stages, таски, and G1–G4 by `GATE_AFTER`; no repair attempts |
| F3 | contract 4 or later, repair attempts present | One `repair-attempt` per attempt, with its outcome label (`repaired` included for verification 1–2) |
| F4 | contract 4 or later, two acceptance rounds, failed then passed | Two G4 events at their `performedAt`; the acceptance stage's `finishedAt` is not used for G4 |
| F5 | the latest round passed but is not current | Its event ends «· устарела» |
| F6 | a check `passed` while its stage is still `active` (no `finishedAt`) | No event yet |
| F7 | a check `pending` | No event |
| F8 | build and review both `active` | Both `stage-started` events |
| F9 | a таск `running` with no `finishedAt`, or in `review` with only `startedAt` | Only `task-started` |
| F10 | a stamp that does not parse, or a malformed record | That event, or that record's events, only; the others stand |
| F11 | more than fifteen events | Fifteen shown, «Показать ещё N», the open state remembered under `group:feed` |
| F12 | a repair attempt whose `taskId` is not in `tasks[]` | «Таск 07: попытка исправления — …», with no title |

The decisions — which events, in what order, in which words, how old, how many
before the fold — are pure functions in the logic block (`feedOf`, `feedLine`,
`feedAge`, `foldOf`), each called by `scripts/validate/dashboard-logic.test.ts`,
including against both recorded fixtures.

## Таск Rows Say Why

Every row of `build` is a bar in its status colour, and every bar says its
status in a word, so no status is told by colour alone — the rule the Таски
squares already follow. Under two kinds of bar, one line says why the bar is
that colour. A wave that has not started says what it waits for.

*Open defect* below means a verification-3 defect with `status: open` whose
`parentTaskId` is the таск. *Attempt* means a repair attempt whose `taskId` is
the таск.

| # | Status | State | Bar | Word on the bar | Line under the bar |
|---|---|---|---|---|---|
| B1 | `done` | any | `--accent` | Готов / Finished | none |
| B2 | `running` | any | `--warn` | В работе / In progress | none |
| B3 | `review` | any | `--info` | На ревью, with defect counts from contract 6 | none |
| B4 | `queued` | any | dashed outline | В очереди / Queued | none |
| B5 | `repair` | contract ≥ 6, at least one open defect | `--fix` | На исправлении, with defect counts | Вернули: «the first open defect's `counterexample`» |
| B6 | `repair` | contract ≥ 6, no open defect yet | `--fix` | На исправлении, with defect counts if any | none |
| B7 | `repair` | contract ≤ 5 | `--fix` | На исправлении | none |
| B8 | `failed` | contract ≥ 4, at least one attempt | `--fail` | Упал | Последняя попытка исправления: the label of the latest attempt's `outcome` |
| B9 | `failed` | the latest attempt's outcome is outside the five | `--fail` | Упал | Последняя попытка исправления: the outcome as written |
| B10 | `failed` | no attempt, or contract ≤ 3 | `--fail` | Упал | none |
| B11 | off-contract | any | neutral | the status as written | none |

| # | Wave | Blockers outside the wave | Header |
|---|---|---|---|
| W1 | every таск `queued`, none with `startedAt` | 04 not done | Волна 4 · ждёт 04 |
| W2 | same | five not done | Волна 3 · ждёт 01, 02, 03 и ещё 2 |
| W3 | same | all done, or none | Волна 1 |
| W4 | any таск started or past `queued` | any | the header as before, with «N тасков параллельно» when the clocks say so |

**The first open defect is quoted, verbatim.** "First" is record order, which is
the order repair wrote them. A таск with several open defects loses none of
them: their count already stands beside the status word. The whole
`counterexample` is the line's text and its title; only CSS clips it to one
line on screen.

**No line before a defect exists.** Review moves a таск to `repair`, and the
defect is written later, in repair's step 1a. Between the two, and on any state
before contract 6, the bar and its word show and nothing is under them. A
finding is never used instead: findings name требования, not таски, and a
reason read off one would put another таск's reason on this row.

**The latest attempt names the outcome.** The latest is the attempt with the
greatest `at` among those of the таск; on equal `at`, the later one in the
array. Its outcome is labelled from the five values in
[`vocabulary.md`](vocabulary.md) › Value Labels: `repaired` from verification
1–2, and `defect_verified`, `still_failing`, `unavailable` and
`prerequisite_blocked`. An outcome outside them is printed as written. A failed
таск with no attempt ran out of restarts in the build, and shows no line.

**Hypotheses never reach the page.** The line names the outcome only. An
attempt's `hypothesis`, `diagnosis` and `action` are repair's working notes,
and `phases.md` and `8-repair.md` › 2a keep them from the user.

**There is no line under a review bar.** Every таск passes through review here,
so the line would say the same thing on every row.

**A wave waits for** the union of its таски's `blockedBy` ids that are outside
the wave and not `done`, once each, in numeric id order. A blocker that failed
stays on the list, because the wave does wait on it, and an id no таск carries
is listed as written. The list shows at most three ids and then «и ещё N» /
"and N more", the cap and wording of the header's in-flight line. A wave that
has started names nothing: its wait is over, and the clocks say the rest.

`taskReasonOf` and `waveWaitsOf` in the logic block compute these readings, so a
test can call them. No contract field was added: every line reads `tasks[]`
and `verification` as they already were.

## A Таск Opens

A row of `build` is a button. Pressing it shows what the state holds for that
таск and nothing it does not: files, the owned area (`zone`), the commits as
short hashes in plain text, the требования it serves, the таски it waits for,
restarts, trips to repair, passes to a fresh субагент, and its tests. A field the
state does not carry is left out rather than shown as zero. Passes to a fresh
субагент are labelled as what they are: a таск outgrew a context, which is not a
defect.

**The critical path is marked.** The таски on the longest unfinished chain carry
a marker, computed by the very walk that gives the «Критический путь» count
under «Осталось», so the number on the card and the marked rows are one chain:
the count is the length of the marked chain, never a second figure beside it.

An opened row is remembered by таск id and survives every poll, the way a folded
findings list is: a detail that snapped shut every two seconds could not be read.
The same holds for a требование row, by its id, and for every folded group of
Ваш ход and below the requirement list, by the group's name. Focus is kept the
same way: each row and toggle carries a key, and after a redraw the page hands
focus back to the node with the key that held it, so a keyboard reader is not
dropped to the top of the page every two seconds.

## A Требование Opens

Each row of `requirement-list` names one требование: its id, its planning
status, its verification result, and — from verification 2 — the user's own
words it came from, quoted from `sourceClauses` in the language they were said
in. The page never translates the quote. The state's English `title` follows the
quote on a second, muted line, and stands alone only for a state that records no
quote; it never replaces the user's words.

Pressing the row opens its chain:

| State | Shown |
|---|---|
| contract 3 or earlier | the таски that serve it; «проверка не установлена» |
| contract 4 | + each check of its current obligations with its derived result, failure cause and limitation; its open findings |
| contract 5 | + the quote |
| contract 6–7 | + its unsuperseded defects with cause and counterexample |
| record unreadable | the same sentence the run notice gives, never a partial chain |

A check's result is the one the requirement's own result is derived from —
stale when its fingerprint moved — so the chain cannot say «passed» beside a
требование the page counts as failed.

A live требование that no таск names is marked «Не покрыто тасками». That mark
takes the failure tone only while G3 has not passed; after it, the plan gate has
already ruled on it and the mark is a record.

## Your Words, Filtered

Above the rows of `requirement-list` sits a row of chips, each with its count:
«Все», «Построено», «В работе», «Отложено», and «Снято» when at least one
требование is dropped. Pressing one shows only the требования it holds.

**The chips partition the list: built + in progress + deferred + dropped =
all, on every state.** Built, in progress and deferred are the card's three
buckets (*Four Cards*, rows P2–P6), and `requirementFilterOf` reuses
`requirementProgressOf`'s ids rather than recomputing them, so the card and the
chips cannot disagree. Those three add up to live, not to the list, so dropped
is a fourth chip — the user's choice of 2026-10-12, made so that the chips add
up to the number the reader sees under «Все». The card's three chips are drawn
even at zero, because a zero there is news; «Снято» is drawn only when
something is dropped. A требование without a string id is in no chip.

**The chip says built, never verified.** The filter sorts rows by build
progress. Only the current G4 makes a требование verified, the card alone
switches its word, and each row's result column already says where a check
passed.

**The effective chip.** A stored key that is not a drawn chip reads as «Все»:
a stored «Снято» once nothing is dropped, a key from an older page, nothing
stored at all. It is read so and never written back, so the next time something
is dropped the reader's own choice returns.

**Ten rows, then the whole group.** The chosen chip shows its first ten rows in
manifest order (`REQUIREMENTS_SHOWN`), then «Показать все N» / "Show all: N",
where N is the chip's count — the size of the group the reader chose, not the
part still hidden. Opened, the press reads «Свернуть». Pressing another chip
folds the list again, so the press always counts the chip in view. There is no
search box and no sort.

**The reason, inline.** A deferred, placeholder or dropped row shows its
`reason`, trimmed, on a muted line under the user's words: «Причина: …» /
"Reason: …". There the reason says what became of the words. An `open` row's
reason at G1 is "not yet briefed", a note about the stage, so `open` and
`in-spec` rows keep theirs for the opened row. The reason is the прогон's own
text and is drawn as text, never as markup.

**The choice is a view preference.** It is kept in this browser under
`maestro.requirementFilter`, one key for every прогон, like the theme and the
language (*The Reader's Own Two Controls*). It never reaches the state, and
`contractVersion` does not move for it. Where storage throws, the choice holds
for this view only.

| # | State or action | List |
|---|---|---|
| L1 | `requirements` empty or absent | no chips; the existing «Требования ещё не записаны.» line |
| L2 | no stored filter | «Все» is pressed |
| L3 | stored `dropped`, nothing dropped | no «Снято» chip; «Все» is pressed and shown; the storage keeps `dropped` |
| L4 | stored value not in the order list | read as nothing stored, so «Все» |
| L5 | a drawn chip at zero is chosen | one muted line, «В этой группе требований нет.» |
| L6 | the chip holds ≤ 10 rows | all of them, no press |
| L7 | the chip holds > 10 rows | 10 rows, then «Показать все N»; opened, every row, then «Свернуть» |
| L8 | another chip is pressed | the list folds again, so the press counts the chip in view |
| L9 | a deferred, placeholder or dropped row with a reason | «Причина: …» under the words |
| L10 | the same row with no reason, or a blank one | no line |
| L11 | an `open` or `in-spec` row with a reason | no line |
| L12 | contract ≥ 4 and the current G4 passed | the chip still says «Построено»; rows keep their result column |
| L13 | an opened row that the chosen chip hides | it stays opened, and comes back opened when its chip is chosen again |
| L14 | storage throws | the choice holds for this view only |
| L15 | a требование with an off-contract status | in progress, shown under «Все» and «В работе» |

Heard but not taken and delivered beyond the ask keep their own folds below the
list; the filter does not touch them.

## Heard But Not Taken

Below the list, folded: every source clause classified as `context`, with its
`exclusionReason`. These are the user's words the manifest phase decided were
not requirements, and showing them is what makes «the user's words never
quietly vanish» something a reader can check.

## Delivered Beyond The Ask

Also folded below the list: `additions`, one line each, as written. Nobody asked
for them, and the page does not pass judgement on them; it only makes sure they
are not invisible.

## Node Viewer Ownership

The helper starts its own absolute copied `sync.mts --serve` entry with
`process.execPath`, detached with discarded stdout/stderr. The server binds
only `127.0.0.1` and serves the canonical run directory. Decoded request paths
and symlinks must stay inside it; `/` and `/dashboard.html` show the same page
even when an index symlink is unavailable. HTML and JavaScript use their proper
MIME types. The viewer reads state and diagnostics; it never decides closure.

`serve.json` retains pid, port and optional previousPort, adding canonical
root and a per-instance identity. A directory-bound HTTP identity and ready
listener are verified before success, reuse or owned cleanup. Ordinary startup
and reuse require no process-table command. Forgotten-process discovery uses
a platform adapter and reports its limitation when unavailable. A foreign PID
or listener is preserved; the helper never kills one to free a port. A verified
legacy server may be reused on Unix after exact command/directory validation;
no new legacy runtime is invoked. All lifecycle callers share ownership logic.

`opened.json` retains its URL semantics. Open once per address, again for a
moved address or `--reopen`. `--no-open`, MAESTRO_SYNC_NO_OPEN and SSH/CI
suppression remain supported. MAESTRO_SYNC_OPENER is parsed into argv and never
executed through interpolated shell text. An opener failure preserves the state
and address. Localized address, moved, folded and opening messages retain their
ordering; JSON actions keep these messages off stdout.
