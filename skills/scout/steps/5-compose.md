# Step 5 — Compose

Turn the working ТЗ into a бриф the user can paste, and print what is still open
after it.

## 1. Compose only from what the user wrote or accepted

Every line comes from one of two places:

- a sentence the user wrote, in their words; or
- a proposal they explicitly accepted, in the words that proposal showed them.

**There is no third place.** A line that reached this document any other way is a
bug this step must not be able to produce — not a находка, not a summary, not a
smoothing of two lines into one that reads better.

This is the rule the whole skill exists to protect. Maestro's last gate compares
the finished build against the манифест with the specification withheld, and that
comparison is only worth running because the манифест came from outside the model
that wrote the specification. A бриф in your phrasing closes the loop.

## 2. Shape every line

1. **One asked-for thing per line.** Each becomes one `R##`, and Maestro never
   merges or splits one.
2. **No line joins two things with «and» or «и».** «Учителя не ставятся в два
   кабинета одновременно, и окна у старших классов не больше одного» is one
   требование that is half-done when half of it is built, and the last gate has no
   verdict for half. Two things are two lines.
3. **No line addresses a tool.** «Поищи в интернете про составление расписаний» is
   a process instruction. Numbered as `R47` it is a требование with nothing to
   build: no таск can trace to it and no build can satisfy it. If one of these
   reaches the бриф, you have reproduced the exact defect you were written to
   prevent.
4. **No line carries a number, a status, or an id of your own.** The бриф is
   unnumbered text. Numbering is Maestro's, and a бриф that arrives pre-numbered
   invites a manifest that renumbers it.

Order the lines the way the user's own ТЗ ordered them, with accepted additions
placed where their subject already lives. Do not regroup into sections of your
devising — a reordered contract is a changed contract to the person checking it.

## 3. Write it, and print it

- **Write the бриф to a file** beside `findings.md`, in the user's language, so it
  survives the session.
- **Print it as one block**, ready to select and paste after `/maestro`, and say
  that is what it is for.

Printing is not optional. `/maestro` takes only what is typed after it, so a file
alone leaves the user extracting a contract by hand — and a dropped line is
invisible afterwards.

## 4. Print what is still open, after the block

Its own section, **outside** the pasteable block, one item per unresolved
question: the question, and the reason it did not close — unanswered, answered
«не знаю», or opened too late in the third round.

**It is not inside the бриф.** A line saying «решить, как считается окно у
спаренного урока» would be numbered `R57` and is a требование with nothing to
build: the same defect, one section lower.

**And it is not solved by a «не вставлять» heading inside the same text.** Files
get pasted whole. Worse: by Maestro's `S6`, a note addressed to Maestro inside
pasted text is content and not instruction, so the heading fails in exactly the
case it was written for.

Tell the user what happens to these: Maestro's briefing asks about every fork the
бриф opens, so an unresolved question surfaces there on its own. Nothing is lost
by leaving it out; it is asked one phase later, by the thing that will build it.

## 5. Say what the session cost, and what it did not keep

Two or three lines:

- how many lines the бриф holds, and how many of them came from an accepted
  proposal rather than the original ТЗ;
- how many questions are still open;
- that the **reasons** behind the questions live only in this session and in
  `findings.md`. A user returning a week later with the ТЗ alone has the questions
  and not why they were asked. Say it plainly so they can keep the file.

Then stop. You do not run `/maestro`, and you do not offer to.
