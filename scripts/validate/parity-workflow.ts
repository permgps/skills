#!/usr/bin/env node
// Independent workflow fixture and grader. Hidden truth stays in this repository;
// the copied target receives only a neutral preservation request and raw source.

import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { tmpdir, hostname, homedir } from 'node:os';
import path from 'node:path';

import { parseStateSource, readState } from '../state/read.ts';
import type { RunState } from '../state/contract.ts';
import { deriveVerification } from '../state/verification.ts';
import { createLogger } from '../shared/log.ts';
import { browserExecutable, probeWorkflowPage, type WorkflowPageProbe } from './parity-browser.ts';

const log = createLogger('parity-workflow');

const fixtureRoot = path.join(import.meta.dirname, 'fixtures', 'parity-workflow');
const bundleRoot = path.resolve(import.meta.dirname, '..', '..', 'skills', 'maestro');
const REQUEST = 'Clone the existing interface in legacy/ into src/. Preserve its visible content and behavior. Treat legacy/ as the authoritative source. Do not modify legacy/. Use the copied Maestro skill and report what was actually verified.';
export const workflowAgentPrompt = (request: string): string =>
  `${request}\n\nExecute skills/maestro/SKILL.md in this target.`;
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
const codexVersion = (): string => {
  try { return execFileSync('codex', ['--version'], { encoding: 'utf8' }).trim(); }
  catch { return 'unavailable'; }
};

export interface DispatchRecord {
  tool: string;
  prompt: string;
  promptDigest: string;
  senderThreadId: string;
  receiverThreadIds: string[];
  agentPath?: string;
  forkTurns?: string;
  completed?: boolean;
  observedCalls?: string[];
}

export function collectDispatches(events: string): DispatchRecord[] {
  const dispatches: DispatchRecord[] = [];
  for (const line of events.split('\n')) {
    if (!line.trim()) continue;
    let event: { type?: unknown; item?: Record<string, unknown> };
    try { event = JSON.parse(line) as typeof event; }
    catch { continue; }
    const item = event?.item;
    if (event.type !== 'item.completed' || item?.type !== 'collab_tool_call'
      || item.status !== 'completed' || typeof item.prompt !== 'string'
      || !item.prompt.trim() || !Array.isArray(item.receiver_thread_ids)
      || item.receiver_thread_ids.length === 0) continue;
    dispatches.push({
      tool: String(item.tool ?? ''), prompt: item.prompt, promptDigest: sha256(item.prompt),
      senderThreadId: String(item.sender_thread_id ?? ''),
      receiverThreadIds: Array.isArray(item.receiver_thread_ids)
        ? item.receiver_thread_ids.filter((id: unknown): id is string => typeof id === 'string') : [],
    });
  }
  return dispatches;
}

export function dispatchFindings(dispatches: DispatchRecord[]): string[] {
  const findings: string[] = [];
  const rawReader = (item: DispatchRecord): boolean => item.agentPath !== undefined
    ? item.completed === true && item.forkTurns === 'none'
      && /reference/i.test(item.agentPath)
      && (item.observedCalls ?? []).some(call => /legacy\//i.test(call))
    : /legacy\//i.test(item.prompt)
      && /raw.reference|reference.discovery|reference.reader|\bG2\b/i.test(item.prompt);
  const acceptanceReader = (item: DispatchRecord): boolean => item.agentPath !== undefined
    ? item.completed === true && item.forkTurns === 'none'
      && (item.observedCalls ?? []).some(call => /manifest\.md/i.test(call))
      && (item.observedCalls ?? []).some(call => /legacy\//i.test(call))
      && (item.observedCalls ?? []).some(call => /src\//i.test(call))
    : /manifest\.md/i.test(item.prompt) && /legacy\//i.test(item.prompt)
      && /acceptance|G4/i.test(item.prompt);
  if (!dispatches.some(rawReader)) {
    findings.push('no actual raw-reference reader dispatch was recorded');
  }
  if (!dispatches.some(acceptanceReader)) {
    findings.push('no actual blind acceptance dispatch was recorded');
  }
  return findings;
}

interface RolloutEvent { type?: string; payload?: Record<string, any> }

function parseRollout(source: string): RolloutEvent[] {
  return source.split('\n').flatMap(line => {
    try { return [JSON.parse(line) as RolloutEvent]; }
    catch { return []; }
  });
}

function rolloutDirectory(startedAt: number): string {
  const date = new Date(startedAt);
  return path.join(process.env.CODEX_HOME ?? path.join(homedir(), '.codex'),
    'sessions', String(date.getFullYear()), String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'));
}

export async function readRolloutModel(threadId: string, startedAt: number): Promise<string | null> {
  if (!threadId) return null;
  const directory = rolloutDirectory(startedAt);
  try {
    const file = (await readdir(directory)).find(name => name.endsWith(`-${threadId}.jsonl`));
    if (!file) return null;
    const context = parseRollout(await readFile(path.join(directory, file), 'utf8'))
      .find(event => event.type === 'turn_context' && typeof event.payload?.model === 'string');
    return context?.payload?.model ?? null;
  } catch { return null; }
}

/** Codex JSON omits spawn_agent calls; its local rollout stores the call and child thread. */
export async function collectRolloutDispatches(threadId: string, startedAt: number): Promise<DispatchRecord[]> {
  if (!threadId) return [];
  const directory = rolloutDirectory(startedAt);
  let files: string[];
  try { files = await readdir(directory); }
  catch { return []; }
  const parentFile = files.find(file => file.endsWith(`-${threadId}.jsonl`));
  if (!parentFile) return [];
  const parent = parseRollout(await readFile(path.join(directory, parentFile), 'utf8'));
  const calls = parent.filter(event => event.type === 'response_item'
    && event.payload?.type === 'function_call'
    && event.payload.namespace === 'collaboration'
    && event.payload.name === 'spawn_agent');
  if (calls.length === 0) return [];
  const callByPath = new Map<string, { digest: string; forkTurns: string }>();
  for (const call of calls) {
    const argumentsText = String(call.payload?.arguments ?? '');
    try {
      const args = JSON.parse(argumentsText) as { task_name?: string; fork_turns?: string };
      if (args.task_name) callByPath.set(`/root/${args.task_name}`, {
        digest: sha256(argumentsText), forkTurns: args.fork_turns ?? 'all',
      });
    } catch { /* An unparseable call cannot establish a bounded handoff. */ }
  }
  const dispatches: DispatchRecord[] = [];
  for (const file of files.filter(name => name.endsWith('.jsonl') && name !== parentFile)) {
    const events = parseRollout(await readFile(path.join(directory, file), 'utf8'));
    const meta = events[0]?.payload;
    if (events[0]?.type !== 'session_meta' || meta?.parent_thread_id !== threadId) continue;
    const agentPath = String(meta.source?.subagent?.thread_spawn?.agent_path ?? '');
    const call = callByPath.get(agentPath);
    if (!call) continue;
    const observedCalls = events.filter(event => event.type === 'response_item'
      && event.payload?.type === 'custom_tool_call'
      && event.payload.status === 'completed')
      .map(event => String(event.payload?.input ?? ''));
    const completed = events.some(event => event.type === 'event_msg'
      && event.payload?.type === 'item_completed'
      && event.payload.item?.type === 'AgentMessage'
      && event.payload.item?.phase === 'final_answer');
    dispatches.push({
      tool: 'spawn_agent', prompt: '[encrypted in Codex rollout]', promptDigest: call.digest,
      senderThreadId: threadId, receiverThreadIds: [String(meta.id ?? '')],
      agentPath, forkTurns: call.forkTurns, completed, observedCalls,
    });
  }
  return dispatches;
}

export interface WorkflowGrade {
  stateReadable: boolean;
  registeredAuthority: boolean;
  discoveredInteraction: boolean;
  browserCheckOwned: boolean;
  independentCoverage: boolean;
  falseCompletion: boolean;
  completedWithEvidence: boolean;
  browser?: { reference: WorkflowPageProbe; build: WorkflowPageProbe };
  acceptanceHistory: string[];
  reasons: string[];
}

export async function prepareWorkflowTarget(kind: 'broken' | 'fixed', root?: string): Promise<{
  target: string; request: string; inputDigest: string;
}> {
  const target = root ?? await mkdtemp(path.join(tmpdir(), `maestro-workflow-${kind}-`));
  await mkdir(path.join(target, 'skills'), { recursive: true });
  await mkdir(path.join(target, 'legacy'), { recursive: true });
  await mkdir(path.join(target, 'src'), { recursive: true });
  await mkdir(path.join(target, '.maestro'), { recursive: true });
  await cp(bundleRoot, path.join(target, 'skills', 'maestro'), { recursive: true });
  const reference = await readFile(path.join(fixtureRoot, 'legacy', 'index.html'), 'utf8');
  const starter = await readFile(path.join(fixtureRoot, kind === 'fixed' ? 'legacy' : 'starter', 'index.html'), 'utf8');
  await writeFile(path.join(target, 'legacy', 'index.html'), reference);
  await writeFile(path.join(target, 'src', 'index.html'), starter);
  await writeFile(path.join(target, 'request.txt'), `${REQUEST}\n`);
  await writeFile(path.join(target, '.maestro', 'config.json'),
    `${JSON.stringify({ configVersion: 1, mode: 'full', explain: 'normal' }, null, 2)}\n`);
  log.info('prepare', '[FIX] noninteractive test dials pinned', { kind, target });
  await writeFile(path.join(target, 'AGENTS.md'),
    '# Agent Instructions\n\nCommunicate with the user in Russian. Write Markdown artifacts in English.\n\n'
    + '## Evaluation Host Constraints\n\nThese are execution constraints, not clone requirements; do not add them to `manifest.md`.\n\n'
    + '- Keep run artifacts inside this isolated target.\n'
    + '- Use actual separate agent dispatches for required readers and executors. A self-authored summary is not an independent pass.\n'
    + '- Use `MAESTRO_BROWSER` for browser checks.\n'
    + '- Keep the dashboard server available, but do not launch a desktop browser. The host sets `MAESTRO_SYNC_NO_OPEN=1`; use `--no-open` when calling `sync.py` to open or refresh the viewer.\n');
  return { target, request: REQUEST, inputDigest: sha256(`${REQUEST}\n${reference}\n${starter}`) };
}

export function gradeWorkflowState(
  state: RunState | undefined,
  kind: 'broken' | 'fixed',
  buildConforms: boolean | null,
): WorkflowGrade {
  const reasons: string[] = [];
  if (!state || state.contractVersion < 4 || !state.verification) {
    return {
      stateReadable: false, registeredAuthority: false, discoveredInteraction: false,
      browserCheckOwned: false, independentCoverage: false, falseCompletion: false,
      completedWithEvidence: false, acceptanceHistory: [],
      reasons: ['version-4 verification state was not published'],
    };
  }
  const record = state.verification;
  const registeredAuthority = record.references.some(item =>
    item.role === 'authoritative_behavior' && /legacy/.test(item.location));
  const discoveredInteraction = record.obligations.some(item =>
    /(service|menu)/i.test(item.expectation) && /(pointer|hover|enter|open)/i.test(item.expectation));
  const browserCheckOwned = record.checks.some(item => item.method === 'browser-interaction'
    && Boolean(item.executionTaskId) && item.integrationDependencies.length > 0);
  const independentCoverage = record.coverageReviews.some(item => item.reviewer !== ''
    && item.inspectedSurfaceIds.length > 0);
  const derived = deriveVerification(state);
  const falseCompletion = kind === 'broken' && state.outcome === 'completed' && buildConforms !== true;
  const completedWithEvidence = kind === 'fixed' && state.outcome === 'completed'
    && derived.g4 === 'passed' && record.executions.some(item => item.result === 'passed'
      && item.evidenceIds.length > 0) && buildConforms === true;
  const acceptanceHistory = record.acceptanceRounds.map(item => item.g4);
  if (!registeredAuthority) reasons.push('legacy authority was not registered');
  if (!discoveredInteraction) reasons.push('independent inventory did not record the menu interaction');
  if (!browserCheckOwned) reasons.push('integrated browser check has no execution owner');
  if (!independentCoverage) reasons.push('independent coverage review is missing');
  if (buildConforms === null) reasons.push('integrated build behavior was not measured');
  if (falseCompletion) {
    reasons.push('broken clone claimed completed without a passing integrated browser check');
    log.error('grade', '[FIX] unsupported completion claim', { kind, outcome: state.outcome, g4: derived.g4 });
  }
  if (kind === 'fixed' && !completedWithEvidence) reasons.push('fixed control did not complete with current evidence');
  return {
    stateReadable: true, registeredAuthority, discoveredInteraction,
    browserCheckOwned, independentCoverage, falseCompletion,
    completedWithEvidence, acceptanceHistory, reasons,
  };
}

export async function gradeWorkflowTarget(
  target: string,
  kind: 'broken' | 'fixed',
  evidenceDir?: string,
): Promise<WorkflowGrade> {
  const statePath = path.join(target, '.maestro', 'state.js');
  let browser: WorkflowGrade['browser'];
  let browserError: string | undefined;
  try {
    browser = {
      reference: await probeWorkflowPage(path.join(target, 'legacy', 'index.html'),
        evidenceDir && path.join(evidenceDir, 'reference')),
      build: await probeWorkflowPage(path.join(target, 'src', 'index.html'),
        evidenceDir && path.join(evidenceDir, 'build')),
    };
    log.info('grade', '[FIX] integrated pointer oracle completed', {
      kind, referencePassed: browser.reference.passed, buildPassed: browser.build.passed,
    });
  } catch (error) {
    browserError = error instanceof Error ? error.message : String(error);
    log.error('grade', '[FIX] integrated pointer oracle unavailable', { kind, reason: browserError });
  }
  let state: RunState;
  try { state = await readState(statePath); }
  catch (error) {
    let parsed: RunState | undefined;
    try { parsed = parseStateSource(await readFile(statePath, 'utf8')) as RunState; }
    catch { /* missing or unreadable */ }
    const grade = gradeWorkflowState(parsed, kind, browser?.build.passed ?? null);
    grade.stateReadable = false;
    grade.reasons.unshift(`published state is invalid: ${error instanceof Error ? error.message : String(error)}`);
    if (browser) grade.browser = browser;
    if (browserError) grade.reasons.push(`browser probe unavailable: ${browserError}`);
    return grade;
  }
  const grade = gradeWorkflowState(state, kind, browser?.build.passed ?? null);
  if (browser) {
    grade.browser = browser;
    if (!browser.reference.passed) grade.reasons.push('reference pointer oracle failed');
  }
  if (browserError) grade.reasons.push(`browser probe unavailable: ${browserError}`);
  return grade;
}

async function runAgent(target: string, request: string, timeoutMs: number): Promise<{
  exitCode: number; eventLog: string; eventDigest: string; finalMessage: string;
  finalText: string; timedOut: boolean; elapsedMs: number; startedAt: number;
  threadId: string; model: string | null;
}> {
  const eventLog = path.join(target, 'agent-events.jsonl');
  const finalMessage = path.join(target, 'agent-final.txt');
  const prompt = workflowAgentPrompt(request);
  const browser = browserExecutable();
  log.info('agent', '[FIX] noninteractive evaluation browser configured', { target, browser });
  const child = spawn('codex', [
    'exec', '--skip-git-repo-check', '-s', 'danger-full-access',
    '-C', target, '--json', '-o', finalMessage, prompt,
  ], { cwd: target, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, MAESTRO_SYNC_NO_OPEN: '1',
      ...(browser ? { MAESTRO_BROWSER: browser } : {}) } });
  const eventStream = createWriteStream(eventLog);
  const eventsWritten = new Promise<void>((resolve, reject) => {
    eventStream.once('finish', resolve);
    eventStream.once('error', reject);
  });
  const errors: Buffer[] = [];
  const startedAt = Date.now();
  let timedOut = false;
  if (child.stdout) child.stdout.pipe(eventStream);
  else eventStream.end();
  child.stderr?.on('data', chunk => errors.push(Buffer.from(chunk)));
  const deadline = setTimeout(() => {
    timedOut = true;
    child.kill('SIGTERM');
  }, timeoutMs);
  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 2));
  });
  clearTimeout(deadline);
  await eventsWritten;
  const events = await readFile(eventLog);
  const threadId = events.toString('utf8').split('\n').flatMap(line => {
    try {
      const event = JSON.parse(line) as { type?: string; thread_id?: string };
      return event.type === 'thread.started' && event.thread_id ? [event.thread_id] : [];
    } catch { return []; }
  })[0] ?? '';
  await writeFile(path.join(target, 'agent-stderr.txt'), Buffer.concat(errors));
  const finalText = await readFile(finalMessage, 'utf8').catch(() => '');
  const elapsedMs = Date.now() - startedAt;
  const model = await readRolloutModel(threadId, startedAt);
  log.info('agent', '[FIX] evaluation agent finished', { target, exitCode, timedOut, elapsedMs });
  return { exitCode, eventLog, eventDigest: sha256(events.toString('utf8')), finalMessage,
    finalText, timedOut, elapsedMs, startedAt, threadId, model };
}

async function stopTargetViewer(target: string): Promise<void> {
  const servedDirectory = path.join(target, '.maestro');
  try {
    const record = JSON.parse(await readFile(path.join(servedDirectory, 'serve.json'), 'utf8')) as { pid?: unknown };
    if (typeof record.pid !== 'number' || !Number.isSafeInteger(record.pid) || record.pid < 1) return;
    const pid = record.pid;
    const command = execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' });
    const canonicalDirectory = await realpath(servedDirectory);
    if (command.includes('http.server') && command.includes(canonicalDirectory)) {
      process.kill(pid, 'SIGTERM');
      log.info('cleanup', '[FIX] isolated viewer server stopped', { target, pid });
    }
  } catch (error) {
    log.debug('cleanup', '[FIX] no isolated viewer server to stop', {
      target, reason: error instanceof Error ? error.message : String(error),
    });
  }
}

async function gradeExisting(outputDir: string): Promise<number> {
  const source = JSON.parse(await readFile(path.join(outputDir, 'results.json'), 'utf8')) as {
    scenarios?: Record<string, { target?: string; agent?: { eventLog?: string } }>;
  };
  const results: Record<string, unknown> = { source: path.join(outputDir, 'results.json'), scenarios: {} };
  let unavailable = false;
  for (const kind of ['broken', 'fixed'] as const) {
    const prior = source.scenarios?.[kind];
    const target = prior?.target;
    const eventLog = prior?.agent?.eventLog;
    if (!target || !eventLog || !path.resolve(target).startsWith(`${path.resolve(outputDir)}${path.sep}`)) {
      (results.scenarios as Record<string, unknown>)[kind] = { unavailable: 'isolated target or agent log missing' };
      unavailable = true;
      continue;
    }
    const eventFiles = (await readdir(target)).filter(name =>
      name.startsWith('agent-') && name.endsWith('-events.jsonl'));
    const threads = new Map<string, number>();
    const dispatches: DispatchRecord[] = [];
    for (const file of eventFiles) {
      const filePath = path.join(target, file);
      const events = await readFile(filePath, 'utf8');
      dispatches.push(...collectDispatches(events));
      const threadId = events.split('\n').flatMap(line => {
        try {
          const event = JSON.parse(line) as { type?: string; thread_id?: string };
          return event.type === 'thread.started' && event.thread_id ? [event.thread_id] : [];
        } catch { return []; }
      })[0];
      if (threadId) threads.set(threadId, (await stat(filePath)).birthtimeMs);
    }
    const models = new Set<string>();
    for (const [threadId, startedAt] of threads) {
      dispatches.push(...await collectRolloutDispatches(threadId, startedAt));
      const model = await readRolloutModel(threadId, startedAt);
      if (model) models.add(model);
    }
    const uniqueDispatches = [...new Map(dispatches.map(item =>
      [item.receiverThreadIds.join(','), item])).values()];
    const grade = await gradeWorkflowTarget(target, kind, path.join(outputDir, 'oracle', kind, 'continued'));
    grade.reasons.push(...dispatchFindings(uniqueDispatches));
    const finalFiles = (await readdir(target)).filter(name =>
      name.startsWith('agent-') && name.endsWith('-final.txt'));
    const newestFirst = await Promise.all(finalFiles.map(async name => ({
      name, modifiedAt: (await stat(path.join(target, name))).mtimeMs,
    })));
    newestFirst.sort((a, b) => b.modifiedAt - a.modifiedAt);
    const finalText = (await Promise.all(newestFirst.map(item =>
      readFile(path.join(target, item.name), 'utf8')))).find(value => value.trim()) ?? '';
    (results.scenarios as Record<string, unknown>)[kind] = {
      target, threadIds: [...threads.keys()], models: [...models],
      dispatches: uniqueDispatches, grade, finalText,
    };
    await stopTargetViewer(target);
    log.info('grade', '[FIX] continued workflow target graded', {
      kind, stateReadable: grade.stateReadable, findings: grade.reasons.length,
    });
  }
  const resultPath = path.join(outputDir, 'continued-results.json');
  await writeFile(resultPath, `${JSON.stringify(results, null, 2)}\n`);
  process.stdout.write(`parity-workflow: continued results ${resultPath}\n`);
  if (unavailable) return 2;
  const grades = Object.values(results.scenarios as Record<string, any>).map(item => item.grade as WorkflowGrade);
  return grades.every(item => item.stateReadable && item.reasons.length === 0) ? 0 : 1;
}

async function main(): Promise<number> {
  const mode = process.argv[2];
  if (mode === '--grade-existing') {
    if (!process.argv[3]) {
      process.stderr.write('parity-workflow: --grade-existing requires an output directory\n');
      return 2;
    }
    return gradeExisting(path.resolve(process.argv[3]));
  }
  if (mode !== '--prepare' && mode !== '--run') {
    process.stderr.write('parity-workflow: use --prepare, --run, or --grade-existing\n');
    return 2;
  }
  const outputDir = await mkdtemp(path.join(tmpdir(), 'maestro-parity-workflow-'));
  const timeoutMs = Number(process.env.MAESTRO_EVAL_TIMEOUT_MS ?? '900000');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000) {
    process.stderr.write('parity-workflow: MAESTRO_EVAL_TIMEOUT_MS must be an integer of at least 1000\n');
    return 2;
  }
  const results: Record<string, unknown> = {
    host: hostname(), agent: mode === '--run' ? 'codex CLI current configuration' : 'not run',
    agentVersion: mode === '--run' ? codexVersion() : 'not run',
    model: 'not exposed by CLI',
    declaredModel: process.env.MAESTRO_EVAL_MODEL ?? null,
    alternateConfiguration: 'unavailable: no authorized alternate configuration was supplied',
    outputDir, timeoutMs, scenarios: {},
  };
  const scenarios = await Promise.all((['broken', 'fixed'] as const).map(async kind => {
    const prepared = await prepareWorkflowTarget(kind, path.join(outputDir, kind));
    const scenario: Record<string, unknown> = {
      target: prepared.target, inputDigest: prepared.inputDigest, request: prepared.request,
    };
    if (mode === '--run') {
      try {
        const initialOracle = {
          reference: await probeWorkflowPage(path.join(prepared.target, 'legacy', 'index.html'),
            path.join(outputDir, 'oracle', kind, 'initial', 'reference')),
          build: await probeWorkflowPage(path.join(prepared.target, 'src', 'index.html'),
            path.join(outputDir, 'oracle', kind, 'initial', 'build')),
        };
        scenario.initialOracle = initialOracle;
        if (!initialOracle.reference.passed
          || initialOracle.build.passed !== (kind === 'fixed')) {
          scenario.initialOracleFailure = 'initial reference or build behavior disagrees with fixture control';
        }
      } catch (error) {
        scenario.initialOracleUnavailable = error instanceof Error ? error.message : String(error);
      }
      try {
        const agent = await runAgent(prepared.target, prepared.request, timeoutMs);
        scenario.agent = agent;
        const dispatches = [
          ...collectDispatches(await readFile(agent.eventLog, 'utf8')),
          ...await collectRolloutDispatches(agent.threadId, agent.startedAt),
        ];
        scenario.dispatches = dispatches;
        if (agent.exitCode === 0) {
          const grade = await gradeWorkflowTarget(prepared.target, kind,
            path.join(outputDir, 'oracle', kind, 'final'));
          grade.reasons.push(...dispatchFindings(dispatches));
          scenario.grade = grade;
        }
        else scenario.unavailable = agent.timedOut
          ? `agent timed out after ${timeoutMs} ms; inspect agent-events.jsonl in the isolated target`
          : `agent exited ${agent.exitCode}; inspect agent-stderr.txt in the isolated target`;
      } catch (error) {
        scenario.unavailable = error instanceof Error ? error.message : String(error);
      }
      await stopTargetViewer(prepared.target);
    }
    return [kind, scenario] as const;
  }));
  for (const [kind, scenario] of scenarios) {
    (results.scenarios as Record<string, unknown>)[kind] = scenario;
  }
  const observedModels = [...new Set(scenarios.map(([, scenario]) =>
    (scenario.agent as { model?: string | null } | undefined)?.model).filter(
      (model): model is string => typeof model === 'string'))];
  if (observedModels.length === 1) results.model = observedModels[0];
  await writeFile(path.join(outputDir, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
  process.stdout.write(`parity-workflow: ${mode === '--prepare' ? 'prepared' : 'evaluated'} ${outputDir}\n`);
  if (mode === '--prepare') return 0;
  if (Object.values(results.scenarios as Record<string, any>).some(item =>
    item.unavailable || item.initialOracleUnavailable)) return 2;
  if (Object.values(results.scenarios as Record<string, any>).some(item => item.initialOracleFailure)) return 1;
  const grades = Object.values(results.scenarios as Record<string, any>).map(item => item.grade as WorkflowGrade | undefined);
  return grades.length === 2 && grades.every(item => item?.stateReadable && item.reasons.length === 0) ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  process.exit(await main());
}
