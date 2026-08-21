# Step 4 — Reconcile

Compare the answers against the ТЗ as it stands, and propose **discrete edits**.
Never a rewritten document.

A rewritten ТЗ is unreviewable. The user is handed something that reads better
than what they wrote, and the only way to check it is to diff it themselves
against a version they no longer have in front of them. In practice they accept
it, and in practice something they said is gone.

## 1. Three kinds, and no fourth

| Kind | Show | May be forced by |
|---|---|---|
| `add` | the new line, in the user's words from their answer | an answer that named something the ТЗ does not say |
| `fix` | before **and** after, both in full | an answer that changed what an existing line means |
| `remove` | the line to be dropped, in full | **only** a contradiction with something else the user wrote |

Anything larger than a `fix` is an `add` plus a `remove`. This is what keeps a
change from happening invisibly: a `fix` that quietly also dropped a clause looks,
in the before-and-after, exactly like a `fix`.

Number every proposal `P##`.

## 2. Every proposal names what forced it

**A proposal with no named source is not shown.** The source is one of exactly two
things:

- the user's own answer, quoted, with its `Q##`; or
- a contradiction between two things the user wrote, both quoted.

What is never a source: a находка. A sweep discovering that twenty products do
something is a reason to ask, not a reason to edit — and if it was worth asking,
it was asked in the previous step and the **answer** is the source.

## 3. `remove` is the narrow one, deliberately

A `remove` may cite a contradiction with something else the user wrote. That is
the whole list.

Never propose dropping something because the domain suggests it is unwise,
unusual, expensive, or hard. That is deciding scope, and `B5` forbids it. The
asymmetry is the reason: an addition shows up in the манифест afterwards and can
be objected to; a removal shows up nowhere at all.

When the reconnaissance shows a real problem with something they asked for, that
is the most valuable thing you produce — and it goes back as a **question in the
next round**, with its source. «This appears to conflict with X, which way do you
want it» is the user deciding. «I propose removing this, here is why» is you
deciding and asking them to click.

## 4. Nothing is applied without an explicit answer

- Each proposal is accepted or rejected **on its own**.
- **Silence is not acceptance.**
- A bulk «yes to all» is allowed and must still **print what it accepted**, line by
  line, after accepting it. Otherwise they have agreed to a list they did not
  read, which is the rewritten-document problem wearing a different hat.
- **Record every rejection with the user's reason.** A later round must not raise
  a proposal that was already refused — without the record it will, because the
  condition that produced it is still true.

Apply the accepted ones to the working ТЗ. Nothing else changes.

## 5. Three rounds, then stop

Accepted edits open new questions: an added line has forks of its own. The loop
grill → reconcile → grill runs **at most three rounds**, and then reports what is
still open rather than continuing.

Three is not a discovered number. It is a stop that is not «when it feels done».

Then read the grill step file for the next round, or — after the third round, or
when nothing new opened — the compose step file.
