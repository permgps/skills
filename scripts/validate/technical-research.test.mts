// Research declarations are checked mechanically; source interpretation remains judgement.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { researchViolations, type ResearchRecord } from '../../skills/maestro/tools/runtime/technical-research.mts';
import { installedRecord, unavailableRecord } from './fixtures/technical-research/scenarios.mts';
import { activeContract10State, CAPTURES, SOURCE_MANIFEST } from '../state/fixtures/verification.ts';

test('installed evidence establishes only its version while latest docs stay mismatched', () => {
  assert.deepEqual(researchViolations(installedRecord()), []);
  const record = installedRecord(); record.sources[1]!.applicability = 'applicable';
  assert.ok(researchViolations(record).some(v => v.includes('match the known')));
});
test('unavailable access and zero sources are legal unresolved evidence, never an established fact', () => {
  const record = unavailableRecord(); assert.deepEqual(researchViolations(record), []);
  record.status = 'established'; record.fact = 'Guessed interface'; record.uncertainty = [];
  assert.ok(researchViolations(record).some(v => v.includes('supporting evidence')));
});
test('applicable and unknown conflicts cannot be recorded as established', () => {
  for (const applicability of ['applicable', 'unknown'] as const) {
    const record = installedRecord(); record.sources[1]!.version = '1.0.0'; record.sources[1]!.applicability = applicability;
    assert.ok(researchViolations(record).some(v => v.includes('conflict prevents')));
    record.status = 'unresolved'; record.fact = null; record.uncertainty = ['Sources conflict'];
    assert.deepEqual(researchViolations(record), []);
  }
});
test('unknown versions, false mismatches, excess budgets and malformed fields fail closed', () => {
  const changes: Array<(r: ResearchRecord) => void> = [
    r => { r.dependency.version = 'unknown'; }, r => { r.dependency.versionSource = 'unknown'; },
    r => { r.sources[1]!.version = '1.0.0'; }, r => { r.budget.inspections = 9; },
    r => { r.budget.minutes = 11; }, r => { r.budget.inspections = 0; },
    r => { r.sources.reverse(); }, r => { r.question = 'a'.repeat(200_000); },
    r => { r.requirementIds.push('R01'); }, r => { r.sources[0]!.location = ''; },
  ];
  for (const change of changes) { const r = installedRecord(); change(r); assert.ok(researchViolations(r).length); }
  for (const malformed of [null, [], {}, { sources: [null] }, { ...installedRecord(), extra: true }]) assert.ok(researchViolations(malformed).length);
});

async function project() {
  const root = await mkdtemp(path.join(tmpdir(), 'maestro-research-'));
  const maestro = path.join(root, '.maestro');
  await mkdir(maestro);
  await cp('skills/maestro/tools/sync.mts', path.join(maestro, 'sync.mts'));
  await cp('skills/maestro/tools/runtime', path.join(maestro, 'runtime'), { recursive: true });
  const state = activeContract10State();
  async function seed() {
    const folder = path.join(maestro, state.dir!); await mkdir(folder, { recursive: true });
    for (const [relative, body] of Object.entries({ ...CAPTURES, 'manifest.md': SOURCE_MANIFEST })) {
      const file = path.join(folder, relative); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, body);
    }
    await writeFile(path.join(maestro, 'state.js'), `globalThis.MAESTRO_STATE = ${JSON.stringify(state)};\n`);
  }
  await seed();
  async function publish(record: ResearchRecord, dir = state.dir!) {
    const candidate = path.join(root, 'candidate.json'); await writeFile(candidate, JSON.stringify(record));
    const result = spawnSync(process.execPath, [path.join(maestro, 'sync.mts'), '--research-record', candidate, '--run-dir', dir],
      { encoding: 'utf8', cwd: root, env: { ...process.env, LOG_LEVEL: 'debug', MAESTRO_SYNC_NO_OPEN: '1' } });
    return { code: result.status, out: JSON.parse(result.stdout || '{}') as Record<string, unknown>, err: result.stderr };
  }
  return { root, maestro, state, seed, publish, dispose: () => rm(root, { recursive: true, force: true }) };
}

test('the copied helper publishes immutable evidence, rejects branches and keeps unresolved rechecks', async () => {
  const p = await project();
  try {
    const before = await readFile(path.join(p.maestro, 'state.js'), 'utf8');
    const record = installedRecord();
    const first = await p.publish(record); assert.equal(first.code, 0, first.err); assert.equal(first.out.status, 'written');
    assert.match(first.err, /research.publish/); assert.ok(!first.err.includes(record.fact!));
    assert.equal((await p.publish(record)).out.status, 'kept');
    assert.equal((await p.publish({ ...record, fact: 'different evidence' })).code, 1);
    const unresolved = { ...unavailableRecord(), id: 'Q02', supersedes: 'Q01' };
    assert.equal((await p.publish(unresolved)).code, 0);
    assert.equal((await p.publish({ ...record, id: 'Q03', supersedes: 'Q01' })).code, 1);
    assert.equal((await p.publish({ ...record, id: 'Q03' })).code, 1);
    assert.equal((await p.publish({ ...record, id: 'Q03', supersedes: 'Q02' })).code, 0);
    const saved = JSON.parse(await readFile(path.join(p.maestro, p.state.dir!, 'research/Q02.json'), 'utf8')) as ResearchRecord;
    assert.equal(saved.status, 'unresolved'); assert.equal(saved.fact, null);
    assert.equal(await readFile(path.join(p.maestro, 'state.js'), 'utf8'), before);
    assert.ok(!(await readdir(p.maestro)).includes('serve.json'));
  } finally { await p.dispose(); }
});

test('research survives real close and reopen relocation and stays isolated from a second run', async () => {
  const p = await project();
  try {
    assert.equal((await p.publish(installedRecord())).code, 0);
    const originalDir = p.state.dir!;
    // Use the actual relocation routine with a nonempty research source locator.
    const { relocateRunDir } = await import('../../skills/maestro/tools/runtime/relocation.mts');
    const closed = originalDir.replace(/--wip$/, '');
    await relocateRunDir(p.root, p.maestro, originalDir, closed, p.state.runId);
    const saved = await readFile(path.join(p.maestro, closed, 'research/Q01.json'), 'utf8');
    assert.ok(saved.includes('node_modules/fixture-client/index.d.ts:send'));
    await relocateRunDir(p.root, p.maestro, closed, originalDir, p.state.runId);
    assert.equal((await p.publish(installedRecord())).out.status, 'kept');
    p.state.slug = 'second-run'; p.state.runId = 'second-run'; p.state.dir = '2026-09-29-second-run--wip';
    await p.seed();
    assert.equal((await p.publish(unavailableRecord())).code, 0);
    assert.equal(await readFile(path.join(p.maestro, originalDir, 'research/Q01.json'), 'utf8'), saved);
  } finally { await p.dispose(); }
});

test('publication refuses escapes, symlinked destinations and malformed state without a viewer', async () => {
  const p = await project();
  try {
    assert.equal((await p.publish(installedRecord(), '../elsewhere')).code, 1);
    const outside = path.join(p.root, 'outside'); await mkdir(outside);
    await symlink(outside, path.join(p.maestro, p.state.dir!, 'research'));
    assert.equal((await p.publish(installedRecord())).code, 1);
    assert.deepEqual(await readdir(outside), []);
    await writeFile(path.join(p.maestro, 'state.js'), 'broken');
    assert.equal((await p.publish(installedRecord())).code, 2);
  } finally { await p.dispose(); }
});

test('legacy published state remains readable without introducing a research state field', async () => {
  const p = await project();
  try {
    const legacy = { contractVersion: 2, runId: 'legacy', slug: 'legacy', startedAt: '2026-08-19T10:00:00Z',
      updatedAt: '2026-08-19T12:00:00Z', mode: 'semi', depth: 'normal', polish: false, dialChanges: [],
      currentStage: 'spec', stages: [{ id: 'spec', status: 'active', startedAt: '2026-08-19T10:00:00Z' }], tasks: [],
      requirements: [{ id: 'R01', status: 'in-spec' }], gates: [],
      debt: { placeholders: [], assumptions: [], emptyEnv: [] }, additions: [] };
    await mkdir(path.join(p.maestro, 'legacy'));
    await writeFile(path.join(p.maestro, 'state.js'), `globalThis.MAESTRO_STATE = ${JSON.stringify(legacy)};\n`);
    assert.equal((await p.publish(installedRecord(), 'legacy')).code, 0);
    assert.equal((await p.publish({ ...installedRecord(), id: 'Q02', requirementIds: ['R99'] }, 'legacy')).code, 1);
  } finally { await p.dispose(); }
});

test('publication refuses externally broken supersession history before accepting a retry', async () => {
  const p = await project();
  try {
    const record = installedRecord(); assert.equal((await p.publish(record)).code, 0);
    const folder = path.join(p.maestro, p.state.dir!, 'research');
    await writeFile(path.join(folder, 'Q02.json'), JSON.stringify({ ...record, id: 'Q02', supersedes: 'Q99' }));
    assert.equal((await p.publish(record)).code, 1);
    await writeFile(path.join(folder, 'Q02.json'), JSON.stringify({ ...record, id: 'Q02', supersedes: 'Q01' }));
    await writeFile(path.join(folder, 'Q03.json'), JSON.stringify({ ...record, id: 'Q03', supersedes: 'Q01' }));
    assert.equal((await p.publish(record)).code, 1);
  } finally { await p.dispose(); }
});

test('a real repository package contract travels through the copied publisher with its provenance', async () => {
  const metadata = JSON.parse(await readFile('package.json', 'utf8')) as { name: string; version: string; engines: { node: string } };
  assert.equal(metadata.engines.node, '>=22.18');
  const record: ResearchRecord = { ...installedRecord(), question: 'Which Node version does this package declare?',
    dependency: { name: metadata.name, version: metadata.version, versionSource: 'package.json:version' },
    assumptions: [], fact: 'The package declares Node >=22.18.', sources: [{ kind: 'installed-source', location: 'package.json:engines.node',
      version: metadata.version, applicability: 'applicable', supports: 'The engines.node field is >=22.18.', conflict: false }],
    budget: { inspections: 1, minutes: 0.1 } };
  const p = await project();
  try {
    assert.equal((await p.publish(record)).code, 0);
    const published = JSON.parse(await readFile(path.join(p.maestro, p.state.dir!, 'research/Q01.json'), 'utf8')) as ResearchRecord;
    assert.deepEqual(published, record);
  } finally { await p.dispose(); }
});

test('enumerated research fields reject arrays that stringify to a legal value', () => {
  assert.ok(researchViolations({ ...installedRecord(), impact: ['feasibility'] }).length);
  const record = installedRecord();
  const malformed = { ...record, sources: [record.sources[0], { ...record.sources[1], conflict: false, applicability: ['mismatch'] }] };
  assert.ok(researchViolations(malformed).length);
});

test('a near-limit compact record remains readable after publication and retry', async () => {
  const record = unavailableRecord();
  record.question = 'q'.repeat(2_000);
  record.assumptions = Array.from({ length: 8 }, () => 'a'.repeat(2_000));
  record.uncertainty = Array.from({ length: 8 }, () => 'u'.repeat(2_000));
  record.sources = Array.from({ length: 8 }, () => ({ ...installedRecord().sources[0]!, location: 'p'.repeat(2_000), supports: 's'.repeat(2_000) }));
  record.budget.inspections = 8;
  const target = 65_526;
  const length = Buffer.byteLength(JSON.stringify(record));
  assert.ok(length > target && length - target < 2_000);
  record.sources[0]!.supports = 's'.repeat(2_000 - (length - target));
  assert.equal(Buffer.byteLength(JSON.stringify(record)), target);
  assert.ok(Buffer.byteLength(JSON.stringify(record, null, 2)) > 65_536);
  assert.deepEqual(researchViolations(record), []);
  const p = await project();
  try {
    assert.equal((await p.publish(record)).code, 0);
    assert.equal((await p.publish(record)).code, 0);
  } finally { await p.dispose(); }
});
