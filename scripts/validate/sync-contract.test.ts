// The first test `sync.py` has ever had.
//
// It is the only executable this repository copies into a real прогон, and it
// is the only place a status the contract does not define can be caught while
// the run is still going. `npm run check` reads none of it — `bundle-integrity`
// walks `.md` — so without this file the check that guards a прогон is itself
// unguarded.
//
// The script is driven as a process rather than imported, because what is under
// test is its exit code and what it prints: a run's orchestrator reads exactly
// those two things and nothing else.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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

test('a state whose statuses are all the contract\'s passes', { skip: python === null }, async () => {
  const done = await sync(STATE);
  assert.equal(done.status, 0, done.out);
  assert.match(done.out, /http:\/\/localhost:\d+\/dashboard\.html/);
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
