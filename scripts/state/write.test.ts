import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { writeState, serializeState, InvalidStateError, StaleStateError, STATE_FILE } from './write.ts';
import { CONTRACT_VERSION, type RunState } from './contract.ts';

function baseline(): RunState {
  return {
    contractVersion: CONTRACT_VERSION,
    runId: 'run-2026-08-19-01',
    slug: 'landing-page',
    startedAt: '2026-08-19T09:00:00Z',
    mode: 'semi',
    depth: 'normal',
    polish: false,
    dialChanges: [],
    stages: [{ id: 'preflight', status: 'active', startedAt: '2026-08-19T09:00:00Z' }],
    currentStage: 'preflight',
    tasks: [],
    requirements: [],
    gates: [],
    updatedAt: '2026-08-19T09:12:00Z',
    debt: { placeholders: [], assumptions: [], emptyEnv: [] },
    additions: [],
  };
}

async function withDir(body: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'state-write-'));
  try {
    await body(dir);
  } finally {
    await chmod(dir, 0o700).catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
  }
}

/** Evaluate the written file the way the dashboard's script tag would. */
function evaluate(source: string): unknown {
  const scope: { MAESTRO_STATE?: unknown } = {};
  new Function('globalThis', source)(scope);
  return scope.MAESTRO_STATE;
}

test('a written state round-trips through the file the dashboard loads', async () => {
  await withDir(async dir => {
    const state = baseline();
    const result = await writeState(dir, state);

    assert.equal(result.path, path.join(dir, STATE_FILE));
    const source = await readFile(result.path, 'utf8');
    assert.equal(result.bytes, Buffer.byteLength(source, 'utf8'));
    assert.deepEqual(evaluate(source), state);
  });
});

test('the serialized file names its contract, so a reader can find it', () => {
  assert.match(serializeState(baseline()), /docs\/spec\/state-contract\.md/);
});

test('an invalid state is refused and nothing is written', async () => {
  await withDir(async dir => {
    const broken = { ...baseline(), mode: 'autopilot' } as unknown as RunState;

    await assert.rejects(() => writeState(dir, broken), (error: unknown) => {
      assert.ok(error instanceof InvalidStateError);
      assert.equal(error.violations.length, 1);
      assert.equal(error.violations[0]?.field, 'mode');
      return true;
    });

    assert.deepEqual(await readdir(dir), []);
  });
});

test('a failed write leaves the previous state intact', async () => {
  await withDir(async dir => {
    const first = baseline();
    await writeState(dir, first);
    const before = await readFile(path.join(dir, STATE_FILE), 'utf8');

    const broken = { ...baseline(), runId: '' } as unknown as RunState;
    await assert.rejects(() => writeState(dir, broken), InvalidStateError);

    const after = await readFile(path.join(dir, STATE_FILE), 'utf8');
    assert.equal(after, before);
    assert.deepEqual(evaluate(after), first);
  });
});

test('a second write replaces the first and leaves no temporary files', async () => {
  await withDir(async dir => {
    await writeState(dir, baseline());
    const second: RunState = { ...baseline(), currentStage: 'manifest' };
    await writeState(dir, second);

    assert.deepEqual(await readdir(dir), [STATE_FILE]);
    assert.deepEqual(evaluate(await readFile(path.join(dir, STATE_FILE), 'utf8')), second);
  });
});

test('an unwritable directory surfaces the error and cleans up after itself', async () => {
  await withDir(async dir => {
    const locked = path.join(dir, 'locked');
    await mkdir(locked);
    await chmod(locked, 0o500);

    await assert.rejects(() => writeState(locked, baseline()));

    await chmod(locked, 0o700);
    // Neither the target nor a stray temporary file was left behind.
    assert.deepEqual(await readdir(locked), []);
  });
});

test('a write with no expected stamp behaves exactly as it always did', async () => {
  await withDir(async dir => {
    // The unconditional write is the one every caller in this repository still
    // makes, so it is the one that must not have changed.
    await writeState(dir, baseline());
    const second: RunState = { ...baseline(), updatedAt: '2026-08-19T09:20:00Z' };
    await writeState(dir, second);

    assert.deepEqual(await readdir(dir), [STATE_FILE]);
    assert.deepEqual(evaluate(await readFile(path.join(dir, STATE_FILE), 'utf8')), second);
  });
});

test('a write whose expected stamp still stands goes through', async () => {
  await withDir(async dir => {
    const first = baseline();
    await writeState(dir, first);

    const next: RunState = { ...baseline(), updatedAt: '2026-08-19T09:20:00Z' };
    await writeState(dir, next, first.updatedAt);

    assert.deepEqual(evaluate(await readFile(path.join(dir, STATE_FILE), 'utf8')), next);
  });
});

test('a state that moved under us refuses the write and leaves the file alone', async () => {
  await withDir(async dir => {
    const read = baseline();
    await writeState(dir, read);

    // The other session writes in between, and claims the прогон while it is
    // there. This is the case the two прогона of 2026-08-20 actually hit.
    const other: RunState = {
      ...baseline(),
      updatedAt: '2026-08-19T09:27:04Z',
      heldBy: { token: 'other-9c1', since: '2026-08-19T09:27:04Z' },
    };
    await writeState(dir, other);
    const before = await readFile(path.join(dir, STATE_FILE), 'utf8');

    const ours: RunState = { ...baseline(), updatedAt: '2026-08-19T09:31:00Z' };
    await assert.rejects(() => writeState(dir, ours, read.updatedAt), (error: unknown) => {
      assert.ok(error instanceof StaleStateError);
      assert.equal(error.expected, read.updatedAt);
      assert.equal(error.found, other.updatedAt);
      // Whose token it is, because that is the first thing the user asks.
      assert.equal(error.heldBy, 'other-9c1');
      return true;
    });

    // The whole point: what the other session wrote is still there.
    const after = await readFile(path.join(dir, STATE_FILE), 'utf8');
    assert.equal(after, before);
    assert.deepEqual(await readdir(dir), [STATE_FILE]);
  });
});

test('a file that cannot corroborate the claim is refused too', async () => {
  await withDir(async dir => {
    // An absent file cannot confirm the stamp the caller says it read, and a
    // conditional write is a claim about what is on disk. Writing anyway stays
    // available by dropping `expect`, which makes it a deliberate act.
    await assert.rejects(
      () => writeState(dir, baseline(), '2026-08-19T09:12:00Z'),
      (error: unknown) => {
        assert.ok(error instanceof StaleStateError);
        assert.equal(error.found, undefined);
        assert.equal(error.heldBy, undefined);
        return true;
      },
    );

    assert.deepEqual(await readdir(dir), []);
  });
});
