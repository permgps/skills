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
