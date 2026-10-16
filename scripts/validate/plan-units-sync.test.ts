// `sync.mts --plan-units`, `--plan-render` and `--plan-coverage`, driven through
// the copied helper inside a temporary project the way an orchestrator calls
// it. The commands need only the run directory `state.js` names, so the state
// is written directly rather than published: nothing here starts a viewer.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { FACTS_START, FACTS_END } from '../../skills/maestro/tools/runtime/plan-units.mts';

const SYNC = 'skills/maestro/tools/sync.mts';
const DIR = '2026-10-13-plan-units--wip';

type Outcome = Record<string, unknown> & { code: number; stderr: string };

const TASK_02 = [
  '# Таск 02 — The search page',
  '',
  '## What to build',
  '',
  '- `U1` Keep the district from the address, as F-1 says.',
  '- `U2` Render page p.',
  '',
].join('\n');

const TASK_03 = [
  '# Таск 03 — Verify the search page',
  '',
  '## Done means',
  '',
  '- `U1` Row 1.9.18 is checked against F-1.',
  '',
].join('\n');

const SHARED = '# Shared facts\n\n### F-1 — District source\n\nThe district comes from the address path.\n';

const INTERFACES = [
  '# Interfaces',
  '',
  '| Seam | Producer task | Consumer tasks | Integration owner | Integration check |',
  '|---|---|---|---|---|',
  '| `GET /api/search` | 02 | 03 | 03 | C-03 |',
  '',
].join('\n');

interface Project {
  plan: string;
  run(...args: string[]): Outcome;
  write(relative: string, body: string): Promise<void>;
  read(relative: string): Promise<string>;
  dispose(): Promise<void>;
}

async function project(options: { state?: boolean } = {}): Promise<Project> {
  const root = await mkdtemp(path.join(tmpdir(), 'maestro-plan-units-'));
  const maestro = path.join(root, '.maestro');
  const plan = path.join(maestro, DIR);
  await mkdir(path.join(plan, 'tasks'), { recursive: true });
  await copyFile(SYNC, path.join(maestro, 'sync.mts'));
  await cp('skills/maestro/tools/runtime', path.join(maestro, 'runtime'), { recursive: true });
  if (options.state !== false) {
    await writeFile(path.join(maestro, 'state.js'), `globalThis.MAESTRO_STATE = ${JSON.stringify({ contractVersion: 10, dir: DIR })};\n`);
  }
  const files: Record<string, string> = {
    'tasks/02-search-page.md': TASK_02, 'tasks/03-verify-search.md': TASK_03,
    'shared.md': SHARED, 'interfaces.md': INTERFACES,
  };
  for (const [relative, body] of Object.entries(files)) await writeFile(path.join(plan, relative), body);
  return {
    plan,
    run(...args) {
      const done = spawnSync(process.execPath, [path.join(maestro, 'sync.mts'), ...args], { encoding: 'utf8', cwd: root });
      return { ...JSON.parse(done.stdout.split('\n')[0] || '{}') as Record<string, unknown>, code: done.status ?? -1, stderr: done.stderr };
    },
    write: (relative, body) => writeFile(path.join(plan, relative), body),
    read: relative => readFile(path.join(plan, relative), 'utf8'),
    dispose: () => rm(root, { recursive: true, force: true }),
  };
}

const unitsOf = (outcome: Outcome, task: string): Array<{ id: string; changed: boolean }> =>
  ((outcome['tasks'] as Array<{ id: string; units: Array<{ id: string; changed: boolean }> }>).find(entry => entry.id === task))!.units;

test('--plan-units before the render reports a stale facts section; after it, a clean plan', async () => {
  const target = await project();
  try {
    const stale = target.run('--plan-units');
    assert.equal(stale.code, 1, stale.stderr);
    assert.deepEqual((stale['violations'] as Array<{ kind: string; task: string }>).map(v => [v.kind, v.task]),
      [['stale-facts', '02'], ['stale-facts', '03']]);
    const rendered = target.run('--plan-render');
    assert.equal(rendered.code, 0, rendered.stderr);
    assert.deepEqual(rendered['changed'], ['02', '03']);
    const clean = target.run('--plan-units');
    assert.equal(clean.code, 0, JSON.stringify(clean));
    assert.equal(clean['changed'], 3, 'no baseline yet: every unit is to be read');
    assert.match(clean.stderr, /INFO \[plan-units\.units\] plan listed/);
  } finally { await target.dispose(); }
});

test('--plan-render writes only the facts sections, and the copy is the fact verbatim', async () => {
  const target = await project();
  try {
    target.run('--plan-render');
    const task = await target.read('tasks/02-search-page.md');
    assert.ok(task.startsWith(TASK_02.replace(/\s+$/, '')), 'the task text before the section is untouched');
    assert.ok(task.includes(FACTS_START));
    assert.ok(task.includes('### F-1 — District source\n\nThe district comes from the address path.'));
    assert.deepEqual((await readdir(path.join(target.plan, 'tasks'))).sort(), ['02-search-page.md', '03-verify-search.md'],
      'no temporary file is left behind');
    assert.equal(await target.read('shared.md'), SHARED);
  } finally { await target.dispose(); }
});

test('--plan-render refuses an unknown fact id and touches no file', async () => {
  const target = await project();
  try {
    await target.write('tasks/03-verify-search.md', TASK_03.replace('F-1', 'F-9'));
    const refused = target.run('--plan-render');
    assert.equal(refused.code, 1);
    assert.equal(refused['result'], 'refused');
    assert.deepEqual((refused['violations'] as Array<{ id: string }>).map(v => v.id), ['F-9']);
    assert.equal(await target.read('tasks/02-search-page.md'), TASK_02, 'a refusal writes nothing, even where it could');
  } finally { await target.dispose(); }
});

for (const [name, markers] of [
  ['missing end', FACTS_START],
  ['missing start', FACTS_END],
  ['reversed', `${FACTS_END}\n${FACTS_START}`],
  ['nested', `${FACTS_START}\n${FACTS_START}\n${FACTS_END}`],
  ['two sections', `${FACTS_START}\n${FACTS_END}\n${FACTS_START}\n${FACTS_END}`],
]) {
  test(`a ${name} facts section refuses every plan command without modifying tasks or baseline`, async () => {
    const target = await project();
    try {
      assert.equal(target.run('--plan-render').code, 0);
      assert.equal(target.run('--plan-units', '--record').code, 0);
      const baseline = await target.read('tasks/units.json');
      await target.write('tasks/02-search-page.md', TASK_02);
      const broken = `${TASK_03}\n${markers}\n## Acceptance\n\n- \`U2\` Preserve user data.\n`;
      await target.write('tasks/03-verify-search.md', broken);
      await target.write('return.txt', 'U1: ok\nU2: ok\n');
      for (const args of [
        ['--plan-render'], ['--plan-units'], ['--plan-units', '--record'],
        ['--plan-coverage', '03', path.join(target.plan, 'return.txt')],
      ]) {
        const refused = target.run(...args);
        assert.equal(refused.code, 1, JSON.stringify(refused));
        assert.match(JSON.stringify(refused['violations']), /malformed-facts/);
        assert.equal(await target.read('tasks/02-search-page.md'), TASK_02);
        assert.equal(await target.read('tasks/03-verify-search.md'), broken);
        assert.equal(await target.read('tasks/units.json'), baseline);
      }
    } finally { await target.dispose(); }
  });
}

test('inline facts markers are task text and remain intact when facts are rendered', async () => {
  const target = await project();
  try {
    const task = `${TASK_02}\n- \`U3\` Display \`${FACTS_START}\` and \`${FACTS_END}\` literally.\n`;
    await target.write('tasks/02-search-page.md', task);
    assert.equal(target.run('--plan-render').code, 0);
    assert.ok((await target.read('tasks/02-search-page.md')).startsWith(task.trimEnd()));
    assert.equal(target.run('--plan-units').code, 0);
  } finally { await target.dispose(); }
});

test('a delimiter inside a shared fact refuses rendering before any task is written', async () => {
  const target = await project();
  try {
    await target.write('shared.md', `${SHARED}\n${FACTS_END}\n`);
    const refused = target.run('--plan-render');
    assert.equal(refused.code, 1, JSON.stringify(refused));
    assert.match(JSON.stringify(refused['violations']), /malformed-facts/);
    assert.equal(await target.read('tasks/02-search-page.md'), TASK_02);
    assert.equal(await target.read('tasks/03-verify-search.md'), TASK_03);
  } finally { await target.dispose(); }
});

test('removing a unit requires a fresh task and consistency reading of what remains', async () => {
  const target = await project();
  try {
    assert.equal(target.run('--plan-render').code, 0);
    assert.equal(target.run('--plan-units', '--record').code, 0);
    await target.write('tasks/02-search-page.md', (await target.read('tasks/02-search-page.md')).replace('- `U2` Render page p.\n', ''));
    const listed = target.run('--plan-units');
    assert.equal(listed.code, 0, JSON.stringify(listed));
    assert.deepEqual(unitsOf(listed, '02').filter(u => u.changed).map(u => u.id), ['U1']);
    assert.deepEqual(unitsOf(listed, '03').filter(u => u.changed), []);
    await target.write('return.txt', '');
    const file = path.join(target.plan, 'return.txt');
    assert.equal(target.run('--plan-coverage', '02', file).code, 1);
    await target.write('return.txt', 'U1: ok\n');
    assert.equal(target.run('--plan-coverage', '02', file).code, 0);
    await target.write('return.txt', 'T02: ok\nseam GET /api/search: ok\n');
    const consistency = target.run('--plan-coverage', 'consistency', file);
    assert.equal(consistency.code, 0, JSON.stringify(consistency));
    assert.deepEqual(consistency['requested'], ['T02', 'seam GET /api/search']);
  } finally { await target.dispose(); }
});

test('after --record only rewritten units, and units citing a changed fact, are changed', async () => {
  const target = await project();
  try {
    target.run('--plan-render');
    const recorded = target.run('--plan-units', '--record');
    assert.equal(recorded.code, 0, recorded.stderr);
    assert.equal(recorded['recorded'], true);
    assert.equal(target.run('--plan-units')['changed'], 0);

    await target.write('tasks/02-search-page.md', (await target.read('tasks/02-search-page.md')).replace('Render page p.', 'Render page p and q.'));
    const one = target.run('--plan-units');
    assert.deepEqual(unitsOf(one, '02').filter(unit => unit.changed).map(unit => unit.id), ['U2']);
    assert.deepEqual(unitsOf(one, '03').filter(unit => unit.changed), []);

    await target.write('shared.md', SHARED.replace('address path', 'query string'));
    target.run('--plan-render');
    const fact = target.run('--plan-units');
    assert.deepEqual(unitsOf(fact, '02').filter(unit => unit.changed).map(unit => unit.id), ['U1', 'U2']);
    assert.deepEqual(unitsOf(fact, '03').filter(unit => unit.changed).map(unit => unit.id), ['U1']);
  } finally { await target.dispose(); }
});

test('--plan-coverage: covered exits 0, a skipped unit exits 1, bad arguments exit 2', async () => {
  const target = await project();
  try {
    target.run('--plan-render');
    await target.write('r02.txt', '02\nU1: ok\nU2: finding — undefined term\n  «Render page p.»\n');
    const covered = target.run('--plan-coverage', '02', path.join(target.plan, 'r02.txt'));
    assert.equal(covered.code, 0, JSON.stringify(covered));
    assert.equal(covered['findings'], 1);

    await target.write('r02b.txt', '02\nU1: ok\n');
    const incomplete = target.run('--plan-coverage', '02', path.join(target.plan, 'r02b.txt'));
    assert.equal(incomplete.code, 1);
    assert.deepEqual(incomplete['missing'], ['U2']);

    await target.write('rc.txt', 'T02: ok\nT03: ok\nseam GET /api/search: ok\n');
    const consistency = target.run('--plan-coverage', 'consistency', path.join(target.plan, 'rc.txt'));
    assert.equal(consistency.code, 0, JSON.stringify(consistency));
    assert.deepEqual(consistency['requested'], ['T02', 'T03', 'seam GET /api/search']);

    assert.equal(target.run('--plan-coverage', '07', path.join(target.plan, 'r02.txt')).code, 2);
    assert.equal(target.run('--plan-coverage', '02').code, 2);
  } finally { await target.dispose(); }
});

test('a later round asks a reader only about the units that changed', async () => {
  const target = await project();
  try {
    target.run('--plan-render');
    target.run('--plan-units', '--record');
    await target.write('tasks/02-search-page.md', (await target.read('tasks/02-search-page.md')).replace('Render page p.', 'Render page p and q.'));
    await target.write('r.txt', 'U2: ok\n');
    const narrowed = target.run('--plan-coverage', '02', path.join(target.plan, 'r.txt'));
    assert.equal(narrowed.code, 0, JSON.stringify(narrowed));
    assert.deepEqual(narrowed['requested'], ['U2']);
    await target.write('rc.txt', 'T02: ok\nseam GET /api/search: ok\n');
    assert.deepEqual(target.run('--plan-coverage', 'consistency', path.join(target.plan, 'rc.txt'))['requested'],
      ['T02', 'seam GET /api/search'], 'таск 03 did not change, and the seam is asked about because 02 produces it');
  } finally { await target.dispose(); }
});

test('a return sent back for its missing units is checked together with the first one', async () => {
  const target = await project();
  try {
    target.run('--plan-render');
    await target.write('r1-02.md', '02\nU1: ok\n');
    await target.write('r1-02-2.md', '02\nU2: ok\n');
    const first = path.join(target.plan, 'r1-02.md');
    const resent = path.join(target.plan, 'r1-02-2.md');
    assert.deepEqual(target.run('--plan-coverage', '02', first)['missing'], ['U2']);
    const together = target.run('--plan-coverage', '02', first, resent);
    assert.equal(together.code, 0, JSON.stringify(together));
    assert.deepEqual(together['requested'], ['U1', 'U2']);
    await target.write('r1-02-3.md', '02\nU1: ok\n');
    const twice = target.run('--plan-coverage', '02', first, path.join(target.plan, 'r1-02-3.md'));
    assert.equal(twice.code, 1, 'a unit judged in two returns is still judged twice');
    assert.deepEqual(twice['duplicate'], ['U1']);
    assert.equal(target.run('--plan-coverage', '02', first, path.join(target.plan, 'absent.md')).code, 2);
  } finally { await target.dispose(); }
});

test('an edit outside every unit makes every unit of that таск changed, and no other таск', async () => {
  const target = await project();
  try {
    await target.write('tasks/03-verify-search.md', TASK_03.replace('## Done means', '| Boundaries | owns tests/search.spec.ts |\n\n## Done means'));
    target.run('--plan-render');
    target.run('--plan-units', '--record');
    assert.equal(target.run('--plan-units')['changed'], 0);
    await target.write('tasks/03-verify-search.md', (await target.read('tasks/03-verify-search.md')).replace('tests/search.spec.ts', 'tests/other.spec.ts'));
    const edited = target.run('--plan-units');
    assert.deepEqual(unitsOf(edited, '03').filter(unit => unit.changed).map(unit => unit.id), ['U1']);
    assert.deepEqual(unitsOf(edited, '02').filter(unit => unit.changed), []);
    target.run('--plan-units', '--record');
    await target.write('shared.md', SHARED.replace('address path', 'query string'));
    target.run('--plan-render');
    assert.deepEqual(unitsOf(target.run('--plan-units'), '02').filter(unit => unit.changed).map(unit => unit.id), ['U1'],
      'a re-rendered facts section is not an edit outside the units: only the unit citing the fact is changed');
  } finally { await target.dispose(); }
});

test('--all asks about every таск and seam even when nothing changed, the way repair re-reads a built plan', async () => {
  const target = await project();
  try {
    target.run('--plan-render');
    target.run('--plan-units', '--record');
    await target.write('rc.txt', 'T02: ok\nT03: ok\nseam GET /api/search: ok\n');
    const narrowed = target.run('--plan-coverage', 'consistency', path.join(target.plan, 'rc.txt'));
    assert.deepEqual(narrowed['requested'], [], 'nothing changed, so a round asks about nothing');
    assert.equal(narrowed.code, 1, 'and a full return is then all unknown ids');
    const all = target.run('--plan-coverage', 'consistency', path.join(target.plan, 'rc.txt'), '--all');
    assert.equal(all.code, 0, JSON.stringify(all));
    assert.deepEqual(all['requested'], ['T02', 'T03', 'seam GET /api/search']);
  } finally { await target.dispose(); }
});

test('no readable state.js exits 2 and names the fix', async () => {
  const target = await project({ state: false });
  try {
    const outcome = target.run('--plan-units');
    assert.equal(outcome.code, 2);
    assert.match(String(outcome['error']), /publish the state first/);
  } finally { await target.dispose(); }
});
