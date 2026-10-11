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
import { correctedSourceAuditState, controlledState, defect, repairContract6State, strategyReview, v3Attempt, sourceVerifiedState, deferredScopeState, sha256, verifiedState } from '../state/fixtures/verification.ts';
import { projectState } from '../state/projection.ts';
import { parseStateSource } from '../state/read.ts';
import { AWAITING_KINDS } from '../state/contract.ts';
import { retrospectiveState } from '../state/fixtures/retrospective.ts';
import { deriveVerification } from '../state/verification.ts';
import { cleanCell, parseTables } from './spec-integrity.ts';

const ASSET = 'skills/maestro/assets/dashboard.html';

type Words = Record<string, Record<string, string>>;

interface Logic {
  scopeProgressOf: (state: unknown) => unknown;
  textDigest: (value: string) => string;
  KNOWN_CONTRACT_VERSION: number;
  runDateOf: (state: unknown) => string | null;
  awaitingOf: (state: unknown) => { since: string; kind: string; note: string | null } | null;
  tabTitle: (state: unknown, language?: string) => string;
  CONDITION_ORDER: string[];
  conditionOf: (state: unknown) => { condition: string; reason: string; stageId: string | null };
  stripOf: (state: unknown) => Array<{
    id: string; status: string; current: boolean; from: string | null; until: string | null;
  }>;
  inFlightOf: (state: unknown) => Record<'running' | 'review' | 'repair', Array<{ id: string; title: string | null }>>;
  AWAITING_KINDS: string[];
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
  closureOf: (state: unknown) => {
    defects: Record<string, { verified: number; open: number }>;
    budget: { used: number; total: number; decision: string | null };
    readiness: { status: string; kinds: string[] };
  } | null;
  verificationOf: (state: unknown) => {
    legacy: boolean; g4: string; outcome?: string; requirementResults: Record<string, string>;
    failedIds: string[]; incompleteIds: string[]; verificationEstablished: boolean;
  };
  formatGap: (ms: unknown, language?: string) => string;
  longestSilence: (marks: number[]) => number | null;
  lastWrite: (state: unknown, marks: number[]) => number | null;
  silenceNotice: (
    state: unknown, now: number, marks: number[], register?: string, language?: string,
  ) => { alarming: boolean; line: string } | null;
  EXPLAIN_ORDER: string[];
  explainStage: (
    id: string, state: unknown, now: number, marks: number[],
    register?: string, language?: string,
  ) => string[];
  stageStanding: (
    stage: unknown, state: unknown, now: number, marks: number[], language?: string,
  ) => string[];
  explain: (
    key: string, state: unknown, now: number, marks: number[],
    register?: string, language?: string,
  ) => string[];
  registerOf: (state: unknown) => string;
  isStopped: (state: unknown) => boolean;
  isStateShape: (value: unknown) => boolean;
  readOutcome: (held: unknown, incoming: unknown) => string;
  rejectionView: (envelope: unknown, held: unknown) => { keepRegions: boolean; suppressSuccess: boolean } | null;
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
  waitSpans: (state: unknown, now: number) => Array<{ from: number; to: number }>;
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
  criticalChain: (tasks: unknown) => string[];
  stopReasonOf: (state: unknown) => string | null;
  holderOf: (state: unknown) => { token: string; since: string } | null;
  ONE_WAY_ORDER: string[];
  FOLD_AFTER: number;
  foldOf: (lines: string[], open: boolean) => { shown: string[]; hidden: number; folds: boolean };
  handoverOf: (state: unknown) => {
    emptyEnv: string[]; placeholders: string[]; promised: string[];
    oneWay: Record<string, string[]>; unknownOneWay: string[]; assumptions: string[];
    oneWayCount: number; total: number;
  };
  taskDetailOf: (state: unknown, id: string) => Record<string, unknown> | null;
  requirementDetailOf: (state: unknown, id: string) => {
    id: string; status: string; title: string | null; servingTaskIds: string[]; quotes: string[];
    result: string | null; checks: Array<Record<string, string>>; openFindings: string[];
    defects: Array<Record<string, string>>; established: boolean; unreadable: boolean;
  } | null;
  contextClausesOf: (state: unknown) => Array<{ quote: string; reason: string }>;
  additionsOf: (state: unknown) => string[];
  untracedOf: (state: unknown) => { ids: string[]; tone: string };
  toggled: (open: Record<string, boolean>, key: string) => Record<string, boolean>;
  describeTask: (state: unknown, id: string, language?: string) => string[];
  describeRequirement: (state: unknown, id: string, language?: string) => string[];
  estimateMs: (state: unknown, now: number, marks?: number[]) => { low: number; high: number } | null;
  groupByWave: (tasks: unknown) => Array<{ wave: number; tasks: Array<{ id: string }> }>;
  peakParallel: (tasks: unknown, state: unknown, now: number) => number;
  testsOf: (state: unknown) => {
    passed: number; failed: number; source: 'run' | 'task'; taskId?: string; title?: string | null;
  } | null;
  REQUIREMENT_PROGRESS_ORDER: string[];
  requirementProgressOf: (state: unknown) => {
    live: number; built: number; inProgress: number; deferred: number; verified: number | null;
    ids: Record<'built' | 'in-progress' | 'deferred', string[]>;
  };
  taskSquaresOf: (state: unknown) => Array<{ id: string; title: string | null; status: string }>;
  taskReasonOf: (state: unknown, id: string) =>
    { kind: 'sent-back'; text: string } | { kind: 'repair-outcome'; outcome: string } | null;
  waveWaitsOf: (tasks: unknown, group: unknown) => string[];
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

test('V14/V15/V23: dashboard projection matches the state contract across closure states', () => {
  const passing = verifiedState();
  const failed = structuredClone(passing);
  failed.verification!.executions[0]!.result = 'failed';
  failed.gates[3]!.status = 'failed';
  failed.outcome = 'closed_with_exceptions';
  const stale = structuredClone(passing);
  stale.lifecycle = 'active';
  delete stale.outcome;
  delete stale.finishedAt;
  stale.gates[3]!.status = 'pending';
  stale.verification!.checks[0]!.currentFingerprint.build = 'changed-build';
  const promised = structuredClone(passing);
  promised.lifecycle = 'active';
  delete promised.outcome;
  delete promised.finishedAt;
  promised.gates[3]!.status = 'pending';
  promised.verification!.promisedWork.push({ id: 'P-1', description: 'Repeat acceptance', status: 'open' });
  for (const state of [passing, failed, stale, promised]) {
    const browser = L.verificationOf(state);
    const contract = deriveVerification(state);
    assert.equal(browser.g4, contract.g4);
    assert.deepEqual(JSON.parse(JSON.stringify(browser.requirementResults)), contract.requirementResults);
    assert.equal(browser.verificationEstablished,
      state.lifecycle === 'closed' && state.outcome === 'completed' && contract.g4 === 'passed');
  }
  assert.match(String(L.runNotice(failed, 'en')), /Closed with accepted exceptions/);
  assert.match(String(L.runNotice(promised, 'ru')), /G4 pending/);
  const old = run({ contractVersion: 3, finishedAt: STARTED,
    gates: [{ id: 'G4', status: 'failed', findings: ['R01 failed'] }] });
  assert.equal(L.verificationOf(old).verificationEstablished, false);
  assert.match(String(L.runNotice(old, 'en')), /verification not established.*G4: failed/);
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

// --- a rejected candidate, over whatever was accepted before it -------------
//
// sync.mts refuses a write and leaves the last accepted state where it was.
// The page says so, tied to the refused revision — and keeps showing the
// прогон it already read, because that one is still true.

const rejected = { status: 'invalid', candidateRevision: '2026-10-04T16:52:09Z',
  violations: [{ field: 'tasks[T03].status', message: 'task T03 cannot run while blocker T02 is repair' }] };

test('a rejected candidate leaves the accepted прогон on the screen', () => {
  assert.deepEqual(plain(L.rejectionView(rejected, run())), { keepRegions: true, suppressSuccess: false });
});

test('a rejected candidate with nothing accepted before it has nothing to show', () => {
  for (const held of [null, undefined, { runId: 'r1' }]) {
    assert.equal(L.rejectionView(rejected, held)?.keepRegions, false);
  }
});

test('a rejected candidate withdraws a verified success it no longer backs', () => {
  assert.deepEqual(plain(L.rejectionView(rejected, verifiedState())), { keepRegions: true, suppressSuccess: true });
});

test('only a verified completion counts as the success a rejection withdraws', () => {
  // A historical прогон never established verification, so there is no claim
  // to take back; neither is there one in a record the page cannot read, nor
  // in a closure that already names its exceptions.
  const legacy = run({ contractVersion: 1, finishedAt: '2026-08-19T12:00:00.000Z' });
  const unreadable = { ...verifiedState(), verification: { version: 2 } };
  const excepted = { ...verifiedState(), outcome: 'closed_with_exceptions' };
  for (const held of [legacy, unreadable, excepted]) {
    assert.deepEqual(plain(L.rejectionView(rejected, held)), { keepRegions: true, suppressSuccess: false });
  }
});

test('an accepted or absent candidate changes nothing', () => {
  assert.equal(L.rejectionView({ ...rejected, status: 'valid', violations: [] }, run()), null);
  assert.equal(L.rejectionView(undefined, run()), null);
  assert.equal(L.rejectionView(null, null), null);
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

test('both registers of both languages name the share in the header, and the Таски card names none', () => {
  const state = bare({ stages: BUILDING, tasks: STALLED });
  const marks = L.collectMarks(state);
  const now = AT('2026-08-19T14:00:00.000Z');
  const share = String(Math.round(L.taskShare(STALLED).share * 100));

  for (const language of ['ru', 'en']) {
    for (const register of ['normal', 'plain']) {
      const header = L.explain('header', state, now, marks, register, language).join(' ');
      assert.match(header, new RegExp(share + '%'),
        `${language}/${register}/header must name the share the band shows`);
      // The band's bar is the one share of the road; a second one on the
      // Таски card was a second rendering of the same number.
      const tasks = L.explain('tasks', state, now, marks, register, language).join(' ');
      assert.doesNotMatch(tasks, /%/, `${language}/${register}/tasks still names a share of the way`);
      for (const said of [header, tasks]) {
        assert.ok(!/три четверти|three quarters/.test(said),
          `${language}/${register} still describes the scale it no longer uses`);
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
      for (const key of ['header', 'tasks']) {
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
  assert.equal(L.EXPLAIN_ORDER.length, 12);
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
  // Gates: one passed, one failed, out of the two recorded so far.
  assert.match(L.explain('gates', state, NOW, marks)[1]!, /Пройдено 1, провалено 1 из 2/);
  // The coverage under G2: R04 is dropped, so the denominator is three rather than four.
  assert.ok(L.explain('gates', state, NOW, marks).some(line => /2 из 3/.test(line)));
  // Ваш ход: a placeholder and an empty variable, totalled, and never the secret's value.
  assert.match(L.explain('handover', state, NOW, marks)[1]!, /Всего 2/);
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
  assert.ok(L.explain('gates', state, NOW, marks, 'plain').some(line => /2 из 3/.test(line)));
  assert.match(L.explain('gates', state, NOW, marks, 'plain')[1]!, /Пройдено 1, провалено 1 из 2/);
  assert.match(L.explain('handover', state, NOW, marks, 'plain')[1]!, /Всего 2/);
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

test('a contract-7 state with polish on renders no доводка chip, and no dials text names it', () => {
  // The finish dial was retired in contract 8; a contract-7 прогон may still
  // carry `polish: true`, and the page reads nothing of it.
  const state = { ...busy(), contractVersion: 7, polish: true };
  for (const language of ['ru', 'en']) {
    assert.equal(L.L10N[language]!['POLISH'], undefined);
    assert.equal(L.L10N[language]!['UI']!['polishChip'], undefined);
    for (const register of ['normal', 'plain']) {
      const text = L.explain('dials', state, NOW, [], register, language).join('\n');
      assert.doesNotMatch(text, /доводк|polish/i);
    }
  }
  assert.doesNotMatch(html, /state\.polish/);
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

test('an alarming silence says what restarts the прогон, in both registers and both languages', () => {
  // The notice that named a stall and stopped there: the прогон this rule came
  // from sat twenty-six minutes in брифинг with its clock running, and the page
  // said only that the work may have stopped. A reader who knows something is
  // wrong and not what to do about it is no better off than one who does not.
  const state = run({ updatedAt: '2026-08-19T10:00:00.000Z' });
  const marks = [AT('2026-08-19T09:50:00.000Z'), AT('2026-08-19T10:00:00.000Z')];

  for (const language of ['ru', 'en'] as const) {
    for (const register of ['plain', 'normal'] as const) {
      const notice = L.silenceNotice(state, NOW, marks, register, language);
      assert.equal(notice!.alarming, true);
      assert.match(notice!.line, language === 'ru' ? /в чате?:? / : /in the chat/,
        `the ${register} ${language} alarming notice never names the chat`);
    }
  }

  // The calm notice stays calm: nothing has gone wrong, so nothing is proposed.
  const calm = L.silenceNotice(state, NOW, [], 'plain');
  assert.equal(calm!.alarming, false);
  assert.doesNotMatch(calm!.line, /чат/);
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


// --- every row of the timeline explains itself too --------------------------

test('every стадия explains itself in both languages and both registers', () => {
  for (const language of L.LANGUAGE_ORDER) {
    for (const register of ['normal', 'plain']) {
      for (const id of L.STAGE_ORDER) {
        for (const state of [run(), busy()]) {
          const lines = L.explainStage(id, state, NOW, L.collectMarks(state), register, language);
          assert.ok(lines.length >= 2,
            `${id} says fewer than two lines in ${register}/${language}`);
          for (const line of lines) {
            assert.equal(typeof line, 'string');
            assert.ok(line.trim().length > 0, `${id} produced a blank line`);
          }
        }
      }
    }
  }
});

test('a стадия explanation says what the стадия does before what it is doing', () => {
  // The first line is the job and is the same in every прогон; everything after
  // it is read from this one. A стадия that opened with its own clock would be
  // an i that answers a question nobody pressed it to ask.
  const state = busy();
  const [what, standing] = L.explainStage('build', state, NOW, L.collectMarks(state), 'normal', 'ru');
  assert.match(what!, /Разработка/);
  assert.match(standing!, /Этап «Разработка»/);
  assert.match(L.explainStage('build', state, NOW, [], 'normal', 'en')[0]!, /Development/);
});

test('a стадия quotes the clock its own row shows', () => {
  const state = busy();
  const marks = L.collectMarks(state);
  const stage = L.orderedStages(state).find((row) => row.id === 'plan') as
    { id: string; status: string; startedAt?: string; finishedAt?: string };
  const drawn = L.formatDuration(
    L.worked(stage.startedAt!, state, NOW, stage.finishedAt, marks));
  // The row and the popover are two readings of one number, and a page whose
  // own two answers differ has stopped being a record.
  assert.ok(L.explainStage('plan', state, NOW, marks, 'normal', 'ru')[1]!.includes(drawn));
});

test('a failed стадия carries the findings of the check that failed after it', () => {
  const state = run({
    stages: [
      { id: 'preflight', status: 'done', startedAt: STARTED, finishedAt: '2026-08-19T10:05:00.000Z' },
      { id: 'briefing', status: 'failed', startedAt: '2026-08-19T10:05:00.000Z',
        finishedAt: '2026-08-19T10:20:00.000Z', note: 'ответы не сошлись' },
    ],
    gates: [{ id: 'G1', status: 'failed', findings: ['R03 остался без ответа', { id: 'R04' }] }],
  });
  const said = L.explainStage('briefing', state, NOW, L.collectMarks(state), 'normal', 'ru');
  assert.match(said.join(' | '), /Заметка этапа: ответы не сошлись/);
  assert.match(said.join(' | '), /R03 остался без ответа/);
  // A finding written as a record rather than a string is shown as written —
  // never as [object Object], which is the one thing a findings list must not say.
  assert.match(said.join(' | '), /\{"id":"R04"\}/);
  assert.doesNotMatch(said.join(' | '), /\[object Object\]/);
});

test('a стадия the прогон never wrote is explained as waiting, not as missing', () => {
  // orderedStages fills the gaps, so the eight rows are always eight rows —
  // and an i on a row the state has not reached yet still has to open.
  const lines = L.explainStage('acceptance', run(), NOW, [], 'plain', 'ru');
  assert.ok(lines.length >= 2);
  assert.match(lines[1]!, /Ожидает|ожидает/);
});

test('an id no registry holds returns nothing rather than throwing', () => {
  // `polish` was a phase and never a стадия, and it is retired now: the
  // timeline never draws it and no registry holds it.
  assert.equal(L.explainStage('polish', run(), NOW, [], 'normal', 'ru').length, 0);
  assert.equal(L.explainStage('', run(), NOW, [], 'plain', 'en').length, 0);
});

test('v5 dashboard shares frozen scope and completion blockers with TypeScript', () => {
  const state = deferredScopeState();
  const progress = projectState(state).scopeProgress;
  assert.deepEqual(JSON.parse(JSON.stringify(L.scopeProgressOf(state))), progress);
  for (const language of ['ru', 'en']) {
    const rows = (L.words(language).UI!['scopeRows'] as unknown as (value: unknown) => string[])(progress);
    assert.match(rows[0]!, /18\/20/); assert.match(rows[1]!, /18\/18/);
    assert.equal(rows.filter(row => row.includes('18/20')).length, 1);
  }
  const states = [state, controlledState(), sourceVerifiedState(), correctedSourceAuditState()];
  const contradicted = correctedSourceAuditState();
  contradicted.verification!.manifestAudits.push({ ...contradicted.verification!.manifestAudits[1]!, id: 'MA-3',
    result: 'failed', findings: ['A later audit contradicts the pass'], dispatchId: 'dispatch-3', readerId: 'reader-3',
    returnId: 'return-3', auditedAt: '2026-09-29T09:03:00Z' }); states.push(contradicted);
  const missingAudit = sourceVerifiedState(); delete missingAudit.verification!.manifestAudits[0]!.returnId;
  states.push(missingAudit);
  const unavailable = controlledState(); unavailable.verification!.negativeControls[0]!.result = 'unavailable';
  states.push(unavailable);
  const stale = controlledState(); stale.verification!.checks[0]!.oracle = 'new oracle'; states.push(stale);
  const staleInput = sourceVerifiedState(); staleInput.verification!.acceptanceInputDigest = 'new input'; states.push(staleInput);
  const journey = sourceVerifiedState(); journey.verification!.journeys.push({ id: 'J-1', requirementIds: ['R01'],
    obligationIds: ['O-1'], checkIds: ['C-1'], fixture: 'clean', variantIds: ['desktop'],
    steps: [{ action: 'restart', assertion: 'saved entry survives restart' }], integrationDependencies: ['01'],
    executionTaskId: '01', targetRevision: 1, reset: 'reset', cleanup: 'cleanup' }); states.push(journey);
  for (const candidate of states) {
    const actual = L.verificationOf(candidate);
    assert.equal(actual.g4, deriveVerification(candidate).g4);
    assert.deepEqual(JSON.parse(JSON.stringify(L.scopeProgressOf(candidate))), projectState(candidate).scopeProgress);
  }
});

test('standalone UTF-8 digest matches source/oracle hashes including Russian and emoji', () => {
  for (const value of ['', 'abc', 'Не больше трёх 😀', JSON.stringify([['Save'], 'persist', []])]) {
    assert.equal(L.textDigest(value), sha256(value));
  }
});

const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
const ui = (language: 'ru' | 'en') => L.L10N[language]!['UI'] as unknown as Record<string, (value: unknown) => string>;

test('C04: a verified defect shows beside a таск that stays in repair, and moves no share', () => {
  const state = repairContract6State();
  const before = plain(L.taskShare(state.tasks));
  state.verification!.defects[0]!.status = 'verified';
  const closure = L.closureOf(state)!;
  assert.deepEqual(plain(closure.defects), { '01': { verified: 1, open: 0 } });
  assert.equal(L.label(L.L10N.ru['TASK_STATUS']!, state.tasks[0]!.status), 'На исправлении');
  assert.equal(ui('ru')['taskDefects']!(closure.defects['01']), 'Дефекты: подтверждено 1, открыто 0');
  assert.equal(ui('en')['taskDefects']!(closure.defects['01']), 'Defects: verified 1, open 0');
  assert.deepEqual(plain(L.taskShare(state.tasks)), before);
});

test('C04: the Таски card reads attempts used of the limit and the latest strategy decision', () => {
  const state = repairContract6State();
  state.verification!.repairAttempts = [v3Attempt('RA-1', 'F-1', 'DF-1', '2026-09-29T09:20:00Z')];
  state.verification!.strategyReviews = [
    strategyReview('SR-1', '2026-09-29T09:30:00Z'),
    strategyReview('SR-2', '2026-09-29T09:40:00Z', { decision: 'request_limit' }),
  ];
  const closure = L.closureOf(state)!;
  assert.deepEqual(plain(closure.budget), { used: 1, total: 20, decision: 'request_limit' });
  assert.equal(ui('ru')['repairBudget']!(closure.budget), 'Попытки исправления: 1/20 · Решение по стратегии: Запросить попытки');
  assert.equal(ui('en')['repairBudget']!(closure.budget), 'Repair attempts: 1/20 · Strategy decision: Ask for more attempts');
});

test('C04: readiness reads the latest unsuperseded record and names the probes that did not pass', () => {
  const state = repairContract6State();
  const first = state.verification!.readiness[0]!;
  state.verification!.readiness = [first, { ...first, id: 'RD-2', supersedes: 'RD-1', executedAt: '2026-09-29T09:50:00Z',
    probes: [{ kind: 'bootstrap', result: 'setup_failed', evidenceIds: [], limitation: 'autoloader missing' },
      { kind: 'database', result: 'unavailable', evidenceIds: [], limitation: 'no server' }] }];
  const closure = L.closureOf(state)!;
  assert.deepEqual(plain(closure.readiness), { status: 'setup_failed', kinds: ['bootstrap'] });
  assert.equal(ui('ru')['readinessRow']!(closure.readiness), 'Готовность к проверке: Ошибка настройки (bootstrap).');
  assert.equal(ui('en')['readinessRow']!(plain(L.closureOf(repairContract6State())!.readiness)), 'Readiness: Passed.');
});

test('C04: a contract-5 page has no defects, budget or readiness to render', () => {
  assert.equal(L.closureOf(controlledState()), null);
  assert.equal(L.closureOf(sourceVerifiedState()), null);
});

test('a frozen page says the clocks stopped and what to ask for, in both languages', () => {
  // Naming the cause alone leaves the reader unable to tell waiting from
  // acting. The request it names is the one --reopen already answers, and it
  // points at the chat rather than an «агент», a word the glossary keeps off
  // the page.
  assert.equal(ui('ru')['snapshotOnly']!('state.js'),
    'Показан снимок внутри страницы: state.js рядом не читается, поэтому часы остановлены.'
    + ' Если прогон ещё идёт, попросите в чате вернуть дашборд.');
  assert.equal(ui('en')['snapshotOnly']!('state.js'),
    'Showing the snapshot inside this page: state.js beside it cannot be read, so the clocks have stopped.'
    + ' If the run is still going, ask in the chat to bring the dashboard back.');
});

type Title = (slug: string, date: string | null) => string;
const titleIn = (language: string): Title => L.words(language)['UI']!['title'] as unknown as Title;

test('a contract-7 title names the slug and the day the run started', () => {
  const state = { slug: 'landing-page', dir: '2026-09-29-landing-page--wip' };
  assert.equal(L.runDateOf(state), '2026-09-29');
  assert.equal(titleIn('ru')(state.slug, L.runDateOf(state)), 'Прогон: landing-page · 2026-09-29');
  assert.equal(titleIn('en')(state.slug, L.runDateOf(state)), 'Run: landing-page · 2026-09-29');
});

test('a state without a parseable dir keeps the slug-only title', () => {
  for (const state of [{ slug: 'landing-page' }, { slug: 'landing-page', dir: 'landing-page' }, null]) {
    assert.equal(L.runDateOf(state), null);
  }
  assert.equal(titleIn('ru')('landing-page', L.runDateOf({ slug: 'landing-page' })), 'Прогон: landing-page');
});

// --- what the state already holds, now on the page ---------------------------

test('a stopped run\'s reason is read as written, and a record is shown rather than [object Object]', () => {
  const stopped = (extra: Record<string, unknown>) => bare({ finishedAt: '2026-08-19T10:40:00.000Z', ...extra });
  assert.equal(L.stopReasonOf(stopped({ stopReason: 'The schema task never closed' })), 'The schema task never closed');
  assert.equal(L.stopReasonOf(stopped({ stopReason: { why: 'budget' } })), '{"why":"budget"}');
  assert.equal(L.stopReasonOf(stopped({})), null);
  assert.equal(L.stopReasonOf(stopped({ stopReason: '   ' })), null);
  assert.equal(ui('ru')['stopReasonLine']!('бюджет исчерпан'), 'Причина остановки: бюджет исчерпан');
  assert.equal(ui('en')['stopReasonLine']!('budget spent'), 'Why it stopped: budget spent');
});

test('a reason on a run still in motion is not shown, because no closure notice stands beside it', () => {
  assert.equal(L.stopReasonOf(bare({ stopReason: 'The schema task never closed' })), null);
  assert.equal(L.stopReasonOf(bare({ stopReason: 'budget', interruptedAt: '2026-08-19T10:40:00.000Z' })), 'budget');
  assert.equal(L.stopReasonOf(bare({ stopReason: 'budget', lifecycle: 'closed' })), 'budget');
});

test('a group folds past five lines, and an opened one shows them all', () => {
  const six = ['a', 'b', 'c', 'd', 'e', 'f'];
  assert.deepEqual(plain(L.foldOf(six, false)), { shown: ['a', 'b', 'c', 'd', 'e'], hidden: 1, folds: true });
  assert.deepEqual(plain(L.foldOf(six, true)), { shown: six, hidden: 0, folds: true });
  assert.deepEqual(plain(L.foldOf(six.slice(0, 5), false)), { shown: six.slice(0, 5), hidden: 0, folds: false });
});

test('a finished or interrupted run never names its holder, however long it has been quiet', () => {
  for (const extra of [{ finishedAt: '2026-08-19T10:40:00.000Z' }, { interruptedAt: '2026-08-19T10:40:00.000Z' }]) {
    const state = run({ heldBy: { token: 'k7f2', since: '2026-08-19T10:00:00.000Z' }, ...extra });
    const notice = L.silenceNotice(state, AT('2026-08-20T11:15:00.000Z'), L.collectMarks(state));
    assert.ok(!notice || !/k7f2/.test(notice.line));
  }
});

test('the plain register names the holder in words, without the label', () => {
  const state = run({ heldBy: { token: 'k7f2', since: '2026-08-19T10:00:00.000Z' } });
  const marks = L.collectMarks(state);
  const ru = L.silenceNotice(state, AT('2026-08-19T11:15:00.000Z'), marks, 'plain', 'ru')!.line;
  assert.match(ru, /сессия чата с меткой k7f2/);
  assert.doesNotMatch(ru, /Метка прогона:/);
  const en = L.silenceNotice(state, AT('2026-08-19T11:15:00.000Z'), marks, 'plain', 'en')!.line;
  assert.match(en, /chat session marked k7f2/);
  assert.doesNotMatch(en, /Run claim:/);
});

test('a malformed claim names no holder', () => {
  assert.equal(L.holderOf(bare()), null);
  assert.equal(L.holderOf(bare({ heldBy: { token: '', since: '2026-08-19T10:00:00.000Z' } })), null);
  assert.equal(L.holderOf(bare({ heldBy: { token: 'k7f2', since: 'yesterday-ish' } })), null);
  assert.equal(L.holderOf(bare({ heldBy: 'k7f2' })), null);
  assert.deepEqual(plain(L.holderOf(bare({ heldBy: { token: 'k7f2', since: '2026-08-19T10:00:00.000Z' } }))),
    { token: 'k7f2', since: '2026-08-19T10:00:00.000Z' });
});

test('the claim is named in the raised silence notice and never in the calm one', () => {
  const state = run({ heldBy: { token: 'k7f2', since: '2026-08-19T10:00:00.000Z' } });
  const marks = L.collectMarks(state);
  const raised = L.silenceNotice(state, AT('2026-08-19T11:15:00.000Z'), marks);
  assert.ok(raised);
  assert.equal(raised.alarming, true);
  assert.match(raised.line, /Метка прогона: k7f2 с 2026-08-19 \d\d:\d\d\.$/);
  const english = L.silenceNotice(state, AT('2026-08-19T11:15:00.000Z'), marks, 'normal', 'en');
  assert.match(english!.line, /Run claim: k7f2 since 2026-08-19 \d\d:\d\d\.$/);
  const calm = L.silenceNotice(state, AT('2026-08-19T10:35:00.000Z'), marks);
  assert.equal(calm!.alarming, false);
  assert.doesNotMatch(calm!.line, /k7f2/);
});

test('handover gathers what only the user can settle, and the Долг card counts the same lists', () => {
  const state = structuredClone(verifiedState()) as unknown as Record<string, unknown> & ReturnType<typeof verifiedState>;
  state.debt = { placeholders: ['price of the large plan'], assumptions: ['English copy', { quote: 'x' } as unknown as string],
    emptyEnv: ['STRIPE_KEY'] };
  state.oneWay = ['deleted — src/old.js — 01 abc1234', 'migration — users table — 02 def5678',
    'renamed — header.js → masthead.js — 01 abc1234', 'teleported — somewhere — 03 0000000'];
  state.verification!.promisedWork = [
    { id: 'P-1', description: 'Wire the contact form', status: 'open' },
    { id: 'P-2', description: 'Already wired', status: 'done' },
  ];
  const handover = plain(L.handoverOf(state));
  assert.deepEqual(handover, {
    emptyEnv: ['STRIPE_KEY'],
    placeholders: ['price of the large plan'],
    promised: ['Wire the contact form'],
    oneWay: {
      deleted: ['src/old.js — 01 abc1234'],
      migration: ['users table — 02 def5678'],
      renamed: ['header.js → masthead.js — 01 abc1234'],
    },
    unknownOneWay: ['teleported — somewhere — 03 0000000'],
    assumptions: ['English copy', '{"quote":"x"}'],
    oneWayCount: 4,
    total: 9,
  });
});

test('promised work is read only where the record carries it, from contract 4', () => {
  const older = bare({ contractVersion: 3, verification: { promisedWork: [{ id: 'P-1', description: 'x', status: 'open' }] } });
  assert.deepEqual(plain(L.handoverOf(older).promised), []);
  assert.equal(L.handoverOf(bare()).total, 0);
});

test('the critical chain is the rows the card counts, earliest first', () => {
  const tasks = [
    task('01', { status: 'done' }),
    task('02', { blockedBy: ['01'] }),
    task('03', { blockedBy: ['02'] }),
    task('04'),
  ];
  assert.deepEqual(plain(L.criticalChain(tasks)), ['02', '03']);
  assert.equal(L.criticalPath(tasks), L.criticalChain(tasks).length);
  const cycle = [task('01', { blockedBy: ['02'] }), task('02', { blockedBy: ['01'] })];
  assert.equal(L.criticalPath(cycle), L.criticalChain(cycle).length);
  assert.ok(L.criticalChain(cycle).length >= 1);
  assert.deepEqual(plain(L.criticalChain([])), []);
});

test('an opened таск shows what the state holds and leaves out what it does not', () => {
  const state = bare({
    tasks: [
      task('01', { status: 'done', files: ['src/a.js'], zone: ['src'], commits: ['abcdef0123', '1234567890'],
        retries: 1, handoffs: 2, tests: { passed: 4, failed: 0 } }),
      task('02', { blockedBy: ['01'] }),
      { id: '03', title: 'bare', requirementIds: [], status: 'queued', blockedBy: [] },
    ],
  });
  const first = plain(L.taskDetailOf(state, '01')) as Record<string, unknown>;
  assert.deepEqual(first['commits'], ['abcdef0', '1234567']);
  assert.equal(first['handoffs'], 2);
  assert.equal(first['onCriticalPath'], false);
  const sparse = plain(L.taskDetailOf(state, '03')) as Record<string, unknown>;
  for (const absent of ['files', 'zone', 'commits', 'retries', 'repairs', 'handoffs', 'tests', 'requirementIds']) {
    assert.ok(!(absent in sparse), `${absent} is shown for a таск that never carried it`);
  }
  assert.equal(L.taskDetailOf(state, '99'), null);

  const waiting = L.describeTask(state, '02', 'ru');
  assert.ok(waiting.includes('На критическом пути'));
  assert.ok(waiting.includes('Ждёт тасков: 01'));
  const done = L.describeTask(state, '01', 'en');
  assert.ok(done.includes('Passed to a fresh subagent: 2 — not a defect'));
  assert.ok(L.describeTask(state, '01', 'ru').includes('Передачи свежему субагенту: 2 — это не дефект'));
  assert.ok(done.includes('Saved in history: abcdef0, 1234567'));
  assert.ok(done.includes('Tests: 4 passed, 0 failed'));
  assert.ok(!done.some(line => line.includes('[object Object]')));
});

test('a таск written before commits became a list shows its one commit', () => {
  const state = bare({ tasks: [{ id: '01', title: 'old', requirementIds: ['R01'], status: 'done', blockedBy: [],
    commit: 'abcdef0999' }] });
  assert.deepEqual((plain(L.taskDetailOf(state, '01')) as Record<string, unknown>)['commits'], ['abcdef0']);
});

test('a требование before contract 4 shows its таски and says verification is not established', () => {
  const state = bare({ contractVersion: 3, requirements: [{ id: 'R01', status: 'in-spec' }], tasks: [task('01')] });
  const detail = L.requirementDetailOf(state, 'R01')!;
  assert.equal(detail.established, false);
  assert.deepEqual(plain(detail.servingTaskIds), ['01']);
  assert.deepEqual(plain(L.describeRequirement(state, 'R01', 'ru')),
    ['Таски требования: 01', 'Проверка не установлена.']);
  assert.equal(L.requirementDetailOf(state, 'R99'), null);
});

test('a contract-4 требование shows its checks with the result its own result is derived from', () => {
  const detail = L.requirementDetailOf(verifiedState(), 'R01')!;
  assert.equal(detail.established, true);
  assert.equal(detail.result, 'passed');
  assert.deepEqual(plain(detail.quotes), []);
  assert.deepEqual(plain(detail.checks), [{ id: 'C-1', method: 'browser-interaction', result: 'passed' }]);
  assert.deepEqual(plain(L.describeRequirement(verifiedState(), 'R01', 'en')),
    ['Tasks for it: 01', 'How it was checked:', 'C-1 · browser-interaction — Passed']);
});

test('from contract 5 the требование quotes the user\'s words in the language they were said in', () => {
  const state = sourceVerifiedState();
  const detail = L.requirementDetailOf(state, 'R01')!;
  assert.deepEqual(plain(detail.quotes), ['Не сохранять больше 3 записей. Меню открывается при наведении.']);
  assert.equal(L.describeRequirement(state, 'R01', 'en')[0],
    'In your words: «Не сохранять больше 3 записей. Меню открывается при наведении.»');
});

test('a contract-6 требование shows its open findings, failure cause and live defects only', () => {
  const state = repairContract6State();
  state.verification!.executions[0] = { ...state.verification!.executions[0]!, result: 'failed', failureCause: 'product',
    limitation: 'only desktop was checked' };
  state.verification!.defects.push({ ...state.verification!.defects[0]!, id: 'DF-0', status: 'superseded' });
  const detail = L.requirementDetailOf(state, 'R01')!;
  assert.equal(detail.result, 'failed');
  assert.deepEqual(plain(detail.openFindings), ['Reviewer finding F-1']);
  assert.deepEqual(plain(detail.defects.map(item => item['id'])), ['DF-1']);
  const lines = L.describeRequirement(state, 'R01', 'en');
  assert.ok(lines.includes('C-1 · browser-interaction — Did not pass · Fault in the product · only desktop was checked'));
  assert.ok(lines.includes('Open findings:'));
  assert.ok(lines.includes('DF-1 — Open · Product: Hovering the trigger leaves the panel hidden'));
});

test('an unreadable record shows no partial chain', () => {
  const state = structuredClone(verifiedState()) as unknown as Record<string, Record<string, unknown>>;
  state['verification']!['obligations'] = null;
  const detail = L.requirementDetailOf(state, 'R01')!;
  assert.equal(detail.unreadable, true);
  assert.deepEqual(plain(detail.checks), []);
  assert.deepEqual(plain(L.describeRequirement(state, 'R01', 'ru')),
    ['Таски требования: 01', 'Запись проверки не читается.']);
});

test('the user\'s words classified as context are listed with their reason', () => {
  const state = sourceVerifiedState();
  const clause = state.verification!.sourceClauses[0]!;
  state.verification!.sourceClauses.push({ ...clause, id: 'CL-9', quote: 'Когда-нибудь хочу тёмную тему',
    classification: 'context', requirementIds: [], exclusionReason: 'A wish for later, not for this run' });
  assert.deepEqual(plain(L.contextClausesOf(state)),
    [{ quote: 'Когда-нибудь хочу тёмную тему', reason: 'A wish for later, not for this run' }]);
  assert.equal(ui('ru')['contextLine']!(L.contextClausesOf(state)[0]),
    '«Когда-нибудь хочу тёмную тему» — A wish for later, not for this run');
  assert.deepEqual(plain(L.contextClausesOf(verifiedState())), []);
});

test('what was delivered beyond the ask is shown as written', () => {
  assert.deepEqual(plain(L.additionsOf(bare({ additions: ['A favicon (R03)', { what: 'x' }] }))),
    ['A favicon (R03)', '{"what":"x"}']);
  assert.deepEqual(plain(L.additionsOf(bare())), []);
});

test('a live требование no таск names is marked, in the failure tone only until the plan check passes', () => {
  const requirements = [{ id: 'R01', status: 'in-spec' }, { id: 'R02', status: 'in-spec' },
    { id: 'R03', status: 'dropped', reason: 'withdrawn' }];
  assert.deepEqual(plain(L.untracedOf(bare({ requirements }))), { ids: [], tone: 'quiet' });
  const planned = bare({ requirements, tasks: [task('01')] });
  assert.deepEqual(plain(L.untracedOf(planned)), { ids: ['R02'], tone: 'fail' });
  const passed = bare({ requirements, tasks: [task('01')], gates: [{ id: 'G3', status: 'passed', findings: [] }] });
  assert.deepEqual(plain(L.untracedOf(passed)), { ids: ['R02'], tone: 'quiet' });
});

test('an opened row is remembered by key, and toggling never edits the set it was given', () => {
  const none = {};
  const one = L.toggled(none, 'task:01');
  assert.deepEqual(plain(one), { 'task:01': true });
  assert.deepEqual(plain(none), {});
  assert.deepEqual(plain(L.toggled(L.toggled(one, 'req:R01'), 'task:01')), { 'req:R01': true });
});

test('a прогон stopped on a question is waiting, and the wait is never raised however long it lasts', () => {
  const state = run({ awaiting: { kind: 'answer', since: '2026-08-19T10:30:00.000Z' } });
  const marks = L.collectMarks(state);
  const notice = L.silenceNotice(state, AT('2026-08-19T14:00:00.000Z'), marks);
  assert.ok(notice);
  assert.equal(notice.alarming, false);
  assert.match(notice.line, /^Ждёт вашего ответа в чате с 2026-08-19 \d\d:\d\d\. /);
  const english = L.silenceNotice(state, AT('2026-08-19T14:00:00.000Z'), marks, 'plain', 'en');
  assert.match(english!.line, /^Waiting for your reply in the chat since 2026-08-19 \d\d:\d\d\. /);
});

test('without awaiting, or with one no reader can parse, the ordinary silence rule applies', () => {
  const plainRun = run();
  const raised = L.silenceNotice(plainRun, AT('2026-08-19T11:15:00.000Z'), L.collectMarks(plainRun));
  assert.equal(raised!.alarming, true);
  const broken = run({ awaiting: { kind: 'answer', since: 'after lunch' } });
  assert.equal(L.awaitingOf(broken), null);
  assert.equal(L.silenceNotice(broken, AT('2026-08-19T11:15:00.000Z'), L.collectMarks(broken))!.alarming, true);
});

test('a finished or closed run never shows the wait', () => {
  assert.equal(L.awaitingOf(run({ awaiting: { kind: 'answer', since: '2026-08-19T10:30:00.000Z' }, finishedAt: '2026-08-19T10:40:00.000Z' })), null);
  assert.equal(L.awaitingOf(run({ awaiting: { kind: 'answer', since: '2026-08-19T10:30:00.000Z' }, lifecycle: 'closed' })), null);
  assert.equal(L.awaitingOf(run({ awaiting: { kind: 'answer', since: '2026-08-19T10:30:00.000Z' }, interruptedAt: '2026-08-19T10:40:00.000Z' })), null);
});

test('the title never replaces the user\'s quoted words', () => {
  const state = sourceVerifiedState();
  state.requirements[0] = { ...state.requirements[0]!, title: 'Keep three entries; open on hover' };
  const detail = L.requirementDetailOf(state, 'R01')!;
  assert.equal(detail.title, 'Keep three entries; open on hover');
  assert.equal(detail.quotes.length, 1);
  const older = bare({ contractVersion: 3, requirements: [{ id: 'R01', status: 'in-spec', title: 'Hero names the product' }] });
  assert.equal(L.requirementDetailOf(older, 'R01')!.title, 'Hero names the product');
  assert.equal(L.requirementDetailOf(bare({ requirements: [{ id: 'R01', status: 'in-spec', title: '  ' }] }), 'R01')!.title, null);
});

test('the reconstructed domtut_copy run renders through every new reader without a throw or a type name', () => {
  // The fixture is the repository's reconstruction of the run the
  // retrospective described: 22 таски, one upstream schema task in repair, a
  // downstream task blocked on it, fifteen defects. It is the most crowded state
  // this repository holds, which is why it is the end-to-end case here.
  const state = retrospectiveState() as unknown as Record<string, unknown> & ReturnType<typeof retrospectiveState>;
  state.lifecycle = 'closed';
  state.outcome = 'stopped_incomplete';
  state.stopReason = 'The schema task never closed; 20 repair attempts verified no task';
  state.finishedAt = '2026-09-29T11:00:00Z';
  state.debt = { placeholders: ['company phone'], assumptions: ['orders sorted newest first'], emptyEnv: ['DATABASE_URL'] };
  state.oneWay = ['migration — orders.total renamed — 02 0a0a0a0'];

  const seen: string[] = [];
  const say = (lines: string[]): void => { seen.push(...lines); };
  for (const language of ['ru', 'en']) {
    say([L.runNotice(state, language) ?? '']);
    for (const item of state.tasks) say(L.describeTask(state, item.id, language));
    for (const requirement of state.requirements) say(L.describeRequirement(state, requirement.id, language));
    for (const key of L.EXPLAIN_ORDER) {
      for (const register of ['normal', 'plain']) say(L.explain(key, state, NOW, L.collectMarks(state), register, language));
    }
  }
  assert.equal(L.stopReasonOf(state), 'The schema task never closed; 20 repair attempts verified no task');
  assert.equal(L.handoverOf(state).total, 4);
  assert.deepEqual(plain(L.criticalChain(state.tasks)), ['02', '04', '05']);
  assert.equal(L.criticalPath(state.tasks), 3);
  assert.equal(L.requirementDetailOf(state, 'R01')!.defects.length, 15);
  assert.ok(seen.length > 100);
  for (const line of seen) {
    assert.equal(typeof line, 'string');
    assert.ok(!line.includes('[object Object]'), `a type name reached the page: ${line}`);
    assert.ok(!line.includes('undefined'), `an absent value reached the page: ${line}`);
  }
});

// Waiting for the user stops the clocks, from contract 9. The closed waits and
// the open one are cut out of every span before the marks-and-ceiling rule
// measures what is left, so a wait is subtracted whole and never capped.

const T = (hhmm: string): string => `2026-08-19T${hhmm}:00.000Z`;
/** One mark every ten minutes from 10:00 to 11:20, so the ceiling never bites. */
const DENSE = Array.from({ length: 9 }, (_, i) => AT(T(`1${Math.floor(i / 6)}:${String((i % 6) * 10).padStart(2, '0')}`)));

test('below contract 9 an open wait leaves today\'s arithmetic alone', () => {
  const state = bare({ contractVersion: 8, awaiting: { kind: 'answer', since: T('10:20') } });
  assert.deepEqual(plain(L.waitSpans(state, AT(T('11:20')))), []);
  assert.equal(L.worked(STARTED, state, AT(T('11:20')), undefined, DENSE), 80 * MIN);
});

test('a contract-9 run that never waited keeps today\'s arithmetic', () => {
  const state = bare({ contractVersion: 9 });
  assert.deepEqual(plain(L.waitSpans(state, AT(T('11:20')))), []);
  assert.equal(L.worked(STARTED, state, AT(T('11:20')), undefined, DENSE), 80 * MIN);
});

test('a closed wait of twenty minutes inside a stage takes twenty minutes off its clock', () => {
  const stage = { id: 'build', status: 'done', startedAt: STARTED, finishedAt: T('11:00') };
  const before = bare({ contractVersion: 9, stages: [stage] });
  const after = bare({ contractVersion: 9, stages: [stage], waits: [{ since: T('10:20'), until: T('10:40') }] });
  const now = AT(T('11:20'));
  assert.equal(L.worked(STARTED, before, now, stage.finishedAt, DENSE), 60 * MIN);
  assert.equal(L.worked(STARTED, after, now, stage.finishedAt, DENSE), 40 * MIN);
});

test('a closed wait of fifty minutes is subtracted whole, never capped at the ceiling', () => {
  const state = bare({ contractVersion: 9, waits: [{ since: T('10:10'), until: T('11:00') }] });
  assert.equal(L.worked(STARTED, state, AT(T('11:20')), T('11:20'), DENSE), 30 * MIN);
  // With only its edges for marks, the run shows the ten minutes before the
  // wait and the twenty after it — the wait's own edges split the long gap.
  assert.equal(L.worked(STARTED, state, AT(T('11:20')), T('11:20'), [AT(STARTED), AT(T('11:20'))]), 30 * MIN);
});

test('an open wait freezes the clock from the moment it was asked', () => {
  const state = bare({ contractVersion: 9, updatedAt: T('10:30'), awaiting: { kind: 'spec-gate', since: T('10:30') } });
  const marks = L.collectMarks(state);
  const early = L.worked(STARTED, state, AT(T('10:50')), undefined, marks);
  const late = L.worked(STARTED, state, AT(T('16:00')), undefined, marks);
  assert.equal(early, 30 * MIN);
  assert.equal(late, 30 * MIN);
  assert.equal(L.elapsed(STARTED, state, AT(T('16:00'))), 6 * 60 * MIN);
});

test('waits inside two finished таски lower the median and the estimate', () => {
  const task = (id: string, startedAt: string, finishedAt: string | undefined, status: string): Record<string, unknown> =>
    ({ id, status, blockedBy: [], startedAt, ...(finishedAt ? { finishedAt } : {}) });
  const tasks = [task('01', T('10:00'), T('10:30'), 'done'), task('02', T('10:30'), T('11:00'), 'done'),
    { id: '03', status: 'queued', blockedBy: [] }];
  const before = bare({ contractVersion: 9, tasks });
  const after = bare({ contractVersion: 9, tasks, waits: [
    { since: T('10:10'), until: T('10:20') }, { since: T('10:40'), until: T('10:50') }] });
  const now = AT(T('11:20'));
  assert.equal(L.medianTaskMs(before, now, DENSE), 30 * MIN);
  assert.equal(L.medianTaskMs(after, now, DENSE), 20 * MIN);
  const was = L.estimateMs(before, now, DENSE)!;
  const is = L.estimateMs(after, now, DENSE)!;
  assert.ok(is.low < was.low && is.high < was.high, `${JSON.stringify(is)} vs ${JSON.stringify(was)}`);
});

test('the spans skip what no reader can parse, run the open wait to the reference time, and merge', () => {
  const state = bare({ contractVersion: 9, waits: [
    { since: T('10:10'), until: T('10:20') }, { since: 'after lunch', until: T('10:30') },
    { since: T('10:50'), until: T('10:40') }, '10:55', { since: T('10:15'), until: T('10:25') }],
  awaiting: { kind: 'answer', since: T('11:00') } });
  assert.deepEqual(plain(L.waitSpans(state, AT(T('11:30')))),
    [{ from: AT(T('10:10')), to: AT(T('10:25')) }, { from: AT(T('11:00')), to: AT(T('11:30')) }]);
});

test('the working-time card says a wait is not counted, in both languages and registers, and only where it is so', () => {
  for (const language of ['ru', 'en']) {
    for (const register of ['plain', 'normal']) {
      const nine = L.explain('elapsed', bare({ contractVersion: 9 }), NOW, [], register, language).join(' ');
      const eight = L.explain('elapsed', bare({ contractVersion: 8 }), NOW, [], register, language).join(' ');
      assert.match(nine, language === 'ru' ? /вашего ответа/ : /your reply/, `${language} ${register}`);
      assert.doesNotMatch(eight, language === 'ru' ? /вашего ответа/ : /your reply/, `${language} ${register}`);
    }
  }
});

// What the page says a прогон waits for, and what the tab says while it does.

const KIND_LINES: Record<string, { ru: RegExp; en: RegExp }> = {
  'answer': { ru: /^Ждёт вашего ответа в чате с /, en: /^Waiting for your reply in the chat since / },
  'briefing-round': { ru: /^Ждёт ваших ответов на вопросы брифинга в чате с /, en: /^Waiting for your answers to the briefing questions in the chat since / },
  'spec-gate': { ru: /^Ждёт вашего одобрения спецификации в чате с /, en: /^Waiting for your approval of the specification in the chat since / },
  'plan-gate': { ru: /^Ждёт вашего одобрения плана в чате с /, en: /^Waiting for your approval of the plan in the chat since / },
  'one-way-action': { ru: /^Ждёт вашего разрешения на необратимое действие в чате с /, en: /^Waiting for your permission for an irreversible action in the chat since / },
  'repair-limit': { ru: /^Попытки исправления исчерпаны: ждёт вашего решения в чате с /, en: /^Repair attempts are spent: waiting for your decision in the chat since / },
};

const asked = (awaiting: Record<string, unknown>): Record<string, unknown> =>
  run({ contractVersion: 9, awaiting: { since: '2026-08-19T10:30:00.000Z', ...awaiting } });

test('each kind of stop says in one sentence what it waits for, in both languages', () => {
  for (const [kind, line] of Object.entries(KIND_LINES)) {
    const state = asked({ kind });
    const marks = L.collectMarks(state);
    const ru = L.silenceNotice(state, AT('2026-08-19T14:00:00.000Z'), marks, 'plain', 'ru')!;
    const en = L.silenceNotice(state, AT('2026-08-19T14:00:00.000Z'), marks, 'plain', 'en')!;
    assert.equal(ru.alarming, false, kind);
    assert.match(ru.line, line.ru, kind);
    assert.match(en.line, line.en, kind);
    assert.match(ru.line, /в чате с 2026-08-19 \d\d:\d\d\. Прогон стоит на вопросе/, kind);
    assert.match(en.line, /in the chat since 2026-08-19 \d\d:\d\d\. The run is stopped on a question/, kind);
  }
});

test('a note is appended after a dash, and one that is not a single line is dropped', () => {
  const noted = asked({ kind: 'spec-gate', note: 'спецификация на 12 разделов' });
  assert.deepEqual(plain(L.awaitingOf(noted)), { since: '2026-08-19T10:30:00.000Z', kind: 'spec-gate', note: 'спецификация на 12 разделов' });
  const line = L.silenceNotice(noted, AT('2026-08-19T14:00:00.000Z'), L.collectMarks(noted), 'plain', 'ru')!.line;
  assert.match(line, /в чате с 2026-08-19 \d\d:\d\d — спецификация на 12 разделов\. /);
  for (const note of ['two\nlines', '   ', 42]) {
    const dropped = asked({ kind: 'spec-gate', note });
    assert.equal(L.awaitingOf(dropped)!.note, null, JSON.stringify(note));
    assert.doesNotMatch(L.silenceNotice(dropped, AT('2026-08-19T14:00:00.000Z'), L.collectMarks(dropped))!.line, / — /);
  }
});

test('an unknown or absent kind reads as an answer', () => {
  for (const awaiting of [{ kind: 'deploy' }, {}]) {
    const state = asked(awaiting);
    assert.equal(L.awaitingOf(state)!.kind, 'answer');
    assert.match(L.silenceNotice(state, AT('2026-08-19T14:00:00.000Z'), L.collectMarks(state))!.line, /^Ждёт вашего ответа в чате с /);
  }
});

test('the tab says the прогон waits for you exactly while it does', () => {
  assert.equal(L.tabTitle(asked({ kind: 'plan-gate' }), 'ru'), '● Ждём вас');
  assert.equal(L.tabTitle(asked({ kind: 'plan-gate' }), 'en'), '● Waiting for you');
  assert.equal(L.tabTitle(run({ awaiting: { kind: 'answer', since: '2026-08-19T10:30:00.000Z' } }), 'ru'), '● Ждём вас');
  assert.equal(L.tabTitle(run(), 'ru'), 'Maestro');
  assert.equal(L.tabTitle(asked({ kind: 'answer', since: 'after lunch' }), 'en'), 'Maestro');
  assert.equal(L.tabTitle(run({ awaiting: { kind: 'answer', since: '2026-08-19T10:30:00.000Z' }, finishedAt: '2026-08-19T10:40:00.000Z' }), 'ru'), 'Maestro');
  assert.equal(L.tabTitle(run({ awaiting: { kind: 'answer', since: '2026-08-19T10:30:00.000Z' }, interruptedAt: '2026-08-19T10:40:00.000Z' }), 'en'), 'Maestro');
  assert.equal(L.tabTitle(null, 'ru'), 'Maestro');
});

test('the page names exactly the kinds the contract defines', () => {
  // Two copies of one value set, written by different code: this holds them together.
  assert.deepEqual(plain(L.AWAITING_KINDS), [...AWAITING_KINDS]);
  for (const kind of AWAITING_KINDS) assert.equal(L.awaitingOf(asked({ kind }))!.kind, kind);
});

// --- the header band: what is happening, in one word and one sentence ------

const band = (extra: Record<string, unknown> = {}): Record<string, unknown> =>
  run({ contractVersion: 9, lifecycle: 'active', ...extra });

const condition = (state: unknown): Record<string, unknown> => plain(L.conditionOf(state)) as Record<string, unknown>;

test('C1: a closed run that stopped incomplete reads as failed, by its outcome', () => {
  const state = band({ lifecycle: 'closed', outcome: 'stopped_incomplete', finishedAt: '2026-08-19T11:00:00.000Z', stopReason: 'нет доступа к базе' });
  assert.deepEqual(condition(state), { condition: 'failed', reason: 'outcome', stageId: null });
});

test('C2: a closed run with any other outcome reads as finished, and so does an old run that wrote finishedAt', () => {
  for (const outcome of ['completed', 'closed_with_exceptions']) {
    const state = band({ lifecycle: 'closed', outcome, finishedAt: '2026-08-19T11:00:00.000Z' });
    assert.deepEqual(condition(state), { condition: 'finished', reason: 'outcome', stageId: null }, outcome);
  }
  assert.deepEqual(condition(run({ finishedAt: '2026-08-19T11:00:00.000Z' })),
    { condition: 'finished', reason: 'outcome', stageId: null });
});

test('C3: a run interrupted without closing reads as failed, and a stale wait does not outrank it', () => {
  const state = band({
    interruptedAt: '2026-08-19T10:50:00.000Z',
    awaiting: { kind: 'answer', since: '2026-08-19T10:40:00.000Z' },
  });
  assert.deepEqual(condition(state), { condition: 'failed', reason: 'interrupted', stageId: null });
});

test('C4: a run stopped on a question reads as waiting, even under a failed стадия, because the reader holds the next move', () => {
  const state = band({
    awaiting: { kind: 'plan-gate', since: '2026-08-19T10:40:00.000Z' },
    stages: [
      { id: 'preflight', status: 'done', startedAt: STARTED },
      { id: 'plan', status: 'failed', startedAt: '2026-08-19T10:30:00.000Z' },
    ],
  });
  assert.deepEqual(condition(state), { condition: 'waiting', reason: 'awaiting', stageId: null });
});

test('C5: a failed стадия with nobody asked reads as failed and names that стадия', () => {
  const state = band({
    stages: [
      { id: 'preflight', status: 'done', startedAt: STARTED },
      { id: 'plan', status: 'failed', startedAt: '2026-08-19T10:30:00.000Z' },
    ],
  });
  assert.deepEqual(condition(state), { condition: 'failed', reason: 'stage', stageId: 'plan' });
});

test('C6: anything else reads as working, named by its current стадия, including a state with no stages', () => {
  assert.deepEqual(condition(band()), { condition: 'working', reason: 'none', stageId: 'plan' });
  assert.deepEqual(condition(run({ stages: [], currentStage: undefined })),
    { condition: 'working', reason: 'none', stageId: null });
});

test('every condition has a word in both languages, and no word the order does not hold', () => {
  assert.deepEqual(plain(L.CONDITION_ORDER), ['working', 'waiting', 'finished', 'failed']);
  for (const language of L.LANGUAGE_ORDER) {
    const said = L.L10N[language]!['CONDITION'];
    assert.ok(said, `L10N.${language}.CONDITION`);
    assert.deepEqual(Object.keys(said), [...L.CONDITION_ORDER], language);
    for (const word of Object.values(said)) assert.ok(word.trim() !== '', language);
  }
  assert.equal(L.L10N.ru['CONDITION']!['waiting'], 'Ждёт вас');
  assert.equal(L.L10N.en['CONDITION']!['finished'], 'Finished');
});

const tasksOf = (statuses: string[], titles: Array<string | null> = []): Array<Record<string, unknown>> =>
  statuses.map((status, i) => ({
    id: String(i + 1).padStart(2, '0'),
    title: titles[i] === undefined ? `Таск ${i + 1}` : titles[i],
    requirementIds: ['R01'], blockedBy: [], status,
  }));

type Say = (...args: unknown[]) => string;
const said = (language: string, name: string): Say =>
  (L.L10N[language]!['UI'] as unknown as Record<string, Say>)[name]!;
const headline = (language: string, statuses: string[]): string =>
  said(language, 'headline')(L.countTasks(tasksOf(statuses)));

const SENTENCES: Array<{ row: string; statuses: string[]; ru: string; en: string }> = [
  { row: 'S1', statuses: [], ru: 'Тасков пока нет', en: 'No tasks yet' },
  { row: 'S2', statuses: ['done', 'done', 'running', 'review', 'repair', 'queued'],
    ru: '2 из 6 тасков готовы, ещё 3 в работе', en: '2 of 6 tasks done, 3 more in progress' },
  { row: 'S3', statuses: ['done', ...Array<string>(20).fill('queued')],
    ru: '1 из 21 таска готов', en: '1 of 21 tasks done' },
  { row: 'S4', statuses: ['done', 'done', 'done', 'done', 'done'],
    ru: '5 из 5 тасков готовы', en: '5 of 5 tasks done' },
  { row: 'S5', statuses: ['running'], ru: '0 из 1 таска готовы, ещё 1 в работе', en: '0 of 1 task done, 1 more in progress' },
  { row: 'S6', statuses: ['done', 'running', 'queued', 'paused'],
    ru: '1 из 4 тасков готов, ещё 1 в работе · вне контракта 1',
    en: '1 of 4 tasks done, 1 more in progress · off-contract 1' },
];

for (const { row, statuses, ru, en } of SENTENCES) {
  test(`${row}: the band's sentence about the таски agrees in number in both languages`, () => {
    assert.equal(headline('ru', statuses), ru);
    assert.equal(headline('en', statuses), en);
  });
}

test('the in-flight line names the таски at work by title, three to a group, then counts the rest', () => {
  const state = band({
    tasks: [
      ...tasksOf(['running', 'running', 'running', 'running'], ['Шапка', 'Подвал', 'Меню', 'Форма']),
      { id: '05', title: 'Каталог', requirementIds: ['R01'], blockedBy: [], status: 'review' },
      { id: '07', title: '  ', requirementIds: ['R01'], blockedBy: [], status: 'repair' },
      { id: '08', title: 'Готовое', requirementIds: ['R01'], blockedBy: [], status: 'done' },
    ],
  });
  const groups = L.inFlightOf(state);
  assert.deepEqual(plain(groups.repair), [{ id: '07', title: null }]);
  assert.equal(groups.running.length, 4);
  assert.equal(said('ru', 'inFlightLine')(groups),
    'В работе: «Шапка», «Подвал», «Меню» и ещё 1 · На ревью: «Каталог» · На исправлении: 07');
  assert.equal(said('en', 'inFlightLine')(groups),
    'In progress: “Шапка”, “Подвал”, “Меню” and 1 more · In review: “Каталог” · In repair: 07');
});

test('the in-flight line is empty when nothing is in flight', () => {
  const groups = L.inFlightOf(band({ tasks: tasksOf(['done', 'queued', 'failed']) }));
  assert.equal(said('ru', 'inFlightLine')(groups), '');
  assert.equal(said('en', 'inFlightLine')(groups), '');
});

test('the strip holds all eight stages in order, fills the missing ones as pending, and marks only the current one', () => {
  const strip = plain(L.stripOf(band({
    stages: [
      { id: 'preflight', status: 'done', startedAt: STARTED, finishedAt: '2026-08-19T10:05:00.000Z' },
      { id: 'briefing', status: 'skipped', note: 'вопросов нет' },
      { id: 'plan', status: 'active', startedAt: '2026-08-19T10:30:00.000Z' },
    ],
  }))) as ReturnType<Logic['stripOf']>;
  assert.deepEqual(strip.map(cell => cell.id), [...L.STAGE_ORDER]);
  assert.deepEqual(strip[0], { id: 'preflight', status: 'done', current: false, from: STARTED, until: '2026-08-19T10:05:00.000Z' });
  assert.deepEqual(strip[1], { id: 'manifest', status: 'pending', current: false, from: null, until: null });
  assert.equal(strip[2]!.status, 'skipped');
  assert.deepEqual(strip.filter(cell => cell.current).map(cell => cell.id), ['plan']);
});

test('the band\'s composed sentences carry no shorthand vocabulary.md forbids the plain reader', async () => {
  const vocabulary = parseTables(await readFile('docs/spec/vocabulary.md', 'utf8'));
  const groups = L.inFlightOf(band({ tasks: tasksOf(['running', 'review', 'repair'], ['a', 'b', null]) }));
  for (const [language, column, wordwise] of [['ru', 'Shorthand', false], ['en', 'Shorthand (en)', true]] as const) {
    const table = vocabulary.find(item => item.columns.includes(column));
    assert.ok(table, column);
    const banned = table.rows.flatMap(row => cleanCell(row[column]).split(',')).map(word => word.trim().toLowerCase()).filter(Boolean);
    const lines = [...SENTENCES.map(item => headline(language, item.statuses)), said(language, 'inFlightLine')(groups),
      said(language, 'bandCaption')(38)];
    for (const line of lines) {
      const naked = String(line).toLowerCase();
      for (const word of banned) {
        const says = wordwise ? new RegExp(`\\b${word}\\b`).test(naked) : naked.includes(word);
        assert.equal(says, false, `${language}: «${line}» says ${word}`);
      }
    }
  }
});

const CONDITION_STATES: Array<{ row: string; state: Record<string, unknown>; says: { ru: RegExp; en: RegExp } }> = [
  { row: 'C1', state: band({ lifecycle: 'closed', outcome: 'stopped_incomplete', finishedAt: '2026-08-19T11:00:00.000Z', stopReason: 'нет доступа к базе' }),
    says: { ru: /^Сбой: .*нет доступа к базе/, en: /^Failed: .*нет доступа к базе/ } },
  { row: 'C2', state: band({ lifecycle: 'closed', outcome: 'closed_with_exceptions', finishedAt: '2026-08-19T11:00:00.000Z' }),
    says: { ru: /^Завершён: /, en: /^Finished: / } },
  { row: 'C3', state: band({ interruptedAt: '2026-08-19T10:50:00.000Z' }), says: { ru: /^Сбой: /, en: /^Failed: / } },
  { row: 'C4', state: band({ awaiting: { kind: 'plan-gate', since: '2026-08-19T10:40:00.000Z' } }),
    says: { ru: /^Ждёт вашего одобрения плана в чате с /, en: /^Waiting for your approval of the plan in the chat since / } },
  { row: 'C5', state: band({ stages: [{ id: 'preflight', status: 'done', startedAt: STARTED }, { id: 'plan', status: 'failed', startedAt: '2026-08-19T10:30:00.000Z' }] }),
    says: { ru: /«План»/, en: /«Plan»/ } },
  { row: 'C6', state: band(), says: { ru: /^Идёт работа: .*«План»/, en: /^Working: .*«Plan»/ } },
];

for (const { row, state, says } of CONDITION_STATES) {
  test(`${row}: the header's explanation says why the band reads as it does, in every register and language`, () => {
    const marks = L.collectMarks(state);
    for (const language of ['ru', 'en'] as const) {
      for (const register of ['normal', 'plain']) {
        const lines = L.explain('header', state, AT('2026-08-19T11:30:00.000Z'), marks, register, language);
        assert.equal(lines.length, 4, `${language}/${register}`);
        for (const line of lines) assert.ok(typeof line === 'string' && line.trim() !== '', `${language}/${register} left a blank line`);
        assert.match(lines[1]!, says[language], `${language}/${register}`);
      }
    }
  });
}

test('a finished прогон\'s header says closed and never claims it was verified', () => {
  const state = band({ lifecycle: 'closed', outcome: 'closed_with_exceptions', finishedAt: '2026-08-19T11:00:00.000Z' });
  for (const language of ['ru', 'en']) {
    for (const register of ['normal', 'plain']) {
      const why = L.explain('header', state, AT('2026-08-19T11:30:00.000Z'), L.collectMarks(state), register, language)[1]!;
      assert.doesNotMatch(why, /Подтверждено выполнено|Verified completed/, `${language}/${register}`);
      assert.match(why, /не значит «проверен»|«закрыта», а не «проверена»|does not mean verified|closed, not checked/, `${language}/${register}`);
    }
  }
});

test('the retired progress and stage regions explain nothing any more', () => {
  for (const language of ['ru', 'en']) {
    for (const register of ['normal', 'plain']) {
      for (const key of ['progress', 'stage']) {
        assert.deepEqual(plain(L.explain(key, band(), NOW, [], register, language)), [], `${language}/${register}/${key}`);
      }
    }
  }
});

// --- the four cards: requirement progress, the test source, the squares ------

/** A требование as the manifest writes it. */
const requirement = (id: string, status: string): Record<string, unknown> => ({ id, status });

/** A contract-4 state whose current G4 has passed, and the same one with G4 pending. */
const g4Passed = (): ReturnType<typeof verifiedState> => verifiedState();
const g4Pending = (): ReturnType<typeof verifiedState> => {
  const state = verifiedState();
  state.lifecycle = 'active';
  delete state.outcome;
  delete state.finishedAt;
  state.gates[3]!.status = 'pending';
  state.verification!.checks[0]!.currentFingerprint.build = 'changed-build';
  return state;
};

const progress = (requirements: unknown[], tasks: unknown[] = []): ReturnType<Logic['requirementProgressOf']> =>
  L.requirementProgressOf(bare({ requirements, tasks }));

const holdsPartition = (value: ReturnType<Logic['requirementProgressOf']>, row: string): void => {
  assert.equal(value.built + value.inProgress + value.deferred, value.live, `${row}: built + in progress + deferred is live`);
};

test('P1: a dropped требование is not live and lands in no bucket', () => {
  const value = progress([requirement('R01', 'dropped')], [task('01', { status: 'done' })]);
  assert.equal(value.live, 0);
  assert.deepEqual(plain(value.ids), { built: [], 'in-progress': [], deferred: [] });
  holdsPartition(value, 'P1');
});

test('P2: a deferred требование is live and deferred even when every таск naming it is done', () => {
  const value = progress([requirement('R01', 'deferred')], [task('01', { status: 'done' })]);
  assert.equal(value.live, 1);
  assert.equal(value.deferred, 1);
  assert.equal(value.built, 0);
  assert.deepEqual(plain(value.ids.deferred), ['R01']);
  holdsPartition(value, 'P2');
});

test('P3: a live требование no таск names is in progress, never built', () => {
  for (const status of ['open', 'in-spec', 'placeholder']) {
    const value = progress([requirement('R01', status)], [task('01', { status: 'done', requirementIds: ['R02'] })]);
    assert.equal(value.inProgress, 1, status);
    assert.equal(value.built, 0, status);
    holdsPartition(value, 'P3');
  }
});

test('P4: a live требование whose naming таски are all done is built, a placeholder included', () => {
  for (const status of ['open', 'in-spec', 'placeholder']) {
    const value = progress([requirement('R01', status)], [
      task('01', { status: 'done' }), task('02', { status: 'done', requirementIds: ['R01', 'R02'] }),
    ]);
    assert.equal(value.built, 1, status);
    assert.deepEqual(plain(value.ids.built), ['R01'], status);
    holdsPartition(value, 'P4');
  }
});

test('P5: one naming таск still in motion or queued keeps a требование in progress', () => {
  for (const status of ['running', 'review', 'repair', 'queued']) {
    const value = progress([requirement('R01', 'in-spec')], [task('01', { status: 'done' }), task('02', { status })]);
    assert.equal(value.inProgress, 1, status);
    assert.deepEqual(plain(value.ids['in-progress']), ['R01'], status);
    holdsPartition(value, 'P5');
  }
});

test('P6: one naming таск failed or off-contract keeps a требование in progress', () => {
  for (const status of ['failed', 'teleported']) {
    const value = progress([requirement('R01', 'in-spec')], [task('01', { status: 'done' }), task('02', { status })]);
    assert.equal(value.inProgress, 1, status);
    assert.equal(value.built, 0, status);
    holdsPartition(value, 'P6');
  }
});

test('P7: once the current G4 has passed the figure counts verified требования', () => {
  const value = L.requirementProgressOf(g4Passed());
  assert.equal(value.verified, 1);
  assert.equal(value.live, 1);
  holdsPartition(value, 'P7');
});

test('P8: with G4 pending or a contract older than 4 the figure counts built, never verified', () => {
  const pending = L.requirementProgressOf(g4Pending());
  assert.equal(pending.verified, null);
  assert.equal(pending.built, 1);
  holdsPartition(pending, 'P8');
  const legacy = L.requirementProgressOf(bare({
    contractVersion: 3,
    requirements: [requirement('R01', 'in-spec')],
    tasks: [task('01', { status: 'done' })],
    gates: [{ id: 'G4', status: 'passed', findings: [] }],
  }));
  assert.equal(legacy.verified, null);
  assert.equal(legacy.built, 1);
  holdsPartition(legacy, 'P8');
});

test('the three buckets partition live требования on a mixed прогон', () => {
  const value = progress([
    requirement('R01', 'in-spec'), requirement('R02', 'open'), requirement('R03', 'deferred'),
    requirement('R04', 'dropped'), requirement('R05', 'placeholder'),
  ], [
    task('01', { status: 'done', requirementIds: ['R01', 'R05'] }),
    task('02', { status: 'running', requirementIds: ['R02'] }),
  ]);
  assert.deepEqual([value.live, value.built, value.inProgress, value.deferred], [4, 2, 1, 1]);
  holdsPartition(value, 'mixed');
});

test('T1: a прогон with no suite anywhere has no test source', () => {
  assert.equal(L.testsOf(bare({ tasks: [task('01', { status: 'done' })] })), null);
});

test('T2: the таск suite shown is the one that finished last, not the one listed last', () => {
  const value = L.testsOf(bare({ tasks: [
    task('02', { title: 'Форма', tests: { passed: 7, failed: 1 }, finishedAt: '2026-08-19T11:00:00.000Z' }),
    task('03', { title: 'Без тестов', finishedAt: '2026-08-19T12:00:00.000Z' }),
    task('04', { title: 'Меню', tests: { passed: 3, failed: 0 }, finishedAt: '2026-08-19T10:30:00.000Z' }),
  ] }));
  assert.deepEqual(plain(value), { passed: 7, failed: 1, source: 'task', taskId: '02', title: 'Форма' });
});

test('T2: a таск suite with no finishedAt loses to one that has it, and between two without it the later wins', () => {
  const stamped = L.testsOf(bare({ tasks: [
    task('01', { tests: { passed: 1, failed: 0 }, finishedAt: '2026-08-19T10:30:00.000Z' }),
    task('02', { tests: { passed: 2, failed: 0 } }),
  ] }));
  assert.equal(stamped?.taskId, '01');
  const unstamped = L.testsOf(bare({ tasks: [
    task('01', { tests: { passed: 1, failed: 0 } }),
    task('02', { tests: { passed: 2, failed: 0 } }),
  ] }));
  assert.equal(unstamped?.taskId, '02');
});

test('T3: a full suite at acceptance outranks every таск suite', () => {
  const value = L.testsOf(bare({
    tests: { passed: 41, failed: 2 },
    tasks: [task('01', { tests: { passed: 1, failed: 0 }, finishedAt: '2026-08-19T10:30:00.000Z' })],
  }));
  assert.deepEqual(plain(value), { passed: 41, failed: 2, source: 'run' });
});

test('T4: the failed count is worded beside the passed one, zero included, in both languages', () => {
  assert.equal(said('ru', 'testsFailed')(3), '· упало 3');
  assert.equal(said('ru', 'testsFailed')(0), '· упало 0');
  assert.equal(said('en', 'testsFailed')(3), '· failed 3');
});

test('the test source is worded for T1, T2 and T3 in both languages', () => {
  assert.equal(said('ru', 'testsSub')(null), 'Прогон ещё не запускал тесты');
  assert.equal(said('en', 'testsSub')(null), 'The run has not run any tests yet');
  const after = { passed: 7, failed: 1, source: 'task', taskId: '02', title: 'Форма' };
  assert.equal(said('ru', 'testsSub')(after), 'После таска 02 «Форма»');
  assert.equal(said('en', 'testsSub')(after), 'After task 02 “Форма”');
  const untitled = { passed: 7, failed: 1, source: 'task', taskId: '02', title: null };
  assert.equal(said('ru', 'testsSub')(untitled), 'После таска 02');
  assert.equal(said('en', 'testsSub')(untitled), 'After task 02');
  const run = { passed: 41, failed: 0, source: 'run' };
  assert.equal(said('ru', 'testsSub')(run), 'Полный набор на приёмке');
  assert.equal(said('en', 'testsSub')(run), 'Full suite at acceptance');
});

test('a таск square carries its status in tasks[] order, and an unknown status is off-contract', () => {
  const statuses = ['done', 'running', 'review', 'repair', 'queued', 'failed', 'teleported'];
  const squares = L.taskSquaresOf(bare({ tasks: tasksOf(statuses, [null]) }));
  assert.deepEqual(squares.map(square => square.status),
    ['done', 'running', 'review', 'repair', 'queued', 'failed', 'off-contract']);
  assert.deepEqual(squares.map(square => square.id), ['01', '02', '03', '04', '05', '06', '07']);
  assert.equal(squares[0]!.title, null);
  assert.equal(squares[1]!.title, 'Таск 2');
  assert.deepEqual(plain(L.taskSquaresOf(bare())), []);
});

test('the requirement progress words follow their order in both languages', () => {
  assert.deepEqual([...L.REQUIREMENT_PROGRESS_ORDER], ['built', 'in-progress', 'deferred']);
  for (const language of ['ru', 'en']) {
    assert.deepEqual(Object.keys(L.L10N[language]!['REQUIREMENT_PROGRESS']!), [...L.REQUIREMENT_PROGRESS_ORDER], language);
  }
  assert.equal(L.L10N.ru['REQUIREMENT_PROGRESS']!['built'], 'Построено');
  assert.equal(L.L10N.en['REQUIREMENT_PROGRESS']!['built'], 'Built');
});

test('the requirements sub-line says built, or passed the check once G4 passed, with the other two buckets', () => {
  const value = { live: 9, built: 2, inProgress: 5, deferred: 2, verified: null };
  assert.equal(said('ru', 'requirementsSub')(value), 'Построено · в работе 5 · отложено 2');
  assert.equal(said('en', 'requirementsSub')(value), 'Built · in progress 5 · deferred 2');
  const verified = { ...value, verified: 1 };
  assert.equal(said('ru', 'requirementsSub')(verified), 'Прошло проверку · в работе 5 · отложено 2');
  assert.equal(said('en', 'requirementsSub')(verified), 'Passed the check · in progress 5 · deferred 2');
  const none = { live: 0, built: 0, inProgress: 0, deferred: 0, verified: null };
  assert.equal(said('ru', 'requirementsSub')(none), 'Требования ещё не записаны');
  assert.equal(said('en', 'requirementsSub')(none), 'No requirements written down yet');
});

test('the brief coverage line under G2 reads the share of live требования, or says none are written', () => {
  assert.equal(said('ru', 'coverageLine')({ percent: 80, inSpec: 8, live: 10 }),
    'Покрытие брифа: 8 из 10 требований в спецификации — 80%');
  assert.equal(said('en', 'coverageLine')({ percent: 80, inSpec: 8, live: 10 }),
    'Brief coverage: 8 of 10 requirements in the specification — 80%');
  assert.equal(said('ru', 'coverageLine')({ percent: 0, inSpec: 0, live: 0 }),
    'Покрытие брифа: требования ещё не записаны');
  assert.equal(said('en', 'coverageLine')({ percent: 0, inSpec: 0, live: 0 }),
    'Brief coverage: no requirements written down yet');
});

test('the Ваш ход total agrees with its number in all three Russian forms', () => {
  assert.equal(said('ru', 'handoverTotal')(1), 'Всего 1 пункт');
  assert.equal(said('ru', 'handoverTotal')(3), 'Всего 3 пункта');
  assert.equal(said('ru', 'handoverTotal')(5), 'Всего 5 пунктов');
  assert.equal(said('en', 'handoverTotal')(1), 'In all 1 item');
  assert.equal(said('en', 'handoverTotal')(5), 'In all 5 items');
});

test('the Таски sub-line names what moves, failed and retried in words, and no share of the way', () => {
  const counts = L.countTasks([
    ...tasksOf(['done', 'running', 'review', 'repair', 'failed']), { id: '06', status: 'done', retries: 2 },
  ]);
  for (const language of ['ru', 'en']) {
    const line = said(language, 'tasksSub')(counts);
    assert.doesNotMatch(line, /%/, language);
    assert.match(line, language === 'ru' ? /Упал 1/ : /Failed 1/, language);
  }
  const still = L.countTasks(tasksOf(['done', 'queued']));
  assert.equal(said('ru', 'tasksSub')(still), '');
  assert.equal(said('en', 'tasksSub')(still), '');
});

test('the four cards, the Ваш ход total and the G2 line are explained in both registers and both languages', () => {
  const state = busy();
  const marks = L.collectMarks(state);
  for (const language of ['ru', 'en']) {
    for (const register of ['normal', 'plain']) {
      for (const key of ['requirements', 'tasks', 'tests', 'handover', 'gates']) {
        const lines = L.explain(key, state, NOW, marks, register, language);
        assert.ok(lines.length >= 2, `${language}/${register}/${key}`);
        assert.ok(lines.every(line => line.trim() !== ''), `${language}/${register}/${key} left a blank line`);
      }
      const gates = L.explain('gates', state, NOW, marks, register, language).join(' ');
      assert.match(gates, language === 'ru' ? /2 из 3/ : /2 of 3/, `${language}/${register}`);
      const handover = L.explain('handover', state, NOW, marks, register, language)[1]!;
      assert.match(handover, language === 'ru' ? /Всего 2/ : /In all 2/, `${language}/${register}`);
    }
  }
});

test('the retired coverage and debt cards explain nothing any more', () => {
  for (const language of ['ru', 'en']) {
    for (const register of ['normal', 'plain']) {
      for (const key of ['coverage', 'debt']) {
        assert.deepEqual(plain(L.explain(key, busy(), NOW, [], register, language)), [], `${language}/${register}/${key}`);
      }
    }
  }
});

// Таск rows say why. A repair bar quotes what was sent back once a defect
// records it, a failed bar names how the last repair attempt ended, and a wave
// that has not started names the таски it waits for. The B and W numbers are
// the rows of the tables in docs/spec/dashboard.md › Таск Rows Say Why.

/** Contract 6, таск 01 in repair, a verified defect first and two open ones after it. */
const sentBackState = (): ReturnType<typeof repairContract6State> => {
  const state = repairContract6State();
  state.verification!.defects = [
    defect('DF-0', 'F-1', { status: 'verified', counterexample: 'An earlier defect, already fixed' }),
    defect('DF-1', 'F-1'),
    defect('DF-2', 'F-1', { counterexample: 'Escape leaves the panel open' }),
  ];
  return state;
};

/** Contract 6, таск 01 failed, with the given repair attempts on record. */
const failedState = (attempts: ReturnType<typeof v3Attempt>[]): ReturnType<typeof repairContract6State> => {
  const state = repairContract6State();
  state.tasks[0]!.status = 'failed';
  state.verification!.repairAttempts = attempts;
  return state;
};

test('B5: a repair bar quotes the first open defect of its таск, verbatim', () => {
  assert.deepEqual(plain(L.taskReasonOf(sentBackState(), '01')),
    { kind: 'sent-back', text: 'Hovering the trigger leaves the panel hidden' });
});

test('B6: a repair bar whose таск has no open defect yet says nothing under it', () => {
  const state = sentBackState();
  state.verification!.defects = [state.verification!.defects[0]!];
  assert.equal(L.taskReasonOf(state, '01'), null);
});

test('B6: a defect that belongs to another таск is never quoted under this one', () => {
  const state = sentBackState();
  for (const item of state.verification!.defects) item.parentTaskId = '02';
  assert.equal(L.taskReasonOf(state, '01'), null);
});

test('B7: a contract-5 repair bar says nothing under it, whatever its record holds', () => {
  const state = controlledState();
  state.tasks[0]!.status = 'repair';
  (state.verification as unknown as Record<string, unknown>)['defects'] = [defect('DF-1', 'F-1')];
  assert.equal(L.taskReasonOf(state, '01'), null);
});

test('B8: a failed bar names the outcome of its таск\'s latest repair attempt', () => {
  const state = failedState([
    v3Attempt('RA-1', 'F-1', 'DF-1', '2026-09-29T09:20:00Z', { outcome: 'defect_verified' }),
    v3Attempt('RA-2', 'F-1', 'DF-1', '2026-09-29T09:40:00Z', { outcome: 'prerequisite_blocked' }),
    v3Attempt('RA-3', 'F-1', 'DF-1', '2026-09-29T09:30:00Z', { outcome: 'defect_verified' }),
    v3Attempt('RA-4', 'F-1', 'DF-1', '2026-09-29T09:50:00Z', { taskId: '02', outcome: 'defect_verified' }),
  ]);
  assert.deepEqual(plain(L.taskReasonOf(state, '01')), { kind: 'repair-outcome', outcome: 'prerequisite_blocked' });
});

test('B8: two attempts at the same moment resolve to the later one in the record', () => {
  const state = failedState([
    v3Attempt('RA-1', 'F-1', 'DF-1', '2026-09-29T09:40:00Z', { outcome: 'defect_verified' }),
    v3Attempt('RA-2', 'F-1', 'DF-1', '2026-09-29T09:40:00Z', { outcome: 'still_failing' }),
  ]);
  assert.deepEqual(plain(L.taskReasonOf(state, '01')), { kind: 'repair-outcome', outcome: 'still_failing' });
});

test('B9: an outcome outside the five is carried as written', () => {
  const state = failedState([v3Attempt('RA-1', 'F-1', 'DF-1', '2026-09-29T09:20:00Z')]);
  (state.verification!.repairAttempts[0] as unknown as Record<string, unknown>)['outcome'] = 'gave_up';
  assert.deepEqual(plain(L.taskReasonOf(state, '01')), { kind: 'repair-outcome', outcome: 'gave_up' });
});

test('B10: a failed bar with no repair attempt, or before contract 4, says nothing under it', () => {
  assert.equal(L.taskReasonOf(failedState([]), '01'), null);
  const old = failedState([v3Attempt('RA-1', 'F-1', 'DF-1', '2026-09-29T09:20:00Z')]) as unknown as Record<string, unknown>;
  old['contractVersion'] = 3;
  assert.equal(L.taskReasonOf(old, '01'), null);
});

test('B1–B4 and B11: done, running, review, queued and off-contract bars say nothing under them', () => {
  for (const status of ['done', 'running', 'review', 'queued', 'paused']) {
    const state = sentBackState();
    state.verification!.repairAttempts = [v3Attempt('RA-1', 'F-1', 'DF-1', '2026-09-29T09:20:00Z')];
    (state.tasks[0] as unknown as Record<string, unknown>)['status'] = status;
    assert.equal(L.taskReasonOf(state, '01'), null, status);
  }
  assert.equal(L.taskReasonOf(sentBackState(), '99'), null);
});

test('a verification record that does not read gives no reason line and never throws', () => {
  const repair = sentBackState() as unknown as { verification: Record<string, unknown> };
  repair.verification['defects'] = 'x';
  assert.equal(L.taskReasonOf(repair, '01'), null);
  const failed = failedState([]) as unknown as { verification: Record<string, unknown> };
  failed.verification['repairAttempts'] = 'x';
  assert.equal(L.taskReasonOf(failed, '01'), null);
  const broken = failedState([]) as unknown as { verification: Record<string, unknown> };
  broken.verification['repairAttempts'] = [null, 7];
  assert.equal(L.taskReasonOf(broken, '01'), null);
});

const waveTask = (id: string, wave: number, status: string, blockedBy: string[], startedAt?: string): Record<string, unknown> =>
  ({ id, wave, status, blockedBy, ...(startedAt ? { startedAt } : {}) });
const waitsOf = (tasks: Array<Record<string, unknown>>, wave: number): string[] =>
  plain(L.waveWaitsOf(tasks, L.groupByWave(tasks).find(group => group.wave === wave))) as string[];

test('W1: a wave that has not started waits for its blockers outside it that are not done', () => {
  const tasks = [waveTask('04', 3, 'running', [], STARTED), waveTask('05', 3, 'done', [], STARTED),
    waveTask('06', 4, 'queued', ['04', '05'])];
  assert.deepEqual(waitsOf(tasks, 4), ['04']);
});

test('W2: a wave that waits for five lists them all, deduplicated, without its own таски', () => {
  const tasks = [
    ...['01', '02', '03', '04', '05'].map(id => waveTask(id, 2, 'running', [], STARTED)),
    waveTask('06', 3, 'queued', ['01', '02', '03']),
    waveTask('07', 3, 'queued', ['03', '04', '05', '06']),
  ];
  assert.deepEqual(waitsOf(tasks, 3), ['01', '02', '03', '04', '05']);
});

test('W3: a wave whose blockers are all done, or that has none, waits for nothing', () => {
  const tasks = [waveTask('01', 1, 'queued', []), waveTask('02', 2, 'done', ['01'], STARTED),
    waveTask('03', 3, 'queued', ['02'])];
  assert.deepEqual(waitsOf(tasks, 1), []);
  assert.deepEqual(waitsOf(tasks, 3), []);
});

test('W4: a wave with a таск started or past the queue names nothing it waits for', () => {
  const started = [waveTask('01', 1, 'running', [], STARTED), waveTask('02', 2, 'queued', ['01'], STARTED),
    waveTask('03', 2, 'queued', ['01'])];
  assert.deepEqual(waitsOf(started, 2), []);
  const moving = [waveTask('01', 1, 'running', [], STARTED), waveTask('02', 2, 'review', ['01']),
    waveTask('03', 2, 'queued', ['01'])];
  assert.deepEqual(waitsOf(moving, 2), []);
});

test('a wave still waits for a blocker that failed, and lists an unknown blocker as written', () => {
  const tasks = [waveTask('01', 1, 'failed', [], STARTED), waveTask('02', 2, 'queued', ['01', 'X9'])];
  assert.deepEqual(waitsOf(tasks, 2), ['01', 'X9']);
});

test('a wave lists its blockers in numeric order: 2 before 10', () => {
  const tasks = [waveTask('10', 1, 'running', [], STARTED), waveTask('2', 1, 'running', [], STARTED),
    waveTask('11', 2, 'queued', ['10', '2'])];
  assert.deepEqual(waitsOf(tasks, 2), ['2', '10']);
});

test('the recorded running прогон: wave 4 waits for 04, and waves 1–3 for nothing', async () => {
  const state = parseStateSource(await readFile('docs/assets/state-running.fixture.js', 'utf8')) as { tasks: unknown[] };
  const waits = plain(L.groupByWave(state.tasks).map(group => L.waveWaitsOf(state.tasks, group)));
  assert.deepEqual(waits, [[], [], [], ['04']]);
  for (const item of state.tasks as Array<{ id: string }>) assert.equal(L.taskReasonOf(state, item.id), null, item.id);
});

test('the repair outcomes are worded for all five values in both languages', () => {
  const keys = ['repaired', 'defect_verified', 'still_failing', 'unavailable', 'prerequisite_blocked'];
  for (const language of ['ru', 'en'] as const) {
    assert.deepEqual(Object.keys(L.L10N[language]['REPAIR_OUTCOME'] ?? {}).sort(), [...keys].sort(), language);
  }
  assert.equal(L.L10N.ru['REPAIR_OUTCOME']!['still_failing'], 'Всё ещё не проходит');
  assert.equal(L.L10N.en['REPAIR_OUTCOME']!['prerequisite_blocked'], 'Waiting on another task');
  assert.equal(L.label(L.L10N.ru['REPAIR_OUTCOME']!, 'gave_up'), 'gave_up');
});

test('the reason line keeps what was sent back verbatim, quotes inside it included', () => {
  const text = 'Нажатие «Купить» ничего не делает';
  assert.equal(ui('ru')['sentBack']!(text), 'Вернули: «Нажатие «Купить» ничего не делает»');
  assert.equal(ui('en')['sentBack']!('Pressing "Buy" does nothing'), 'Sent back: “Pressing "Buy" does nothing”');
  assert.equal(ui('ru')['lastRepair']!('Всё ещё не проходит'), 'Последняя попытка исправления: Всё ещё не проходит');
  assert.equal(ui('en')['lastRepair']!('Still failing'), 'Last repair attempt: Still failing');
});

test('a wave header names what it waits for, at most three, then a count', () => {
  const wave = (language: 'ru' | 'en') =>
    L.L10N[language]!['UI']!['waveName'] as unknown as (wave: number, parallel: number, waits?: string[]) => string;
  assert.equal(wave('ru')(4, 0, ['04']), 'Волна 4 · ждёт 04');
  assert.equal(wave('en')(4, 0, ['04']), 'Wave 4 · waiting for 04');
  const five = ['01', '02', '03', '04', '05'];
  assert.equal(wave('ru')(3, 0, five), 'Волна 3 · ждёт 01, 02, 03 и ещё 2');
  assert.equal(wave('en')(3, 0, five), 'Wave 3 · waiting for 01, 02, 03 and 2 more');
  assert.equal(wave('ru')(2, 3, []), 'Волна 2 — 3 таска параллельно');
  assert.equal(wave('en')(2, 3, []), 'Wave 2 — 3 tasks at once');
  assert.equal(wave('ru')(2, 3), 'Волна 2 — 3 таска параллельно');
});

test('the build explanation says what every bar, reason line and waiting wave says, in all four voices', () => {
  const state = sentBackState();
  const expected: Record<string, RegExp> = {
    'ru/normal': /состояние словом.*вернуло ревью.*последняя попытка исправления.*называет таски, которых ждёт/,
    'ru/plain': /написано словом.*что нашли.*последняя попытка исправить.*называет таски, которых ждёт/,
    'en/normal': /status in a word.*what review sent back.*last repair attempt.*names the tasks it waits for/,
    'en/plain': /says in a word.*what was found.*last try at a fix.*names the tasks it waits for/,
  };
  for (const language of ['ru', 'en']) {
    for (const register of ['normal', 'plain']) {
      const lines = L.explain('build', state, NOW, L.collectMarks(state), register, language);
      const said = lines.join(' ');
      assert.match(said, expected[`${language}/${register}`]!, `${language}/${register}`);
      assert.ok(lines.every(line => line.trim() !== ''), `${language}/${register} left a blank line`);
      if (register === 'plain') {
        for (const word of ['дефект', 'контрпример', 'defect', 'counterexample']) {
          assert.ok(!said.toLowerCase().includes(word), `${language}/plain says «${word}»`);
        }
      }
    }
  }
});

test('R10: an opened repair row shows exactly the lines it showed before the rows said why', () => {
  const state = sentBackState();
  assert.deepEqual(plain(L.describeTask(state, '01', 'ru')), [
    'На критическом пути', 'Служит требованиям: R01', 'Файлы: src/menu.js', 'Зона таска: src/menu',
    'Сохранено в истории: abcdef0, fedcba1', 'Перезапуски: 0', 'Заходы в ремонт: 1',
    'Передачи свежему субагенту: 0 — это не дефект', 'Дефекты: подтверждено 1, открыто 2',
  ]);
  assert.deepEqual(plain(L.describeTask(state, '01', 'en')), [
    'On the critical path', 'Serves: R01', 'Files: src/menu.js', 'Owned area: src/menu',
    'Saved in history: abcdef0, fedcba1', 'Restarts: 0', 'Trips to repair: 1',
    'Passed to a fresh subagent: 0 — not a defect', 'Defects: verified 1, open 2',
  ]);
});
