# Phase 9 — Memory

Read twice, and never as part of the sequence: once during Разработка, when a
таск comes back having found something the rest of the project will keep running
into, and once after приёмка, when the code exists and can be described.

The прогон ends. What it worked out does not have to. This phase is the only
thing standing between a finished project and a next session that starts by
rediscovering why a boundary is where it is.

No mode and no depth changes this phase. What was learned is what was learned,
and nobody is asked about it.

## What You Are Given

| Run | Read | The question it answers |
|---|---|---|
| during Разработка | `discovered-interfaces.md`, the таск that returned, the run state | what did this таск run into that the next person will too |
| after приёмка | `spec.md`, the project code, `discovered-interfaces.md`, the run state | what is this project now, and where are its seams |

You do not read `brief.md`, `manifest.md` or `report.md` here. Those say what was
asked and what was delivered; this phase records what was **learned**, and the
two are different files for the same reason приёмка and ревью are different
phases.

## Steps

### 1. Decide whether there is anything to write

A fact belongs here when the next session would otherwise rediscover it, and
rediscovering it would cost more than reading it.

Two things do not belong, and they are the two that fill a memory file with
noise:

- **Anything the code already says** — the module list, the framework, the name
  of the entry point. The next session reads those faster than it can trust a
  copy, and the copy is wrong the first time somebody renames something.
- **Anything true only for this прогон** — which таск ran in which wave, what a
  review found and got fixed, how long a stage took. The отчёт and the run state
  hold that already.

**Writing nothing is a valid outcome.** A run that learned nothing worth keeping
is not a failed run, and a memory file padded to look thorough is worse than an
empty one: the next session reads it, finds nothing in it, and stops reading it.

### 2. Write the block

`AGENTS.md` in the project root, between `<!-- maestro:begin -->` and
`<!-- maestro:end -->`.

**You own the region between those two lines and nothing else.** Everything
above the begin marker and below the end marker belongs to the user. It is not
edited, not reformatted, not reordered, not summarised — not even where it says
something you believe is wrong, and not even where it is obviously stale.

That is not politeness. A user who finds their own paragraph rewritten once will
never again write anything there that they would mind losing, and the file stops
being worth reading in the same moment.

- The file does not exist → create it containing the block and nothing else.
- The file exists without the markers → append the block, leave everything else
  exactly as it was.
- The file exists with the markers → replace what is between them.
- The markers are malformed — two begin markers, an unclosed one, an end before
  a begin — **stop.** Say which lines. Do not pick the pair you think was meant;
  the text between the other pair is somebody's, and a guess deletes it.

Keep the block short. It is read by whoever opens the project next, before they
have decided what they are doing, and length is what makes it skipped.

### 3. Write the decision records

`.maestro/<slug>/decisions.md`, appended, never rewritten. One entry per
decision that should outlive the прогон:

- what was decided,
- what it was decided **instead of**,
- and what made the difference.

The middle line is the one worth the file. A decision recorded without its
alternative reads as the only thing anybody could have done, and the next
session re-opens it from scratch.

**An entry carries no id of its own.** It names the `D##` or the `R##` it came
from, and the date. The two writes are for two readers: the block is for
whoever opens the project, and is short; `decisions.md` is for somebody asking
why, and is as long as the reasoning was.

### 4. Redact before writing, not after

`S2` applies here at full strength. The memory file is committed and read by
every later session, so a credential landing in it is the worst version of the
same violation, not a milder one. Redaction runs over what you are about to
write, exactly as it ran over the бриф.

## When It Does Not Go That Way

**`AGENTS.md` has a block from another tool.** Markers that are not yours are
somebody else's owned region. Leave them, and add yours as its own block.

**The fact worth remembering is a credential.** It does not go in — not the
value, not a hint at the value. The variable name is the whole of what survives,
and `S2` decides the rest.

**A таск discovered something that contradicts `spec.md`.** That is not memory.
It is an amendment, and it belongs to the repair phase; record it there and come
back here only for what the project keeps afterwards.

**The project already has a memory file from an earlier прогон.** Replace the
block. Its previous contents were written by a run that is over, and two blocks
would leave the next session to decide which one is current.

## Gates

None, in either run.

There is no question about the user's words for this phase to answer — it
records what the прогон learned, and a run that recorded nothing learned
nothing worth keeping rather than failing at something.

## Output Of This Phase

| Artifact | State |
|---|---|
| `AGENTS.md` | the owned block replaced or appended; everything outside it byte for byte as it was |
| `.maestro/<slug>/decisions.md` | one appended entry per decision, each naming the `D##` or `R##` it came from |
| project code | unchanged — this phase writes none of it |
