import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { evaluateLogic, scriptBlock } from '../validate/dashboard-integrity.ts';
import { RECORDED_STAGES, type RecordedRun } from './fixtures/recorded-stages.ts';
import { main, quartiles, shareOf, stageShares } from './shares.ts';

const at = (minute: number): string =>
  `2026-08-19T${String(10 + Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}:00Z`;

/** A run whose build takes 100 minutes, then review and acceptance the given minutes. */
const run = (runId: string, review: number, acceptance: number): RecordedRun => ({
  runId,
  contractVersion: 2,
  stages: [
    { id: 'build', startedAt: at(0), finishedAt: at(100) },
    { id: 'review', startedAt: at(100), finishedAt: at(100 + review) },
    { id: 'acceptance', startedAt: at(100 + review), finishedAt: at(100 + review + acceptance) },
  ],
});

test('a share is the stage span divided by the build span', () => {
  assert.deepEqual(shareOf(run('a', 50, 20).stages), { review: 0.5, acceptance: 0.2 });
});

test('a stage without a span has no share, never a zero one', () => {
  const stages = run('a', 50, 20).stages.filter(stage => stage.id !== 'review');
  assert.deepEqual(shareOf(stages), { review: null, acceptance: 0.2 });
});

test('a zero-width acceptance is a share of zero, because it was stamped', () => {
  assert.deepEqual(shareOf(run('a', 30, 0).stages), { review: 0.3, acceptance: 0 });
});

test('a run without a build span gives no share at all', () => {
  const stages = run('a', 30, 10).stages.map(stage => stage.id === 'build' ? { id: stage.id } : stage);
  assert.deepEqual(shareOf(stages), { review: null, acceptance: null });
  const instant = run('a', 30, 10).stages.map(stage =>
    stage.id === 'build' ? { ...stage, finishedAt: at(0) } : stage);
  assert.deepEqual(shareOf(instant), { review: null, acceptance: null });
});

test('the bounds are the lower and upper quartile by index, not a mean and a spread', () => {
  assert.deepEqual(quartiles([0.4, 0.1, 0.3, 0.2]), { low: 0.2, high: 0.3 });
  assert.deepEqual(quartiles([0.074, 0.091, 0.414, 0.995, 1.114, 2.661]), { low: 0.09, high: 1.11 });
  assert.equal(quartiles([]), null);
});

test('a run that cannot give a ratio is excluded and counted, never averaged in as zero', () => {
  const broken: RecordedRun = { runId: 'broken', contractVersion: 1, stages: [{ id: 'review', startedAt: at(0), finishedAt: at(9) }] };
  const shares = stageShares([run('a', 10, 10), run('b', 20, 30), run('c', 30, 50), run('d', 40, 70), broken]);
  assert.equal(shares.runs, 4);
  assert.equal(shares.excluded, 1);
  assert.deepEqual(shares.review, { low: 0.2, high: 0.3 });
  assert.deepEqual(shares.acceptance, { low: 0.3, high: 0.5 });
});

test('the six recorded прогоны give the shares the specification states', () => {
  const shares = stageShares(RECORDED_STAGES);
  assert.equal(shares.runs, 6);
  assert.equal(shares.excluded, 0);
  assert.deepEqual(shares.review, { low: 0.09, high: 1.11 });
  assert.deepEqual(shares.acceptance, { low: 0.09, high: 0.39 });
});

test('the command prints one row per recorded прогон and the bounds, and exits clean', async () => {
  const written: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array): boolean => { written.push(String(chunk)); return true; }) as typeof process.stdout.write;
  let code: number;
  try { code = await main(); } finally { process.stdout.write = original; }
  const text = written.join('');
  assert.equal(code, 0);
  for (const recorded of RECORDED_STAGES) assert.match(text, new RegExp(recorded.runId));
  assert.match(text, /review\s+low 0\.09\s+high 1\.11/);
  assert.match(text, /acceptance\s+low 0\.09\s+high 0\.39/);
});

test('fewer than two usable прогоны are not a measurement, and the command says so', async () => {
  const written: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array): boolean => { written.push(String(chunk)); return true; }) as typeof process.stdout.write;
  let code: number;
  try { code = await main([run('alone', 10, 10)]); } finally { process.stdout.write = original; }
  assert.equal(code, 1);
  assert.match(written.join(''), /fewer than two/);
});

test('the page carries exactly the shares the recorded прогоны give', async () => {
  const html = await readFile('skills/maestro/assets/dashboard.html', 'utf8');
  const block = scriptBlock(html, 'logic');
  assert.ok(block, 'the asset must carry a <script id="logic"> block');
  const page = JSON.parse(JSON.stringify((evaluateLogic(block) as { STAGE_SHARE: unknown }).STAGE_SHARE));
  const { review, acceptance } = stageShares(RECORDED_STAGES);
  assert.deepEqual(page, { review, acceptance },
    'run node scripts/metrics/shares.ts and copy its bounds into STAGE_SHARE and docs/spec/dashboard.md');
});
