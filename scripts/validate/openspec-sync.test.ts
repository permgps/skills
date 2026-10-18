// The closing publish exports a run's verified requirements as an OpenSpec change.
//
// Driven through the copied `sync.mts` inside a real temporary project, the way
// progress-sync.test.ts drives it, because what is under test is what a прогон
// leaves behind: `openspec/changes/maestro-<dir>/`, the publish result's
// `openspec` object and the `PROGRESS.md` items beside it. Each test is one row
// of the combination table in the plan "OpenSpec Requirements Are Read, And A
// Closed Run Exports What It Verified". The OpenSpec command line is either
// absent from PATH or a small executable written here; no OpenSpec file is
// copied (D1).

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { chmod, copyFile, cp, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { CAPTURES, SOURCE_MANIFEST, activeContract6State, asContract10, contract6State, deferredScopeState } from '../state/fixtures/verification.ts';
import type { RunState } from '../state/contract.ts';
import { PROGRESS_FILE, parseProgress } from '../memory/progress.ts';
import { readOpenSpecIndex } from '../openspec/openspec.ts';
import { stopOwnedViewer } from '../../skills/maestro/tools/runtime/server.mts';

const SYNC = 'skills/maestro/tools/sync.mts';
const PAGE = 'skills/maestro/assets/dashboard.html';
const WIP = '2026-09-29-synthetic-menu--wip';
const LANDED = '2026-09-29-synthetic-menu';
const CHANGE = `maestro-${LANDED}`;
/** PATH without any OpenSpec command line: node and the system tools only. */
const BARE_PATH = [path.dirname(process.execPath), '/usr/bin', '/bin'].join(path.delimiter);

const MAIN_SPEC = [
  '# Menu', '', '## Purpose', 'What the menu shows and how many entries it keeps between visits.', '',
  '## Requirements',
  '### Requirement: Recent entries', 'The menu SHALL keep the five most recent entries.', '',
  '#### Scenario: Sixth entry', '- **WHEN** a sixth entry is added', '- **THEN** the oldest is dropped', '',
].join('\n');

const ADDED = [
  '## ADDED Requirements', '### Requirement: Hover opens the menu', 'The menu SHALL open on hover.', '',
  '#### Scenario: Pointer over the trigger', '- **WHEN** the pointer rests on the trigger', '- **THEN** the menu opens', '',
].join('\n');

const MODIFIED = [
  '## MODIFIED Requirements', '### Requirement: Recent entries', 'The menu SHALL keep at most three recent entries.', '',
  '#### Scenario: Sixth entry', '- **WHEN** a fourth entry is added', '- **THEN** the oldest is dropped', '',
].join('\n');

const PROPOSAL = '## Why\nThe run built and verified a hover menu that keeps three entries, so the specification says so.\n\n## What Changes\n- ADDED Hover opens the menu\n';

function metadata(map: Record<string, string[]>): string {
  return `schema: spec-driven\ncreated: 2026-09-29\nx-maestro-run: ${LANDED}\nx-maestro-requirements: ${JSON.stringify(map)}\n`;
}

const DRAFT: Record<string, string> = {
  'proposal.md': PROPOSAL,
  'tasks.md': '## 1. Menu\n- [x] 1.1 Open on hover\n',
  '.openspec.yaml': metadata({ 'menu › Hover opens the menu': ['R01'] }),
  'specs/menu/spec.md': ADDED,
};

type Outcome = Record<string, unknown> & { code: number; stderr: string };
interface ExportResult { status: string; change: string; validation?: string; problems?: string[]; unresolved?: unknown[] }

interface Project {
  root: string;
  maestro: string;
  publish(state: RunState, expect?: string, pathValue?: string): Outcome;
  draft(files: Record<string, string>): Promise<void>;
  dispose(): Promise<void>;
}

async function project(options: { openspec: boolean } = { openspec: true }): Promise<Project> {
  const root = await mkdtemp(path.join(tmpdir(), 'maestro-openspec-sync-'));
  const maestro = path.join(root, '.maestro');
  await mkdir(maestro);
  await copyFile(SYNC, path.join(maestro, 'sync.mts'));
  await cp('skills/maestro/tools/runtime', path.join(maestro, 'runtime'), { recursive: true });
  await copyFile(PAGE, path.join(maestro, 'dashboard.html'));
  for (const [relative, body] of Object.entries({ ...CAPTURES, 'manifest.md': SOURCE_MANIFEST })) {
    await mkdir(path.dirname(path.join(maestro, WIP, relative)), { recursive: true });
    await writeFile(path.join(maestro, WIP, relative), body);
  }
  if (options.openspec) {
    await mkdir(path.join(root, 'openspec/specs/menu'), { recursive: true });
    await writeFile(path.join(root, 'openspec/config.yaml'), 'schema: spec-driven\n');
    await writeFile(path.join(root, 'openspec/specs/menu/spec.md'), MAIN_SPEC);
  }
  return {
    root, maestro,
    publish(state, expect, pathValue = BARE_PATH) {
      const candidate = path.join(root, 'candidate.json');
      writeFileSync(candidate, JSON.stringify(state));
      const args = [path.join(maestro, 'sync.mts'), '--publish', candidate, '--no-open', ...(expect ? ['--expect', expect] : [])];
      const done = spawnSync(process.execPath, args, { encoding: 'utf8', env: { ...process.env, PATH: pathValue, MAESTRO_SYNC_NO_OPEN: '1' } });
      return { ...JSON.parse(done.stdout.split('\n')[0] || '{}') as Record<string, unknown>, code: done.status ?? -1, stderr: done.stderr };
    },
    async draft(files) {
      const dir = path.join(maestro, WIP, 'openspec');
      await rm(dir, { recursive: true, force: true });
      for (const [relative, body] of Object.entries(files)) {
        await mkdir(path.dirname(path.join(dir, relative)), { recursive: true });
        await writeFile(path.join(dir, relative), body);
      }
    },
    async dispose() {
      await stopOwnedViewer(maestro);
      await rm(root, { recursive: true, force: true });
    },
  };
}

const building = (): RunState => asContract10(activeContract6State(deferredScopeState()));
const closing = (extra: Partial<RunState> = {}): RunState =>
  ({ ...asContract10(contract6State(deferredScopeState())), updatedAt: '2026-09-29T09:30:00Z', ...extra });

/** Open the run, then close it; the draft sits in the --wip directory and moves with it. */
function closeRun(target: Project, extra: Partial<RunState> = {}, pathValue?: string): Outcome {
  const opened = target.publish(building());
  assert.equal(opened.code, 0, JSON.stringify(opened));
  return target.publish(closing(extra), building().updatedAt, pathValue);
}

const progressOf = async (target: Project) => parseProgress(await readFile(path.join(target.maestro, PROGRESS_FILE), 'utf8'));
/** Every export item of the run, in any section. */
const openSpecKeys = (progress: Awaited<ReturnType<typeof progressOf>>): string[] =>
  [...progress.notDone, ...progress.knownBugs].map(item => item.key ?? '').filter(key => key.startsWith(`${LANDED}#openspec`));
const changeDir = (target: Project): string => path.join(target.root, 'openspec/changes', CHANGE);
const exists = async (file: string): Promise<boolean> => { try { await stat(file); return true; } catch { return false; } };

async function fakeOpenSpec(code: number, output: string): Promise<{ pathValue: string; dispose(): Promise<void> }> {
  const bin = await mkdtemp(path.join(tmpdir(), 'maestro-openspec-bin-'));
  const script = path.join(bin, 'openspec');
  await writeFile(script, `#!/bin/sh\necho "$@" > "${bin}/args"\necho "$DO_NOT_TRACK $OPENSPEC_TELEMETRY $OPENSPEC_NO_UPDATE_CHECK" > "${bin}/env"\necho '${output}'\nexit ${code}\n`);
  await chmod(script, 0o755);
  return { pathValue: [bin, BARE_PATH].join(path.delimiter), dispose: () => rm(bin, { recursive: true, force: true }) };
}

test('row 1: a project without OpenSpec closes as before, with no openspec key', async () => {
  const target = await project({ openspec: false });
  try {
    const closed = closeRun(target);
    assert.equal(closed.code, 0, JSON.stringify(closed));
    assert.equal('openspec' in closed, false);
    assert.equal(await exists(path.join(target.root, 'openspec')), false);
    assert.equal(closed['progress'], 'written');
    assert.deepEqual(openSpecKeys(await progressOf(target)), []);
  } finally { await target.dispose(); }
});

test('a closure without a draft, as the previous release closed, writes PROGRESS as before, and an identical retry keeps it', async () => {
  const target = await project();
  try {
    const closed = closeRun(target);
    assert.equal(closed.code, 0, JSON.stringify(closed));
    assert.equal('openspec' in closed, false);
    assert.equal(closed['progress'], 'written');
    assert.deepEqual((await progressOf(target)).notDone.map(item => item.key), [`${LANDED}#R19`, `${LANDED}#R20`]);
    const before = await readFile(path.join(target.maestro, PROGRESS_FILE), 'utf8');
    const again = target.publish(closing(), closing().updatedAt);
    assert.equal(again['progress'], 'kept', 'a PROGRESS.md with no export items is what the previous release wrote, and it stays');
    assert.equal(await readFile(path.join(target.maestro, PROGRESS_FILE), 'utf8'), before);
  } finally { await target.dispose(); }
});

test('row 2: a stopped_incomplete closure exports nothing even with a draft', async () => {
  const target = await project();
  try {
    await target.draft(DRAFT);
    const closed = closeRun(target, { outcome: 'stopped_incomplete', stopReason: 'the user stopped the run' });
    assert.equal(closed.code, 0, JSON.stringify(closed));
    assert.equal('openspec' in closed, false);
    assert.equal(await exists(changeDir(target)), false);
    assert.deepEqual(openSpecKeys(await progressOf(target)), []);
  } finally { await target.dispose(); }
});

test('row 3: a clean draft is written, validation is unavailable without the CLI, and PROGRESS lists the archive step', async () => {
  const target = await project();
  try {
    await target.draft(DRAFT);
    const closed = closeRun(target);
    assert.equal(closed.code, 0, JSON.stringify(closed));
    assert.deepEqual(closed['openspec'], { status: 'written', change: CHANGE, validation: 'unavailable' });
    assert.equal(await readFile(path.join(changeDir(target), 'specs/menu/spec.md'), 'utf8'), ADDED);
    assert.equal(await readFile(path.join(target.root, 'openspec/specs/menu/spec.md'), 'utf8'), MAIN_SPEC);
    const item = (await progressOf(target)).notDone.find(entry => entry.key === `${LANDED}#openspec`);
    assert.match(item?.text ?? '', /awaits `openspec archive maestro-2026-09-29-synthetic-menu` — not validated/);
    assert.match(closed.stderr, /INFO \[openspec\.export\] change exported/);
  } finally { await target.dispose(); }
});

test('row 4: MODIFIED is written when answers.md records the user choosing replace', async () => {
  const target = await project();
  try {
    await writeFile(path.join(target.maestro, WIP, 'answers.md'), [
      '### R01 — сколько пунктов', 'Asked: В OpenSpec — пять пунктов, в брифе — три. Что верно?', 'Options:',
      '1. Оставить пять (recommended — одобренное поведение)', '2. Три — поменять одобренное поведение',
      'Answer: 2', 'Chosen: Три — поменять одобренное поведение', 'OpenSpec: menu › Recent entries — replace', '',
    ].join('\n'));
    await target.draft({ ...DRAFT, 'specs/menu/spec.md': MODIFIED, '.openspec.yaml': metadata({ 'menu › Recent entries': ['R01'] }) });
    const closed = closeRun(target);
    assert.equal((closed['openspec'] as ExportResult).status, 'written', JSON.stringify(closed['openspec']));
    assert.equal(await readFile(path.join(changeDir(target), 'specs/menu/spec.md'), 'utf8'), MODIFIED);
    assert.deepEqual(openSpecKeys(await progressOf(target)), [`${LANDED}#openspec`]);
  } finally { await target.dispose(); }
});

test('row 5: a self-briefed conflict leaves the requirement out and adds a Not Done item', async () => {
  const target = await project();
  try {
    await writeFile(path.join(target.maestro, WIP, 'answers.md'), [
      '### R02 — сколько пунктов', 'Asked: В OpenSpec — пять пунктов, в брифе — три. Что верно?', 'Options:',
      '1. Оставить пять (recommended — одобренное поведение)', '2. Три', 'Answer: self-briefed',
      'Chosen: Оставить пять', 'OpenSpec: menu › Recent entries — keep', '',
    ].join('\n'));
    await target.draft(DRAFT);
    const closed = closeRun(target);
    assert.equal((closed['openspec'] as ExportResult).status, 'written');
    const item = (await progressOf(target)).notDone.find(entry => entry.key === `${LANDED}#openspec-R02`);
    assert.match(item?.text ?? '', /R02 contradicts the approved OpenSpec requirement menu › Recent entries; the run kept the requirement without asking/);
  } finally { await target.dispose(); }
});

test('row 6: a draft that maps a deferred requirement is refused, nothing is written, and Known Bugs says why', async () => {
  const target = await project();
  try {
    await target.draft({ ...DRAFT, '.openspec.yaml': metadata({ 'menu › Hover opens the menu': ['R19'] }) });
    const closed = closeRun(target);
    assert.equal(closed.code, 0, 'a refused export never fails the publish');
    const result = closed['openspec'] as ExportResult;
    assert.equal(result.status, 'refused');
    assert.match(result.problems![0]!, /maps R19, which is dropped, deferred or a placeholder/);
    assert.equal(await exists(changeDir(target)), false);
    assert.match((await progressOf(target)).knownBugs.find(entry => entry.key === `${LANDED}#openspec`)?.text ?? '', /OpenSpec export refused/);
    assert.match(closed.stderr, /WARN \[openspec\.export\] \[FIX\] draft refused .*"problems":1/);
    assert.doesNotMatch(closed.stderr, /maps R19/, 'a problem can quote the draft, so it is counted, never logged');
  } finally { await target.dispose(); }
});

test('rows 7 and 8: an identical retry is kept with PROGRESS kept, and a changed draft is rewritten', async () => {
  const target = await project();
  try {
    await target.draft(DRAFT);
    assert.equal((closeRun(target)['openspec'] as ExportResult).status, 'written');
    const again = target.publish(closing(), closing().updatedAt);
    assert.equal(again.code, 0, JSON.stringify(again));
    assert.equal((again['openspec'] as ExportResult).status, 'kept');
    assert.equal(again['progress'], 'kept');
    const runDir = path.join(target.maestro, LANDED, 'openspec');
    await writeFile(path.join(runDir, 'design.md'), '# Design\nHover opens after 150 ms.\n');
    const rewritten = target.publish(closing(), closing().updatedAt);
    assert.equal((rewritten['openspec'] as ExportResult).status, 'written');
    assert.equal(await readFile(path.join(changeDir(target), 'design.md'), 'utf8'), '# Design\nHover opens after 150 ms.\n');
    assert.equal(rewritten['progress'], 'kept', 'the rewritten change leaves the same PROGRESS items');
    assert.deepEqual(openSpecKeys(await progressOf(target)), [`${LANDED}#openspec`]);
  } finally { await target.dispose(); }
});

test('a repeated closure whose export outcome changed rewrites PROGRESS and keeps the original commit', async () => {
  const target = await project();
  try {
    await target.draft({ ...DRAFT, '.openspec.yaml': metadata({ 'menu › Hover opens the menu': ['R19'] }) });
    assert.equal((closeRun(target)['openspec'] as ExportResult).status, 'refused');
    const before = await progressOf(target);
    await writeFile(path.join(target.maestro, LANDED, 'openspec', '.openspec.yaml'), metadata({ 'menu › Hover opens the menu': ['R01'] }));
    const fixed = target.publish(closing(), closing().updatedAt);
    assert.equal((fixed['openspec'] as ExportResult).status, 'written');
    assert.equal(fixed['progress'], 'written');
    const after = await progressOf(target);
    assert.deepEqual(after.header, before.header);
    assert.equal(after.knownBugs.some(entry => entry.key === `${LANDED}#openspec`), false);
    assert.equal(after.notDone.some(entry => entry.key === `${LANDED}#openspec`), true);
  } finally { await target.dispose(); }
});

test('row 9: a folder of the same name that another owner wrote is refused and left untouched', async () => {
  const target = await project();
  try {
    await mkdir(changeDir(target), { recursive: true });
    await writeFile(path.join(changeDir(target), 'proposal.md'), 'theirs\n');
    await target.draft(DRAFT);
    const result = closeRun(target)['openspec'] as ExportResult;
    assert.equal(result.status, 'refused');
    assert.equal(await readFile(path.join(changeDir(target), 'proposal.md'), 'utf8'), 'theirs\n');
    const progress = await progressOf(target);
    assert.match(progress.knownBugs.find(entry => entry.key === `${LANDED}#openspec`)?.text ?? '', /OpenSpec export refused: .*x-maestro-run is missing/);
    assert.equal(progress.notDone.some(entry => entry.key === `${LANDED}#openspec`), false);
  } finally { await target.dispose(); }
});

test('row 10: a change the user archived is reported archived, and PROGRESS has no archive item', async () => {
  const target = await project();
  try {
    await mkdir(path.join(target.root, 'openspec/changes/archive', `2026-09-30-${CHANGE}`), { recursive: true });
    await target.draft(DRAFT);
    const closed = closeRun(target);
    assert.deepEqual(closed['openspec'], { status: 'archived', change: CHANGE });
    assert.equal((await progressOf(target)).notDone.some(entry => entry.key?.startsWith(`${LANDED}#openspec`)), false);
  } finally { await target.dispose(); }
});

test('row 11: the OpenSpec CLI is called with the strict flags; exit 1 is a failed validation and the publish still stands', async () => {
  const target = await project();
  const cli = await fakeOpenSpec(1, 'ERROR maestro change: Why too short');
  try {
    await target.draft(DRAFT);
    const closed = closeRun(target, {}, cli.pathValue);
    assert.equal(closed['status'], 'published');
    const result = closed['openspec'] as ExportResult;
    assert.deepEqual([result.status, result.validation, result.problems], ['written', 'failed', ['ERROR maestro change: Why too short']]);
    const bin = path.dirname(cli.pathValue.split(path.delimiter)[0]! + '/x');
    assert.equal((await readFile(path.join(bin, 'args'), 'utf8')).trim(), `validate ${CHANGE} --type change --strict --json --no-interactive`);
    assert.equal((await readFile(path.join(bin, 'env'), 'utf8')).trim(), '1 0 1', 'the CLI runs with its telemetry and update check off');
    assert.match((await progressOf(target)).knownBugs.find(entry => entry.key === `${LANDED}#openspec-validation`)?.text ?? '', /openspec validate rejected/);
  } finally { await target.dispose(); await cli.dispose(); }
});

test('the CLI exiting 0 is a passed validation', async () => {
  const target = await project();
  const cli = await fakeOpenSpec(0, '{"valid":true}');
  try {
    await target.draft(DRAFT);
    assert.equal((closeRun(target, {}, cli.pathValue)['openspec'] as ExportResult).validation, 'passed');
  } finally { await target.dispose(); await cli.dispose(); }
});

test('row 12: a publish that does not close the run carries no openspec key and writes nothing', async () => {
  const target = await project();
  try {
    await target.draft(DRAFT);
    const opened = target.publish(building());
    assert.equal(opened.code, 0, JSON.stringify(opened));
    assert.equal('openspec' in opened, false);
    assert.equal(await exists(path.join(target.root, 'openspec/changes')), false);
  } finally { await target.dispose(); }
});

const WIP_B = '2026-09-29-synthetic-menu-two--wip';
const LANDED_B = '2026-09-29-synthetic-menu-two';

/** Open and close a second run in the same project, under its own directory. */
async function secondRun(target: Project): Promise<Outcome> {
  for (const [relative, body] of Object.entries({ ...CAPTURES, 'manifest.md': SOURCE_MANIFEST })) {
    await mkdir(path.dirname(path.join(target.maestro, WIP_B, relative)), { recursive: true });
    await writeFile(path.join(target.maestro, WIP_B, relative), body);
  }
  const opened = target.publish({ ...building(), runId: 'run-synthetic-2', slug: 'synthetic-menu-two', dir: WIP_B, updatedAt: '2026-09-29T10:00:00Z' } as RunState, closing().updatedAt);
  assert.equal(opened.code, 0, JSON.stringify(opened));
  return target.publish({ ...closing(), runId: 'run-synthetic-2', slug: 'synthetic-menu-two', dir: LANDED_B, updatedAt: '2026-09-29T10:30:00Z', finishedAt: '2026-09-29T10:30:00Z' } as RunState, '2026-09-29T10:00:00Z');
}

test('a second run in the same project indexes the first run\'s unarchived change as current, and carries its archive item', async () => {
  const target = await project();
  try {
    await target.draft(DRAFT);
    closeRun(target);
    const index = await readOpenSpecIndex(target.root);
    assert.deepEqual(index.changes, [{ name: CHANGE, maestroRun: LANDED }]);
    assert.deepEqual(index.archived, []);
    const closed = await secondRun(target);
    assert.equal(closed.code, 0, JSON.stringify(closed));
    assert.equal('openspec' in closed, false, 'the second run wrote no draft');
    assert.match((await progressOf(target)).notDone.find(entry => entry.key === `${LANDED}#openspec`)?.text ?? '', /awaits `openspec archive/);
  } finally { await target.dispose(); }
});

test('once the user archived the first run\'s change, the second run\'s closure settles its item instead of carrying it', async () => {
  const target = await project();
  try {
    await target.draft(DRAFT);
    closeRun(target);
    await mkdir(path.join(target.root, 'openspec/changes/archive'), { recursive: true });
    await rename(changeDir(target), path.join(target.root, 'openspec/changes/archive', `2026-09-30-${CHANGE}`));
    assert.deepEqual((await readOpenSpecIndex(target.root)).archived, [{ folder: `2026-09-30-${CHANGE}`, change: CHANGE }]);
    const closed = await secondRun(target);
    assert.equal(closed.code, 0, JSON.stringify(closed));
    const progress = await progressOf(target);
    assert.equal(progress.notDone.some(entry => entry.key === `${LANDED}#openspec`), false);
    assert.match(progress.settled.find(entry => entry.key === `${LANDED}#openspec`)?.text ?? '', /was archived by the user/);
    assert.match(closed.stderr, /earlier exports archived by the user/);
  } finally { await target.dispose(); }
});

test('an export that cannot be written fails into Known Bugs, and an identical retry after the cause is gone writes it', async () => {
  const target = await project();
  try {
    await target.draft(DRAFT);
    await writeFile(path.join(target.root, 'openspec/changes'), 'not a directory\n');
    const closed = closeRun(target);
    assert.equal(closed['status'], 'published', 'a failed export never fails the publish');
    assert.equal((closed['openspec'] as ExportResult).status, 'failed');
    assert.match((await progressOf(target)).knownBugs.find(entry => entry.key === `${LANDED}#openspec`)?.text ?? '', /OpenSpec export failed/);
    await rm(path.join(target.root, 'openspec/changes'));
    const again = target.publish(closing(), closing().updatedAt);
    assert.equal((again['openspec'] as ExportResult).status, 'written');
    assert.deepEqual(openSpecKeys(await progressOf(target)), [`${LANDED}#openspec`]);
  } finally { await target.dispose(); }
});

test('a self-briefed fork still reaches Not Done when the closure wrote no draft', async () => {
  const target = await project();
  try {
    await writeFile(path.join(target.maestro, WIP, 'answers.md'), [
      '### R02 — сколько пунктов', 'Asked: В OpenSpec — пять пунктов, в брифе — три. Что верно?', 'Options:',
      '1. Оставить пять (recommended — одобренное поведение)', '2. Три', 'Answer: self-briefed',
      'Chosen: Оставить пять', 'OpenSpec: menu › Recent entries — keep', '',
    ].join('\n'));
    const closed = closeRun(target);
    assert.equal('openspec' in closed, false);
    assert.match((await progressOf(target)).notDone.find(entry => entry.key === `${LANDED}#openspec-R02`)?.text ?? '', /R02 contradicts the approved OpenSpec requirement menu › Recent entries/);
  } finally { await target.dispose(); }
});
