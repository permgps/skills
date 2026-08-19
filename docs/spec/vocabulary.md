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
