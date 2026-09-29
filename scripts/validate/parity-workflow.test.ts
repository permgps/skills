import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { verifiedState } from '../state/fixtures/verification.ts';
import { collectDispatches, collectRolloutDispatches, dispatchFindings, gradeWorkflowState, prepareWorkflowTarget, readRolloutModel, workflowAgentPrompt } from './parity-workflow.ts';

test('hidden menu truth stays outside the neutral agent target', async () => {
  const prepared = await prepareWorkflowTarget('broken');
  try {
    const request = await readFile(path.join(prepared.target, 'request.txt'), 'utf8');
    const reference = await readFile(path.join(prepared.target, 'legacy', 'index.html'), 'utf8');
    const starter = await readFile(path.join(prepared.target, 'src', 'index.html'), 'utf8');
    const config = JSON.parse(await readFile(path.join(prepared.target, '.maestro', 'config.json'), 'utf8'));
    const hostInstructions = await readFile(path.join(prepared.target, 'AGENTS.md'), 'utf8');
    assert.match(request, /preserve its visible content and behavior/i);
    assert.doesNotMatch(request, /menu|hover|pointer|missing binding/i);
    assert.match(reference, /pointerenter/);
    assert.doesNotMatch(starter, /pointerenter/);
    assert.deepEqual(config, { configVersion: 1, mode: 'full', explain: 'normal' });
    assert.doesNotMatch(workflowAgentPrompt(prepared.request), /--no-open|MAESTRO_BROWSER|agent dispatch/i);
    assert.match(hostInstructions, /execution constraints, not clone requirements/i);
    assert.match(hostInstructions, /MAESTRO_SYNC_NO_OPEN/);
    assert.ok((await readFile(path.join(prepared.target, 'skills', 'maestro', 'SKILL.md'), 'utf8')).length > 0);
  } finally {
    await rm(prepared.target, { recursive: true, force: true });
  }
});

test('grader rejects completion that lacks a real failing round on the broken clone', () => {
  const state = verifiedState();
  state.verification!.references[0]!.location = 'legacy/';
  state.verification!.obligations[0]!.expectation = 'Services menu opens on pointer entry';
  const grade = gradeWorkflowState(state, 'broken', false);
  assert.equal(grade.registeredAuthority, true);
  assert.equal(grade.discoveredInteraction, true);
  assert.equal(grade.falseCompletion, true);
  assert.match(grade.reasons.join(' '), /broken clone claimed completed/);
});

test('a prior failed round cannot excuse completed closure for the broken clone', () => {
  const state = verifiedState();
  state.verification!.references[0]!.location = 'legacy/';
  state.verification!.obligations[0]!.expectation = 'Services menu opens on pointer entry';
  const priorRound = structuredClone(state.verification!.acceptanceRounds[0]!);
  priorRound.id = 'AR-PRIOR-FAILED';
  priorRound.performedAt = '2020-01-01T00:00:00.000Z';
  priorRound.g4 = 'failed';
  state.verification!.acceptanceRounds.push(priorRound);

  const grade = gradeWorkflowState(state, 'broken', false);
  assert.equal(grade.falseCompletion, true);
  assert.match(grade.reasons.join(' '), /broken clone claimed completed/);
});

test('fixed control needs actual current execution evidence', () => {
  const state = verifiedState();
  state.verification!.references[0]!.location = 'legacy/';
  state.verification!.obligations[0]!.expectation = 'Services menu opens on pointer entry';
  assert.equal(gradeWorkflowState(state, 'fixed', true).completedWithEvidence, true);
  state.verification!.executions = [];
  assert.equal(gradeWorkflowState(state, 'fixed', true).completedWithEvidence, false);
});

test('a repaired broken starter may complete after the integrated pointer check passes', () => {
  const state = verifiedState();
  state.verification!.references[0]!.location = 'legacy/';
  state.verification!.obligations[0]!.expectation = 'Services menu opens on pointer entry';
  const grade = gradeWorkflowState(state, 'broken', true);
  assert.equal(grade.falseCompletion, false);
});

test('only actual agent dispatch events count as workflow handoffs', () => {
  const events = [
    { type: 'item.started', item: { type: 'collab_tool_call', tool: 'wait', prompt: null } },
    { type: 'item.completed', item: { type: 'collab_tool_call', tool: 'spawn_agent', prompt: 'Inspect legacy/' } },
    { type: 'item.completed', item: {
      type: 'collab_tool_call', tool: 'spawn_agent', status: 'completed',
      prompt: 'G2 raw-reference: Inspect legacy/ without spec.md',
      sender_thread_id: 'root', receiver_thread_ids: ['reader'],
    } },
  ].map(item => JSON.stringify(item)).join('\n');
  const dispatches = collectDispatches(events);
  assert.equal(dispatches.length, 1);
  assert.equal(dispatches[0]!.prompt, 'G2 raw-reference: Inspect legacy/ without spec.md');
  assert.equal(dispatches[0]!.senderThreadId, 'root');
  assert.deepEqual(dispatches[0]!.receiverThreadIds, ['reader']);
  assert.deepEqual(dispatchFindings(dispatches), ['no actual blind acceptance dispatch was recorded']);
  assert.deepEqual(dispatchFindings([]), [
    'no actual raw-reference reader dispatch was recorded',
    'no actual blind acceptance dispatch was recorded',
  ]);
  assert.deepEqual(dispatchFindings([...dispatches, {
    ...dispatches[0]!, prompt: 'Run G4 acceptance from manifest.md against legacy/ and src/',
  }]), []);
});

test('saved Codex rollouts prove completed, fresh reader dispatches when JSON omits spawn calls', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'maestro-codex-rollout-test-'));
  const previousHome = process.env.CODEX_HOME;
  const now = Date.now();
  const date = new Date(now);
  const directory = path.join(home, 'sessions', String(date.getFullYear()),
    String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0'));
  const event = (payload: unknown, type = 'response_item'): string => JSON.stringify({ type, payload });
  try {
    process.env.CODEX_HOME = home;
    await mkdir(directory, { recursive: true });
    const calls = ['reference_reader', 'acceptance_reader', 'host_probe'].map(task_name =>
      event({ type: 'function_call', namespace: 'collaboration', name: 'spawn_agent',
        arguments: JSON.stringify({ task_name, fork_turns: task_name === 'host_probe' ? 'all' : 'none',
          message: 'encrypted' }) }));
    await writeFile(path.join(directory, 'rollout-parent.jsonl'),
      `${[event({ model: 'gpt-6-sol' }, 'turn_context'), ...calls].join('\n')}\n`);
    for (const [name, observed] of [
      ['reference_reader', 'cat legacy/index.html'],
      ['acceptance_reader', 'cat manifest.md legacy/index.html src/index.html'],
      ['host_probe', 'cat legacy/index.html'],
    ]) {
      const child = [
        event({ id: name, parent_thread_id: 'parent', source: { subagent: {
          thread_spawn: { agent_path: `/root/${name}` },
        } } }, 'session_meta'),
        event({ type: 'custom_tool_call', status: 'completed', input: observed }),
        event({ type: 'item_completed', item: { type: 'AgentMessage', phase: 'final_answer' } }, 'event_msg'),
      ];
      await writeFile(path.join(directory, `rollout-${name}.jsonl`), `${child.join('\n')}\n`);
    }
    const dispatches = await collectRolloutDispatches('parent', now);
    assert.equal(await readRolloutModel('parent', now), 'gpt-6-sol');
    assert.equal(dispatches.length, 3);
    assert.deepEqual(dispatchFindings(dispatches), []);
    assert.deepEqual(dispatchFindings(dispatches.filter(item => item.agentPath !== '/root/reference_reader')),
      ['no actual raw-reference reader dispatch was recorded']);
    assert.deepEqual(dispatchFindings(dispatches.map(item => item.agentPath === '/root/reference_reader'
      ? { ...item, forkTurns: 'all' } : item)), ['no actual raw-reference reader dispatch was recorded']);
  } finally {
    if (previousHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previousHome;
    await rm(home, { recursive: true, force: true });
  }
});
