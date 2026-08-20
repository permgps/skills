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

type Words = Record<string, Record<string, string>>;

interface Logic {
  KNOWN_CONTRACT_VERSION: number;
  STAGE_ORDER: string[];
  L10N: { ru: Words; en: Words } & Record<string, Words>;
  LANGUAGE_ORDER: string[];
  languageOf: (state: unknown) => string;
  words: (language?: string) => Words;
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
  contractNotice: (version: unknown, language?: string) => string | null;
  runNotice: (state: unknown, language?: string) => string | null;
  formatGap: (ms: unknown, language?: string) => string;
  longestSilence: (marks: number[]) => number | null;
  lastWrite: (state: unknown, marks: number[]) => number | null;
  silenceNotice: (
    state: unknown, now: number, marks: number[], register?: string, language?: string,
  ) => { alarming: boolean; line: string } | null;
  EXPLAIN_ORDER: string[];
  explain: (
    key: string, state: unknown, now: number, marks: number[],
    register?: string, language?: string,
  ) => string[];
  registerOf: (state: unknown) => string;
  isStopped: (state: unknown) => boolean;
  isStateShape: (value: unknown) => boolean;
  readOutcome: (held: unknown, incoming: unknown) => string;
  gateFor: (state: unknown, stageId: string) => { id: string; findings: string[] } | null;
  lineOf: (value: unknown) => string;
  findingsView: (gate: unknown) => { show: boolean; folded: boolean; tone: string; count: number };
  findingsLine: (count: number, register?: string, language?: string) => string;
  IDLE_CEILING_MS: number;
  plural: (n: number, one: string, few: string, many: string) => string;
  formatMinutes: (ms: unknown, language?: string) => string;
  collectMarks: (state: unknown) => number[];
  activeSpan: (from: number, to: number, marks: number[]) => number;
  worked: (from: string, state: unknown, now: number, until?: string, marks?: number[]) => number | null;
  stagePosition: (state: unknown) => { position: number; total: number };
  TASK_ORDER: string[];
  SHARE_BY_STATUS: Record<string, number>;
  countTasks: (tasks: unknown) => Record<string, number>;
  taskShare: (tasks: unknown) => { share: number; done: number; total: number };
  coverage: (list: unknown) => { percent: number; inSpec: number; live: number };
  overallProgress: (state: unknown) => {
    percent: number; stagesDone: number; stagesTotal: number;
    tasksDone: number; tasksTotal: number;
    tasksActive: number; tasksOffContract: number; tasksShare: number;
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
  assert.equal(L.label(L.L10N.ru['STAGE_LABEL']!, 'build'), 'Разработка');
  assert.equal(L.label(L.L10N.en['STAGE_LABEL']!, 'build'), 'Development');
  assert.equal(L.label(L.L10N.ru['STAGE_LABEL']!, 'polish'), 'polish');
  assert.equal(L.label(L.L10N.ru['TASK_STATUS']!, undefined), 'undefined');
});

test('a label lookup does not fall through to Object.prototype', () => {
  assert.equal(L.label(L.L10N.ru['STAGE_LABEL']!, 'toString'), 'toString');
  assert.equal(L.label(L.L10N.ru['STAGE_LABEL']!, 'constructor'), 'constructor');
});

// The two branches carry the same key set, which is what lets the checker walk
// the languages instead of learning a map name per language.
test('both languages carry the same words under the same keys', () => {
  assert.deepEqual([...L.LANGUAGE_ORDER], ['ru', 'en']);
  assert.deepEqual(Object.keys(L.L10N), ['ru', 'en']);
  const ru = Object.keys(L.L10N.ru).sort();
  const en = Object.keys(L.L10N.en).sort();
  assert.deepEqual(ru, en);
  for (const map of ru) {
    assert.deepEqual(
      Object.keys(L.L10N.ru[map]!).sort(),
      Object.keys(L.L10N.en[map]!).sort(),
      `${map} holds different keys in the two languages`,
    );
  }
});

// Absent is `ru`, and absent is what every прогон written before the dial
// carries. Painting one of those in English would report a choice nobody made.
test('a state with no language paints Russian', () => {
  assert.equal(L.languageOf(run()), 'ru');
  assert.equal(L.languageOf({ language: 'en' }), 'en');
  assert.equal(L.languageOf({ language: 'de' }), 'ru');
  assert.equal(L.languageOf(null), 'ru');
  assert.equal(L.words('de'), L.words('ru'));
});

test('every region is explained in both languages and both registers', () => {
  for (const language of L.LANGUAGE_ORDER) {
    for (const register of ['normal', 'plain']) {
      for (const key of L.EXPLAIN_ORDER) {
        const lines = L.explain(key, run(), NOW, [], register, language);
        assert.ok(lines.length > 0, `${key} is silent in ${register}/${language}`);
      }
    }
  }
});

test('the same region reads in the language it was asked for', () => {
  assert.match(L.explain('tests', run(), NOW, [], 'normal', 'ru')[0]!, /тест/i);
  assert.match(L.explain('tests', run(), NOW, [], 'normal', 'en')[0]!, /test/i);
});

test('a duration carries the units of the language it is printed in', () => {
  assert.equal(L.formatMinutes(4 * MIN, 'en'), '4 min');
  assert.equal(L.formatMinutes(65 * MIN, 'en'), '1 h 05 min');
  assert.equal(L.formatGap(12_000, 'en'), '12 sec');
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

// --- the counters, and the прогон that exposed them --------------------------

// Three review, two running, one `pending` — the run behind the screenshots in
// docs/, read out of ~/Projects/My/test2/.maestro/state.js. `pending` is a
// стадия's status and a гейт's; it is not one a таск may carry.
const STALLED = [
  task('01', { status: 'review' }), task('02', { status: 'review' }),
  task('03', { status: 'review' }),
  task('04', { status: 'running' }), task('05', { status: 'running' }),
  task('06', { status: 'pending' }),
];

const BUILDING = [
  { id: 'preflight', status: 'done' }, { id: 'manifest', status: 'done' },
  { id: 'briefing', status: 'done' }, { id: 'spec', status: 'done' },
  { id: 'plan', status: 'done' }, { id: 'build', status: 'active' },
];

test('every таск lands in a bucket, so the chips add up to the total', () => {
  const counts = L.countTasks(STALLED);
  const buckets = [...L.TASK_ORDER, 'offContract']
    .reduce((sum, key) => sum + (counts[key] ?? 0), 0);
  assert.equal(counts['total'], 6);
  assert.equal(buckets, 6);
  assert.equal(counts['offContract'], 1);
  // Unknown is not known to be moving: the off-contract таск stays out of this.
  assert.equal(counts['active'], 5);
});

test('a hole in the list is counted rather than skipped', () => {
  const counts = L.countTasks([null, undefined, task('01', { status: 'done' })]);
  assert.equal(counts['total'], 3);
  assert.equal(counts['offContract'], 2);
  assert.equal(counts['done'], 1);
});

test('a status weighs what the scale says, and an unknown one weighs nothing', () => {
  const weigh = (status: string): number => L.taskShare([task('01', { status })]).share;
  assert.equal(weigh('done'), 1);
  assert.equal(weigh('review'), 0.8);
  assert.equal(weigh('repair'), 0.5);
  assert.equal(weigh('running'), 0.5);
  assert.equal(weigh('queued'), 0);
  assert.equal(weigh('failed'), 0);
  assert.equal(weigh('pending'), 0);
  assert.deepEqual({ ...L.taskShare([]) }, { share: 0, done: 0, total: 0 });
});

test('the scale is the mirror of the one Осталось grades the remainder by', () => {
  // estimateMs owes 0.2 of a median for review and 0.5 for repair. Two figures
  // on one screen must not disagree about the same таск, so this is the same
  // table read from the other end — not a second opinion about progress.
  for (const [status, remaining] of [['review', 0.2], ['repair', 0.5], ['done', 0]] as const) {
    assert.equal(L.SHARE_BY_STATUS[status], 1 - remaining, status);
  }
});

test('the run behind the screenshots no longer reads as stalled', () => {
  const progress = L.overallProgress(bare({ stages: BUILDING, tasks: STALLED }));
  const share = L.taskShare(STALLED);

  // 3 × 0.8 + 2 × 0.5 = 3.4 of six.
  assert.equal(Math.round(share.share * 100), 57);
  // Six stages of fifteen weight units behind it, plus 3.4/6 of разработка's six.
  assert.equal(progress.percent, 63);
  // The two numbers the screenshots showed while five таски were in motion.
  assert.notEqual(progress.percent, 42);
  assert.notEqual(Math.round(share.share * 100), 38);
  assert.equal(progress.tasksDone, 0);
  assert.equal(progress.tasksOffContract, 1);
  assert.equal(progress.tasksActive, 5);
});

test('the bar falls when a review sends a таск back, and that is the point', () => {
  // A bar that only ever rises lies once, quietly, at the moment a review
  // fails. This test exists so nobody "fixes" the fall into a monotonic clamp.
  const before = L.overallProgress(bare({ stages: BUILDING, tasks: STALLED }));
  const after = L.overallProgress(bare({
    stages: BUILDING,
    tasks: STALLED.map(t => (t['id'] === '01' ? { ...t, status: 'repair' } : t)),
  }));
  assert.ok(after.percent < before.percent,
    `expected a fall from ${before.percent}, got ${after.percent}`);
});

test('an open build with nothing finished still clears its floor', () => {
  const progress = L.overallProgress(bare({
    stages: BUILDING,
    tasks: [task('01'), task('02'), task('03')],
  }));
  assert.equal(progress.tasksShare, 0);
  // 6 of 15 behind it, plus the 5% floor of разработка's six.
  assert.equal(progress.percent, 42);
});

test('both registers of both languages name the share they were built from', () => {
  const state = bare({ stages: BUILDING, tasks: STALLED });
  const marks = L.collectMarks(state);
  const now = AT('2026-08-19T14:00:00.000Z');
  const share = String(Math.round(L.taskShare(STALLED).share * 100));

  for (const language of ['ru', 'en']) {
    for (const register of ['normal', 'plain']) {
      for (const key of ['progress', 'tasks']) {
        const said = L.explain(key, state, now, marks, register, language).join(' ');
        assert.match(said, new RegExp(share + '%'),
          `${language}/${register}/${key} must name the share the region shows`);
        assert.ok(!/три четверти|three quarters/.test(said),
          `${language}/${register}/${key} still describes the scale it no longer uses`);
      }
    }
  }
});

test('an off-contract таск is named in every explanation that counts it', () => {
  const state = bare({ stages: BUILDING, tasks: STALLED });
  const clean = bare({ stages: BUILDING, tasks: STALLED.slice(0, 5) });
  const marks = L.collectMarks(state);
  const now = AT('2026-08-19T14:00:00.000Z');

  for (const language of ['ru', 'en']) {
    for (const register of ['normal', 'plain']) {
      for (const key of ['progress', 'tasks']) {
        const said = L.explain(key, state, now, marks, register, language).join(' ');
        const quiet = L.explain(key, clean, now, marks, register, language).join(' ');
        assert.ok(said.length > quiet.length,
          `${language}/${register}/${key} says nothing about the таск it could not count`);
      }
    }
  }
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

test('a gap reads in seconds below a minute and in minutes above one', () => {
  assert.equal(L.formatGap(0), '0 сек');
  assert.equal(L.formatGap(12_000), '12 сек');
  assert.equal(L.formatGap(59_999), '59 сек');
  assert.equal(L.formatGap(90_000), '2 мин');
  assert.equal(L.formatGap(-1), '—');
  assert.equal(L.formatGap('soon'), '—');
});

test('the longest silence is the прогон own, and unknown before it has two marks', () => {
  assert.equal(L.longestSilence([]), null);
  assert.equal(L.longestSilence([AT(STARTED)]), null);
  assert.equal(
    L.longestSilence([AT('2026-08-19T10:00:00.000Z'), AT('2026-08-19T10:04:00.000Z'), AT('2026-08-19T10:30:00.000Z')]),
    26 * 60_000,
  );
});

test('a stopped прогон is silent lawfully and says nothing about it', () => {
  // runNotice already names both of these; a second line would say the same
  // thing in worse words.
  const finished = run({ finishedAt: '2026-08-19T11:00:00.000Z' });
  const interrupted = run({ interruptedAt: '2026-08-19T10:40:00.000Z' });
  const later = AT('2026-08-20T00:00:00.000Z');
  assert.equal(L.silenceNotice(finished, later, L.collectMarks(finished)), null);
  assert.equal(L.silenceNotice(interrupted, later, L.collectMarks(interrupted)), null);
});

test('an ordinary quiet reports the fact without raising it', () => {
  // The fixture's marks are 10:00 and 10:30, so this прогон has already gone
  // half an hour without a word. Five minutes is nothing to it.
  const state = run();
  const notice = L.silenceNotice(state, AT('2026-08-19T10:35:00.000Z'), L.collectMarks(state));
  assert.ok(notice);
  assert.equal(notice.alarming, false);
  assert.match(notice.line, /Последняя запись — 5 мин назад/);
});

test('silence longer than the прогон has ever kept is raised, and names both', () => {
  const state = run();
  const notice = L.silenceNotice(state, AT('2026-08-19T11:15:00.000Z'), L.collectMarks(state));
  assert.ok(notice);
  assert.equal(notice.alarming, true);
  assert.match(notice.line, /Тишина 45 мин/);
  assert.match(notice.line, /30 мин/);
});

test('the silence is measured from updatedAt when the прогон records one', () => {
  // A стадия stamp says when something happened; `updatedAt` says when the
  // state was last written, and it is the second one this notice is about.
  const state = run({ contractVersion: 2, updatedAt: '2026-08-19T10:45:00.000Z' });
  const marks = L.collectMarks(state);
  assert.equal(L.lastWrite(state, marks), AT('2026-08-19T10:45:00.000Z'));

  const notice = L.silenceNotice(state, AT('2026-08-19T10:50:00.000Z'), marks);
  assert.ok(notice);
  assert.equal(notice.alarming, false);
  assert.match(notice.line, /5 мин назад/);
});

test('a прогон of contract 1 falls back to the newest instant it recorded', () => {
  const state = run();
  assert.equal(state['updatedAt'], undefined);
  assert.equal(L.lastWrite(state, L.collectMarks(state)), AT('2026-08-19T10:30:00.000Z'));
});

/** A прогон far enough along that every region has something to say. */
const busy = (): Record<string, unknown> => run({
  contractVersion: 2,
  updatedAt: '2026-08-19T10:30:00.000Z',
  currentStage: 'build',
  stages: [
    { id: 'preflight', status: 'done', startedAt: STARTED, finishedAt: '2026-08-19T10:05:00.000Z' },
    { id: 'manifest', status: 'done', startedAt: '2026-08-19T10:05:00.000Z', finishedAt: '2026-08-19T10:15:00.000Z' },
    { id: 'build', status: 'active', startedAt: '2026-08-19T10:15:00.000Z' },
  ],
  tasks: [
    {
      id: 'T01', title: 'Движок', requirementIds: ['R01'], blockedBy: [], wave: 1,
      status: 'done', retries: 0, repairs: 0, handoffs: 0, zone: [], files: [],
      startedAt: '2026-08-19T10:15:00.000Z', finishedAt: '2026-08-19T10:21:00.000Z',
      tests: { passed: 35, failed: 0 },
    },
    {
      id: 'T02', title: 'Компьютер', requirementIds: ['R01'], blockedBy: ['T01'], wave: 2,
      status: 'review', retries: 1, repairs: 0, handoffs: 0, zone: [], files: [],
      startedAt: '2026-08-19T10:21:00.000Z', finishedAt: '2026-08-19T10:29:00.000Z',
    },
    {
      id: 'T03', title: 'Страница', requirementIds: ['R02'], blockedBy: ['T01'], wave: 2,
      status: 'running', retries: 0, repairs: 0, handoffs: 0, zone: [], files: [],
      startedAt: '2026-08-19T10:29:00.000Z',
    },
  ],
  requirements: [
    { id: 'R01', status: 'in-spec' },
    { id: 'R02', status: 'in-spec' },
    { id: 'R03', status: 'deferred', reason: 'no copy supplied' },
    { id: 'R04', status: 'dropped', reason: 'withdrawn in briefing' },
  ],
  gates: [
    { id: 'G1', status: 'passed', findings: [] },
    { id: 'G2', status: 'failed', findings: ['R02 — the spec never names the empty board'] },
  ],
  debt: { placeholders: ['the hard label'], assumptions: [], emptyEnv: ['TELEGRAM_BOT_TOKEN'] },
});

const NOW = AT('2026-08-19T10:35:00.000Z');

test('the page can explain every region it renders', () => {
  assert.equal(L.EXPLAIN_ORDER.length, 14);
  for (const key of L.EXPLAIN_ORDER) {
    const state = busy();
    const lines = L.explain(key, state, NOW, L.collectMarks(state));
    assert.ok(lines.length >= 2, `${key} explains itself in fewer than two lines`);
    for (const line of lines) {
      assert.equal(typeof line, 'string');
      assert.ok(line.trim().length > 0, `${key} produced a blank line`);
    }
  }
});

test('an empty прогон is explained rather than left blank', () => {
  // Before the манифест there is nothing to count, and that is exactly when a
  // reader is least able to guess what a region is for.
  for (const key of L.EXPLAIN_ORDER) {
    const state = run();
    const lines = L.explain(key, state, NOW, L.collectMarks(state));
    assert.ok(lines.length >= 2, `${key} says nothing about an empty прогон`);
    assert.ok(lines.every((line) => line.trim().length > 0), `${key} produced a blank line`);
  }
});

test('a finished прогон is explained without pretending it still has an estimate', () => {
  const state = run({ finishedAt: '2026-08-19T11:00:00.000Z' });
  for (const key of L.EXPLAIN_ORDER) {
    const lines = L.explain(key, state, AT('2026-08-19T11:30:00.000Z'), L.collectMarks(state));
    assert.ok(lines.length >= 2, `${key} says nothing about a finished прогон`);
  }
  assert.match(L.explain('estimate', state, NOW, [])[1]!, /завершён/);
});

test('an explanation carries this прогон numbers, not a generic sentence', () => {
  const state = busy();
  const marks = L.collectMarks(state);

  // Tasks: three cut, one done, one on review, one running.
  assert.match(L.explain('tasks', state, NOW, marks)[1]!, /Готово 1 из 3/);
  // Coverage: R04 is dropped, so the denominator is three rather than four.
  assert.match(L.explain('coverage', state, NOW, marks)[1]!, /2 из 3/);
  // Gates: one passed, one failed, out of the two recorded so far.
  assert.match(L.explain('gates', state, NOW, marks)[1]!, /Пройдено 1, провалено 1 из 2/);
  // Debt: a placeholder and an empty variable, and never the secret's value.
  assert.match(L.explain('debt', state, NOW, marks)[1]!, /Всего 2/);
  // Tests: the last таск's own suite, since the прогон recorded no full run.
  assert.match(L.explain('tests', state, NOW, marks)[1]!, /Прошло 35/);
  // Estimate: two таски finished, so a median exists and is named.
  assert.match(L.explain('estimate', state, NOW, marks)[1]!, /при медиане/);
});

test('a region the page does not know explains nothing rather than throwing', () => {
  // The array crosses out of the vm, so its prototype is not this realm's
  // Array and deepStrictEqual would compare realms rather than contents.
  assert.equal(L.explain('nonesuch', busy(), NOW, []).length, 0);
});

// --- the plain register ----------------------------------------------------

test('a state with no register reads as normal without claiming one', () => {
  // Absent is not a choice. The page words itself as it always did, and the
  // chip that would name a register is not drawn — that part is in the view
  // block, and what is testable here is the one function it asks.
  assert.equal(L.registerOf(run()), 'normal');
  assert.equal(L.registerOf({ explain: 'plain' }), 'plain');
  assert.equal(L.registerOf({ explain: 'nonesuch' }), 'normal');
  assert.equal(L.registerOf(null), 'normal');

  const state = busy();
  const marks = L.collectMarks(state);
  assert.deepEqual(
    L.explain('tasks', state, NOW, marks).join('|'),
    L.explain('tasks', state, NOW, marks, 'normal').join('|'),
  );
});

test('every region is explained in the plain register too, empty and busy alike', () => {
  for (const state of [run(), busy(), run({ finishedAt: '2026-08-19T11:00:00.000Z' })]) {
    const marks = L.collectMarks(state);
    for (const key of L.EXPLAIN_ORDER) {
      const lines = L.explain(key, state, NOW, marks, 'plain');
      assert.ok(lines.length >= 2, `${key} says too little in the plain register`);
      assert.ok(lines.every((line) => typeof line === 'string' && line.trim().length > 0),
        `${key} produced a blank plain line`);
    }
  }
});

test('a plain explanation carries the same numbers as the normal one', () => {
  // Both are built from the same functions. An explanation that recomputed its
  // own figures could disagree with the one beside it, and the plain reader is
  // the last person able to notice.
  const state = busy();
  const marks = L.collectMarks(state);
  assert.match(L.explain('tasks', state, NOW, marks, 'plain')[1]!, /Готово 1 из 3/);
  assert.match(L.explain('coverage', state, NOW, marks, 'plain')[1]!, /2 из 3/);
  assert.match(L.explain('gates', state, NOW, marks, 'plain')[1]!, /Пройдено 1, провалено 1 из 2/);
  assert.match(L.explain('debt', state, NOW, marks, 'plain')[1]!, /Всего 2/);
  assert.match(L.explain('tests', state, NOW, marks, 'plain')[1]!, /Прошло 35/);
  // The same figure the normal register calls a median, named in words.
  assert.match(L.explain('estimate', state, NOW, marks, 'plain')[1]!, /при серединном времени/);
});

test('the register names the dials chip and nothing else', () => {
  assert.equal(L.L10N.ru['REGISTER']!['plain'], 'Простые');
  assert.equal(L.L10N.ru['REGISTER']!['normal'], 'Обычные');
  assert.equal(L.L10N.en['REGISTER']!['plain'], 'Plain');
  const state = busy();
  assert.match(L.explain('dials', { ...state, explain: 'plain' }, NOW, [], 'plain')[1]!,
    /объяснения «Простые»/);
  // A прогон that pinned nothing is described without one.
  assert.doesNotMatch(L.explain('dials', state, NOW, [], 'plain')[1]!, /объяснения/);
});

test('the silence notice is worded in the register too', () => {
  const state = run({ updatedAt: '2026-08-19T10:00:00.000Z' });
  const quiet = L.silenceNotice(state, NOW, [], 'plain');
  assert.match(quiet!.line, /В последний раз что-то менялось/);
  assert.match(L.silenceNotice(state, NOW, [], 'normal')!.line, /Последняя запись/);

  // Past the run's own record, the plain wording says what it means rather
  // than naming a file the reader has never seen.
  const marks = [AT('2026-08-19T09:50:00.000Z'), AT('2026-08-19T10:00:00.000Z')];
  const alarming = L.silenceNotice(state, NOW, marks, 'plain');
  assert.equal(alarming!.alarming, true);
  assert.match(alarming!.line, /Возможно, работа остановилась/);
});

test('a passed check with findings folds, and a failed one does not', () => {
  // The defect this replaced: findings were drawn at any status, in the colour
  // of failure, because the rule lived in a render no test could call.
  assert.deepEqual({ ...L.findingsView({ id: 'G1', status: 'passed', findings: [] }) },
    { show: false, folded: false, tone: 'quiet', count: 0 });
  assert.deepEqual({ ...L.findingsView({ id: 'G3', status: 'passed', findings: ['a', 'b'] }) },
    { show: true, folded: true, tone: 'quiet', count: 2 });
  assert.deepEqual({ ...L.findingsView({ id: 'G3', status: 'failed', findings: ['a'] }) },
    { show: true, folded: false, tone: 'fail', count: 1 });
  // A failed gate that recorded nothing shows nothing here — the sentence for
  // that case belongs to the failed стадия, which draws it a few rows above.
  assert.deepEqual({ ...L.findingsView({ id: 'G3', status: 'failed', findings: [] }) },
    { show: false, folded: false, tone: 'quiet', count: 0 });
  // Anything not failed is read as settled: a гейт still waiting cannot have
  // findings to answer for, and folding is the safe way to be wrong.
  assert.equal(L.findingsView({ id: 'G4', status: 'pending', findings: ['a'] }).folded, true);
});

test('the findings view survives a state that wrote nonsense', () => {
  // The page is the reader, never the writer. None of these may throw.
  for (const gate of [null, undefined, {}, { status: 'passed' },
    { status: 'passed', findings: null }, { status: 'passed', findings: 'oops' },
    { status: 'passed', findings: [{ id: 'T01' }] }]) {
    const view = L.findingsView(gate);
    assert.equal(typeof view.count, 'number');
    assert.equal(typeof view.show, 'boolean');
  }
  // A findings list holding a record is still a list, and it is still counted.
  assert.equal(L.findingsView({ status: 'passed', findings: [{ id: 'T01' }] }).count, 1);
  // A list that is not a list counts as nothing rather than as its length.
  assert.equal(L.findingsView({ status: 'passed', findings: 'oops' }).count, 0);
});

test('the folded line counts in the language and the register it is given', () => {
  assert.equal(L.findingsLine(1, 'normal', 'ru'), '1 находка — отработана');
  assert.equal(L.findingsLine(1, 'plain', 'ru'), '1 замечание — уже исправлено');
  assert.equal(L.findingsLine(1, 'normal', 'en'), '1 finding — acted on');
  assert.equal(L.findingsLine(2, 'normal', 'en'), '2 findings — all acted on');
  assert.equal(L.findingsLine(1, 'plain', 'en'), '1 note — already dealt with');
  // The line names neither the check nor its status: the row above says both.
  // It is also what keeps every branch safe for the plain reader, which the
  // source scan of the UI map requires — «гейт» in either branch would fail.
  assert.doesNotMatch(L.findingsLine(21, 'plain', 'ru'), /[Гг]ейт/);
  assert.doesNotMatch(L.findingsLine(21, 'normal', 'ru'), /[Гг]ейт/);
});

test('the Russian count reads correctly at 1, 2, 5, 11 and 21', () => {
  // 21 is the number the real прогон produced, and it is the one a naive
  // plural gets wrong: it takes the singular, not the many.
  const line = (n: number): string => L.findingsLine(n, 'normal', 'ru');
  assert.match(line(1), /^1 находка — отработана$/);
  assert.match(line(2), /^2 находки — отработаны$/);
  assert.match(line(5), /^5 находок — отработаны$/);
  assert.match(line(11), /^11 находок — отработаны$/);
  assert.match(line(21), /^21 находка — отработана$/);
  const plain = (n: number): string => L.findingsLine(n, 'plain', 'ru');
  assert.match(plain(1), /^1 замечание — уже исправлено$/);
  assert.match(plain(2), /^2 замечания — уже исправлены$/);
  assert.match(plain(5), /^5 замечаний — уже исправлены$/);
  assert.match(plain(21), /^21 замечание — уже исправлено$/);
});

test('the checks explain their findings in every language and register', () => {
  const state = {
    gates: [
      { id: 'G1', status: 'passed', findings: ['T01 — …; acted on: …', 'T02 — …; acted on: …'] },
      { id: 'G2', status: 'failed', findings: ['T03 — …'] },
    ],
  };
  assert.match(L.explain('gates', state, NOW, [], 'normal', 'ru')[2]!,
    /Находок 3: под пройденными 2, под проваленными 1/);
  assert.match(L.explain('gates', state, NOW, [], 'plain', 'ru')[2]!,
    /Замечаний 3: под пройденными 2, под непройденными 1/);
  assert.match(L.explain('gates', state, NOW, [], 'normal', 'en')[2]!,
    /Findings in all: 3 — 2 under checks that passed, 1 under checks that did not/);
  assert.match(L.explain('gates', state, NOW, [], 'plain', 'en')[2]!,
    /Notes in all: 3 — 2 under checks that passed, 1 under checks that did not/);

  // Nothing found anywhere is an answer too, and it is the branch a fixture
  // forgets: every gate in both docs fixtures passed with an empty list.
  const clean = { gates: [{ id: 'G1', status: 'passed', findings: [] }] };
  assert.match(L.explain('gates', clean, NOW, [], 'normal', 'ru')[2]!, /Находок гейты пока не оставили/);
  assert.match(L.explain('gates', clean, NOW, [], 'plain', 'en')[2]!, /have left no notes yet/);
});
