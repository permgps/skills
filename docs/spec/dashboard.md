# Dashboard

The human view of a прогон. It is opened for the user, not described to them.

## Input

**The data it renders comes from `state.js` and nothing else.** The dashboard
never reads `manifest.md`, `spec.md`, a task file, or any path in the
repository. A view that reaches into artifacts becomes a second source of truth,
and the second one is silently wrong.

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
| `dials` | Dials | Mode, depth, доводка on/off, the register when the state names one, and any mid-run change | `mode`, `depth`, `polish`, `explain`, `dialChanges[]` |
| `progress` | Прогресс проекта | The whole road as one percentage and one bar | `stages[]`, `tasks[]` |
| `coverage` | Покрытие брифа | The share of live требования that reached the specification | `requirements[]` |
| `stage` | Этап сейчас | The stage, its position in the eight, and its own clock | `currentStage`, `stages[]` |
| `elapsed` | Прошло времени | Working time since `startedAt`, the median таск beneath it, and the calendar span when the two differ | every timestamp in the state |
| `estimate` | Осталось | The estimate as a range, and the critical path it was measured along | `tasks[]` |
| `tasks` | Таски | Finished out of cut, with what is in motion and what was retried | `tasks[]` |
| `debt` | Долг | Заглушки, допущения and переменные as one number and three | `debt` |
| `tests` | Тесты | The last full suite | `tests`, or the last таск's own |
| `requirements` | Требования (счёт) | The манифест counted by status | `requirements[]` |
| `stages` | Этапы | The eight stages in order, each with its Label, note and duration | `stages[]`, labels from `vocabulary.md` |
| `build` | Ход разработки | The таски grouped by волна, each with its status, phase and clock | `tasks[]` |
| `requirement-list` | Требования (список) | The манифест one требование at a time | `requirements[]` |
| `gates` | Gates | G1–G4 with status, findings when failed, and a folded count of them when passed | `gates[]` |

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

- **Прогресс weights the stages by how long they take** — разработка six,
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
  shown as a range**, and says *рано считать* below two finished таски rather
  than guessing. A precise wall-clock prediction is a fabrication; a range built
  from what already happened is not. Nothing in the chat may offer the user a
  sharper number than the page does.

**`N тасков параллельно` on a волна is read from the clocks, not from the size
of the wave.** A wave says what *may* run together. Claiming parallelism the
прогон did not get is the kind of flattery that makes the rest of the screen
untrustworthy.

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

## Lifecycle

- Copied into `.maestro/` during preflight, before the first stage begins, and
  opened for the user at that moment.
- Re-reads `state.js` on its own on a short interval. It never waits for the
  orchestrator to tell it to refresh, because the orchestrator is often busy for
  minutes at a time.
- Survives the run: after `finishedAt` it stays a readable record of what
  happened, with every clock stopped.

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
  false: one was read, and it is on the screen.
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

**A page that must be seen is seen once, and by arrangement.** If something
other than the panel truly has to be looked at, the orchestrator shows it —
never a субагент — in a browser window of its own rather than in the pane
holding the panel, and says in one line what it is and why. Everything else is
checked without a viewer, or written down as unchecked and carried to the
section that already exists for it: *What You Could Not Check* at приёмка, the
отчёт's assumptions elsewhere.

**A moved address is announced.** The panel's server can lose its port to
another process between one state write and the next. When that happens the
tool that raised it says so above the new address, naming the dead one, and the
прогон repeats the new address in the chat once. The alternative is a user
holding a link that will never tick again, with nothing anywhere explaining it.

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
