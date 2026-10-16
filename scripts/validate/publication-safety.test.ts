// Publication must serialize the complete operation, including its derived files.
// Real copied runtimes exercise process boundaries without launching a viewer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fork, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { candidateMode } from '../../skills/maestro/tools/runtime/publication.mts';
import { serializeState } from '../state/write.ts';
import { parseStateSource } from '../state/read.ts';
import { activeContract10State, contract10State, CAPTURES, CONTROL_CAPTURES, SOURCE_MANIFEST, finding, repairContract7State, v3Attempt } from '../state/fixtures/verification.ts';
import type { RunState } from '../state/contract.ts';

async function project(body: (root: string, state: RunState) => Promise<void>): Promise<void> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'publication-safety-'));
  const root = path.join(projectRoot, '.maestro');
  const state = activeContract10State();
  try {
    for (const [relative, text] of Object.entries({ ...CAPTURES, ...CONTROL_CAPTURES, 'manifest.md': SOURCE_MANIFEST })) {
      const file = path.join(root, state.dir!, relative);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, text);
    }
    await writeFile(path.join(root, 'state.js'), serializeState(state));
    await body(root, state);
  } finally { await rm(projectRoot, { recursive: true, force: true }); }
}

async function candidate(root: string, state: RunState, name = 'candidate'): Promise<string> {
  const file = path.join(root, `${name}.json`);
  await writeFile(file, JSON.stringify(state));
  return file;
}

test('copied publication rejects unordered shared paths before replacing state', async () => {
  await project(async (root, before) => {
    before.gates[2]!.status = 'pending';
    await writeFile(path.join(root, 'state.js'), serializeState(before));
    const previous = await readFile(path.join(root, 'state.js'), 'utf8');
    await cp('skills/maestro/tools/runtime', path.join(root, 'runtime'), { recursive: true });
    await cp('skills/maestro/tools/sync.mts', path.join(root, 'sync.mts'));
    const next = structuredClone(before);
    next.updatedAt = '2026-09-29T09:30:00Z';
    next.gates[2]!.status = 'passed';
    next.tasks[0]!.files = ['src/shared.ts'];
    next.tasks.push({ ...structuredClone(next.tasks[0]!), id: '02', files: [], zone: ['src/shared.ts'], blockedBy: [] });
    const file = await candidate(root, next);
    const invoke = (...args: string[]) => spawnSync(process.execPath, [path.join(root, 'sync.mts'), '--publish', file, ...args, '--no-open'], { encoding: 'utf8' });
    const refused = invoke('--expect', before.updatedAt!);
    assert.equal(refused.status, 1, refused.stdout + refused.stderr);
    assert.match(refused.stdout + refused.stderr, /both write src\/shared.ts/);
    assert.equal(await readFile(path.join(root, 'state.js'), 'utf8'), previous);
    await rm(path.join(root, 'state.js'));
    const initial = invoke();
    assert.equal(initial.status, 1, initial.stdout + initial.stderr);
    assert.match(initial.stdout + initial.stderr, /both write src\/shared.ts/);
    next.tasks[1]!.blockedBy = ['01'];
    await candidate(root, next);
    const ordered = invoke();
    assert.equal(ordered.status, 0, ordered.stdout + ordered.stderr);
  });
});

test('copied publication closes and rereads a repaired successor while preserving the open predecessor', async () => {
  await project(async (root, before) => {
    before.verification!.findings.push(finding('F-1'));
    await writeFile(path.join(root, 'state.js'), serializeState(before));
    await cp('skills/maestro/tools/runtime', path.join(root, 'runtime'), { recursive: true });
    await cp('skills/maestro/tools/sync.mts', path.join(root, 'sync.mts'));
    const next = contract10State();
    next.updatedAt = '2026-09-29T09:30:00Z';
    const record = next.verification!;
    record.executions.push({ ...structuredClone(record.executions[0]!), id: 'X-2',
      executedAt: '2026-09-29T09:18:00Z', evidenceIds: ['E-2'],
      assertions: [{ name: 'panel opens', result: 'passed', evidenceIds: ['E-2'] }] });
    const capture = { ...record.evidence.find(e => e.id === 'E-1')!, id: 'E-2',
      path: 'evidence/X-2/pointer.txt', capturedAt: '2026-09-29T09:18:00Z' };
    record.evidence.push(capture);
    await mkdir(path.dirname(path.join(root, before.dir!, capture.path)), { recursive: true });
    await writeFile(path.join(root, before.dir!, capture.path), CAPTURES['evidence/X-1/pointer.txt']!);
    record.findings.push(finding('F-1'), finding('F-2', { supersedes: 'F-1', status: 'resolved', resolutionExecutionId: 'X-2' }));
    record.acceptanceRounds[0]!.executionIds = ['X-2'];
    const file = await candidate(root, next);
    const invoke = (...args: string[]) => spawnSync(process.execPath, [path.join(root, 'sync.mts'), ...args], { encoding: 'utf8' });
    const checked = invoke('--validate', file);
    assert.equal(checked.status, 0, checked.stdout + checked.stderr);
    const published = invoke('--publish', file, '--expect', before.updatedAt!, '--no-open');
    assert.equal(published.status, 0, published.stdout + published.stderr);
    const reread = invoke('--project', path.join(root, 'state.js'));
    assert.equal(reread.status, 0, reread.stdout + reread.stderr);
    const result = JSON.parse(reread.stdout);
    assert.equal(result.summary.g4, 'passed');
    assert.equal(result.scopeProgress.original.passed, 1);
    assert.equal((parseStateSource(await readFile(path.join(root, 'state.js'), 'utf8')) as RunState).verification!.findings[0]!.status, 'open');
  });
});

test('the copied helper reads and carries historical invalid resolutions but refuses new ones', async () => {
  await project(async (root, before) => {
    before.verification!.findings.push(finding('F-old', { status: 'resolved', resolutionExecutionId: 'X-1' }));
    await writeFile(path.join(root, 'state.js'), serializeState(before));
    await cp('skills/maestro/tools/runtime', path.join(root, 'runtime'), { recursive: true });
    await cp('skills/maestro/tools/sync.mts', path.join(root, 'sync.mts'));
    const projectResult = spawnSync(process.execPath, [path.join(root, 'sync.mts'), '--project', path.join(root, 'state.js')],
      { encoding: 'utf8' });
    assert.equal(projectResult.status, 0, projectResult.stderr + projectResult.stdout);
    assert.equal(JSON.parse(projectResult.stdout).summary.g4, 'failed');
    const next = { ...structuredClone(before), updatedAt: '2026-09-29T09:30:00Z' };
    const published = await candidateMode(['--publish', await candidate(root, next), '--expect', before.updatedAt!], root);
    assert.equal(published.code, 0, JSON.stringify(published));
    const invalid = { ...structuredClone(next), updatedAt: '2026-09-29T09:31:00Z' };
    invalid.verification!.findings.push(finding('F-new', { status: 'resolved', resolutionExecutionId: 'X-1' }));
    const refused = await candidateMode(['--publish', await candidate(root, invalid), '--expect', next.updatedAt], root);
    assert.equal(refused.code, 1, JSON.stringify(refused));
    assert.ok(JSON.stringify(refused).includes('resolutionExecutionId'));
    await rm(path.join(root, 'state.js'));
    const initial = await candidateMode(['--publish', await candidate(root, invalid)], root);
    assert.equal(initial.code, 1, 'the first publication cannot call new invalid resolutions history');
  });
});

test('concurrent candidates based on one revision cannot both publish', async () => {
  await project(async (root, before) => {
    const files = await Promise.all(Array.from({ length: 8 }, (_, index) => candidate(root, {
      ...before, updatedAt: `2026-09-29T09:3${index}:00Z`, additions: [`writer ${index}`],
    }, `writer-${index}`)));
    const results = await Promise.all(files.map(file => candidateMode(['--publish', file, '--expect', before.updatedAt!], root)));
    assert.equal(results.filter(result => result.code === 0).length, 1, JSON.stringify(results));
    const winner = results.findIndex(result => result.code === 0);
    assert.deepEqual(parseStateSource(await readFile(path.join(root, 'state.js'), 'utf8')),
      JSON.parse(await readFile(files[winner]!, 'utf8')));
  });
});

test('a second process cannot publish while the first still writes derived snapshots', async () => {
  await project(async (root, before) => {
    await cp('skills/maestro/tools/runtime', path.join(root, 'runtime'), { recursive: true });
    await cp('skills/maestro/tools/sync.mts', path.join(root, 'sync.mts'));
    const first = { ...before, updatedAt: '2026-09-29T09:30:00Z' };
    const next = { ...before, updatedAt: '2026-09-29T09:31:00Z', additions: ['second writer'] };
    const firstFile = await candidate(root, first, 'first');
    const nextFile = await candidate(root, next, 'next');
    const worker = path.join(root, 'publisher.mts');
    await writeFile(worker, `import { once } from 'node:events';
import { candidateMode } from './runtime/publication.mts';
const result = await candidateMode(['--publish', process.argv[2], '--expect', process.argv[3]], import.meta.dirname,
  async () => null, async () => {
    const released = once(process, 'message');
    process.send({ ready: true });
    await released;
  });
process.send(result);
process.disconnect();
`);
    const child = fork(worker, [firstFile, before.updatedAt!], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    const exited = once(child, 'exit');
    try {
      const [ready] = await once(child, 'message');
      assert.deepEqual(ready, { ready: true });
      const second = spawnSync(process.execPath, [path.join(root, 'sync.mts'), '--publish', nextFile,
        '--expect', first.updatedAt, '--no-open'], { encoding: 'utf8', timeout: 5000 });
      assert.equal(second.status, 1, second.stdout + second.stderr);
      assert.equal((parseStateSource(await readFile(path.join(root, 'state.js'), 'utf8')) as RunState).updatedAt,
        first.updatedAt);
      const completed = once(child, 'message');
      child.send({ release: true });
      const [result] = await completed;
      assert.equal(result.code, 0);
    } finally {
      if (child.connected) child.disconnect();
      child.kill('SIGTERM');
      await exited;
    }
  });
});

test('changed candidates require a strictly later revision but identical retries are allowed', async () => {
  await project(async (root, before) => {
    const original = await readFile(path.join(root, 'state.js'), 'utf8');
    for (const updatedAt of [before.updatedAt!, '2026-09-29T09:19:00Z', '2026-09-29T10:20:00+01:00']) {
      const file = await candidate(root, { ...before, updatedAt, additions: ['changed'] });
      const result = await candidateMode(['--publish', file, '--expect', before.updatedAt!], root);
      assert.equal(result.code, 1, `accepted a changed state at ${updatedAt}`);
      assert.equal(await readFile(path.join(root, 'state.js'), 'utf8'), original);
    }
    const retry = await candidate(root, Object.fromEntries(Object.entries(before).reverse()) as unknown as RunState);
    assert.equal((await candidateMode(['--publish', retry, '--expect', before.updatedAt!], root)).code, 0);
    const next = await candidate(root, { ...before, updatedAt: '2026-09-29T09:21:00Z', additions: ['changed'] });
    assert.equal((await candidateMode(['--publish', next, '--expect', before.updatedAt!], root)).code, 0);
  });
});

test('copied repair CLI reserves the last slot once and preserves it across resume', async () => {
  await project(async root => {
    const before = repairContract7State();
    before.verification!.repairDispatches = [];
    before.verification!.repairAccounting = { status: 'complete', reviewedAt: before.updatedAt!, evidenceIds: [], note: 'Fresh fixture' };
    before.verification!.repairLimits.total = 1;
    await writeFile(path.join(root, 'state.js'), serializeState(before));
    await cp('skills/maestro/tools/runtime', path.join(root, 'runtime'), { recursive: true });
    await cp('skills/maestro/tools/sync.mts', path.join(root, 'sync.mts'));
    const next = structuredClone(before);
    next.updatedAt = '2026-09-29T09:30:00Z';
    const { at, outcome: _outcome, ...proposal } = v3Attempt('RA-1', 'F-1', 'DF-1', '2026-09-29T09:21:00Z');
    next.verification!.repairDispatches = [{ id: 'RDSP-1', at, base: 'abcdef0', status: 'reserved', proposal }];
    const file = await candidate(root, next);
    const invoke = () => spawnSync(process.execPath, [path.join(root, 'sync.mts'), '--repair-dispatch', file, '--expect', before.updatedAt!, '--no-open'], { encoding: 'utf8' });
    const first = invoke();
    assert.equal(first.status, 0, first.stdout + first.stderr);
    assert.equal(invoke().status, 1, 'stale parallel intent cannot claim the same capacity');
    const resumed = spawnSync(process.execPath, [path.join(root, 'sync.mts'), '--project', path.join(root, 'state.js')], { encoding: 'utf8' });
    assert.equal(resumed.status, 0, resumed.stdout + resumed.stderr);
    const overflow = structuredClone(next);
    overflow.updatedAt = '2026-09-29T09:31:00Z';
    overflow.verification!.repairDispatches!.push({ ...next.verification!.repairDispatches![0]!, id: 'RDSP-2', proposal: { ...proposal, id: 'RA-2' } });
    const rejected = await candidateMode(['--publish', await candidate(root, overflow), '--expect', next.updatedAt!], root);
    assert.equal(rejected.code, 1);
    assert.match(JSON.stringify(rejected), /total budget/);
  });
});

test('first publication enforces repair admission rather than accepting a fabricated returned ledger', async () => {
  await project(async root => {
    const state = repairContract7State();
    const { at, outcome: _outcome, ...proposal } = v3Attempt('RA-1', 'F-1', 'DF-1', '2026-09-29T09:14:00Z');
    state.verification!.repairAccounting = { status: 'complete', reviewedAt: state.updatedAt!, evidenceIds: [], note: 'Fabricated first snapshot' };
    state.verification!.repairDispatches = [{ id: 'RDSP-1', at, base: 'abcdef0', proposal, status: 'returned', settledAt: state.updatedAt!, executionIds: ['X-1'] }];
    state.verification!.repairAttempts.push({ ...proposal, at, outcome: 'still_failing' });
    await rm(path.join(root, 'state.js'));
    const result = await candidateMode(['--publish', await candidate(root, state)], root);
    assert.equal(result.code, 1, JSON.stringify(result));
    assert.match(JSON.stringify(result), /must first be published reserved/);
  });
});

test('copied publisher refuses a newly passed G3 with the active-run empty graph shape', async () => {
  await project(async (root, before) => {
    const record = before.verification!;
    if (record.version !== 3) throw new Error('fixture');
    record.obligations = []; record.checks = []; record.executions = [];
    record.findings = []; record.coverageReviews = []; record.defects = [];
    for (const expectation of record.scopeBaseline!.expectations) expectation.checkIds = [];
    record.repairAttempts = []; record.readiness = []; record.journeys = []; record.negativeControls = [];
    before.gates[2]!.status = 'pending';
    await writeFile(path.join(root, 'state.js'), serializeState(before));
    await cp('skills/maestro/tools/runtime', path.join(root, 'runtime'), { recursive: true });
    await cp('skills/maestro/tools/sync.mts', path.join(root, 'sync.mts'));
    const next = structuredClone(before);
    next.updatedAt = '2026-09-29T09:30:00Z';
    next.gates[2]!.status = 'passed';
    const result = spawnSync(process.execPath, [path.join(root, 'sync.mts'), '--publish', await candidate(root, next), '--expect', before.updatedAt!, '--no-open'], { encoding: 'utf8' });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /requirement R01 has no current observable obligation/);
    assert.equal(await readFile(path.join(root, 'state.js'), 'utf8'), serializeState(before));
  });
});
