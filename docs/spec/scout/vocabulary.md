# Vocabulary

Scout's own words, and the words it borrows without redefining.

## The decision, and the asymmetry that forced it

**Scout carries its own vocabulary. It does not extend
[`../vocabulary.md`](../vocabulary.md).**

The two files look like they do the same job and do not. Maestro's vocabulary is
**load-bearing**: `state.js` stores stage ids and the dashboard resolves labels
from that document at render time, and `scripts/validate/dashboard-integrity.ts`
holds every plain string the page ships against its banned-synonym and plain-word
columns. A row in that file is read by a program and shipped in an asset.

Scout has no dashboard, no state, and no such validator. Its words appear in chat,
composed at run time, checked by nobody — the same situation Maestro's own
`vocabulary.md` describes for the chat and hands to `SKILL.md`.

Putting Scout's terms in that file would give one document two very different
jobs, and the visible half would be the wrong one: entries nothing reads sitting
in tables two programs parse, with no way for a reader to tell which is which.
Separate files keep the checked thing checked.

## Scout's terms

| Term | Means |
|---|---|
| сводка / sweep | One pass over sources with a single question. There are two, and they are never merged — see [`search.md`](search.md) |
| находка / finding | Something a sweep learned, with its source. Never a fact about the user (`B1`), never a требование (`B2`) |
| заявление / claim | A finding whose source is the thing it describes — a product's own marketing about itself |
| предложение / proposal | One discrete edit to the ТЗ, numbered `P##`, accepted or rejected on its own |
| план поиска / search plan | The angles a sweep will cover, one example query each, shown before it runs |
| открытый вопрос / open question | A fork the grill raised and three rounds did not close. Printed after the бриф, never inside it |

## Words borrowed and not redefined

These are Maestro's, and Scout uses them in exactly Maestro's sense. A second
definition here would be the drift this repository's one-owner rule exists to
prevent.

| Term | Owned by |
|---|---|
| бриф | [`../vocabulary.md`](../vocabulary.md) |
| требование | [`../vocabulary.md`](../vocabulary.md) |
| манифест | [`../vocabulary.md`](../vocabulary.md) |
| прогон | [`../vocabulary.md`](../vocabulary.md) |
| таск | [`../vocabulary.md`](../vocabulary.md) |

**ТЗ is the one Scout adds to that list without owning.** It is the user's word
for the document they arrived with, and Scout uses it because the user does.
Maestro never sees a ТЗ — by the time text reaches `/maestro` it is a бриф — so
the two words name the same text on either side of the paste, and neither
specification needs the other's.

## The register rule, and where it lives

Scout speaks in whichever register the user is speaking in, and has no dial for
it. There is no `plain`/`normal` setting because there is no artifact whose
wording would change: everything Scout says is chat, and everything Scout writes
is either the user's own words or a findings file for the same user.

That is not the same as saying register does not matter. It means the rule is
`skills/scout/SKILL.md`'s, exactly as Maestro's chat register is `SKILL.md`'s and
not `vocabulary.md`'s, and for the identical reason: composed at run time, read by
no checker.
