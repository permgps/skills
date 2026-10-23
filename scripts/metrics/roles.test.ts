import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanCell, parseTables } from '../validate/spec-integrity.ts';
import { DISPATCH_PREFIX, PROBE_KEY, ROLE_OF_KEY, parseDispatchLabel, roleOf } from './roles.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PROMPTS = path.join(ROOT, 'skills/maestro/prompts');
const DIALS = path.join(ROOT, 'docs/spec/dials.md');
const SKILL = path.join(ROOT, 'skills/maestro/SKILL.md');

const shippedKeys = async (): Promise<string[]> =>
  (await readdir(PROMPTS)).filter(name => name.endsWith('.md')).map(name => name.slice(0, -'.md'.length));

/** The keys a role map must hold: every shipped brief, and the probe. */
const missingKeys = (map: Readonly<Record<string, unknown>>, keys: readonly string[]): string[] =>
  [...keys, PROBE_KEY].filter(key => !Object.hasOwn(map, key));

test('every brief the bundle ships, and the probe, has a role', async () => {
  assert.deepEqual(missingKeys(ROLE_OF_KEY, await shippedKeys()), []);
});

test('a role map missing one shipped brief is caught', async () => {
  const keys = await shippedKeys();
  const { executor: _dropped, ...withoutExecutor } = ROLE_OF_KEY;
  assert.deepEqual(missingKeys(withoutExecutor, keys), ['executor']);
});

test('the role map names no brief the bundle does not ship', async () => {
  const keys = new Set([...await shippedKeys(), PROBE_KEY]);
  assert.deepEqual(Object.keys(ROLE_OF_KEY).filter(key => !keys.has(key)), []);
});

test('every brief in the dials tier table has a role', async () => {
  const table = parseTables(await readFile(DIALS, 'utf8'))
    .find(candidate => ['Role', 'Brief', 'Tier'].every(column => candidate.columns.includes(column)));
  assert.ok(table, 'docs/spec/dials.md has no Role | Brief | Tier table');
  const briefs = table.rows
    .map(row => cleanCell(row['Brief']))
    .filter(brief => brief.endsWith('.md'))
    .map(brief => brief.slice(0, -'.md'.length));
  assert.ok(briefs.length > 0);
  assert.deepEqual(briefs.filter(brief => !Object.hasOwn(ROLE_OF_KEY, brief)), []);
});

test('SKILL.md and the dials specification state the label the measurement reads', async () => {
  for (const file of [SKILL, DIALS]) {
    const body = await readFile(file, 'utf8');
    assert.ok(body.includes(`\`${DISPATCH_PREFIX}<brief>\``), `${file} does not name the label shape`);
    assert.ok(body.includes(`\`${DISPATCH_PREFIX}${PROBE_KEY}\``), `${file} does not name the probe label`);
  }
});

test('a label with a таск id gives the brief and the id', () => {
  assert.deepEqual(parseDispatchLabel('maestro:executor 03 build the engine'), { roleKey: 'executor', taskId: '03' });
});

test('a label without a таск id gives the brief and no id', () => {
  assert.deepEqual(parseDispatchLabel('maestro:standards-reader'), { roleKey: 'standards-reader', taskId: null });
  assert.deepEqual(parseDispatchLabel('maestro:probe'), { roleKey: 'probe', taskId: null });
});

test('free text without the prefix is unattributed, never matched by resemblance', () => {
  assert.deepEqual(parseDispatchLabel('Review task 03 against its file'), { unattributed: 'no prefix' });
  assert.deepEqual(parseDispatchLabel(' maestro:executor 03'), { unattributed: 'no prefix' });
  assert.deepEqual(parseDispatchLabel('reviewer maestro:reviewer 03'), { unattributed: 'no prefix' });
});

test('a prefix naming no shipped brief is unattributed with the key it named', () => {
  assert.deepEqual(parseDispatchLabel('maestro:unknown-brief 02'), { unattributed: 'unknown role key', roleKey: 'unknown-brief' });
  assert.deepEqual(parseDispatchLabel('maestro:Executor 02'), { unattributed: 'no prefix' });
  assert.deepEqual(parseDispatchLabel('maestro:constructor'), { unattributed: 'unknown role key', roleKey: 'constructor' });
});

test('a context with no description is unattributed for that reason', () => {
  assert.deepEqual(parseDispatchLabel(undefined), { unattributed: 'no description' });
});

test('the first executor of a таск is an executor and a later one is repair', () => {
  assert.equal(roleOf('executor', 0), 'executor');
  assert.equal(roleOf('executor', 1), 'repair');
  assert.equal(roleOf('executor', 3), 'repair');
});

test('the roles of the other briefs do not depend on how many executors came before', () => {
  assert.equal(roleOf('reviewer', 2), 'reviewer');
  assert.equal(roleOf('task-reader', 0), 'gate readers');
  assert.equal(roleOf('repair-diagnostician', 0), 'repair');
  assert.equal(roleOf('acceptance-reader', 0), 'acceptance');
  assert.equal(roleOf('standards-reader', 0), 'standards reader');
  assert.equal(roleOf(PROBE_KEY, 0), 'other');
});

test('a 200 KB adversarial description is read in linear time', () => {
  const inputs = [
    `maestro:${'a'.repeat(200_000)}`,
    `maestro:executor${' '.repeat(200_000)}`,
    `${'maestro:'.repeat(25_000)}`,
    `maestro:${'-'.repeat(200_000)}!`,
  ];
  for (const input of inputs) {
    const started = performance.now();
    parseDispatchLabel(input);
    assert.ok(performance.now() - started < 200, `took too long on a ${input.length}-character input`);
  }
});
