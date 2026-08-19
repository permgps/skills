# Resolving The Host

Opened in preflight, and only when the host is not Claude Code. Closed again
once the capabilities are recorded — this is a lookup, not a rule you carry.

## What To Establish

Answer these five, by observation rather than by belief about the product:

| Question | How you know |
|---|---|
| Can you hand work to a subagent with its own context? | you have a tool that does it, and it returns text |
| Can you give that subagent *only* what you chose? | the same tool takes the input; it does not inherit yours |
| Can you create a git worktree? | shell access plus a git repository |
| Can you commit? | the same |
| Can you write outside `.maestro/`? | the project code has to reach disk somehow |
| Can the user watch the прогон change? | the page is on screen **and** a stage clock moved after a state write |

If you cannot answer one of them, it is a **no** for this прогон. A capability
assumed and then missing halfway through a wave is worse than one that was never
counted on: half the таски are in worktrees nobody can merge.

## What Each Answer Costs

| Missing | What changes |
|---|---|
| subagent fan-out | every wave is one таск wide. The independent reader, the reviewer and the blind reader still run — sequentially, each in a fresh context — because they are gates, not optimisations |
| a subagent with a context you control | **stop.** G2 and G4 are withholding checks. A reader that inherits what you know confirms what you know, and nothing downstream can tell that it did |
| worktrees | every wave is one таск wide. Same consequence as no fan-out, arrived at from the other side |
| commits | the прогон runs. Say in the announcement that it cannot commit, and tell the review phase it will be reading the working tree rather than one таск's diff |
| writing project files | **stop.** There is nowhere to build |
| a page that follows the state | the прогон runs and the отчёт is unaffected. Say the view is a still picture, name the file, and stop promising a live one |

Two of those are stops and they are not negotiable. The rest narrow the wave,
which a tiny project's plan does anyway.

## Recording It

Say what you found in the announcement, in the same block as the dials, before
the first stage begins. Name the capability, name what it costs, in one line
each.

Then continue. **A degraded прогон is a прогон**, and the отчёт it produces is
measured against the same манифест by the same gates. What the announcement buys
is that nobody later mistakes a host limitation for a decision the прогон made.

## What Not To Do

- **Do not infer a capability from the host's name.** Try the thing.
- **Do not read "the page appeared" as "the dashboard works".** Those are two
  claims and only the second one is worth anything. A viewer that inlines the
  page renders it perfectly and leaves it unable to load the state beside it, so
  the failure looks like a working dashboard describing an empty прогон. The
  check is that a clock moved, not that a window opened.
- **Do not skip a reader because fan-out is missing.** Sequential is slower, not
  weaker; the withholding is what makes the reading worth anything, and that
  survives.
- **Do not widen a wave because the host might cope.** File ownership and
  `blockedBy` bound the wave; a missing capability only narrows it further.
- **Do not mark a host supported here.** That is a claim about a прогон that has
  finished on it, and it belongs in the specification, not in a run.
