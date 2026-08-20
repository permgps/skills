# Changelog

Every released version of this repository, newest first.

A release here is an annotated git tag on the commit that carries its own version
bump. Nothing installs by tag — `npx skills add permgps/skills` reads the default
branch — so a tag names a moment for people rather than an artifact anyone
downloads. Pushing `main` is what actually ships.

The numbers are deliberately below `v0.1.0`. Four прогона have carried a бриф to
a finished отчёт with all four gates passed, but one of the four modes has never
been run at all and two findings about concurrent orchestrators stand open. A
number that claimed more than that would be claiming it falsely.

## Unreleased

**A прогон says who is holding it, and a writer that lost a race says so instead
of overwriting.** `state.js` carries an optional `heldBy` — a token the session
mints when it opens a прогон that has none, and the moment it minted it — and
`SKILL.md` tells the orchestrator to re-read the state immediately before every
write and compare `updatedAt` with the value it last read. `scripts/state/write.ts`
refuses such a write outright. It **detects** a second orchestrator rather than
preventing one, and that limit is written where the field is defined: nothing
here can expire a lease, and a claim that refused would strand the next session
in front of a прогон it cannot touch. Two sessions drove one прогон on
2026-08-20 and neither had a way to notice.

**A таск's commits are a list, because a repaired таск has two.**
`tasks[].commit` became `tasks[].commits` and `contractVersion` went to `3`. A
review reads the union of a таск's commits over that таск's own files —
`git diff <first>^..<last>` — and explicitly not the tree, which by the time a
repair lands carries every wave that followed the original. The repair phase
appends rather than replaces, so the commit the first review was written against
stays findable. The plan phase closes the cheap half: a *done means* item is
answerable against the таск's own diff, which three items of a real таск were
not. The dashboard needed no field handling — it never read that field — but its
own copy of the version number moved with the contract, and
`state-matches-spec.ts` now holds the two together so the copy cannot be left
behind quietly.

**The прогон owns exactly one page on the user's screen, and it is the
dashboard.** No субагент opens a page or raises a server on a port of its own, a
question that can only be answered by looking at a rendered page is either
answered without a viewer or written down unanswered, and the one route for
something that truly has to be seen is in `phases/0-preflight.md`. The rule is
stated once in `SKILL.md` and carried in its own words by each of the six
prompts. `npm run view` holds it: a marker scan for the three roles a document
can have, plus a literal scan of the phase files for an address, because a phase
that starts instructing an open has no reason to declare it.

**`sync.py` says when the panel's address moved.** It always had three cases and
only ever showed one. A live server of ours keeps its address silently; a dead
server whose port is still free gets the same address again, also silently,
because the link the user is holding still works; a port taken by a stranger
gets a new address with a line above it naming the dead one, in the прогон's own
language, and `previousPort` in `serve.json` so the move survives the call that
made it.

**A стадия explains itself.** Every region of the dashboard carries an `i` that
says what it is showing, written in whichever register the project chose, and a
прогон that has fallen silent now says how long it has been silent and what
restarts it. `npm run dashboard` fails a стадия that cannot explain itself and a
synonym the vocabulary does not allow.

**The тасks card counts what is in flight.** The build's progress bar measures a
share of the work rather than a count of finished таски, a passed gate's findings
are shown as a record instead of an alarm, and `sync.py` refuses a state whose
statuses are not the contract's — the only place a real прогон can catch that at
all, since `scripts/state/validate.ts` does not travel into `.maestro/`.

## v0.0.2-alpha — 2026-08-20

**The panel and the прогон speak the user's language.** A language dial (`ru` /
`en`) joins mode and depth; the бриф can choose it, the state carries it, and the
dashboard ships both vocabularies in the page and paints the one it is told. The
reader can also switch the panel's theme between day and night.

**A project can ask to be spoken to plainly.** The register dial (`plain` /
`normal`) is asked before the question about how much to ask, and it changes every
sentence the user is shown, in every stage — no `G2`, no shorthand.

**Fixes to what a state may claim.** A стадия's status is now held to the clock it
claims, closing one стадия and opening the next happens in one write, and a
стадия nobody closed is a finding rather than a silence.

### `v0.0.1` was skipped, not lost

`v0.0.1-alpha` sits one commit below the bump that made the version
`0.0.1-alpha`, and it was already on `origin` when that was noticed. Moving a
published tag costs a force-push; stepping over the gap costs a version number.
The misplaced tag stays where it is as a historical marker and the next release
was numbered `0.0.2-alpha` on the commit carrying its own bump.

## v0.0.1-alpha — 2026-08-20

The first tagged alpha. One Agent Skill: installing it copies a directory of
Markdown, and nothing is compiled or run at install time.

**The phases.** `0-dials` and `0-preflight` through `9-memory` — dials, preflight,
manifest, briefing, specification, plan, build, review, acceptance, polish,
repair and memory. Four modes (`full`, `semi`, `interview`, `manual`) and three
depths (`strict`, `normal`, `deep`), with the rule that no mode removes a
manifest gate or a safety gate. The mode a прогон starts in can be pinned per
project, in that project's `.maestro/config.json`, where updating the skill
cannot erase it.

**Four gates.** `G1` through `G4`, the last one run blind: acceptance reads the
user's original numbered требования with the specification withheld, and answers
what it could not check rather than guessing.

**The dashboard.** One self-contained HTML page, offline, no CDN, reading the run
state on its own: stage timeline, current таск, live clocks, dependencies and
requirement coverage. `tools/sync.py` mirrors the state into it, keeps it
reachable on the loopback, and says the address.

**Parallel executors.** Fan-out with worktree isolation, the rule that the
orchestrator never writes the project's code, and handoff files for a таск that
outgrows one context.

**The repair path.** A таск that comes back anything other than done routes to
`8-repair.md`; a gate failure opens `references/failure-modes.md`, the checklist
of excuses and red flags, instead of keeping it resident.

**Measuring a finished прогон.** `scripts/metrics/measure.ts` reads a run's
`state.js` and reports durations, coverage and gate outcomes.

**Other hosts.** Codex and Gemini CLI each have their execution model mapped in
`docs/spec/hosts.md`. Both install into the same `./.agents/skills/` directory
and both rows say *unverified*: installing proves the skills directory and
nothing else.
