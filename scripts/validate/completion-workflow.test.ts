import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { sha256, sourceVerifiedState, deferredScopeState } from '../state/fixtures/verification.ts';
import { adapterConfig, invocationArgv, normalizeTranscript, freshReturns, probeFindings,
  prepareCompletionTarget, selectedScenarios, gradeCompletionState, gradeRecordedWorkflow, invokeAdapter, type AdapterConfig, type HostEvent } from './completion-workflow.ts';

const config: AdapterConfig = { executable: process.execPath, argv: ['{prompt}'], tool: 'fixture-host',
  model: 'fixture-small', capabilityClass: 'less-capable', transcript: 'normalized-jsonl', timeoutMs: 1000 };

function receipts(): HostEvent[] {
  const prompt = 'Read original source and candidate manifest independently.';
  return [{ type: 'session', contextId: 'parent', model: config.model, tool: config.tool },
    ...['one', 'two'].flatMap(child => [
      { type: 'dispatch' as const, id: `dispatch-${child}`, parentContextId: 'parent', childContextId: child,
        forkTurns: 'none', role: 'manifest-reader', prompt, promptDigest: sha256(prompt),
        providedInputs: ['redacted source snapshots', 'candidate manifest'] },
      { type: 'read' as const, contextId: child, path: 'probe-input.txt' },
      { type: 'return' as const, dispatchId: `dispatch-${child}`, childContextId: child, returnId: `return-${child}` },
    ])];
}

test('adapter has no implicit executable/model and substitutions stay individual argv elements', () => {
  assert.deepEqual(adapterConfig(config), config);
  assert.throws(() => adapterConfig({ ...config, model: '' }), /requires/);
  assert.throws(() => adapterConfig({ ...config, argv: ['fixed'] }), /must carry/);
  const dangerous = 'literal `echo no` $(touch nope)\nsecond line';
  assert.deepEqual(invocationArgv(['exec', '{prompt}'], { prompt: dangerous }), ['exec', dangerous]);
  assert.throws(() => invocationArgv(['{unknown}'], {}), /unknown/);
});

test('focused fresh reruns preserve full-matrix defaults and require explicit bounded selection', () => {
  assert.equal(selectedScenarios([]).length, 13);
  assert.deepEqual(selectedScenarios(['--scenario', 'source-limit', '--repeat', '3']), ['source-limit', 'source-limit', 'source-limit']);
  assert.throws(() => selectedScenarios(['--repeat', '3']), /requires --scenario/);
  assert.throws(() => selectedScenarios(['--scenario', 'unknown']), /known scenario/);
  assert.throws(() => selectedScenarios(['--scenario', 'source-limit', '--repeat', '0']), /between/);
});

test('fresh probe requires two real distinct returned child identities and actual filesystem result', () => {
  assert.deepEqual(probeFindings(receipts(), config, 'token', 'token\n'), []);
  assert.match(probeFindings(receipts().filter(item => item.type !== 'return'), config, 'token', 'token').join(), /fresh-context/);
  assert.match(probeFindings(receipts(), config, 'token', 'fabricated').join(), /filesystem token/);
  const inherited = receipts().map(item => ({ ...item, ...(item.type === 'dispatch' ? { forkTurns: 'all' } : {}) }));
  assert.equal(freshReturns(inherited).length, 0);
  const opaque = receipts();
  for (const item of opaque.filter(event => event.type === 'dispatch')) {
    delete item.prompt; delete item.promptDigest;
  }
  assert.match(probeFindings(opaque, config, 'token', 'token').join(), /input envelope/);
});

test('normalization redacts transcripts, drops unparseable/model messages, and rejects wrong prompt digest', () => {
  const events = receipts();
  const source = [...events.map(item => JSON.stringify(item)), 'unparseable',
    JSON.stringify({ type: 'self-authored-dispatch', id: 'fake' }),
    JSON.stringify({ type: 'message', text: 'OPENAI_API_KEY=sk-abcdefgh1234567890123456789012' })].join('\n');
  const normalized = normalizeTranscript(source);
  assert.equal(freshReturns(normalized).length, 2);
  assert.doesNotMatch(JSON.stringify(normalized), /sk-abcdefgh/);
  assert.deepEqual(normalizeTranscript(JSON.stringify({ type: 'dispatch', prompt: 'actual', promptDigest: 'wrong' })), []);
});

test('hidden grading truth and scenario names stay outside target prompt/host instructions', async () => {
  for (const scenario of ['source-limit', 'persistence', 'insensitive-detector', 'startup', 'repeated-repair', 'deferral', 'relaxed-target', 'unavailable', 'repaired', 'backend'] as const) {
    const prepared = await prepareCompletionTarget(scenario);
    try {
      assert.doesNotMatch(prepared.input.prompt, /hidden|grader|suspected|insensitive|volatile|missing limit/i);
      assert.match(prepared.input.prompt, /full strict.*polish disabled/);
      const host = await readFile(path.join(prepared.input.target, 'AGENTS.md'), 'utf8');
      assert.doesNotMatch(host, /limit|detector|restart|menu/i);
      assert.match(host, /not requirements/);
      assert.ok((await readFile(path.join(prepared.input.target, 'skills/maestro/prompts/manifest-reader.md'), 'utf8')).length > 0);
      if (scenario === 'persistence') assert.match(await readFile(path.join(prepared.input.target, 'src/index.html'), 'utf8'), /\|\| 'volatile-only'/);
      if (scenario === 'deferral' || scenario === 'relaxed-target') assert.equal(prepared.input.turns[0]!.after, 'G1');
    } finally { await rm(prepared.input.target, { recursive: true, force: true }); }
  }
});

test('actual host audit receipt mismatch and unsupported completion cannot pass scenario grading', () => {
  const state = sourceVerifiedState(); state.mode = 'full'; state.depth = 'strict';
  const events = receipts();
  const reasons = gradeCompletionState(state, 'source-limit', events, 'Подтверждено выполнено');
  assert.match(reasons.join(), /identities do not match/);
  assert.match(reasons.join(), /omitted limit/);
  const deferral = deferredScopeState(); deferral.mode = 'full'; deferral.depth = 'strict';
  assert.doesNotMatch(gradeCompletionState(deferral, 'deferral', events, '').join(), /launders/);
  deferral.verification!.scopeBaseline!.requirementIds = deferral.verification!.scopeBaseline!.requirementIds.slice(0, 18);
  assert.match(gradeCompletionState(deferral, 'deferral', events, '').join(), /launders/);
});

test('a host-observed inline source envelope need not fabricate a child filesystem read', () => {
  const state = sourceVerifiedState();
  const events = receipts().filter(item => item.type !== 'read');
  for (const event of events.filter(item => item.type === 'dispatch')) {
    event.prompt = `Read this exact source: ${JSON.stringify(state.verification!.sourceSnapshots[0]!.text)}`;
    event.promptDigest = sha256(event.prompt);
  }
  assert.doesNotMatch(gradeCompletionState(state, 'source-limit', events, 'Incomplete.').join(), /did not receive actual original source/);
  for (const event of events.filter(item => item.type === 'dispatch')) {
    event.prompt = 'A paraphrase supplied instead of the original'; event.promptDigest = sha256(event.prompt);
  }
  assert.match(gradeCompletionState(state, 'source-limit', events, 'Incomplete.').join(), /did not receive actual original source/);
});

test('a returned incomplete draft audit can discover an omission before a corrected passing audit', () => {
  const state = sourceVerifiedState();
  const audit = state.verification!.manifestAudits[0]!;
  state.verification!.manifestAudits.unshift({ ...audit, id: 'MA-DRAFT', result: 'incomplete',
    findings: ['The original maximum of 3 entries is missing; invalid returned offsets were not imported.'] });
  assert.doesNotMatch(gradeCompletionState(state, 'source-limit', receipts(), 'Incomplete.').join(), /did not discover and repair the omitted limit/);
});

test('historical inline audit inputs need only contain the sources that audit actually binds', () => {
  const state = sourceVerifiedState();
  const initial = state.verification!.sourceSnapshots[0]!;
  const events = receipts().filter(item => item.type !== 'read' && item.childContextId !== 'two');
  const dispatch = events.find(item => item.type === 'dispatch')!;
  dispatch.prompt = JSON.stringify(initial.text); dispatch.promptDigest = sha256(dispatch.prompt);
  state.verification!.manifestAudits[0]!.dispatchId = dispatch.id!;
  state.verification!.sourceSnapshots.push({ ...initial, id: 'SRC-2', origin: 'addition',
    text: 'A later authorized change.', sha256: sha256('A later authorized change.'), targetRevision: 2 });
  assert.doesNotMatch(gradeCompletionState(state, 'source-limit', events, 'Incomplete.').join(), /did not receive actual original source/);
});

test('caller-supplied process adapter actually executes with literal argv and retains redacted output', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'maestro-adapter-test-'));
  try {
    const script = path.join(root, 'adapter.mjs');
    await writeFile(script, "console.log(JSON.stringify({type:'session',contextId:'actual',model:'fixture-small',tool:'fixture-host'}));\nconsole.log(JSON.stringify({type:'message',text:process.argv[2]}));\n");
    const literal = '`echo no` $(touch nope)';
    const result = await invokeAdapter({ ...config, argv: [script, '{prompt}'] }, { target: root, prompt: literal, turns: [] }, path.join(root, 'output'));
    assert.equal(result.exitCode, 0);
    assert.equal(result.observedModel, 'fixture-small');
    assert.equal(result.events.find(item => item.type === 'message')!.text, literal);
    await assert.rejects(() => readFile(path.join(root, 'nope')));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('host events survive before timeout and split credential chunks are redacted before persistence', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'maestro-streamed-adapter-test-'));
  let invocation: ReturnType<typeof invokeAdapter> | undefined;
  try {
    const script = path.join(root, 'adapter.mjs');
    await writeFile(script, "process.stdout.write(JSON.stringify({type:'session',contextId:'actual',model:'fixture-small',tool:'fixture-host'})+'\\n');\n"
      + "process.stdout.write('{\"type\":\"message\",\"text\":\"OPENAI_API_KEY=sk-abc');\n"
      + "setTimeout(()=>process.stdout.write('defgh1234567890123456789012\"}\\n'),80);\nsetTimeout(()=>{},5000);\n");
    const output = path.join(root, 'output');
    invocation = invokeAdapter({ ...config, argv: [script, '{prompt}'] }, { target: root, prompt: 'Probe.', turns: [] }, output);
    await new Promise(resolve => setTimeout(resolve, 250));
    const early = await readFile(path.join(output, 'events.jsonl'), 'utf8');
    assert.match(early, /actual/);
    assert.match(early, /REDACTED/);
    assert.doesNotMatch(early, /sk-abc/);
    const result = await invocation;
    assert.equal(result.timedOut, true);
    assert.doesNotMatch(await readFile(path.join(output, 'events.jsonl'), 'utf8'), /sk-abc/);
  } finally {
    await invocation;
    await rm(root, { recursive: true, force: true });
  }
});

test('recorded external runs preserve missing state, changed authority, and absent host identity as failures', async () => {
  const output = await mkdtemp(path.join(tmpdir(), 'maestro-recorded-test-'));
  try {
    const target = path.join(output, 'target-1');
    const prepared = await prepareCompletionTarget('backend', target);
    const inputFile = path.join(output, 'input.json');
    const eventsFile = path.join(output, 'events.jsonl');
    const finalFile = path.join(output, 'final.txt');
    await writeFile(inputFile, JSON.stringify(prepared));
    await writeFile(eventsFile, '');
    await writeFile(finalFile, 'Not completed: no execution was available.');
    await writeFile(path.join(target, 'request.txt'), 'A silently narrowed replacement');
    const session = { scenario: 'backend', target, inputFile, eventsFile, finalFile,
      requestedModel: 'fixture-small', agentPath: 'actual-parent' };
    await writeFile(path.join(output, 'sessions.json'), JSON.stringify({ runs: [session] }));
    const result = await gradeRecordedWorkflow(output);
    assert.equal(result.status, 'failed');
    const reasons = (result.runs[0] as { reasons: string[] }).reasons.join('\n');
    assert.match(reasons, /no readable verification-2 or verification-3 state/);
    assert.match(reasons, /host-observed model/);
    assert.match(reasons, /protected input changed: request.txt/);
    assert.equal(JSON.parse(await readFile(path.join(output, 'recorded-results.json'), 'utf8')).status, 'failed');
    await writeFile(inputFile, JSON.stringify({ ...prepared, protectedDigests: {} }));
    const missingProtection = await gradeRecordedWorkflow(output);
    assert.match((missingProtection.runs[0] as { reasons: string[] }).reasons.join(), /protected input identities/);
    await writeFile(inputFile, JSON.stringify(prepared));
    await writeFile(path.join(output, 'sessions.json'), JSON.stringify({ runs: [{ ...session, target: tmpdir() }] }));
    await assert.rejects(() => gradeRecordedWorkflow(output), /isolated descendant/);
    await writeFile(path.join(output, 'sessions.json'), JSON.stringify({ runs: [{ ...session, target: path.join(output, 'another-target') }] }));
    await assert.rejects(() => gradeRecordedWorkflow(output), /differs from the prepared input/);
  } finally { await rm(output, { recursive: true, force: true }); }
});
