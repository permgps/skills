# The Steps

Scout runs five steps in one order. The order is not a convenience: each step
exists to make the next one possible, and running one out of turn produces the
defect the whole skill was built to avoid.

## Steps

| Id | Name | Reads | Produces |
|---|---|---|---|
| `ground` | Ground in what the user gave | the user's ТЗ, however thin | the working ТЗ, and the list of what it does not say |
| `search` | Read the domain | the working ТЗ's nouns — never its specifics (`B4`) | findings, in their own file |
| `grill` | Ask the forks | findings, the working ТЗ | the user's answers |
| `reconcile` | Propose edits | answers, the working ТЗ | accepted edits, applied to the working ТЗ |
| `compose` | Hand back a бриф | the working ТЗ | a pasteable бриф, and the open questions after it |

`grill` → `reconcile` → `grill` may loop. [`reconcile.md`](reconcile.md) bounds
it at three rounds.

## Why the order is that one

**`ground` before `search`.** Searching before reading what the user wrote
produces a sweep of the domain in general rather than of the thing being asked
for, and the questions that come out of it are questions about a textbook. This
step is the one rule taken from `grill-me` that Maestro does not already have:
ground in the material before the first question.

**`search` before `grill`.** This is the whole point of the skill. A grill run
before the sweep can only ask about what is already on the page — it can ask the
user to clarify what they wrote, and it cannot ask about the thing they did not
know to write. The `interview deep` run that produced this skill's existence
asked its questions from the ТЗ alone, which is why none of them were about
подгруппы.

**`grill` before `reconcile`.** An edit proposed before the user has answered is
the model deciding and then seeking confirmation, which is a different thing from
the user deciding. Answers first, then the diff.

**`reconcile` before `compose`.** Composing from unreconciled answers means
composing from the model's reading of them.

**`reconcile` is skipped on the first pass when there was nothing to reconcile
against.** A user who arrives with no ТЗ at all has answers and no document; the
first composed version *is* the document, and round two is what reconciles
against it.

## What bounds the grill

A thin input gives the grill no natural floor. Three sentences against a whole
domain could support forty questions, and forty questions abandons the user at the
fifteenth. The bound is taken from Maestro's own briefing phase and it is not a
number:

A **fork** is a question whose two answers produce different builds. A
**preference** is a question Scout can settle itself. Only forks are asked, and
— in the briefing phase's own words — *do not manufacture a question to look
thorough; each one spends the user's attention on something you were able to
decide.*

Behind that sits a backstop, not a rule: roughly **seven to ten questions per
round**. It never drops a fork. What it does is split a long list across rounds,
so a user meets ten questions and an answer, rather than thirty and a decision to
abandon. The rounds are bounded at three by [`reconcile.md`](reconcile.md), and a
grill still holding forks at the end of round three prints them as open rather
than asking an eleventh time.

Two consequences worth stating because they are easy to get backwards:

- **The fuller the ТЗ, the fewer the questions.** A user who arrived prepared has
  already answered them. Scout must not punish preparation by asking anyway.
- **Questions arrive as one numbered block, not one at a time.** `grill-me` asks
  one at a time; Maestro's briefing asks in a block, and where the two conflict
  Maestro wins. A list is answered faster than a conversation, and the user can
  see how one answer bears on another before committing to either. Every question
  carries its candidate answers — that part `grill-me` is right about, and it is
  what makes a block answerable at all.

And the limit, stated in place per rule 3 of this specification: fork-versus-
preference is a judgement made at run time, and no validator reads a question
composed at run time. The text above is the whole of the guarantee.

## Degradation

Scout needs two things from its host, and neither is a stop condition. A missing
capability narrows what Scout does and is said out loud before the step starts —
never discovered by the user from a step that quietly produced less.

| Capability | Absent | Cost |
|---|---|---|
| `web` | Scout cannot fetch anything | The `search` step does not run. Scout says so before `grill`, grills from the working ТЗ alone, and the composed бриф carries no line that a sweep would have prompted. This is a Scout with its reason for existing removed, and the user is told that in those terms rather than left to notice |
| `subagents` | No fan-out; one source at a time | Both sweeps run serially. Scout states the cost **before starting** — the budget it is lowering to and roughly how long the sweep will take — rather than running the full budget serially and going quiet for an hour |

The second row is where the budget in [`search.md`](search.md) stops being free.
Fifty sources are cheap under fan-out and expensive in a single context, so the
serial fallback lowers the budget rather than keeping it and taking the time.

## No dial for skipping the web

Scout ships with no dial in v1, and specifically none for turning the sweep off.
This is a deliberate omission and it is recorded here so the next reader meets a
decision rather than a gap.

Two reasons. A host that cannot fetch is settled by the probe, not by a question —
the degradation table above is the answer, and a dial would ask the user to
declare something the runtime already knows. And a deliberate skip is already
available: the `search` step shows its plan before it runs, and a user who does
not want it says so there.

`D5` in `ROADMAP.md` is why this matters more than it looks. Adding a dial before
a user has asked for one is exactly what that decision exists to prevent.

**The named trigger for revisiting it:** a user who, having been shown the search
plan, skips it more than once. That is a preference the runtime cannot infer and a
dial would carry.

## Progress is said out loud

Both sweeps are multi-minute and Scout has no dashboard. The scar is on record in
Maestro's briefing phase — *a стадия whose clock ran for twenty-six minutes over
work that was never started; from outside, a run reading the codebase and a run
that has stopped look exactly the same.* Chat is the only surface Scout has, so it
is the one that has to carry it: what is running, roughly how far in, and what
came back. [`search.md`](search.md) owns what that reporting says.
