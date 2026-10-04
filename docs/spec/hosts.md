# Hosts

A прогон runs inside an agent host. This document says what it needs from one,
what it does when the host does not provide it, and how a host's row here is
allowed to be filled in.

The rule underneath all of it: **a missing capability degrades the wave, never a
gate.** Every check in [`gates.md`](gates.md) is a question about the user's own
words, and no host is a reason not to ask one. What a weaker host costs is
parallelism, isolation and convenience — not correctness, and never silently.

## The Capabilities

| Capability | What a прогон uses it for | Degrades | Without it |
|---|---|---|---|
| subagent fan-out | one executor per таск, the source audit before G1, the independent reader at G2, the reviewer, the blind reader at G4 | yes | waves narrow to one таск; the readers still run, one after another, in fresh contexts |
| context isolation | keeping `spec.md` away from an executor and the манифест away from a reviewer | no | **this one does not degrade.** A host that cannot give a reader a context without the specification cannot run G2 or G4 honestly, and the прогон says so and stops |
| worktree isolation | two таски of one wave editing the project at once | yes | waves narrow to one таск, which is what a wave of one already does |
| a skills directory | installing the bundle at all | no | the host is not supported |
| file writes | `.maestro/`, the project code, the memory file | no | the host is not supported |
| version control | one commit per finished таск, and the history the review phase reads | yes | the прогон runs and says in the announcement that it cannot commit; the review phase reads the working tree instead of a diff, and says that it did |
| browser verification | real pointer/keyboard and rendered-state checks on the integrated local app | yes | affected required UI checks are unavailable and their requirements incomplete; unrelated checks continue, but completion cannot be claimed |

Two of those rows are absolute and the rest are adjustments. A host that cannot
withhold a document from a reader is a host that cannot run the two gates the
whole design is built around, and a host that cannot write files has nowhere to
put a прогон.

**A degrading capability is established by trying it, on every host, including
the one v1 was written against.** The three of them are separate answers: the
first end-to-end прогон committed happily and could not raise a worktree, on a
host whose documentation lists both. A capability read off the host's name is a
capability discovered missing halfway through a wave, which is the one point at
which it costs something.

A degradation therefore has two homes and they are checked against each other:
preflight establishes the capability, and the phase that spends it says what
its absence costs. `npm run hosts` fails when a row here degrades and no phase
file carries the matching rule, which is how the rule stopped living only in a
reference the прогон does not open.

For reference-preserving work, preflight probes the actual browser automation
available in this run. Headless execution and user-visible viewing are separate
capabilities. An authorized headless browser may exercise pointer, focus, and
layout without taking over the user's screen; it does not authorize taking over
an unrelated server or running destructive reference flows. A host name,
localhost address, or successful static fetch does not establish interaction
capability. Record the tool and browser identity used, or the concrete missing
capability. A missing mandatory browser leaves affected checks unavailable and
their requirements incomplete; it cannot satisfy G4 or a completion claim.

## Degradation Is Announced

Preflight resolves the host and states what it found, in the same block that
states the dials. A capability the host does not provide is named there, with
what it costs, **before the first stage begins**.

A прогон that quietly ran its таски one at a time because the host had no fan-out
looks exactly like a прогон whose plan cut one таск. The difference matters when
somebody later asks why it took an afternoon, and the announcement is the only
place it can be recorded cheaply.

## Filling In A Host

| Host | Status |
|---|---|
| Claude Code | supported. The capability set above is what v1 was written against, with one measured exception: **worktree isolation is unavailable when the session began outside a git repository**, because the host settles that question at session start and a later `git init` does not reopen it. Committing is unaffected |
| Codex CLI | **unverified** — partial runs have been attempted; no complete successful brief-to-report run is established |
| Codex app | **unverified** — requires separate discovery and complete-run evidence; CLI evidence does not establish app support |
| Gemini CLI | **unverified** — the bundle installs, and no прогон has been run on it |

A row moves from *unverified* to *supported* when a прогон has been run on that
host from бриф to отчёт, and its degradations have been written into the table
above. Not when the documentation of the host says a capability exists, and not
when the bundle installs — installing proves the skills directory and nothing
else.

This is the same rule the install page applies to its own commands: a command
whose output has been recorded is verified, and one that has only been read about
is marked as unrun. A host list that grows by reading release notes is a
compatibility claim, and this project makes one host at a time instead.

## Instruction File At Session Start

The memory phase writes its block into a file the next session will actually
load, and which file that is depends on the host. Each host's own documentation
was read for this table. That makes it a documented fact, and it does not move
any host's status above: a row here says what the host promises to load, not
that a прогон has run on it.

| Host id | Host | Loads at session start | Creates | Evidence |
|---|---|---|---|---|
| `claude-code` | Claude Code | `CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md`; else `AGENTS.md` | `CLAUDE.md` | host documentation, https://code.claude.com/docs/en/memory, read 2026-10-04 |
| `codex` | Codex CLI and Codex app | `AGENTS.override.md`; else `AGENTS.md` | `AGENTS.md` | host documentation, https://learn.chatgpt.com/docs/agent-configuration/agents-md, read 2026-10-04 |
| `gemini-cli` | Gemini CLI | `GEMINI.md` | `GEMINI.md` | host documentation, https://geminicli.com/docs/cli/gemini-md/, read 2026-10-04 |

How to read the third column: each `;`-separated group outranks the ones after
it, and the host loads the first group that has any file in the project root.
So Claude Code reads `AGENTS.md` only when none of the three `CLAUDE` files
exists. Since Claude Code v2.1.277 it does this without an import. Codex reads
`AGENTS.md` only when there is no `AGENTS.override.md` beside it.

Three files the hosts load are never written into:

- `CLAUDE.local.md` is personal and kept out of version control.
- `AGENTS.override.md` exists to outrank the team's file.
- Gemini CLI's file name and Codex's fallback names can be changed in the
  user's settings.

The table records each host's default. A project that changed it is not
detected, and the write reports `loadedByHost` from the default alone.

**Which file the memory phase writes**:

1. the file that already carries the прогон's block;
2. otherwise, the first file the host loads that exists and may be written;
3. otherwise, any other existing file from the table, in the order `AGENTS.md`,
   `CLAUDE.md`, `.claude/CLAUDE.md`, `GEMINI.md`;
4. only when none exists, the file in the `Creates` column.

A project never gains a second memory file because the host changed. When step 3
picks a file the host does not load, the прогон says so to the user. The same
block in two files is a stop, never a choice. `npm run hosts` holds this table
and `MEMORY_FILES_BY_HOST` in `tools/runtime/memory.mts` to each other.

## Who Starts The Skill

Only the user. A прогон opens a dashboard and asks questions at once, so a model
that starts one because a request looked like a build costs the user a прогон
they did not ask for. Each host is told in its own file, and `bundle-integrity`
refuses a bundle that tells one host and not the other.

| Host id | Declaration | File | Evidence |
|---|---|---|---|
| `claude-code` | `disable-model-invocation: true` | `SKILL.md` frontmatter | host documentation, https://code.claude.com/docs/en/skills, read 2026-10-04: `/maestro` still works, and the skill is no longer loaded into the model's context |
| `codex` | `policy.allow_implicit_invocation: false` | `agents/openai.yaml` | host documentation, https://developers.openai.com/codex/skills, read 2026-10-04: explicit `$maestro` still works |
| `gemini-cli` | none documented | — | the skill may start implicitly there; nothing is declared, because nothing documented exists to declare |

The `description` still matters with implicit start switched off. It is what a
host shows in its skill list and what the user reads when choosing, and on any
host that still loads it, it is resident on every turn. It carries trigger
conditions only.

## Independent Returns And Evaluation

Probe a real fresh-context dispatch and wait for its return before using source
audit or repeat-repair diagnosis. Missing dispatch/return capability leaves the
audit/diagnosis incomplete; the coordinator cannot impersonate the reader.
A host must report actual model/tool identity and bounded child inputs.
Less capable-model evaluation requires an explicitly available authorized model
configuration; a stronger model's result is not evidence for that configuration.
Evaluation adapters invoke caller-supplied argv without shell interpolation and
probe filesystem, fresh context, identity and needed browser capability.
Unconfigured/unsupported adapters report unavailable without installing clients,
inventing credentials or changing the default model. Three fresh runs of one
representative scenario are a recorded sample, never a reliability guarantee.

<!-- maestro:codex:contract -->
## Shared Codex Execution Contract

Codex CLI and the app use the same self-contained bundle, discovered from
`.agents/skills/maestro` (copy or relative symlink) and invoked as `$maestro`.
Resolve assets, prompts, references and the TypeScript helper relative to the
installed skill, never relative to this repository. The runtime recipe is
`skills/maestro/references/codex.md`, opened on demand by preflight and dispatch
sites. It is coordinator guidance and never part of a blind reader's handoff.

This skill explicitly requests native delegation for its independent roles.
Use only the tools and argument schema exposed in the actual session. Where
`fork_turns` exists, set it to `"none"`; its inherited default is forbidden.
Otherwise require the host's documented fresh-context mechanism and observe a
real child return before relying on it. Missing fresh context or return support
stops the affected independent operation with its gate pending. No coordinator
summary, subprocess agent, credential fallback or invented receipt replaces it.

Hand over the full role prompt and exactly its allowed inputs, using absolute
artifact paths. Do not include the resident router, phase files, coordinator
history or previous findings. G4 additionally withholds specification, plan,
tasks, review notes and original brief text. Extract only the dated additions
from the brief before handing them over. Prompt withholding does not establish
filesystem isolation: report observable read access separately and require
readers to avoid every withheld artifact even when it is visible on disk.

Record native dispatch, child and returned identities from actual tool results.
Match each final result to its child before using it. Wait or message through
the session's native operations, with at most two retries of a failed dispatch
or return operation; exhaustion leaves the operation incomplete. A retry never
changes the role's input boundary. Opaque envelopes or missing read observations
remain evidence limitations; do not claim exact input visibility from a child's
self-report or synthesize a receipt/model identity.

Executors alone write project code. Each handoff names an absolute workspace,
owned files and explicit cwd for every shell call. Concurrent editing requires
observed native concurrency and actual separate git worktrees, created and
integrated by the coordinator. Before integration check ownership, result and
commit; preserve other edits and report conflicts. Without either capability,
use one editing task per wave and dispatch fresh readers sequentially.
Only the coordinator publishes state via the bundled `sync.mts` and owns the
visible dashboard. Browser checks use an owned separate headless surface;
missing required UI capability keeps obligations incomplete. Opener failure
alone preserves the run and yields the dashboard address/file and a visibility
limitation. Read-only targets or failed discovery prevent build.

Log INFO capability probes, dispatch/return identities and integration results;
WARN missing tools, opaque inputs or visibility; ERROR isolation/return failure.
Use existing capability, verification and outcome records without changing the
state contract, adding a writer, or persisting source text or secrets in logs.
An enabled tool is only a candidate capability; a successful probe is observed
capability; only a complete client-specific run establishes verified support.

## Installed Runtime Prerequisite

Maestro requires Node.js 22.18+ with native TypeScript stripping actually
enabled. Preflight executes an erasable `.mts` capability probe; a version
string alone is insufficient. Missing or disabled capability stops before
state publication, names the prerequisite and never installs it automatically.
Copy `tools/sync.mts` and the complete `tools/runtime/` tree into `.maestro/`
alongside the dashboard, retaining run state and viewer/opened records. Verify
the replacement before removing the obsolete copied helper. No target build,
npm install, TS compiler, loader, Python or external network is needed after
installation. Local loopback HTTP remains available. Scout gains no runtime.
