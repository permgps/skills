# Installing Maestro

Maestro is one Agent Skill. Installing it copies a directory of Markdown into
the place your agent looks for skills; nothing is compiled, and nothing runs at
install time.

## Requirements

- **To use the skill:** an agent that reads Agent Skills. Nothing else — the
  skill is Markdown, and it carries no runtime dependencies.
- **To develop it:** Node.js 22.18 or newer, because the repository's own scripts
  are TypeScript executed by Node's native type stripping.

## From the published repository

```bash
npx skills add <handle>/skills -s maestro
```

`<handle>` is a placeholder until the umbrella repository is published; see the
open item in `.ai-factory/ROADMAP.md`. Everything below has been run and its
output recorded; this line has not, and is marked as such rather than presented
as verified.

## From a local checkout

This is the form used to verify the bundle during development, and the one to
use if you cloned the repository yourself.

```bash
# List what the repository offers, without installing anything
npx skills add /path/to/maestro -l

# Install just this skill, for Claude Code, copying rather than symlinking
npx skills add /path/to/maestro -s maestro -a claude-code -y --copy
```

The `-s maestro` selector is not optional in a development checkout, and the
reason is easy to trip over: the CLI walks the whole tree for `SKILL.md` files,
and a checkout that also has agent tooling under `.claude/skills/` presents every
one of those as an installable skill. In this repository the listing reports 30
skills, of which exactly one is Maestro's. Selecting by name is what keeps an
install from picking up somebody else's tooling.

Verified output:

```text
◇  Local path validated
◇  Found 30 skills
●  Selected 1 skill: maestro
◇  Installation complete
✓ maestro (copied)
  → ./.claude/skills/maestro
```

The install writes `skills-lock.json` next to it, recording the source and a hash
of the installed content, so a later `npx skills update` can tell whether
anything changed.

### Verifying the copy

The installed bundle must be byte-identical to the source:

```bash
diff -r skills/maestro <target>/.claude/skills/maestro
```

Last verified on 2026-08-19, with the bundle complete: the listing still reports
30 skills, of which one is Maestro's, and `diff -r` reports no difference across
`SKILL.md`, `phases/`, `prompts/`, `references/` and `assets/`.

## For Codex and Gemini CLI

The same bundle, a different target convention. The agent is selected by name:

```bash
npx skills add /path/to/maestro -s maestro -a codex -y --copy
npx skills add /path/to/maestro -s maestro -a gemini-cli -y --copy
```

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
what a прогон does when one of those is missing — is in
[the hosts specification](spec/hosts.md), where both rows still read *unverified*
because no прогон has been run on either.

## Developing against the checkout

To run the skill from the repository while working on it, link it into the local
agent directories instead of installing a copy:

```bash
npm run link      # symlink skills/maestro into .claude, .codex and .gemini
npm run unlink    # remove those symlinks
```

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
| `npm run spec` | the behavior specification does not contradict itself |
| `npm run bundle` | frontmatter, link targets, no cross-phase links, no orphaned phase |
| `npm run state` | `docs/spec/state-contract.md` and `scripts/state/contract.ts` still agree |
| `npm run test` | the checkers' own tests |

`npm run metrics -- <run-dir>` measures a finished прогон. It is not part of
`npm run check`, because this repository contains no прогон for it to measure.

Individual checks are documented in [the specification README](spec/README.md).
