// The plan's units, shared facts and reader coverage, as pure functions.
//
// Each test is one rule of the plan "Plan Readers Enumerate, Fixes Rewrite,
// Shared Facts Live Once": where a unit ends, what makes a fact or unit id a
// violation, what the render copies, when a passage counts as restated, what
// makes a unit changed, and what a reader's return failed to cover.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FACTS_END,
  FACTS_START,
  RESTATED_MIN,
  changedUnits,
  checkCoverage,
  currentFactsSection,
  parseSeams,
  parseSharedFacts,
  parseTaskUnits,
  renderFactsSection,
  restatedPassages,
  withFactsSection,
  type Baseline,
} from '../../skills/maestro/tools/runtime/plan-units.mts';

const TASK = [
  '# Таск 03 — The search page',
  '',
  '| Model | `standard` |',
  '',
  '## What to build',
  '',
  '- `U1` Keep the district from the address, as F-2 says.',
  '  The page reads it on load.',
  '- `U2` Render page p.',
  '',
  '## Done means',
  '',
  '- `U3` The search test passes; see F-1 and F-2.',
  '',
].join('\n');

const SHARED = [
  '# Shared facts',
  '',
  '### F-1 — Row 1.9.18 oracle',
  '',
  'The old site keeps `?rooms=2` on reload.',
  '',
  '### F-2 — District source',
  '',
  'The district comes from the address path.',
  '',
].join('\n');

test('a unit runs to the next unit or heading, and its text is what it hashes', () => {
  const { units, violations } = parseTaskUnits(TASK);
  assert.deepEqual(violations, []);
  assert.deepEqual(units.map(unit => unit.id), ['U1', 'U2', 'U3']);
  const reflowed = parseTaskUnits(TASK.replace('  The page reads it on load.', '    The page   reads it on load.'));
  assert.equal(reflowed.units[0]!.hash, units[0]!.hash, 'whitespace alone does not change a unit');
  const rewritten = parseTaskUnits(TASK.replace('reads it on load', 'reads it on submit'));
  assert.notEqual(rewritten.units[0]!.hash, units[0]!.hash);
  assert.equal(rewritten.units[1]!.hash, units[1]!.hash, 'the next unit is not part of the first');
});

test('a unit names the facts it cites, once each, in number order', () => {
  const { units } = parseTaskUnits(TASK);
  assert.deepEqual(units.map(unit => unit.facts), [['F-2'], [], ['F-1', 'F-2']]);
});

test('the facts section holds no units, and a unit stops at its marker', () => {
  const rendered = renderFactsSection(['F-1'], parseSharedFacts(SHARED).facts).section;
  const withSection = withFactsSection(TASK, rendered).replace(FACTS_START, `- \`U9\` not a unit\n${FACTS_START}`);
  const ids = parseTaskUnits(withSection).units.map(unit => unit.id);
  assert.deepEqual(ids, ['U1', 'U2', 'U3', 'U9']);
  assert.ok(!parseTaskUnits(withSection).units.at(-1)!.facts.length, 'the rendered fact text is not part of U9');
});

test('a unit id twice and a file with no unit are violations', () => {
  assert.deepEqual(parseTaskUnits(`${TASK}- \`U2\` again\n`).violations.map(v => [v.kind, v.id]), [['duplicate-unit', 'U2']]);
  assert.deepEqual(parseTaskUnits('# Таск 04\n\nBuild it.\n').violations.map(v => v.kind), ['no-units']);
});

test('a fact defined twice is a violation, and the first definition stands', () => {
  const { facts, violations } = parseSharedFacts(`${SHARED}### F-1 — Again\n\nOther text.\n`);
  assert.deepEqual(violations.map(v => [v.kind, v.id]), [['duplicate-fact', 'F-1']]);
  assert.equal(facts.find(fact => fact.id === 'F-1')!.title, 'Row 1.9.18 oracle');
});

test('the render copies every cited fact verbatim, in number order, and names an unknown id', () => {
  const { facts } = parseSharedFacts(SHARED);
  const { section, unknown } = renderFactsSection(['F-2', 'F-1', 'F-7'], facts);
  assert.deepEqual(unknown, ['F-7']);
  assert.ok(section.startsWith(FACTS_START) && section.endsWith(FACTS_END));
  assert.ok(section.indexOf('### F-1 — Row 1.9.18 oracle') < section.indexOf('### F-2 — District source'));
  assert.ok(section.includes('The old site keeps `?rooms=2` on reload.'));
  assert.equal(renderFactsSection([], facts).section, '', 'a task citing nothing carries no section');
});

test('rendering twice changes nothing, and a hand edit inside the markers is undone', () => {
  const { facts } = parseSharedFacts(SHARED);
  const section = renderFactsSection(['F-1', 'F-2'], facts).section;
  const once = withFactsSection(TASK, section);
  assert.equal(withFactsSection(once, section), once);
  const edited = once.replace('on reload', 'on every reload');
  assert.notEqual(currentFactsSection(edited), section);
  assert.equal(withFactsSection(edited, section), once);
  assert.equal(withFactsSection(once, ''), TASK.replace(/\s+$/, '\n'), 'a section nobody cites any more is removed');
});

test(`a sentence of ${RESTATED_MIN} characters in two task files is restated; one shorter is not`, () => {
  const long = `${'x'.repeat(RESTATED_MIN - 1)}.`;
  const short = `${'y'.repeat(RESTATED_MIN - 2)}.`;
  assert.equal(long.length, RESTATED_MIN);
  const found = restatedPassages(new Map([['01', `Intro. ${long} ${short}`], ['02', `${long}\n\n${short}`], ['03', 'Other.']]));
  assert.deepEqual(found.map(passage => passage.tasks), [['01', '02']]);
});

test('text inside the facts section is never counted as restated', () => {
  const long = `${'z'.repeat(RESTATED_MIN)}.`;
  const inSection = `${FACTS_START}\n${long}\n${FACTS_END}`;
  assert.deepEqual(restatedPassages(new Map([['01', inSection], ['02', inSection]])), []);
});

test('a unit is changed by its own text, by a fact it cites, and by interfaces.md', () => {
  const { units } = parseTaskUnits(TASK);
  const { facts } = parseSharedFacts(SHARED);
  const baseline: Baseline = {
    interfaces: 'i1',
    facts: Object.fromEntries(facts.map(fact => [fact.id, fact.hash])),
    tasks: { '03': Object.fromEntries(units.map(unit => [unit.id, unit.hash])) },
  };
  assert.deepEqual(changedUnits('03', units, facts, 'i1', baseline), []);
  assert.deepEqual(changedUnits('03', units, facts, 'i1', undefined), ['U1', 'U2', 'U3'], 'no baseline: everything');
  assert.deepEqual(changedUnits('03', units, facts, 'i2', baseline), ['U1', 'U2', 'U3'], 'interfaces changed: everything');
  const rewritten = parseTaskUnits(TASK.replace('Render page p.', 'Render page p and q.')).units;
  assert.deepEqual(changedUnits('03', rewritten, facts, 'i1', baseline), ['U2']);
  const movedFact = parseSharedFacts(SHARED.replace('address path', 'query string')).facts;
  assert.deepEqual(changedUnits('03', units, movedFact, 'i1', baseline), ['U1', 'U3'], 'every unit citing F-2');
  const added = parseTaskUnits(`${TASK}- \`U4\` New.\n`).units;
  assert.deepEqual(changedUnits('03', added, facts, 'i1', baseline), ['U4']);
});

test('coverage names the units a return skipped, invented and judged twice, and counts findings', () => {
  const text = [
    '03',
    'U1: ok',
    'U2: finding — a contradiction',
    '  «Render page p.» against «Render page q.»',
    '- U2: ok',
    'U7: ok',
  ].join('\n');
  assert.deepEqual(checkCoverage(['U1', 'U2', 'U3'], text), { missing: ['U3'], unknown: ['U7'], duplicate: ['U2'], findings: 1 });
  assert.deepEqual(checkCoverage(['U1'], 'U1: ok\n'), { missing: [], unknown: [], duplicate: [], findings: 0 });
});

test('a consistency return is judged by таск and by seam, a seam matched without its backticks', () => {
  const text = 'T03: ok\nseam `GET /api/search`: finding — CD-1 the method disagrees\nT05: ok\n';
  assert.deepEqual(checkCoverage(['T03', 'T05', 'seam GET /api/search'], text), { missing: [], unknown: [], duplicate: [], findings: 1 });
});

test('the Seams table yields each seam with the таски its producer and consumer cells name', () => {
  const interfaces = [
    '## Seams',
    '',
    '| Seam | Producer task | Consumer tasks | Integration owner | Integration check |',
    '|---|---|---|---|---|',
    '| `GET /api/search` | 02 | 03, 05 | 05 | C-05 |',
    '| icons.css | 02–04, one file each | 12 | 12 | C-12 |',
    '',
    'After.',
  ].join('\n');
  assert.deepEqual(parseSeams(interfaces), [
    { seam: 'GET /api/search', tasks: ['02', '03', '05'] },
    { seam: 'icons.css', tasks: ['02', '03', '04', '12'] },
  ]);
  assert.deepEqual(parseSeams('no table'), []);
});
