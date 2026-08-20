# Vocabulary

One concept, one word. A second word for the same thing is how a person reads
the documentation and then finds nothing on screen that matches it.

These terms are what the user sees: in the chat, on the dashboard, and in the
final report. The documents in this directory are English; the strings below are
data being defined, and there are **two columns of them** because the прогон
speaks whichever language the user does. `Label` is Russian, `Label (en)` is
English, and [`dials.md`](dials.md) says which one a прогон is painting in.

**Neither column is generated from the other.** They are two label sets held to
one meaning, and each is held to its own list of words it may not use — the two
lists are different lists, for reasons stated where they are defined. A row with
one column filled and the other empty is a defect and is reported as one: a
half-translated screen is worse than an untranslated one, because the reader who
hits the gap cannot even guess what was meant.

## Core Terms

| Term | Term (en) | Means | Not to be called |
|---|---|---|---|
| прогон | run | The whole cycle, from the brief to acceptance | сборка, билд, сессия, запуск |
| Разработка | Development | The one stage where project code is written | сборка |
| таск | task | One unit of work, cut in the plan phase, executed by one executor | задача, тикет, issue, стори |
| бриф | brief | What the user originally asked for, in their own words | задача, ТЗ |
| требование | requirement | One numbered line of the manifest, `R##` | пункт, пожелание |
| манифест | manifest | The numbered list of requirements | список требований, чеклист |
| приёмка | acceptance | The final check of the build against the manifest | тестирование, проверка |
| доводка | polish | The optional polish rounds after acceptance | полировка, вылизывание |

The distinction that carries the most weight is **прогон** versus
**Разработка**. One word for both the whole and one of its parts breaks the
report and the dashboard at the same time: "прогон прервался" and "разработка
прервалась" must be able to mean different things.

The second is **бриф** versus **таск**. The user states a бриф; the system cuts
таски. Calling both "задача" makes it impossible to say which one a gate failed
against, so "задача" is banned outright rather than assigned to either.

## Stage Labels

Exactly one word per stage in each language. These are the only stage names the
user ever sees — the ids in `phases.md` are internal and never displayed, which
is why `Label (en)` is a separate column rather than the id capitalised.

| Stage id | Label | Label (en) |
|---|---|---|
| preflight | Подготовка | Setup |
| manifest | Требования | Requirements |
| briefing | Брифинг | Briefing |
| spec | Спецификация | Specification |
| plan | План | Plan |
| build | Разработка | Development |
| review | Ревью | Review |
| acceptance | Приёмка | Acceptance |

`build` is labelled `Development` and never `Build`. The word `build` is a
banned synonym in English for the same reason `сборка` is in Russian: it is what
half the trade calls the whole прогон, and one word for the whole and for one of
its stages breaks the отчёт and the dashboard at once.

## Value Labels

Every other word the user sees. The state stores value ids; the dashboard, the
chat and the отчёт resolve them here at render time, for the same reason stage
labels are not stored: a wording change must never require a state migration.

**Both label columns are the enforcement surface.**
`scripts/validate/spec-integrity.ts` scans every table carrying `Label` against
the Russian banned list and every table carrying `Label (en)` against the
English one, so a status accidentally called "задача" — or one called a
"ticket" — fails the build exactly like a stage would. A row that fills one
column and leaves the other empty is reported too, because a language cannot be
half-supported.

| Field | Value | Label | Label (en) |
|---|---|---|---|
| `stages[].status` | `pending` | Ожидает | Waiting |
| `stages[].status` | `active` | Идёт | Running |
| `stages[].status` | `done` | Готово | Done |
| `stages[].status` | `failed` | Сбой | Stopped |
| `stages[].status` | `skipped` | Пропущен | Skipped |
| `tasks[].status` | `queued` | В очереди | Queued |
| `tasks[].status` | `running` | В работе | In progress |
| `tasks[].status` | `review` | На ревью | In review |
| `tasks[].status` | `repair` | На исправлении | In repair |
| `tasks[].status` | `done` | Готов | Finished |
| `tasks[].status` | `failed` | Упал | Failed |
| `requirements[].status` | `open` | Открыто | Open |
| `requirements[].status` | `in-spec` | В спецификации | In the specification |
| `requirements[].status` | `deferred` | Отложено | Deferred |
| `requirements[].status` | `dropped` | Снято | Dropped |
| `requirements[].status` | `placeholder` | Заглушка | Placeholder |
| `gates[].status` | `pending` | Ожидает | Waiting |
| `gates[].status` | `passed` | Пройден | Passed |
| `gates[].status` | `failed` | Провален | Not passed |
| `mode` | `full` | Полный | Full |
| `mode` | `semi` | Полуавтомат | Semi |
| `mode` | `interview` | Интервью | Interview |
| `mode` | `manual` | Ручной | Manual |
| `depth` | `strict` | Строгая | Strict |
| `depth` | `normal` | Обычная | Normal |
| `depth` | `deep` | Глубокая | Deep |
| `polish` | `true` | Включена | On |
| `polish` | `false` | Выключена | Off |
| `explain` | `plain` | Простые | Plain |
| `explain` | `normal` | Обычные | Normal |

`Готово` and `Готов` differ because one describes a stage and the other a таск,
and Russian will not let one form serve both without reading as a mistake. They
are two labels for two fields, not a synonym pair.

`Сбой` and `Упал` are the same distinction: a stage fails on something the user
has to resolve, a таск fails after its retries are spent. One word for both would
make «сбой» mean either «прогон остановился» or «один таск из шести не вышел».

**English keeps both distinctions, and it did not have to.** Nothing in the
language forces `Done` and `Finished` apart, or `Stopped` and `Failed` — one
word would have been grammatical in each pair. They are kept apart because the
distinction is about the прогон and not about Russian: a stage that stopped is
the whole run waiting for the user, and a таск that failed is one таск of six
that spent its retries. A column that collapsed them would say, in English only,
something the Russian column is careful not to say.

`Обычная` and `Обычные` are two labels for two fields — the depth and the
register — and Russian gives them different forms because they agree with
different nouns. On screen neither is ever shown bare: the register's chip reads
«Объяснения: Простые», so the two can never be read as one setting stated twice.

## Screen Labels

The words the dashboard shows that are not the value of any field. They are
named here for the same reason the value labels are: the page must not invent a
term, and a term with two homes drifts.

| Label | Label (en) | What it names |
|---|---|---|
| Прогресс проекта | Project progress | The share of the whole прогон travelled — stages weighted by how long they take, the build subdivided by finished таски |
| Покрытие брифа | Brief coverage | The share of live требования that reached the specification. A different number from прогресс on purpose: one measures the road, the other the value |
| Этап сейчас | Current stage | The stage the прогон is in, with its own clock |
| Прошло времени | Time worked | Time the прогон has been worked on |
| Осталось | Remaining | The estimate, always a range, and only once enough таски have finished to build it from |
| Таски | Tasks | How many таски are done out of how many were cut |
| Долг | Debt | What the прогон owes the user and has not settled, counted as one number |
| Допущения | Assumptions | Decisions the прогон made for the user because nobody was asked |
| Переменные | Variables | Environment variables the build needs and nobody has filled — names only, never values |
| Тесты | Tests | The last full suite run |
| Требования | Requirements | The манифест counted by status |
| Этапы | Stages | The stage timeline |
| Ход разработки | Development progress | The таски as they are being built, grouped by волна |
| Волна | Wave | One layer of the plan — the таски that may run at the same time |
| Критический путь | Critical path | The longest remaining chain of blocked таски, which is what the estimate is measured along |
| Сейчас | Now | The таски being worked on at this moment, named in one line |
| Календарных | Calendar | Wall-clock time from the start, pauses included — shown beside Прошло времени, never instead of it |
| Объяснения | Wording | Which register the прогон is speaking in — the label that keeps `Обычные` from being read as the depth's `Обычная` |
| Гейты | Checks | The four checks of the прогон, each after its own stage |
| G1 | G1 | The gate after брифинг, shown as a row of Гейты |
| G2 | G2 | The gate after спецификация |
| G3 | G3 | The gate after план |
| G4 | G4 | The gate at приёмка |

**«Гейты» is `Checks` in English and not `Gates`, and that asymmetry is
deliberate.** The Russian label is a borrowed word that a non-programmer cannot
read, so `plain` needs the exemption below to keep it on screen at all —
decision 2, and the `i` beside the block is what teaches it. English has an
ordinary word for the thing, so it takes the ordinary word, and `gate` stays on
the English shorthand list with **no** exemption to soften it. A language that
already owns the plain word does not need to be taught the trade's one.

**The build block is «Ход разработки», never «Ход сборки».** `сборка` is banned
below, and the stage it shows is called `Разработка`, so the block is named after
the stage rather than after the activity.

`Осталось` is a range and says so. A single wall-clock number would be a
fabrication dressed as a measurement; a range built from таски that already
finished is neither.

## Plain Words

The register ([`dials.md`](dials.md)) has two values. In `normal` the terms above
are used as they stand. In `plain` two further rules hold, and they pull in
opposite directions on purpose.

**A term defined above stays.** The plain register does not rename прогон to
«процесс» or таск to «шаг». One concept, one word is the rule this document
opens with, and a register that renamed things would leave the user reading a
screen whose words appear nowhere in what they were told. What `plain` adds is
**one clause of explanation the first time a term appears**, in the same
sentence — «таск — это один кусок работы, который делает один исполнитель».
Once, and then never again in that прогон: a term re-explained every time reads
as a tool that does not remember it already said it.

**Shorthand goes.** The words below are not terms of this specification. They
are the trade's own abbreviations, and no gloss redeems them for a reader who
has never built software. In `plain` they may not appear at all — not
explained, not in brackets, not once.

| Shorthand | Say instead |
|---|---|
| G1, G2, G3, G4 | name the check in words: «проверка требований», «проверка спецификации», «проверка плана», «проверка готовой работы» |
| гейт, гейты | проверка |
| спека, спек | спецификация |
| коммит | сохранение в истории проекта |
| репозиторий | папка проекта с историей изменений |
| ворктри | отдельная копия проекта |
| слаг | короткое имя латинскими буквами |
| стейт | состояние прогона |
| валидатор | проверка |
| артефакт | файл, который делает прогон |
| деплой | публикация |
| рантайм | во время работы |
| парсинг | чтение файла |
| медиана | серединное значение |
| хендофф | передача таска свежему исполнителю |

The `Shorthand` column holds the words themselves, comma-separated where a
family shares one replacement. It is read by a checker, so a word added here
starts being enforced in the same change.

### The English List, Derived Anew

**The list below is not a translation of the one above, and translating either
into the other would produce the wrong list.** The two were derived from
different questions, and this paragraph exists so that nobody later "fixes" the
asymmetry.

«гейт», «спека», «ворктри», «слаг», «стейт» are banned above because they are
**not Russian words at all**. They are English ones written in Cyrillic, they
mean nothing to a reader who has never built software, and they are easy to
catch precisely because they look foreign on the page.

`gate`, `state`, `commit`, `repo` are banned below for the opposite reason. They
are ordinary English words a child knows, wearing a second, technical sense that
the reader will not have. Nothing looks foreign, nothing stands out, and the
sentence reads perfectly while meaning something else — which makes the English
list **harder** to enforce, not easier.

| Shorthand (en) | Say instead (en) |
|---|---|
| G1, G2, G3, G4 | name the check in words: the requirements check, the specification check, the plan check, the finished-work check |
| gate, gates | check |
| commit, commits | a saved step in the project's history |
| repo, repos, repository, repositories | the project folder with its history |
| worktree, worktrees | a separate copy of the project |
| slug, slugs | a short name in Latin letters |
| state | how far the run has got |
| validator, validators | check |
| artifact, artifacts | a file the run makes |
| deploy, deployment | publishing |
| runtime | while it is running |
| parse, parsing | reading a file |
| median | middle value |
| handoff, handoffs | passing a task to a fresh worker |

**The two lists are also matched differently, and that is not an oversight.**
The Russian list is matched as a substring, because Russian inflects: «гейта»,
«гейтом» and «гейты» all have to fail, and one entry catching all of them is why
a bare stem is enough. English does not inflect that way, and matching it as a
substring would ban the innocent word that contains the guilty one — `spec`
inside `specification`, `state` inside `statement`, `gate` inside `mitigate`. So
the English list is matched **on word boundaries**, which is why a plural that
matters is written out as its own entry above rather than left to a stem.

`spec` is absent for exactly that reason: the word it would be replaced by
contains it, so the entry could never be both enforced and satisfied. What is
banned is the abbreviation used as a noun in the chat, and the rule for that
lives in the bundle's `SKILL.md` with the rest of what nothing checks.

**A label defined above is exempt, in its exact form and nowhere else.** The
screen says «Гейты» and numbers the rows `G1`…`G4` in both registers — that is
decision 2, and it is what keeps the documentation and the screen saying one
word. The `i` beside such a block is the thing that teaches it, and a popover
forbidden from naming what the reader just clicked on cannot. So «Блок „Гейты“ —
это четыре проверки» is allowed and «после гейта» is not, in the same sentence.
The checker removes every defined label from a plain string before it looks for
shorthand, which is exactly this rule and no wider.

**The chat has no such exemption**, and the rule for it in the bundle's
`SKILL.md` is absolute: say «проверка спецификации», never `G2`. Nothing is on
screen beside a sentence in the chat, so there is nothing there for a label to
connect to.

**The boundary between the two rules is where this is easiest to get wrong.**
`Заглушка`, `Волна`, `Долг` and `Критический путь` are **labels**, defined in
the tables above. They stay on the screen in both registers, and `plain`
explains each of them once. `спека`, `коммит` and `стейт` appear in none of
those tables — they are not labels, they are shorthand, and this section
removes them.

### What Is Checked And What Is Not

`scripts/validate/dashboard-integrity.ts` reads the `Shorthand` column and holds
every plain string the dashboard ships against it. That is every plain sentence
this repository can see.

**Where a string lives decides which rule it lives under.** The normal-register
explanations are not scanned and may use the trade's words freely. The plain
explanations are read as source, because a branch never taken still ships. The
map of sentences the view composes is read as source too — and it is shared by
both registers, so **every branch of it must be safe for the plain reader**,
including the branch only `normal` reaches. Wording that genuinely has to differ
between the registers lives in a function the checker **calls** with each
register instead, which is how the silence notice and the folded findings line
are reached. A page that stops exporting one of those is reported rather than
skipped: a check silently not running and a check that passes look the same from
outside. The chat is composed at run time by the прогон itself;
no checker reads a word of it, and it is governed by the rule in the bundle's
`SKILL.md` instead.

The two guarantees are not equal. The difference is written down here rather
than left to be discovered by a user who was promised plain words and was shown
`G2`.

## Banned Synonyms

| Banned | Use instead |
|---|---|
| сборка | прогон |
| билд | прогон |
| задача | таск |
| тикет | таск |
| issue | таск |
| ТЗ | бриф |
| полировка | доводка |

A banned word may not appear in any label defined anywhere in this
specification. `scripts/validate/spec-integrity.ts` enforces this against every
`Label` column, which is why the labels above are the enforcement surface rather
than a style suggestion.

### Banned Synonyms (en)

The same question asked of English, which is why this list — unlike the two
shorthand lists — really is the Russian one asked again rather than a different
rule. Every entry is a word the trade uses for a thing that already has a name
here.

| Banned (en) | Use instead (en) |
|---|---|
| session | run |
| build | run |
| ticket | task |
| issue | task |
| job | task |
| polishing | polish |

Held against every `Label (en)` column, on word boundaries, for the reason given
under *Plain Words*: `build` must fail and `rebuilt` must not.
