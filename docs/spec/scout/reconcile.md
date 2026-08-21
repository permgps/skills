# The Reconcile Step

After the answers are in, Scout compares them against the ТЗ as it currently
stands and proposes **discrete edits** — never a rewritten document.

This is the step that keeps the words the user's own, which is why it has a
document rather than a paragraph. Everything else Scout does could be done badly
and produce a worse бриф; this step done badly produces a бриф that is no longer
the user's, and [`output.md`](output.md) explains what that costs at the far end
of the pipeline.

## Discrete edits, and why never a rewrite

A rewritten ТЗ is unreviewable. The user is handed a document that reads better
than the one they wrote, and the only way to check it is to diff it themselves
against something they no longer have in front of them. In practice they accept
it, and in practice something they said is gone.

So the step emits proposals, individually numbered `P##`, and the ТЗ changes only
by applying accepted ones.

## Proposal kinds

| Kind | Shows | May be forced by |
|---|---|---|
| `add` | the new line, in the user's words from their answer | an answer that named something the ТЗ does not say |
| `fix` | before **and** after, both in full | an answer that changed what an existing line means |
| `remove` | the line to be dropped, in full | **only** a contradiction with something else the user wrote |

Three kinds and no fourth. Anything larger than a `fix` is an `add` plus a
`remove`, so that nothing changes invisibly inside a line: a `fix` that quietly
also dropped a clause looks, in the before-and-after, exactly like a `fix`.

## Every proposal names what forced it

**A proposal with no named source is not shown.** The source is one of two things
and nothing else:

- the user's own answer, quoted; or
- a contradiction between two things the user wrote, both quoted.

This mirrors Maestro's amendment rule, where a `D##` row names the demonstrated
fact behind a specification change. The reason is the same: an edit whose cause is
not written down is an edit nobody can argue with, because there is nothing to
argue against.

What is **not** a source, ever: a finding. `B2` in [`boundary.md`](boundary.md)
owns that rule. A sweep discovering that twenty products do something is not a
reason to change this user's ТЗ; it is a reason to ask them, and their answer is
the source.

## `remove` is the narrow one, deliberately

A `remove` may cite a contradiction with something else the user wrote. That is
the entire list.

Scout never proposes dropping a requirement because the domain suggests it is
unwise, unusual, expensive, or hard. That is the model deciding scope, forbidden
by `B5`, and the asymmetry behind `B5` is what makes the narrowness necessary: an
addition shows up in the манифест afterwards and can be objected to, a removal
shows up nowhere at all.

## A domain objection is a question, never a `remove`

When the reconnaissance shows that something the user asked for is impossible,
unusual, or in tension with itself, Scout does not propose removing it. It states
the finding with its source and asks which way to go, **in the next round**. The
user's answer then becomes the edit.

This is the compromise that keeps the most valuable thing reconnaissance buys —
telling the user something they did not know — without letting it arrive as a
pre-worded proposal the user only has to click. The difference between «I propose
removing this, here is why» and «this appears to conflict with X, which way do you
want it» is the difference between the model deciding and the user deciding, and
the second one is the only one that survives `G4`.

## Nothing is applied without an explicit answer

Each proposal is accepted or rejected on its own. **Silence is not acceptance.**

A bulk «yes to all» is allowed and must still **print what it accepted**, line by
line, after accepting it — otherwise the user has agreed to a list they did not
read, which is the rewritten-document problem wearing a different hat.

**Rejections are recorded with the user's reason.** A later round does not raise a
proposal that was already refused; without the record it will, because the
condition that produced it is still true.

## The step is bounded at three rounds

Accepted edits open new questions: an added line has forks of its own. The loop
`grill` → `reconcile` → `grill` therefore runs **at most three rounds** — the same
bound доводка carries in Maestro — and then reports what is still open rather than
continuing.

Three is not a discovered number. It is the same one used elsewhere in this
repository for the same reason: a loop that can always find one more thing needs a
stop that is not «when it feels done».

## What is still open never enters the composed бриф

An unresolved question is printed after the pasteable block, with the reason it did
not close, and it is not a line of the бриф. [`output.md`](output.md) owns the
shape of that and the reason — briefly, a line saying «decide how a window is
counted for a paired lesson» becomes an `R##` with nothing to build, and fails
`G3` and `G4`.

## The limit of all of this

Every rule above is judgement exercised at run time. Whether a stated source
really is a contradiction, whether an objection is a domain objection or a
disguised scope decision, whether a `fix` quietly dropped a clause — no validator
reads a proposal composed during a session.

Two of these do get a checker, and only two, because they are the ones with a
readable shape: a proposal with no named source at all, and a `remove` whose
stated source is not a contradiction with another line the user wrote. Both are
covered by the bundle's tests. Everything else in this document is held by the
text and nothing more.
