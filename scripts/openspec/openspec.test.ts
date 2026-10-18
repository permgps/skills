// The OpenSpec index: detection, the requirement and scenario names, bounds.
//
// Every test builds a real project tree in a temporary directory, by hand: no
// file is copied from OpenSpec (D1). The names the index reports are the ones
// briefing quotes and the export compares, so each parsing rule OpenSpec
// applies — the `## Requirements` section only, fenced blocks ignored, any
// `####` a scenario, a closing `#` run stripped — has a test of its own.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  SPEC_BYTE_LIMIT, SPEC_FILE_LIMIT, detectOpenSpec, foldRequirementName, maestroRunOf,
  normalizeRequirementName, parseSpecRequirements, readOpenSpecIndex, scenarioName,
} from './openspec.ts';

async function tree(files: Record<string, string>): Promise<{ root: string; dispose(): Promise<void> }> {
  const root = await mkdtemp(path.join(tmpdir(), 'maestro-openspec-'));
  for (const [relative, body] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await writeFile(path.join(root, relative), body);
  }
  return { root, dispose: () => rm(root, { recursive: true, force: true }) };
}

const SPEC = [
  '# Checkout',
  '',
  '## Purpose',
  'How a guest pays for an order and what they see afterwards.',
  '',
  '## Requirements',
  '### Requirement: Card payment',
  'The system SHALL take card payment before the order ships.',
  '',
  '#### Scenario: Paid order',
  '- **WHEN** the guest pays by card',
  '- **THEN** the order is marked paid',
  '',
  '### Requirement: Receipt ##',
  'The system MUST email a receipt.',
  '',
  '#### Edge case: no email ###',
  '- **WHEN** the guest gave no email',
  '- **THEN** no receipt is sent',
  '',
].join('\n');

test('a project with openspec/config.yaml is present, and the anchor names the file', async () => {
  const project = await tree({ 'openspec/config.yaml': 'schema: spec-driven\n' });
  try {
    assert.deepEqual(await detectOpenSpec(project.root), { present: true, anchor: 'openspec/config.yaml' });
  } finally { await project.dispose(); }
});

test('openspec/config.yml counts as the config too', async () => {
  const project = await tree({ 'openspec/config.yml': 'schema: spec-driven\n' });
  try {
    assert.deepEqual(await detectOpenSpec(project.root), { present: true, anchor: 'openspec/config.yml' });
  } finally { await project.dispose(); }
});

test('a bare openspec directory with specs but no config is not an OpenSpec project', async () => {
  const project = await tree({ 'openspec/specs/checkout/spec.md': SPEC });
  try {
    const index = await readOpenSpecIndex(project.root);
    assert.equal(index.present, false);
    assert.deepEqual(index.capabilities, []);
  } finally { await project.dispose(); }
});

test('a legacy tree with only openspec/project.md is not an OpenSpec project', async () => {
  const project = await tree({ 'openspec/project.md': '# Project\n' });
  try {
    assert.equal((await detectOpenSpec(project.root)).present, false);
  } finally { await project.dispose(); }
});

test('a project without an openspec directory is absent and reads nothing', async () => {
  const project = await tree({ 'src/index.ts': 'export {};\n' });
  try {
    const index = await readOpenSpecIndex(project.root);
    assert.equal(index.present, false);
    assert.equal(index.anchor, null);
    assert.equal(index.incomplete, false);
  } finally { await project.dispose(); }
});

test('a config that is a directory, not a file, does not make the project OpenSpec', async () => {
  const project = await tree({ 'openspec/config.yaml/keep': '' });
  try {
    assert.equal((await detectOpenSpec(project.root)).present, false);
  } finally { await project.dispose(); }
});

test('an openspec directory symlinked out of the project is treated as absent', async () => {
  const outside = await tree({ 'config.yaml': 'schema: spec-driven\n', 'specs/checkout/spec.md': SPEC });
  const project = await tree({ 'README.md': '# x\n' });
  try {
    await symlink(outside.root, path.join(project.root, 'openspec'));
    const index = await readOpenSpecIndex(project.root);
    assert.equal(index.present, false);
    assert.deepEqual(index.capabilities, []);
  } finally { await project.dispose(); await outside.dispose(); }
});

test('requirement names keep their case, lose a closing # run, and scenarios lose the Scenario: prefix', async () => {
  const requirements = parseSpecRequirements(SPEC);
  assert.deepEqual(requirements, [
    { name: 'Card payment', scenarios: ['Paid order'] },
    { name: 'Receipt', scenarios: ['Edge case: no email'] },
  ]);
});

test('a # that is part of a name stays: C# is not a closing run', () => {
  assert.equal(normalizeRequirementName('Supports C#'), 'Supports C#');
  assert.equal(normalizeRequirementName('  Supports C# ##  '), 'Supports C#');
  assert.equal(normalizeRequirementName('###'), '###');
  assert.equal(scenarioName('Scenario: Paid #'), 'Paid');
});

test('a requirement heading outside ## Requirements is not a requirement', () => {
  const text = ['## Purpose', '### Requirement: Not one', '', '## Requirements', '### Requirement: Real one', '#### Scenario: s', '- x', '', '## Notes', '### Requirement: Also not', ''].join('\n');
  assert.deepEqual(parseSpecRequirements(text).map(requirement => requirement.name), ['Real one']);
});

test('requirement and scenario headings inside a fenced block are text, not structure', () => {
  const text = [
    '## Requirements', '### Requirement: Real', 'The system SHALL work.', '',
    '```markdown', '### Requirement: Example only', '#### Scenario: Example only', '```', '',
    '~~~~', '#### Scenario: Tilde example', '~~~', 'still fenced: a shorter closing fence does not close', '~~~~', '',
    '#### Scenario: Real scenario', '- **WHEN** x', '',
  ].join('\n');
  assert.deepEqual(parseSpecRequirements(text), [{ name: 'Real', scenarios: ['Real scenario'] }]);
});

test('CRLF files parse the same as LF files', () => {
  assert.deepEqual(parseSpecRequirements(SPEC.replace(/\n/g, '\r\n')), parseSpecRequirements(SPEC));
});

test('a requirement without scenarios is indexed with none, and the heading match ignores case', () => {
  const text = ['## requirements', '### requirement: Lowercase heading', 'The system SHALL x.', ''].join('\n');
  assert.deepEqual(parseSpecRequirements(text), [{ name: 'Lowercase heading', scenarios: [] }]);
});

test('the fold catches a near-miss in case and blanks, and nothing else', () => {
  assert.equal(foldRequirementName('Card  Payment'), foldRequirementName('card payment'));
  assert.notEqual(foldRequirementName('Card payments'), foldRequirementName('Card payment'));
});

test('x-maestro-run is read from a top-level key only, with quotes and a comment removed', () => {
  assert.equal(maestroRunOf('schema: spec-driven\nx-maestro-run: 2026-10-18-menu # owner\n'), '2026-10-18-menu');
  assert.equal(maestroRunOf("x-maestro-run: '2026-10-18-menu'\r\n"), '2026-10-18-menu');
  assert.equal(maestroRunOf('meta:\n  x-maestro-run: 2026-10-18-menu\n'), null);
  assert.equal(maestroRunOf('schema: spec-driven\n'), null);
});

test('the index lists nested capabilities, in-flight changes with their owner, and archived Maestro changes', async () => {
  const project = await tree({
    'openspec/config.yaml': 'schema: spec-driven\n',
    'openspec/specs/checkout/spec.md': SPEC,
    'openspec/specs/identity/user-auth/spec.md': '## Requirements\n### Requirement: Sign in\nThe system SHALL sign in.\n#### Scenario: ok\n- x\n',
    'openspec/changes/add-dark-mode/proposal.md': '## Why\n',
    'openspec/changes/maestro-2026-10-01-menu/.openspec.yaml': 'schema: spec-driven\nx-maestro-run: 2026-10-01-menu\n',
    'openspec/changes/archive/2026-09-20-maestro-2026-09-19-cart/proposal.md': '## Why\n',
    'openspec/changes/archive/2026-09-21-add-search/proposal.md': '## Why\n',
  });
  try {
    const index = await readOpenSpecIndex(project.root);
    assert.equal(index.present, true);
    assert.deepEqual(index.capabilities.map(capability => [capability.capability, capability.path, capability.requirements.length]), [
      ['checkout', 'openspec/specs/checkout/spec.md', 2],
      ['identity/user-auth', 'openspec/specs/identity/user-auth/spec.md', 1],
    ]);
    assert.deepEqual(index.changes, [
      { name: 'add-dark-mode', maestroRun: null },
      { name: 'maestro-2026-10-01-menu', maestroRun: '2026-10-01-menu' },
    ]);
    assert.deepEqual(index.archived, [{ folder: '2026-09-20-maestro-2026-09-19-cart', change: 'maestro-2026-09-19-cart' }]);
    assert.equal(index.incomplete, false);
  } finally { await project.dispose(); }
});

test('a spec file over the byte bound is named, not read, and the index says incomplete', async () => {
  const project = await tree({
    'openspec/config.yaml': 'schema: spec-driven\n',
    'openspec/specs/big/spec.md': '## Requirements\n' + 'x'.repeat(SPEC_BYTE_LIMIT + 1),
    'openspec/specs/small/spec.md': SPEC,
  });
  try {
    const index = await readOpenSpecIndex(project.root);
    assert.equal(index.incomplete, true);
    assert.deepEqual(index.unreadable, ['openspec/specs/big/spec.md']);
    assert.deepEqual(index.capabilities.map(capability => capability.capability), ['small']);
  } finally { await project.dispose(); }
});

test('past the spec-file bound the first files in name order are read and the index says incomplete', async () => {
  const files: Record<string, string> = { 'openspec/config.yaml': 'schema: spec-driven\n' };
  for (let n = 0; n <= SPEC_FILE_LIMIT; n += 1) files[`openspec/specs/c${String(n).padStart(4, '0')}/spec.md`] = '## Requirements\n';
  const project = await tree(files);
  try {
    const index = await readOpenSpecIndex(project.root);
    assert.equal(index.incomplete, true);
    assert.equal(index.capabilities.length, SPEC_FILE_LIMIT);
    assert.equal(index.capabilities.at(-1)!.capability, `c${String(SPEC_FILE_LIMIT - 1).padStart(4, '0')}`);
    assert.match(index.reasons.join(' '), /more than 500 spec files/);
  } finally { await project.dispose(); }
});

test('a symlinked spec file is not followed', async () => {
  const outside = await tree({ 'spec.md': SPEC });
  const project = await tree({ 'openspec/config.yaml': 'schema: spec-driven\n' });
  try {
    await mkdir(path.join(project.root, 'openspec/specs/linked'), { recursive: true });
    await symlink(path.join(outside.root, 'spec.md'), path.join(project.root, 'openspec/specs/linked/spec.md'));
    assert.deepEqual((await readOpenSpecIndex(project.root)).capabilities, []);
  } finally { await project.dispose(); await outside.dispose(); }
});

test('every parsing rule stays linear on a 200 KB adversarial line', () => {
  const blanks = ' '.repeat(200_000);
  const inputs = [
    `## Requirements\n### Requirement: a${blanks}x\n`,
    `## Requirements\n### Requirement: ${'#'.repeat(200_000)}\n`,
    `## Requirements\n### Requirement: a\n#### ${'\t'.repeat(200_000)}#x\n`,
    `${'`'.repeat(200_000)}\n${' '.repeat(200_000)}${'~'.repeat(3)}\n`,
    `x-maestro-run: ${' #'.repeat(100_000)}\n`,
  ];
  for (const input of inputs) {
    const started = performance.now();
    parseSpecRequirements(input);
    maestroRunOf(input);
    normalizeRequirementName(`a${blanks}`);
    foldRequirementName(`a${blanks}b`);
    assert.ok(performance.now() - started < 500, `took ${Math.round(performance.now() - started)} ms`);
  }
});

test('sync.mts --openspec-index prints the index of the project the copied script sits in', async () => {
  const project = await tree({
    'openspec/config.yaml': 'schema: spec-driven\n',
    'openspec/specs/checkout/spec.md': SPEC,
  });
  try {
    const maestro = path.join(project.root, '.maestro');
    await mkdir(maestro);
    await copyFile('skills/maestro/tools/sync.mts', path.join(maestro, 'sync.mts'));
    await cp('skills/maestro/tools/runtime', path.join(maestro, 'runtime'), { recursive: true });
    const run = spawnSync(process.execPath, [path.join(maestro, 'sync.mts'), '--openspec-index'], { encoding: 'utf8', env: { ...process.env, LOG_LEVEL: 'INFO' } });
    assert.equal(run.status, 0, run.stderr);
    const result = JSON.parse(run.stdout) as { present: boolean; capabilities: Array<{ requirements: Array<{ name: string }> }> };
    assert.equal(result.present, true);
    assert.deepEqual(result.capabilities[0]!.requirements.map(requirement => requirement.name), ['Card payment', 'Receipt']);
    assert.match(run.stderr, /INFO \[openspec\.index\] openspec index read/);
  } finally { await project.dispose(); }
});

test('the reader fixture project indexes the way its expected outcome says', async () => {
  const { prepareOpenSpecProject, RUN_DIR } = await import('../validate/fixtures/openspec/scenarios.mts');
  const root = await mkdtemp(path.join(tmpdir(), 'maestro-openspec-fixture-'));
  try {
    await prepareOpenSpecProject(root, { closedRun: true });
    const index = await readOpenSpecIndex(root);
    assert.deepEqual(index.capabilities.map(capability => [capability.capability, capability.requirements.map(requirement => requirement.name)]), [
      ['checkout', ['Card payment', 'Receipt']],
      ['identity/user-auth', ['Sign in by email link']],
    ]);
    assert.deepEqual(index.changes, [{ name: 'add-dark-mode', maestroRun: null }, { name: 'maestro-2026-10-01-menu', maestroRun: '2026-10-01-menu' }]);
    assert.deepEqual(index.archived.map(item => item.change), ['maestro-2026-09-19-cart']);
    assert.match(RUN_DIR, /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
