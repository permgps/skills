import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { assess, assessPersistence, VARIANTS, type Probe } from './parity-browser.ts';

const hidden: Probe = {
  visible: false, columns: ['Accounts', 'Cards', 'Featured offer'],
  promotion: true, image: true, imageLoaded: true, signature: 'menu-handler-v1',
};
const shown: Probe = { ...hidden, visible: true };

test('the same oracle passes a real open, panel entry, and exit sequence', () => {
  assert.deepEqual(assess({ initial: hidden, hover: shown, panel: shown, exit: hidden }), []);
});

test('matching signatures cannot excuse a hidden panel or lost pointer binding', () => {
  const failures = assess({ initial: hidden, hover: hidden, panel: hidden, exit: hidden });
  assert.ok(failures.includes('real pointer hover did not open panel'));
  assert.ok(failures.includes('panel closed before pointer entered content'));
});

test('structure and loaded image are checked independently of hover success', () => {
  const failures = assess({
    initial: hidden, hover: shown,
    panel: { ...shown, columns: ['Accounts'], promotion: false, imageLoaded: false },
    exit: hidden,
  });
  assert.deepEqual(failures, [
    'required menu column missing', 'required promotion missing',
    'required image missing or failed',
  ]);
});

test('the integrated fixture declares every tested variant and the same signature', async () => {
  const html = await readFile(path.join(import.meta.dirname, 'fixtures', 'parity', 'menu.html'), 'utf8');
  assert.equal(VARIANTS.length, 11);
  for (const variant of VARIANTS.filter(name => name !== 'correct')) {
    assert.ok(html.includes(`'${variant}'`), `fixture omits ${variant}`);
  }
  assert.match(html, /window\.fixtureSignature = 'menu-handler-v1'/);
});


test('a successful save cannot mask data lost after an actual process restart', () => {
  assert.deepEqual(assessPersistence({ saved: true, retainedAfterRestart: false }), ['entry lost after process restart']);
  assert.deepEqual(assessPersistence({ saved: false, retainedAfterRestart: false }),
    ['save action did not retain entry', 'entry lost after process restart']);
  assert.deepEqual(assessPersistence({ saved: true, retainedAfterRestart: true }), []);
});
