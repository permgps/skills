import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { SEAMS_HEADER, checkG3, checkG3Models, parseProducerIds, type GateFinding } from './check-g3.ts';
import { verifiedState } from '../state/fixtures/verification.ts';
import {
  CONTRACT_VERSION,
  type RequirementEntry,
  type RunState,
  type TaskEntry,
} from '../state/contract.ts';

function task(id: string, requirementIds: string[]): TaskEntry {
  return { id, title: `build ${id}`, requirementIds, status: 'queued', blockedBy: [] };
}

function stateWith(
  requirements: RequirementEntry[],
  tasks: TaskEntry[],
  gates: RunState['gates'] = [{ id: 'G3', status: 'pending', findings: [] }],
): RunState {
  return {
    contractVersion: CONTRACT_VERSION,
    runId: 'run-1',
    slug: 'landing-page',
    startedAt: '2026-08-19T09:00:00Z',
    mode: 'semi',
    depth: 'normal',
    dialChanges: [],
    stages: [{ id: 'plan', status: 'done' }],
    currentStage: 'build',
    tasks,
    requirements,
    gates,
  };
}

const ids = (findings: GateFinding[]): string[] => findings.map(f => f.requirementId);

test('V03/V09: source signature cannot replace the required menu behavior check', () => {
  const state = verifiedState();
  state.verification!.checks[0]!.method = 'source-signature';
  assert.ok(checkG3(state).some(item => /source-only check C-1/.test(item.message)));
});

test('V05: a required check needs an execution owner and integration prerequisites', () => {
  const state = verifiedState();
  delete state.verification!.checks[0]!.executionTaskId;
  state.verification!.checks[0]!.integrationDependencies = [];
  const findings = checkG3(state);
  assert.ok(findings.some(item => /check C-1 has no matching execution owner/.test(item.message)));
  assert.ok(findings.some(item => /omits implementation prerequisite 01/.test(item.message)));
});

test('a verification-only task can own the check without implementation ownership', () => {
  const state = verifiedState();
  state.tasks.push({ ...state.tasks[0]!, id: '02', title: 'Verify menu', blockedBy: ['01'] });
  state.verification!.obligations[0]!.implementationTaskIds = [];
  state.verification!.checks[0]!.executionTaskId = '02';
  state.verification!.checks[0]!.integrationDependencies = ['01'];
  assert.deepEqual(checkG3(state), []);
});

test('a cyclic task graph is rejected at G3', () => {
  const state = verifiedState();
  state.tasks[0]!.blockedBy = ['01'];
  assert.ok(checkG3(state).some(item => /dependency cycle/.test(item.message)));
});

test('a map that holds in both directions passes', () => {
  assert.deepEqual(checkG3(stateWith(
    [
      { id: 'R01', status: 'in-spec' },
      { id: 'R02', status: 'in-spec' },
      { id: 'R03', status: 'deferred', reason: 'the user postponed it' },
    ],
    [task('01', ['R01']), task('02', ['R01', 'R02'])],
  )), []);
});

test('an in-spec требование no таск builds is reported', () => {
  const findings = checkG3(stateWith(
    [{ id: 'R01', status: 'in-spec' }, { id: 'R02', status: 'in-spec' }],
    [task('01', ['R01'])],
  ));
  assert.deepEqual(ids(findings), ['R02']);
  assert.match(findings[0]?.message ?? '', /dropped between the specification and the cut/);
});

test('a таск tracing to a требование that is not in the манифест is reported', () => {
  const findings = checkG3(stateWith(
    [{ id: 'R01', status: 'in-spec' }],
    [task('01', ['R01']), task('02', ['R99'])],
  ));
  assert.deepEqual(ids(findings), ['R99']);
  assert.match(findings[0]?.message ?? '', /not in the манифест/);
});

test('a таск building a deferred требование is work nobody asked for', () => {
  const findings = checkG3(stateWith(
    [
      { id: 'R01', status: 'in-spec' },
      { id: 'R02', status: 'deferred', reason: 'the user postponed it' },
    ],
    [task('01', ['R01']), task('02', ['R02'])],
  ));
  assert.deepEqual(ids(findings), ['R02']);
  assert.match(findings[0]?.message ?? '', /work nobody asked for/);
});

test('a таск building a dropped требование is reported the same way', () => {
  const findings = checkG3(stateWith(
    [
      { id: 'R01', status: 'in-spec' },
      { id: 'R02', status: 'dropped', reason: 'the user withdrew it' },
    ],
    [task('01', ['R01']), task('02', ['R02'])],
  ));
  assert.deepEqual(ids(findings), ['R02']);
});

test('a deferred требование reached by no таск is not a finding', () => {
  // Only in-spec требования must reach a таск. A deferred one reaching none is
  // exactly what deferring it meant.
  assert.deepEqual(checkG3(stateWith(
    [
      { id: 'R01', status: 'in-spec' },
      { id: 'R02', status: 'deferred', reason: 'the user postponed it' },
    ],
    [task('01', ['R01'])],
  )), []);
});

test('a duplicated таск id is reported', () => {
  const findings = checkG3(stateWith(
    [{ id: 'R01', status: 'in-spec' }],
    [task('01', ['R01']), task('01', ['R01'])],
  ));
  assert.deepEqual(ids(findings), ['01']);
  assert.match(findings[0]?.message ?? '', /appears more than once/);
});

test('one таск may serve several требования, and several таски one требование', () => {
  assert.deepEqual(checkG3(stateWith(
    [{ id: 'R01', status: 'in-spec' }, { id: 'R02', status: 'in-spec' }],
    [task('01', ['R01', 'R02']), task('02', ['R01'])],
  )), []);
});

test('a tiny plan is one таск carrying every in-spec требование', () => {
  // The smallest valid plan: one таск, no decomposition, still traceable.
  assert.deepEqual(checkG3(stateWith(
    [{ id: 'R01', status: 'in-spec' }, { id: 'R02', status: 'in-spec' }],
    [task('01', ['R01', 'R02'])],
  )), []);
});

test('zero таски against a live требование fails — it reached nobody', () => {
  const findings = checkG3(stateWith([{ id: 'R01', status: 'in-spec' }], []));
  assert.deepEqual(ids(findings), ['R01']);
});

test('a манифест with nothing in-spec and no таски passes', () => {
  // Every требование deferred or dropped is G2's business, not G3's. With
  // nothing live, an empty cut is the correct cut.
  assert.deepEqual(checkG3(stateWith(
    [{ id: 'R01', status: 'deferred', reason: 'the user postponed the whole thing' }],
    [],
  )), []);
});

test('every unmatched entry is reported, on both sides at once', () => {
  const findings = checkG3(stateWith(
    [{ id: 'R01', status: 'in-spec' }, { id: 'R02', status: 'in-spec' }],
    [task('01', ['R99'])],
  ));
  assert.deepEqual(ids(findings).sort(), ['R01', 'R02', 'R99']);
});

test('a таск with no id is named by its index in the finding it causes', () => {
  // Two unnamed таски are not duplicates of each other — they are two таски
  // each missing an id, which the state validator refuses before a gate runs.
  // What the gate owes them is a finding that can still be located.
  const findings = checkG3(stateWith(
    [{ id: 'R01', status: 'in-spec' }],
    [task('', ['R01']), task('', ['R99'])],
  ));
  assert.deepEqual(ids(findings), ['R99']);
  assert.match(findings[0]?.message ?? '', /таск tasks\[1\]/);
});

// G3's second half: the reader that is handed exactly what an executor will be
// handed. Its verdict leaves the same trace G2's does, and for the same reason
// — a gate recorded as passed while carrying findings has not been acted on.
const OK: RequirementEntry[] = [{ id: 'R01', status: 'in-spec' }];

test('a run state with no G3 entry is reported — the reader left no verdict', () => {
  const findings = checkG3(stateWith(OK, [task('01', ['R01'])], []));
  assert.equal(findings.length, 1);
  assert.match(findings[0]?.message ?? '', /no G3 entry/);
});

test('G3 passed while carrying findings is reported', () => {
  const findings = checkG3(stateWith(OK, [task('01', ['R01'])], [
    { id: 'G3', status: 'passed', findings: ['T05 does not say what the score counts'] },
  ]));
  assert.equal(findings.length, 1);
  assert.match(findings[0]?.message ?? '', /passed while carrying/);
});

test('G3 failed while carrying findings is honest, not a violation', () => {
  assert.deepEqual(checkG3(stateWith(OK, [task('01', ['R01'])], [
    { id: 'G3', status: 'failed', findings: ['T05 does not say what the score counts'] },
  ])), []);
});

test('C09: two таски writing one route file with no order between them collide', () => {
  const state = stateWith([{ id: 'R01', status: 'in-spec' }], [
    task('01', ['R01']),
    { ...task('08', ['R01']), blockedBy: ['01'], files: ['src/routes/orders.ts', 'src/orders/list.ts'] },
    { ...task('11', ['R01']), blockedBy: ['01'], zone: ['src/routes/orders.ts'] },
  ]);
  const findings = checkG3(state);
  assert.equal(findings.length, 1);
  assert.match(findings[0]!.message, /таски 08 and 11 both write src\/routes\/orders\.ts and neither waits/);
  assert.match(findings[0]!.message, /blockedBy/);
});

test('C09: the same overlap serialized through a third таск passes', () => {
  assert.deepEqual(checkG3(stateWith([{ id: 'R01', status: 'in-spec' }], [
    { ...task('08', ['R01']), files: ['src/routes/orders.ts'] },
    { ...task('09', ['R01']), blockedBy: ['08'] },
    { ...task('11', ['R01']), blockedBy: ['09'], files: ['src/routes/orders.ts'] },
  ])), []);
});

test('C09: an execution owner reaching its prerequisite through a chain passes', () => {
  const state = verifiedState();
  state.tasks.push({ ...state.tasks[0]!, id: '02', title: 'Wire menu', blockedBy: ['01'], files: [] },
    { ...state.tasks[0]!, id: '03', title: 'Verify menu', blockedBy: ['02'], files: [] });
  state.verification!.obligations[0]!.implementationTaskIds = [];
  state.verification!.checks[0]!.executionTaskId = '03';
  state.verification!.checks[0]!.integrationDependencies = ['01'];
  assert.deepEqual(checkG3(state), []);
});

test('C09: an execution owner that never waits for its prerequisite is reported', () => {
  const state = verifiedState();
  state.tasks.push({ ...state.tasks[0]!, id: '02', title: 'Verify menu', blockedBy: [], files: [] });
  state.verification!.obligations[0]!.implementationTaskIds = [];
  state.verification!.checks[0]!.executionTaskId = '02';
  state.verification!.checks[0]!.integrationDependencies = ['01'];
  assert.ok(checkG3(state).some(item =>
    /execution owner 02 of check C-1 does not transitively depend on integration prerequisite 01/.test(item.message)));
});

// A task reader's finding reaches this script only as a recorded string; the
// script never reads a task file. So the regression is that a G3 recorded as
// passed while carrying the stub finding is refused like any other, and a G3
// recorded as failed with it is the honest record.
const STUB_FINDING = 'T02 done means "the list renders the saved rows" — only a stub can meet it: '
  + 'T01, which saves the rows, is not in Depends on';

test('G3 passed while carrying a done means only a stub can meet is reported', () => {
  const findings = checkG3(stateWith(OK, [task('01', ['R01']), task('02', ['R01'])], [
    { id: 'G3', status: 'passed', findings: [STUB_FINDING] },
  ]));
  assert.equal(findings.length, 1);
  assert.match(findings[0]?.message ?? '', /passed while carrying 1 finding/);
});

test('G3 failed while carrying a done means only a stub can meet is honest, not a violation', () => {
  assert.deepEqual(checkG3(stateWith(OK, [task('01', ['R01']), task('02', ['R01'])], [
    { id: 'G3', status: 'failed', findings: [STUB_FINDING] },
  ])), []);
});

// --- who builds each таск, from contract 8 ------------------------------------

/** The Seams header and the `02–13` row of the domtut audit прогон's interfaces.md, verbatim. */
const DOMTUT_SEAMS = `## Seams

| Seam | Producer task | Consumer tasks | Integration owner | Integration check |
|---|---|---|---|---|
| verdict file \`docs/acceptance/data/verdicts/<name>.json\` | 02–13, one file each (names below) | 01 (reads the format), 14 (builds with real files) | 14 | C-1, C-3, C-4, C-6 |
`;

const DIR = '2026-08-19-landing-page--wip';

function tiered(id: string, wave: number, model: 'strong' | 'standard'): TaskEntry {
  return { ...task(id, ['R01']), wave, model };
}

function contract8(tasks: TaskEntry[]): RunState {
  return { ...stateWith([{ id: 'R01', status: 'in-spec' }], tasks), contractVersion: 8, dir: DIR,
    models: { strong: 'session', standard: 'session' } };
}

/**
 * Run the models half over a real `.maestro/<dir>/`: `interfaces` is written
 * unless it is `null`, and each таск gets a task file whose Model row says
 * what `rows` says, or what the state says when `rows` is silent.
 */
async function modelsFor(state: RunState, interfaces: string | null, rows: Record<string, string> = {}): Promise<GateFinding[]> {
  const root = await mkdtemp(path.join(tmpdir(), 'check-g3-models-'));
  try {
    const run = path.join(root, DIR);
    await mkdir(path.join(run, 'tasks'), { recursive: true });
    if (interfaces !== null) await writeFile(path.join(run, 'interfaces.md'), `# Interfaces\n\n${interfaces}`);
    for (const entry of state.tasks) {
      await writeFile(path.join(run, 'tasks', `${entry.id}-work.md`),
        `# ${entry.id}\n\n| | |\n|---|---|\n| Depends on | none |\n| Model | \`${rows[entry.id] ?? entry.model}\` |\n`);
    }
    return await checkG3Models(state, root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

/** таски 01–14, all in wave 1 but 14, so no таск is the skeleton; 02–13 marked as `strongIds` says. */
const domtutPlan = (strongIds: string[]): RunState => contract8(Array.from({ length: 14 }, (_, index) => {
  const id = String(index + 1).padStart(2, '0');
  return tiered(id, id === '14' ? 2 : 1, strongIds.includes(id) ? 'strong' : 'standard');
}));
const TWO_TO_THIRTEEN = Array.from({ length: 12 }, (_, index) => String(index + 2).padStart(2, '0'));

test('a producer cell is read for its ids: one, a list, a range at its own width, and the prose after them', () => {
  assert.deepEqual(parseProducerIds('02'), ['02']);
  assert.deepEqual(parseProducerIds('02, 05'), ['02', '05']);
  assert.deepEqual(parseProducerIds('02–13, one file each (names below)'), TWO_TO_THIRTEEN);
  assert.deepEqual(parseProducerIds('`08-10`'), ['08', '09', '10']);
  assert.equal(parseProducerIds('the shell task'), null);
  assert.equal(parseProducerIds('—'), null);
});

test('a contract-7 plan carries no tiers, so the models half reads nothing and finds nothing', async () => {
  const state = { ...contract8([tiered('01', 1, 'standard')]), contractVersion: 7 };
  assert.deepEqual(await checkG3Models(state, '/definitely/absent'), []);
});

test('the domtut seam row with every producer from 02 to 13 marked strong passes', async () => {
  assert.deepEqual(await modelsFor(domtutPlan(TWO_TO_THIRTEEN), DOMTUT_SEAMS), []);
});

test('one standard таск inside the domtut range is the one finding, on that таск', async () => {
  const found = await modelsFor(domtutPlan(TWO_TO_THIRTEEN.filter(id => id !== '07')), DOMTUT_SEAMS);
  assert.deepEqual(found.map(item => item.requirementId), ['07']);
  assert.match(found[0]!.message, /^mark таск 07 `strong`: it produces the seam «verdict file docs\/acceptance/);
});

test('a producer id that is no таск of the plan is reported', async () => {
  const found = await modelsFor(contract8([tiered('01', 1, 'strong'), tiered('02', 1, 'standard')]),
    `${SEAMS_HEADER}\n|---|---|---|---|---|\n| route \`/api\` | 99 | 02 | 02 | C-1 |\n`);
  assert.deepEqual(found.map(item => item.message), ['the seam «route /api» names producer 99, which is not a таск of this plan — name the таск that produces it']);
});

test('a producer named only in words is reported, because no machine can find it', async () => {
  const found = await modelsFor(contract8([tiered('01', 1, 'strong'), tiered('02', 1, 'standard')]),
    `${SEAMS_HEADER}\n|---|---|---|---|---|\n| route \`/api\` | the shell task | 02 | 02 | C-1 |\n`);
  assert.equal(found.length, 1);
  assert.match(found[0]!.message, /name the producer by its таск id/);
});

test('the sole таск of wave 1 marked standard is the skeleton finding', async () => {
  const found = await modelsFor(contract8([tiered('01', 1, 'standard'), tiered('02', 2, 'standard')]), '');
  assert.deepEqual(found.map(item => [item.requirementId, item.message]),
    [['01', 'mark таск 01 `strong`: it is the skeleton, the sole таск of wave 1']]);
});

test('two таски in wave 1, both standard and producing no seam, pass: there is no skeleton', async () => {
  assert.deepEqual(await modelsFor(contract8([tiered('01', 1, 'standard'), tiered('02', 1, 'standard')]), ''), []);
});

test('a one-таск plan is the skeleton, so a standard one is reported', async () => {
  const found = await modelsFor(contract8([tiered('01', 1, 'standard')]), '');
  assert.deepEqual(found.map(item => item.requirementId), ['01']);
  assert.match(found[0]!.message, /it is the skeleton/);
});

test('a task file whose Model row disagrees with the run state is reported', async () => {
  const found = await modelsFor(contract8([tiered('01', 1, 'strong'), tiered('02', 1, 'strong')]), '', { '02': 'standard' });
  assert.deepEqual(found.map(item => [item.requirementId, item.message]),
    [['02', 'task file 02-work.md says Model standard, and the run state says strong — write the same tier in both']]);
});

test('a run with no interfaces.md is unreadable, not passed', async () => {
  await assert.rejects(modelsFor(contract8([tiered('01', 1, 'strong')]), null), { code: 'ENOENT' });
});

test('an interfaces.md with no Seams table names no producers, and only the skeleton rule applies', async () => {
  const found = await modelsFor(contract8([tiered('01', 1, 'strong'), tiered('02', 2, 'standard')]), '## Terms\n\n| Term | Meaning |\n|---|---|\n| order | a purchase |\n');
  assert.deepEqual(found, []);
});

test('a cell that starts with a date is no producer range, so it is never expanded into ids', () => {
  assert.equal(parseProducerIds('2026-10-11 decided in the kickoff'), null);
});

test('a range whose endpoints differ in width or run backwards names no ids, rather than a guess', () => {
  assert.equal(parseProducerIds('01–99999999'), null);
  assert.equal(parseProducerIds('13–02'), null);
  assert.deepEqual(parseProducerIds('02, 13–05'), ['02']);
});

test('a range too long for any plan is refused before it is expanded', () => {
  assert.equal(parseProducerIds('00000000–99999999'), null);
});

/** Run the models half with task files written exactly as `files` gives them; `null` writes no file for that таск. */
async function modelsWithFiles(state: RunState, files: Record<string, string | null>): Promise<GateFinding[]> {
  const root = await mkdtemp(path.join(tmpdir(), 'check-g3-files-'));
  try {
    const run = path.join(root, DIR);
    await mkdir(path.join(run, 'tasks'), { recursive: true });
    await writeFile(path.join(run, 'interfaces.md'), '# Interfaces\n');
    for (const [id, body] of Object.entries(files)) {
      if (body !== null) await writeFile(path.join(run, 'tasks', `${id}-work.md`), body);
    }
    return await checkG3Models(state, root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('a Model row with a bold label or a capitalised tier is read for the tier it names', async () => {
  const found = await modelsWithFiles(contract8([tiered('01', 1, 'strong'), tiered('02', 1, 'strong')]), {
    '01': '| | |\n|---|---|\n| **Model** | `strong` — skeleton |\n',
    '02': '| | |\n|---|---|\n| Model | Strong — producer of the API |\n',
  });
  assert.deepEqual(found, []);
});

test('a таск with no task file is reported as missing its file, not as missing a row', async () => {
  const found = await modelsWithFiles(contract8([tiered('01', 1, 'strong'), tiered('02', 1, 'standard')]), {
    '01': '| Model | `strong` |\n',
    '02': null,
  });
  assert.deepEqual(found.map(item => item.requirementId), ['02']);
  assert.match(found[0]!.message, /^no task file for таск 02 in tasks\//);
});

test('a доводка таск written strong, with its Model row reading strong — доводка, passes', async () => {
  const found = await modelsWithFiles(contract8([tiered('01', 1, 'strong'), tiered('02', 2, 'standard'), tiered('03', 3, 'strong')]), {
    '01': '| Model | `strong` — skeleton |\n',
    '02': '| Model | `standard` |\n',
    '03': '| Model | `strong` — доводка |\n',
  });
  assert.deepEqual(found, []);
});
