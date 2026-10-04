import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';

import { mirror, mirrorValidation } from '../../skills/maestro/tools/runtime/dashboard.mts';
import { validationEnvelope } from '../../skills/maestro/tools/runtime/publication.mts';

const ASSET = path.resolve(import.meta.dirname, '../../skills/maestro/assets/dashboard.html');
const HOSTILE = '<script>window.dev_mode=1</script></SCRIPT ><!--   ';

async function scratch(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'maestro-snapshot-'));
  await copyFile(ASSET, path.join(dir, 'dashboard.html'));
  return dir;
}
// The HTML tokenizer ends a script at the first `</script`, whatever the JS inside means.
function inlineScript(page: string, id: string): string {
  const open = page.indexOf(`<script id="${id}">`);
  assert.ok(open >= 0, `no <script id="${id}"> in the page`);
  const start = page.indexOf('>', open) + 1;
  const end = page.slice(start).search(/<\/script/i);
  return page.slice(start, start + end);
}
function evaluate(body: string): Record<string, unknown> {
  const sandbox: Record<string, unknown> = {};
  vm.runInNewContext(body, sandbox);
  // Objects built inside the context carry its prototypes; compare data, not realms.
  return JSON.parse(JSON.stringify(sandbox)) as Record<string, unknown>;
}

test('a state text holding </script> stays inside the snapshot script and round-trips', async () => {
  const dir = await scratch();
  try {
    const state = { runId: 'r1', commitments: [{ text: HOSTILE }] };
    assert.equal(await mirror(dir, JSON.stringify(state)), true);
    const page = await readFile(path.join(dir, 'dashboard.html'), 'utf8');
    const body = inlineScript(page, 'snapshot');
    assert.match(body, /maestro:snapshot:end/, 'the snapshot script was cut short');
    assert.deepEqual(evaluate(body)['MAESTRO_SNAPSHOT'], state);
    assert.equal(await mirror(dir, JSON.stringify(state)), false, 'an identical snapshot rewrites nothing');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a validation message holding </script> stays inside the diagnostic script and round-trips', async () => {
  const dir = await scratch();
  try {
    const envelope = validationEnvelope('invalid', { runId: 'r1' }, [{ field: 'commitments', message: HOSTILE }]);
    await mirrorValidation(dir, envelope);
    const page = await readFile(path.join(dir, 'dashboard.html'), 'utf8');
    const body = inlineScript(page, 'validation-snapshot');
    assert.match(body, /maestro:validation:end/, 'the validation script was cut short');
    assert.deepEqual(evaluate(body)['MAESTRO_VALIDATION_SNAPSHOT'], envelope);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a state carrying every field the page newly reads round-trips into the snapshot unchanged', async () => {
  const dir = await scratch();
  try {
    const state = {
      runId: 'r1', slug: 'landing-page', contractVersion: 7, lifecycle: 'active',
      awaiting: { kind: 'answer', since: '2026-10-04T10:00:00Z' },
      heldBy: { token: 'k7f2', since: '2026-10-04T09:00:00Z' },
      stopReason: 'not yet',
      requirements: [{ id: 'R01', status: 'in-spec', title: 'Hero names the product' }],
      oneWay: ['deleted — src/old.js — 01 abc1234'],
      additions: ['A favicon (R01)'],
      debt: { placeholders: ['phone'], assumptions: [], emptyEnv: ['STRIPE_KEY'] },
    };
    assert.equal(await mirror(dir, JSON.stringify(state)), true);
    const page = await readFile(path.join(dir, 'dashboard.html'), 'utf8');
    assert.deepEqual(evaluate(inlineScript(page, 'snapshot'))['MAESTRO_SNAPSHOT'], state);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

// The block is found by its markers, so a marker spelled inside a state string
// must not be taken for the real one on the next rewrite. Two rewrites are the
// repro: the first stores the text, the second is where a lazy match stops early.
const SNAPSHOT_BREAKOUT = '/* maestro:snapshot:end */globalThis.PWNED=1//';
const VALIDATION_BREAKOUT = '/* maestro:validation:end */globalThis.PWNED=2//';

test('a snapshot end marker inside state text survives the next rewrite as text, never as code', async () => {
  const dir = await scratch();
  try {
    const first = { runId: 'r1', stages: [{ id: 'build', note: SNAPSHOT_BREAKOUT }] };
    const second = { runId: 'r1', stages: [{ id: 'build', note: 'second' }] };
    await mirror(dir, JSON.stringify(first));
    await mirror(dir, JSON.stringify(second));
    const page = await readFile(path.join(dir, 'dashboard.html'), 'utf8');
    const sandbox = evaluate(inlineScript(page, 'snapshot'));
    assert.equal(sandbox['PWNED'], undefined, 'state text ran as code');
    assert.deepEqual(sandbox['MAESTRO_SNAPSHOT'], second);
    assert.equal(page.match(/maestro:snapshot:end/g)?.length, 1, 'a stale tail of the old snapshot stayed in the page');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a validation end marker inside a refusal message survives the next rewrite as text, never as code', async () => {
  const dir = await scratch();
  try {
    const first = validationEnvelope('invalid', { runId: 'r1' }, [{ field: 'heldBy', message: VALIDATION_BREAKOUT }]);
    const second = validationEnvelope('invalid', { runId: 'r1' }, [{ field: 'heldBy', message: 'second' }]);
    await mirrorValidation(dir, first);
    await mirrorValidation(dir, second);
    const page = await readFile(path.join(dir, 'dashboard.html'), 'utf8');
    const sandbox = evaluate(inlineScript(page, 'validation-snapshot'));
    assert.equal(sandbox['PWNED'], undefined, 'a refusal message ran as code');
    assert.deepEqual(sandbox['MAESTRO_VALIDATION_SNAPSHOT'], second);
    assert.equal(page.match(/maestro:validation:end/g)?.length, 1, 'a stale tail of the old envelope stayed in the page');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
