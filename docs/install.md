[Back to README](../README.md) · [Dashboard →](dashboard.md)

# Installing

This package holds **two** Agent Skills. Installation copies their directories,
including Maestro's dashboard and Node helper, into the place your agent looks
for skills; nothing is compiled, and nothing runs at install time.

| Skill | What it does | Needs the other |
|---|---|---|
| `maestro` | Turns a бриф into a finished, verified project in one dialogue | no |
| `scout` | Reconnaissance before that: reads the domain, asks the forks it exposes, and hands back a бриф to paste after `/maestro` | no |

**Neither one requires the other.** Maestro runs exactly as it always has with
Scout absent, and Scout ends by printing text — it never starts a прогон itself.
Install both, or install one; the section below is about how to say which.

## Requirements

- **To use the skill:** an agent that reads Agent Skills and Node.js 22.18+
  with native TypeScript stripping enabled for Maestro. Scout needs no runtime. Browser checks use an available
  headless browser capability; an unavailable browser leaves affected checks
  incomplete. The bundle installs no application dependencies.
- **To develop it:** Node.js 22.18 or newer, because the repository's own scripts
  are TypeScript executed by Node's native type stripping.

**Run Maestro inside a git repository, and initialise it before you start the
agent session.** It works without one and says so, but two things depend on it.
The final отчёт is checked against what actually reached version control, and
outside a repository that check has nothing to read. And a host decides whether
it is inside a repository when its session starts: a `git init` run afterwards
leaves it unable to raise a worktree for the rest of that session, so every wave
of the прогон narrows to one таск. Both are announced rather than silent, and
both are avoided by running `git init` first.

`node` runs the bundled helper that validates a complete state candidate,
publishes it atomically, and serves the dashboard on the loopback interface.
Preflight executes a real `.mts` capability probe before publishing state; a
version string alone is insufficient. Missing/disabled stripping stops with the
Node prerequisite named, without installing anything.

## Autonomous Runtime Layout

Preflight copies the installed skill's helper and complete runtime tree into
the target, without replacing the populated run directory:

```text
.maestro/
  sync.mts
  runtime/
    state/*.mts
    shared/log.mts
    shared/owned-block.mts
    publication.mts, relocation.mts, register.mts, legacy.mts, dashboard.mts, server.mts, opener.mts
  dashboard.html
  state.js, validation.js
  serve.json, opened.json
  README.md                        the run register, one row per contract-7 run
  <YYYY-MM-DD>-<slug>--wip/        a run in progress; the suffix comes off when it closes
  <YYYY-MM-DD>-<slug>/             a run that closed
  <slug>/                          a run from before contract 7, under its old name
```

A run's directory is named by the UTC day it started and, while it is active,
carries `--wip`. `node .maestro/sync.mts --publish` takes the suffix off when
the run closes — `git mv` when the folder is tracked — and rewrites the run's
row in `.maestro/README.md`. Directories from earlier runs keep their names.

The installed helper uses only Node built-ins and its relative modules. It works
without a target `package.json`, with CommonJS or ESM, from a different cwd and
with spaces in paths. It needs no Python, target dependencies, compiler,
loader, build or external network after installation. Local loopback HTTP is
used for the dashboard; browser and agent capabilities remain separate.

```bash
node .maestro/sync.mts --validate .maestro/.candidate.json
node .maestro/sync.mts --project .maestro/state.js
node .maestro/sync.mts --no-open
node .maestro/sync.mts --reopen
LOG_LEVEL=DEBUG node .maestro/sync.mts --no-open
```

`--validate` and `--project` are read-only and launch no viewer or opener.
`--publish` accepts a complete candidate and returns one JSON result. Existing
state requires `--expect` with its last-read `updatedAt`; claimed runs require
`--holder` matching both snapshots. Exit codes are 0 for success, 1 for
invalid/rejected state and 2 for unreadable input/JSON parsing failure. See the
[state contract](spec/state-contract.md#autonomous-runtime-and-publication-boundary).

On upgrade, copy `sync.mts` and `runtime/` together, preserving run artifacts,
state and viewer/opened records. Validate the copied runtime before deleting
only the obsolete `.maestro/sync.py` file. Never reset the run to change runtime.
Unverifiable old servers are left untouched and reported as a limitation.

## From the published repository

```bash
npx skills add permgps/skills -y
```

**The `-y` is not decoration, and this is the one thing on this page that
changed when the package gained a second skill.** The CLI walks the tree for
`SKILL.md` files and installs what it finds. With one skill it printed the
description and went on. With two it stops on a picker instead:

```text
◇  Found 2 skills
◆  Select skills to install
│  Search:
│  ↑↓ move, space select, enter confirm
│
│ ❯ ○ Select All (0/2)
│   ────────────────────────────────────
│   ○ maestro
│   ○ scout
```

Read the `(0/2)`. **Nothing is pre-selected**, so pressing enter installs
nothing — a command that used to finish on its own now needs either a keystroke
or the flag. The picker is worth knowing about rather than avoiding: it is how
you install one skill and not the other without knowing the selector syntax.

With `-y`, both are installed and nothing is asked. Measured 2026-08-21 against a
publish-shaped export of this repository — `git archive HEAD`, which is the same
tree GitHub serves — exit code `0`:

```text
◇  Found 2 skills
●  Installing all 2 skills
◇  Installed 2 skills ───────────╮
│  ✓ maestro (copied)            │
│    → ./.claude/skills/maestro  │
│  ✓ scout (copied)              │
│    → ./.claude/skills/scout    │
```

**Against the export, not against `permgps/skills`.** No push has yet carried two
bundles to the default branch, so the run above proves what the CLI does with two
`SKILL.md` files and not what GitHub is currently serving. It is recorded as
**F14** in `.ai-factory/dogfood-findings.md` with all four runs it took to
establish, including the difference between an agent session — which installs
non-interactively and never sees the picker — and a person at a terminal, who
does.

To install only one of them, name it:

```bash
npx skills add permgps/skills -s maestro -y
```

One line of that run is worth reading twice. The summary printed *before* the
copy names `./.agents/skills/maestro`, and the summary printed *after* it names
`./.claude/skills/maestro`. Only the second one is true — no `.agents/`
directory exists afterwards. The install is correct; it is the preview that is
wrong, and it is wrong in exactly the direction that makes a Claude Code user
think the skill landed somewhere their agent will not look.

If the dashboard itself is what looks wrong — no address, an address that
changed, a page that will not tick — run its tool with `MAESTRO_SYNC_DEBUG=1`:

```bash
MAESTRO_SYNC_DEBUG=1 node .maestro/sync.mts
```

Diagnostic DEBUG logs on `stderr` report safe paths, identity/port checks and
publication checkpoints. `LOG_LEVEL=DEBUG` also enables diagnostics; INFO is
the default, with WARN/ERROR available. JSON actions emit one result on stdout;
historical refresh prints localized address and viewer guidance. Holder tokens,
source bodies and evidence content are never logged.

The `skills-lock.json` written beside it records `"source": "permgps/skills"`
with `"sourceType": "github"`; the local form below records a relative path and
`"sourceType": "local"`. **Each skill gets its own entry with its own
`computedHash`**, so `npx skills update` can move one without the other:

```json
{
  "version": 1,
  "skills": {
    "maestro": { "source": "…", "sourceType": "local", "computedHash": "2b71e812…" },
    "scout":   { "source": "…", "sourceType": "local", "computedHash": "0a8ff7e6…" }
  }
}
```

The hash is what proves that what GitHub serves and what this checkout holds are
one bundle.

Last verified on 2026-08-21: `diff -r` against the exported tree reports no
difference for either skill — `SKILL.md`, `phases/`, `prompts/`, `references/`
and `assets/` for Maestro, `SKILL.md` and `steps/` for Scout.

## From a local checkout

This is the form used to verify the bundle during development, and the one to
use if you cloned the repository yourself.

```bash
# List what the repository offers, without installing anything
npx skills add /path/to/maestro -l

# Install one skill, for Claude Code, copying rather than symlinking
npx skills add /path/to/maestro -s maestro -a claude-code -y --copy
npx skills add /path/to/maestro -s scout   -a claude-code -y --copy
```

**A selector is not optional in a development checkout**, and here the reason is
different from the picker above: the CLI walks the whole tree for `SKILL.md`
files, and a checkout that also has agent tooling under `.claude/skills/`
presents every one of those as an installable skill. In this repository the
listing reports **31** skills — it was 30 before Scout — of which exactly two are
this package's. Selecting by name is what keeps an install from picking up
somebody else's tooling, and `-y` alone would install all thirty-one.

Verified output on 2026-08-21:

```text
◇  Local path validated
◇  Found 31 skills
●  Selected 1 skill: maestro
◇  Installation complete
✓ maestro (copied)
  → ./.claude/skills/maestro
```

The install writes `skills-lock.json` next to it, recording the source and a hash
of the installed content, so a later `npx skills update` can tell whether
anything changed.

### Verifying the copy

Each installed bundle must be byte-identical to its source:

```bash
diff -r skills/maestro <target>/.claude/skills/maestro
diff -r skills/scout   <target>/.claude/skills/scout
```

Last verified on 2026-08-21: the listing reports 31 skills, two of which are this
package's, and `diff -r` reports no difference for either. Compare against a
`git archive HEAD` export rather than the working tree if the checkout has
uncommitted work — otherwise the diff reports your own edits and looks like a
broken install.

## Optional: A Guard Against Destructive Git

S4 makes a history rewrite or a publish a question the прогон asks you, in every
mode. On Claude Code you can raise that from a question to a refusal: the bundle
ships `tools/guard-git.mts`, a `PreToolUse` hook that denies these commands
whatever the agent believes you agreed to.

| Rule | Refuses |
|---|---|
| `push` | every `git push`, including `--force`, `--force-with-lease`, `--mirror` and `--delete` |
| `reset-hard` | `git reset --hard` |
| `clean-force` | `git clean` with `-f`, `--force` or a cluster containing `f` such as `-xdf` |
| `branch-force-delete` | `git branch -D`, or `-d` / `--delete` together with `-f` / `--force` |
| `discarding-checkout` | `git checkout` that overwrites files: `--`, `.`, `-f`, `-p`, `--ours` / `--theirs`, a pathspec, or a word that names an existing file or directory |
| `discarding-switch` | `git switch --discard-changes` or `-f` |
| `discarding-restore` | `git restore`, unless it names `--staged` and not `--worktree` |
| `unreadable` | a `$(…)` whose quote never closes, so the command after it cannot be read |

It finds these behind `&&`, pipes, `env`, `sudo`, `xargs`, `timeout`,
`bash -c`, `eval` and `$(…)`, and reads a long option as git does, so
`--har` is `--hard`. A plain `git checkout main` still switches branches. Everything it does not refuse goes on to your usual permission prompt:
the guard never answers `allow`.

**Nothing installs it for you, and a прогон never will.** Wiring a hook means
editing your Claude Code settings, which lies outside the one boundary the
orchestrator writes within, and asking about it would put a technical question
to someone who came to dictate a brief. It is offered here, once, and it is your
decision.

To install it for one project, add this to that project's
`.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/skills/maestro/tools/guard-git.mts\"" }
        ]
      }
    ]
  }
}
```

For every project, put the same block in `~/.claude/settings.json` with the
command `node ~/.claude/skills/maestro/tools/guard-git.mts`, which is where a
global install puts the skill. A `--copy` install and a symlinked one resolve
the same path. To remove the guard, delete the hook entry.

**With the guard installed, a push you approved is yours to run.** The agent is
told the command is blocked in every mode and asked to hand it to you. Run it in
your own terminal.

**What it does not cover:**
- a git alias (`git config alias.p push`, then `git p`);
- a script, a Makefile or an `npm run` target that calls git internally;
- a script a shell reads from its input rather than from `-c`, such as
  `echo "git push" | sh` or a here-document handed to `bash`;
- a program name built at run time, such as `$(echo git) push`.

It reads the command line it is handed, and nothing else. Codex CLI, the Codex
app and Gemini CLI get nothing equivalent from this bundle; on those hosts the
question S4 asks is the whole rule. See
[`docs/spec/hosts.md`](spec/hosts.md#optional-git-guard).

**Verified 2026-10-04** against a real install made with
`npx skills add /path/to/maestro -s maestro -a claude-code -y --copy` in an
empty git project. `diff -r` against the source reported no difference. Run
under Node v26.8.1:

```text
$ echo '{"tool_name":"Bash","tool_input":{"command":"git push --force"}}' \
    | node .claude/skills/maestro/tools/guard-git.mts
INFO [guard-git.decision] blocked {"rule":"push","subcommand":"push"}
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Maestro git guard: git push publishes history. It is blocked in every mode. If the user wants it done, ask them to run it in their own terminal."}}
$ echo $?
0
$ echo '{"tool_name":"Bash","tool_input":{"command":"git status"}}' \
    | node .claude/skills/maestro/tools/guard-git.mts
$ echo $?
0
```

The first line goes to stderr and the deny line to stdout. The allowed call
prints nothing. **Not verified:** that a Claude Code session calls the hook
through the settings above. This record pipes the payload by hand, and
`npm run check` proves only what the guard decides, through
`scripts/validate/guard-git.test.ts`.

## The First Run Asks Two Things

A прогон starts only when you type `/maestro`. Claude Code does not start the
skill on its own, however much a request sounds like a build: the frontmatter
declares `disable-model-invocation: true`.

Installing settles nothing about how a прогон behaves. The first `/maestro` in a
project asks two questions, in this order:

1. **How it should explain things** — `plain` (*по-простому*) or `normal`
   (*обычный*), with `normal` marked as the built-in default.
2. **Which mode it should start in** when the arguments do not say — the four
   are shown with a line each, `semi` marked as the built-in default — asked in
   the register you just chose.

The register comes first so that the one user who most needs plain words meets
the mode table already in them. If that first run already named a register or a
mode, the question about it is instead whether to pin it. Both questions are
asked in `full` too: they are about the tool, not the project, and they are
asked once in a project's lifetime.

The answers go to `<project>/.maestro/config.json`, which is **not** part of
the bundle:

```json
{
  "configVersion": 1,
  "mode": "full",
  "explain": "plain"
}
```

A `"language": "ru"` or `"en"` key may be added by hand; the skill reads it and
never writes it. The full precedence is in [the dials specification](spec/dials.md).

That location is the point. `npx skills update` overwrites every file it
installed — verified: a stale bundle updated in place had eleven of its files
replaced — so a default stored inside the skill would be erased by the next
update, silently, in the middle of a project. Beside the runs it survives both
updating and reinstalling.

They are asked once per project and never again; the file existing is what
records that they were asked. `"mode": null` or `"explain": null` is a user who
was asked and chose not to pin that one. To change an answer later, edit the file — every announcement names its
path, so there is nothing to look up.

## For Codex and Gemini CLI

The same bundle, a different target convention. The agent is selected by name:

```bash
npx skills add /path/to/maestro -s maestro -a codex -y --copy
npx skills add /path/to/maestro -s maestro -a gemini-cli -y --copy
```

Scout installs the same way under `-s scout`; neither host has run it.

Two things are worth knowing before either command is run. The Gemini agent is
called **`gemini-cli`**, not `gemini`; the shorter name is rejected with a list
of valid agents. And both of them install to the **same** directory:

```text
●  Selected 1 skill: maestro
│    copy → Codex            │
◇  Installation complete
│  ✓ maestro (copied)
│    → ./.agents/skills/maestro
```

```text
●  Selected 1 skill: maestro
│    copy → Gemini CLI       │
◇  Installation complete
│  ✓ maestro (copied)
│    → ./.agents/skills/maestro
```

Verified on 2026-08-19; `diff -r` against `skills/maestro` reports no difference
for either. Installing under two agents in one directory therefore means the
second copy replaces the first — which is fine, because it is the same bundle,
and worth knowing before it looks like one of them failed.

**Installing is not support.** It proves the skills directory and nothing else.
What each host does about subagent fan-out, context isolation and worktrees — and
what a run does when one of those is missing — is in
[the hosts specification](spec/hosts.md), where both rows still read *unverified*
until complete successful client-specific runs are established. Partial Codex
CLI runs have been attempted; Gemini verification is unchanged.

## Codex CLI And App

Both clients use the same bundle and native runtime recipe. Codex discovers
repository skills under `.agents/skills` and supports symlinked skill folders;
see [official skill documentation](https://learn.chatgpt.com/docs/build-skills).
From this development checkout, `npm run link` provides the canonical link.
For another target, the copy command above selects `-a codex`; verify that
`<target>/.agents/skills/maestro/SKILL.md` exists and compare the bundle with
`diff -r`. Refuse or rename an existing user-owned directory before installing;
do not silently replace it.

Start Codex in the target directory (open that project in the app) and invoke:

```text
$maestro Build a notes page with local saving.
```

Typing `$maestro` is the only way in. The bundle's `agents/openai.yaml` sets
`policy.allow_implicit_invocation: false`, so Codex does not start the skill on
its own. Keep that file when copying the bundle by hand.

There is no need to supply `SKILL.md` to the prompt. Supporting files resolve
relative to the installed skill, including `references/codex.md`, prompts,
`tools/sync.mts`, the complete `tools/runtime/` tree and the dashboard asset. If a changed skill does not appear,
restart the client. Avoid keeping legacy and canonical copies with the same
name: duplicate skill names can appear separately in the selector.

Maestro explicitly requests [native subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents).
Preflight inspects exposed tools and probes a fresh child and its final return.
With `fork_turns`, every dispatch explicitly selects `"none"`; with another
schema it requires the documented fresh-context mechanism. Missing concurrency
or worktrees narrows editing waves to one and readers continue sequentially.
Missing fresh contexts or returns leaves affected gates pending. Readers get
only their role prompt and allowed inputs, with the specification withheld
from blind acceptance. Filesystem visibility is recorded separately.

Executors use absolute owned workspaces and explicit shell cwd. The coordinator
integrates work and publishes state through the bundled TypeScript helper. Relay
its dashboard URL; if opening fails, open that local URL yourself. A visible
dashboard does not prove browser verification of the built app: missing required
UI evidence keeps its obligations incomplete. `--no-open` accommodates clients
with their own pane and unattended checks; `--reopen` recovers the dashboard.

CLI and app support remain **unverified** until each has complete brief-to-report
evidence. Consult the [current execution record](parity-verification.md#codex-compatibility-checkpoint--2026-09-30)
for what was actually run. Scout and Gemini execution support are outside this
compatibility change.

## Developing against the checkout

To run the skill from the repository while working on it, link it into the local
agent directories instead of installing a copy:

```bash
npm run link      # link Maestro into .claude/skills, .agents/skills and .gemini/skills
npm run unlink    # remove those symlinks
```

`link-local.ts` links Maestro only. Scout has no run behind it yet, and giving it
a symlink into three agent directories before one exists would put it in front of
a session that did not ask for it.

Verified on 2026-09-30: twelve real-directory regressions pass, including the
literal `.agents/skills/maestro` destination, relocation, idempotent link/unlink,
shared-destination deduplication and existing-directory refusal. `npm run link`
created all three owned relative links in this checkout. It creates no legacy
`.codex/skills/maestro` copy and does not remove user-owned legacy installations.

Only the owned `maestro` entries are ignored. The rest of `.agents/` remains
trackable because it contains project tooling. Real directories are refused
on both linking and unlinking.

## Checking the repository

```bash
npm run check     # everything below, in this order
```

| Command | Checks |
|---|---|
| `npm run typecheck` | `tsc --noEmit` over every script |
| `npm run spec` | Maestro's behavior specification does not contradict itself |
| `npm run spec:scout` | Scout's does not either, and its declared tables exist |
| `npm run bundle` | frontmatter, links, phase boundaries, reachable prompts, and declared completion procedure scaffolding |
| `npm run bundle:scout` | the same over Scout, whose steps live in `steps/` |
| `npm run dashboard` | the dashboard asset's regions, labels and pure logic |
| `npm run state` | `docs/spec/state-contract.md` and the shipped `tools/runtime/state/contract.mts` still agree |
| `npm run hosts` | every host capability that degrades is probed in preflight and spent in a phase |
| `npm run doors` | every door into the repair phase is listed there and opened by some phase |
| `npm run dials` | the mode set and its built-in default agree across spec, phase and `SKILL.md` |
| `npm run readers` | each independent reader — every gate reader and the standards reader — declares both given and withheld inputs from `docs/spec/gates.md` |
| `npm run report` | the отчёт's sections are the same names in the same order in the acceptance phase and the specification, and no file states their count |
| `npm run view` | `SKILL.md` states the view boundary, every prompt carries it, and only preflight opens a page |
| `npm run test` | the checkers' own tests |
| `npm run parity:browser` | separate required real-browser pointer suite; unavailable exits 2 |
| `npm run parity:workflow` | separate required independent agent evaluation; unavailable exits 2 |
| `npm run parity:workflow:prepare` | isolated preparation for that evaluation only, no agent execution credit |
| `npm run completion:workflow` | provider-neutral completion evaluation with explicit authorized adapter; unconfigured/unavailable exits 2 |
| `npm run completion:workflow:prepare` | isolated target preparation only, no agent execution credit |

`npm run metrics -- <project>/.maestro` measures a finished run and closes with
a retrospective for whoever maintains Maestro. It is not part of
`npm run check`, because this repository contains no run for it to measure.

Individual checks are documented in [the specification README](spec/README.md).
The [parity verification record](parity-verification.md) names the separate
browser and workflow prerequisites and the current execution limits.

## Completion Prerequisites

New runs use contract 5/verification 2. Source auditing and repeated-repair
diagnosis need actual fresh independent contexts and returned identities. If a
host cannot provide them, affected gates remain pending. Readiness checks follow
the request: clean startup/restart for runnable persistent apps, actual promised
integrations, and proportional output checks for non-UI work. Sandbox evidence
establishes sandbox behavior only.

Selected controls need an owned disposable copy and unchanged oracle. Neither
`sync.mts` nor the dashboard executes project checks. The TypeScript helper uses
only Node built-ins and its bundled modules; browser and agent clients are external prerequisites and
are never installed by the evaluation commands. Historical states are readable;
explicit resume must reconstruct actual v5 guarantees instead of inferring them
from prior completion.

## Verification Checkpoint

The Node runtime migration is recorded in the
[runtime migration checkpoint](parity-verification.md#node-runtime-migration-checkpoint--2026-09-30).
The Python results below are historical checkpoints before that replacement.

The Codex compatibility work in the unrestricted 2026-09-30 environment passed
`npm run check`: 739 tests, zero failures, zero skips, with Python 3.14.7 actually
executing the helper integration tests. This supersedes the environment limit
in the historical checkpoint below for the pre-migration revision. It does not
establish complete CLI/app workflow support. Fresh CLI `$maestro` runs from a
copy and a corrected development link loaded the skill and returned independent
children, but both hit their 15-minute deadlines before acceptance/report/memory.
The app has no separate execution evidence. See the parity record for details.


The earlier 2026-09-30 implementation checkpoint passed `npm run check` with 725 tests,
zero failures and zero skips, including actual copied-helper Python subprocesses.
The separate real-browser suite also passed. Actual agent workflow acceptance is
still pending. After the latest stage-clock and transcript corrections, the
managed environment ran 727 tests: 691 passed and 36 viewer/publication tests
failed because local port operations were prohibited. Types, validators and the
new regression checks passed. The full check remains unestablished in this
environment; see the execution checkpoint in the parity verification record.

## See Also

- [Dashboard](dashboard.md)
- [Parity Verification](parity-verification.md)
