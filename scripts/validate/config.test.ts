// The models pin, merged into a `config.json` the user already has.
//
// The file is the user's, so every test here is about what the merge keeps:
// keys it does not know, another host's pin, the exact bytes of a file it
// refuses. Each runs against a real temporary `.maestro/`, because the write is
// a rename and a mock would prove nothing about what lands on disk.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  CONFIG_FILE, CONFIG_KEYS, EmptyModelPinError, configCommand, pinModels,
} from '../../skills/maestro/tools/runtime/config.mts';
import { UnknownHostError } from '../memory/markers.ts';

/** `.maestro/config.json` from the domtut прогон, byte for byte. */
const DOMTUT_CONFIG = '{\n  "configVersion": 1,\n  "mode": "full",\n  "explain": "normal"\n}\n';

async function withMaestro(config: string | null, body: (dir: string, file: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'maestro-config-'));
  const file = path.join(dir, CONFIG_FILE);
  try {
    if (config !== null) await writeFile(file, config);
    await body(dir, file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const readJson = async (file: string): Promise<Record<string, unknown>> => JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;

test('the config keys are the five the dials phase reads, models last', () => {
  assert.deepEqual([...CONFIG_KEYS], ['configVersion', 'mode', 'explain', 'language', 'models']);
});

test('a pin merged into the file keeps mode, explain, language and a key nobody here knows', async () => {
  const before = { configVersion: 1, mode: 'semi', explain: 'plain', language: 'en', theirs: { keep: [1, 2] } };
  await withMaestro(JSON.stringify(before), async (dir, file) => {
    const outcome = await pinModels(dir, 'claude-code', { strong: 'session', standard: 'sonnet' });
    assert.deepEqual(outcome, { result: 'written', path: file, replaced: false });
    assert.deepEqual(await readJson(file), { ...before, models: { 'claude-code': { strong: 'session', standard: 'sonnet' } } });
  });
});

test('the file is written as two-space JSON ending in one newline', async () => {
  await withMaestro(DOMTUT_CONFIG, async (dir, file) => {
    await pinModels(dir, 'codex', { strong: 'session', standard: 'gpt-mini' });
    const text = await readFile(file, 'utf8');
    assert.match(text, /^\{\n {2}"configVersion": 1,\n/);
    assert.ok(text.endsWith('}\n') && !text.endsWith('\n\n'));
  });
});

test('a second host\'s pin is kept when this host pins its own', async () => {
  const before = { configVersion: 1, mode: 'full', models: { codex: { strong: 'session', standard: 'gpt-mini' } } };
  await withMaestro(JSON.stringify(before), async (dir, file) => {
    await pinModels(dir, 'claude-code', { strong: 'opus', standard: 'sonnet' });
    assert.deepEqual((await readJson(file))['models'], {
      codex: { strong: 'session', standard: 'gpt-mini' },
      'claude-code': { strong: 'opus', standard: 'sonnet' },
    });
  });
});

test('a stale pin for this host is replaced, and the outcome says it replaced one', async () => {
  const before = { configVersion: 1, mode: 'full', models: { 'claude-code': { strong: 'session', standard: 'retired-model' } } };
  await withMaestro(JSON.stringify(before), async (dir, file) => {
    const outcome = await pinModels(dir, 'claude-code', { strong: 'session', standard: 'sonnet' });
    assert.equal(outcome.replaced, true);
    assert.deepEqual((await readJson(file))['models'], { 'claude-code': { strong: 'session', standard: 'sonnet' } });
  });
});

test('an invalid models key is dropped on its own, and mode survives it', async () => {
  await withMaestro(JSON.stringify({ configVersion: 1, mode: 'interview', models: 'sonnet' }), async (dir, file) => {
    const outcome = await pinModels(dir, 'claude-code', { strong: 'session', standard: 'sonnet' });
    assert.equal(outcome.replaced, false);
    assert.deepEqual(await readJson(file), { configVersion: 1, mode: 'interview', models: { 'claude-code': { strong: 'session', standard: 'sonnet' } } });
  });
});

test('a file that will not parse is unreadable and left byte for byte', async () => {
  const broken = '{ "configVersion": 1, "mode": "full", }\n';
  await withMaestro(broken, async (dir, file) => {
    const outcome = await pinModels(dir, 'claude-code', { strong: 'session', standard: 'sonnet' });
    assert.deepEqual(outcome, { result: 'unreadable', path: file, replaced: false });
    assert.equal(await readFile(file, 'utf8'), broken);
  });
});

test('a file holding an array is unreadable, because there is no object to set a key in', async () => {
  await withMaestro('[1, 2]\n', async (dir, file) => {
    assert.equal((await pinModels(dir, 'claude-code', { strong: 'session', standard: 'sonnet' })).result, 'unreadable');
    assert.equal(await readFile(file, 'utf8'), '[1, 2]\n');
  });
});

test('no file is absent, and the pin creates none, because a new file would read as a first прогон', async () => {
  await withMaestro(null, async (dir, file) => {
    const outcome = await pinModels(dir, 'claude-code', { strong: 'session', standard: 'sonnet' });
    assert.deepEqual(outcome, { result: 'absent', path: file, replaced: false });
    await assert.rejects(stat(file), { code: 'ENOENT' });
  });
});

test('an unknown host is refused with the hosts it could have been, and the file is untouched', async () => {
  await withMaestro(DOMTUT_CONFIG, async (dir, file) => {
    await assert.rejects(pinModels(dir, 'cursor', { strong: 'session', standard: 'sonnet' }), UnknownHostError);
    assert.equal(await readFile(file, 'utf8'), DOMTUT_CONFIG);
  });
});

test('an empty half is refused by its name, because "session" is how to say no model', async () => {
  await withMaestro(DOMTUT_CONFIG, async (dir, file) => {
    await assert.rejects(pinModels(dir, 'claude-code', { strong: 'session', standard: ' ' }),
      (error: unknown) => error instanceof EmptyModelPinError && error.half === 'standard');
    assert.equal(await readFile(file, 'utf8'), DOMTUT_CONFIG);
  });
});

test('the command exits 1 on a refused pin and 2 on a pin it cannot read from stdin', async () => {
  await withMaestro(null, async dir => {
    const absent = await configCommand(['--config-models', '--host', 'claude-code'], dir, async () => '{"strong":"session","standard":"sonnet"}');
    assert.equal(absent.code, 1);
    assert.equal(absent.result['result'], 'absent');
    const garbled = await configCommand(['--config-models', '--host', 'claude-code'], dir, async () => 'sonnet');
    assert.equal(garbled.code, 2);
    const nothing = await configCommand(['--config-models', '--host', 'claude-code'], dir, async () => null);
    assert.equal(nothing.code, 2);
    const noHost = await configCommand(['--config-models'], dir, async () => '{"strong":"session","standard":"sonnet"}');
    assert.equal(noHost.code, 2);
    assert.match(String(noHost.result['error']), /unknown host ""/);
  });
});
