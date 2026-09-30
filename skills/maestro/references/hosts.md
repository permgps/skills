# Resolving The Host

Opened in preflight, and only when the host is not Claude Code. Closed again
once the capabilities are recorded — this is a lookup, not a rule you carry.

Three of the questions below are asked on **every** host, this one included, and
preflight asks them there: subagent fan-out, worktrees and commits. What this
file adds for another host is the rest of the list and what each answer costs.

## Codex CLI And App

When the actual session exposes Codex native delegation, open
[`codex.md`](codex.md) for preflight and every independent dispatch.
This explicitly requests the native independent roles; the recipe is
coordinator-only and never travels to blind readers.

## What To Establish

Answer these capabilities by observation rather than by belief about the product:

| Question | How you know |
|---|---|
| Can you hand work to a subagent with its own context? | you have a tool that does it, and it returns text |
| Can you give that subagent *only* what you chose? | the same tool takes the input; it does not inherit yours |
| Can you create a git worktree? | shell access plus a git repository |
| Can you commit? | the same |
| Can you write outside `.maestro/`? | the project code has to reach disk somehow |
| Can the user watch the прогон change? | the page renders **and** a stage clock moved after a state write — the two halves you can check yourself. `sync.py` opens it and reports what it did; a host where the opener refuses is a host where the answer is no |
| Can a task execute browser checks? | an existing browser/tool loads the integrated local app, sends real pointer/keyboard input, inspects visible geometry, and captures evidence without taking over the user's dashboard pane |

If you cannot answer one of them, it is a **no** for this прогон. A capability
assumed and then missing halfway through a wave is worse than one that was never
counted on: half the таски are in worktrees nobody can merge.

## What Each Answer Costs

The `Capability` column names the row in `docs/spec/hosts.md` this one is the
runtime half of, so the two cannot drift apart unnoticed; `—` marks a cost the
specification's capability table does not carry. A row that stops the прогон
says so in its first word.

| Missing | Capability | What changes |
|---|---|---|
| subagent fan-out | subagent fan-out | every wave is one таск wide. The independent reader, the reviewer and the blind reader still run — sequentially, each in a fresh context — because they are gates, not optimisations |
| a subagent with a context you control | context isolation | **stop.** G2 and G4 are withholding checks. A reader that inherits what you know confirms what you know, and nothing downstream can tell that it did |
| worktrees | worktree isolation | every wave is one таск wide. Same consequence as no fan-out, arrived at from the other side |
| commits | version control | the прогон runs. Say in the announcement that it cannot commit, and tell the review phase it will be reading the working tree rather than one таск's diff |
| writing project files | file writes | **stop.** There is nowhere to build |
| a page that follows the state | — | the прогон runs and the отчёт is unaffected. Say the view is a still picture, name the file, and stop promising a live one |
| browser execution for a required UI check | browser verification | record the tool limitation; the affected check is unavailable and its obligation remains incomplete. Continue unrelated checks without installing a browser or manufacturing a pass |

Two of those are stops and they are not negotiable. The rest narrow the wave,
which a tiny project's plan does anyway.

## Recording It

Say what you found in the announcement, in the same block as the dials, before
the first stage begins. Name the capability, name what it costs, in one line
each.

Then continue. **A degraded прогон is a прогон**, and the отчёт it produces is
measured against the same манифест by the same gates. What the announcement buys
is that nobody later mistakes a host limitation for a decision the прогон made.

For independent audits, preserve the actual dispatch, child-context and return
identities exposed by the tool. A canonical child name is acceptable when the
host really uses it for those events; UUID syntax is not required. Record the
format limit and never substitute an invented label. Keep model configuration,
observed model identity, exact input visibility and filesystem-read visibility
separate. A child's self-report does not establish an unseen host observation.

## What Not To Do

- **Do not infer a capability from the host's name.** Try the thing.
- **Do not read "the page appeared" as "the dashboard works".** Those are two
  claims and only the second one is worth anything. A viewer that inlines the
  page renders it perfectly and leaves it unable to load the state beside it, so
  the failure looks like a working dashboard describing an empty прогон. The
  check is that a clock moved, not that a window opened.
- **Do not read "the dashboard works" as "the user can see it".** The same
  mistake with the two claims swapped. There, a window that opened proved
  nothing about the state; here, a state that ticks proves nothing about the
  window. A client may present a panel as a folded row in the chat, and a
  detached opener reports nothing at all about what appeared. Name the address,
  and say the row opens with a press — `sync.py` prints both lines for you, and
  relaying them is the whole of what you can do about this from here.
- **Do not open a second page where the panel is.** The pane is the panel's for
  the rest of the прогон. Twice now a page opened beside it — a subagent's own
  checks, served on a port it chose — and afterwards the panel was gone from the
  strip; whether the viewer keeps only one preview is its business, and creating
  the situation is ours. If something truly has to be seen, the orchestrator
  shows it in a window of its own, never in this pane, and never over `file://`:
  the identical page that answers «96 прошло» over http answers «96 не прошло»
  from a worktree, and the failure belongs to the route, not to the build.
- **Do not skip a reader because fan-out is missing.** Sequential is slower, not
  weaker; the withholding is what makes the reading worth anything, and that
  survives.
- **Do not widen a wave because the host might cope.** File ownership and
  `blockedBy` bound the wave; a missing capability only narrows it further.
- **Do not mark a host supported here.** That is a claim about a прогон that has
  finished on it, and it belongs in the specification, not in a run.
- **Do not conflate a headless test browser with a visible viewer.** An owned
  local test server and headless browser may execute checks without displaying
  another user-facing pane. Record server startup and cleanup; never take over
  an unowned server or move the dashboard address to a test application.
