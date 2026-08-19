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
  lineOf: (value: unknown) => string;
  IDLE_CEILING_MS: number;
  plural: (n: number, one: string, few: string, many: string) => string;
  formatMinutes: (ms: unknown) => string;
  collectMarks: (state: unknown) => number[];
  activeSpan: (from: number, to: number, marks: number[]) => number;
  worked: (from: string, state: unknown, now: number, until?: string, marks?: number[]) => number | null;
  stagePosition: (state: unknown) => { position: number; total: number };
  countTasks: (tasks: unknown) => Record<string, number>;
  coverage: (list: unknown) => { percent: number; inSpec: number; live: number };
  overallProgress: (state: unknown) => {
    percent: number; stagesDone: number; stagesTotal: number;
    tasksDone: number; tasksTotal: number;
  };
  taskDurations: (state: unknown, now: number, marks?: number[]) => number[];
  medianTaskMs: (state: unknown, now: number, marks?: number[]) => number | null;
  criticalPath: (tasks: unknown) => number;
  estimateMs: (state: unknown, now: number, marks?: number[]) => { low: number; high: number } | null;
  groupByWave: (tasks: unknown) => Array<{ wave: number; tasks: Array<{ id: string }> }>;
  peakParallel: (tasks: unknown, state: unknown, now: number) => number;
  debtCounts: (state: unknown) => Record<string, number>;
  testsOf: (state: unknown) => { passed: number; failed: number } | null;
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

test('a finding the state wrote as a record still reads as text', () => {
  // A прогон wrote its G2 finding as an object; the page printed [object Object],
  // which is the one thing a list of findings must never say.
  assert.equal(L.lineOf('R04 осталось открытым'), 'R04 осталось открытым');
  assert.equal(
    L.lineOf({ id: 'G2-F01', finding: 'the spec header is silent about доводка' }),
    '{"id":"G2-F01","finding":"the spec header is silent about доводка"}',
  );
  assert.equal(L.lineOf(42), '42');
  assert.equal(L.lineOf(null), '');
  assert.equal(L.lineOf(undefined), '');
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

// --- what the cards are built from -------------------------------------------

const MIN = 60_000;

/** A state with nothing in it but the marks a test puts there. */
const bare = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  contractVersion: 2,
  runId: 'r1',
  slug: 'landing-page',
  startedAt: STARTED,
  mode: 'semi',
  depth: 'normal',
  polish: false,
  currentStage: 'build',
  stages: [],
  tasks: [],
  requirements: [],
  gates: [],
  ...extra,
});

const task = (
  id: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id, title: 'таск ' + id, requirementIds: ['R01'], status: 'queued', blockedBy: [],
  wave: 1, zone: [], retries: 0, repairs: 0, handoffs: 0, files: [],
  ...extra,
});

test('Russian counts three ways', () => {
  assert.equal(L.plural(1, 'таск', 'таска', 'тасков'), 'таск');
  assert.equal(L.plural(2, 'таск', 'таска', 'тасков'), 'таска');
  assert.equal(L.plural(5, 'таск', 'таска', 'тасков'), 'тасков');
  assert.equal(L.plural(11, 'таск', 'таска', 'тасков'), 'тасков');
  assert.equal(L.plural(21, 'таск', 'таска', 'тасков'), 'таск');
});

test('an estimate is stated in minutes, never to the second', () => {
  assert.equal(L.formatMinutes(0), '1 мин');
  assert.equal(L.formatMinutes(4 * MIN), '4 мин');
  assert.equal(L.formatMinutes(65 * MIN), '1 ч 05 мин');
  assert.equal(L.formatMinutes(NaN), '—');
});

test('a pause longer than the ceiling counts as the ceiling, not as work', () => {
  // A прогон left overnight must not report a night of work, and the state
  // already carries the marks that say so.
  const state = bare({ updatedAt: '2026-08-19T14:00:00.000Z' });
  const marks = L.collectMarks(state);
  const now = AT('2026-08-19T14:00:00.000Z');
  assert.equal(L.elapsed(STARTED, state, now), 4 * 60 * MIN);
  assert.equal(L.worked(STARTED, state, now, undefined, marks), L.IDLE_CEILING_MS);
});

test('marks inside the span are what turn a pause back into work', () => {
  const state = bare({
    updatedAt: '2026-08-19T14:00:00.000Z',
    stages: [{ id: 'build', status: 'active', startedAt: '2026-08-19T10:30:00.000Z' }],
  });
  const marks = L.collectMarks(state);
  const now = AT('2026-08-19T14:00:00.000Z');
  // 10:00 → 10:30 is work; 10:30 → 14:00 is a pause capped at the ceiling.
  assert.equal(L.worked(STARTED, state, now, undefined, marks), 30 * MIN + L.IDLE_CEILING_MS);
});

test('the progress bar weights the stages rather than counting them', () => {
  const preflightOnly = L.overallProgress(bare({
    stages: [{ id: 'preflight', status: 'done' }],
  }));
  const throughPlan = L.overallProgress(bare({
    stages: [
      { id: 'preflight', status: 'done' }, { id: 'manifest', status: 'done' },
      { id: 'briefing', status: 'skipped', note: 'полный автомат' },
      { id: 'spec', status: 'done' }, { id: 'plan', status: 'done' },
    ],
  }));
  assert.equal(preflightOnly.stagesDone, 1);
  assert.equal(preflightOnly.stagesTotal, 8);
  // Five of eight stages, but they are the cheap ones: разработка alone weighs six.
  assert.equal(throughPlan.stagesDone, 5);
  assert.ok(throughPlan.percent < 50, `expected under half, got ${throughPlan.percent}`);
});

test('inside the build the bar moves with the таски', () => {
  const stages = [
    { id: 'preflight', status: 'done' }, { id: 'manifest', status: 'done' },
    { id: 'briefing', status: 'done' }, { id: 'spec', status: 'done' },
    { id: 'plan', status: 'done' }, { id: 'build', status: 'active' },
  ];
  const none = L.overallProgress(bare({ stages, tasks: [task('01'), task('02')] }));
  const half = L.overallProgress(bare({
    stages, tasks: [task('01', { status: 'done' }), task('02')],
  }));
  assert.ok(half.percent > none.percent, 'a finished таск must move the bar');
  assert.equal(half.tasksDone, 1);
  assert.equal(half.tasksTotal, 2);
});

test('a stage nobody skipped and nobody started contributes nothing', () => {
  const progress = L.overallProgress(bare({ stages: [{ id: 'build', status: 'pending' }] }));
  assert.equal(progress.percent, 0);
});

test('coverage measures live требования, so a dropped one is not a gap', () => {
  const cover = L.coverage([
    { id: 'R01', status: 'in-spec' },
    { id: 'R02', status: 'in-spec' },
    { id: 'R03', status: 'dropped' },
    { id: 'R04', status: 'placeholder' },
  ]);
  assert.equal(cover.live, 3);
  assert.equal(cover.inSpec, 2);
  assert.equal(cover.percent, 67);
});

test('a таск in review is still in motion, not waiting', () => {
  const counts = L.countTasks([
    task('01', { status: 'done' }),
    task('02', { status: 'running' }),
    task('03', { status: 'review' }),
    task('04', { status: 'repair', repairs: 1, retries: 2 }),
    task('05', { status: 'failed' }),
    task('06'),
  ]);
  assert.equal(counts['done'], 1);
  assert.equal(counts['active'], 3);
  assert.equal(counts['queued'], 1);
  assert.equal(counts['failed'], 1);
  assert.equal(counts['retries'], 2);
});

test('one finished таск is an anecdote, and the median says so', () => {
  const now = AT('2026-08-19T12:00:00.000Z');
  const one = bare({
    tasks: [task('01', {
      status: 'done',
      startedAt: STARTED, finishedAt: '2026-08-19T10:10:00.000Z',
    })],
  });
  assert.equal(L.medianTaskMs(one, now), null);

  const three = bare({
    tasks: [
      task('01', { status: 'done', startedAt: STARTED, finishedAt: '2026-08-19T10:10:00.000Z' }),
      task('02', { status: 'done', startedAt: STARTED, finishedAt: '2026-08-19T10:20:00.000Z' }),
      task('03', { status: 'done', startedAt: STARTED, finishedAt: '2026-08-19T10:30:00.000Z' }),
    ],
  });
  assert.equal(L.medianTaskMs(three, now), 20 * MIN);
});

test('the critical path counts only what is left, and survives a cycle', () => {
  const chain = [
    task('01', { status: 'done' }),
    task('02', { blockedBy: ['01'] }),
    task('03', { blockedBy: ['02'] }),
  ];
  assert.equal(L.criticalPath(chain), 2);
  assert.equal(L.criticalPath([task('01', { status: 'done' })]), 0);
  // A plan should never contain one, and the page must not hang if it does.
  assert.ok(L.criticalPath([
    task('01', { blockedBy: ['02'] }), task('02', { blockedBy: ['01'] }),
  ]) >= 1);
});

test('the estimate refuses to guess before there is anything to guess from', () => {
  const now = AT('2026-08-19T12:00:00.000Z');
  assert.equal(L.estimateMs(bare({ tasks: [task('01')] }), now), null);
});

test('the estimate is a range, and a таск already running is nearly done sooner', () => {
  const now = AT('2026-08-19T11:00:00.000Z');
  const state = bare({
    updatedAt: '2026-08-19T11:00:00.000Z',
    tasks: [
      task('01', { status: 'done', startedAt: STARTED, finishedAt: '2026-08-19T10:20:00.000Z' }),
      task('02', { status: 'done', startedAt: STARTED, finishedAt: '2026-08-19T10:20:00.000Z' }),
      task('03', { status: 'queued', wave: 2, blockedBy: ['01'] }),
    ],
  });
  const queued = L.estimateMs(state, now);
  assert.ok(queued && queued.low < queued.high, 'the estimate is always a range');

  const started = L.estimateMs(bare({
    updatedAt: '2026-08-19T11:00:00.000Z',
    tasks: [
      task('01', { status: 'done', startedAt: STARTED, finishedAt: '2026-08-19T10:20:00.000Z' }),
      task('02', { status: 'done', startedAt: STARTED, finishedAt: '2026-08-19T10:20:00.000Z' }),
      task('03', { status: 'running', wave: 2, blockedBy: ['01'], startedAt: '2026-08-19T10:50:00.000Z' }),
    ],
  }), now);
  assert.ok(started && queued && started.high < queued.high,
    'a таск ten minutes in must not be estimated as one that has not begun');
});

test('таски group by the layer the plan gave them, in id order', () => {
  const groups = L.groupByWave([
    task('03', { wave: 2 }), task('01', { wave: 1 }), task('02', { wave: 1 }),
  ]);
  // Values, not structures: the logic block runs in a vm realm, and its arrays
  // carry that realm's prototypes, which strict deep equality compares.
  assert.equal(groups.length, 2);
  assert.equal(groups[0]?.wave, 1);
  assert.equal(groups[1]?.wave, 2);
  assert.equal(groups[0]?.tasks.length, 2);
  assert.equal(groups[0]?.tasks[0]?.id, '01');
  assert.equal(groups[0]?.tasks[1]?.id, '02');
});

test('a таск with no wave is not lost — it lands in the first one', () => {
  const groups = L.groupByWave([{ id: '01', status: 'queued' }]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.wave, 1);
});

test('parallelism is read from the clocks, never from the size of the wave', () => {
  const state = bare({});
  const now = AT('2026-08-19T12:00:00.000Z');

  const together = [
    task('01', { startedAt: STARTED, finishedAt: '2026-08-19T10:30:00.000Z' }),
    task('02', { startedAt: '2026-08-19T10:10:00.000Z', finishedAt: '2026-08-19T10:40:00.000Z' }),
  ];
  assert.equal(L.peakParallel(together, state, now), 2);

  // Two таски of one wave that in fact ran one after the other. Claiming
  // parallelism here is the flattery that makes the rest of the screen suspect.
  const inTurn = [
    task('01', { startedAt: STARTED, finishedAt: '2026-08-19T10:30:00.000Z' }),
    task('02', { startedAt: '2026-08-19T10:30:00.000Z', finishedAt: '2026-08-19T11:00:00.000Z' }),
  ];
  assert.equal(L.peakParallel(inTurn, state, now), 1);

  assert.equal(L.peakParallel([task('01')], state, now), 0);
});

test('the debt is three lists counted as one number', () => {
  const nothing = L.debtCounts(bare({}));
  assert.equal(nothing['placeholders'], 0);
  assert.equal(nothing['assumptions'], 0);
  assert.equal(nothing['emptyEnv'], 0);
  assert.equal(nothing['total'], 0);
  const counted = L.debtCounts(bare({
    debt: { placeholders: ['R05 — цвета'], assumptions: ['SQLite'], emptyEnv: ['TOKEN', 'SHEET_ID'] },
  }));
  assert.equal(counted['total'], 4);
});

test('a прогон with no suite says nothing rather than claiming a green one', () => {
  assert.equal(L.testsOf(bare({})), null);
  assert.equal(L.testsOf(bare({ tests: { passed: 41, failed: 0 } }))?.passed, 41);
  // Falling back to the last таск's own suite is the honest second answer.
  const fallback = L.testsOf(bare({ tasks: [task('01', { tests: { passed: 6, failed: 1 } })] }));
  assert.equal(fallback?.passed, 6);
  assert.equal(fallback?.failed, 1);
});

test('the stage position counts from one and does not run past the road', () => {
  const inBuild = L.stagePosition(bare({
    currentStage: 'build', stages: [{ id: 'build', status: 'active' }],
  }));
  assert.equal(inBuild.position, 6);
  assert.equal(inBuild.total, 8);
  assert.equal(L.stagePosition(bare({ stages: [] })).position, 8);
});
