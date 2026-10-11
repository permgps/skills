import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  SEAMS_HEADER,
  checkG3,
  checkG3Files,
  checkG3Models,
  checkG3References,
  parseProducerIds,
  parseReferenceEntries,
  referencesRow,
  type GateFinding,
} from './check-g3.ts';
import { verifiedState } from '../state/fixtures/verification.ts';
import {
  CONTRACT_VERSION,
  type ReferenceRole,
  type RequirementEntry,
  type RunState,
  type TaskEntry,
  type VerificationReference,
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

/** Run a file half of G3 with task files written exactly as `files` gives them; `null` writes no file for that таск. */
async function modelsWithFiles(
  state: RunState,
  files: Record<string, string | null>,
  check: (state: RunState, target: string) => Promise<GateFinding[]> = checkG3Models,
): Promise<GateFinding[]> {
  const root = await mkdtemp(path.join(tmpdir(), 'check-g3-files-'));
  try {
    const run = path.join(root, DIR);
    await mkdir(path.join(run, 'tasks'), { recursive: true });
    await writeFile(path.join(run, 'interfaces.md'), '# Interfaces\n');
    for (const [id, body] of Object.entries(files)) {
      if (body !== null) await writeFile(path.join(run, 'tasks', `${id}-work.md`), body);
    }
    return await check(state, root);
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

test('a Model row with prose after its tier, «strong — hard: …», passes', async () => {
  const found = await modelsWithFiles(contract8([tiered('01', 1, 'strong'), tiered('02', 2, 'standard'), tiered('03', 3, 'strong')]), {
    '01': '| Model | `strong` — skeleton |\n',
    '02': '| Model | `standard` |\n',
    '03': '| Model | `strong` — hard: the payment callback |\n',
  });
  assert.deepEqual(found, []);
});

// --- the reference reaches the executor first, from contract 8 -----------------

function reference(id: string, role: ReferenceRole, available: boolean, location: string): VerificationReference {
  return { id, statement: `${id} as the user named it`, role, location, accessMethod: 'browser',
    available, revision: 'r1', conditions: [], approvedDeviationIds: [] };
}

/** A contract-8 plan whose state carries `references` as its register, and nothing else of verification. */
function withRegister(tasks: TaskEntry[], references: VerificationReference[]): RunState {
  return { ...contract8(tasks), verification: { references } as unknown as NonNullable<RunState['verification']> };
}

const refsFor = (state: RunState, files: Record<string, string | null>): Promise<GateFinding[]> =>
  modelsWithFiles(state, files, checkG3References);

/** A task file carrying only a References row. */
const cites = (cell: string): string => `| | |\n|---|---|\n| User contract and authority | «…» |\n| References | ${cell} |\n| Model | \`standard\` |\n`;

const HERO = reference('REF-1', 'visual_reference', true, 'https://example.test, 1440 and 390');
const MENU = reference('REF-2', 'contextual_example', true, 'https://menus.example.test/mega');
const TWO = [tiered('01', 1, 'strong'), tiered('02', 2, 'standard')];

test('a References cell is read as none, or as each backticked id with the text up to the next id', () => {
  assert.deepEqual(parseReferenceEntries('none'), { none: true, entries: [] });
  assert.deepEqual(parseReferenceEntries('`None`'), { none: true, entries: [] });
  assert.deepEqual(parseReferenceEntries('`REF-8` — visual reference: https://domtut2-old.test, 1440 and 390; `REF-1` — authoritative behavior: old/'), {
    none: false,
    entries: [
      { id: 'REF-8', location: 'visual reference: https://domtut2-old.test, 1440 and 390' },
      { id: 'REF-1', location: 'authoritative behavior: old/' },
    ],
  });
  assert.equal(parseReferenceEntries('the old site'), null);
  assert.equal(parseReferenceEntries(''), null);
});

test('an un-backticked REF id inside a location is prose, never a second citation', () => {
  assert.deepEqual(parseReferenceEntries('`REF-8` — visual reference: the isolated copy, supersedes REF-3'), {
    none: false,
    entries: [{ id: 'REF-8', location: 'visual reference: the isolated copy, supersedes REF-3' }],
  });
});

test('the References row is found with a bold or capitalised label, and is null when absent', () => {
  assert.equal(referencesRow('| **References** | none |\n'), 'none');
  assert.equal(referencesRow('| references |  `REF-1` — x  |\n'), '`REF-1` — x');
  assert.equal(referencesRow('| Model | `strong` |\n'), null);
});

test('every available visual reference and contextual example cited, each with a location, passes', async () => {
  assert.deepEqual(await refsFor(withRegister(TWO, [HERO, MENU]), {
    '01': cites('`REF-1` — visual reference: https://example.test, 1440 and 390'),
    '02': cites('**`REF-2`** — contextual example: https://menus.example.test/mega; `REF-1` — visual reference: https://example.test'),
  }), []);
});

test('none passes when the register requires nothing', async () => {
  assert.deepEqual(await refsFor(withRegister(TWO, []), { '01': cites('none'), '02': cites('`none`') }), []);
});

test('a task file with no References row is reported on its таск, with the row to add', async () => {
  const found = await refsFor(withRegister(TWO, []), { '01': cites('none'), '02': '| Model | `standard` |\n' });
  assert.deepEqual(found, [{ requirementId: '02',
    message: 'task file for таск 02 has no References row — add `| References | none |` or the `REF-*` ids it follows, each with its location, after User contract and authority' }]);
});

test('a References row naming references in words is reported, quoting the cell', async () => {
  const found = await refsFor(withRegister(TWO, []), { '01': cites('none'), '02': cites('the old site, as REF-1 shows it') });
  assert.deepEqual(found, [{ requirementId: '02',
    message: 'task file 02-work.md References row reads "the old site, as REF-1 shows it" — write `none` or each followed reference as `REF-n` in backticks followed by its location' }]);
});

test('a cited id with no location is reported: the executor would not know where to open it', async () => {
  const found = await refsFor(withRegister(TWO, [HERO]), { '01': cites('`REF-1` —'), '02': cites('none') });
  assert.deepEqual(found, [{ requirementId: '01',
    message: 'task file 01-work.md cites REF-1 with no location — write where the executor opens it' }]);
});

test('an id the register does not hold is reported on the таск that cites it', async () => {
  const found = await refsFor(withRegister(TWO, [HERO]), {
    '01': cites('`REF-1` — visual reference: https://example.test'),
    '02': cites('`REF-9` — visual reference: somewhere'),
  });
  assert.deepEqual(found, [{ requirementId: '02',
    message: 'task file 02-work.md cites REF-9, which the reference register does not hold — cite a REF id from reference.md or remove it' }]);
});

test('a required reference no таск cites is reported once, with its role and its location', async () => {
  const found = await refsFor(withRegister(TWO, [HERO, MENU]), {
    '01': cites('`REF-1` — visual reference: https://example.test'),
    '02': cites('none'),
  });
  assert.deepEqual(found, [{ requirementId: '',
    message: 'no таск cites REF-2 (contextual example: https://menus.example.test/mega) — add it to the References row of each таск that builds what it shows' }]);
});

test('authoritative, other and unavailable references may stay uncited, and citing one is allowed', async () => {
  const register = [
    reference('REF-1', 'authoritative_behavior', true, 'old/'),
    reference('REF-2', 'other', true, 'import.md'),
    reference('REF-3', 'visual_reference', false, 'https://gone.test'),
    reference('REF-4', 'contextual_example', false, 'a screenshot nobody found'),
  ];
  assert.deepEqual(await refsFor(withRegister(TWO, register), { '01': cites('none'), '02': cites('none') }), []);
  assert.deepEqual(await refsFor(withRegister(TWO, register), {
    '01': cites('`REF-1` — authoritative behavior: old/'),
    '02': cites('`REF-3` — visual reference, unavailable: https://gone.test'),
  }), []);
});

test('a contract-7 plan is skipped: it reads no task file and finds nothing', async () => {
  const state = { ...withRegister(TWO, [HERO]), contractVersion: 7 };
  assert.deepEqual(await checkG3References(state, '/definitely/absent'), []);
});

test('a таск with no task file is left to the models half, not reported twice', async () => {
  assert.deepEqual(await refsFor(withRegister(TWO, []), { '01': cites('none'), '02': null }), []);
});

/** The register of the domtut прогон of 2026-10-01: REF-3 and REF-7 superseded by REF-8, REF-5 never found. */
const DOMTUT_REGISTER = [
  reference('REF-1', 'authoritative_behavior', true, 'old/ (resources/themes/real_estate, cabinet, data/app.min.phar)'),
  reference('REF-2', 'authoritative_behavior', true, 'mysql://127.0.0.1:3307/domtut_old'),
  reference('REF-3', 'visual_reference', false, 'https://domtut2-old.test'),
  reference('REF-4', 'other', true, 'import.md (part I)'),
  reference('REF-5', 'visual_reference', false, 'owner screenshot of the new-build mega menu (not located in the repository)'),
  reference('REF-6', 'authoritative_behavior', true, 'https://developer.help.paycom.uz (Paycom Merchant API)'),
  reference('REF-7', 'visual_reference', false, 'https://domtut2-old.test served from an isolated copy outside old/'),
  reference('REF-8', 'visual_reference', true, 'https://domtut2-old.test served from an isolated copy outside old/ (own cache/tmp)'),
];

test('in the domtut register only REF-8 must be cited: REF-5 is a visual reference nobody can open', async () => {
  const state = withRegister(TWO, DOMTUT_REGISTER);
  assert.deepEqual(await refsFor(state, {
    '01': cites('`REF-8` — visual reference: https://domtut2-old.test, 1440 and 390; `REF-1` — authoritative behavior: old/'),
    '02': cites('none'),
  }), []);
  const uncited = await refsFor(state, { '01': cites('`REF-1` — authoritative behavior: old/'), '02': cites('none') });
  assert.deepEqual(uncited.map(item => item.message), [
    'no таск cites REF-8 (visual reference: https://domtut2-old.test served from an isolated copy outsid) — add it to the References row of each таск that builds what it shows',
  ]);
});

test('findings come in task order, then in register order', async () => {
  const found = await refsFor(withRegister(TWO, [HERO, MENU]), {
    '01': cites('`REF-7` — nowhere'),
    '02': '| Model | `standard` |\n',
  });
  assert.deepEqual(found.map(item => item.message.slice(0, 26)), [
    'task file 01-work.md cites',
    'task file for таск 02 has ',
    'no таск cites REF-1 (visua',
    'no таск cites REF-2 (conte',
  ]);
});

test('checkG3Files is the models half followed by the references half', async () => {
  const found = await modelsWithFiles(withRegister([tiered('01', 1, 'standard'), tiered('02', 2, 'standard')], [HERO]), {
    '01': '| Model | `standard` |\n| References | none |\n',
    '02': '| Model | `standard` |\n| References | none |\n',
  }, checkG3Files);
  assert.deepEqual(found.map(item => item.message.slice(0, 22)), ['mark таск 01 `strong`:', 'no таск cites REF-1 (v']);
});
