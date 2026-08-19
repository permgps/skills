// The dashboard's pure logic, exercised against the real asset.
//
// There is no browser in this toolchain and adding one would break the
// zero-runtime-dependency rule, so the page keeps its DOM-free logic in one
// block and this file evaluates exactly that block in a vm context. Anything
// needing a document belongs to the structural pass in dashboard-integrity.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { evaluateLogic, scriptBlock } from './dashboard-integrity.ts';

const ASSET = 'skills/maestro/assets/dashboard.html';

interface Logic {
  KNOWN_CONTRACT_VERSION: number;
  STAGE_ORDER: string[];
  STAGE_LABEL: Record<string, string>;
  TASK_STATUS: Record<string, string>;
  REQUIREMENT_ORDER: string[];
  GATE_AFTER: Record<string, string>;
  label: (map: Record<string, string>, value: unknown) => string;
  formatDuration: (ms: unknown) => string;
  formatMoment: (iso: string) => string;
  referenceTime: (state: unknown, now: number) => number;
  elapsed: (from: string, state: unknown, now: number, until?: string) => number | null;
  currentStage: (state: unknown) => { id: string; status: string } | null;
  orderedStages: (state: unknown) => Array<{ id: string; status: string }>;
  countRequirements: (list: unknown) => Record<string, number>;
  contractNotice: (version: unknown) => string | null;
  runNotice: (state: unknown) => string | null;
  isStopped: (state: unknown) => boolean;
  isStateShape: (value: unknown) => boolean;
  readOutcome: (held: unknown, incoming: unknown) => string;
  gateFor: (state: unknown, stageId: string) => { id: string; findings: string[] } | null;
}

const html = await readFile(ASSET, 'utf8');
const block = scriptBlock(html, 'logic');
assert.ok(block, 'the asset must carry a <script id="logic"> block');
const L = evaluateLogic(block) as unknown as Logic;

const AT = (iso: string): number => Date.parse(iso);
const STARTED = '2026-08-19T10:00:00.000Z';

const run = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  contractVersion: 1,
  runId: 'r1',
  slug: 'landing-page',
  startedAt: STARTED,
  mode: 'semi',
  depth: 'normal',
  polish: false,
  currentStage: 'plan',
  stages: [
    { id: 'preflight', status: 'done', startedAt: STARTED },
    { id: 'plan', status: 'active', startedAt: '2026-08-19T10:30:00.000Z' },
  ],
  tasks: [],
  requirements: [],
  gates: [],
  ...extra,
});

test('a duration reads as a clock at zero, in minutes and across an hour', () => {
  assert.equal(L.formatDuration(0), '0:00');
  assert.equal(L.formatDuration(9_000), '0:09');
  assert.equal(L.formatDuration(65_000), '1:05');
  assert.equal(L.formatDuration(3_599_000), '59:59');
  assert.equal(L.formatDuration(3_600_000), '1:00:00');
  assert.equal(L.formatDuration(3_725_000), '1:02:05');
});

test('a duration that cannot be measured is a dash, never a zero', () => {
  // Zero reads as "just started", which is a different fact from "unknown".
  assert.equal(L.formatDuration(-1), '—');
  assert.equal(L.formatDuration(NaN), '—');
  assert.equal(L.formatDuration(undefined), '—');
  assert.equal(L.formatDuration('soon'), '—');
});

test('an unknown id renders as itself rather than as a blank', () => {
  assert.equal(L.label(L.STAGE_LABEL, 'build'), 'Разработка');
  assert.equal(L.label(L.STAGE_LABEL, 'polish'), 'polish');
  assert.equal(L.label(L.TASK_STATUS, undefined), 'undefined');
});

test('a label lookup does not fall through to Object.prototype', () => {
  assert.equal(L.label(L.STAGE_LABEL, 'toString'), 'toString');
  assert.equal(L.label(L.STAGE_LABEL, 'constructor'), 'constructor');
});

test('the run clock stops at finishedAt', () => {
  const state = run({ finishedAt: '2026-08-19T11:00:00.000Z' });
  const later = AT('2026-08-20T23:00:00.000Z');
  assert.equal(L.formatDuration(L.elapsed(STARTED, state, later)), '1:00:00');
});

test('the run clock stops at interruptedAt', () => {
  const state = run({ interruptedAt: '2026-08-19T10:30:00.000Z' });
  const later = AT('2026-08-20T23:00:00.000Z');
  assert.equal(L.formatDuration(L.elapsed(STARTED, state, later)), '30:00');
});

test('a finished прогон carrying a stale interruptedAt still reads as finished', () => {
  // interruptedAt is cleared on resume; if both survive, reporting a completed
  // run as interrupted is the worse of the two wrong answers.
  const state = run({
    finishedAt: '2026-08-19T11:00:00.000Z',
    interruptedAt: '2026-08-19T10:05:00.000Z',
  });
  assert.equal(L.referenceTime(state, AT('2026-08-21T00:00:00.000Z')), AT('2026-08-19T11:00:00.000Z'));
  assert.match(String(L.runNotice(state)), /завершён/);
});

test('a running прогон measures against now', () => {
  const now = AT('2026-08-19T10:15:00.000Z');
  assert.equal(L.referenceTime(run(), now), now);
  assert.equal(L.formatDuration(L.elapsed(STARTED, run(), now)), '15:00');
  assert.equal(L.isStopped(run()), false);
  assert.equal(L.runNotice(run()), null);
});

test('an unparsable timestamp yields no clock instead of a wrong one', () => {
  assert.equal(L.elapsed('not a date', run(), Date.now()), null);
  assert.equal(L.formatDuration(L.elapsed('not a date', run(), Date.now())), '—');
});

test('a start in the future produces no clock rather than a negative one', () => {
  assert.equal(L.elapsed('2027-01-01T00:00:00.000Z', run(), AT(STARTED)), null);
});

test('requirement tallies count each status and sum to the манифест', () => {
  const counts = L.countRequirements([
    { id: 'R01', status: 'in-spec' },
    { id: 'R02', status: 'in-spec' },
    { id: 'R03', status: 'deferred' },
    { id: 'R04', status: 'dropped' },
    { id: 'R05', status: 'open' },
  ]);
  assert.equal(counts['in-spec'], 2);
  assert.equal(counts['deferred'], 1);
  assert.equal(counts['dropped'], 1);
  assert.equal(counts['open'], 1);
  assert.equal(counts['total'], 5);
  assert.equal(
    L.REQUIREMENT_ORDER.reduce((sum, key) => sum + (counts[key] ?? 0), 0),
    counts['total'],
  );
});

test('an unknown requirement status still counts toward the total', () => {
  // The total is what the user checks against the манифест; a status this page
  // does not know must not make a требование disappear from the count.
  const counts = L.countRequirements([{ id: 'R01', status: 'invented' }]);
  assert.equal(counts['total'], 1);
  assert.equal(counts['open'], 0);
});

test('an empty манифест tallies to zero rather than throwing', () => {
  assert.equal(L.countRequirements([])['total'], 0);
  assert.equal(L.countRequirements(undefined)['total'], 0);
});

test('a newer contract produces a notice and not an empty render', () => {
  assert.equal(L.contractNotice(L.KNOWN_CONTRACT_VERSION), null);
  assert.equal(L.contractNotice(1), null);
  assert.equal(L.contractNotice(0), null);
  const newer = L.KNOWN_CONTRACT_VERSION + 1;
  const notice = L.contractNotice(newer);
  assert.match(String(notice), new RegExp(`версии ${newer}`));
  assert.match(String(notice), /Показано то, что удалось прочитать/);
});

test('a missing contractVersion is not treated as a newer one', () => {
  assert.equal(L.contractNotice(undefined), null);
  assert.equal(L.contractNotice('1'), null);
});

test('the current stage is found by id, and by status when the id is unknown', () => {
  assert.equal(L.currentStage(run())?.id, 'plan');
  assert.equal(L.currentStage(run({ currentStage: 'nowhere' }))?.id, 'plan');
  assert.equal(L.currentStage(run({ currentStage: 'nowhere', stages: [] })), null);
});

test('the timeline renders in specification order whatever order the state is in', () => {
  const scrambled = run({
    stages: [
      { id: 'acceptance', status: 'pending' },
      { id: 'preflight', status: 'done', startedAt: STARTED },
    ],
  });
  const ordered = L.orderedStages(scrambled).map(stage => stage.id);
  assert.deepEqual(ordered, L.STAGE_ORDER);
  assert.equal(ordered[0], 'preflight');
});

test('a stage missing from the state renders as pending, not as absent', () => {
  const ordered = L.orderedStages(run());
  assert.equal(ordered.length, L.STAGE_ORDER.length);
  assert.equal(ordered.find(stage => stage.id === 'build')?.status, 'pending');
});

test('a failed stage finds the gate that follows it', () => {
  const state = run({
    gates: [
      { id: 'G1', status: 'failed', findings: ['R04 осталось открытым'] },
      { id: 'G2', status: 'pending', findings: [] },
    ],
  });
  assert.equal(L.gateFor(state, 'briefing')?.id, 'G1');
  assert.equal(L.gateFor(state, 'spec')?.id, 'G2');
  assert.equal(L.gateFor(state, 'preflight'), null);
});

test('a state that is not a state is refused before anything renders', () => {
  assert.equal(L.isStateShape(run()), true);
  assert.equal(L.isStateShape(null), false);
  assert.equal(L.isStateShape({}), false);
  assert.equal(L.isStateShape({ runId: 7, slug: 's', stages: [] }), false);
  assert.equal(L.isStateShape({ runId: 'r', slug: 's' }), false);
  assert.equal(L.isStateShape('globalThis.MAESTRO_STATE'), false);
});

test('a moment renders without a timezone suffix the user did not ask for', () => {
  assert.match(L.formatMoment('2026-08-19T10:00:00.000Z'), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  assert.equal(L.formatMoment('not a date'), 'not a date');
});

test('an entry that recorded its own end is timed to that end, not to the run clock', () => {
  const state = run();
  // The whole прогон is an hour long; the stage inside it is two minutes.
  assert.equal(
    L.formatDuration(L.elapsed(STARTED, state, AT(STARTED) + 3_600_000, '2026-08-19T10:02:00.000Z')),
    '2:00',
  );
});

test('an unusable end falls back to the reference time rather than to nothing', () => {
  const state = run();
  assert.equal(
    L.formatDuration(L.elapsed(STARTED, state, AT(STARTED) + 900_000, 'not a date')),
    '15:00',
  );
});

test('an end before the start is null, not a negative clock', () => {
  assert.equal(L.elapsed(STARTED, run(), AT(STARTED), '2026-08-19T08:00:00.000Z'), null);
});

// --- the two inputs, and the rule between them -------------------------------
//
// The page can be handed a state twice over: once as the snapshot written into
// it, and once as state.js loaded from beside it. Which one it shows is the
// difference between a dashboard that works in an in-app pane and one that
// reports an empty прогон with the state file lying right next to it.

test('a readable state is adopted whichever input it arrived on', () => {
  assert.equal(L.readOutcome(null, run()), 'live');
  assert.equal(L.readOutcome(run(), run({ currentStage: 'build' })), 'live');
});

test('the file wins over the snapshot, because it is the one that keeps moving', () => {
  const snapshot = run({ currentStage: 'plan' });
  const file = run({ currentStage: 'build' });
  assert.equal(L.readOutcome(snapshot, file), 'live');
});

test('a failed load never demotes a state that already worked', () => {
  // The server died, or the pane cannot reach the file at all. The page is
  // still showing something true — it just stopped moving, and saying it
  // cannot read the state would be a lie about what is on the screen.
  const snapshot = run();
  for (const missing of [undefined, null, '', 0, {}, { runId: 'r1' }]) {
    assert.equal(L.readOutcome(snapshot, missing), 'stale');
  }
});

test('knowing nothing is the only outcome that reports knowing nothing', () => {
  assert.equal(L.readOutcome(null, undefined), 'blank');
  assert.equal(L.readOutcome(undefined, null), 'blank');
  // A held value that is not a state is not a state: a page cannot go stale
  // against something it never managed to read.
  assert.equal(L.readOutcome({ runId: 'r1' }, undefined), 'blank');
});
