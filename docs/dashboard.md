[← Installing](install.md) · [Back to README](../README.md) · [Parity Verification →](parity-verification.md)

# The Dashboard

One self-contained HTML file, copied into `.maestro/` during preflight and
opened for the user at that moment. It reads `state.js` on its own, on a short
interval, because the orchestrator is often busy for minutes at a time and a
view that waits to be told to refresh shows a run that looks frozen.

Its run-data input is the state — carried twice: as a snapshot written into the
page, and as `state.js` beside it. The helper also publishes a validation
diagnostic for a rejected candidate; this cannot turn a rejected state into a
success. The snapshot is what lets the page show a
прогон when it is opened with no address at all, which is what an in-app pane
does to it; the file is what makes the clocks move. Whichever valid snapshot loaded last wins,
and a load that fails never replaces a state that worked. It never opens
`manifest.md`, a task file, or any path in the repository — a view that reaches into artifacts becomes a second
source of truth about a run, and the second one is silently wrong.

The title names the run: «Прогон: <slug> · <YYYY-MM-DD>», the date being the day
a contract-7 run started, read out of its `dir`. A run from before contract 7 is
titled by its slug alone. Whether the run is still in progress is shown by the
lifecycle on the page, not by the directory's `--wip` suffix.

## Verified Original And Current Scope

The requirements block shows original and current scope once each, with explicit
fractions. Two authorized deferrals out of twenty original requirements read
`18/20` original and `18/18` current. Additions, deferrals, withdrawals, changed
expectations, and accepted exceptions have separate counts. Task/stage progress
still measures activity; it does not establish delivery.

A relaxed replacement cannot confirm the original expectation without fresh
compatible checks. Missing historical baseline reads “not established”; an
empty denominator reads “not applicable”. Russian/English labels use ordinary
wording in both explanation registers.

A contract-6 run adds three readings. A таск in review, repair or failed shows
its verified and open defects beside its status word; a verified defect never
moves the таски share. The Таски card shows repair attempts used out of the
limit and the latest strategy-review decision. The requirements region shows
the readiness of the current candidate: passed, setup failed, or unavailable,
with the probe kinds that did not pass. Earlier contracts show none of them.

Contract-5 G4 remains pending without a fresh source audit/agreement, required
journey observations, or selected controls. A finished stage cannot override
this result. Contract 4 retains its previous conformance result while the new
completion safeguards remain unestablished. Explicit resume reconstructs actual
sources and independent returns before passing new gates.

## A run in flight

![The dashboard during the build stage](assets/dashboard-running.png)

The page opens with one bar: how much of the прогон is behind you. It is
weighted by how long each stage takes rather than counting stages equally, and
inside разработки it is subdivided by **how far the таски have got** — so it
creeps with the work instead of standing still for an hour and then jumping.

**Not by how many are finished, and the difference is hours long.** A таск is
marked `done` by the ревью phase, which runs after разработка, so a bar counting
only finished таски stands at its floor for the whole of the longest stage. Each
status carries its own share instead: `done` a whole one, `review` 0.8,
`repair` and `running` a half, `queued` nothing. That is the same scale
«Осталось» grades the remainder by, read from the other end, so the two numbers
cannot disagree about the same таск — and it means the bar can fall, which it
should: a таск sent from ревью back to ремонт lost work, and a bar that only
ever rises would hide exactly that.

Beneath it are eight cards. Four of them answer «где мы» — покрытие брифа, этап
сейчас, прошло времени, осталось — and four answer «что осталось закрыть» —
таски, долг, тесты, требования. Every one of those numbers is computed from the
run state at render time; none is stored.

**Осталось is a range and refuses to be sharper.** It is the median of finished
таски measured along the remaining critical path, and below two finished таски
it says *рано считать* rather than guessing.

The `Таски` card keeps the two apart on purpose: the big figure is the count of
**accepted** таски and the bar behind it runs further, in a second, muted
segment, for the work in flight. Before that, the card read «0 / 6» above a bar
filled to 38% and the words «38% готово» — three numbers about one thing, two of
them disagreeing.

The stage timeline is the run: eight stages in order, the current one marked,
each with the one-phrase note the phase left and its own duration.
Every visible word comes from `docs/spec/vocabulary.md` — the state stores ids
and the page resolves them at render time, so a wording change never requires a
state migration. Those words are Russian, because the interface is: the
screenshots show `Разработка` where this page says the build stage, and the
mapping between the two is the vocabulary file.

The build block shows what is happening now, grouped by wave. A wave is one
layer of the plan — `1 + max(wave of its blockers)`, then split so that no two
таски in a wave write the same files — and it is numbered once, when the таски
are cut. The build still launches anything whose blockers are done; what it does
not do is renumber, because rows jumping between groups read as a lost plan.

The «N тасков параллельно» on a wave is read from the clocks rather than from
the size of the wave. A layer says what *may* run together; only the timestamps
say what did.

**A таск whose status the state contract does not define is shown, not lost.**
It gets a chip of its own — «Вне контракта» — its status printed in the row as
it was written, and no share of the bar. A real прогон wrote a таск `pending`,
which is a стадия's word, and the chips then summed to five against a total of
six: a page whose own numbers disagree has stopped being a record. The page
never repaints such a таск into a status that does exist — guessing is the
writer's job, and this page is the reader.

**A таск row opens.** Press it, or focus it and press Enter, and it shows what
the state holds for that таск: the требования it serves, the таски it waits for,
its files and owned area, the commits it landed in as short hashes, restarts,
trips to repair, passes to a fresh субагент, its tests and — under contract 6 —
its defects. A field the state does not carry is left out, never shown as zero.
Passes to a fresh субагент are not a defect: the таск outgrew a context.

The таски on the **critical path** carry a ◆ beside their id. It is the same
chain the «Критический путь» count under «Осталось» is measured along, so the
number on the card is exactly the number of marked rows.

Requirement coverage is counted rather than claimed: every task carries the
requirement ids it traces to, which is what G3 checks in both directions.

**A требование row opens too.** Each row leads with the user's own words it came
from, quoted from the brief in the language they were said in (verification 2
and later), then the state's short English title if it has one. Opened, it
shows:

| Contract | What the row adds |
|---|---|
| 3 or earlier | the таски that name it; «проверка не установлена» |
| 4 | each check with its derived result, failure cause and limitation; open findings |
| 5 | the quote |
| 6–7 | live defects with their cause and counterexample |

A требование no таск names is marked «Не покрыто тасками» — in the failure
colour until the plan check passes, muted after it. Below the list, two folded
records: «Услышано, но не взято», the user's words the manifest phase kept as
context, each with its reason, and «Сверх запрошенного», what the run delivered
that nobody asked for.

An opened row stays open across the poll that redraws the page every two
seconds.

## Your move

«Ваш ход» gathers what only the user can settle, in this order:

| Group | From | Note |
|---|---|---|
| Переменные | `debt.emptyEnv` | names only — a value never reaches the state |
| Заглушки | `debt.placeholders` | prices, addresses, texts only the user has |
| Обещано доделать | open `verification.promisedWork` | contract 4 and later |
| Необратимые изменения | `oneWay`, grouped by kind | deletions, renames, migrations, major upgrades; an unknown kind is kept in its own group |
| Допущения | `debt.assumptions` | decisions made because nobody was asked |

A group longer than five lines folds the rest behind a press. The Долг card
counts the same lists through the same function, so the two cannot disagree.

## A finished run

![The dashboard after acceptance](assets/dashboard-finished.png)

After `finishedAt` the page stays a readable record with every clock stopped,
and each stage shows its own duration rather than the run's. A frozen clock with
no explanation is the one failure mode the header notice exists to prevent: an
interrupted run says it was interrupted and when.

Version 4 separates task activity from verified conformance. Requirement rows
show passed, failed, or incomplete results derived from current check executions,
coverage reviews, and findings. G4 passes only with current applicable evidence.
A closed run names its outcome as `completed`, `closed_with_exceptions`, or
`stopped_incomplete`; an accepted exception keeps the failed check visible. A
stopped run also prints the reason it wrote, on its own line labelled «Причина
остановки» — the outcome says the run stopped, only the reason says whether you
have a move. A
legacy snapshot remains readable with verification marked unestablished. An
invalid candidate displays the helper's diagnostic and cannot replace the last
coherent state.

Under `G3` in the checks block is the line a passed check shows when it left
findings behind: how many there were, and that they were acted on. It opens the
list on a press and it is not painted in the colour of failure — a check is
never passed with a finding still standing, so what is folded there is a record
of work already done, not a list of problems.

## The two switches in the header

Beside the dials are two controls that belong to whoever is reading, not to the
run: the theme and the language of the page. Each has three states — light,
dark, and *neither chosen*; `ru`, `en`, and *neither chosen* — and until a
button is pressed there is no choice at all: the theme follows the screen the
page was opened on, and the language follows what the run decided.

A press is remembered by the browser and nothing else. Neither control reaches
the run: the page reads `state.js` and has no way back, so the language button
repaints this page and cannot change the language the run speaks in. The header
does not say so — a paragraph of caveat standing there permanently cost more
than the misreading it prevented, and one press settles the question anyway.

## It is the only page the прогон opens

Nothing else lands on your screen while a run is going: not a checks page, not a
coverage report, not a log. Owned temporary servers and headless browsers may
execute bounded checks without taking over the user-visible viewer. This
viewer boundary was learned the hard way —
twice a субагент opened its own page in the pane the dashboard was in, and the
dashboard was gone from the tab strip afterwards while the run carried on
writing state nobody could see. The page it opened was misleading as well as
uninvited: loaded from a worktree over `file://`, it reported ninety-six failed
checks that were failures of the way it had been opened, not of the build.

You do not have to go looking for it either. The tool that keeps the page
current is what opens it, at the start of the run and by itself — the прогон used
to be asked to do that in prose, and a run on a desktop client printed the
address, opened nothing, and left its user to find the дашборд by pressing the
browser icon some minutes later. It opens once and then stops: a run writes
state dozens of times and none of those calls brings up another tab.

If the panel does disappear, the прогон brings it back rather than describing it
to you: it raises the page again and says the address in the chat. And if the
address has changed — another program can take the port between one write and
the next — the line above it says the old one is dead, and the new page is
opened for you, because otherwise you are left pressing a link that will never
tick again.

Two places where nothing opens, both on purpose. Over SSH or in CI the path is
printed instead: a window on a machine you are not sitting at helps nobody. And
a host that shows the page in a panel of its own tells the tool to stand down,
so you get one page rather than two.

## Viewer Runtime and Recovery

`node .maestro/sync.mts` mirrors a validated snapshot and manages a detached
Node viewer on `127.0.0.1`. Its directory, PID, port and instance identity are
verified through local HTTP before reuse or cleanup. Both `/` and
`/dashboard.html` work even without an index link. Decoded traversal and
symlinks outside the run directory are refused.

`serve.json` keeps the address across calls; a dead server may restart on its
free old port. A foreign listener is preserved, with a new address reported.
Forgotten-server recovery uses a platform process adapter when available;
unavailable discovery is reported explicitly. Unix legacy-server adoption
requires an exact directory/command match and a ready page, without launching
the old runtime. Failure to start a viewer yields the file snapshot.

Use `node .maestro/sync.mts --reopen` when the panel disappears. `--no-open` or
`MAESTRO_SYNC_NO_OPEN` suppresses browser opening, as do SSH/CI sessions. A
missing opener leaves the address available. `LOG_LEVEL=DEBUG` or
`MAESTRO_SYNC_DEBUG=1` adds stderr diagnostics; JSON actions keep stdout parseable.
See [the complete runtime layout](install.md#autonomous-runtime-layout).

## The fixtures behind these images

`docs/assets/state-running.fixture.js` and `state-finished.fixture.js` are the
two states the screenshots were rendered from. They are fixtures, not the record
of a real run — a real one belongs to the project it built and is never
committed here.

Both fixtures are contract-2 states, older than the verification record and
the dated run directory. They carry no `dir`, because a state below contract 7
that carries one is refused, so the captured title shows the slug alone rather
than «Прогон: <slug> · <YYYY-MM-DD>». The screenshots therefore show neither
the date in the title nor the blocks a contract-4+ state adds.

To reproduce a capture:

```bash
mkdir -p /tmp/shot && cp skills/maestro/assets/dashboard.html /tmp/shot/
cp docs/assets/state-finished.fixture.js /tmp/shot/state.js
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --hide-scrollbars --allow-file-access-from-files \
  --virtual-time-budget=4000 --window-size=1280,2100 \
  --screenshot=docs/assets/dashboard-finished.png file:///tmp/shot/dashboard.html
```

The clocks in a capture of the in-flight state are measured against the moment
of the capture, so re-running the command produces a different image. That is
the page working, not the fixture drifting.

## Asking what a number means

Every region carries a small `i` — the cards, the bars, the blocks, and the row
of dials in the header. Pressing it opens one popover, and there is exactly one
popover on the page: moving it is what closes the previous explanation, so
nothing shifts under you while you read about the number you are looking at.
Escape closes it, so does a click anywhere else.

**Every стадия of the timeline carries one too**, and what it holds is two
things: what that стадия is responsible for — Разработка writes the project code
against the таски, Ревью has it read back by a субагент that did not write it —
and where it stands in *this* прогон: its status, the clock its own row shows,
the note it left, and the findings of the check that failed after it. The first
half is the same in every прогон; the second is why the `i` is on the row rather
than in this page.

Those rows are rebuilt from the state every two seconds, so the popover cannot
hold on to the button it was opened from — a few seconds later that button is a
node that has left the document. It remembers which стадия is open instead and
finds the row again after each redraw. When the row is gone, the explanation
closes rather than hovering over nothing.

What it says is about **your прогон**, not about dashboards. «Осталось» does not
explain that it holds an estimate; it says the estimate is 18…31 минуты, that
the median behind it came from two finished таски, and that the chain it was
measured along is three таски long. Before there is anything to say, it explains
the empty state instead — which is when you are least able to guess. Each
explanation is built by calling the same functions the region draws itself with,
so it cannot tell you a story the number above it disagrees with.

**In which words depends on how you answered the first question of the project.**
If you chose *по-простому*, every one of the twenty-three explanations — fifteen
regions and eight стадии — is written for someone who has never built software:
«Осталось» stops saying *медиана* and says *серединное время*, the block called
«Гейты» opens with what the four checks actually are, and Ревью says a субагент
reads the work back rather than naming a role nobody introduced. The figures are identical: both versions call the same functions,
because an explanation that recomputed its own numbers could disagree with the
one beside it, and the plain reader is the last person able to notice.

The row of dials shows a fourth chip when the run recorded an answer —
«Объяснения: Простые» — and shows nothing there when it did not. A прогон from
before this question existed renders exactly as it always did; the page does not
report a choice nobody made.

The names on the screen do not change. A *таск* is a *таск* in both, «Гейты» is
«Гейты» in both, and the rows are still numbered `G1`…`G4`. Renaming them for a
beginner would leave you reading a page whose words appear nowhere in what you
were told; the `i` beside each block is what teaches the word instead.

## When the page has nothing new to say

A прогон writes its state at transitions and at no other time, so quiet
stretches are normal — the манифест can think for ten minutes and say nothing.
A прогон that has *stopped* is quiet in exactly the same way, and that is the
harder case: a stage that never closed leaves its clock running, and a session
that died sets no interruption to stop it.

So the page says how long ago the state was last written, and raises the line
once that is longer than the longest quiet stretch this run has already come
through. A raised line also says what to do about it — a message in the chat
resumes the run where it stands — because a reader who has just been told the
work may have stopped needs the move, not only the diagnosis. The threshold is
the run's own — ten minutes of silence is unremarkable in a прогон that has
already been quiet for eleven, and alarming in one that writes at every таск. A finished or interrupted прогон is not nagged about it:
that silence is accounted for, and the page already says so.

**A run stopped on your question is waiting, not stalled.** Before every stop
the orchestrator writes `awaiting`, and while it is set the silence line becomes
«Ждёт вашего ответа в чате с 21:27» — calm, and never raised however long the
wait. A state written before the field existed falls back to the ordinary rule.

The raised line also names the run's claim — «Метка прогона: k7f2 с 21:27» —
the same token a second chat quotes when it finds the run already claimed. The
page says nothing about whether that holder is alive; it cannot know.

## What is checked

`npm run dashboard` proves the page is self-contained — no CDN, no external
stylesheet, no font fetch, no network API — and that the labels, stage order and
gate map it carries still match `vocabulary.md`, `phases.md` and `gates.md`. It
also checks the words that belong to no field at all: every card and block name
the vocabulary owns has to appear on the page, because a card renamed on the
page and nowhere else is drift no value map can see. The
page holds those copies because the state stores ids; an unchecked copy drifts.

It holds the regions to `spec/dashboard.md` as well. Every region named there
must be marked once in the markup, must have somewhere to hang its `i`, and must
have an explanation that answers when called — **in both registers**, and in
both directions, so a region added to the page and forgotten in the table fails
too, and one explained only for the reader who did not need it fails as well. A
region cannot ship mute.

**The eight стадии are held to the same standard by a check of their own.** They
are not regions — a стадия is a row drawn from state, named in no table and
marked with no attribute — so the check walks `STAGE_ORDER` instead: every id
must have an explanation that answers in both registers and both languages,
every registry key must be an id the timeline actually draws, and the render
function must attach the button at all. That last one is the half a source read
would otherwise miss: the registries can be complete and the rows still ship
without an `i`, and eight explanations nobody can reach look exactly like eight
explanations from outside.

**A banned synonym now fails in either register.** Shorthand is a rule about the
plain reader — `гейт` is spared them and allowed to everyone else. A banned word
is not: «исполнитель» is a second name for something the словарь already calls a
субагент, and a user who meets both has no way to know the two are one thing. So
that list is scanned across all four maps of sentences the page ships, in both
languages, with the same label exemption and no wider. It caught two words that
had been on the page all along.

It also holds the plain explanations to the shorthand list in `vocabulary.md`:
no plain sentence the page ships may contain `гейт`, `спека`, `коммит`, `стейт`
or the rest of them. The block is read as source rather than called, because a
branch never taken still ships — and a region's empty state, the branch a
fixture is likeliest to forget, is exactly where the reader is least able to
guess. A label the screen shows is exempt in its exact form: «Гейты» is on the
page in both registers, and the popover that has to teach it cannot be forbidden
from naming it. «после гейта» in the same sentence still fails.

**Reading the block is not the whole of it.** Some plain wording lives in a
function shared by both registers rather than in the explanations — the silence
notice, and the line a passed check shows above its folded findings. Source
reading cannot see those: what is written there is a template and a branch, and
the sentence the user reads does not exist until the function runs. So the check
**calls** them, with each register and each language, and holds the answer to
the same list. The folded findings line is called at several counts as well,
because Russian takes three plural forms and any one number exercises only one
of them. A function the page stops exporting is reported rather than skipped: a
check silently not running is indistinguishable from a check that passes.

**The sentences the view composes are read too**, and this is where the rule
bites hardest. Every label, chip and one-line summary the page assembles lives
in one map per language, shared by both registers, and that map is read as
source — so *every branch of it* has to survive the plain list, including the
one the plain reader never reaches. That is why the median line says «серединное
время» rather than «медиана» in both registers, and why the folded findings line
names neither the check nor its status: `normal` is *allowed* the trade's words,
never owed them, and a sentence that has to differ by register belongs in a
called function instead.

Its DOM-free logic is exercised separately by `scripts/validate/dashboard-logic.test.ts`,
which evaluates the page's own `<script id="logic">` block in a VM rather than
reimplementing it.

The behavior this page owes the user is specified in
[`spec/dashboard.md`](spec/dashboard.md).

## See Also

- [Install](install.md)
- [Parity Verification](parity-verification.md)
