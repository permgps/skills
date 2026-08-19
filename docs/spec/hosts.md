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
| subagent fan-out | one executor per таск, the independent reader at G2, the reviewer, the blind reader at G4 | yes | waves narrow to one таск; the readers still run, one after another, in fresh contexts |
| context isolation | keeping `spec.md` away from an executor and the манифест away from a reviewer | no | **this one does not degrade.** A host that cannot give a reader a context without the specification cannot run G2 or G4 honestly, and the прогон says so and stops |
| worktree isolation | two таски of one wave editing the project at once | yes | waves narrow to one таск, which is what a wave of one already does |
| a skills directory | installing the bundle at all | no | the host is not supported |
| file writes | `.maestro/`, the project code, the memory file | no | the host is not supported |
| version control | one commit per finished таск, and the history the review phase reads | yes | the прогон runs and says in the announcement that it cannot commit; the review phase reads the working tree instead of a diff, and says that it did |

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
| Codex CLI | **unverified** — the bundle installs, and no прогон has been run on it |
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
