// What a closing publish writes into `.maestro/PROGRESS.md`, and what it
// carries from the file it replaces. Each test is one row of the fact table or
// the carry table in the plan "Where The Work Stands Between Прогоны", or one
// property of the render: byte-exact, round-tripping, and trimmed only where
// trimming loses nothing a later run still has to do.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ITEM_MAX, PROGRESS_LINE_BUDGET, buildProgress, itemsFromState, parseHeaderCommit, parseProgress,
  type ProgressItem,
} from './progress.ts';
import type { RunState } from '../state/contract.ts';
import { contract10State, finding } from '../state/fixtures/verification.ts';

const DIR = '2026-09-29-synthetic-menu';
const OTHER = '2026-09-01-pricing';

/** The closed contract-10 delivery, with one requirement more for each test to bend. */
function closing(): RunState {
  return contract10State();
}

const keys = (items: readonly ProgressItem[]): string[] => items.map(item => item.key ?? `raw:${item.text}`);
const texts = (items: readonly ProgressItem[]): string[] => items.map(item => item.text);

/** A previous file written by an earlier closure of another run. */
function previousFile(sections: { settled?: string[]; notDone?: string[]; knownBugs?: string[]; fixes?: string[] }, header = `Closed ${OTHER} on 2026-09-01T10:00:00Z, outcome completed, at commit 1111111.`): string {
  const block = (lines: string[] | undefined): string => (lines && lines.length > 0 ? lines.join('\n') : 'None.');
  return [
    '# Where The Work Stands', '',
    header,
    'Maestro rewrites this file at every closure. Add lines only under «Fixes Without Maestro».',
    'Decisions are not repeated here: each run\'s `decisions.md` and the memory block hold them.',
    'What a run assumed on its own is in that run\'s `report.md` › Assumptions.', '',
    '## Settled By The User', '', block(sections.settled), '',
    '## Not Done', '', block(sections.notDone), '',
    '## Known Bugs', '', block(sections.knownBugs), '',
    '## Fixes Without Maestro', '', block(sections.fixes), '',
  ].join('\n');
}

// --- the fact table ----------------------------------------------------------

test('a deferred требование is not done, keyed by its run and named with its reason', () => {
  const state = closing();
  state.requirements.push({ id: 'R03', status: 'deferred', reason: 'no prices yet', title: 'Pricing table' });
  const items = itemsFromState(state);
  assert.deepEqual(texts(items.notDone), ['R03 Pricing table — deferred: no prices yet']);
  assert.deepEqual(keys(items.notDone), [`${DIR}#R03`]);
});

test('a placeholder требование is not done and waits on the user', () => {
  const state = closing();
  state.requirements.push({ id: 'R03', status: 'placeholder', reason: 'the logo file', title: 'Logo' });
  assert.deepEqual(texts(itemsFromState(state).notDone), ['R03 Logo — waiting on the user: the logo file']);
});

test('an in-spec требование acceptance found incomplete is not built', () => {
  const state = closing();
  state.requirements.push({ id: 'R05', status: 'in-spec', title: 'Keyboard navigation' });
  const items = itemsFromState(state);
  assert.deepEqual(texts(items.notDone), ['R05 Keyboard navigation — not built: acceptance found it incomplete']);
  assert.deepEqual(items.knownBugs, []);
});

test('a failed таск is not done and names the требования it served', () => {
  const state = closing();
  state.tasks.push({ ...state.tasks[0]!, id: '02', title: 'Build checkout', requirementIds: ['R01', 'R02'], status: 'failed' });
  const items = itemsFromState(state);
  assert.deepEqual(texts(items.notDone), ['таск 02 Build checkout — failed (R01, R02)']);
  assert.deepEqual(keys(items.notDone), [`${DIR}#T02`]);
});

test('an open finding no exception covers is a known bug, and its требование gets no second line', () => {
  const state = closing();
  state.verification!.findings.push(finding('F-1', { description: 'Menu flickers on hover' }));
  const items = itemsFromState(state);
  assert.deepEqual(texts(items.knownBugs), ['Menu flickers on hover (R01)']);
  assert.deepEqual(keys(items.knownBugs), [`${DIR}#F-1`]);
});

test('an open finding an accepted exception covers is a known bug carrying the user\'s authorization', () => {
  const state = closing();
  state.verification!.findings.push(finding('F-2', { description: 'Menu flickers on hover' }));
  state.verification!.decisions.push({ id: 'D-1', kind: 'accepted_exception', authorizedBy: 'user',
    authorizedAt: '2026-09-29T09:18:00Z', authorization: 'оставь мерцание как есть',
    presentedFindingIds: ['F-2'], selectedFindingIds: ['F-2'], presentedObligationIds: [], selectedObligationIds: [] });
  assert.deepEqual(texts(itemsFromState(state).knownBugs),
    ['Menu flickers on hover (R01) — accepted by the user: «оставь мерцание как есть»']);
});

test('a требование that failed acceptance with no open finding naming it is a known bug', () => {
  const state = closing();
  state.verification!.executions[0]!.result = 'failed';
  state.requirements[0]!.title = 'Menu opens on hover';
  const items = itemsFromState(state);
  assert.deepEqual(texts(items.knownBugs), ['R01 Menu opens on hover — failed acceptance']);
  assert.deepEqual(keys(items.knownBugs), [`${DIR}#R01`]);
});

test('a dropped требование is settled, with the user\'s reason quoted', () => {
  const state = closing();
  state.requirements.push({ id: 'R04', status: 'dropped', reason: 'не нужно', title: 'Dark mode' });
  const items = itemsFromState(state);
  assert.deepEqual(texts(items.settled), ['R04 Dark mode — dropped: «не нужно»']);
  assert.deepEqual(keys(items.settled), [`${DIR}#R04`]);
});

test('a требование with no title points at the манифест instead', () => {
  const state = closing();
  state.requirements.push({ id: 'R03', status: 'deferred', reason: 'later' });
  assert.deepEqual(texts(itemsFromState(state).notDone), [`R03 (see .maestro/${DIR}/manifest.md) — deferred: later`]);
});

test('an item longer than the limit is cut with an ellipsis, inside its quotation and never past the closing guillemet', () => {
  const state = closing();
  state.requirements.push({ id: 'R04', status: 'dropped', reason: 'я'.repeat(400), title: 'Dark mode' });
  state.requirements.push({ id: 'R05', status: 'deferred', reason: 'x'.repeat(400), title: 'Exports' });
  const items = itemsFromState(state);
  const settled = items.settled[0]!.text;
  assert.equal(settled.length, ITEM_MAX);
  assert.ok(settled.startsWith('R04 Dark mode — dropped: «я'));
  assert.ok(settled.endsWith('я…»'));
  const notDone = items.notDone[0]!.text;
  assert.equal(notDone.length, ITEM_MAX);
  assert.ok(notDone.endsWith('x…'));
});

// --- the carry table ---------------------------------------------------------

test('an open item from another run is carried unchanged when the user said nothing about it', () => {
  const previous = previousFile({ notDone: [`- [${OTHER}#R02] R02 Exports — deferred: later`], knownBugs: [`- [${OTHER}#F-3] Total is off by one (R01)`] });
  const parsed = parseProgress(buildProgress({ state: closing(), previous, priorFixes: null, commit: 'abc1234' }));
  assert.deepEqual(texts(parsed.notDone), ['R02 Exports — deferred: later']);
  assert.deepEqual(keys(parsed.knownBugs), [`${OTHER}#F-3`]);
});

test('an open item the user took into this run is removed, because the run now owns it', () => {
  const state = closing();
  state.leftovers = [{ key: `${OTHER}#R02`, disposition: 'taken', answer: 'возьми R02', at: '2026-09-29T09:05:00Z' }];
  const previous = previousFile({ notDone: [`- [${OTHER}#R02] R02 Exports — deferred: later`] });
  const parsed = parseProgress(buildProgress({ state, previous, priorFixes: null, commit: null }));
  assert.deepEqual(parsed.notDone, []);
  assert.deepEqual(parsed.settled, []);
});

test('an open item the user dismissed moves to settled with the answer and its date', () => {
  const state = closing();
  state.leftovers = [{ key: `${OTHER}#F-3`, disposition: 'dismissed', answer: 'уже не важно', at: '2026-09-29T09:05:00Z' }];
  const previous = previousFile({ knownBugs: [`- [${OTHER}#F-3] Total is off by one (R01)`] });
  const parsed = parseProgress(buildProgress({ state, previous, priorFixes: null, commit: null }));
  assert.deepEqual(parsed.knownBugs, []);
  assert.deepEqual(texts(parsed.settled), ['Total is off by one (R01) — dismissed 2026-09-29: «уже не важно»']);
  assert.deepEqual(keys(parsed.settled), [`${OTHER}#F-3`]);
});

test('a reopened run closing again regenerates its own items, so none is listed twice', () => {
  const first = closing();
  first.requirements.push({ id: 'R03', status: 'deferred', reason: 'later', title: 'Exports' });
  const once = buildProgress({ state: first, previous: null, priorFixes: null, commit: 'aaa1111' });
  const again = closing();
  again.requirements.push({ id: 'R03', status: 'deferred', reason: 'later', title: 'Exports' });
  again.requirements.push({ id: 'R04', status: 'deferred', reason: 'next month', title: 'Import' });
  const parsed = parseProgress(buildProgress({ state: again, previous: once, priorFixes: null, commit: 'bbb2222' }));
  assert.deepEqual(keys(parsed.notDone), [`${DIR}#R03`, `${DIR}#R04`]);
  assert.equal(parsed.header?.commit, 'bbb2222');
});

test('settled items are carried, and past the line budget the oldest go first behind a count', () => {
  const settled = Array.from({ length: 70 }, (_, index) => `- [${OTHER}#R${String(index + 1).padStart(2, '0')}] R${index + 1} dropped: «нет»`);
  const text = buildProgress({ state: closing(), previous: previousFile({ settled }), priorFixes: null, commit: null });
  const lines = text.trimEnd().split('\n');
  assert.ok(lines.length <= PROGRESS_LINE_BUDGET, `${lines.length} lines`);
  const parsed = parseProgress(text);
  assert.equal(parsed.settled.at(-1)!.key, `${OTHER}#R70`);
  assert.equal(parsed.settled.some(item => item.key === `${OTHER}#R01`), false);
  assert.ok(parsed.settledOmitted > 0);
  assert.match(text, new RegExp(`^- ${parsed.settledOmitted} earlier settled items: see the reports under \\.maestro/$`, 'm'));
});

test('an earlier count of trimmed settled items grows rather than resets', () => {
  const settled = ['- 5 earlier settled items: see the reports under .maestro/',
    ...Array.from({ length: 60 }, (_, index) => `- [${OTHER}#R${index + 1}] R${index + 1} dropped: «нет»`)];
  const parsed = parseProgress(buildProgress({ state: closing(), previous: previousFile({ settled }), priorFixes: null, commit: null }));
  assert.ok(parsed.settledOmitted > 5);
  assert.equal(parsed.settledOmitted + parsed.settled.length, 65);
});

test('not-done items and known bugs are never trimmed, whatever the length', () => {
  const notDone = Array.from({ length: 80 }, (_, index) => `- [${OTHER}#R${index + 1}] R${index + 1} — deferred: later`);
  const text = buildProgress({ state: closing(), previous: previousFile({ notDone }), priorFixes: null, commit: null });
  assert.equal(parseProgress(text).notDone.length, 80);
});

test('a line in an owned section the parser cannot read is kept verbatim, never dropped', () => {
  const previous = previousFile({ notDone: ['- remember to rotate the key', `- [${OTHER}#R02] R02 Exports — deferred: later`] });
  const text = buildProgress({ state: closing(), previous, priorFixes: null, commit: null });
  assert.match(text, /^- remember to rotate the key$/m);
  const parsed = parseProgress(text);
  assert.deepEqual(parsed.unparsed.map(entry => entry.section), ['notDone']);
  assert.deepEqual(keys(parsed.notDone), ['raw:- remember to rotate the key', `${OTHER}#R02`]);
});

test('a fix this run\'s preflight already read is removed, and one added since is kept', () => {
  const previous = previousFile({ fixes: ['- 2026-09-20 fixed the footer link by hand', '- 2026-09-28 bumped node to 22.18'] });
  const text = buildProgress({ state: closing(), previous, priorFixes: ['- 2026-09-20 fixed the footer link by hand'], commit: null });
  assert.deepEqual(parseProgress(text).fixes, ['- 2026-09-28 bumped node to 22.18']);
});

test('with no prior.md for this run every fix is kept', () => {
  const previous = previousFile({ fixes: ['- fixed the footer link by hand'] });
  assert.deepEqual(parseProgress(buildProgress({ state: closing(), previous, priorFixes: null, commit: null })).fixes,
    ['- fixed the footer link by hand']);
});

test('with no previous file the progress file is built from the state alone', () => {
  const state = closing();
  state.requirements.push({ id: 'R03', status: 'deferred', reason: 'later', title: 'Exports' });
  const parsed = parseProgress(buildProgress({ state, previous: null, priorFixes: null, commit: null }));
  assert.deepEqual(keys(parsed.notDone), [`${DIR}#R03`]);
  assert.deepEqual(parsed.fixes, []);
  assert.equal(parsed.header?.commit, null);
});

// --- the render --------------------------------------------------------------

test('the progress file renders byte for byte from a fixture', () => {
  const state = closing();
  state.requirements.push({ id: 'R03', status: 'deferred', reason: 'no prices yet', title: 'Pricing table' });
  state.requirements.push({ id: 'R04', status: 'dropped', reason: 'не нужно', title: 'Dark mode' });
  const text = buildProgress({ state, previous: previousFile({ fixes: ['- bumped node by hand'] }), priorFixes: [], commit: 'abc1234' });
  assert.equal(text, [
    '# Where The Work Stands',
    '',
    `Closed ${DIR} on 2026-09-29T09:20:00Z, outcome completed, at commit abc1234.`,
    'Maestro rewrites this file at every closure. Add lines only under «Fixes Without Maestro».',
    'Decisions are not repeated here: each run\'s `decisions.md` and the memory block hold them.',
    'What a run assumed on its own is in that run\'s `report.md` › Assumptions.',
    '',
    '## Settled By The User',
    '',
    `- [${DIR}#R04] R04 Dark mode — dropped: «не нужно»`,
    '',
    '## Not Done',
    '',
    `- [${DIR}#R03] R03 Pricing table — deferred: no prices yet`,
    '',
    '## Known Bugs',
    '',
    'None.',
    '',
    '## Fixes Without Maestro',
    '',
    '- bumped node by hand',
    '',
  ].join('\n'));
});

test('parsing a rendered file and rendering it again changes nothing', () => {
  const state = closing();
  state.requirements.push({ id: 'R03', status: 'deferred', reason: 'later', title: 'Exports' });
  const once = buildProgress({ state, previous: previousFile({ notDone: [`- [${OTHER}#R02] R02 — deferred: later`], fixes: ['- by hand'] }), priorFixes: null, commit: 'abc1234' });
  const twice = buildProgress({ state, previous: once, priorFixes: null, commit: 'abc1234' });
  assert.equal(twice, once);
});

test('the header line reads back as the closure it records, and none as no commit', () => {
  assert.deepEqual(parseHeaderCommit(previousFile({})), { dir: OTHER, closedAt: '2026-09-01T10:00:00Z', outcome: 'completed', commit: '1111111' });
  assert.equal(parseHeaderCommit(previousFile({}, `Closed ${OTHER} on 2026-09-01T10:00:00Z, outcome completed, at commit none.`))?.commit, null);
  assert.equal(parseHeaderCommit('# Where The Work Stands\n\nsomebody rewrote this\n'), null);
});
