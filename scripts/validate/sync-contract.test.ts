// The tests `sync.mts` has.
//
// It is the only executable this repository copies into a real прогон, and it
// is the only place a status the contract does not define can be caught while
// the run is still going. `npm run check` reads none of it — `bundle-integrity`
// walks `.md` — so without this file the check that guards a прогон is itself
// unguarded.
//
// Two things are held here. What it *says*: the address, the line that says a
// folded pane opens with a press, the line that says the address moved, and the
// complaint about a status the contract does not define. And what it *does*
// with the port between calls, which is the half a single run cannot show.
//
// The script is driven as a process rather than imported, because what is under
// test is its exit code and what it prints: a run's orchestrator reads exactly
// those two things and nothing else.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import net from 'node:net';
import { mkdtemp, mkdir, writeFile, copyFile, readFile, rm, unlink, cp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CAPTURES, CONTROL_CAPTURES, SOURCE_MANIFEST, sha256, planningOwnershipState, correctedSourceAuditState, deferredScopeState, sourceVerifiedState, controlledState, verifiedState } from '../state/fixtures/verification.ts';
import { prepareLegacyResume } from '../state/projection.ts';

const SYNC = 'skills/maestro/tools/sync.mts';
const PAGE = 'skills/maestro/assets/dashboard.html';

const STATE = {
  contractVersion: 2,
  runId: 'r1',
  slug: 'landing-page',
  startedAt: '2026-08-19T10:00:00.000Z',
  updatedAt: '2026-08-19T12:00:00.000Z',
  mode: 'semi',
  depth: 'normal',
  polish: false,
  dialChanges: [],
  currentStage: 'build',
  stages: [{ id: 'build', status: 'active' }],
  tasks: [{ id: '01', status: 'review' }, { id: '02', status: 'queued' }],
  requirements: [{ id: 'R01', status: 'in-spec' }],
  gates: [{ id: 'G1', status: 'passed' }],
  debt: { placeholders: [], assumptions: [], emptyEnv: [] },
  additions: [],
  tests: { passed: 3, failed: 0 },
};

interface Outcome { status: number; out: string; err: string }

/**
 * The environment every test runs the script in unless it says otherwise.
 *
 * `MAESTRO_SYNC_NO_OPEN` is not a nicety: without it the script opens a browser
 * window, and `npm run test` would open one per test on the machine running it.
 * A test that wants to watch the opening injects a fake one instead of removing
 * this — see `opener()`.
 */
const SEALED = { MAESTRO_SYNC_NO_OPEN: '1' };

/** The new machine-readable modes put one JSON object on stdout. */
function jsonResult(outcome: Outcome): Record<string, unknown> {
  return JSON.parse(outcome.out.split('\n')[0] ?? '{}') as Record<string, unknown>;
}

async function addV4Captures(root: string): Promise<void> {
  for (const [relative, body] of Object.entries(CAPTURES)) {
    const filename = path.join(root, 'synthetic-menu', relative);
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, body);
  }
}

/** Run the script with the sealed environment, plus whatever a test adds. */
function run(script: string, extra: Record<string, string>, args: string[] = []): Outcome {
  const done = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...SEALED, ...extra },
  });
  return { status: done.status ?? -1, out: done.stdout ?? '', err: done.stderr ?? '' };
}

/**
 * An opener that records instead of opening.
 *
 * Written into the directory under test and handed to the script through
 * `MAESTRO_SYNC_OPENER`, so what a test asserts is the url the script decided
 * to open — the decision — and never a window that actually appeared.
 */
async function opener(root: string): Promise<Record<string, string>> {
  const script = path.join(root, 'opener fixture.mjs');
  await writeFile(script, "import { appendFileSync } from 'node:fs'; appendFileSync(" + JSON.stringify(path.join(root, 'opened.log')) + ", process.argv[2] + '\\n');\n");
  return { MAESTRO_SYNC_OPENER: JSON.stringify(process.execPath) + ' ' + JSON.stringify(script), MAESTRO_SYNC_NO_OPEN: '', CI: '', SSH_CONNECTION: '', SSH_TTY: '' };
}

/** Every url the fake opener was handed, in order. */
async function opened(root: string): Promise<string[]> {
  try {
    return (await readFile(path.join(root, 'opened.log'), 'utf8')).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * The urls, once there are at least `expected` of them.
 *
 * The script detaches the opener and does not wait for it — it must not, since
 * `open` can outlive the call — so the log lands a moment after the process
 * exits. This waits for that moment instead of asserting into a race.
 */
async function openedAfter(root: string, expected: number): Promise<string[]> {
  for (let attempt = 0; attempt < 250; attempt += 1) {
    const seen = await opened(root);
    if (seen.length >= expected) return seen;
    await new Promise((wait) => setTimeout(wait, 20));
  }
  return opened(root);
}

/** Long enough that an opener which was going to run would have run. */
const settle = (): Promise<void> => new Promise((done) => setTimeout(done, 400));

/**
 * Run sync.mts over a state, in a directory of its own, and stop the server it
 * raises. Leaving that server running would leak a detached process per test.
 */
async function sync(state: unknown): Promise<Outcome> {
  const root = await mkdtemp(path.join(tmpdir(), 'sync-contract-'));
  try {
    await copyFile(SYNC, path.join(root, 'sync.mts'));
  await cp('skills/maestro/tools/runtime', path.join(root, 'runtime'), { recursive: true });
    await copyFile(PAGE, path.join(root, 'dashboard.html'));
    await writeFile(
      path.join(root, 'state.js'),
      `globalThis.MAESTRO_STATE = ${JSON.stringify(state)};\n`,
      'utf8',
    );

    return run(path.join(root, 'sync.mts'), {});
  } finally {
    try {
      const record = JSON.parse(await readFile(path.join(root, 'serve.json'), 'utf8')) as
        { pid?: number };
      if (typeof record.pid === 'number') process.kill(record.pid, 'SIGTERM');
    } catch {
      // No server was raised, or it is already gone. Either is fine.
    }
    await rm(root, { recursive: true, force: true });
  }
}

/**
 * A directory `sync.mts` can be called in more than once.
 *
 * The port tests are about what happens *between* calls — the address it hands
 * out the second time, and whether it says anything about the first — so they
 * cannot use `sync()`, which throws its directory away after one run.
 */
interface Session {
  root: string;
  run(extra?: Record<string, string>, args?: string[]): Promise<Outcome>;
  record(): Promise<{ pid: number; port: number; previousPort?: number }>;
  page(): Promise<string>;
  dispose(): Promise<void>;
}

async function session(state: unknown, raw?: string): Promise<Session> {
  const root = await mkdtemp(path.join(tmpdir(), 'sync-session-'));
  await copyFile(SYNC, path.join(root, 'sync.mts'));
  await cp('skills/maestro/tools/runtime', path.join(root, 'runtime'), { recursive: true });
  await copyFile(PAGE, path.join(root, 'dashboard.html'));
  if (raw !== undefined) {
    await writeFile(path.join(root, 'state.js'), raw, 'utf8');
  } else if (state !== null) {
    await writeFile(
      path.join(root, 'state.js'),
      `globalThis.MAESTRO_STATE = ${JSON.stringify(state)};\n`,
      'utf8',
    );
  }

  // Every pid the script ever recorded here, not only the last one: a call that
  // moves the address leaves the previous server behind if it is still alive.
  const raised = new Set<number>();

  const record = async (): Promise<{ pid: number; port: number; previousPort?: number }> =>
    JSON.parse(await readFile(path.join(root, 'serve.json'), 'utf8')) as
      { pid: number; port: number; previousPort?: number };

  return {
    root,
    async run(extra: Record<string, string> = {}, args: string[] = []) {
      const done = run(path.join(root, 'sync.mts'), extra, args);
      try {
        raised.add((await record()).pid);
      } catch {
        // No server was raised. The exit-code tests below expect exactly that.
      }
      return done;
    },
    record,
    page: () => readFile(path.join(root, 'dashboard.html'), 'utf8'),
    async dispose() {
      for (const pid of raised) {
        try {
          process.kill(pid, 'SIGTERM');
        } catch {
          // Already gone.
        }
      }
      await rm(root, { recursive: true, force: true });
    },
  };
}

/** Hold a port the way an unrelated program would — nothing to do with this run. */
function occupy(port: number): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const held = net.createServer();
    held.once('error', reject);
    held.listen(port, '127.0.0.1', () => resolve(held));
  });
}

/** Kill a server and wait for its port to actually come free before asking again. */
async function stop(pid: number, port: number): Promise<void> {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // Already gone.
  }
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      const probe = await occupy(port);
      await new Promise<void>((done) => probe.close(() => done()));
      return;
    } catch {
      await new Promise((wait) => setTimeout(wait, 20));
    }
  }
  throw new Error(`port ${port} never came free`);
}

/** The line that says the address moved, wherever it is, or -1. */
const news = (out: string): number => out.search(/сменился|new address/);

test('a state whose statuses are all the contract\'s passes', async () => {
  const done = await sync(STATE);
  assert.equal(done.status, 0, done.out);
  assert.match(done.out, /http:\/\/localhost:\d+\/dashboard\.html/);
});

test('the address is followed by the line that says a folded pane opens', async () => {
    // Twice now a прогон has raised the panel, reported it live, and left the
    // user looking at a collapsed row they had to find by pressing it. The
    // instruction to say so was already written in the phase file both times,
    // which is what makes it a bad place for it: what the прогон relays is what
    // the tool printed, so the sentence belongs beside the address.
    const done = await sync(STATE);
    assert.equal(done.status, 0, done.out);
    const address = done.out.indexOf('http://localhost');
    const hint = done.out.search(/нажат|press/);
    assert.ok(hint !== -1, `nothing tells the user a folded pane opens: ${done.out}`);
    assert.ok(address < hint, `the address must come first: ${done.out}`);
  });

test('the folded-pane line is in the language the прогон speaks', async () => {
    const russian = await sync({ ...STATE, language: 'ru' });
    assert.match(russian.out, /нажат/);
    const english = await sync({ ...STATE, language: 'en' });
    assert.match(english.out, /press/);
    assert.doesNotMatch(english.out, /нажат/);
    // A прогон written before the language field existed is Russian, which is
    // what the page falls back to as well.
    const older = await sync(STATE);
    assert.match(older.out, /нажат/);
  });

test('the state reaches the page beside it, so a pane with no address still shows the прогон', async () => {
    const run = await session(STATE);
    try {
      const done = await run.run();
      assert.equal(done.status, 0, done.out);
      assert.match(done.out, /http:\/\/localhost:\d+\/dashboard\.html/);
      const page = await run.page();
      assert.match(page, /globalThis\.MAESTRO_SNAPSHOT = \{/);
      assert.match(page, /"runId": ?"r1"|runId": "r1"/);
    } finally {
      await run.dispose();
    }
  });

test('a second call with the server still up hands back the same address, and says nothing about it', async () => {
    const run = await session(STATE);
    try {
      const first = await run.run();
      const port = (await run.record()).port;
      const second = await run.run();
      assert.equal(second.status, 0, second.out);
      assert.ok(second.out.includes(`http://localhost:${port}/dashboard.html`),
        `the address moved while its server was alive: ${first.out} -> ${second.out}`);
      assert.equal(news(second.out), -1, `nothing moved, so nothing is news: ${second.out}`);
    } finally {
      await run.dispose();
    }
  });

test('a server that died is raised again at the address the user already has', async () => {
    // The link was announced in the chat and may be open in front of somebody.
    // A restart that keeps the port costs them nothing and is not worth a word.
    const run = await session(STATE);
    try {
      await run.run();
      const before = await run.record();
      await stop(before.pid, before.port);

      const again = await run.run();
      assert.equal(again.status, 0, again.out);
      assert.ok(again.out.includes(`http://localhost:${before.port}/dashboard.html`),
        `a free port was not reused: ${again.out}`);
      assert.equal(news(again.out), -1, `the address did not move: ${again.out}`);
      assert.equal((await run.record()).previousPort, undefined);
    } finally {
      await run.dispose();
    }
  });

test('a port taken by something else moves the address, and the move is said before it', async () => {
    // F13: this used to print a new address in exactly the shape of the old
    // one. The user was left pressing a dead link with nothing anywhere saying
    // why, and `serve.json` had already forgotten the address it replaced.
    const run = await session(STATE);
    let stranger: net.Server | null = null;
    try {
      await run.run();
      const before = await run.record();
      await stop(before.pid, before.port);
      stranger = await occupy(before.port);

      const moved = await run.run();
      assert.equal(moved.status, 0, moved.out);
      const after = await run.record();
      assert.notEqual(after.port, before.port, `the taken port was handed out again: ${moved.out}`);
      assert.equal(after.previousPort, before.port,
        'serve.json must remember the address this one replaced');

      const said = news(moved.out);
      assert.ok(said !== -1, `the address moved and nothing said so: ${moved.out}`);
      assert.ok(moved.out.includes(`http://localhost:${before.port}/dashboard.html`),
        `the dead address is not named, so the user cannot match it: ${moved.out}`);
      assert.ok(said < moved.out.indexOf(`http://localhost:${after.port}/dashboard.html`),
        `the news must come above the new address: ${moved.out}`);
    } finally {
      if (stranger !== null) await new Promise<void>((done) => stranger!.close(() => done()));
      await run.dispose();
    }
  });

test('the moved-address line is in the language the прогон speaks', async () => {
    for (const [language, expected] of [['ru', /сменился/], ['en', /new address/]] as const) {
      const run = await session({ ...STATE, language });
      let stranger: net.Server | null = null;
      try {
        await run.run();
        const before = await run.record();
        await stop(before.pid, before.port);
        stranger = await occupy(before.port);
        const moved = await run.run();
        assert.match(moved.out, expected, `the ${language} run was told in the wrong language`);
      } finally {
        if (stranger !== null) await new Promise<void>((done) => stranger!.close(() => done()));
        await run.dispose();
      }
    }
  });

test('a state that is valid JavaScript but not valid JSON still shows the address', async () => {
    // The page is the forgiving reader and the metrics tool is the strict one.
    // The прогон is worth showing either way, so the address comes first and the
    // complaint after it — and the exit code still carries the bad news.
    const run = await session(null, 'globalThis.MAESTRO_STATE = { currentStage: "build" };\n');
    try {
      const done = await run.run();
      assert.equal(done.status, 1, done.out);
      const address = done.out.search(/http:\/\/localhost:\d+\/dashboard\.html/);
      const complaint = done.out.indexOf('not valid JSON');
      assert.ok(address !== -1, `a readable прогон was hidden: ${done.out}`);
      assert.ok(complaint !== -1, `nothing named the defect: ${done.out}`);
      assert.ok(address < complaint, `the address must come first: ${done.out}`);
    } finally {
      await run.dispose();
    }
  });

test('no state.js beside the script is exit 2, and no server is raised', async () => {
    const run = await session(null);
    try {
      const done = await run.run();
      assert.equal(done.status, 2, done.out);
      assert.doesNotMatch(done.out, /http:\/\/localhost/);
      await assert.rejects(run.record(), 'a server was raised for a run that does not exist yet');
    } finally {
      await run.dispose();
    }
  });

test('a таск written `pending` is named, and the run is told', async () => {
  // The defect exactly as a real прогон wrote it: `pending` is a стадия's word
  // and a гейт's, and the phase file that cuts таски never said otherwise.
  const done = await sync({
    ...STATE,
    tasks: [{ id: '01', status: 'review' }, { id: '02', status: 'pending' }],
  });
  assert.equal(done.status, 1, done.out);
  assert.match(done.out, /tasks\[1\]\.status is "pending"/);
  assert.match(done.out, /the contract allows queued, running, review, repair, done, failed/);
});

test('the address comes first, because a wrong status is still worth showing', async () => {
    const done = await sync({ ...STATE, gates: [{ id: 'G1', status: 'green' }] });
    assert.equal(done.status, 1, done.out);
    const address = done.out.indexOf('http://localhost');
    const finding = done.out.indexOf('gates[0].status');
    assert.ok(address !== -1 && address < finding,
      `the дашборд must be reachable before the complaint: ${done.out}`);
  });

test('an entry with no status at all is reported too', async () => {
  // Absent is as uncountable on the page as wrong, and the contract requires it.
  const done = await sync({ ...STATE, stages: [{ id: 'build' }] });
  assert.equal(done.status, 1, done.out);
  assert.match(done.out, /stages\[0\]\.status is null/);
});

test('every offender is named, not just the first', async () => {
  const done = await sync({
    ...STATE,
    tasks: [{ id: '01', status: 'pending' }, { id: '02', status: 'blocked' }],
  });
  assert.equal(done.status, 1, done.out);
  assert.match(done.out, /tasks\[0\]\.status is "pending"/);
  assert.match(done.out, /tasks\[1\]\.status is "blocked"/);
});

// What it *reads out loud*. Three fields of the state reach the panel word for
// word, so they are the three the прогон writes in the dial's language while
// every other file it writes stays English. The rule is in `SKILL.md` under
// *Language*; these are what hold it. A прогон on 2026-08-22 spoke `ru`, wrote
// its таск titles in Russian and all seventeen of its gate findings in English,
// and nothing anywhere noticed.

test('a finding written in English while the прогон speaks Russian is named', async () => {
    const done = await sync({
      ...STATE,
      language: 'ru',
      gates: [{ id: 'G1', status: 'passed', findings: ['Every one of the 392 requirements carries a status'] }],
    });
    assert.equal(done.status, 1, done.out);
    assert.match(done.out, /gates\[0\]\.findings\[0\] has no Russian in it/);
    assert.match(done.out, /this прогон speaks ru/);
  });

test('the finding itself is quoted, because the line is what has to be rewritten', async () => {
    const done = await sync({
      ...STATE,
      language: 'ru',
      gates: [{ id: 'G1', status: 'passed', findings: ['The room half recorded as a partial debt row'] }],
    });
    assert.equal(done.status, 1, done.out);
    assert.match(done.out, /The room half recorded as a partial debt row/);
  });

test('a finding in the прогон\'s own language raises nothing', async () => {
    const done = await sync({
      ...STATE,
      language: 'ru',
      gates: [{ id: 'G1', status: 'passed', findings: ['R009 — комната записана отдельной строкой долга'] }],
    });
    assert.equal(done.status, 0, done.out);
  });

test('a таск title and a стадия note are held to the same rule as a finding', async () => {
    const done = await sync({
      ...STATE,
      language: 'ru',
      stages: [{ id: 'build', status: 'active', note: 'waiting on the solver seam' }],
      tasks: [{ id: '01', status: 'review', title: 'Data model: types, schemas and rules' }],
    });
    assert.equal(done.status, 1, done.out);
    assert.match(done.out, /tasks\[0\]\.title has no Russian in it/);
    assert.match(done.out, /stages\[0\]\.note has no Russian in it/);
  });

test('the fields the panel never prints as text are left alone', async () => {
    // `debt` reaches the page as three counts and `additions` is not rendered
    // there at all, so English in them is the rule rather than a breach of it.
    const done = await sync({
      ...STATE,
      language: 'ru',
      debt: { placeholders: ['R009 — the room half only'], assumptions: ['R390 — four open questions'], emptyEnv: [] },
      additions: ['R003 — a restart action on the timetable screen'],
      requirements: [{ id: 'R01', status: 'dropped', reason: 'out of scope for M0' }],
    });
    assert.equal(done.status, 0, done.out);
  });

test('an English прогон is not held to the mirror of the rule', async () => {
    // Deliberate: an English finding quoting the user's Russian sentence is
    // correct, and a script-based check cannot tell it from a breach. The `ru`
    // half is decidable and is checked; the `en` half is not and is not.
    const done = await sync({
      ...STATE,
      language: 'en',
      gates: [{ id: 'G1', status: 'passed', findings: ['R002 — «Расписание» was the user\'s own word'] }],
    });
    assert.equal(done.status, 0, done.out);
  });

test('a state written before the language dial existed is not held to the rule', async () => {
    // The contract makes `language` optional, and a reader supplying `ru` on the
    // writer's behalf would be reporting a choice nobody made.
    const done = await sync({
      ...STATE,
      gates: [{ id: 'G1', status: 'passed', findings: ['Every requirement carries a status'] }],
    });
    assert.equal(done.status, 0, done.out);
  });

test('version-4 candidate validates and publishes atomically through the copied helper', async () => {
    const target = await session(null);
    try {
      const state = verifiedState();
      await addV4Captures(target.root);
      const candidate = path.join(target.root, 'candidate.json');
      await writeFile(candidate, JSON.stringify(state));
      const checked = await target.run({}, ['--validate', candidate]);
      assert.equal(checked.status, 0, checked.out);
      assert.equal(jsonResult(checked)['status'], 'valid');
      assert.deepEqual((jsonResult(checked)['projection'] as Record<string, unknown>)['requirementResults'],
        { R01: 'passed' });

      const published = await target.run({}, ['--publish', candidate, '--no-open']);
      assert.equal(published.status, 0, published.out);
      assert.equal(jsonResult(published)['status'], 'published');
      assert.match(await readFile(path.join(target.root, 'state.js'), 'utf8'), /"outcome": "completed"/);
      const projected = await target.run({}, ['--project', path.join(target.root, 'state.js')]);
      assert.equal(projected.status, 0, projected.out);
      assert.equal(jsonResult(projected)['verificationEstablished'], true);
    } finally {
      await target.dispose();
    }
  });

test('version-4 invalid first candidate exposes diagnostics without publishing a green state', async () => {
    const target = await session(null);
    try {
      const state = verifiedState();
      state.gates[3]!.status = 'failed';
      await addV4Captures(target.root);
      const candidate = path.join(target.root, 'candidate.json');
      await writeFile(candidate, JSON.stringify(state));
      const done = await target.run({}, ['--publish', candidate, '--no-open']);
      assert.equal(done.status, 1, done.out);
      assert.equal(jsonResult(done)['status'], 'rejected');
      assert.match(await readFile(path.join(target.root, 'validation.js'), 'utf8'), /"status"\s*:\s*"invalid"/);
      assert.match(await readFile(path.join(target.root, 'dashboard.html'), 'utf8'),
        /MAESTRO_VALIDATION_SNAPSHOT = .*"candidateRevision"\s*:\s*"2026-09-29T09:20:00Z"/);
      await assert.rejects(readFile(path.join(target.root, 'state.js'), 'utf8'));
      assert.match(String(jsonResult(done)['url']), /dashboard\.html/);
    } finally {
      await target.dispose();
    }
  });

test('version-4 publication refuses a changed capture and keeps its prior coherent state', async () => {
    const target = await session(null);
    try {
      const state = verifiedState();
      await addV4Captures(target.root);
      const candidate = path.join(target.root, 'candidate.json');
      await writeFile(candidate, JSON.stringify(state));
      assert.equal((await target.run({}, ['--publish', candidate, '--no-open'])).status, 0);
      const before = await readFile(path.join(target.root, 'state.js'), 'utf8');
      await writeFile(path.join(target.root, 'synthetic-menu', 'evidence/X-1/pointer.txt'), 'tampered');
      const changed = { ...state, updatedAt: '2026-09-29T09:21:00Z' };
      await writeFile(candidate, JSON.stringify(changed));
      const rejected = await target.run({}, ['--publish', candidate, '--expect', state.updatedAt!, '--no-open']);
      assert.equal(rejected.status, 1, rejected.out);
      assert.equal(jsonResult(rejected)['status'], 'rejected');
      assert.match(String(jsonResult(rejected)['url']), /dashboard\.html/);
      assert.match(await readFile(path.join(target.root, 'dashboard.html'), 'utf8'),
        /MAESTRO_VALIDATION_SNAPSHOT = .*"candidateRevision"\s*:\s*"2026-09-29T09:21:00Z"/);
      assert.equal(await readFile(path.join(target.root, 'state.js'), 'utf8'), before);
    } finally {
      await target.dispose();
    }
  });

test('version-4 publication rejects stale revisions and unrelated holders', async () => {
    const target = await session(null);
    try {
      const state = verifiedState();
      state.heldBy = { token: 'session-1', since: state.startedAt };
      await addV4Captures(target.root);
      const candidate = path.join(target.root, 'candidate.json');
      await writeFile(candidate, JSON.stringify(state));
      assert.equal((await target.run({}, ['--publish', candidate, '--holder', 'session-1', '--no-open'])).status, 0);
      const changed = { ...state, updatedAt: '2026-09-29T09:22:00Z' };
      await writeFile(candidate, JSON.stringify(changed));
      const stale = await target.run({}, ['--publish', candidate, '--expect', 'older', '--holder', 'session-1', '--no-open']);
      assert.equal(stale.status, 1);
      assert.ok((jsonResult(stale)['violations'] as { field: string }[]).some(item => item.field === 'updatedAt'));
      const stranger = await target.run({}, ['--publish', candidate, '--expect', state.updatedAt!, '--holder', 'session-2', '--no-open']);
      assert.equal(stranger.status, 1);
      assert.ok((jsonResult(stranger)['violations'] as { field: string }[]).some(item => item.field === 'heldBy'));
      const accepted = await target.run({}, ['--publish', candidate, '--expect', state.updatedAt!, '--holder', 'session-1', '--no-open']);
      assert.equal(accepted.status, 0, accepted.out);
    } finally {
      await target.dispose();
    }
  });

test('legacy projection remains unverified and malformed nested candidates are rejected', async () => {
    const target = await session(null);
    try {
      const candidate = path.join(target.root, 'candidate.json');
      await writeFile(candidate, JSON.stringify(STATE));
      const legacy = await target.run({}, ['--project', candidate]);
      assert.equal(legacy.status, 0, legacy.out);
      assert.equal(jsonResult(legacy)['verificationEstablished'], false);
      const malformed = verifiedState();
      malformed.verification!.checks[0]!.currentFingerprint.inputHashes = null as never;
      await writeFile(candidate, JSON.stringify(malformed));
      const checked = await target.run({}, ['--validate', candidate]);
      assert.equal(checked.status, 1, checked.out);
      assert.equal(jsonResult(checked)['status'], 'invalid');
    } finally {
      await target.dispose();
    }
  });

test('version-4 copied runtime preserves closure and incomplete-control fixture outcomes', async () => {
    const target = await session(null);
    try {
      await addV4Captures(target.root);
      const candidate = path.join(target.root, 'candidate.json');
      const passing = verifiedState();
      const failed = structuredClone(passing);
      failed.verification!.executions[0]!.result = 'failed';
      failed.gates[3]!.status = 'failed';
      const exception = structuredClone(failed);
      exception.outcome = 'closed_with_exceptions';
      exception.verification!.decisions.push({
        id: 'D-1', kind: 'accepted_exception', authorizedBy: 'user',
        authorizedAt: '2026-09-29T09:19:00Z', authorization: 'Close with menu defect',
        presentedFindingIds: [], presentedObligationIds: ['O-1'],
        selectedFindingIds: [], selectedObligationIds: ['O-1'],
      });
      exception.verification!.acceptanceRounds[0]!.requirementResults = { R01: 'failed' };
      exception.verification!.acceptanceRounds[0]!.g4 = 'failed';
      const incomplete = structuredClone(passing);
      incomplete.lifecycle = 'active';
      delete incomplete.outcome;
      delete incomplete.finishedAt;
      incomplete.gates[3]!.status = 'pending';
      incomplete.verification!.executions = [];
      incomplete.verification!.acceptanceRounds = [];
      const stale = structuredClone(passing);
      stale.verification!.checks[0]!.currentFingerprint.build = 'changed-build';
      const verificationOnly = structuredClone(passing);
      verificationOnly.verification!.obligations[0]!.implementationTaskIds = [];
      for (const [state, expectedValid, expectedG4] of [[passing, true, 'passed'], [failed, false, 'failed'], [exception, true, 'failed'], [incomplete, true, 'pending'], [stale, false, 'pending'], [verificationOnly, true, 'passed']] as const) {
        await writeFile(candidate, JSON.stringify(state));
        const cliResult = await target.run({}, ['--validate', candidate]);
        assert.equal(cliResult.status === 0, expectedValid,
          `parity for ${state.outcome ?? 'active'}: ${cliResult.out}`);
        if (expectedValid) {
          const projected = jsonResult(cliResult)['projection'] as Record<string, unknown>;
          assert.equal(projected['g4'], expectedG4);
          assert.deepEqual(projected['requirementResults'], { R01: expectedG4 === 'pending' ? 'incomplete' : expectedG4 });
        }
      }
    } finally {
      await target.dispose();
    }
  });

test('the address still comes first when the only complaint is the language', async () => {
    const done = await sync({
      ...STATE,
      language: 'ru',
      gates: [{ id: 'G1', status: 'passed', findings: ['A finding nobody translated'] }],
    });
    assert.equal(done.status, 1, done.out);
    const address = done.out.indexOf('http://localhost');
    const finding = done.out.indexOf('gates[0].findings[0]');
    assert.ok(address !== -1 && address < finding,
      `the дашборд must be reachable before the complaint: ${done.out}`);
  });

// What it *opens*. Until these existed, the tool printed an address and left the
// act of putting it in front of somebody to prose in `phases/0-preflight.md`,
// addressed to the orchestrator. A прогон on Claude Code Desktop printed the
// address, opened nothing, and the user found the дашборд minutes later by
// pressing the browser icon themselves.

test('the page is opened, not only printed', async () => {
  const held = await session(STATE);
  try {
    const first = await held.run(await opener(held.root));
    assert.equal(first.status, 0, first.out);
    const port = (await held.record()).port;
    assert.deepEqual(await openedAfter(held.root, 1), [`http://localhost:${port}/dashboard.html`],
      `the address was printed and not opened: ${first.out}`);
    assert.match(first.out, /панель открыта/,
      `nothing in the output says the page was opened: ${first.out}`);
  } finally {
    await held.dispose();
  }
});

test('a second call opens nothing — the page is raised once and only once', async () => {
    // `SKILL.md` says "raised in preflight and never opened a second time", and a
    // run calls this tool dozens of times. Remembering that is not the
    // orchestrator's job when the tool can hold it.
    const held = await session(STATE);
    try {
      const env = await opener(held.root);
      await held.run(env);
      await openedAfter(held.root, 1);
      const again = await held.run(env);
      assert.equal(again.status, 0, again.out);
      await settle();
      assert.equal((await opened(held.root)).length, 1,
        'the page was opened twice for one address');
    } finally {
      await held.dispose();
    }
  });

test('an address that moved is opened again, because the tab the user has is dead', async () => {
    const held = await session(STATE);
    let stranger: net.Server | null = null;
    try {
      const env = await opener(held.root);
      await held.run(env);
      const before = await held.record();
      await stop(before.pid, before.port);
      stranger = await occupy(before.port);

      const moved = await held.run(env);
      assert.equal(moved.status, 0, moved.out);
      const after = await held.record();
      assert.notEqual(after.port, before.port);
      assert.deepEqual(await openedAfter(held.root, 2), [
        `http://localhost:${before.port}/dashboard.html`,
        `http://localhost:${after.port}/dashboard.html`,
      ], `a moved address left the user holding a dead tab: ${moved.out}`);
    } finally {
      if (stranger !== null) await new Promise<void>((done) => stranger!.close(() => done()));
      await held.dispose();
    }
  });

test('--reopen brings it back when the panel is gone', async () => {
  const held = await session(STATE);
  try {
    const env = await opener(held.root);
    await held.run(env);
    const port = (await held.record()).port;
    const back = await held.run(env, ['--reopen']);
    assert.equal(back.status, 0, back.out);
    assert.deepEqual(await openedAfter(held.root, 2), [
      `http://localhost:${port}/dashboard.html`,
      `http://localhost:${port}/dashboard.html`,
    ], `--reopen did not open the page again: ${back.out}`);
  } finally {
    await held.dispose();
  }
});

test('a remote session opens nothing and says where the page is', async () => {
    // A window on someone else's machine helps nobody. This was a sentence in
    // `phases/0-preflight.md`; it belongs in the code that does the opening.
    for (const away of ['CI', 'SSH_CONNECTION']) {
      const held = await session(STATE);
      try {
        const env = { ...await opener(held.root), [away]: '1' };
        const done = await held.run(env, ['--reopen']);
        assert.equal(done.status, 0, done.out);
        await settle();
        assert.deepEqual(await opened(held.root), [],
          `${away} was set and the script still opened a window`);
      } finally {
        await held.dispose();
      }
    }
  });

test('MAESTRO_SYNC_NO_OPEN is honoured, so a host driving its own pane can say so', async () => {
    const held = await session(STATE);
    try {
      const env = { ...await opener(held.root), MAESTRO_SYNC_NO_OPEN: '1' };
      const done = await held.run(env, ['--reopen']);
      assert.equal(done.status, 0, done.out);
      await settle();
      assert.deepEqual(await opened(held.root), []);
    } finally {
      await held.dispose();
    }
  });

test('a live server for this directory is adopted, not duplicated', async () => {
    // The failure this encodes: `serve.json` lives inside `.maestro/`, which
    // preflight re-populates every run. A second run found no record, raised a
    // second server for the same directory, and handed out a new address in
    // silence — `moved_from` is None when nothing was remembered, so not even
    // the moved-address line fired. Two servers were left listening.
    const held = await session(STATE);
    try {
      await held.run();
      const before = await held.record();
      await unlink(path.join(held.root, 'serve.json'));

      const again = await held.run();
      assert.equal(again.status, 0, again.out);
      const after = await held.record();
      assert.equal(after.port, before.port,
        `a live server for this directory was duplicated instead of adopted: ${again.out}`);
      assert.equal(after.pid, before.pid, 'the adopted record must name the live server');
      assert.ok(again.out.includes(`http://localhost:${before.port}/dashboard.html`), again.out);
    } finally {
      await held.dispose();
    }
  });


test('version-5 preflight publishes an empty provisional manifest without claiming agreement', async () => {
    const target = await session(null);
    try {
      const state = sourceVerifiedState();
      state.lifecycle = 'active'; delete state.outcome; delete state.finishedAt;
      state.currentStage = 'preflight'; state.stages = [{ id: 'preflight', status: 'active', startedAt: state.startedAt }];
      state.requirements = []; state.tasks = [];
      state.gates = state.gates.map(gate => ({ ...gate, status: 'pending', findings: [] }));
      const record = state.verification!;
      record.manifestDigest = sha256(''); record.acceptanceInputDigest = sha256('');
      record.references = []; record.surfaces = []; record.obligations = []; record.checks = [];
      record.executions = []; record.evidence = []; record.findings = []; record.decisions = [];
      record.coverageReviews = []; record.acceptanceRounds = []; record.promisedWork = []; record.repairAttempts = [];
      record.sourceSnapshots = []; record.sourceClauses = []; record.manifestAudits = [];
      record.scopeMappings = []; record.journeys = []; record.negativeControls = []; delete record.scopeBaseline;
      const runDir = path.join(target.root, state.slug);
      await mkdir(runDir, { recursive: true });
      await writeFile(path.join(runDir, 'manifest.md'), '');
      const candidate = path.join(target.root, 'candidate.json');
      await writeFile(candidate, JSON.stringify(state));
      const published = await target.run({}, ['--publish', candidate, '--no-open']);
      assert.equal(published.status, 0, published.out);
      assert.equal((jsonResult(published)['projection'] as { g4: string }).g4, 'pending');
      const before = await readFile(path.join(target.root, 'state.js'), 'utf8');
      await unlink(path.join(runDir, 'manifest.md'));
      state.updatedAt = '2026-09-30T10:00:00Z';
      await writeFile(candidate, JSON.stringify(state));
      const rejected = await target.run({}, ['--publish', candidate, '--no-open']);
      assert.equal(rejected.status, 1, rejected.out);
      assert.equal(await readFile(path.join(target.root, 'state.js'), 'utf8'), before);
    } finally { await target.dispose(); }
  });

test('version-5 copied runtime preserves source-audit and completion fixture outcomes', async () => {
    const target = await session(null);
    try {
      for (const [relative, body] of Object.entries({ ...CAPTURES, ...CONTROL_CAPTURES, 'manifest.md': SOURCE_MANIFEST })) {
        const filename = path.join(target.root, 'synthetic-menu', relative);
        await mkdir(path.dirname(filename), { recursive: true }); await writeFile(filename, body);
      }
      const candidate = path.join(target.root, 'candidate.json');
      const passing = controlledState();
      const missingReturn = sourceVerifiedState(); delete missingReturn.verification!.manifestAudits[0]!.returnId;
      const wrongSpan = sourceVerifiedState(); wrongSpan.verification!.sourceClauses[0]!.end = 999;
      const wrongHash = sourceVerifiedState(); wrongHash.verification!.sourceSnapshots[0]!.sha256 = '0'.repeat(64);
      const staleAudit = sourceVerifiedState(); staleAudit.verification!.manifestAudits[0]!.manifestDigest = '0'.repeat(64);
      const insensitive = controlledState(); insensitive.verification!.negativeControls[0]!.runs[1]!.result = 'passed';
      insensitive.verification!.negativeControls[0]!.runs[1]!.assertions[0]!.result = 'passed';
      const unavailable = controlledState(); unavailable.lifecycle = 'active'; delete unavailable.outcome; delete unavailable.finishedAt;
      unavailable.gates[3]!.status = 'pending'; unavailable.verification!.acceptanceRounds = [];
      unavailable.verification!.negativeControls[0]!.result = 'unavailable';
      unavailable.verification!.negativeControls[0]!.runs = []; unavailable.verification!.negativeControls[0]!.limitation = 'Browser unavailable';
      const malformed = sourceVerifiedState(); malformed.verification!.scopeBaseline!.expectations = null as never;
      const activeNull = sourceVerifiedState(); activeNull.lifecycle = 'active';
      activeNull.outcome = null as never; activeNull.finishedAt = null as never;
      const corrected = correctedSourceAuditState();
      const contradicted = correctedSourceAuditState();
      contradicted.verification!.manifestAudits.push({ ...contradicted.verification!.manifestAudits[1]!, id: 'MA-3',
        result: 'failed', findings: ['Later reader found an omitted condition'], dispatchId: 'dispatch-3',
        readerId: 'reader-3', returnId: 'return-3', auditedAt: '2026-09-29T09:03:00Z' });
      for (const [state, expectedValid, expectedG4] of [[passing, true, 'passed'], [sourceVerifiedState(), true, 'passed'], [corrected, true, 'passed'], [contradicted, false, 'pending'], [missingReturn, false, 'pending'], [wrongSpan, false, 'pending'], [wrongHash, false, 'pending'], [staleAudit, false, 'pending'], [insensitive, false, 'pending'], [unavailable, true, 'pending'], [malformed, false, 'pending'], [activeNull, false, 'pending']] as const) {
        await writeFile(candidate, JSON.stringify(state));
        const done = await target.run({}, ['--validate', candidate]);
        assert.equal(done.status === 0, expectedValid, done.out);
        if (expectedValid) assert.equal((jsonResult(done)['projection'] as { g4: string }).g4, expectedG4);
      }
    } finally { await target.dispose(); }
  });

test('copied runtime rejects overlapping stage clocks and preserves complete stage handovers', async () => {
    const target = await session(null);
    try {
      for (const [relative, body] of Object.entries({ ...CAPTURES, 'manifest.md': SOURCE_MANIFEST })) {
        const filename = path.join(target.root, 'synthetic-menu', relative);
        await mkdir(path.dirname(filename), { recursive: true }); await writeFile(filename, body);
      }
      const baseline = sourceVerifiedState();
      baseline.stages.unshift(
        { id: 'preflight', status: 'done', startedAt: baseline.startedAt, finishedAt: '2026-09-29T09:01:00Z' },
        { id: 'manifest', status: 'done', startedAt: '2026-09-29T09:01:00Z', finishedAt: '2026-09-29T09:02:00Z' });
      const overlap = structuredClone(baseline); overlap.stages[1]!.startedAt = '2026-09-29T09:00:30Z';
      const gap = structuredClone(baseline); gap.stages[1]!.startedAt = '2026-09-29T09:01:30Z';
      const open = structuredClone(baseline); open.stages[0]!.status = 'active'; delete open.stages[0]!.finishedAt;
      const missing = structuredClone(baseline); delete missing.stages[1]!.startedAt;
      const unreadable = structuredClone(baseline); unreadable.stages[1]!.startedAt = 'not a timestamp';
      const pending = structuredClone(baseline); pending.stages[1]!.status = 'pending';
      const unknown = structuredClone(baseline);
      (unknown.stages[1] as unknown as Record<string, unknown>)['id'] = ['manifest'];
      unknown.stages[1]!.status = 'active'; delete unknown.stages[1]!.finishedAt;
      const skipped = structuredClone(baseline); skipped.stages[1] = { id: 'manifest', status: 'skipped', note: 'Already available' };
      skipped.stages.splice(2, 0, { id: 'briefing', status: 'done',
        startedAt: '2026-09-29T09:01:00Z', finishedAt: '2026-09-29T09:02:00Z' });
      const submillisecond = structuredClone(baseline);
      submillisecond.stages[0]!.finishedAt = '2026-09-29T09:01:00.123400Z';
      submillisecond.stages[1]!.startedAt = '2026-09-29T09:01:00.123900Z';
      // A skipped stage owns no clock; an absent stage breaks the temporal chain.
      for (const [name, state] of Object.entries({ baseline, overlap, gap, open, missing, unreadable, pending, unknown, skipped, submillisecond })) {
        const candidate = path.join(target.root, 'candidate.json');
        await writeFile(candidate, JSON.stringify(state));
        const result = await target.run({}, ['--project', candidate]);
        const valid = ['baseline', 'skipped', 'submillisecond'].includes(name);
        assert.equal(result.status === 0, valid, `${name}: ${result.out}`);
        if (!valid) assert.ok((jsonResult(result)['violations'] as { field: string }[]).some(item =>
          item.field.startsWith('stages')), `${name}: ${result.out}`);
      }
    } finally { await target.dispose(); }
  });

test('version-5 publication freezes original scope and rejects invalid first completion', async () => {
    const target = await session(null);
    try {
      for (const [relative, body] of Object.entries({ ...CAPTURES, 'manifest.md': SOURCE_MANIFEST })) {
        const filename = path.join(target.root, 'synthetic-menu', relative);
        await mkdir(path.dirname(filename), { recursive: true }); await writeFile(filename, body);
      }
      const candidate = path.join(target.root, 'candidate.json');
      const state = sourceVerifiedState();
      const invalid = structuredClone(state); delete invalid.verification!.manifestAudits[0]!.returnId;
      await writeFile(candidate, JSON.stringify(invalid));
      const rejected = await target.run({}, ['--publish', candidate, '--no-open']);
      assert.equal(rejected.status, 1, rejected.out);
      await assert.rejects(() => readFile(path.join(target.root, 'state.js')));
      assert.match(await target.page(), /MAESTRO_VALIDATION_SNAPSHOT/);
      await writeFile(candidate, JSON.stringify(state));
      const accepted = await target.run({}, ['--publish', candidate, '--no-open']);
      assert.equal(accepted.status, 0, accepted.out);
      const before = await readFile(path.join(target.root, 'state.js'), 'utf8');
      const changed = structuredClone(state); changed.updatedAt = '2026-09-30T10:00:00Z';
      changed.verification!.scopeBaseline!.expectations[0]!.text = 'Relaxed original limit';
      await writeFile(candidate, JSON.stringify(changed));
      const edited = await target.run({}, ['--publish', candidate, '--expect', state.updatedAt!, '--no-open']);
      assert.equal(edited.status, 1, edited.out);
      assert.equal(await readFile(path.join(target.root, 'state.js'), 'utf8'), before);
      assert.ok((jsonResult(edited)['violations'] as { field: string }[]).some(item => item.field === 'verification.scopeBaseline'));
    } finally { await target.dispose(); }
  });

test('copied runtime publishes Plan ownership once and preserves holder and oracle boundaries', async () => {
    const target = await session(null);
    try {
      for (const [relative, body] of Object.entries({ ...CAPTURES, 'manifest.md': SOURCE_MANIFEST })) {
        const filename = path.join(target.root, 'synthetic-menu', relative);
        await mkdir(path.dirname(filename), { recursive: true }); await writeFile(filename, body);
      }
      const before = planningOwnershipState();
      before.heldBy = { token: 'planning-holder', since: before.startedAt };
      const after = planningOwnershipState(true); after.heldBy = before.heldBy;
      after.updatedAt = '2026-09-29T09:21:00Z';
      const candidate = path.join(target.root, 'candidate.json');
      await writeFile(candidate, JSON.stringify(before));
      const first = await target.run({}, ['--publish', candidate, '--holder', 'planning-holder', '--no-open']);
      assert.equal(first.status, 0, first.out);
      await writeFile(candidate, JSON.stringify(after));
      const assigned = await target.run({}, ['--publish', candidate, '--expect', before.updatedAt!, '--holder', 'planning-holder', '--no-open']);
      assert.equal(assigned.status, 0, assigned.out);
      const snapshot = await readFile(path.join(target.root, 'state.js'), 'utf8');
      after.verification!.checks[0]!.oracle = 'A weaker replacement'; after.updatedAt = '2026-09-29T09:22:00Z';
      await writeFile(candidate, JSON.stringify(after));
      const rejected = await target.run({}, ['--publish', candidate, '--expect', '2026-09-29T09:21:00Z', '--holder', 'planning-holder', '--no-open']);
      assert.equal(rejected.status, 1, rejected.out);
      assert.equal(await readFile(path.join(target.root, 'state.js'), 'utf8'), snapshot);
    } finally { await target.dispose(); }
  });

test('copied runtime projects original 18/20 and current 18/18 from the same valid fixture', async () => {
    const target = await session(null);
    try {
      for (const [relative, body] of Object.entries({ ...CAPTURES, 'manifest.md': SOURCE_MANIFEST })) {
        const filename = path.join(target.root, 'synthetic-menu', relative);
        await mkdir(path.dirname(filename), { recursive: true }); await writeFile(filename, body);
      }
      const state = deferredScopeState();
      const candidate = path.join(target.root, 'candidate.json');
      await writeFile(candidate, JSON.stringify(state));
      const done = await target.run({}, ['--project', candidate]);
      assert.equal(done.status, 0, done.out);
      const progress = jsonResult(done)['scopeProgress'] as { original: { passed: number; total: number }; current: { passed: number; total: number } };
      assert.equal(progress.original.passed, 18); assert.equal(progress.original.total, 20);
      assert.equal(progress.current.passed, 18); assert.equal(progress.current.total, 18);
      assert.equal((jsonResult(done)['summary'] as { g4: string }).g4, 'passed');
      assert.equal(jsonResult(done)['completionSafeguards'], 'established');
    } finally { await target.dispose(); }
  });

test('v4-to-v5 resume publishes without deleting historical evidence or fabricating safeguards', async () => {
    const target = await session(null);
    try {
      for (const [relative, body] of Object.entries({ ...CAPTURES, 'manifest.md': SOURCE_MANIFEST })) {
        const filename = path.join(target.root, 'synthetic-menu', relative);
        await mkdir(path.dirname(filename), { recursive: true }); await writeFile(filename, body);
      }
      const old = verifiedState(); const filename = path.join(target.root, 'candidate.json');
      await writeFile(filename, JSON.stringify(old));
      const published = await target.run({}, ['--publish', filename, '--no-open']);
      assert.equal(published.status, 0, published.out);
      const candidate = sourceVerifiedState().verification!;
      candidate.acceptanceInputDigest = 'actual-resumed-source-input';
      candidate.manifestAudits = []; delete candidate.scopeBaseline;
      const resumed = prepareLegacyResume(old, candidate);
      await writeFile(filename, JSON.stringify(resumed));
      const done = await target.run({}, ['--publish', filename, '--expect', old.updatedAt!, '--no-open']);
      assert.equal(done.status, 0, done.out);
      assert.equal(resumed.verification!.executions.length, old.verification!.executions.length);
      assert.equal((jsonResult(done)['projection'] as { g4: string }).g4, 'pending');
    } finally { await target.dispose(); }
  });

test('copied publication keeps validate and project read-only and distinguishes parse from shape failure', async () => {
  const target = await session(null);
  try {
    await addV4Captures(target.root);
    const candidate = path.join(target.root, 'candidate.json');
    await writeFile(candidate, JSON.stringify(verifiedState()));
    const before = await readdir(target.root);
    for (const action of ['--validate', '--project']) {
      const result = await target.run({}, [action, candidate]);
      assert.equal(result.status, 0, result.out + result.err);
      assert.deepEqual(await readdir(target.root), before);
    }
    await writeFile(candidate, '[]');
    assert.equal((await target.run({}, ['--validate', candidate])).status, 1);
    await writeFile(candidate, '{ broken');
    assert.equal((await target.run({}, ['--validate', candidate])).status, 2);
    assert.equal((await target.run({}, ['--validate', candidate + '.absent'])).status, 2);
    assert.deepEqual(await readdir(target.root), before);
  } finally { await target.dispose(); }
});

test('strict copied publication rejects missing expect, both holder mismatches and unreadable history', async () => {
  const target = await session(null);
  try {
    await addV4Captures(target.root);
    const state = verifiedState();
    state.heldBy = { token: 'private-holder', since: state.startedAt };
    const candidate = path.join(target.root, 'candidate.json');
    await writeFile(candidate, JSON.stringify(state));
    assert.equal((await target.run({}, ['--publish', candidate, '--holder', 'private-holder', '--no-open'])).status, 0);
    const previous = await readFile(path.join(target.root, 'state.js'), 'utf8');
    const next = structuredClone(state); next.updatedAt = '2026-08-21T12:01:00.000Z';
    await writeFile(candidate, JSON.stringify(next));
    for (const args of [[], ['--expect', state.updatedAt!, '--holder', 'wrong-holder'], ['--expect', 'stale', '--holder', 'private-holder']]) {
      const outcome = await target.run({}, ['--publish', candidate, '--no-open', ...args]);
      assert.equal(outcome.status, 1, outcome.out + outcome.err);
      assert.equal(await readFile(path.join(target.root, 'state.js'), 'utf8'), previous);
      assert.ok(!outcome.err.includes('private-holder') && !outcome.err.includes('wrong-holder'));
    }
    next.heldBy!.token = 'candidate-only-holder';
    await writeFile(candidate, JSON.stringify(next));
    assert.equal((await target.run({}, ['--publish', candidate, '--expect', state.updatedAt!, '--holder', 'private-holder'])).status, 1);
    await writeFile(path.join(target.root, 'state.js'), 'not JSON');
    assert.equal((await target.run({}, ['--publish', candidate, '--no-open'])).status, 1);
    assert.equal(await readFile(path.join(target.root, 'state.js'), 'utf8'), 'not JSON');
  } finally { await target.dispose(); }
});

test('copied publication accepts reordered object keys and rejects changed immutable history', async () => {
  const target = await session(null);
  try {
    await addV4Captures(target.root);
    const state = verifiedState();
    state.verification!.checks[0]!.procedure.push('Move pointer away and verify close');
    const candidate = path.join(target.root, 'candidate.json');
    await writeFile(candidate, JSON.stringify(state));
    assert.equal((await target.run({}, ['--publish', candidate, '--no-open'])).status, 0);
    const next = structuredClone(state); next.updatedAt = '2026-08-21T12:01:00.000Z';
    next.verification!.executions = next.verification!.executions.map(item => Object.fromEntries(Object.entries(item).reverse()) as typeof item);
    await writeFile(candidate, JSON.stringify(next));
    assert.equal((await target.run({}, ['--publish', candidate, '--expect', state.updatedAt!, '--no-open'])).status, 0);
    const executedAt = next.verification!.executions[0]!.executedAt;
    next.verification!.executions[0]!.executedAt = '2026-08-21T12:02:00.000Z';
    await writeFile(candidate, JSON.stringify(next));
    assert.equal((await target.run({}, ['--publish', candidate, '--expect', next.updatedAt!, '--no-open'])).status, 1);
    next.verification!.executions[0]!.executedAt = executedAt;
    next.verification!.checks[0]!.procedure.reverse();
    await writeFile(candidate, JSON.stringify(next));
    const reorderedArray = await target.run({}, ['--publish', candidate, '--expect', next.updatedAt!, '--no-open']);
    assert.equal(reorderedArray.status, 1);
    assert.ok((jsonResult(reorderedArray)['violations'] as { field: string }[]).some(item => item.field === 'verification.checks[C-1]'));
    assert.ok(!(await readdir(target.root)).some(file => file.endsWith('.tmp')));
  } finally { await target.dispose(); }
});

test('owned Node viewers serve two separate directories and confine decoded paths and symlinks', async () => {
  const { symlink } = await import('node:fs/promises');
  const first = await session({ ...STATE, runId: 'first-directory' });
  const second = await session({ ...STATE, runId: 'second-directory' });
  try {
    assert.equal((await first.run()).status, 0);
    assert.equal((await second.run()).status, 0);
    const a = await first.record(); const b = await second.record();
    assert.notEqual(a.pid, b.pid); assert.notEqual(a.port, b.port);
    for (const [record, id] of [[a, 'first-directory'], [b, 'second-directory']] as const) {
      const response = await fetch(`http://127.0.0.1:${record.port}/state.js`);
      assert.match(response.headers.get('content-type') ?? '', /javascript/);
      assert.ok((await response.text()).includes(id));
      assert.ok((await (await fetch(`http://127.0.0.1:${record.port}/`)).text()).includes('MAESTRO_SNAPSHOT'));
    }
    const secret = path.join(first.root, '..', 'outside-' + a.port + '.txt');
    await writeFile(secret, 'outside directory');
    try {
      await symlink(secret, path.join(first.root, 'external.txt'));
      for (const resource of ['/external.txt', '/%2e%2e%2foutside.txt', '/..%5coutside.txt']) {
        assert.equal((await fetch(`http://127.0.0.1:${a.port}${resource}`)).status, 403);
      }
    } finally { await rm(secret, { force: true }); }
  } finally { await first.dispose(); await second.dispose(); }
});

test('a copied viewer refuses a foreign PID record and keeps an occupied foreign listener alive', async () => {
  const { spawn } = await import('node:child_process');
  const foreign = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  const target = await session(STATE);
  const held = await occupy(0);
  const address = held.address(); assert.ok(address && typeof address !== 'string');
  try {
    await writeFile(path.join(target.root, 'serve.json'), JSON.stringify({ pid: foreign.pid, port: address.port }));
    assert.equal((await target.run()).status, 0);
    const record = await target.record();
    assert.notEqual(record.pid, foreign.pid); assert.notEqual(record.port, address.port);
    process.kill(foreign.pid!, 0);
    assert.ok(held.listening);
  } finally {
    foreign.kill();
    await new Promise<void>(resolve => held.close(() => resolve()));
    await target.dispose();
  }
});

test('the copied Node viewer survives an unavailable index link and verifies instance identity before reuse', async () => {
  const target = await session(STATE);
  try {
    await mkdir(path.join(target.root, 'index.html'));
    assert.equal((await target.run()).status, 0);
    const before = await target.record();
    const rootResponse = await fetch(`http://127.0.0.1:${before.port}/`);
    assert.equal(rootResponse.status, 200);
    const wrong = JSON.parse(await readFile(path.join(target.root, 'serve.json'), 'utf8')) as Record<string, unknown>;
    wrong['instance'] = 'wrong-instance';
    await writeFile(path.join(target.root, 'serve.json'), JSON.stringify(wrong));
    assert.equal((await target.run()).status, 0);
    // The wrong record cannot authorize reuse; directory-bound discovery recovers it.
    assert.equal((await target.record()).pid, before.pid);
  } finally { await target.dispose(); }
});

test('platform opener commands and quoted overrides are selected without shell interpolation', async () => {
  const { openerCommand, splitArguments } = await import('../../skills/maestro/tools/runtime/opener.mts');
  assert.deepEqual(openerCommand('darwin', ''), ['open']);
  assert.deepEqual(openerCommand('win32', ''), ['cmd', '/c', 'start', '']);
  assert.deepEqual(openerCommand('linux', ''), ['xdg-open']);
  assert.deepEqual(splitArguments(`node "path with spaces.mjs" 'literal $HOME' ""`), ['node', 'path with spaces.mjs', 'literal $HOME', '']);
  assert.throws(() => splitArguments('node "unclosed'), /unclosed/);
});

test('a missing opener preserves the viewer and does not record a successful opening', async () => {
  const target = await session(STATE);
  try {
    const done = await target.run({ ...(await opener(target.root)), MAESTRO_SYNC_OPENER: '/definitely/absent/maestro-opener' });
    assert.equal(done.status, 0);
    assert.ok(done.out.includes('http://localhost:'));
    await assert.rejects(() => readFile(path.join(target.root, 'opened.json')));
    assert.ok(!done.out.includes('панель открыта'));
    assert.match(done.err, /opener could not be started/);
  } finally { await target.dispose(); }
});

test('a viewer startup timeout falls back to a snapshot and tears down its own unready child', async () => {
  const { ensureViewer } = await import('../../skills/maestro/tools/runtime/server.mts');
  const target = await session(STATE);
  try {
    const unready = path.join(target.root, 'unready.mts');
    await writeFile(unready, `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(path.join(target.root, 'unready.pid'))}, String(process.pid)); setInterval(() => {}, 1000);`);
    const address = await ensureViewer(target.root, unready);
    assert.equal(address.record, null); assert.match(address.url, /^file:/);
    await assert.rejects(() => readFile(path.join(target.root, 'serve.json')));
    const pid = Number(await readFile(path.join(target.root, 'unready.pid'), 'utf8'));
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try { process.kill(pid, 0); }
      catch { return; }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    process.kill(pid, 'SIGTERM');
    assert.fail('unready child survived startup timeout');
  } finally { await target.dispose(); }
});

test('atomic file replacement preserves the previous snapshot and cleans up a failed final revision check', async () => {
  const { atomicText } = await import('../../skills/maestro/tools/runtime/state/write.mts');
  const target = await session(STATE);
  try {
    const file = path.join(target.root, 'state.js');
    const previous = await readFile(file, 'utf8');
    await assert.rejects(() => atomicText(file, 'replacement', async () => { throw new Error('revision moved'); }), /revision moved/);
    assert.equal(await readFile(file, 'utf8'), previous);
    await mkdir(path.join(target.root, 'blocked.js'));
    await assert.rejects(() => atomicText(path.join(target.root, 'blocked.js'), 'replacement'));
    assert.ok(!(await readdir(target.root)).some(file => file.endsWith('.tmp')));
  } finally { await target.dispose(); }
});

test('exclusive temporary-file creation never removes an existing file it did not create', async () => {
  const target = await session(STATE);
  try {
    const check = path.join(target.root, 'exclusive.mts');
    await writeFile(check, `import { writeFile, readFile } from 'node:fs/promises';
import { atomicText } from './runtime/state/write.mts';
const target = new URL('./state.js', import.meta.url).pathname;
const temporary = new URL('./.state.js.' + process.pid + '.1.tmp', import.meta.url).pathname;
await writeFile(temporary, 'owned by another writer');
try { await atomicText(target, 'replacement'); throw new Error('exclusive write unexpectedly succeeded'); }
catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
if (await readFile(temporary, 'utf8') !== 'owned by another writer') throw new Error('foreign temporary file was removed');
`);
    const done = spawnSync(process.execPath, [check], { encoding: 'utf8' });
    assert.equal(done.status, 0, done.stderr);
  } finally { await target.dispose(); }
});

test('legacy ownership checks require the exact directory command and ready page without invoking the old runtime', async () => {
  const { legacyOwner } = await import('../../skills/maestro/tools/runtime/server.mts');
  const { createServer } = await import('node:http');
  const { realpath } = await import('node:fs/promises');
  const target = await session(STATE);
  const page = await target.page();
  const server = createServer((_req, res) => res.end(page));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const root = await realpath(target.root);
  const command = `/usr/bin/python3 -m http.server ${address.port} --bind 127.0.0.1 --directory ${root}`;
  try {
    assert.equal(await legacyOwner(root, process.pid, address.port, command), true);
    assert.equal(await legacyOwner(root, process.pid, address.port, command + '-other-project'), false);
    assert.equal(await legacyOwner(root, process.pid, address.port, command.replace('127.0.0.1', '0.0.0.0')), false);
    assert.equal(await legacyOwner(root, process.pid, address.port, command.replace('http.server', 'unrelated-server')), false);
    assert.equal(await legacyOwner(root, process.pid, address.port, command.replace(String(address.port), '1')), false);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await target.dispose(); }
});
