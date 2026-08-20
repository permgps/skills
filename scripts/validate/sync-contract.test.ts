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
import { mkdtemp, writeFile, copyFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

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

    const done = spawnSync(python as string, [path.join(root, 'sync.py')], { encoding: 'utf8' });
    return { status: done.status ?? -1, out: (done.stdout ?? '') + (done.stderr ?? '') };
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
  run(): Promise<Outcome>;
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
    async run() {
      const done = spawnSync(python as string, [path.join(root, 'sync.py')], { encoding: 'utf8' });
      try {
        raised.add((await record()).pid);
      } catch {
        // No server was raised. The exit-code tests below expect exactly that.
      }
      return { status: done.status ?? -1, out: (done.stdout ?? '') + (done.stderr ?? '') };
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
