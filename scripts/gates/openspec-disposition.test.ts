// The value of an `answers.md` `OpenSpec:` line, as the export reads it.
//
// The line authorises a change to approved behaviour, so every spelling the
// briefing phase allows is accepted here and every malformed one reads as no
// authorisation at all, never as a guess.

import test from 'node:test';
import assert from 'node:assert/strict';

import { parseOpenSpecDisposition } from '../../skills/maestro/tools/runtime/answers.mts';

test('each disposition parses with the capability and the requirement name kept as written', () => {
  assert.deepEqual(parseOpenSpecDisposition('checkout › Receipt — keep'), { capability: 'checkout', requirement: 'Receipt', disposition: 'keep', renamedTo: null });
  assert.deepEqual(parseOpenSpecDisposition('checkout › Receipt — replace'), { capability: 'checkout', requirement: 'Receipt', disposition: 'replace', renamedTo: null });
  assert.deepEqual(parseOpenSpecDisposition('identity/user-auth › Sign in - remove'), { capability: 'identity/user-auth', requirement: 'Sign in', disposition: 'remove', renamedTo: null });
  assert.deepEqual(parseOpenSpecDisposition('checkout > Card payment – rename → Card or wallet payment'), { capability: 'checkout', requirement: 'Card payment', disposition: 'rename', renamedTo: 'Card or wallet payment' });
  assert.deepEqual(parseOpenSpecDisposition('checkout › Card payment — rename -> Paid by card'), { capability: 'checkout', requirement: 'Card payment', disposition: 'rename', renamedTo: 'Paid by card' });
});

test('a requirement name that itself holds a dash keeps it: the last dash before the keyword splits', () => {
  assert.deepEqual(parseOpenSpecDisposition('checkout › Pay - then ship — Replace'), { capability: 'checkout', requirement: 'Pay - then ship', disposition: 'replace', renamedTo: null });
});

test('a malformed value is no authorisation', () => {
  for (const value of ['checkout Receipt — replace', 'checkout › Receipt', 'checkout › Receipt — overwrite', '› Receipt — keep', 'checkout › — keep', 'checkout › Receipt — rename', '']) {
    assert.equal(parseOpenSpecDisposition(value), null, value);
  }
});

test('parsing stays linear on a 200 KB adversarial value', () => {
  for (const value of [`a › ${' - '.repeat(70_000)}keep`, `${'›'.repeat(200_000)}`, `a › b — rename ${'→ '.repeat(100_000)}`]) {
    const started = performance.now();
    parseOpenSpecDisposition(value);
    assert.ok(performance.now() - started < 500);
  }
});
