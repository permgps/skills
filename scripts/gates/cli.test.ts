import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { runGate, targetFromArgv, type GateFinding } from './cli.ts';
import { writeState } from '../state/write.ts';
import { CONTRACT_VERSION, type RunState } from '../state/contract.ts';

function validState(): RunState {
  return {
    contractVersion: CONTRACT_VERSION,
    runId: 'run-1',
    slug: 'landing-page',
    startedAt: '2026-08-19T09:00:00Z',
    mode: 'semi',
    depth: 'normal',
    polish: false,
    dialChanges: [],
    stages: [{ id: 'preflight', status: 'done' }],
    currentStage: 'briefing',
    tasks: [],
    requirements: [{ id: 'R01', status: 'in-spec' }],
    gates: [{ id: 'G1', status: 'pending', findings: [] }],
    updatedAt: '2026-08-19T09:12:00Z',
    debt: { placeholders: [], assumptions: [], emptyEnv: [] },
    additions: [],
  };
}

/** Run a gate with stdout captured, so the exit code and the report are both testable. */
async function capture(
  gate: string,
  check: (state: RunState) => GateFinding[],
  target: string,
): Promise<{ code: number; out: string }> {
  const original = process.stdout.write.bind(process.stdout);
  let out = '';
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    out += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    return true;
  }) as typeof process.stdout.write;

  try {
    const code = await runGate(gate, check, target);
    return { code, out };
  } finally {
    process.stdout.write = original;
  }
}

async function withDir(body: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'gate-cli-'));
  try {
    await body(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('a gate with no findings exits 0 and says so', async () => {
  await withDir(async dir => {
    await writeState(dir, validState());
    const { code, out } = await capture('check-x', () => [], dir);
    assert.equal(code, 0);
    assert.equal(out, 'check-x: pass\n');
  });
});

test('a gate with findings exits 1 and prints every one of them', async () => {
  await withDir(async dir => {
    await writeState(dir, validState());
    const { code, out } = await capture('check-x', () => [
      { requirementId: 'R01', message: 'first finding' },
      { requirementId: 'R02', message: 'second finding' },
    ], dir);

    assert.equal(code, 1);
    assert.match(out, /first finding/);
    assert.match(out, /second finding/);
    assert.match(out, /check-x: fail — 2 finding\(s\)/);
    // The consequence is part of the report: a failed gate is not advisory.
    assert.match(out, /runs again with these as input/);
  });
});

test('an unreadable state exits 2, not 1 — nothing was checked', async () => {
  await withDir(async dir => {
    const { code, out } = await capture('check-x', () => [], dir);
    assert.equal(code, 2);
    assert.match(out, /^check-x: /);
  });
});

test('a state file that is not a state file also exits 2', async () => {
  await withDir(async dir => {
    await writeFile(path.join(dir, 'state.js'), '# not javascript\n', 'utf8');
    const { code } = await capture('check-x', () => [], dir);
    assert.equal(code, 2);
  });
});

test('a state that fails validation exits 2 rather than passing a gate', async () => {
  await withDir(async dir => {
    await writeFile(
      path.join(dir, 'state.js'),
      'globalThis.MAESTRO_STATE = {"contractVersion": 1, "runId": "r"};\n',
      'utf8',
    );
    // The check must never run: it would be judging a state nobody could parse.
    let ran = false;
    const { code } = await capture('check-x', () => { ran = true; return []; }, dir);
    assert.equal(code, 2);
    assert.equal(ran, false);
  });
});

test('the target defaults to .maestro and is taken from argv otherwise', () => {
  assert.equal(targetFromArgv(['node', 'check-g1.ts']), '.maestro');
  assert.equal(targetFromArgv(['node', 'check-g1.ts', 'other/.maestro']), 'other/.maestro');
});
