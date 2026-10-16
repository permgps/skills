// Publication coverage must work in the installed helper, not only repository G3.
import test from 'node:test';
import assert from 'node:assert/strict';
import { activeContract10State } from './fixtures/verification.ts';
import { validateStateTransition } from './closure.ts';
import { checkPlanGraph, validatePlanPublication } from './plan-graph.ts';

test('a new passed G3 claim cannot carry the empty graph observed in the active run', () => {
  const prior = activeContract10State();
  prior.gates[2]!.status = 'pending';
  const next = structuredClone(prior);
  next.gates[2]!.status = 'passed';
  next.verification!.obligations = [];
  next.verification!.checks = [];
  assert.ok(validateStateTransition(prior, next).some(item => item.field.startsWith('verification.plan')));
  assert.ok(validatePlanPublication(next).length, 'first publication is guarded too');
  assert.deepEqual(validatePlanPublication(next, next), [], 'historical identical replay remains readable');
});

test('graph guards preserve separate owners and reject missing current required checks', () => {
  const state = activeContract10State();
  state.tasks.push({ ...structuredClone(state.tasks[0]!), id: '02', files: [], zone: [], blockedBy: ['01'] });
  state.verification!.checks[0]!.executionTaskId = '02';
  assert.deepEqual(checkPlanGraph(state), []);
  state.verification!.checks[0]!.required = false;
  assert.ok(checkPlanGraph(state).some(f => f.message.includes('required executable')));
  state.verification!.checks[0]!.required = true;
  state.tasks[1]!.blockedBy = [];
  assert.ok(checkPlanGraph(state).some(f => f.message.includes('transitively depend')));
  state.requirements.push({ id: 'R02', status: 'deferred', reason: 'Later' });
  state.tasks[1]!.blockedBy = ['01'];
  assert.deepEqual(checkPlanGraph(state), []);
  state.requirements[1]!.status = 'placeholder';
  assert.ok(checkPlanGraph(state).some(f => f.requirementId === 'R02'));
});

test('a failed G3 continuation does not invent a successful verification graph', () => {
  const prior = activeContract10State();
  prior.gates[2]!.status = 'failed';
  prior.verification!.obligations = [];
  prior.verification!.checks = [];
  const next = structuredClone(prior);
  next.updatedAt = '2026-09-29T09:30:00Z';
  assert.ok(!validateStateTransition(prior, next).some(item => item.field.startsWith('verification.plan')));
});
