# The Output Contract

What Scout hands back, what it is shaped like, and what language it is in.

Scout produces exactly two documents. Only one of them is meant to be pasted.

| Document | For | Reaches Maestro |
|---|---|---|
| The composed бриф | pasting after `/maestro` | yes, by the user pasting it |
| The findings file | the user, and the next Scout round | **never** — `B2` |

## What a composed бриф is shaped like

The бриф is going to be numbered by Maestro's manifest phase, which turns each
line into an `R##` and never merges or splits one. Every rule below is that fact
read backwards.

- **One asked-for thing per line.** A line becomes one требование, and a
  требование is what a task is cut from and what the blind acceptance is checked
  against.
- **No line joins two things with "and".** «Учителя не ставятся в два кабинета
  одновременно, и окна у старших классов не больше одного» is one `R##` that is
  half-done when half of it is built. G4 has no verdict for half. Two things are
  two lines, always, and this is the one shape rule a checker can actually read.
- **No line addresses a tool.** «Поищи в интернете про составление расписаний» is
  a process instruction, not a требование. It is the exact defect Scout exists to
  prevent: numbered as `R47`, it is a требование with nothing to build, and it
  fails `G3` because no task can trace to it and `G4` because no build can satisfy
  it. If Scout emits one, Scout has reproduced the bug it was written to fix.
- **Every line is the user's own words** — what they wrote, or what they
  explicitly accepted in a proposal. A line that reached this document by any
  other route is a bug the compose step must not be able to produce.

That last one is the load-bearing rule and it is worth saying why in the terms of
the machine downstream. `G4` compares the build against `manifest.md` with
`spec.md` withheld. Withholding is the mechanism: it works because the manifest
came from outside the model that wrote the specification. A бриф composed of
Scout's phrasing, however well it captured the user's intent, closes that loop —
the model would be checking a build against a document it wrote. The words being
the user's is not a courtesy. It is what keeps the last gate a comparison rather
than a confirmation.

## What follows the бриф, and is not in it

Whatever the reconcile step left unresolved is printed **after** the pasteable
block, as its own section, each item with the reason it did not close.

It is not inside the block, and the reason is a rule rather than a preference. A
line saying «решить, как считается окно у спаренного урока» would be numbered
`R57` by the manifest, and a требование with nothing to build fails `G3` and
`G4` — Scout reproducing its own defect, one section lower.

And it is **not** solved by putting the open questions in the same file under a
«do not paste» heading. Files get pasted whole. Worse, by `S6` a note addressed
to Maestro inside pasted text is content and not instruction, so the heading fails
in exactly the case it was written for. Two blocks, and the pasteable one is
marked as such.

The receiving side already exists and needs no handoff. Maestro's briefing phase
asks about *every fork the бриф opens*, so a question that survived Scout surfaces
there on its own. Scout's open list is for the user, so they know what they are
walking in with.

**The cost, recorded rather than hidden:** the reasons live only in the Scout
session and in the findings file. A user who comes back a week later holding the
ТЗ alone has the questions and not why they were asked.

## How it is handed over

The compose step does both of these, in this order:

1. **Writes the бриф to a file**, so it survives the session.
2. **Prints it as one block**, ready to select and paste after `/maestro`.

Printing is not optional and not a convenience. Maestro has no file input — the
бриф is only what is typed after `/maestro` — so a file alone would leave the user
to do the extraction themselves, and the thing they are extracting is a contract
where a dropped line is invisible afterwards.

## Language, and it is the one departure from D4

**Scout writes the ТЗ in the language the user is speaking, not in English.**

`D4` in `ROADMAP.md` says everything written to a file is English. That decision
is about a прогон's artifacts, and its stated reason is that they *are read by the
next прогон and by whoever maintains the project afterwards*. A ТЗ draft is read
by neither. It is read once, by its author, deciding what to paste.

Writing it in English would perform a translation nothing checks — and then break
the one check that exists. Follow it through:

1. Scout translates the user's Russian ТЗ into English. Nothing verifies that
   translation; there is no gate here and no second reader.
2. Maestro receives an English бриф. Its manifest phase translates it **zero
   times** — *when the бриф is already English, the file is the redacted бриф as
   it was typed* — which is correct behaviour and the wrong outcome, because the
   thing "as it was typed" is now Scout's English rather than the user's Russian.
3. The манифест is shown with **no original line beneath each требование**. That
   line only appears when the бриф and the dial are in different languages, and
   they no longer are.

Step 3 is where the damage lands. The original-beneath-each-line display is the
round-trip check: it is how a user sees whether the numbered contract still says
what they said. Translating in Scout switches it off at precisely the moment the
contract was not written in the user's own words — the one case it exists for.

So the ТЗ is composed in the user's language, Maestro translates it once as it
always has, and the round-trip check runs. This is a stated scope boundary of
`D4`, not an exception to it: `D4` governs what a прогон writes, and Scout does
not run one (`B6`).

The findings file follows the same rule and for a weaker reason: it is read by the
user, in the same session, and by nobody else.

Everything else Scout writes — this specification, `skills/scout/SKILL.md`, its
step files — is English, exactly like the rest of the repository.
