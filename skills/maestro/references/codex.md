# Native Codex Runtime

Coordinator-only recipe for Codex CLI and app. Open in preflight and again at
an independent dispatch site; do not preload later phases. Resolve every bundle
path relative to the installed skill directory. Use `$maestro` from the target
with the bundle under `.agents/skills/maestro`, copied or symlinked.

<!-- maestro:codex:runtime -->
## Runtime Contract

These literal declarations are checked structurally; execution evidence is
established separately by live probes and workflow evaluation.

| Rule | Value |
|---|---|
| discovery | .agents/skills/maestro |
| delegation | native-explicit |
| context | fresh |
| fork_turns | none |
| inputs | role-prompt-and-allowed-artifacts |
| returns | observed-final-by-child-id |
| workspace | absolute-explicit-cwd |
| editing-wave | one-without-concurrency-or-worktrees |
| state-writer | coordinator-sync.py |
| evidence | opaque-remains-unverified |
| retries | 2 |

## Preflight Probe

This skill explicitly requests native subagents for executors, source audit,
independent intent/reference/task readers, review, blind acceptance, polish and
repeat-repair diagnosis. Inspect the available tool schemas; do not assume a
namespace, argument or tool exists because another client exposed it.

1. Establish writable target and the installed skill root. Inspect git status
   with explicit target cwd. Identify exposed native spawn, message and wait
   operations, their fresh-context control and how a final result is returned.
2. When spawn exposes `fork_turns`, explicitly select `"none"`. Never omit it:
   the default may inherit this coordinator's history. If another schema has a
   documented fresh-context mechanism, use it and record the observed mechanism.
   Without one, stop independent operations and leave affected gates pending.
3. Send one child only a trivial probe question and a disposable absolute input
   path. Require it to read that path with explicit cwd and return the token.
   Match the actual spawn identity to the final returned identity and compare
   the token. Record the actual call/return handles, not a name you invented.
   The child's assertion that it is isolated cannot prove unseen host context.
4. Probe concurrent native dispatch separately when a wider wave is needed.
   Create actual disposable git worktrees using available shell/git and verify
   each absolute directory with `git rev-parse --show-toplevel` in that cwd.
   Clean up only owned probes. No concurrency or worktrees means one editing
   task at a time; fresh readers still run sequentially.
5. Probe the owned browser separately from dashboard publication. Required UI
   checks without a browser stay unavailable/incomplete. A failed opener alone
   yields the helper's local URL/file and an honest visibility limitation.

## Dispatch And Return

At each site open the full role prompt named by that phase. Construct a fresh
handoff with that prompt's text and exactly its allowed artifact paths or
allowed excerpts, resolved to absolute paths. Include operational metadata:
role, workspace, ownership, return destination and required check identities.
Never include this recipe, resident SKILL.md, phase rules, coordinator history
or prior coordinator findings. Keep each role's Given/Withheld boundary.
For G4 extract only dated additions; do not hand over the original brief path
when it would expose withheld text. Never give G4 specification, plan, task
files or review notes. A raw-reference reader receives neutral source locations
and its own prompt, never spec-derived assertions.

Include a `## Handoff Inputs` table (`Input`, `What it is`) listing the
actual allowed absolute paths/excerpts handed over, after the full role prompt.
This is part of the actual dispatch envelope; it is not an invented receipt.
Use a separate additions-only artifact for G4 when needed, never brief.md.

Use the actual native spawn schema, selecting fresh context explicitly on every
call. With a `collaboration.spawn_agent` schema exposing these fields, the
shape is `task_name`, `fork_turns: "none"`, and `message` containing the bounded
handoff. This is conditional guidance, not a substitute for inspecting tools.
Use returned native IDs for messages and waits. Wait until the host reports the
child's final result before importing findings. A wait timeout is not a return.
Retry a failed dispatch/return operation at most twice; do not start a duplicate
editing child while an earlier one is active. Exhaustion keeps the operation
incomplete. Follow the phase's repair procedure for a returned task failure.

Prompt withholding and filesystem visibility are distinct. A child may share
the filesystem; explicitly prohibit opening withheld artifacts, and inspect
available read observations. Keep exact input-envelope visibility, filesystem
reads, configured model and observed model identity separate. Opaque or missing
observations remain limitations, never synthesized receipts or an exact-input
claim. An encrypted saved handoff cannot establish what that reader received.

## Executor Workspaces And Integration

Only executors edit project code. State the absolute owned workspace and owned
files; require verification before writing and explicit `workdir`/cwd on every
shell call. Parent cwd changes do not change child defaults. Say that other
agents may be working and that the executor must preserve their edits.

For a ready non-overlapping wave wider than one, create one owned branch and
worktree per task through shell/git (for example `git worktree add -b <owned-task-branch>
<absolute-owned-workspace> <integrated-base>`). Supply only that task and
interfaces plus its allowed verification inputs. Worktree failure narrows the
wave; never put concurrent editors in the project directory. Check returned
commit, actual changed-file ownership and captures in its declared workspace
before integration. Integrate completed task commits through git, preserving
existing work. Report a merge conflict and route it back to the executor; do
not resolve project code yourself. Remove only owned worktrees after their work
is integrated or safely recorded. Keep task counters/statuses on actual events.

Only the coordinator publishes the complete candidate through bundled
`sync.py --publish`; children return results/captures, not state writes. The
helper remains the sole shipped executable. Only the coordinator manages the
visible dashboard. Browser checks use an owned headless server/surface and
never replace that pane.

## Recording Outcomes

Use existing capability, verification, task, stage and outcome records.
INFO: observed probe capabilities, actual dispatch/return identities and git
integration outcomes. WARN: missing tools, opaque inputs or viewer limitations.
ERROR: isolation violations and failed returns. Do not log source text or
secrets, invent model identities, or add a second state writer/contract.
An enabled tool, an observed successful probe and a complete verified run are
three different claims. CLI and app need separate complete-run evidence.
