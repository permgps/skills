// The run register, `.maestro/README.md`, written by publication.
//
// What it holds is a projection of published state, and the user owns the rest
// of the file. Each test below is one of the two halves: the row says what the
// state says, and nothing outside the markers moves.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  REGISTER_FILE, REGISTER_MARKERS, RegisterRowError, readRegisterRuns, renderRegisterRow, upsertRegister,
} from '../../skills/maestro/tools/runtime/register.mts';
import { activeContract7State, contract7State } from '../state/fixtures/verification.ts';

async function withRoot(body: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'maestro-register-'));
  try { await body(root); } finally { await rm(root, { recursive: true, force: true }); }
}

const rowsOf = (text: string): string[] => text.split('\n').filter(line => line.includes('<!-- run:'));

test('the first publish of a run creates the register with its row in progress', () => withRoot(async root => {
  const result = await upsertRegister(root, activeContract7State());
  assert.equal(result.action, 'created');
  const text = await readFile(path.join(root, REGISTER_FILE), 'utf8');
  assert.match(text, /^# Maestro Runs\n/);
  assert.match(text, /Runs from before contract 7/);
  assert.deepEqual(rowsOf(text), [
    '| 2026-09-29 | [2026-09-29-synthetic-menu--wip](2026-09-29-synthetic-menu--wip/) | in progress | — <!-- run:run-synthetic-1 --> |',
  ]);
}));

test('a relocated run rewrites its own row instead of adding a second', () => withRoot(async root => {
  await upsertRegister(root, activeContract7State());
  const result = await upsertRegister(root, contract7State());
  assert.equal(result.action, 'replaced');
  assert.deepEqual(rowsOf(await readFile(path.join(root, REGISTER_FILE), 'utf8')), [
    '| 2026-09-29 | [2026-09-29-synthetic-menu](2026-09-29-synthetic-menu/) | completed | 2026-09-29 <!-- run:run-synthetic-1 --> |',
  ]);
}));

test('a stopped run reads as stopped, not as delivered', () => {
  const state = contract7State();
  state.outcome = 'stopped_incomplete';
  state.stopReason = 'Repair budget exhausted';
  assert.match(renderRegisterRow(state), /\| stopped incomplete \|/);
  state.outcome = 'closed_with_exceptions';
  assert.match(renderRegisterRow(state), /\| closed with exceptions \|/);
});

test('a second run is appended after the first, and the first keeps its place', () => withRoot(async root => {
  await upsertRegister(root, contract7State());
  const second = { ...activeContract7State(), runId: 'run-synthetic-2', slug: 'second-menu',
    dir: '2026-09-29-second-menu--wip' };
  assert.equal((await upsertRegister(root, second)).action, 'appended');
  await upsertRegister(root, contract7State());
  assert.deepEqual(rowsOf(await readFile(path.join(root, REGISTER_FILE), 'utf8')).map(row => /run:([^ ]+)/.exec(row)?.[1]),
    ['run-synthetic-1', 'run-synthetic-2']);
}));

test('the register keeps the user\'s text outside its markers byte for byte', () => withRoot(async root => {
  const before = '# My notes\n\nKeep this paragraph exactly.  \n\n';
  const after = '\n## Later\n\n- a list the user wrote\n';
  await writeFile(path.join(root, REGISTER_FILE),
    `${before}${REGISTER_MARKERS.begin}\nstale table\n${REGISTER_MARKERS.end}${after}`);
  await upsertRegister(root, activeContract7State());
  const text = await readFile(path.join(root, REGISTER_FILE), 'utf8');
  assert.ok(text.startsWith(`${before}${REGISTER_MARKERS.begin}\n| Started |`));
  assert.ok(text.endsWith(`${REGISTER_MARKERS.end}${after}`));
  assert.ok(!text.includes('stale table'));
}));

test('a state that cannot key or locate a row is refused, not written half-way', () => {
  assert.throws(() => renderRegisterRow({ ...contract7State(), runId: 'run--x' }), RegisterRowError);
  const { dir: _dir, ...legacy } = contract7State();
  assert.throws(() => renderRegisterRow({ ...legacy, contractVersion: 6 }), RegisterRowError);
});

test('the register reads back the rows publication wrote, in order', () => withRoot(async root => {
  await upsertRegister(root, contract7State());
  await upsertRegister(root, { ...activeContract7State(), runId: 'run-synthetic-2', slug: 'second-menu',
    dir: '2026-09-29-second-menu--wip' });
  const runs = await readRegisterRuns(root);
  assert.deepEqual(runs.map(({ line: _line, ...run }) => run), [
    { runId: 'run-synthetic-1', dir: '2026-09-29-synthetic-menu', started: '2026-09-29', status: 'completed', finished: '2026-09-29' },
    { runId: 'run-synthetic-2', dir: '2026-09-29-second-menu--wip', started: '2026-09-29', status: 'in progress', finished: '—' },
  ]);
  const text = (await readFile(path.join(root, REGISTER_FILE), 'utf8')).split('\n');
  for (const run of runs) assert.match(text[run.line - 1]!, new RegExp(`run:${run.runId}`));
}));

test('a project with no register yet has no earlier runs, not an error', () => withRoot(async root => {
  assert.deepEqual(await readRegisterRuns(root), []);
}));

test('a hand-edited row that no longer parses is skipped and the others are still read', () => withRoot(async root => {
  await upsertRegister(root, contract7State());
  const target = path.join(root, REGISTER_FILE);
  const text = await readFile(target, 'utf8');
  await writeFile(target, text.replace(REGISTER_MARKERS.end, '| broken row <!-- run:run-x --> |\n' + REGISTER_MARKERS.end), 'utf8');
  assert.deepEqual((await readRegisterRuns(root)).map(run => run.runId), ['run-synthetic-1']);
}));
