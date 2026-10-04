# Phase 0b — Preflight

Read after the dials are resolved. Prepare the place the прогон will write to,
create its state, and show the announcement. No requirement is read here and no
question about the бриф is asked.

## Steps

### 1. Check the repository

- If the working tree is dirty, say so and ask whether to continue. Maestro
  writes into `.maestro/` and, later, executors write project code; starting on
  top of uncommitted work makes it impossible to tell afterwards what the прогон
  did.
- In `full` mode do not ask: state that the tree was dirty at the start and
  continue. It is a question about consequence only if something is about to be
  overwritten, and nothing here overwrites.
- If there is no repository at all, say so and continue. Version control is how
  the отчёт is later checked, not how the run works.

### 1b. Resolve the host

<!-- maestro:codex:preflight -->
On Codex CLI or app, identify actual exposed native delegation tools, open
[the Codex recipe](../references/codex.md), and perform its real fresh child/return
probe before independent work. Inspect the current schema; an enabled tool
alone is not observed capability. Record identities and limits in existing
records. Missing fresh context/return leaves the affected gates pending.

Three capabilities are established by trying them, on every host, this one
included. They are the three that narrow a прогон instead of stopping it, and a
прогон that assumed one and lost it halfway through a wave is worse off than one
that never counted on it.

<!-- maestro:probes:subagent-fan-out -->
<!-- maestro:probes:worktree-isolation -->
<!-- maestro:probes:version-control -->

| Capability | The attempt that settles it |
|---|---|
| subagent fan-out with a context you control | hand a trivial question to one subagent and read what comes back |
| worktree isolation | ask the host for an isolated tree, before the first wave wider than one таск needs it |
| version control | `git status` in the project directory |

**Do not read any of the three off the host's name.** The first end-to-end
прогон ran under Claude Code, where worktrees are a documented capability, and
its worktrees did not come up: the host decides whether it is inside a
repository when the session starts, and a `git init` run after that does not
change its mind. Committing worked in the same прогон, which is the shape this
failure has — the capabilities are separate answers and one of them being true
says nothing about the next.

**The dashboard is a fourth**: whether the user can watch the прогон depends on
the viewer, not the host, and it is established in step 5 by looking.

Record browser verification capability separately from the dashboard viewer:
<!-- maestro:probes:browser-verification -->
an existing headless browser or controlled browser tool must be able to load
the integrated local app, send real pointer/keyboard input, inspect visibility,
and capture evidence. A missing capability does not authorize installation or
a fake pass. It makes affected checks unavailable and keeps their obligations
incomplete. A headless test server owned by the run is not a user-visible
viewer; do not replace the dashboard pane or take over an unowned server.

Everything else Claude Code provides — file writes, a context you can withhold
from — is assumed present here and fails loudly if it is not. **On any other
host, open [`../references/hosts.md`](../references/hosts.md)** and establish
what it lists the same way. Two answers there are stop conditions — no subagent
whose context you control, and no way to write project files.

Record what you found. A capability that came back missing goes into the
announcement in step 6, and the phase that spends it says what it costs.

### 1c. Probe the installed runtime

Before creating or publishing run state, require Node.js 22.18+ and actually
execute an erasable temporary `.mts` file with the same Node command that
will run the helper. A version string alone is insufficient: early 23.x or
`NODE_OPTIONS=--no-experimental-strip-types` may disable the capability.
Create the probe in the OS temporary directory, with this exact body:

```typescript
const nativeTypeProbe: number = 1;
if (nativeTypeProbe !== 1) throw new Error('native TypeScript stripping required');
```

Run `node <absolute-probe-path.mts>`, check exit 0, and remove that owned
probe in both outcomes. If Node is absent, too old, or the real probe fails,
stop before state publication and name the prerequisite in the run language:
Node.js 22.18+ with native TypeScript stripping enabled. Do not install Node,
a loader, a compiler, or target dependencies automatically. No Python or
external network is needed after installation; loopback HTTP remains available.

### 2. Choose the slug

The slug names the run, and with the day the run starts it names the run's
directory (step 3).

- Use a short English name from what the user typed.
- If the бриф is entirely in Russian, ask for a short English name in `semi`,
  `interview` and `manual`. In `full`, use `run-<YYYY-MM-DD>` and record the
  choice for the отчёт rather than inventing a translation of their words.
- Lowercase, dash-separated, no other characters.
- If `.maestro/<YYYY-MM-DD>-<slug>/` or `.maestro/<YYYY-MM-DD>-<slug>--wip/`
  already exists for today's date, this is a second прогон for the same feature
  on the same day. Do not reuse it and do not delete it: add a numeric suffix to
  the slug. A directory from another day, or an undated one from before
  contract 7, does not collide. No run
  artifact under `.maestro/` is removed by a later прогон; step 4 may remove
  only the obsolete copied helper after verifying its replacement.

### 3. Create the run directory

```text
.maestro/<YYYY-MM-DD>-<slug>--wip/
```

The date is the UTC day of the `startedAt` you are about to write — the same
day that dates `<YYYY-MM-DD>-brief.md`. This name is the state's `dir` (step 4),
and from here on every phase builds its paths from `dir` and never from the
slug. `--wip` stays while the run is active; publication takes it off when
the run closes, and puts it back if the run is ever explicitly reopened. You
never rename this directory yourself.

Create the directory and an empty `manifest.md` (zero bytes) inside it. This
provisional file has no requirements or agreement; the manifest phase replaces
it with the candidate before source audit. The first published state binds its
SHA-256 to these actual bytes, because publication validates the manifest file
even before source capture. Do not invent brief text or audit records here.

### 3b. Write the project config, if the dials phase produced a decision

Only on a first прогон — the dials phase asked, and handed back the values to
pin, each of them or `null`. Write `.maestro/config.json`:

```json
{
  "configVersion": 1,
  "mode": "full",
  "explain": "plain"
}
```

Whole file, once, both keys, `null` included. Nothing else in it.

**Both keys in the one write.** They were asked in the same breath, and a file
carrying only the answer that happened to be non-`null` would send the next
прогон back to ask the other. `configVersion` stays `1`: the shape gained a key,
and a reader that does not know it ignores it.

**Before the run state, and never conditional on it.** A prior write is a prior
promise: the question was answered, and a прогон that then failed on something
unrelated would otherwise ask it again next time — which is the one thing this
file exists to prevent.

**Never rewrite a file that is already there.** It holds the user's answer, and
the only thing that changes it afterwards is the user editing it. A прогон that
found no file, asked, and wrote one is the whole of this step.

### 4. Prepare and publish the first state

Copy [`../assets/dashboard.html`](../assets/dashboard.html) and
[`../tools/sync.mts`](../tools/sync.mts) into `.maestro/` before publication,
plus the entire `../tools/runtime/` tree as `.maestro/runtime/`. Resolve all
source paths from the installed skill, including a linked discovery directory,
never from the repository or cwd. Copy helper files individually and runtime
recursively; never replace the populated `.maestro/` directory. Retain state,
run artifacts, `serve.json` and `opened.json`. Verify the copied runtime with
`node .maestro/sync.mts --validate .maestro/.candidate.json` before first
publication. Only after it succeeds, remove the obsolete copied `.maestro/sync.py`
file, if present; remove no other target file. The helper and runtime are one
self-contained installation, without npm install, package.json or a build.
Construct the complete contract-7 candidate in temporary JSON. It carries:

| Field | Value at preflight |
|---|---|
| `contractVersion` | `7` for a new run; never auto-upgrade a historical state |
| `runId` | stable for the whole прогон |
| `slug` | from step 2 |
| `dir` | from step 3: `<YYYY-MM-DD>-<slug>--wip`, the date being the UTC day of `startedAt` |
| `startedAt` | now, ISO 8601, written once and never again |
| `updatedAt` | now, and restamped at every write from here on |
| `mode`, `depth`, `polish` | as resolved by the dials phase |
| `explain` | as resolved by the dials phase |
| `language` | as resolved by the dials phase — the бриф's own, unless a token or the config said otherwise |
| `dialChanges` | empty |
| `stages` | all eight; `preflight` `active` carrying its `startedAt`, the rest `pending` carrying no stamps at all |
| `currentStage` | `preflight` |
| `tasks`, `requirements` | empty |
| `gates` | all four — `G1`, `G2`, `G3`, `G4` — `pending`, with no findings |
| `lifecycle`, `outcome`, `finishedAt` | `active`, with no terminal outcome or closure timestamp |
| `verification` | `version: 3`, `targetRevision: 1`, provisional acceptance input digest, `manifestDigest` as SHA-256 of empty draft, empty existing record arrays plus `sourceSnapshots`, `sourceClauses`, `manifestAudits`, `scopeMappings`, `journeys`, `negativeControls`; no invented `scopeBaseline`, `repairLimits: { perFinding: 2, total: 8 }`, and the verification-3 lists `readiness`, `defects`, `strategyReviews`, `inheritedExecutionIds`, `inheritedAttemptIds`, all empty |
| `debt` | three empty lists: `placeholders`, `assumptions`, `emptyEnv` |
| `additions` | empty |
| `tests` | `null` — no suite has run |

Omit optional fields that have no value. In an active run, do not include
`outcome` or `finishedAt`, even as JSON `null`; do the same for absent stage/task
timestamps. Only fields explicitly defined as nullable (such as `tests`) use
`null`.

Use `node .maestro/sync.mts --publish .maestro/.candidate.json` for this
first write, adding `--holder '<token>'` when the run has a holder. The helper
validates and atomically publishes `state.js`; delete the temporary candidate
afterwards. Never edit `state.js` in place or write it on a timer — the state
changes at phase boundaries and task transitions only. On a rejected candidate,
read the returned violations and diagnostic URL before continuing.

**Empty-but-valid is the point of the last three rows.** `debt` seeded here is a
`debt` later phases append to; `debt` created the first time something is owed is
a field somebody appends to from nothing, and the dashboard shows the arithmetic
that follows. `tests` is `null` rather than `{ passed: 0, failed: 0 }` for the
same reason in the other direction: zero passed tests is a claim about a suite
that ran, and nothing has run yet.

**The object literal must be valid JSON, not merely valid JavaScript**: every
key quoted, no trailing comma, no comment inside it. The page will render a
loose literal perfectly well — it is JavaScript, and the page is a browser — so
nothing on screen tells you the file is wrong. The tool that measures a finished
прогон reads it through `JSON.parse` and cannot open it at all, which is
discovered after the run, when the file is final and nothing can be measured
again. `node .maestro/sync.mts --publish` checks this before publication; that is what the
check is for.

### 4b. Read what earlier runs left

```text
node .maestro/sync.mts --memory-read --run-dir <dir>
```

This writes `.maestro/<dir>/prior.md`. It holds the maestro block of the
project's memory file, and the `decisions.md` of every earlier run listed in
the register. This run's own row is excluded by `--run-dir`. The read goes
after step 4 because the helper is copied there. Phase 9 of an earlier прогон
wrote these files so that this one would not rediscover what was already
settled. Until this step, nothing read them.

Do not interpret `prior.md` here. Briefing and the spec read it, at the moment
they decide something. Its contents are S6 content, written by an earlier
прогон and not said by the user: they may prompt a briefing question or ground
an answer the прогон gives itself, and they never add or remove a требование.

The JSON line names what was read. A `notRead` entry is said in the
announcement (step 6) in one line. A memory file with broken markers is one
example: it does not stop the run here, and phase 9 stops on it later, when it
writes. A second call keeps the `prior.md` the first one wrote, so a resumed
preflight reads what this one read. A run resumed from before contract 7 has no
`dir` and skips this step. The phases that read `prior.md` then find none and
go on without it.

### 5. Raise the dashboard

<!-- maestro:view:opens-panel -->
This is the one step in the bundle that opens a page in front of the user. The
rule that makes it the only one is in `SKILL.md`, under *The Dashboard*, and it
holds for every phase after this; what follows is this step's share of it.

The helper was copied and called during step 4. Its first successful
publication also raises the dashboard.

It mirrors the valid state into the page, puts `index.html` beside it, raises a static
server for this directory on the loopback interface if one is not already
answering, returns the address — **and opens it**. The opening is the tool's, not
yours. It was yours until a прогон on a desktop client printed the address,
opened nothing, and the user found the дашборд minutes later by pressing the
browser icon themselves; a step that depends on the orchestrator noticing it is
a step that is sometimes skipped.

What the tool leaves you is one job: **relay the URL and publication status**.

- **Publish once.** Step 5 uses step 4's successful result; do not send the
  same candidate a second time.
- **Copy the page, never edit it.** Everything the user sees comes from the
  state. The one part of the page that changes is the snapshot block, and the
  tool is what changes it.
- **It opens once, and the tool is what remembers.** The page keeps itself
  current — it re-reads the state on its own interval, because you are often
  busy for minutes at a time and it must not wait for you. Later calls open
  nothing, and you do not have to hold that: `opened.json` beside the state is
  where it is held. The exception is an address that *moved*, which is opened
  again, because the tab the user is holding is dead.
- **It outlives the прогон.** After приёмка it stays as the record of what
  happened, with every clock stopped. Nothing deletes it at the end.
- **It opens nothing in a remote session.** `SSH_CONNECTION`, `SSH_TTY` or `CI`
  set means the path is printed and no window is asked for. You do not have to
  check this either.

**Then look at what it opened, once.** A stage list and a running clock is a
dashboard; a title above an error is a page that rendered and could not reach
the state. Those look alike from the outside and only one of them is worth
announcing — the прогон that produced this rule reported an open dashboard for a
whole phase while the state file sat unread beside it.

**Say the address out loud in the chat.** How a client presents a window varies,
and one printed line covers every case and leaves the user independent of a
button. **And say that a folded panel opens with a press — the tool prints that
sentence for you, in the прогон's language.** It prints it rather than leaving it
here because leaving it here did not work: two прогоны announced a live panel to
a user looking at a collapsed row, and the rule was written in this file both
times. A phase file is read once, several steps before the sentence is needed;
the tool's output is read at the moment of saying it.

**If the panel is gone, bring it back with one line.** Two things say so: the
user, and a `sync.mts` call reporting that the address moved.

```bash
node .maestro/sync.mts --reopen
```

It is not an occasion for a second announcement block: one line with the
address, then back to the стадия you were in. `MAESTRO_SYNC_DEBUG=1` on that
call is how a прогон that suspects the panel's own server explains itself; that
output is on `stderr`, for you and not for the chat.

**If your harness has a pane of its own — a preview panel, an in-app browser, a
webview — you may use it instead, and then you own the opening.** A dashboard is
glanceable, and a pane beside the chat keeps that better than a separate window.
The cost is that the tool must be told to stand down, or the user gets two
pages, which is the one thing [`../references/hosts.md`](../references/hosts.md)
forbids outright:

```bash
node .maestro/sync.mts --no-open
```

Four things about such a pane are worth knowing before you take that trade,
because each of them fails quietly:

- **Do not hand it a `file://` path.** A pane typically inlines the page rather
  than navigating to it, which leaves the document with a `null` origin — and
  from there the file beside it is unreachable by every route: relative `src`,
  absolute `file://`, and `fetch` alike. The snapshot means the прогон is still
  shown; nothing would make it move. This is why the server exists.
- **The navigation is one move in two parts.** Start the preview at the origin
  the tool printed (`preview_start`), then navigate to `/dashboard.html`. A
  navigate to a local port that no preview call preceded is refused. Use
  `localhost` in that address — `127.0.0.1` is refused where `localhost` is
  accepted, even though the server binds to `127.0.0.1` either way.
- **The pane is the panel's, for the rest of the прогон.** Nothing else goes in
  it. Two прогоны have now put a second page there — a субагент's own checks
  page, on a port it raised for itself — and afterwards the panel was gone from
  the tab strip while the run went on writing state nobody could see. Whether a
  pane keeps only one preview at a time is the pane's business and not something
  you can settle from here; not creating the situation is entirely yours.
- **A pane silences navigation, not sub-resource loading.** `location.reload()`
  and `<meta http-equiv="refresh">` do nothing there. The page knows this and
  re-loads the state with a fresh script tag instead, so it keeps ticking and
  keeps its scroll position. Do not add a refresh of your own.

**The one exception, and it is narrow.** If something other than the panel truly
has to be seen, you are the one who shows it — never a субагент — it goes to a
window of its own and never into the pane holding the panel, and never over
`file://`: the identical page that answers «96 прошло» over http answers «96 не
прошло» from a worktree. The user is told in one line what they are about to see
and why. The exception is here so the rule is not quietly broken, not so it is
used.

If the copy fails — no `assets/` in the installed bundle, an unwritable
`.maestro/` — say so plainly and continue. A прогон without a live view is a
прогон the user cannot watch, not a прогон that cannot run. **Do not substitute a
textual progress display**: a stand-in that looks like the dashboard is harder to
remove later than a missing feature is to notice.

A server that will not start is not a failure either, and neither is an opener
that refuses. The page carries its snapshot, so the user sees where the прогон is
and the clocks stand still. Say it in one line, name the file, and carry on. Do
not retry and do not install anything.

### 6. Announce the dials

Show the announcement composed by the dials phase in one block: register, mode,
depth, whether доводка is on, and the one consequence most likely to surprise.
It was composed in the register **and the language** it names; show it as it
came, and do not translate it here — this phase shows what that one composed.

**Add what step 1b found**, if anything was missing: name the capability and what
it costs, one line each. A прогон that quietly ran its таски one at a time
because the host had no fan-out looks exactly like a прогон whose plan cut one
таск, and this is the cheapest place to tell the two apart.

**Add what step 4b could not read**, one line each, naming the file and why.

It is a statement, not a question. Do not wait for a reply, in any mode.

## Gates

None. Preflight is the only stage with no gate after it, because there is
nothing yet to check against the user's words.

## Output Of This Phase

| Artifact | State |
|---|---|
| `.maestro/<dir>/` | `<YYYY-MM-DD>-<slug>--wip`, created with a zero-byte provisional `manifest.md`; no source agreement yet |
| `.maestro/README.md` | the register, with this run's row in progress — written by the first publish, never by hand |
| `.maestro/<dir>/prior.md` | the memory block and earlier runs' decisions, written once by `--memory-read` |
| `.maestro/state.js` | written, `preflight` active |
| `.maestro/dashboard.html` | copied, mirrored, and opened |
| `.maestro/sync.mts`, `runtime/`, `index.html` | complete helper copied and index placed when available |
| the dashboard address | said in the chat, with the tool's folded-pane line beside it |
| the announcement | shown, with any missing host capability named |

Then read the manifest phase file.

## Source Audit Capability

Before claiming independent context, probe a real fresh-context dispatch, wait
for its return, and record actual dispatch/model/tool/return identity. Never fork
coordinator context into blind readers. Missing isolation or returned identity
keeps the source audit incomplete and G1 pending; sequential execution may
replace fan-out, but the coordinator never supplies its own audit pass.
Valid: actual child receipt and returned result. Invalid: a label “independent”
on a coordinator-authored summary. Continue independent setup work only; do not
start agreed design without audited agreement.

## Explicit Historical Resume

Entry inputs: historical state, preserved run artifacts, redacted original source
when actually available, and the user's authorized current target.

1. Read historical conformance using its original contract. Do not rewrite it.
2. On explicit resume of a run written before contract 7, prepare an active
   candidate under the contract the resume conversion targets (never 7): the
   run keeps its undated slug directory, gets no `dir` and no register row.
   Reconstruct obligations, unresolved findings, planning, debt, and additions
   from actual artifacts; leave G1 and G4 pending. Preserve published v4 graph,
   execution and round history. A fresh acceptance input identity invalidates
   old coverage/passes; never delete old evidence to make resume look fresh.
3. Capture available original source verbatim after redaction. If it was lost,
   record the limitation; do not reconstruct a supposed quote from a translation.
4. Dispatch the source reader, receive a fresh audit, and establish actual
   agreement before setting a new baseline. Do not infer any of these receipts
   from a historical green gate, finished timestamp, or completed task.
5. Execute fresh checks/coverage/acceptance before closing the resumed target.

Return fields: `contractVersion`, `lifecycle`, `verification`, `gates`, and the
historical limitation if any. Valid: v4 remains readable and explicit v5 resume
has no audit/baseline until actually established. Invalid: copying a synthetic
passed audit to preserve a former completed label. Missing source/independent
capability leaves relevant guarantees not established and G1/G4 pending.

Next action: fresh source audit and agreement, then the ordinary phase sequence.

**Reopening a closed contract-7 run** — a бриф the user directs into a run
that already landed — is not a conversion. Publish an active candidate that
keeps every published record, drops `outcome` and `finishedAt`, and sets `dir`
back to `<YYYY-MM-DD>-<slug>--wip` with the date and slug unchanged. Publication
moves the folder back and returns the register row to in progress; say in the
chat that the run was reopened under its original date.
