# Vocabulary

One concept, one word. A second word for the same thing is how a person reads
the documentation and then finds nothing on screen that matches it.

These terms are what the user sees: in the chat, on the dashboard, and in the
final report. The documents in this directory are English; the strings below are
data being defined, and they are Russian because the user is.

## Core Terms

| Term | Means | Not to be called |
|---|---|---|
| прогон | The whole cycle, from the brief to acceptance | сборка, билд, сессия, запуск |
| Разработка | The one stage where project code is written | сборка |
| таск | One unit of work, cut in the plan phase, executed by one executor | задача, тикет, issue, стори |
| бриф | What the user originally asked for, in their own words | задача, ТЗ |
| требование | One numbered line of the manifest, `R##` | пункт, пожелание |
| манифест | The numbered list of requirements | список требований, чеклист |
| приёмка | The final check of the build against the manifest | тестирование, проверка |
| доводка | The optional polish rounds after acceptance | полировка, вылизывание |

The distinction that carries the most weight is **прогон** versus
**Разработка**. One word for both the whole and one of its parts breaks the
report and the dashboard at the same time: "прогон прервался" and "разработка
прервалась" must be able to mean different things.

The second is **бриф** versus **таск**. The user states a бриф; the system cuts
таски. Calling both "задача" makes it impossible to say which one a gate failed
against, so "задача" is banned outright rather than assigned to either.

## Stage Labels

Exactly one Russian word per stage. These are the only stage names the user ever
sees — the English ids in `phases.md` are internal and never displayed.

| Stage id | Label |
|---|---|
| preflight | Подготовка |
| manifest | Требования |
| briefing | Брифинг |
| spec | Спецификация |
| plan | План |
| build | Разработка |
| review | Ревью |
| acceptance | Приёмка |

## Value Labels

Every other word the user sees. The state stores value ids; the dashboard, the
chat and the отчёт resolve them here at render time, for the same reason stage
labels are not stored: a wording change must never require a state migration.

The `Label` column is the enforcement surface. `scripts/validate/spec-integrity.ts`
scans every table with that column for banned synonyms, so a status accidentally
called "задача" fails the build exactly like a stage would.

| Field | Value | Label |
|---|---|---|
| `stages[].status` | `pending` | Ожидает |
| `stages[].status` | `active` | Идёт |
| `stages[].status` | `done` | Готово |
| `stages[].status` | `failed` | Сбой |
| `stages[].status` | `skipped` | Пропущен |
| `tasks[].status` | `queued` | В очереди |
| `tasks[].status` | `running` | В работе |
| `tasks[].status` | `review` | На ревью |
| `tasks[].status` | `repair` | На исправлении |
| `tasks[].status` | `done` | Готов |
| `tasks[].status` | `failed` | Упал |
| `requirements[].status` | `open` | Открыто |
| `requirements[].status` | `in-spec` | В спецификации |
| `requirements[].status` | `deferred` | Отложено |
| `requirements[].status` | `dropped` | Снято |
| `requirements[].status` | `placeholder` | Заглушка |
| `gates[].status` | `pending` | Ожидает |
| `gates[].status` | `passed` | Пройден |
| `gates[].status` | `failed` | Провален |
| `mode` | `full` | Полный |
| `mode` | `semi` | Полуавтомат |
| `mode` | `interview` | Интервью |
| `mode` | `manual` | Ручной |
| `depth` | `strict` | Строгая |
| `depth` | `normal` | Обычная |
| `depth` | `deep` | Глубокая |
| `polish` | `true` | Включена |
| `polish` | `false` | Выключена |

`Готово` and `Готов` differ because one describes a stage and the other a таск,
and Russian will not let one form serve both without reading as a mistake. They
are two labels for two fields, not a synonym pair.

`Сбой` and `Упал` are the same distinction: a stage fails on something the user
has to resolve, a таск fails after its retries are spent. One word for both would
make «сбой» mean either «прогон остановился» or «один таск из шести не вышел».

## Screen Labels

The words the dashboard shows that are not the value of any field. They are
named here for the same reason the value labels are: the page must not invent a
term, and a term with two homes drifts.

| Label | What it names |
|---|---|
| Прогресс проекта | The share of the whole прогон travelled — stages weighted by how long they take, the build subdivided by finished таски |
| Покрытие брифа | The share of live требования that reached the specification. A different number from прогресс on purpose: one measures the road, the other the value |
| Этап сейчас | The stage the прогон is in, with its own clock |
| Прошло времени | Time the прогон has been worked on |
| Осталось | The estimate, always a range, and only once enough таски have finished to build it from |
| Таски | How many таски are done out of how many were cut |
| Долг | What the прогон owes the user and has not settled, counted as one number |
| Допущения | Decisions the прогон made for the user because nobody was asked |
| Переменные | Environment variables the build needs and nobody has filled — names only, never values |
| Тесты | The last full suite run |
| Требования | The манифест counted by status |
| Этапы | The stage timeline |
| Ход разработки | The таски as they are being built, grouped by волна |
| Волна | One layer of the plan — the таски that may run at the same time |
| Критический путь | The longest remaining chain of blocked таски, which is what the estimate is measured along |
| Сейчас | The таски being worked on at this moment, named in one line |
| Календарных | Wall-clock time from the start, pauses included — shown beside Прошло времени, never instead of it |

**The build block is «Ход разработки», never «Ход сборки».** `сборка` is banned
below, and the stage it shows is called `Разработка`, so the block is named after
the stage rather than after the activity.

`Осталось` is a range and says so. A single wall-clock number would be a
fabrication dressed as a measurement; a range built from таски that already
finished is neither.

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
