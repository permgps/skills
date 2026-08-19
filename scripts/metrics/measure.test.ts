import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { CONTRACT_VERSION, type RunState } from '../state/contract.ts';
import { serializeState, STATE_FILE } from '../state/write.ts';
import { formatSpan, main, measure, render, span, targetFromArgv, wantsJson, widestWave } from './measure.ts';

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
    stages: [
      { id: 'preflight', status: 'done', startedAt: '2026-08-19T09:00:00Z', finishedAt: '2026-08-19T09:02:00Z' },
      { id: 'build', status: 'done', startedAt: '2026-08-19T09:10:00Z', finishedAt: '2026-08-19T10:10:00Z' },
    ],
    currentStage: 'acceptance',
    tasks: [
      {
        id: '01', title: 'a', requirementIds: ['R01'], status: 'done', blockedBy: [],
        startedAt: '2026-08-19T09:10:00Z', finishedAt: '2026-08-19T09:40:00Z',
      },
      {
        id: '02', title: 'b', requirementIds: ['R02'], status: 'done', blockedBy: [],
        startedAt: '2026-08-19T09:20:00Z', finishedAt: '2026-08-19T09:50:00Z',
      },
      { id: '03', title: 'c', requirementIds: ['R03'], status: 'repair', blockedBy: [] },
    ],
    requirements: [
      { id: 'R01', status: 'in-spec' },
      { id: 'R02', status: 'in-spec' },
      { id: 'R03', status: 'deferred', reason: 'no data' },
    ],
    gates: [
      { id: 'G1', status: 'passed', findings: [] },
      { id: 'G4', status: 'failed', findings: ['R03 is not built'] },
    ],
    finishedAt: '2026-08-19T10:30:00Z',
  };
}

async function withState(state: RunState, body: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'metrics-'));
  try {
    await writeFile(path.join(dir, STATE_FILE), serializeState(state), 'utf8');
    await body(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('span is null when either end is missing or unparseable', () => {
  assert.equal(span('2026-08-19T09:00:00Z', undefined), null);
  assert.equal(span(undefined, '2026-08-19T09:00:00Z'), null);
  assert.equal(span('yesterday', '2026-08-19T09:00:00Z'), null);
  assert.equal(span('2026-08-19T09:00:00Z', '2026-08-19T09:01:30Z'), 90_000);
});

test('a duration the state does not carry renders as a dash, never as zero', () => {
  assert.equal(formatSpan(null), '—');
  assert.equal(formatSpan(90_000), '1m 30s');
  assert.equal(formatSpan(3_849_000), '1h 04m 09s');
});

test('measure reports what the state records and nothing else', () => {
  const m = measure(baseline());
  assert.equal(m.runId, 'run-2026-08-19-01');
  assert.equal(m.finished, true);
  assert.equal(m.totalMs, 90 * 60 * 1000);
  assert.equal(m.taskCount, 3);
  assert.equal(m.tasksByStatus.done, 2);
  assert.equal(m.tasksByStatus.repair, 1);
  assert.equal(m.requirementsByStatus['in-spec'], 2);
  assert.equal(m.requirementsByStatus.deferred, 1);
  assert.equal(m.interruptedAt, null);
});

test('every stage of the contract appears, absent ones included', () => {
  const m = measure(baseline());
  assert.equal(m.stages.length, 8);
  const manifest = m.stages.find(stage => stage.id === 'manifest');
  assert.equal(manifest?.status, 'absent');
  assert.equal(manifest?.ms, null);
});

test('every gate of the contract appears, absent ones included', () => {
  const m = measure(baseline());
  assert.equal(m.gates.length, 4);
  assert.deepEqual(m.gates.find(gate => gate.id === 'G2'), { id: 'G2', status: 'absent', findings: 0 });
  assert.equal(m.gates.find(gate => gate.id === 'G4')?.findings, 1);
});

test('the widest wave is what the windows overlapped, not what was planned', () => {
  assert.equal(widestWave(baseline()), 2);
});

test('таски that only touch are not a wave of two', () => {
  const state = baseline();
  state.tasks = [
    { id: '01', title: 'a', requirementIds: ['R01'], status: 'done', blockedBy: [], startedAt: '2026-08-19T09:00:00Z', finishedAt: '2026-08-19T09:10:00Z' },
    { id: '02', title: 'b', requirementIds: ['R02'], status: 'done', blockedBy: [], startedAt: '2026-08-19T09:10:00Z', finishedAt: '2026-08-19T09:20:00Z' },
  ];
  assert.equal(widestWave(state), 1);
});

test('a таск with no recorded window is skipped rather than assumed', () => {
  const state = baseline();
  state.tasks = [
    { id: '01', title: 'a', requirementIds: ['R01'], status: 'running', blockedBy: [], startedAt: '2026-08-19T09:00:00Z' },
    { id: '02', title: 'b', requirementIds: ['R02'], status: 'queued', blockedBy: [] },
  ];
  assert.equal(widestWave(state), 0);
});

test('an unfinished прогон is measured, and says it is unfinished', () => {
  const state = baseline();
  delete state.finishedAt;
  const m = measure(state);
  assert.equal(m.finished, false);
  assert.equal(m.totalMs, null);
  assert.match(render(m), /total {17}not finished/);
});

test('an interrupted прогон says when', () => {
  const state = baseline();
  state.interruptedAt = '2026-08-19T10:00:00Z';
  assert.match(render(measure(state)), /interrupted at/);
});

test('a newer contract version is reported rather than refused', () => {
  const state = baseline();
  state.contractVersion = CONTRACT_VERSION + 1;
  assert.equal(measure(state).contractVersion, CONTRACT_VERSION + 1);
});

test('argv parsing takes the first non-flag as the target', () => {
  assert.equal(targetFromArgv(['node', 'measure.ts']), '.maestro');
  assert.equal(targetFromArgv(['node', 'measure.ts', '--json', 'runs/one']), 'runs/one');
  assert.equal(wantsJson(['node', 'measure.ts', '--json']), true);
  assert.equal(wantsJson(['node', 'measure.ts']), false);
});

test('main exits 0 on a readable state and 2 on an unreadable one', async () => {
  await withState(baseline(), async dir => {
    assert.equal(await main(dir, true), 0);
  });
  const missing = await mkdtemp(path.join(tmpdir(), 'metrics-missing-'));
  try {
    assert.equal(await main(missing, false), 2);
  } finally {
    await rm(missing, { recursive: true, force: true });
  }
});
