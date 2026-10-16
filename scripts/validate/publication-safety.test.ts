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
import { activeContract10State, CAPTURES, SOURCE_MANIFEST } from '../state/fixtures/verification.ts';
import type { RunState } from '../state/contract.ts';

async function project(body: (root: string, state: RunState) => Promise<void>): Promise<void> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'publication-safety-'));
  const root = path.join(projectRoot, '.maestro');
  const state = activeContract10State();
  try {
    for (const [relative, text] of Object.entries({ ...CAPTURES, 'manifest.md': SOURCE_MANIFEST })) {
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
