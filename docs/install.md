# Installing

This package holds **two** Agent Skills, and installing copies directories of
Markdown into the place your agent looks for skills; nothing is compiled, and
nothing runs at install time.

| Skill | What it does | Needs the other |
|---|---|---|
| `maestro` | Turns a бриф into a finished, verified project in one dialogue | no |
| `scout` | Reconnaissance before that: reads the domain, asks the forks it exposes, and hands back a бриф to paste after `/maestro` | no |

**Neither one requires the other.** Maestro runs exactly as it always has with
Scout absent, and Scout ends by printing text — it never starts a прогон itself.
Install both, or install one; the section below is about how to say which.

## Requirements

- **To use the skill:** an agent that reads Agent Skills. Nothing else — the
  skill is Markdown, and it carries no runtime dependencies.
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

`python3` is used for one thing: mirroring the run state into the dashboard and
serving it on the loopback interface so the page stays live inside an in-app
pane. Without it the dashboard still opens in a browser.

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
MAESTRO_SYNC_DEBUG=1 python3 .maestro/sync.py
```

It adds one line on `stderr` saying which port it remembered, whether that port
was still free, what was holding it, which port it chose and why. The address on
`stdout` is unchanged, so the line a прогон reads to the user stays the only
thing on that channel.

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

## The First Run Asks One Thing

Installing settles nothing about how a прогон behaves. The first `/maestro` in a
project asks which mode it should start in when the arguments do not say — the
four are shown with a line each, `semi` marked as the built-in default. If that
first run already named a mode, the question is instead whether to pin it.

The answer goes to `<project>/.maestro/config.json`, which is **not** part of
the bundle:

```json
{
  "configVersion": 1,
  "mode": "full"
}
```

That location is the point. `npx skills update` overwrites every file it
installed — verified: a stale bundle updated in place had eleven of its files
replaced — so a default stored inside the skill would be erased by the next
update, silently, in the middle of a project. Beside the runs it survives both
updating and reinstalling.

It is asked once per project and never again; the file existing is what records
that it was asked. `"mode": null` is a user who was asked and chose not to pin
one. To change the answer later, edit the file — every announcement names its
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
because neither has hosted a run yet.

## Developing against the checkout

To run the skill from the repository while working on it, link it into the local
agent directories instead of installing a copy:

```bash
npm run link      # symlink skills/maestro into .claude, .codex and .gemini
npm run unlink    # remove those symlinks
```

`link-local.ts` links Maestro only. Scout has no run behind it yet, and giving it
a symlink into three agent directories before one exists would put it in front of
a session that did not ask for it.

Verified on 2026-08-19: all three symlinks are created and removed, and the
script refuses any path that is not already a symlink.

The links are deliberately not tracked by git: `.claude/`, `.codex/` and
`.gemini/` are ignored wholesale, and the script exists so that rule does not
need an exception. It refuses to touch any path that is not a symlink, so an
existing directory of your own skills is never overwritten.

## Checking the repository

```bash
npm run check     # everything below, in this order
```

| Command | Checks |
|---|---|
| `npm run typecheck` | `tsc --noEmit` over every script |
| `npm run spec` | Maestro's behavior specification does not contradict itself |
| `npm run spec:scout` | Scout's does not either, and its declared tables exist |
| `npm run bundle` | frontmatter, link targets, no cross-phase links, no orphaned phase |
| `npm run bundle:scout` | the same over Scout, whose steps live in `steps/` |
| `npm run dashboard` | the dashboard asset's regions, labels and pure logic |
| `npm run state` | `docs/spec/state-contract.md` and `scripts/state/contract.ts` still agree |
| `npm run hosts` | every host capability that degrades is probed in preflight and spent in a phase |
| `npm run doors` | every door into the repair phase is listed there and opened by some phase |
| `npm run dials` | the mode set and its built-in default agree across spec, phase and `SKILL.md` |
| `npm run view` | `SKILL.md` states the view boundary, every prompt carries it, and only preflight opens a page |
| `npm run test` | the checkers' own tests |

`npm run metrics -- <run-dir>` measures a finished run. It is not part of
`npm run check`, because this repository contains no run for it to measure.

Individual checks are documented in [the specification README](spec/README.md).
