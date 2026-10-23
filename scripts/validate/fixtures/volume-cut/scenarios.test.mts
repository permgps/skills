import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { CEILING_LINES, VOLUME_SCENARIOS, prepareVolumeScenarios } from './scenarios.mts';

test('each volume scenario sums to the total it claims, on the side of the ceiling it claims', () => {
  for (const scenario of VOLUME_SCENARIOS) {
    const sum = scenario.items.reduce((total, item) => total + item.lines, 0);
    assert.equal(sum, scenario.total, scenario.id);
    assert.equal(sum <= CEILING_LINES ? 'under' : 'over', scenario.side, scenario.id);
  }
});

test('the edit list is 18 edits across 12 files besides their tests, and every one is named in its spec', () => {
  const edits = VOLUME_SCENARIOS.find(scenario => scenario.id === 'edit-list');
  assert.ok(edits);
  assert.equal(edits.items.length, 18);
  const files = new Set(edits.items.flatMap(item => item.files).filter(file => !/\.test\./.test(file)));
  assert.equal(files.size, 12);
  for (const file of files) assert.ok(edits.spec.includes(`\`${file}\``), file);
});

test('the seven-thousand scenario needs more than two ceilings, and the neighbours share no file', () => {
  const large = VOLUME_SCENARIOS.find(scenario => scenario.id === 'seven-thousand');
  assert.ok(large && large.total > 2 * CEILING_LINES);
  const neighbours = VOLUME_SCENARIOS.find(scenario => scenario.id === 'neighbours');
  assert.ok(neighbours);
  const [converter, exporter] = neighbours.items;
  assert.ok(converter && exporter);
  assert.equal(converter.files.filter(file => exporter.files.includes(file)).length, 0);
});

test('a reader is handed the spec, and codebase.md only in existing code, never the expected cut or the estimates', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'volume-cut-'));
  try {
    const directories = await prepareVolumeScenarios(root);
    for (const scenario of VOLUME_SCENARIOS) {
      const directory = directories[scenario.id];
      assert.ok(directory, scenario.id);
      const files = (await readdir(directory)).sort();
      assert.deepEqual(files, scenario.codebase === undefined ? ['spec.md'] : ['codebase.md', 'spec.md'], scenario.id);
      for (const file of files) {
        const body: string = await readFile(path.join(directory, file), 'utf8');
        assert.equal(body.includes(scenario.expected), false, `${scenario.id}/${file} carries the expected outcome`);
        assert.doesNotMatch(body, /changed lines|estimat/i, `${scenario.id}/${file} carries an estimate`);
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
