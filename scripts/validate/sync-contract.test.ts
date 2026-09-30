// The tests `sync.py` has.
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
import { mkdtemp, mkdir, writeFile, copyFile, readFile, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CAPTURES, CONTROL_CAPTURES, SOURCE_MANIFEST, sha256, planningOwnershipState, correctedSourceAuditState, deferredScopeState, sourceVerifiedState, controlledState, verifiedState } from '../state/fixtures/verification.ts';
import { projectState, prepareLegacyResume } from '../state/projection.ts';
import { deriveVerification } from '../state/verification.ts';
import { validateState } from '../state/validate.ts';

const SYNC = 'skills/maestro/tools/sync.py';
const PAGE = 'skills/maestro/assets/dashboard.html';

/** Whether a python3 is on this machine at all. */
const python = ((): string | null => {
  const probe = spawnSync('python3', ['--version'], { encoding: 'utf8' });
  return probe.status === 0 ? 'python3' : null;
})();

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

interface Outcome { status: number; out: string }

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
  const done = spawnSync(python as string, [script, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...SEALED, ...extra },
  });
  return { status: done.status ?? -1, out: (done.stdout ?? '') + (done.stderr ?? '') };
}

/**
 * An opener that records instead of opening.
 *
 * Written into the directory under test and handed to the script through
 * `MAESTRO_SYNC_OPENER`, so what a test asserts is the url the script decided
 * to open — the decision — and never a window that actually appeared.
 */
async function opener(root: string): Promise<Record<string, string>> {
  const script = path.join(root, 'opener.sh');
  await writeFile(script, `#!/bin/sh\nprintf '%s\\n' "$1" >> "${path.join(root, 'opened.log')}"\n`,
    'utf8');
  // Through `sh` rather than the bare path: the file needs no execute bit, and
  // the script splits this value the way a shell would.
  return { MAESTRO_SYNC_OPENER: `/bin/sh ${script}`, MAESTRO_SYNC_NO_OPEN: '' };
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
 * Run sync.py over a state, in a directory of its own, and stop the server it
 * raises. Leaving that server running would leak a detached process per test.
 */
async function sync(state: unknown): Promise<Outcome> {
  const root = await mkdtemp(path.join(tmpdir(), 'sync-contract-'));
  try {
    await copyFile(SYNC, path.join(root, 'sync.py'));
    await copyFile(PAGE, path.join(root, 'dashboard.html'));
    await writeFile(
      path.join(root, 'state.js'),
      `globalThis.MAESTRO_STATE = ${JSON.stringify(state)};\n`,
      'utf8',
    );

    return run(path.join(root, 'sync.py'), {});
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
 * A directory `sync.py` can be called in more than once.
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
  await copyFile(SYNC, path.join(root, 'sync.py'));
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
      const done = run(path.join(root, 'sync.py'), extra, args);
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

test('a state whose statuses are all the contract\'s passes', { skip: python === null }, async () => {
  const done = await sync(STATE);
  assert.equal(done.status, 0, done.out);
  assert.match(done.out, /http:\/\/localhost:\d+\/dashboard\.html/);
});

test('the address is followed by the line that says a folded pane opens',
  { skip: python === null }, async () => {
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

test('the folded-pane line is in the language the прогон speaks',
  { skip: python === null }, async () => {
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

test('the state reaches the page beside it, so a pane with no address still shows the прогон',
  { skip: python === null }, async () => {
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

test('a second call with the server still up hands back the same address, and says nothing about it',
  { skip: python === null }, async () => {
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

test('a server that died is raised again at the address the user already has',
  { skip: python === null }, async () => {
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

test('a port taken by something else moves the address, and the move is said before it',
  { skip: python === null }, async () => {
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

test('the moved-address line is in the language the прогон speaks',
  { skip: python === null }, async () => {
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

test('a state that is valid JavaScript but not valid JSON still shows the address',
  { skip: python === null }, async () => {
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

test('no state.js beside the script is exit 2, and no server is raised',
  { skip: python === null }, async () => {
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

test('a таск written `pending` is named, and the run is told', { skip: python === null }, async () => {
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

test('the address comes first, because a wrong status is still worth showing',
  { skip: python === null }, async () => {
    const done = await sync({ ...STATE, gates: [{ id: 'G1', status: 'green' }] });
    assert.equal(done.status, 1, done.out);
    const address = done.out.indexOf('http://localhost');
    const finding = done.out.indexOf('gates[0].status');
    assert.ok(address !== -1 && address < finding,
      `the дашборд must be reachable before the complaint: ${done.out}`);
  });

test('an entry with no status at all is reported too', { skip: python === null }, async () => {
  // Absent is as uncountable on the page as wrong, and the contract requires it.
  const done = await sync({ ...STATE, stages: [{ id: 'build' }] });
  assert.equal(done.status, 1, done.out);
  assert.match(done.out, /stages\[0\]\.status is null/);
});

test('every offender is named, not just the first', { skip: python === null }, async () => {
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

test('a finding written in English while the прогон speaks Russian is named',
  { skip: python === null }, async () => {
    const done = await sync({
      ...STATE,
      language: 'ru',
      gates: [{ id: 'G1', status: 'passed', findings: ['Every one of the 392 requirements carries a status'] }],
    });
    assert.equal(done.status, 1, done.out);
    assert.match(done.out, /gates\[0\]\.findings\[0\] has no Russian in it/);
    assert.match(done.out, /this прогон speaks ru/);
  });

test('the finding itself is quoted, because the line is what has to be rewritten',
  { skip: python === null }, async () => {
    const done = await sync({
      ...STATE,
      language: 'ru',
      gates: [{ id: 'G1', status: 'passed', findings: ['The room half recorded as a partial debt row'] }],
    });
    assert.equal(done.status, 1, done.out);
    assert.match(done.out, /The room half recorded as a partial debt row/);
  });

test('a finding in the прогон\'s own language raises nothing',
  { skip: python === null }, async () => {
    const done = await sync({
      ...STATE,
      language: 'ru',
      gates: [{ id: 'G1', status: 'passed', findings: ['R009 — комната записана отдельной строкой долга'] }],
    });
    assert.equal(done.status, 0, done.out);
  });

test('a таск title and a стадия note are held to the same rule as a finding',
  { skip: python === null }, async () => {
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

test('the fields the panel never prints as text are left alone',
  { skip: python === null }, async () => {
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

test('an English прогон is not held to the mirror of the rule',
  { skip: python === null }, async () => {
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

test('a state written before the language dial existed is not held to the rule',
  { skip: python === null }, async () => {
    // The contract makes `language` optional, and a reader supplying `ru` on the
    // writer's behalf would be reporting a choice nobody made.
    const done = await sync({
      ...STATE,
      gates: [{ id: 'G1', status: 'passed', findings: ['Every requirement carries a status'] }],
    });
    assert.equal(done.status, 0, done.out);
  });

test('version-4 candidate validates and publishes atomically through the copied helper',
  { skip: python === null }, async () => {
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
        deriveVerification(state).requirementResults);

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

test('version-4 invalid first candidate exposes diagnostics without publishing a green state',
  { skip: python === null }, async () => {
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
      assert.match(await readFile(path.join(target.root, 'validation.js'), 'utf8'), /"status": "invalid"/);
      assert.match(await readFile(path.join(target.root, 'dashboard.html'), 'utf8'),
        /MAESTRO_VALIDATION_SNAPSHOT = \{"candidateRevision": "2026-09-29T09:20:00Z"/);
      await assert.rejects(readFile(path.join(target.root, 'state.js'), 'utf8'));
      assert.match(String(jsonResult(done)['url']), /dashboard\.html/);
    } finally {
      await target.dispose();
    }
  });

test('version-4 publication refuses a changed capture and keeps its prior coherent state',
  { skip: python === null }, async () => {
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
        /MAESTRO_VALIDATION_SNAPSHOT = \{"candidateRevision": "2026-09-29T09:21:00Z"/);
      assert.equal(await readFile(path.join(target.root, 'state.js'), 'utf8'), before);
    } finally {
      await target.dispose();
    }
  });

test('version-4 publication rejects stale revisions and unrelated holders',
  { skip: python === null }, async () => {
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

test('legacy projection remains unverified and malformed nested candidates are rejected',
  { skip: python === null }, async () => {
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

test('version-4 TypeScript and copied Python agree on closure and incomplete controls',
  { skip: python === null }, async () => {
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
      for (const state of [passing, failed, exception, incomplete, stale, verificationOnly]) {
        await writeFile(candidate, JSON.stringify(state));
        const pythonResult = await target.run({}, ['--validate', candidate]);
        const tsValid = validateState(state).length === 0;
        assert.equal(pythonResult.status === 0, tsValid,
          `parity for ${state.outcome ?? 'active'}: ${pythonResult.out}`);
        if (tsValid) {
          const projected = jsonResult(pythonResult)['projection'] as Record<string, unknown>;
          assert.deepEqual(projected['requirementResults'], deriveVerification(state).requirementResults);
          assert.equal(projected['g4'], deriveVerification(state).g4);
        }
      }
    } finally {
      await target.dispose();
    }
  });

test('the address still comes first when the only complaint is the language',
  { skip: python === null }, async () => {
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

test('the page is opened, not only printed', { skip: python === null }, async () => {
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

test('a second call opens nothing — the page is raised once and only once',
  { skip: python === null }, async () => {
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

test('an address that moved is opened again, because the tab the user has is dead',
  { skip: python === null }, async () => {
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

test('--reopen brings it back when the panel is gone', { skip: python === null }, async () => {
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

test('a remote session opens nothing and says where the page is',
  { skip: python === null }, async () => {
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

test('MAESTRO_SYNC_NO_OPEN is honoured, so a host driving its own pane can say so',
  { skip: python === null }, async () => {
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

test('a live server for this directory is adopted, not duplicated',
  { skip: python === null }, async () => {
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


test('version-5 preflight publishes an empty provisional manifest without claiming agreement',
  { skip: python === null }, async () => {
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
      assert.deepEqual(validateState(state), []);
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

test('version-5 source and completion fixtures agree between TypeScript and copied Python',
  { skip: python === null }, async () => {
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
      for (const state of [passing, sourceVerifiedState(), corrected, contradicted, missingReturn, wrongSpan, wrongHash, staleAudit, insensitive, unavailable, malformed, activeNull]) {
        await writeFile(candidate, JSON.stringify(state));
        const done = await target.run({}, ['--validate', candidate]);
        const valid = validateState(state).length === 0;
        assert.equal(done.status === 0, valid, done.out);
        if (valid) assert.deepEqual(jsonResult(done)['projection'], deriveVerification(state));
      }
    } finally { await target.dispose(); }
  });

test('copied Python rejects overlapping stage clocks and agrees on complete stage handovers',
  { skip: python === null }, async () => {
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
        const valid = validateState(state).length === 0;
        assert.equal(result.status === 0, valid, `${name}: ${result.out}`);
        if (!valid) assert.ok((jsonResult(result)['violations'] as { field: string }[]).some(item =>
          item.field.startsWith('stages')), `${name}: ${result.out}`);
      }
    } finally { await target.dispose(); }
  });

test('version-5 publication freezes original scope and rejects invalid first completion',
  { skip: python === null }, async () => {
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

test('copied Python publishes Plan ownership once and preserves holder and oracle boundaries',
  { skip: python === null }, async () => {
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

test('copied Python projects original 18/20 and current 18/18 from the same valid fixture',
  { skip: python === null }, async () => {
    const target = await session(null);
    try {
      for (const [relative, body] of Object.entries({ ...CAPTURES, 'manifest.md': SOURCE_MANIFEST })) {
        const filename = path.join(target.root, 'synthetic-menu', relative);
        await mkdir(path.dirname(filename), { recursive: true }); await writeFile(filename, body);
      }
      const state = deferredScopeState();
      assert.deepEqual(validateState(state), []);
      const candidate = path.join(target.root, 'candidate.json');
      await writeFile(candidate, JSON.stringify(state));
      const done = await target.run({}, ['--project', candidate]);
      assert.equal(done.status, 0, done.out);
      assert.deepEqual(jsonResult(done)['scopeProgress'], projectState(state).scopeProgress);
      assert.deepEqual(jsonResult(done)['summary'], deriveVerification(state));
      assert.equal(jsonResult(done)['completionSafeguards'], 'established');
    } finally { await target.dispose(); }
  });

test('v4-to-v5 resume publishes without deleting historical evidence or fabricating safeguards',
  { skip: python === null }, async () => {
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
      assert.equal(projectState(resumed).g4, 'pending');
      assert.deepEqual(jsonResult(done)['projection'], deriveVerification(resumed));
    } finally { await target.dispose(); }
  });
