# Native dsh Runtime

Coordinator-only recipe for DeepSeek Harness (`dsh`). Open in preflight and
again at an independent dispatch site; do not preload later phases. Resolve
every bundle path against the base directory the host printed with the skill.
The user starts it with `/maestro` in the session composer, with the bundle
under `.agents/skills/maestro`, copied or symlinked. The host's documentation
was read 2026-10-20 from a developer preview: every rule below is a candidate
until its probe passes in this session.

<!-- maestro:dsh:runtime -->
## Runtime Contract

These literal declarations are checked structurally; execution evidence is
established separately by live probes.

| Rule | Value |
|---|---|
| discovery | .agents/skills/maestro |
| delegation | native-explicit |
| tool | subagent |
| context | fresh |
| subagent_fork | never |
| agent_preset | never |
| create_worktree | never |
| inputs | role-prompt-and-allowed-artifacts |
| returns | completion-notice-by-child-id |
| follow-ups | never |
| workspace | absolute-explicit-cwd |
| worktrees | coordinator-git-worktree |
| editing-wave | one-without-concurrency-or-worktrees |
| state-writer | coordinator-sync.mts |
| evidence | opaque-remains-unverified |
| retries | 2 |
| model | per tier, from the run state's models as provider:model; session passes none |
| reasoning_effort | the session's |

`subagent_fork` inherits this conversation, which is exactly what a reader must
not see. `agent_preset` brings its own persona and tools, which a role prompt
must not compete with. `create_worktree` moves the calling session into the new
checkout, and the coordinator's directory is the run's. A child that finished
one role is never handed another through `send_message`: it still holds the
first role's findings. Split each `models` half at its first `:` and pass
`provider` and `model` together, with `reasoning_effort` equal to the session's
when you know it.

## Preflight Probe

This skill explicitly requests native subagents for executors, source audit,
independent intent/reference/task readers, review, blind acceptance and
repeat-repair diagnosis. Inspect the tool schemas this session actually has; a
composition can rename a tool or bind it to another provider.

1. Establish the writable target and the installed skill root. Inspect git
   status with explicit target cwd. Identify the delegation tools you have,
   the completion notice they produce and `send_message`.
2. Read the `subagent` description. It must say the child does not share this
   conversation's context. That wording names a fresh provider, and it is still
   only a candidate. A tool that says the child sees the conversation, or only
   `subagent_fork`, is no fresh context: stop independent operations and leave
   the affected gates pending.
3. Write a disposable file holding a token you never put into the chat, then
   send one `subagent` child only a trivial question and that absolute path.
   Write that file from a shell call sent first in the same message, after a
   20-second wait: the token back also establishes ordered tool calls
   (preflight step 1b); an absent file is a no.
   Require it to read the path with explicit cwd, return the token, and say what
   it knows of this conversation. Match the child id `subagent` returned to the
   completion notice and compare the token. A child that repeats this
   conversation is the stop. Its claim to be isolated proves nothing on its own.
4. When a wider wave is needed, run `git worktree add` to a disposable absolute
   path through the shell and verify it with `git rev-parse --show-toplevel` in
   that cwd. A sandbox refusal, or no concurrency, means one editing task at a
   time; fresh readers still run sequentially. Clean up only owned probes.
5. Look for `provider` and `model` on `subagent` and for
   `list_subagent_models`. Present: list the providers, then each provider's
   models, and offer `<provider>:<model>` names. Absent: the session did not
   enable subagent model selection, so the models dial degrades. Say so, and do
   not ask the user to change a host setting mid-прогон.
6. Probe the owned browser separately from dashboard publication. The dashboard
   opens in the system browser, beside the host's own Web UI, never inside it.

## Dispatch And Return

At each site open the full role prompt named by that phase. Construct a fresh
handoff with that prompt's text and exactly its allowed artifact paths or
allowed excerpts, resolved to absolute paths. Include operational metadata:
role, workspace, ownership, return destination and required check identities.
Never include this recipe, resident SKILL.md, phase rules, coordinator history
or prior coordinator findings. Keep each role's Given/Withheld boundary.
For G4 extract only dated additions; do not hand over the original brief path
when it would expose withheld text. Never give G4 specification, plan, task
files or review notes.

Include a `## Handoff Inputs` table (`Input`, `What it is`) listing the
actual allowed absolute paths/excerpts handed over, after the full role prompt.
It goes in the `subagent` call's `prompt`, with a short `description` and an
absolute `cwd`; it is the dispatch envelope, not an invented receipt.

`subagent` returns `started subagent <childId>` at once. Record that id. The
final answer arrives in the runtime's completion notice for it: match each
notice to its child before importing findings, and while waiting is all that is
left, end the turn instead of sleeping or polling. A missing or failed notice is
not a return. Retry a failed dispatch or return at most twice, each time with a
new `subagent` call and the same inputs; do not start a duplicate editing child
while an earlier one is active. Exhaustion keeps the operation incomplete.

Prompt withholding and filesystem visibility are distinct. A child shares the
filesystem; explicitly prohibit opening withheld artifacts. Keep exact
input-envelope visibility, filesystem reads, configured route and observed
model identity separate; opaque observations remain limitations.

## Executor Workspaces And Integration

Only executors edit project code. State the absolute owned workspace and owned
files; require verification before writing and explicit cwd on every shell
call. Say that other agents may be working and that the executor must preserve
their edits.

For a ready non-overlapping wave wider than one, create one owned branch and
worktree per task yourself (`git worktree add -b <owned-task-branch>
<absolute-owned-workspace> <integrated-base>`) and pass that absolute path as
the child's `cwd`. Worktree failure narrows the wave; never put concurrent
editors in the project directory. Check the returned commit, actual changed-file
ownership and captures in the declared workspace before integration. Integrate
completed task commits through git, preserving existing work. Report a merge
conflict and route it back to the executor; do not resolve project code
yourself. Remove only owned worktrees after their work is integrated or safely
recorded.

Only the coordinator publishes the complete candidate through bundled
`sync.mts --publish`; children return results/captures, not state writes. Only
the coordinator manages the visible dashboard.

## Recording Outcomes

Use existing capability, verification, task, stage and outcome records.
INFO: observed probe capabilities, child ids and their notices, and git
integration outcomes. WARN: missing tools, a disabled model selection, a refused
worktree, opaque inputs or viewer limitations. ERROR: isolation violations and
failed returns. Do not log source text or secrets, invent model identities, or
add a second state writer/contract. An enabled tool, an observed successful
probe and a complete verified run are three different claims.
