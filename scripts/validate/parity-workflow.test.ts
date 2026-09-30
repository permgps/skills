import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { sha256, verifiedState } from '../state/fixtures/verification.ts';
import { collectDispatches, collectRolloutDispatches, installedDiscoveryFindings, dispatchFindings, gradeWorkflowState, prepareWorkflowTarget, readRolloutModel, workflowAgentPrompt } from './parity-workflow.ts';

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
  assert.deepEqual(dispatchFindings(dispatches), [
    'no actual raw-reference reader dispatch was recorded', 'no actual blind acceptance dispatch was recorded',
  ]);
  assert.deepEqual(dispatchFindings([]), [
    'no actual raw-reference reader dispatch was recorded',
    'no actual blind acceptance dispatch was recorded',
  ]);
  assert.deepEqual(dispatchFindings([...dispatches, {
    ...dispatches[0]!, prompt: 'Run G4 acceptance from manifest.md against legacy/ and src/',
  }]), ['no actual raw-reference reader dispatch was recorded', 'no actual blind acceptance dispatch was recorded']);
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
          message: task_name === 'acceptance_reader' ? { ciphertext: 'encrypted' }
            : task_name === 'host_probe' ? `gAAAAA${'x'.repeat(80)}==` : 'Read legacy/index.html independently.' }) }));
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
    assert.equal(dispatches.find(item => item.agentPath === '/root/reference_reader')!.prompt, 'Read legacy/index.html independently.');
    assert.equal(dispatches.find(item => item.agentPath === '/root/reference_reader')!.promptDigest, sha256('Read legacy/index.html independently.'));
    assert.equal(dispatches.find(item => item.agentPath === '/root/acceptance_reader')!.prompt, '[encrypted in Codex rollout]');
    assert.equal(dispatches.find(item => item.agentPath === '/root/host_probe')!.prompt, '[encrypted in Codex rollout]');
    assert.deepEqual(dispatchFindings(dispatches), ['blind acceptance input envelope is unavailable']);
    assert.deepEqual(dispatchFindings(dispatches.filter(item => item.agentPath !== '/root/reference_reader')),
      ['blind acceptance input envelope is unavailable', 'no actual raw-reference reader dispatch was recorded']);
    assert.deepEqual(dispatchFindings(dispatches.map(item => item.agentPath === '/root/reference_reader'
      ? { ...item, forkTurns: 'all' } : item)), ['blind acceptance input envelope is unavailable', 'no actual raw-reference reader dispatch was recorded']);
  } finally {
    if (previousHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previousHome;
    await rm(home, { recursive: true, force: true });
  }
});


test('blind workflow dispatches require fresh final returns and visible bounded inputs', () => {
  const reference = { tool: 'spawn_agent', prompt: 'Read legacy/index.html', promptDigest: sha256('Read legacy/index.html'),
    senderThreadId: 'root', receiverThreadIds: ['reference'], agentPath: '/root/reference_reader',
    forkTurns: 'none', completed: true, observedCalls: ['cat legacy/index.html'] };
  const envelope = 'Use manifest.md legacy/index.html src/index.html\n## Handoff Inputs\n| Input | What it is |\n|---|---|\n| manifest.md | agreement |\n| legacy/index.html | reference |\n| src/index.html | build |\n';
  const acceptance = { ...reference, prompt: envelope,
    promptDigest: sha256(envelope), receiverThreadIds: ['acceptance'],
    agentPath: '/root/acceptance_reader', observedCalls: ['cat manifest.md legacy/index.html src/index.html'] };
  assert.deepEqual(dispatchFindings([reference, acceptance]), []);
  assert.match(dispatchFindings([{ ...reference, prompt: '[encrypted in Codex rollout]' }, acceptance]).join(), /raw-reference input envelope/);
  for (const patch of [{ forkTurns: 'all' }, { completed: false }]) {
    assert.ok(dispatchFindings([reference, { ...acceptance, ...patch }]).length > 0);
  }
  assert.match(dispatchFindings([reference, { ...acceptance, prompt: '[encrypted in Codex rollout]' }]).join(), /input envelope/);
  assert.match(dispatchFindings([reference, { ...acceptance, observedCalls: ['cat manifest.md legacy/index.html src/index.html spec.md'] }]).join(), /withheld/);
  const prompt = envelope + '| spec.md | prohibited |\n';
  assert.match(dispatchFindings([reference, { ...acceptance, prompt, promptDigest: sha256(prompt) }]).join(), /withheld/);
});


for (const entryMode of ['installed-copy', 'installed-link'] as const) {
  test(`${entryMode} invokes discovered Maestro without supplying its skill path`, async () => {
    const prepared = await prepareWorkflowTarget('fixed', undefined, entryMode);
    try {
      const installed = path.join(prepared.target, '.agents/skills/maestro');
      assert.equal((await lstat(installed)).isSymbolicLink(), entryMode === 'installed-link');
      assert.equal(await readFile(path.join(installed, 'SKILL.md'), 'utf8'),
        await readFile('skills/maestro/SKILL.md', 'utf8'));
      assert.ok((await readFile(path.join(installed, 'references/codex.md'), 'utf8')).includes('Native Codex Runtime'));
      assert.equal((await lstat(path.join(installed, 'tools/sync.mts'))).isFile(), true);
      assert.match(workflowAgentPrompt(prepared.request, entryMode), /^\$maestro /);
      assert.doesNotMatch(workflowAgentPrompt(prepared.request, entryMode), /SKILL\.md|skills\/maestro/);
      if (entryMode === 'installed-link') assert.equal(await realpath(installed), await realpath('skills/maestro'));
      await assert.rejects(() => lstat(path.join(prepared.target, 'skills/maestro')));
    } finally { await rm(prepared.target, { recursive: true, force: true }); }
  });
}


test('installed discovery needs an actual successful host read of the selected skill', () => {
  const event = (command: string, exit_code = 0): string => JSON.stringify({ type: 'item.completed', item: {
    type: 'command_execution', status: 'completed', exit_code, command,
  } });
  const root = '/target/.agents/skills/maestro';
  assert.deepEqual(installedDiscoveryFindings(event('cat .agents/skills/maestro/SKILL.md'), root), []);
  assert.deepEqual(installedDiscoveryFindings(event('cat .agents/skills/maestro/phases/0-dials.md'), root), []);
  assert.deepEqual(installedDiscoveryFindings(event('sed -n 1,100p /target/.agents/skills/maestro/SKILL.md'), root), []);
  assert.equal(installedDiscoveryFindings(event('cat .agents/skills/maestro/SKILL.md', 1), root).length, 1);
  assert.equal(installedDiscoveryFindings(event('ls .agents/skills/maestro'), root).length, 1);
  assert.equal(installedDiscoveryFindings(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message',
    text: 'I read .agents/skills/maestro/SKILL.md' } }), root).length, 1);
});

test('evaluation cleanup stops only a verified directory-owned Node viewer and recovers forgotten records', async () => {
  const { cp, copyFile, unlink } = await import('node:fs/promises');
  const { spawn } = await import('node:child_process');
  const { createServer } = await import('node:net');
  const { stopTargetViewer } = await import('./parity-workflow.ts');
  const root = await mkdtemp(path.join(tmpdir(), 'cleanup-viewer-'));
  const foreign = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  await new Promise<void>((resolve, reject) => { foreign.once('spawn', resolve); foreign.once('error', reject); });
  const run = path.join(root, '.maestro');
  await mkdir(run);
  await cp('skills/maestro/tools/runtime', path.join(run, 'runtime'), { recursive: true });
  await copyFile('skills/maestro/tools/sync.mts', path.join(run, 'sync.mts'));
  await copyFile('skills/maestro/assets/dashboard.html', path.join(run, 'dashboard.html'));
  let owned: ReturnType<typeof spawn> | undefined;
  try {
    await writeFile(path.join(run, 'serve.json'), JSON.stringify({ pid: foreign.pid, port: 1 }));
    await stopTargetViewer(root);
    process.kill(foreign.pid!, 0);
    // Older invocations used the supplied /var path rather than its /private alias.
    // Launch that real command explicitly so orphan recovery must canonicalize it.
    const probe = createServer();
    await new Promise<void>((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
    const address = probe.address();
    assert.ok(address && typeof address !== 'string');
    await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
    owned = spawn(process.execPath, [path.join(run, 'sync.mts'), '--serve', '--port', String(address.port), '--instance', 'cleanup-fixture-instance'], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    const record = await new Promise<{ pid: number; port: number }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('owned viewer did not become ready')), 5000);
      owned!.once('message', message => { clearTimeout(timer); resolve(message as { pid: number; port: number }); });
      owned!.once('error', error => { clearTimeout(timer); reject(error); });
    });
    if (owned.connected) owned.disconnect();
    await writeFile(path.join(run, 'serve.json'), JSON.stringify(record));
    await unlink(path.join(run, 'serve.json'));
    await stopTargetViewer(root);
    assert.throws(() => process.kill(record.pid, 0));
    process.kill(foreign.pid!, 0);
  } finally {
    await stopTargetViewer(root);
    if (owned && owned.exitCode === null && owned.signalCode === null) {
      owned.kill();
      await new Promise<void>(resolve => owned!.once('exit', () => resolve()));
    }
    foreign.kill();
    if (foreign.exitCode === null) await new Promise<void>(resolve => foreign.once('exit', () => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
