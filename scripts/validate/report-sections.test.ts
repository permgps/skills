import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { checkReportSections, readSectionTable, REQUIRED_SECTIONS } from './report-sections.ts';

const SEVEN = ['What was asked', 'Disagreements', 'Assumptions', 'Questions to forward', 'Hard to undo',
  'Observations', 'What is left'];

function table(sections: readonly string[]): string {
  return ['| Section | Holds |', '|---|---|', ...sections.map(name => `| ${name} | what ${name} holds |`)].join('\n');
}

const bundlePhase = (sections: readonly string[], extra = ''): string => [
  '# Phase 7 — Приёмка', '', '## Steps', '', '### 4. Write the отчёт', '',
  '`.maestro/<dir>/report.md`, written **by you**, in the sections below and in that order.', '',
  table(sections), '', extra, '', '### 5. Close the round', '', '| Section | Holds |', '|---|---|',
  '| Not the report | a later table under another heading |', '',
].join('\n');

const specPhases = (sections: readonly string[], extra = ''): string => [
  '# Phases', '', '### The Отчёт', '', '`report.md` has these sections and they are fixed:', '',
  table(sections), '', extra, '', '### When G4 Disagrees', '',
].join('\n');

const ARTIFACTS = '# Artifacts\n\nA second reading appends its own sections under its own date.\n';

interface Tree {
  bundle?: string;
  spec?: string;
  artifacts?: string;
}

async function withTree(tree: Tree, body: (specDir: string, bundleDir: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'report-sections-'));
  const specDir = path.join(root, 'spec');
  const bundleDir = path.join(root, 'bundle');
  try {
    await mkdir(specDir, { recursive: true });
    await mkdir(path.join(bundleDir, 'phases'), { recursive: true });
    if (tree.bundle !== undefined) await writeFile(path.join(bundleDir, 'phases', '7-acceptance.md'), tree.bundle);
    if (tree.spec !== undefined) await writeFile(path.join(specDir, 'phases.md'), tree.spec);
    if (tree.artifacts !== undefined) await writeFile(path.join(specDir, 'artifacts.md'), tree.artifacts);
    await body(specDir, bundleDir);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('the section table under a heading is read in order, and a table under the next heading is not', () => {
  const read = readSectionTable(bundlePhase(SEVEN), '### 4. Write the отчёт');
  assert.deepEqual(read?.sections, SEVEN);
  assert.equal(readSectionTable(bundlePhase(SEVEN), '### Nowhere'), null);
});

test('two tables listing the same seven sections in the same order give no violation', async () => {
  await withTree({ bundle: bundlePhase(SEVEN), spec: specPhases(SEVEN), artifacts: ARTIFACTS }, async (specDir, bundleDir) => {
    assert.deepEqual(await checkReportSections({ specDir, bundleDir }), []);
  });
});

test('a section missing from the specification\'s table is one violation naming the position', async () => {
  await withTree({
    bundle: bundlePhase(SEVEN),
    spec: specPhases(SEVEN.filter(name => name !== 'Observations')),
    artifacts: ARTIFACTS,
  }, async (specDir, bundleDir) => {
    const violations = await checkReportSections({ specDir, bundleDir });
    assert.equal(violations.length, 1);
    assert.equal(violations[0]?.check, 'order');
    assert.match(violations[0]?.message ?? '', /position 6/);
    assert.match(violations[0]?.message ?? '', /"Observations"/);
  });
});

test('two sections swapped is a violation even though both tables hold the same names', async () => {
  const swapped = [...SEVEN];
  [swapped[3], swapped[4]] = [swapped[4] ?? '', swapped[3] ?? ''];
  await withTree({ bundle: bundlePhase(SEVEN), spec: specPhases(swapped), artifacts: ARTIFACTS }, async (specDir, bundleDir) => {
    const violations = await checkReportSections({ specDir, bundleDir });
    assert.deepEqual(violations.map(v => v.check), ['order']);
    assert.match(violations[0]?.message ?? '', /position 4/);
  });
});

test('a table without the two handed-over sections is a violation even when both tables agree', async () => {
  const five = SEVEN.filter(name => !REQUIRED_SECTIONS.includes(name));
  await withTree({ bundle: bundlePhase(five), spec: specPhases(five), artifacts: ARTIFACTS }, async (specDir, bundleDir) => {
    const violations = await checkReportSections({ specDir, bundleDir });
    assert.deepEqual(violations.map(v => v.check), ['required', 'required', 'required', 'required']);
    assert.ok(violations.some(v => v.message.includes('"Questions to forward"')));
    assert.ok(violations.some(v => v.message.includes('"Hard to undo"')));
  });
});

test('a count of sections stated in prose is a violation, because the table is the count', async () => {
  await withTree({
    bundle: bundlePhase(SEVEN),
    spec: specPhases(SEVEN, 'When приёмка runs again the seven\nsections are written again.'),
    artifacts: '# Artifacts\n\nA second reading appends its own five sections under its own date.\n',
  }, async (specDir, bundleDir) => {
    const violations = await checkReportSections({ specDir, bundleDir });
    assert.deepEqual(violations.map(v => v.check), ['count', 'count']);
    assert.deepEqual(violations.map(v => path.basename(v.file)), ['phases.md', 'artifacts.md']);
    assert.ok((violations[0]?.line ?? 0) > 0, 'a count wrapped over two lines is found and placed on its first line');
  });
});

test('a heading that is missing is unreadable input, not a passed check', async () => {
  await withTree({ bundle: '# Phase 7\n', spec: specPhases(SEVEN), artifacts: ARTIFACTS }, async (specDir, bundleDir) => {
    await assert.rejects(() => checkReportSections({ specDir, bundleDir }), /### 4\. Write the отчёт/);
  });
});

test('a missing file is unreadable input', async () => {
  await withTree({ bundle: bundlePhase(SEVEN), artifacts: ARTIFACTS }, async (specDir, bundleDir) => {
    await assert.rejects(() => checkReportSections({ specDir, bundleDir }));
  });
});
