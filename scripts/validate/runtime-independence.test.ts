// Exercise the installed product outside the repository with no target toolchain.
// A copied or linked skill still copies its autonomous helper into the target run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, copyFile, mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CAPTURES, CONTROL_CAPTURES, SOURCE_MANIFEST, controlledState } from '../state/fixtures/verification.ts';
import { stopOwnedViewer } from '../../skills/maestro/tools/runtime/server.mts';

async function installedTarget(mode: 'copy' | 'link', packageType?: string) {
  const root = await mkdtemp(path.join(tmpdir(), 'maestro installed runtime '));
  const exported = path.join(root, 'export', 'maestro');
  await cp('skills/maestro', exported, { recursive: true });
  const target = path.join(root, 'target project');
  const discovery = path.join(target, '.agents', 'skills', 'maestro');
  await mkdir(path.dirname(discovery), { recursive: true });
  if (mode === 'link') await symlink(path.relative(path.dirname(discovery), exported), discovery);
  else await cp(exported, discovery, { recursive: true });
  const run = path.join(target, '.maestro');
  await mkdir(run);
  await copyFile(path.join(discovery, 'tools', 'sync.mts'), path.join(run, 'sync.mts'));
  await cp(path.join(discovery, 'tools', 'runtime'), path.join(run, 'runtime'), { recursive: true });
  await copyFile(path.join(discovery, 'assets', 'dashboard.html'), path.join(run, 'dashboard.html'));
  if (packageType) await writeFile(path.join(target, 'package.json'), JSON.stringify({ type: packageType }));
  const cwd = path.join(root, 'different cwd'); const bin = path.join(root, 'empty bin');
  await mkdir(cwd); await mkdir(bin);
  const state = controlledState();
  for (const [relative, body] of Object.entries({ ...CAPTURES, ...CONTROL_CAPTURES, 'manifest.md': SOURCE_MANIFEST })) {
    const file = path.join(run, state.slug, relative);
    await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, body);
  }
  const candidate = path.join(run, 'candidate.json'); await writeFile(candidate, JSON.stringify(state));
  const execute = (args: string[], flags: string[] = []) => spawnSync(process.execPath, [
    ...flags, path.join(run, 'sync.mts'), ...args,
  ], { cwd, encoding: 'utf8', env: { ...process.env, PATH: bin, NODE_OPTIONS: '', MAESTRO_SYNC_NO_OPEN: '1', LOG_LEVEL: 'ERROR' } });
  return { root, target, run, cwd, bin, state, candidate, execute,
    async dispose() { await stopOwnedViewer(run); await rm(root, { recursive: true, force: true }); } };
}

for (const mode of ['copy', 'link'] as const) {
  for (const packageType of [undefined, 'commonjs', 'module']) {
    test(`installed ${mode} runs offline without Python or a target toolchain in ${packageType ?? 'no manifest'} projects`, async () => {
      const target = await installedTarget(mode, packageType);
      try {
        // Removing the export after a copied installation catches accidental repository resolution.
        if (mode === 'copy') await rm(path.join(target.root, 'export'), { recursive: true });
        assert.deepEqual(await readdir(target.bin), []);
        await assert.rejects(() => readFile(path.join(target.target, 'node_modules', 'typescript', 'package.json')));
        const before = await readdir(target.run);
        const validated = target.execute(['--validate', target.candidate]);
        assert.equal(validated.status, 0, validated.stdout + validated.stderr);
        assert.deepEqual(JSON.parse(validated.stdout).projection.requirementResults, { R01: 'passed' });
        assert.deepEqual(await readdir(target.run), before);
        const published = target.execute(['--publish', target.candidate, '--no-open']);
        assert.equal(published.status, 0, published.stdout + published.stderr);
        const publication = JSON.parse(published.stdout) as { url: string; revision: string; path: string };
        assert.equal(publication.path, path.join(await realpath(target.run), 'state.js'));
        const record = JSON.parse(await readFile(path.join(target.run, 'serve.json'), 'utf8')) as { port: number; pid: number };
        const polled = await fetch(`http://127.0.0.1:${record.port}/state.js`);
        assert.equal(polled.status, 200);
        assert.ok((await polled.text()).includes(target.state.runId));
        target.state.updatedAt = '2026-09-30T12:00:00Z';
        await writeFile(target.candidate, JSON.stringify(target.state));
        const updated = target.execute(['--publish', target.candidate, '--expect', publication.revision, '--no-open']);
        assert.equal(updated.status, 0, updated.stdout + updated.stderr);
        assert.equal(JSON.parse(updated.stdout).url, publication.url);
        const projected = target.execute(['--project', path.join(target.run, 'state.js')]);
        assert.equal(projected.status, 0, projected.stdout + projected.stderr);
        assert.equal(JSON.parse(projected.stdout).verificationEstablished, true);
        await assert.rejects(() => readFile(path.join(target.run, 'opened.json')));
        await assert.rejects(() => readFile(path.join(target.run, 'sync.py')));
      } finally { await target.dispose(); }
    });
  }
}

test('a disabled native TypeScript capability fails before installed state publication', async () => {
  const target = await installedTarget('copy');
  try {
    const probe = path.join(target.cwd, 'capability.mts');
    await writeFile(probe, 'const capability: number = 1; if (capability !== 1) throw new Error("native TypeScript stripping required");');
    const failed = spawnSync(process.execPath, ['--no-experimental-strip-types', probe], { encoding: 'utf8' });
    assert.notEqual(failed.status, 0);
    const refused = target.execute(['--publish', target.candidate], ['--no-experimental-strip-types']);
    assert.notEqual(refused.status, 0);
    for (const file of ['state.js', 'serve.json', 'opened.json', 'validation.js']) {
      await assert.rejects(() => readFile(path.join(target.run, file)));
    }
    assert.match(await readFile('skills/maestro/phases/0-preflight.md', 'utf8'), /stop before state publication and name the prerequisite/);
  } finally { await target.dispose(); }
});

test('runtime replacement preserves run history and old viewer/opened records while removing only the obsolete helper', async () => {
  const target = await installedTarget('copy');
  try {
    const first = target.execute(['--publish', target.candidate, '--no-open']);
    assert.equal(first.status, 0, first.stdout + first.stderr);
    const before = await readFile(path.join(target.run, 'state.js'), 'utf8');
    const record = JSON.parse(await readFile(path.join(target.run, 'serve.json'), 'utf8')) as { pid: number; port: number };
    const url = JSON.parse(first.stdout).url as string;
    const legacyRecord = JSON.stringify({ pid: record.pid, port: record.port });
    await writeFile(path.join(target.run, 'serve.json'), legacyRecord);
    await writeFile(path.join(target.run, 'opened.json'), JSON.stringify({ url }));
    await writeFile(path.join(target.run, 'sync.py'), '# obsolete copied helper');
    await writeFile(path.join(target.run, 'user-owned.txt'), 'keep this file');
    await copyFile('skills/maestro/tools/sync.mts', path.join(target.run, 'sync.mts'));
    await cp('skills/maestro/tools/runtime', path.join(target.run, 'runtime'), { recursive: true });
    const checked = target.execute(['--validate', target.candidate]);
    assert.equal(checked.status, 0, checked.stdout + checked.stderr);
    assert.equal(await readFile(path.join(target.run, 'state.js'), 'utf8'), before);
    assert.equal(await readFile(path.join(target.run, 'serve.json'), 'utf8'), legacyRecord);
    await rm(path.join(target.run, 'sync.py'));
    const projected = target.execute(['--project', path.join(target.run, 'state.js')]);
    assert.equal(projected.status, 0, projected.stdout + projected.stderr);
    // Native adoption of metadata predating Node identity needs process discovery.
    const refreshed = spawnSync(process.execPath, [path.join(target.run, 'sync.mts'), '--no-open'], {
      cwd: target.cwd, encoding: 'utf8', env: { ...process.env, MAESTRO_SYNC_NO_OPEN: '1' },
    });
    assert.equal(refreshed.status, 0, refreshed.stdout + refreshed.stderr);
    const adopted = JSON.parse(await readFile(path.join(target.run, 'serve.json'), 'utf8')) as { pid: number; port: number };
    assert.deepEqual({ pid: adopted.pid, port: adopted.port }, { pid: record.pid, port: record.port });
    assert.equal(JSON.parse(await readFile(path.join(target.run, 'opened.json'), 'utf8')).url, url);
    assert.equal(await readFile(path.join(target.run, 'user-owned.txt'), 'utf8'), 'keep this file');
    assert.equal(await readFile(path.join(target.run, 'state.js'), 'utf8'), before);
    target.state.updatedAt = '2026-09-30T13:00:00Z';
    await writeFile(target.candidate, JSON.stringify(target.state));
    const updated = target.execute(['--publish', target.candidate, '--expect', JSON.parse(first.stdout).revision, '--no-open']);
    assert.equal(updated.status, 0, updated.stdout + updated.stderr);
    assert.equal(JSON.parse(updated.stdout).url, url);
  } finally { await target.dispose(); }
});

test('the installed memory write resolves the project from its own copy, not from cwd or PATH', async () => {
  const target = await installedTarget('copy');
  try {
    await writeFile(path.join(target.target, 'AGENTS.md'), '# Team\n', 'utf8');
    const written = spawnSync(process.execPath, [path.join(target.run, 'sync.mts'), '--memory-write', '--host', 'codex'], {
      cwd: target.cwd, encoding: 'utf8', input: 'A fact.\n',
      env: { ...process.env, PATH: target.bin, NODE_OPTIONS: '', MAESTRO_SYNC_NO_OPEN: '1', LOG_LEVEL: 'ERROR' },
    });
    assert.equal(written.status, 0, written.stdout + written.stderr);
    assert.equal(JSON.parse(written.stdout).path, path.join(await realpath(target.target), 'AGENTS.md'));
    assert.match(await readFile(path.join(target.target, 'AGENTS.md'), 'utf8'), /<!-- maestro:begin -->\nA fact\.\n<!-- maestro:end -->/);
    assert.deepEqual(await readdir(target.cwd), []);
  } finally { await target.dispose(); }
});
