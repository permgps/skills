// Copied helper import must make cleanup eligibility depend on durable publication.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { activeContract10State, contract10State, CAPTURES, SOURCE_MANIFEST, sha256 } from '../state/fixtures/verification.ts';
import { readState } from '../state/read.ts';
import { serializeState } from '../state/write.ts';
import type { RunState } from '../state/contract.ts';

async function fixture(body: (root: string, source: string, state: RunState) => Promise<void>) {
  const project = await mkdtemp(path.join(tmpdir(), 'import-sync-'));
  const root = path.join(project, '.maestro');
  const source = path.join(project, 'scratch');
  const state = activeContract10State();
  try {
    await mkdir(source);
    for (const [relative, text] of Object.entries({ ...CAPTURES, 'manifest.md': SOURCE_MANIFEST })) {
      const file = path.join(root, state.dir!, relative);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, text);
    }
    await writeFile(path.join(root, 'state.js'), serializeState(state));
    await cp('skills/maestro/tools/runtime', path.join(root, 'runtime'), { recursive: true });
    await cp('skills/maestro/tools/sync.mts', path.join(root, 'sync.mts'));
    await body(root, source, state);
  } finally { await rm(project, { recursive: true, force: true }); }
}
async function invoke(root: string, source: string, state: RunState, sources: Record<string, string>, expect: string) {
  await writeFile(path.join(root, 'candidate.json'), JSON.stringify(state));
  await writeFile(path.join(root, 'sources.json'), JSON.stringify(sources));
  return spawnSync(process.execPath, [path.join(root, 'sync.mts'), '--import-evidence', path.join(root, 'candidate.json'),
    '--source', source, '--sources', path.join(root, 'sources.json'), '--expect', expect, '--no-open'], { encoding: 'utf8', timeout: 5000 });
}
function nextState(before: RunState) {
  const next = structuredClone(before);
  next.updatedAt = '2026-09-29T09:30:00Z';
  next.verification!.evidence.push({ ...next.verification!.evidence[1]!, id: 'E-2', path: 'evidence/X-2/result.txt', sha256: sha256('second attempt\n') });
  next.verification!.executions.push({ ...next.verification!.executions[0]!, id: 'X-2', executedAt: '2026-09-29T09:29:00Z', evidenceIds: ['E-2'], assertions: [{ name: 'panel opens', result: 'passed', evidenceIds: ['E-2'] }] });
  return next;
}

test('copied importer retains attempt one and publishes attempt two before allowing cleanup', async () => {
  await fixture(async (root, source, before) => {
    const next = nextState(before);
    await writeFile(path.join(source, 'result.txt'), 'second attempt\n');
    const result = await invoke(root, source, next, { 'E-2': 'result.txt' }, before.updatedAt!);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(JSON.parse(result.stdout).cleanupEligible, true);
    await rm(source, { recursive: true });
    assert.equal(await readFile(path.join(root, next.dir!, 'evidence/X-2/result.txt'), 'utf8'), 'second attempt\n');
    assert.equal(await readFile(path.join(root, next.dir!, 'evidence/X-1/pointer.txt'), 'utf8'), CAPTURES['evidence/X-1/pointer.txt']);
  });
});

test('source/hash/containment/stale/collision failures retain source and exact prior state', async () => {
  await fixture(async (root, source, before) => {
    const next = nextState(before);
    const prior = await readFile(path.join(root, 'state.js'), 'utf8');
    await writeFile(path.join(source, 'result.txt'), 'second attempt\n');
    await writeFile(path.join(source, 'wrong.txt'), 'changed');
    await writeFile(path.join(path.dirname(root), 'outside.txt'), 'second attempt\n');
    await symlink(path.join(path.dirname(root), 'outside.txt'), path.join(source, 'escape.txt'));
    for (const [sources, stamp, message] of [
      [{}, before.updatedAt!, /source map/],
      [{ 'E-2': 'missing.txt' }, before.updatedAt!, /missing/],
      [{ 'E-2': 'wrong.txt' }, before.updatedAt!, /SHA-256/],
      [{ 'E-2': 'escape.txt' }, before.updatedAt!, /outside/],
      [{ 'E-2': 'result.txt' }, '2026-09-29T09:01:00Z', /revision|stamp/],
    ] as [Record<string, string>, string, RegExp][]) {
      const result = await invoke(root, source, next, sources, stamp);
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.equal(JSON.parse(result.stdout).cleanupEligible, false);
      assert.match(result.stdout, message);
      assert.equal(await readFile(path.join(root, 'state.js'), 'utf8'), prior);
      assert.equal(await readFile(path.join(source, 'result.txt'), 'utf8'), 'second attempt\n');
    }
    const dest = path.join(root, next.dir!, 'evidence/X-2/result.txt');
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, 'sealed other content');
    const collision = await invoke(root, source, next, { 'E-2': 'result.txt' }, before.updatedAt!);
    assert.equal(collision.status, 1, collision.stdout + collision.stderr);
    assert.match(collision.stdout, /different content/);
    assert.equal(await readFile(dest, 'utf8'), 'sealed other content');
    assert.equal(await readFile(path.join(root, 'state.js'), 'utf8'), prior);
  });
});

test('an identical partial import is reusable after an independent evidence failure', async () => {
  await fixture(async (root, source, before) => {
    const next = nextState(before);
    await writeFile(path.join(source, 'result.txt'), 'second attempt\n');
    const capture = path.join(root, next.dir!, 'evidence/X-1/pointer.txt');
    await rm(capture);
    const failed = await invoke(root, source, next, { 'E-2': 'result.txt' }, before.updatedAt!);
    assert.equal(failed.status, 1, failed.stdout + failed.stderr);
    assert.equal(JSON.parse(failed.stdout).cleanupEligible, false);
    assert.equal(await readFile(path.join(root, next.dir!, 'evidence/X-2/result.txt'), 'utf8'), 'second attempt\n');
    await writeFile(capture, CAPTURES['evidence/X-1/pointer.txt']!);
    const retry = await invoke(root, source, next, { 'E-2': 'result.txt' }, before.updatedAt!);
    assert.equal(retry.status, 0, retry.stdout + retry.stderr);
    const replay = await invoke(root, source, next, { 'E-2': 'result.txt' }, next.updatedAt!);
    assert.equal(replay.status, 0, replay.stdout + replay.stderr);
  });
});

test('durable replay survives scratch deletion; changed or missing bytes are unavailable on resume', async () => {
  await fixture(async (root, source, before) => {
    const script = "process.stdout.write('replayed exact bytes\\n');\n";
    const next = structuredClone(before);
    next.updatedAt = '2026-09-29T09:30:00Z';
    if (next.verification!.version !== 3) throw new Error('fixture');
    next.verification!.replayTools = [{ id: 'RT-1', path: '_orchestrator/RT-1/replay.mts', sha256: sha256(script), checkIds: ['C-1'], invocation: 'node /temporary/original.mts' }];
    await writeFile(path.join(source, 'replay.mts'), script);
    const imported = await invoke(root, source, next, { 'RT-1': 'replay.mts' }, before.updatedAt!);
    assert.equal(imported.status, 0, imported.stdout + imported.stderr);
    await rm(source, { recursive: true });
    const durable = path.join(root, next.dir!, '_orchestrator/RT-1/replay.mts');
    const replay = spawnSync(process.execPath, [durable], { encoding: 'utf8' });
    assert.equal(replay.status, 0, replay.stderr);
    assert.equal(replay.stdout, 'replayed exact bytes\n');
    const resume = () => spawnSync(process.execPath, [path.join(root, 'sync.mts'), '--project', path.join(root, 'state.js')], { encoding: 'utf8' });
    assert.equal(resume().status, 0);
    await writeFile(durable, '// mutated');
    const changed = resume();
    assert.equal(changed.status, 1, changed.stdout);
    assert.match(changed.stdout, /replayTools.*SHA-256/);
    await rm(durable);
    assert.match(resume().stdout, /missing/);
  });
});

test('nonempty replay locators survive closure relocation and stay isolated from a successor', async () => {
  await fixture(async (root, source, before) => {
    const script = "process.stdout.write('isolated');\n";
    const next = structuredClone(before);
    next.updatedAt = '2026-09-29T09:30:00Z';
    if (next.verification!.version !== 3) throw new Error('fixture');
    next.verification!.replayTools = [{ id: 'RT-1', path: '_orchestrator/RT-1/tool.mts', sha256: sha256(script), checkIds: [], invocation: 'node scratch.mts' }];
    await writeFile(path.join(source, 'tool.mts'), script);
    const imported = await invoke(root, source, next, { 'RT-1': 'tool.mts' }, before.updatedAt!);
    assert.equal(imported.status, 0, imported.stdout + imported.stderr);
    const closed = contract10State();
    closed.updatedAt = '2026-09-29T09:31:00Z';
    closed.finishedAt = closed.updatedAt;
    closed.verification!.replayTools = next.verification!.replayTools;
    const relocated = await invoke(root, source, closed, {}, next.updatedAt!);
    assert.equal(relocated.status, 0, relocated.stdout + relocated.stderr);
    assert.equal(await readFile(path.join(root, closed.dir!, '_orchestrator/RT-1/tool.mts'), 'utf8'), script);
    const successor = activeContract10State();
    successor.runId = 'run-synthetic-2';
    successor.slug = 'synthetic-menu-2';
    successor.dir = '2026-09-29-synthetic-menu-2--wip';
    successor.startedAt = '2026-09-29T10:00:00Z';
    successor.updatedAt = successor.startedAt;
    for (const [relative, text] of Object.entries({ ...CAPTURES, 'manifest.md': SOURCE_MANIFEST })) {
      const target = path.join(root, successor.dir!, relative);
      await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, text);
    }
    await writeFile(path.join(root, 'successor.json'), JSON.stringify(successor));
    const published = spawnSync(process.execPath, [path.join(root, 'sync.mts'), '--publish', path.join(root, 'successor.json'), '--expect', closed.updatedAt!, '--no-open'], { encoding: 'utf8' });
    assert.equal(published.status, 0, published.stdout + published.stderr);
    assert.equal(await readFile(path.join(root, closed.dir!, '_orchestrator/RT-1/tool.mts'), 'utf8'), script);
    assert.deepEqual(await readState(path.join(root, closed.dir!, 'state.js')), closed);
    await assert.rejects(readFile(path.join(root, successor.dir!, '_orchestrator/RT-1/tool.mts')), /ENOENT/);
  });
});
