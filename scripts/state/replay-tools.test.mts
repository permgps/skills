// Durable tools cannot be rewritten away from an original execution invocation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { activeContract10State } from './fixtures/verification.ts';
import { validateState } from './validate.ts';
import { validateStateTransition } from './closure.ts';

test('optional replay metadata accepts disposable scratch but freezes every declared locator', () => {
  const prior = activeContract10State();
  assert.deepEqual(validateState(prior), []);
  prior.verification!.replayTools = [{ id: 'RT-1', path: '_orchestrator/RT-1/tool.mts', sha256: 'a'.repeat(64), checkIds: [], invocation: 'node scratch.mts' }];
  assert.deepEqual(validateState(prior), []);
  const next = structuredClone(prior);
  delete next.verification!.replayTools;
  assert.ok(validateStateTransition(prior, next).some(e => e.field.includes('replayTools')));
  next.verification!.replayTools = structuredClone(prior.verification!.replayTools!);
  next.verification!.replayTools[0]!.invocation = 'rewritten history';
  assert.ok(validateStateTransition(prior, next).some(e => e.field.includes('replayTools')));
  next.verification!.replayTools[0]!.path = '_orchestrator/RT-1/../../outside.mts';
  assert.ok(validateState(next).some(e => e.field.includes('replayTools')));
});
