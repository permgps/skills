// The OpenSpec export: what the closing publish refuses, what it must still
// accept, and how it writes the change folder.
//
// Each refusal sits beside the legal inputs it must not refuse, because a
// check that only ever sees bad drafts proves nothing about good ones. Trees
// are written by hand in temporary directories; no OpenSpec file is copied
// (D1). The OpenSpec command line is an injected runner here; the sync tests
// drive a real executable on PATH.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  authorisationsOf, checkOpenSpecDraft, closureContext, exportOpenSpecChange, openSpecProgressItems, readOpenSpecIndex,
  type Authorisation, type DraftContext, type DraftFiles, type OpenSpecIndex, type OpenSpecRunner,
} from './openspec.ts';
import { parseAnswers, parseOpenSpecDisposition } from '../gates/answers.ts';
import type { RunState } from '../state/contract.ts';
import { closingExport } from '../../skills/maestro/tools/runtime/publication.mts';

const DIR = '2026-10-18-checkout';

const MAIN_SPEC = [
  '# Checkout', '', '## Purpose', 'How a guest pays for an order and what they see afterwards.', '',
  '## Requirements',
  '### Requirement: Card payment', 'The system SHALL take card payment before the order ships.', '',
  '#### Scenario: Paid order', '- **WHEN** the guest pays by card', '- **THEN** the order is marked paid', '',
  '#### Scenario: Declined card', '- **WHEN** the card is declined', '- **THEN** the order stays unpaid', '',
  '### Requirement: Receipt', 'The system MUST email a receipt.', '',
  '#### Scenario: Receipt sent', '- **WHEN** an order is paid', '- **THEN** a receipt is emailed', '',
].join('\n');

const PROPOSAL = [
  '## Why', 'The run built and verified wallet payment and a receipt on request, so the specification should say so.', '',
  '## What Changes', '- ADDED Wallet payment', '',
].join('\n');

const ADDED = [
  '## ADDED Requirements', '### Requirement: Wallet payment', 'The system SHALL accept wallet payment.', '',
  '#### Scenario: Paid by wallet', '- **WHEN** the guest pays with a wallet', '- **THEN** the order is marked paid', '',
].join('\n');

function metadata(map: Record<string, string[]> = { 'checkout › Wallet payment': ['R01'] }, extra = ''): string {
  return `schema: spec-driven\ncreated: 2026-10-18\nx-maestro-run: ${DIR}\nx-maestro-requirements: ${JSON.stringify(map)}\n${extra}`;
}

function draft(overrides: Record<string, string | null> = {}): DraftFiles {
  const files: Record<string, string | null> = {
    'proposal.md': PROPOSAL,
    'tasks.md': '## 1. Payment\n- [x] 1.1 Add wallet payment\n',
    '.openspec.yaml': metadata(),
    'specs/checkout/spec.md': ADDED,
    ...overrides,
  };
  return new Map(Object.entries(files).filter((entry): entry is [string, string] => entry[1] !== null));
}

const INDEX: OpenSpecIndex = {
  present: true, anchor: 'openspec/config.yaml',
  capabilities: [{ capability: 'checkout', path: 'openspec/specs/checkout/spec.md', requirements: [
    { name: 'Card payment', scenarios: ['Paid order', 'Declined card'] },
    { name: 'Receipt', scenarios: ['Receipt sent'] },
  ] }],
  changes: [], archived: [], incomplete: false, reasons: [], unreadable: [],
};

function context(overrides: Partial<DraftContext> = {}, authorisations: Array<[string, Authorisation]> = []): DraftContext {
  return {
    dir: DIR, results: { R01: 'passed', R02: 'passed', R03: 'failed', R04: 'incomplete', R05: 'passed' },
    excepted: new Set(['R05']), notInSpec: new Set(['R06']), index: INDEX,
    authorisations: new Map(authorisations), ...overrides,
  };
}

const replaceReceipt: [string, Authorisation] = ['checkout › Receipt', { requirementId: 'R02', disposition: 'replace', renamedTo: null, userAnswered: true }];

test('a draft of one ADDED requirement mapped to a passed R id has no problems', () => {
  assert.deepEqual(checkOpenSpecDraft(draft(), context()), []);
});

test('only passed requirements are exported: failed, incomplete, excepted, dropped and unknown ids are each refused', () => {
  for (const [id, pattern] of [['R03', /is failed/], ['R04', /is incomplete/], ['R05', /accepted exception/], ['R06', /dropped, deferred or a placeholder/], ['R99', /not in the verification projection/]] as const) {
    const problems = checkOpenSpecDraft(draft({ '.openspec.yaml': metadata({ 'checkout › Wallet payment': [id] }) }), context());
    assert.equal(problems.length, 1, `${id}: ${problems.join(' | ')}`);
    assert.match(problems[0]!, pattern);
  }
});

test('an exported requirement missing from the mapping, and a mapping naming nothing exported, are both refused', () => {
  assert.match(checkOpenSpecDraft(draft({ '.openspec.yaml': metadata({}) }), context()).join(' '), /is not in x-maestro-requirements/);
  const orphan = checkOpenSpecDraft(draft({ '.openspec.yaml': metadata({ 'checkout › Wallet payment': ['R01'], 'checkout › Ghost': ['R02'] }) }), context());
  assert.deepEqual(orphan.length, 1);
  assert.match(orphan[0]!, /names "checkout › Ghost", which no ADDED or MODIFIED block exports/);
});

test('a requirement without SHALL or MUST, or without a scenario that has a body, is refused', () => {
  const noKeyword = ADDED.replace('The system SHALL accept wallet payment.', 'The system accepts wallet payment.');
  assert.match(checkOpenSpecDraft(draft({ 'specs/checkout/spec.md': noKeyword }), context()).join(' '), /neither SHALL nor MUST/);
  const bareScenario = ['## ADDED Requirements', '### Requirement: Wallet payment', 'The system SHALL accept wallet payment.', '', '#### Scenario: Paid by wallet', ''].join('\n');
  assert.match(checkOpenSpecDraft(draft({ 'specs/checkout/spec.md': bareScenario }), context()).join(' '), /no "####" scenario with a body/);
});

test('ADDED of an approved name, or of a near-miss of one, is refused', () => {
  const again = ADDED.replace('Wallet payment', 'Card payment');
  assert.match(checkOpenSpecDraft(draft({ 'specs/checkout/spec.md': again, '.openspec.yaml': metadata({ 'checkout › Card payment': ['R01'] }) }), context()).join(' '), /already exists/);
  const near = ADDED.replace('Wallet payment', 'card  Payment');
  assert.match(checkOpenSpecDraft(draft({ 'specs/checkout/spec.md': near, '.openspec.yaml': metadata({ 'checkout › card  Payment': ['R01'] }) }), context()).join(' '), /only in case or spacing/);
});

const MODIFIED = [
  '## MODIFIED Requirements', '### Requirement: Receipt', 'The system MUST email a receipt only when the guest asks for one.', '',
  '#### Scenario: Receipt sent', '- **WHEN** an order is paid and the guest asked', '- **THEN** a receipt is emailed', '',
  '#### Scenario: No receipt asked', '- **WHEN** the guest did not ask', '- **THEN** no receipt is sent', '',
].join('\n');

test('MODIFIED needs a user-answered replace; with it, and every current scenario kept, it passes', () => {
  const files = draft({ 'specs/checkout/spec.md': MODIFIED, '.openspec.yaml': metadata({ 'checkout › Receipt': ['R02'] }) });
  assert.match(checkOpenSpecDraft(files, context()).join(' '), /without a user-answered "OpenSpec: checkout › Receipt — replace"/);
  assert.deepEqual(checkOpenSpecDraft(files, context({}, [replaceReceipt])), []);
  const selfBriefed: [string, Authorisation] = ['checkout › Receipt', { ...replaceReceipt[1], userAnswered: false }];
  assert.match(checkOpenSpecDraft(files, context({}, [selfBriefed])).join(' '), /without a user-answered/);
});

test('MODIFIED that drops a current scenario, or names no approved requirement, is refused', () => {
  const dropped = MODIFIED.split('#### Scenario: Receipt sent')[0]! + '#### Scenario: Only asked\n- **WHEN** asked\n- **THEN** sent\n';
  const files = draft({ 'specs/checkout/spec.md': dropped, '.openspec.yaml': metadata({ 'checkout › Receipt': ['R02'] }) });
  assert.match(checkOpenSpecDraft(files, context({}, [replaceReceipt])).join(' '), /drops the scenario\(s\) "Receipt sent"/);
  const ghost = MODIFIED.replace('Requirement: Receipt', 'Requirement: receipt');
  const problems = checkOpenSpecDraft(draft({ 'specs/checkout/spec.md': ghost, '.openspec.yaml': metadata({ 'checkout › receipt': ['R02'] }) }), context({}, [replaceReceipt]));
  assert.match(problems.join(' '), /is not an approved requirement \(did you mean "Receipt"\?\)/);
});

test('REMOVED is accepted as a heading or as a bullet carrying one, with any bullet marker and with or without backticks, once the user answered remove', () => {
  const remove: [string, Authorisation] = ['checkout › Receipt', { requirementId: 'R02', disposition: 'remove', renamedTo: null, userAnswered: true }];
  for (const form of ['### Requirement: Receipt', '- ### Requirement: Receipt', '- `### Requirement: Receipt`', '* ### Requirement: Receipt', '+ `### Requirement: Receipt`']) {
    const spec = `${ADDED}\n## REMOVED Requirements\n${form}\n- **Reason**: the brief retires it\n**Migration**: none\n`;
    assert.deepEqual(checkOpenSpecDraft(draft({ 'specs/checkout/spec.md': spec }), context({}, [remove])), [], form);
  }
  const spec = `${ADDED}\n## REMOVED Requirements\n- ### Requirement: Receipt\n`;
  assert.match(checkOpenSpecDraft(draft({ 'specs/checkout/spec.md': spec }), context()).join(' '), /REMOVED "checkout › Receipt" changes approved behaviour without/);
});

test('a REMOVED bullet naming an approved requirement without "### Requirement:" is refused, because OpenSpec removes nothing for it', () => {
  const remove: [string, Authorisation] = ['checkout › Receipt', { requirementId: 'R02', disposition: 'remove', renamedTo: null, userAnswered: true }];
  for (const form of ['* Receipt', '- Receipt', '- `Receipt`']) {
    const spec = `${ADDED}\n## REMOVED Requirements\n${form}\n`;
    assert.match(checkOpenSpecDraft(draft({ 'specs/checkout/spec.md': spec }), context({}, [remove])).join(' '), /OpenSpec ignores it.*### Requirement: Receipt/, form);
  }
});

test('a REMOVED or RENAMED line inside a fenced example is text, not a delta', () => {
  const spec = `${ADDED}\n## REMOVED Requirements\n\`\`\`markdown\n- ### Requirement: Card payment\n\`\`\`\n\n## RENAMED Requirements\n~~~\n- FROM: \`### Requirement: Receipt\`\n~~~\n`;
  assert.deepEqual(checkOpenSpecDraft(draft({ 'specs/checkout/spec.md': spec }), context()), []);
});

test('a RENAMED line OpenSpec does not read is refused: lowercase from/to, or a name without "### Requirement:"', () => {
  const rename: [string, Authorisation] = ['checkout › Receipt', { requirementId: 'R02', disposition: 'rename', renamedTo: 'Email receipt', userAnswered: true }];
  for (const pair of ['- from: `### Requirement: Receipt`\n- to: `### Requirement: Email receipt`', '- FROM: Receipt\n- TO: Email receipt', '- FROM: `### requirement: Receipt`\n- TO: `### requirement: Email receipt`']) {
    const spec = `${ADDED}\n## RENAMED Requirements\n${pair}\n`;
    assert.match(checkOpenSpecDraft(draft({ 'specs/checkout/spec.md': spec }), context({}, [rename])).join(' '), /OpenSpec does not read it/, pair);
  }
});

test('every copy of a repeated delta section is checked, as OpenSpec applies every copy', () => {
  const untraced = `${ADDED}\n## ADDED Requirements\n### Requirement: Untraced\nThe system SHALL do whatever.\n\n#### Scenario: Any\n- **WHEN** anything\n- **THEN** something\n`;
  assert.match(checkOpenSpecDraft(draft({ 'specs/checkout/spec.md': untraced }), context()).join(' '), /ADDED "checkout › Untraced" is not in x-maestro-requirements/);
  const existing = `${ADDED}\n## Added Requirements\n### Requirement: Card payment\nThe system SHALL take cards.\n\n#### Scenario: Paid order\n- **WHEN** paid\n- **THEN** marked\n`;
  assert.match(checkOpenSpecDraft(draft({ 'specs/checkout/spec.md': existing }), context()).join(' '), /ADDED "checkout › Card payment" already exists/);
  const twice = `${ADDED}\n## ADDED Requirements\n### Requirement: Wallet payment\nThe system SHALL accept wallets.\n\n#### Scenario: Paid\n- **WHEN** paid\n- **THEN** marked\n`;
  assert.match(checkOpenSpecDraft(draft({ 'specs/checkout/spec.md': twice }), context()).join(' '), /names "Wallet payment" twice/);
});

test('a delta heading OpenSpec does not fold to a delta section is not one: two blanks inside the title', () => {
  const spec = ADDED.replace('## ADDED Requirements', '## ADDED  Requirements');
  assert.match(checkOpenSpecDraft(draft({ 'specs/checkout/spec.md': spec }), context()).join(' '), /no requirement delta/);
});

test('a self-briefed fork excludes its requirement whatever the disposition, as only the user may change approved behaviour', () => {
  for (const disposition of ['keep', 'replace', 'remove'] as const) {
    const fork: [string, Authorisation] = ['checkout › Receipt', { requirementId: 'R01', disposition, renamedTo: null, userAnswered: false }];
    assert.match(checkOpenSpecDraft(draft(), context({}, [fork])).join(' '), /maps R01, whose fork was self-briefed/, disposition);
  }
  const answered: [string, Authorisation] = ['checkout › Receipt', { requirementId: 'R01', disposition: 'replace', renamedTo: null, userAnswered: true }];
  assert.deepEqual(checkOpenSpecDraft(draft(), context({}, [answered])), []);
});

test('created and schema are read as YAML scalars: quoted and commented values are legal, a schema other than spec-driven is not', () => {
  for (const head of ['schema: "spec-driven"\ncreated: "2026-10-18"', "schema: 'spec-driven' # the default\ncreated: 2026-10-18 # closing day"]) {
    const yaml = metadata().replace('schema: spec-driven\ncreated: 2026-10-18', head);
    assert.deepEqual(checkOpenSpecDraft(draft({ '.openspec.yaml': yaml }), context()), [], head);
  }
  const other = metadata().replace('schema: spec-driven', 'schema: nonsense');
  assert.match(checkOpenSpecDraft(draft({ '.openspec.yaml': other }), context()).join(' '), /schema is nonsense — write "schema: spec-driven"/);
});

test('every export rule stays linear on a 200 KB adversarial line', () => {
  const blanks = ' '.repeat(200_000);
  const lines = [
    `${blanks}x`, `- FROM:${blanks}x`, `-${blanks}TO:${blanks}x`, `- FROM: \`###${blanks}Requirement:${blanks}x${blanks}\``,
    `-${blanks}### Requirement:${blanks}x${blanks}\``, `* ${'`'.repeat(200_000)}`, `## ADDED${blanks}Requirements${blanks}x`,
  ];
  for (const line of lines) {
    for (const section of ['ADDED', 'REMOVED', 'RENAMED']) {
      const spec = `${ADDED}\n## ${section} Requirements\n${line}\n`;
      const started = performance.now();
      checkOpenSpecDraft(draft({ 'specs/checkout/spec.md': spec, '.openspec.yaml': metadata(undefined, `x-other: ${line}\n`) }), context());
      assert.ok(performance.now() - started < 500, `${section} took ${Math.round(performance.now() - started)} ms`);
    }
  }
});

test('RENAMED pairs FROM and TO, with backticks, and must go to the name the user gave', () => {
  const rename: [string, Authorisation] = ['checkout › Card payment', { requirementId: 'R01', disposition: 'rename', renamedTo: 'Paid by card', userAnswered: true }];
  const spec = (to: string) => `${ADDED}\n## RENAMED Requirements\n- FROM: \`### Requirement: Card payment\`\n- TO: \`### Requirement: ${to}\`\n`;
  assert.deepEqual(checkOpenSpecDraft(draft({ 'specs/checkout/spec.md': spec('Paid by card') }), context({}, [rename])), []);
  assert.match(checkOpenSpecDraft(draft({ 'specs/checkout/spec.md': spec('Card') }), context({}, [rename])).join(' '), /answers.md says "Paid by card"/);
  assert.match(checkOpenSpecDraft(draft({ 'specs/checkout/spec.md': spec('Receipt') }), context({}, [rename])).join(' '), /already exists/);
  const unpaired = `${ADDED}\n## RENAMED Requirements\n- FROM: \`### Requirement: Card payment\`\n`;
  assert.match(checkOpenSpecDraft(draft({ 'specs/checkout/spec.md': unpaired }), context({}, [rename])).join(' '), /has no TO line/);
});

test('a requirement id whose fork kept the approved requirement is never exported', () => {
  const keep: [string, Authorisation] = ['checkout › Receipt', { requirementId: 'R01', disposition: 'keep', renamedTo: null, userAnswered: true }];
  assert.match(checkOpenSpecDraft(draft(), context({}, [keep])).join(' '), /whose fork kept the approved requirement/);
});

test('a new nested capability is accepted with ADDED only', () => {
  const files = draft({ 'specs/checkout/spec.md': null, 'specs/payments/wallets/spec.md': ADDED, '.openspec.yaml': metadata({ 'payments/wallets › Wallet payment': ['R01'] }) });
  assert.deepEqual(checkOpenSpecDraft(files, context()), []);
});

test('the proposal, the metadata and the file set are each held to what OpenSpec needs', () => {
  assert.match(checkOpenSpecDraft(draft({ 'proposal.md': '## Why\nShort.\n\n## What Changes\n- x\n' }), context()).join(' '), /"## Why" is 6 characters/);
  assert.match(checkOpenSpecDraft(draft({ 'proposal.md': PROPOSAL.replace('## What Changes', '## Changes') }), context()).join(' '), /no "## What Changes"/);
  assert.match(checkOpenSpecDraft(draft({ 'tasks.md': null }), context()).join(' '), /no tasks.md/);
  assert.match(checkOpenSpecDraft(draft({ 'notes.txt': 'x' }), context()).join(' '), /notes.txt is not part of an OpenSpec change/);
  assert.match(checkOpenSpecDraft(draft({ '.openspec.yaml': metadata(undefined).replace('created: 2026-10-18', 'created: 2026-02-30') }), context()).join(' '), /created is not a YYYY-MM-DD date/);
  assert.match(checkOpenSpecDraft(draft({ '.openspec.yaml': metadata(undefined).replace(`x-maestro-run: ${DIR}`, 'x-maestro-run: other') }), context()).join(' '), /x-maestro-run is other/);
  assert.match(checkOpenSpecDraft(draft({ 'specs/checkout/spec.md': '## Notes\n' , '.openspec.yaml': metadata({}) }), context()).join(' '), /no requirement delta/);
});

test('custom lowercase x- keys and CRLF line endings are legal', () => {
  const files = draft({ '.openspec.yaml': metadata(undefined, 'x-team-owner: payments\n').replace(/\n/g, '\r\n'), 'specs/checkout/spec.md': ADDED.replace(/\n/g, '\r\n') });
  assert.deepEqual(checkOpenSpecDraft(files, context()), []);
});

test('a run directory OpenSpec cannot name as a change is refused', () => {
  assert.match(checkOpenSpecDraft(draft({ '.openspec.yaml': metadata().replace(DIR, '2026-10-18-Checkout') }), context({ dir: '2026-10-18-Checkout' })).join(' '), /not lowercase kebab-case/);
});

test('answers.md dispositions authorise only what the user answered, and a later entry for one target wins', () => {
  const entries = parseAnswers([
    '### R02 — чек', 'Asked: ?', 'Options:', '1. keep (recommended — approved)', '2. replace', 'Answer: self-briefed', 'Chosen: keep', 'OpenSpec: checkout › Receipt — keep', '',
    '### R02 — чек, исправление', 'Asked: ?', 'Options:', '1. keep (recommended — approved)', '2. replace', 'Answer: 2', 'Chosen: replace', '**OpenSpec:** checkout › Receipt — replace', '',
    '### R07 — кривая строка', 'Asked: ?', 'Options:', '1. a (recommended — x)', 'Answer: 1', 'Chosen: a', 'OpenSpec: checkout Receipt replace', '',
  ].join('\n'));
  const map = authorisationsOf(entries, parseOpenSpecDisposition);
  assert.deepEqual([...map.entries()], [['checkout › Receipt', { requirementId: 'R02', disposition: 'replace', renamedTo: null, userAnswered: true }]]);
});

// --- writing -------------------------------------------------------------------

interface Project { root: string; runDir: string; dispose(): Promise<void> }

async function project(files: Record<string, string> = {}): Promise<Project> {
  const root = await mkdtemp(path.join(tmpdir(), 'maestro-openspec-export-'));
  const all: Record<string, string> = {
    'openspec/config.yaml': 'schema: spec-driven\n',
    'openspec/specs/checkout/spec.md': MAIN_SPEC,
    ...Object.fromEntries([...draft()].map(([name, text]) => [`.maestro/${DIR}/openspec/${name}`, text])),
    ...files,
  };
  for (const [relative, body] of Object.entries(all)) {
    await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await writeFile(path.join(root, relative), body);
  }
  return { root, runDir: path.join(root, '.maestro', DIR), dispose: () => rm(root, { recursive: true, force: true }) };
}

const missing: OpenSpecRunner = async () => ({ outcome: 'missing' });
const exportOf = (p: Project, runner: OpenSpecRunner = missing, outcome = 'completed') => exportOpenSpecChange({
  projectRoot: p.root, runDir: p.runDir, dir: DIR, outcome, runner,
  context: { results: { R01: 'passed' }, excepted: new Set(), notInSpec: new Set(), authorisations: new Map() },
});

test('a clean draft is written as openspec/changes/maestro-<dir>/, and an identical retry is kept', async () => {
  const p = await project();
  try {
    assert.deepEqual(await exportOf(p), { status: 'written', change: `maestro-${DIR}`, validation: 'unavailable' });
    const target = path.join(p.root, 'openspec/changes', `maestro-${DIR}`);
    assert.equal(await readFile(path.join(target, 'specs/checkout/spec.md'), 'utf8'), ADDED);
    assert.deepEqual((await exportOf(p))?.status, 'kept');
    assert.deepEqual((await readdir(path.join(p.root, 'openspec/changes'))).sort(), [`maestro-${DIR}`]);
    assert.equal(await readFile(path.join(p.root, 'openspec/specs/checkout/spec.md'), 'utf8'), MAIN_SPEC, 'openspec/specs is never written');
  } finally { await p.dispose(); }
});

test('a changed draft rewrites its own change whole, dropping files the new draft no longer has', async () => {
  const p = await project({ [`.maestro/${DIR}/openspec/design.md`]: '# Design\n' });
  try {
    await exportOf(p);
    await rm(path.join(p.runDir, 'openspec/design.md'));
    assert.equal((await exportOf(p))?.status, 'written');
    assert.deepEqual((await readdir(path.join(p.root, 'openspec/changes', `maestro-${DIR}`))).sort(), ['.openspec.yaml', 'proposal.md', 'specs', 'tasks.md']);
  } finally { await p.dispose(); }
});

test('a folder of the same name another owner wrote is refused and left untouched', async () => {
  const p = await project({ [`openspec/changes/maestro-${DIR}/proposal.md`]: 'theirs\n' });
  try {
    const result = await exportOf(p);
    assert.equal(result?.status, 'refused');
    assert.match(result!.problems![0]!, /is not this run's, so it was not overwritten/);
    assert.equal(await readFile(path.join(p.root, 'openspec/changes', `maestro-${DIR}`, 'proposal.md'), 'utf8'), 'theirs\n');
  } finally { await p.dispose(); }
});

test('a change the user already archived is reported archived and not written again', async () => {
  const p = await project({ [`openspec/changes/archive/2026-10-19-maestro-${DIR}/proposal.md`]: 'merged\n' });
  try {
    assert.deepEqual(await exportOf(p), { status: 'archived', change: `maestro-${DIR}` });
    assert.deepEqual((await readdir(path.join(p.root, 'openspec/changes'))).sort(), ['archive']);
  } finally { await p.dispose(); }
});

test('after the user archived the change, its merged requirements are in the specs, and a retry still reports archived', async () => {
  const merged = MAIN_SPEC + ADDED.replace('## ADDED Requirements\n', '');
  const p = await project({
    'openspec/specs/checkout/spec.md': merged,
    [`openspec/changes/archive/2026-10-19-maestro-${DIR}/proposal.md`]: 'merged\n',
  });
  try {
    assert.deepEqual(await exportOf(p), { status: 'archived', change: `maestro-${DIR}` });
    assert.equal(await readFile(path.join(p.root, 'openspec/specs/checkout/spec.md'), 'utf8'), merged);
  } finally { await p.dispose(); }
});

test('a refused draft writes nothing, and stopped_incomplete or a missing draft exports nothing', async () => {
  const p = await project({ [`.maestro/${DIR}/openspec/tasks.md`]: '' });
  try {
    await rm(path.join(p.runDir, 'openspec/proposal.md'));
    const result = await exportOf(p);
    assert.equal(result?.status, 'refused');
    await assert.rejects(readdir(path.join(p.root, 'openspec/changes', `maestro-${DIR}`)));
    assert.equal(await exportOf(p, missing, 'stopped_incomplete'), null);
    await rm(path.join(p.runDir, 'openspec'), { recursive: true });
    assert.equal(await exportOf(p), null);
  } finally { await p.dispose(); }
});

test('a symlink in the draft is refused rather than followed', async () => {
  const p = await project();
  try {
    await symlink('/etc/hosts', path.join(p.runDir, 'openspec/design.md'));
    const result = await exportOf(p);
    assert.equal(result?.status, 'refused');
    assert.match(result!.problems!.join(' '), /design.md is a symlink/);
  } finally { await p.dispose(); }
});

test('openspec/changes symlinked outside the project is refused before anything is written', async () => {
  const outside = await mkdtemp(path.join(tmpdir(), 'maestro-openspec-outside-'));
  const p = await project();
  try {
    await symlink(outside, path.join(p.root, 'openspec/changes'));
    const result = await exportOf(p);
    assert.equal(result?.status, 'refused');
    assert.deepEqual(await readdir(outside), []);
  } finally { await p.dispose(); await rm(outside, { recursive: true, force: true }); }
});

test('validation passes on exit 0, fails with the output on exit 1, and is unavailable on a timeout', async () => {
  const p = await project();
  try {
    const calls: string[][] = [];
    const passed: OpenSpecRunner = async args => { calls.push([...args]); return { outcome: 'exited', code: 0, output: '' }; };
    assert.equal((await exportOf(p, passed))?.validation, 'passed');
    assert.deepEqual(calls[0], ['validate', `maestro-${DIR}`, '--type', 'change', '--strict', '--json', '--no-interactive']);
    const failed: OpenSpecRunner = async () => ({ outcome: 'exited', code: 1, output: 'ERROR proposal: Why too short\n' });
    const result = await exportOf(p, failed);
    assert.deepEqual([result?.status, result?.validation, result?.problems], ['kept', 'failed', ['ERROR proposal: Why too short']]);
    const slow: OpenSpecRunner = async () => ({ outcome: 'timeout' });
    assert.equal((await exportOf(p, slow))?.validation, 'unavailable');
  } finally { await p.dispose(); }
});

test('a project that is not OpenSpec-initialised exports nothing even with a draft', async () => {
  const p = await project();
  try {
    await rm(path.join(p.root, 'openspec/config.yaml'));
    assert.equal(await exportOf(p), null);
    assert.equal((await readOpenSpecIndex(p.root)).present, false);
  } finally { await p.dispose(); }
});

test('a timed-out validation says it timed out, and only a missing command line says it is not installed', () => {
  const change = `maestro-${DIR}`;
  const slow = openSpecProgressItems(DIR, { status: 'written', change, validation: 'unavailable', problems: ['openspec validate did not answer within 30 s'] });
  assert.match(slow.notDone[0]!.text, /not validated: openspec validate did not answer within 30 s$/);
  const absent = openSpecProgressItems(DIR, { status: 'written', change, validation: 'unavailable' });
  assert.match(absent.notDone[0]!.text, /not validated: the openspec command line is not installed$/);
});

test('a refused re-closure leaves the earlier export untouched and says it is stale', async () => {
  const p = await project();
  try {
    assert.equal((await exportOf(p))?.status, 'written');
    const target = path.join(p.root, 'openspec/changes', `maestro-${DIR}`);
    const before = await readFile(path.join(target, '.openspec.yaml'), 'utf8');
    await writeFile(path.join(p.runDir, 'openspec/.openspec.yaml'), metadata({ 'checkout › Wallet payment': ['R03'] }));
    const refused = await exportOf(p);
    assert.deepEqual([refused?.status, refused?.stale], ['refused', true]);
    assert.equal(await readFile(path.join(target, '.openspec.yaml'), 'utf8'), before, 'the earlier export is not deleted or rewritten');
    assert.match(openSpecProgressItems(DIR, refused).knownBugs[0]!.text, /from an earlier closure is still in the tree.*do not archive it/);
    const first = await project();
    try {
      await writeFile(path.join(first.runDir, 'openspec/.openspec.yaml'), metadata({ 'checkout › Wallet payment': ['R03'] }));
      assert.equal((await exportOf(first))?.stale, undefined, 'a first closure has nothing stale');
    } finally { await first.dispose(); }
  } finally { await p.dispose(); }
});

test('a failed export still reports the forks the run answered itself', async () => {
  const p = await project();
  try {
    await writeFile(path.join(p.root, 'openspec/changes'), 'not a directory\n');
    const result = await exportOpenSpecChange({
      projectRoot: p.root, runDir: p.runDir, dir: DIR, outcome: 'completed', runner: missing,
      context: { results: { R01: 'passed' }, excepted: new Set(), notInSpec: new Set(), authorisations: new Map([
        ['checkout › Receipt', { requirementId: 'R02', disposition: 'keep', renamedTo: null, userAnswered: false }],
      ]) },
    });
    assert.equal(result?.status, 'failed');
    assert.deepEqual(result?.unresolved, [{ requirementId: 'R02', target: 'checkout › Receipt' }]);
    assert.deepEqual(openSpecProgressItems(DIR, result).notDone.map(item => item.key), [`${DIR}#openspec-R02`]);
  } finally { await p.dispose(); }
});

test('closed_with_exceptions exports like completed, and the exception covers ids through findings and obligations alike', async () => {
  const p = await project();
  try {
    assert.equal((await exportOf(p, missing, 'closed_with_exceptions'))?.status, 'written');
  } finally { await p.dispose(); }
  const state = {
    requirements: [{ id: 'R01', status: 'in-spec' }, { id: 'R02', status: 'in-spec' }, { id: 'R03', status: 'deferred' }],
    verification: {
      findings: [{ id: 'F-1', requirementIds: ['R01'] }],
      obligations: [{ id: 'O-1', requirementIds: ['R02'] }],
      decisions: [{ kind: 'accepted_exception', selectedFindingIds: ['F-1'], selectedObligationIds: ['O-1'] }],
    },
  } as unknown as RunState;
  const derived = await closureContext(path.join(tmpdir(), `maestro-openspec-none-${process.pid}`), state);
  assert.deepEqual([...derived.excepted].sort(), ['R01', 'R02']);
  assert.deepEqual([...derived.notInSpec], ['R03']);
});

test('an export that raises before it can report is still a failed export, not a missing key', async () => {
  const state = { runId: 'run-1', contractVersion: 10, slug: 'checkout', dir: DIR } as unknown as RunState;
  const raised = await closingExport('/nowhere/.maestro', state, async () => { throw new Error('answers.md vanished'); });
  assert.deepEqual([raised?.status, raised?.change], ['failed', `maestro-${DIR}`]);
  assert.match(raised!.problems![0]!, /could not be run \(answers\.md vanished\) — publish the same closed state again/);
  assert.match(openSpecProgressItems(DIR, raised).knownBugs[0]!.text, /OpenSpec export failed/);
  assert.equal(await closingExport('/nowhere/.maestro', state, async () => null), null, 'nothing to export stays nothing');
});

test('MODIFIED of the name a RENAMED pair goes to is refused with the reason, not as an unknown requirement', () => {
  const rename: [string, Authorisation] = ['checkout › Receipt', { requirementId: 'R02', disposition: 'rename', renamedTo: 'Email receipt', userAnswered: true }];
  const spec = [
    '## RENAMED Requirements', '- FROM: `### Requirement: Receipt`', '- TO: `### Requirement: Email receipt`', '',
    '## MODIFIED Requirements', '### Requirement: Email receipt', 'The system MUST email a receipt on request.', '',
    '#### Scenario: Receipt sent', '- **WHEN** an order is paid', '- **THEN** a receipt is emailed', '',
  ].join('\n');
  const problems = checkOpenSpecDraft(draft({ 'specs/checkout/spec.md': spec, '.openspec.yaml': metadata({ 'checkout › Email receipt': ['R02'] }) }), context({}, [rename])).join(' ');
  assert.match(problems, /MODIFIED "checkout › Email receipt" changes a requirement this change also renames — .*export the rename alone/);
  assert.doesNotMatch(problems, /is not an approved requirement/);
});
