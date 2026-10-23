import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { RunState } from '../state/contract.ts';
import {
  CAPTURES, CONTROL_CAPTURES, SOURCE_MANIFEST, asContract10, repairContract6State,
} from '../state/fixtures/verification.ts';
import { serializeState } from '../state/write.ts';
import { main, measureCost, parseArgs, render, type CostMeasurement, type GitFacts } from './cost.ts';
import {
  SENTINEL, assistantLine, callLines, dispatchResultLine, userLine, writeSession, writeSubagent,
} from './fixtures/transcripts.ts';
import { readTranscripts, unitsOf, type Usage } from './transcripts.ts';

/** What `main` printed, with stdout put back however the body ends. */
async function printed(body: () => Promise<number>): Promise<{ code: number; out: string }> {
  const write = process.stdout.write.bind(process.stdout);
  let out = '';
  process.stdout.write = ((chunk: string | Uint8Array): boolean => { out += String(chunk); return true; }) as typeof process.stdout.write;
  try {
    return { code: await body(), out };
  } finally {
    process.stdout.write = write;
  }
}

const RUN_DIR = '2026-09-29-synthetic-menu';
const at = (minute: number, second = 0): string =>
  `2026-09-29T09:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}Z`;

/** The fixture's run: 09:00 to 09:20 by `updatedAt`, one wait of three minutes, таск 01 under repair after a reviewer finding. */
function runState(commits: string[]): RunState {
  const state = asContract10(repairContract6State());
  state.waits = [{ since: at(5), until: at(8) }];
  state.tasks[0] = { ...state.tasks[0]!, commits };
  return state;
}

const usage = (input: number, write5m: number, read: number, output: number): Usage =>
  ({ input, cacheWrite5m: write5m, cacheWrite1h: 0, cacheRead: read, output, writeSplit: true });
const opus = (u: Usage): number => unitsOf(u, 'claude-opus-5-5');

interface Project {
  root: string;
  logDir: string;
  commits: string[];
  other: string;
}

/**
 * A project with a repository, a published state and a transcript directory,
 * shaped like a short прогон: an orchestrator, an executor and a repair
 * executor on таск 01, its reviewer, the standards reader, one unlabelled
 * subagent, a session from before the run, a call from another skill, and an
 * unparsable line.
 */
async function withProject(body: (project: Project) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'maestro-cost-'));
  const git = (args: string[]): string => {
    const done = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
    if (done.status !== 0) throw new Error(`git ${args.join(' ')}: ${done.stderr}`);
    return done.stdout;
  };
  const commit = async (file: string, content: string, message: string): Promise<string> => {
    await writeFile(path.join(root, file), content);
    git(['add', file]);
    git(['commit', '-q', '-m', message]);
    return git(['rev-parse', 'HEAD']).trim();
  };
  try {
    git(['init', '-q']);
    git(['config', 'user.email', 'test@example.invalid']);
    git(['config', 'user.name', 'Cost Test']);
    const built = await commit('menu.js', 'a\nb\nc\n', `01 Implement menu\n\nMaestro-Run: ${RUN_DIR}\nRequirements: R01`);
    const repaired = await commit('menu.js', 'a\nB\nc\nd\n', `01 Implement menu\n\nMaestro-Run: ${RUN_DIR}\nRequirements: R01`);
    const other = await commit('notes.txt', 'x\n', `maestro: progress\n\nMaestro-Run: ${RUN_DIR}`);

    // A read checks the evidence on disk, so `.maestro/` is laid out as a прогон
    // leaves it: `state.js` beside the run directory, the captures inside it.
    const state = runState([built, repaired]);
    for (const [relative, content] of Object.entries({ ...CAPTURES, ...CONTROL_CAPTURES, 'manifest.md': SOURCE_MANIFEST })) {
      const file = path.join(root, '.maestro', state.dir!, relative);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, content);
    }
    await writeFile(path.join(root, '.maestro', 'state.js'), serializeState(state));

    const logDir = path.join(root, 'logs');
    await writeSession(logDir, 'early', [assistantLine({ id: 'msg_early', at: '2026-09-29T08:00:00Z', skill: 'maestro', usage: { input: 50, output: 50 } })]);
    // A second terminal in the same project during the run, recording no skill.
    await writeSession(logDir, 'side', [assistantLine({ id: 'msg_side', at: at(6), usage: { input: 70, output: 70 } })]);
    await writeSession(logDir, 'run', [
      userLine(at(0, 30)),
      ...callLines({ id: 'msg_o1', at: at(1), skill: 'maestro', usage: { input: 100, write5m: 20_000, output: 300 } }),
      assistantLine({ id: 'msg_o2', at: at(2), skill: 'maestro', usage: { input: 10, read: 20_000, output: 100 } }),
      assistantLine({ id: 'msg_scout', at: at(3), skill: 'scout', usage: { input: 10, output: 10 } }),
      dispatchResultLine('a-exec2', 'maestro:executor 01', at(11)),
      '{"type":"assistant", broken',
      assistantLine({ id: 'msg_o3', at: at(15), skill: 'maestro', usage: { input: 10, read: 20_000, output: 100 } }),
      assistantLine({ id: 'msg_late', at: at(25), skill: 'maestro', usage: { input: 10, output: 10 } }),
    ]);
    const sub = (agentId: string, id: string, when: string, u: { input?: number; write5m?: number; read?: number; output?: number }): string =>
      assistantLine({ id, at: when, sidechain: true, agentId, skill: 'maestro', usage: u, block: 'tool_use' });
    await writeSubagent(logDir, 'run', 'a-exec1', [
      sub('a-exec1', 'msg_e1', at(4), { input: 5, write5m: 30_000, output: 400 }),
      sub('a-exec1', 'msg_e2', at(4, 30), { input: 5, write5m: 1_000, read: 30_000, output: 400 }),
      sub('a-exec1', 'msg_e3', at(9), { input: 5, write5m: 32_000, output: 400 }),
    ], 'maestro:executor 01');
    await writeSubagent(logDir, 'run', 'a-exec2', [sub('a-exec2', 'msg_r1', at(12), { input: 5, write5m: 10_000, output: 200 })]);
    await writeSubagent(logDir, 'run', 'a-rev', [sub('a-rev', 'msg_v1', at(10), { input: 5, write5m: 8_000, output: 150 })], 'maestro:reviewer 01');
    await writeSubagent(logDir, 'run', 'a-std', [sub('a-std', 'msg_s1', at(13), { input: 5, write5m: 4_000, output: 50 })], 'maestro:standards-reader');
    await writeSubagent(logDir, 'run', 'a-free', [sub('a-free', 'msg_f1', at(14), { input: 5, write5m: 2_000, output: 20 })], `Explore ${SENTINEL}`);

    await body({ root, logDir, commits: [built, repaired], other });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const measured = async (project: Project, extra: string[] = []): Promise<{ code: number; out: string }> =>
  printed(() => main([project.root, '--log-dir', project.logDir, ...extra]));

const role = (m: CostMeasurement, name: string): CostMeasurement['roles'][number] => {
  const found = m.roles.find(entry => entry.role === name);
  assert.ok(found, `no role ${name}`);
  return found;
};

test('a прогон\'s transcripts, state and git give the figures each source holds', async () => {
  await withProject(async project => {
    const { code, out } = await measured(project, ['--json']);
    assert.equal(code, 0);
    const m = JSON.parse(out) as CostMeasurement;

    assert.equal(m.dir, `${RUN_DIR}--wip`);
    assert.deepEqual(m.window, {
      from: at(0), to: at(20), toSource: 'updatedAt', totalMs: 20 * 60_000, idleMs: 3 * 60_000, activeMs: 17 * 60_000,
    });

    const orchestratorUnits = opus(usage(100, 20_000, 0, 300)) + 2 * opus(usage(10, 0, 20_000, 100));
    assert.deepEqual(m.orchestrator, { calls: 3, units: orchestratorUnits, landedTasks: 1, callsPerLandedTask: 3 });

    assert.equal(m.sources.callsCounted, 10);
    assert.equal(m.sources.duplicateLines, 2);
    assert.equal(m.sources.unparsedLines, 1);
    assert.equal(m.sources.callsFromAnotherSkill, 1);
    assert.equal(m.sources.callsFromAnotherSession, 1);
    assert.deepEqual(m.sources.orchestratorSessions, { counted: 1, scope: 'sessions recording maestro' });
    assert.equal(m.sources.callsOutsideWindow, 2);
    assert.equal(m.sources.contextsOutsideWindow, 1);

    const [executor, repair] = m.executors;
    assert.ok(executor && repair);
    assert.deepEqual([executor.agentId, executor.role, executor.taskId, executor.calls], ['a-exec1', 'executor', '01', 3]);
    assert.equal(executor.peakContext, 32_005);
    assert.deepEqual(executor.coldRewrites, [{ at: at(9), gapMs: 4.5 * 60_000 }]);
    assert.equal(executor.changedLines, 3 + 3);
    assert.deepEqual([repair.agentId, repair.role, repair.taskId, repair.calls], ['a-exec2', 'repair', '01', 1]);

    assert.deepEqual(m.reviews.map(review => [review.agentId, review.taskId, review.blocked]), [['a-rev', '01', 'yes']]);
    assert.deepEqual(m.unattributed.map(entry => [entry.agentId, entry.reason]), [['a-free', 'no prefix']]);
    assert.equal(role(m, 'standards reader').calls, 1);
    assert.equal(role(m, 'repair').contexts, 1);

    const shares = m.roles.reduce((total, entry) => total + (entry.share ?? 0), 0);
    assert.ok(Math.abs(shares - 1) < 1e-9, `shares add up to ${shares}`);
    assert.deepEqual(m.runCommits, { total: 3, recordedByTasks: 2 });
  });
});

test('the human form names each section\'s source and says units are not money', async () => {
  await withProject(async project => {
    const { code, out } = await measured(project);
    assert.equal(code, 0);
    for (const heading of ['window (state)', 'sources (transcripts)', 'roles (transcripts)',
      'executors (transcripts; changed lines from git)', 'reviews (transcripts; blocked from state)', 'run commits (git)']) {
      assert.ok(out.includes(heading), `missing ${heading}`);
    }
    assert.match(out, /not money/);
    assert.match(out, /a-free\s+no prefix/);
  });
});

test('nothing a session said or a dispatch was labelled reaches stdout, the JSON or the --out file', async () => {
  await withProject(async project => {
    const human = await measured(project);
    const json = await measured(project, ['--json']);
    const out = path.join(project.root, 'cost.txt');
    const written = await measured(project, ['--out', out]);
    assert.equal(written.code, 0);
    const file = await readFile(out, 'utf8');
    for (const text of [human.out, json.out, written.out, file]) {
      assert.ok(!text.includes(SENTINEL));
      assert.ok(!text.includes('Explore'));
    }
    assert.equal(file, human.out);
    assert.deepEqual((await readdir(project.root)).sort(), ['.git', '.maestro', 'cost.txt', 'logs', 'menu.js', 'notes.txt']);
  });
});

test('the log lines the measurement writes carry ids and counts, never what a session said', async () => {
  await withProject(async project => {
    const done = spawnSync(process.execPath, [path.join(import.meta.dirname, 'cost.ts'), project.root, '--log-dir', project.logDir], {
      encoding: 'utf8', env: { ...process.env, LOG_LEVEL: 'DEBUG' },
    });
    assert.equal(done.status, 0, done.stderr);
    assert.ok(!done.stderr.includes(SENTINEL));
    assert.ok(!done.stderr.includes('Explore'));
    const line = (prefix: string): string => {
      const found = done.stderr.split('\n').find(entry => entry.startsWith(prefix));
      assert.ok(found, `no line starting ${prefix} in:\n${done.stderr}`);
      return found;
    };
    assert.match(line('INFO [metrics.cost] прогон cost measured'), /"calls":10,"duplicateLines":2,"unparsed":1,"unattributed":1,"outsideWindow":2/);
    assert.match(line('WARN [metrics.cost] context left unattributed'), /"agentId":"a-free","reason":"no prefix"/);
    assert.match(line('WARN [metrics.transcripts] line unparsable'), /"line":8/);
    assert.match(line('DEBUG [metrics.roles] context attributed {"agentId":"a-exec2"'), /"role":"repair","taskId":"01"/);
  });
});

test('a state file given to --run is read like its directory', async () => {
  await withProject(async project => {
    const { code, out } = await measured(project, ['--json', '--run', path.join(project.root, '.maestro', 'state.js')]);
    assert.equal(code, 0);
    assert.equal((JSON.parse(out) as CostMeasurement).orchestrator.calls, 3);
  });
});

test('an unreadable state, a missing log directory, an unmapped host and bad arguments each exit 2', async () => {
  await withProject(async project => {
    const noState = await printed(() => main([path.join(project.root, 'nowhere'), '--log-dir', project.logDir]));
    assert.equal(noState.code, 2);

    const noLogs = await measured({ ...project, logDir: path.join(project.root, 'missing') });
    assert.equal(noLogs.code, 2);
    assert.match(noLogs.out, /--log-dir/);
    assert.match(noLogs.out, /30 days/);

    const codex = await measured(project, ['--host', 'codex']);
    assert.equal(codex.code, 2);
    assert.match(codex.out, /host codex is not supported/);

    for (const argv of [[], [project.root, '--run'], [project.root, '--bogus'], [project.root, 'second']]) {
      assert.equal((await printed(() => main(argv))).code, 2, argv.join(' '));
    }
  });
});

test('an empty transcript directory is measured as zero calls, not refused', async () => {
  await withProject(async project => {
    const empty = path.join(project.root, 'empty-logs');
    await mkdir(empty);
    const { code, out } = await printed(() => main([project.root, '--log-dir', empty, '--json']));
    assert.equal(code, 0);
    const m = JSON.parse(out) as CostMeasurement;
    assert.equal(m.sources.callsCounted, 0);
    assert.ok(m.roles.every(entry => entry.share === null));
  });
});

// --- figures the state does not record --------------------------------------

const NO_GIT: GitFacts = { changed: new Map(), runCommits: 'not recorded' };

async function transcriptsOf(build: (logDir: string) => Promise<void>): Promise<Awaited<ReturnType<typeof readTranscripts>>> {
  const root = await mkdtemp(path.join(tmpdir(), 'maestro-cost-unit-'));
  try {
    const logDir = path.join(root, 'logs');
    await mkdir(logDir);
    await build(logDir);
    return await readTranscripts(logDir);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const reviewerOnly = (description: string) => transcriptsOf(async logDir => {
  await writeSession(logDir, 'run', [assistantLine({ id: 'msg_o', at: at(1), usage: { input: 10, output: 10 } })]);
  await writeSubagent(logDir, 'run', 'a-rev', [assistantLine({ id: 'msg_v', at: at(2), sidechain: true, agentId: 'a-rev', usage: { input: 10, output: 10 } })], description);
});

test('a state before contract 9 has no recorded idle time, and one without a verification record no blocked answer', async () => {
  const state = { ...runState([]), contractVersion: 8 } as RunState;
  delete state.waits;
  delete state.verification;
  const m = measureCost(state, await reviewerOnly('maestro:reviewer 01'), NO_GIT);
  assert.equal(m.window.idleMs, 'not recorded');
  assert.equal(m.window.activeMs, 20 * 60_000);
  assert.deepEqual(m.reviews.map(review => review.blocked), ['not recorded']);
  assert.match(render(m), /idle\s+not recorded/);
});

test('a review of a таск with no reviewer defect did not block', async () => {
  const state = runState([]);
  const verification = state.verification;
  assert.ok(verification?.version === 3);
  verification.defects = [];
  const m = measureCost(state, await reviewerOnly('maestro:reviewer 01'), NO_GIT);
  assert.deepEqual(m.reviews.map(review => review.blocked), ['no']);
});

test('a label naming a таск the state does not hold is unmatched, and its review is not recorded', async () => {
  const m = measureCost(runState([]), await reviewerOnly('maestro:reviewer 07'), NO_GIT);
  assert.deepEqual(m.reviews.map(review => [review.taskId, review.blocked]), [['unmatched', 'not recorded']]);
});

test('a label naming no shipped brief is unattributed with that reason', async () => {
  const m = measureCost(runState([]), await reviewerOnly('maestro:auditor 01'), NO_GIT);
  assert.deepEqual(m.unattributed.map(entry => entry.reason), ['unknown role key']);
});

test('a finished run\'s window ends at finishedAt, and a таск with no commits has no changed lines', async () => {
  const state = runState([]);
  state.finishedAt = at(10);
  const transcripts = await transcriptsOf(async logDir => {
    await writeSession(logDir, 'run', [
      assistantLine({ id: 'msg_o', at: at(1), usage: { input: 10, output: 10 } }),
      assistantLine({ id: 'msg_after', at: at(15), usage: { input: 10, output: 10 } }),
    ]);
    await writeSubagent(logDir, 'run', 'a-exec', [assistantLine({ id: 'msg_e', at: at(2), sidechain: true, agentId: 'a-exec', usage: { input: 10, output: 10 } })], 'maestro:executor 01');
  });
  const m = measureCost(state, transcripts, NO_GIT);
  assert.deepEqual([m.window.to, m.window.toSource], [at(10), 'finishedAt']);
  assert.equal(m.sources.callsOutsideWindow, 1);
  assert.equal(m.executors[0]?.changedLines, 'not recorded');
  assert.equal(m.orchestrator.callsPerLandedTask, null);
});

test('a run on several models says their units do not convert into each other', async () => {
  const transcripts = await transcriptsOf(async logDir => {
    await writeSession(logDir, 'run', [
      assistantLine({ id: 'msg_1', at: at(1), usage: { input: 10, output: 10 } }),
      assistantLine({ id: 'msg_2', at: at(2), model: 'claude-sonnet-5-5', usage: { input: 10, output: 10 } }),
    ]);
  });
  const m = measureCost(runState([]), transcripts, NO_GIT);
  assert.deepEqual(m.models.map(entry => entry.model), ['claude-opus-5-5', 'claude-sonnet-5-5']);
  assert.match(render(m), /do not convert into each other/);
});

test('when no session records the maestro skill, every main session in the window is the orchestrator, and the output says so', async () => {
  const transcripts = await transcriptsOf(async logDir => {
    await writeSession(logDir, 'run', [assistantLine({ id: 'msg_1', at: at(1), usage: { input: 10, output: 10 } })]);
    await writeSession(logDir, 'side', [assistantLine({ id: 'msg_2', at: at(2), usage: { input: 10, output: 10 } })]);
  });
  const m = measureCost(runState([]), transcripts, NO_GIT);
  assert.equal(m.orchestrator.calls, 2);
  assert.equal(m.sources.callsFromAnotherSession, 0);
  assert.deepEqual(m.sources.orchestratorSessions, { counted: 2, scope: 'every main session' });
  assert.match(render(m), /every main session — no session records the maestro skill/);
});

test('a resumed session counts as the прогон\'s when only its replayed records carry the skill', async () => {
  const transcripts = await transcriptsOf(async logDir => {
    const replayed = assistantLine({ id: 'msg_1', at: at(1), skill: 'maestro', usage: { input: 10, output: 10 } });
    await writeSession(logDir, 'original', [replayed]);
    await writeSession(logDir, 'resumed', [replayed, assistantLine({ id: 'msg_2', at: at(3), usage: { input: 10, output: 10 } })]);
  });
  const m = measureCost(runState([]), transcripts, NO_GIT);
  assert.equal(m.orchestrator.calls, 2);
  assert.deepEqual(m.sources.orchestratorSessions, { counted: 2, scope: 'sessions recording maestro' });
});

test('the arguments are read with their values and refused without them', () => {
  assert.deepEqual(parseArgs(['proj', '--run', 'r', '--log-dir', 'l', '--json', '--out', 'o']),
    { projectDir: 'proj', host: 'claude-code', json: true, run: 'r', logDir: 'l', out: 'o' });
  assert.deepEqual(parseArgs(['proj', '--log-dir', '--json']), { error: '--log-dir needs a value' });
});

// --- a real recorded state ---------------------------------------------------

const TEST2_STATE = path.resolve(import.meta.dirname, '../../../test2/.maestro');

test('a real recorded contract-2 state is refused exactly as measure refuses it', async t => {
  try {
    await access(path.join(TEST2_STATE, 'state.js'));
  } catch {
    t.skip(`${TEST2_STATE} is not on this machine`);
    return;
  }
  const empty = await mkdtemp(path.join(tmpdir(), 'maestro-cost-test2-'));
  try {
    const { code, out } = await printed(() => main([empty, '--run', TEST2_STATE, '--log-dir', empty]));
    assert.equal(code, 2);
    assert.match(out, /^cost: /);
  } finally {
    await rm(empty, { recursive: true, force: true });
  }
});

// --- the plan's volume estimate beside what git says changed -----------------

const changedBy = (lines: Record<string, number>): GitFacts => ({
  changed: new Map(Object.entries(lines).map(([id, count]) => [id, { lines: count, binaryFiles: 0, unreadable: [] }])),
  runCommits: 'not recorded',
});

/** An executor and a repair executor on таск 01: two contexts, one таск. */
const executorAndRepair = () => transcriptsOf(async logDir => {
  await writeSession(logDir, 'run', [assistantLine({ id: 'msg_o', at: at(1), usage: { input: 10, output: 10 } })]);
  await writeSubagent(logDir, 'run', 'a-exec', [assistantLine({ id: 'msg_e', at: at(2), sidechain: true, agentId: 'a-exec', usage: { input: 10, output: 10 } })], 'maestro:executor 01');
  await writeSubagent(logDir, 'run', 'a-fix', [assistantLine({ id: 'msg_f', at: at(9), sidechain: true, agentId: 'a-fix', usage: { input: 10, output: 10 } })], 'maestro:executor 01');
});

test('a таск carrying an estimate prints it beside its changed lines, and the run line gives the ratio', async () => {
  const state = runState([]);
  state.tasks[0] = { ...state.tasks[0]!, estimatedLines: 900 };
  const m = measureCost(state, await executorAndRepair(), changedBy({ '01': 840 }));
  assert.deepEqual(m.executors.map(entry => [entry.role, entry.changedLines, entry.estimatedLines]),
    [['executor', 840, 900], ['repair', 840, 900]]);
  assert.ok(m.estimate !== 'not recorded');
  assert.deepEqual({ ...m.estimate, ratio: m.estimate.ratio?.toFixed(3) },
    { tasks: 1, estimated: 900, changed: 840, ratio: (840 / 900).toFixed(3), zeroEstimated: [] });
  const text = render(m);
  assert.match(text, /840 lines, estimated 900/);
  assert.match(text, /estimate vs changed\s+900 estimated, 840 changed, ratio 0\.93 over 1 таск/);
});

test('a таск with an executor and a repair context enters the estimate once', async () => {
  const state = runState([]);
  state.tasks[0] = { ...state.tasks[0]!, estimatedLines: 300 };
  const m = measureCost(state, await executorAndRepair(), changedBy({ '01': 600 }));
  assert.equal(m.executors.length, 2);
  assert.ok(m.estimate !== 'not recorded');
  assert.deepEqual([m.estimate.tasks, m.estimate.estimated, m.estimate.changed], [1, 300, 600]);
});

test('a state with no estimate says so, and never prints an estimate of zero', async () => {
  const m = measureCost(runState([]), await executorAndRepair(), changedBy({ '01': 840 }));
  assert.deepEqual(m.executors.map(entry => entry.estimatedLines), ['not recorded', 'not recorded']);
  assert.equal(m.estimate, 'not recorded');
  const text = render(m);
  assert.match(text, /estimated: not recorded/);
  assert.match(text, /estimate vs changed\s+— \(no таск carries an estimate\)/);
  assert.doesNotMatch(text, /estimated 0/);
});

test('a таск estimated at zero is named and left out of the ratio, so the ratio never divides by zero', async () => {
  const state = runState([]);
  state.tasks[0] = { ...state.tasks[0]!, estimatedLines: 0 };
  const m = measureCost(state, await executorAndRepair(), changedBy({ '01': 120 }));
  assert.ok(m.estimate !== 'not recorded');
  assert.deepEqual(m.estimate, { tasks: 0, estimated: 0, changed: 0, ratio: null, zeroEstimated: ['01'] });
  const text = render(m);
  assert.match(text, /ratio — over 0 таск/);
  assert.match(text, /estimated at zero\s+01/);
});
