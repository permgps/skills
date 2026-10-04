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
| after приёмка | `spec.md`, the project code, `discovered-interfaces.md`, the Terms table of `interfaces.md`, the seam-level items of `reviews/standards.md`, the `noCorrectSeam:` lines of repeated repairs' diagnoses in the run state, `prior.md`, the run state | what is this project now, where are its seams, and what does it call things |

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

A seam-level item of the standards pass passes through the same test. It is a
fact about how the project is put together across таски — two seams that pass
the same clump of values, one rule implemented twice — not something a review
found and got fixed, and it enters only when the next session would otherwise
rediscover it.

A `noCorrectSeam:` line passes the same test. A place where the project offers
no seam for a regression check is a fact about how it is built, and the next
session meets it again the moment it tries to test the same thing. It is not
what a review found and got fixed, and it is written without the hypotheses
that surround it in the diagnosis.

**Writing nothing is a valid outcome.** A run that learned nothing worth keeping
is not a failed run, and a memory file padded to look thorough is worse than an
empty one: the next session reads it, finds nothing in it, and stops reading it.

After acceptance, inspect the canonical verification projection before writing
any delivery lesson. Record the actual lifecycle outcome and only lessons
supported by current evidence; accepted exceptions remain known failures and
stale/superseded executions remain historical. Do not turn a finished task or
an old green G4 into a memory claim that the product was verified.

### 2. Write the block

Pipe the block's body to the helper and name the host this session runs on —
`claude-code`, `codex` or `gemini-cli`, the host preflight resolved:

```text
node .maestro/sync.mts --memory-write --host <id>
```

The helper picks the file and splices the block between
`<!-- maestro:begin -->` and `<!-- maestro:end -->`. It never creates a second
memory file. It writes into the file that already carries the block. If there
is none, it writes into the host's own file, then into any memory file the
project already has. Only when the project has no memory file does it create
the one the host reads. `docs/spec/hosts.md` records which file that is for
each host. The JSON line names the file.

- **`loadedByHost: false`** means the block went into a file this host does
  not load at session start, because the project already had that file. Tell
  the user in one sentence, naming the file and the host. The file is theirs,
  so the choice is theirs.
- **Exit 1** means the files refused the write. One case is a block in two
  files. Another is malformed markers: two begin markers, an unclosed one, or
  an end before a begin. **Stop.** Say which files and which lines, from the
  JSON. Do not pick the pair you think was meant. The text between the other
  pair is somebody's, and a guess deletes it.
- **Exit 2** means the host or the body was unusable. An empty body is refused
  on purpose: when there is nothing to write, do not call it at all.

**You own the region between those two lines and nothing else.** Everything
above the begin marker and below the end marker belongs to the user. It is not
edited, not reformatted, not reordered, not summarised — not even where it says
something you believe is wrong, and not even where it is obviously stale.

That is not politeness. A user who finds their own paragraph rewritten once will
never again write anything there that they would mind losing, and the file stops
being worth reading in the same moment.

The block **replaces** the one before it, so start from the block `prior.md`
carried. Keep what still holds and drop only what this прогон proved wrong.
A fact an earlier прогон wrote down and this one silently left out gets
rediscovered by the next one.

**Carry the durable terms.** The Terms rows of `interfaces.md` that name
something the project keeps go into the block as `term — meaning`, so the
next прогон's plan names things the same way. Leave out the user's
original-language quote, and leave out terms that only named this прогон's
таски.

Keep the block short. It is read by whoever opens the project next, before they
have decided what they are doing, and length is what makes it skipped.

### 3. Write the decision records

`.maestro/<dir>/decisions.md`, appended, never rewritten. A later прогон reads
it before it decides anything, through its own `prior.md`. So an entry here
can make the next прогон cite a decision or contradict it in the open.

**An entry goes in only when all three hold:**

1. it is hard to reverse;
2. a reader without this прогон's context would be surprised by it;
3. there was a real alternative.

A choice that fails any one of these is either cheap to redo or obvious. If it
is cheap to redo, the next session simply redoes it. If it is obvious, it would
make the same choice again. Either way, recording it only makes the file longer
for the reader who asks why. Nothing checks this threshold mechanically,
because whether a choice would surprise a reader is a judgement. Apply it here,
where the judgement is made.

Each entry has three parts:

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

**The memory file has a block from another tool.** Markers that are not yours are
somebody else's owned region. Leave them, and add yours as its own block.

**The fact worth remembering is a credential.** It does not go in — not the
value, not a hint at the value. The variable name is the whole of what survives,
and `S2` decides the rest.

**A таск discovered something that contradicts `spec.md`.** That is not memory.
It is an amendment, and it belongs to the repair phase; record it there and come
back here only for what the project keeps afterwards.

**The project already has a memory file from an earlier прогон.** Replace the
block, starting from what `prior.md` carried of it (step 2). Two blocks would
leave the next session to decide which one is current. The helper refuses to
write while two exist.

## Gates

None, in either run.

There is no question about the user's words for this phase to answer — it
records what the прогон learned, and a run that recorded nothing learned
nothing worth keeping rather than failing at something.

## Output Of This Phase

| Artifact | State |
|---|---|
| the memory file the helper resolved | the owned block replaced or appended; everything outside it byte for byte as it was |
| `.maestro/<dir>/decisions.md` | one appended entry per decision, each naming the `D##` or `R##` it came from |
| project code | unchanged — this phase writes none of it |

## Scope Progress Projection

Entry: frozen source agreement and current verification graph.
1. Derive original/current ScopeProgress from the same state as G4; do not count
   task/stage activity. Original denominator includes later exclusions.
2. Original numerator needs full frozen expectations with fresh evidence on
   this candidate. Unchanged conditions may reuse complete current checks;
   changed/split conditions require explicit original-compatible checks and
   complete coverage. Easier replacement, exclusion, split IDs or exceptions
   cannot inflate it. Current numerator counts fully passing live R IDs only.
3. Report each ratio once: e.g. original 18/20, current 18/18, two authorized
   deferrals. List added/deferred/dropped/changed R IDs and exception decisions
   separately. Missing baseline means not-established; empty scope means
   not-applicable, never 100%.
4. Current authorized target may close while original scope remains incomplete;
   preserve this distinction in report and memory. A historical v4 outcome stays
   meaningful while its new source/coverage safeguards remain unestablished.
Valid: 18/20 beside 18/18 and quoted decisions. Invalid: rewrite original total
into 18, count commits as proof, or turn accepted defects into passed R IDs.
Output: projection, not an independently editable scope verdict.
