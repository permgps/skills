#!/usr/bin/env node
// What a прогон cost, measured from the host's own log.
//
// `measure.ts` reads `state.js` and nothing else, and keeps that rule: this is
// its sibling, not an extension of it. It reads three sources and every number
// it prints names one of them:
//
// - **transcripts** — the host's record of each model call: usage, time, and
//   the context it ran in (`transcripts.ts`);
// - **state** — the run window, the closed waits, the таски and their commits,
//   and whether a review blocked (`readState`);
// - **git** — the lines each таск's commits changed (`changed-lines.ts`).
//
// A subagent context is attributed by the `maestro:<brief> [NN]` label its
// dispatch carried (`roles.ts`); one without a readable label is reported as
// unattributed with the reason, never guessed. The output is aggregates only:
// no message text, tool input, file content or dispatch description is
// printed, and nothing is written except to the path `--out` names.
//
// Units are each call's usage weighted by its model's price ratios to that
// model's own uncached input. They are ratios, not money, and units of two
// models do not convert into each other; a run on several models says so.
//
// Not part of `npm run check` as a command: there is no прогон in this
// repository to measure. Its tests run there on hand-written transcripts.

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createLogger } from '../shared/log.ts';
import type { RunState } from '../state/contract.ts';
import { runDirName } from '../state/paths.ts';
import { readState } from '../state/read.ts';
import { changedLines, runCommits, type ChangedLines } from './changed-lines.ts';
import { formatSpan, span } from './measure.ts';
import { ROLES, parseDispatchLabel, roleOf, type Role, type UnattributedReason } from './roles.ts';
import {
  SUPPORTED_HOSTS, MAPPED_HOST_VERSION, TranscriptsUnavailableError, defaultLogDir, readTranscripts, unitsOf,
  type Call, type Context, type Transcripts,
} from './transcripts.ts';

const log = createLogger('metrics');

/**
 * The skill the host records on the прогон's own main-session calls. A call of
 * another skill is never the orchestrator's; a call recording none is, when its
 * session records this skill somewhere (see `OrchestratorScope`).
 */
export const ORCHESTRATOR_SKILL = 'maestro';

/** A call reads its cache cold when it reads less than this share of the previous call's context. */
export const COLD_READ_SHARE = 0.5;

/**
 * Which main sessions the orchestrator's calls are taken from. The host keeps a
 * skill's attribution for the rest of its session, so once any session records
 * `maestro`, a session that never does is another terminal in the same project.
 * A log where none records it has nothing to tell them apart by.
 */
export type OrchestratorScope = 'sessions recording maestro' | 'every main session';

export type NotRecorded = 'not recorded';
const NOT_RECORDED: NotRecorded = 'not recorded';

export interface RoleCost {
  role: Role | 'unattributed';
  contexts: number;
  calls: number;
  units: number;
  /** Of the run's total units, or `null` when the run has none. */
  share: number | null;
}

export interface ColdRewrite {
  at: string;
  /** Since the previous call of the same context. */
  gapMs: number;
}

export interface ExecutorCost {
  agentId: string;
  /** The таск id the label named, or `unmatched` when the state has no таск of that id. */
  taskId: string;
  role: 'executor' | 'repair';
  models: string[];
  calls: number;
  units: number;
  peakContext: number;
  coldRewrites: ColdRewrite[];
  /** The таск's changed lines over every commit it recorded. */
  changedLines: number | NotRecorded;
  unreadableCommits: number;
}

export interface ReviewCost {
  agentId: string;
  taskId: string;
  calls: number;
  units: number;
  blocked: 'yes' | 'no' | NotRecorded;
}

export interface UnattributedCost {
  agentId: string;
  reason: UnattributedReason;
  calls: number;
  units: number;
}

export interface CostMeasurement {
  runId: string;
  dir: string;
  host: string;
  hostVersions: string[];
  mappedHostVersion: string;
  window: {
    from: string;
    to: string | NotRecorded;
    toSource: 'finishedAt' | 'updatedAt' | NotRecorded;
    totalMs: number | null;
    idleMs: number | NotRecorded;
    activeMs: number | null;
  };
  sources: {
    logDir: string;
    contextsRead: number;
    callsCounted: number;
    duplicateLines: number;
    unparsedLines: number;
    syntheticRecords: number;
    callsOutsideWindow: number;
    contextsOutsideWindow: number;
    callsFromAnotherSkill: number;
    /** Calls recording no skill, in a main session that never records `maestro`. */
    callsFromAnotherSession: number;
    orchestratorSessions: { counted: number; scope: OrchestratorScope };
    callsWithoutWriteSplit: number;
  };
  totalUnits: number;
  roles: RoleCost[];
  models: Array<{ model: string; calls: number; units: number }>;
  orchestrator: { calls: number; units: number; landedTasks: number; callsPerLandedTask: number | null };
  executors: ExecutorCost[];
  reviews: ReviewCost[];
  unattributed: UnattributedCost[];
  runCommits: { total: number; recordedByTasks: number } | NotRecorded;
}

export interface GitFacts {
  /** Per таск id, for every таск that recorded commits. */
  changed: ReadonlyMap<string, ChangedLines>;
  runCommits: { shas: string[] } | { unavailable: string } | NotRecorded;
}

interface Window {
  from: number;
  to: number;
}

const unitsSum = (calls: readonly Call[]): number => calls.reduce((total, call) => total + unitsOf(call.usage, call.model), 0);

/** The closed waits clipped to the window, summed; `not recorded` below contract 9. */
function idleWithin(state: RunState, window: Window): number | NotRecorded {
  if (state.contractVersion < 9) return NOT_RECORDED;
  let idle = 0;
  for (const wait of state.waits ?? []) {
    const since = Math.max(Date.parse(wait.since), window.from);
    const until = Math.min(Date.parse(wait.until), window.to);
    if (!Number.isNaN(since) && !Number.isNaN(until) && until > since) idle += until - since;
  }
  return idle;
}

/** Whether a review blocked the таск, from the defects the verification record holds. */
function reviewBlocked(state: RunState, taskId: string): ReviewCost['blocked'] {
  const verification = state.verification;
  if (verification === undefined || verification.version !== 3) return NOT_RECORDED;
  const reviewerFindings = new Set(verification.findings.filter(finding => finding.origin === 'reviewer').map(finding => finding.id));
  return verification.defects.some(defect => defect.parentTaskId === taskId && reviewerFindings.has(defect.rootFindingId))
    ? 'yes' : 'no';
}

function coldRewrites(calls: readonly Call[]): ColdRewrite[] {
  const found: ColdRewrite[] = [];
  for (let index = 1; index < calls.length; index += 1) {
    const previous = calls[index - 1] as Call;
    const call = calls[index] as Call;
    if (call.usage.cacheRead < COLD_READ_SHARE * previous.contextTokens) {
      found.push({ at: call.at, gapMs: Date.parse(call.at) - Date.parse(previous.at) });
    }
  }
  return found;
}

interface Attributed {
  context: Context;
  calls: Call[];
  role: Role | 'unattributed';
  reason?: UnattributedReason;
  roleKey?: string;
  taskId?: string;
}

/**
 * The measurement, from inputs already read. Pure: the same state, transcripts
 * and git facts give the same figures, which is what lets the tests pin them.
 */
export function measureCost(state: RunState, transcripts: Transcripts, git: GitFacts, host: string = SUPPORTED_HOSTS[0]): CostMeasurement {
  const toSource = state.finishedAt !== undefined ? 'finishedAt' : state.updatedAt !== undefined ? 'updatedAt' : NOT_RECORDED;
  const to = state.finishedAt ?? state.updatedAt;
  const window: Window = { from: Date.parse(state.startedAt), to: to === undefined ? Number.POSITIVE_INFINITY : Date.parse(to) };
  const idleMs = Number.isFinite(window.to) ? idleWithin(state, window) : NOT_RECORDED;
  const totalMs = span(state.startedAt, to);
  log.debug('cost', 'run window resolved', { from: state.startedAt, to: to ?? null, toSource, waits: state.waits?.length ?? 0, idleMs });

  const taskIds = new Set(state.tasks.map(task => task.id));
  let callsOutsideWindow = 0;
  let contextsOutsideWindow = 0;
  let callsFromAnotherSkill = 0;
  let callsFromAnotherSession = 0;
  let orchestratorSessions = 0;
  const scope: OrchestratorScope = transcripts.contexts.some(context => context.kind === 'main' && context.skillsSeen.includes(ORCHESTRATOR_SKILL))
    ? 'sessions recording maestro' : 'every main session';
  const attributed: Attributed[] = [];

  for (const context of transcripts.contexts) {
    const inside = context.calls.filter(call => {
      const at = Date.parse(call.at);
      return at >= window.from && at <= window.to;
    });
    callsOutsideWindow += context.calls.length - inside.length;
    if (inside.length === 0) {
      if (context.calls.length > 0) contextsOutsideWindow += 1;
      continue;
    }

    if (context.kind === 'main') {
      const runSession = scope === 'every main session' || context.skillsSeen.includes(ORCHESTRATOR_SKILL);
      const otherSkill = inside.filter(call => call.skill !== undefined && call.skill !== ORCHESTRATOR_SKILL).length;
      const orchestrator = inside.filter(call => call.skill === ORCHESTRATOR_SKILL || (call.skill === undefined && runSession));
      callsFromAnotherSkill += otherSkill;
      callsFromAnotherSession += inside.length - otherSkill - orchestrator.length;
      log.debug('cost', 'main session scoped', {
        sessionId: context.sessionId, scope, runSession, orchestrator: orchestrator.length, otherSkill,
        anotherSession: inside.length - otherSkill - orchestrator.length,
      });
      if (orchestrator.length > 0) {
        attributed.push({ context, calls: orchestrator, role: 'orchestrator' });
        orchestratorSessions += 1;
      }
      continue;
    }
    if (context.inlineSidechain) {
      attributed.push({ context, calls: inside, role: 'unattributed', reason: 'inline sidechain' });
      continue;
    }
    const label = parseDispatchLabel(context.description);
    if ('unattributed' in label) {
      attributed.push({ context, calls: inside, role: 'unattributed', reason: label.unattributed });
      continue;
    }
    const taskId = label.taskId !== null && taskIds.has(label.taskId) ? label.taskId : undefined;
    attributed.push({ context, calls: inside, role: roleOf(label.roleKey, 0), roleKey: label.roleKey,
      ...taskId === undefined ? {} : { taskId } });
  }

  // A таск's later executor contexts are its repairs, in the order they first called.
  const executorsByTask = new Map<string, Attributed[]>();
  for (const entry of attributed) {
    if (entry.roleKey !== 'executor' || entry.taskId === undefined) continue;
    executorsByTask.set(entry.taskId, [...executorsByTask.get(entry.taskId) ?? [], entry]);
  }
  for (const entries of executorsByTask.values()) {
    entries.sort((a, b) => Date.parse(a.calls[0]!.at) - Date.parse(b.calls[0]!.at));
    entries.forEach((entry, ordinal) => { entry.role = roleOf('executor', ordinal); });
  }

  for (const entry of attributed) {
    log.debug('roles', 'context attributed', {
      agentId: entry.context.agentId ?? null, sessionId: entry.context.sessionId, roleKey: entry.roleKey ?? null,
      role: entry.role, taskId: entry.taskId ?? null, reason: entry.reason ?? null, calls: entry.calls.length,
    });
    if (entry.role === 'unattributed') {
      log.warn('cost', 'context left unattributed', { agentId: entry.context.agentId ?? null, reason: entry.reason ?? null });
    }
  }

  const allCalls = attributed.flatMap(entry => entry.calls);
  const totalUnits = unitsSum(allCalls);
  const roles: RoleCost[] = [...ROLES, 'unattributed' as const].map(role => {
    const entries = attributed.filter(entry => entry.role === role);
    const calls = entries.flatMap(entry => entry.calls);
    const units = unitsSum(calls);
    return { role, contexts: entries.length, calls: calls.length, units, share: totalUnits > 0 ? units / totalUnits : null };
  });

  const byModel = new Map<string, { calls: number; units: number }>();
  for (const call of allCalls) {
    const entry = byModel.get(call.model) ?? { calls: 0, units: 0 };
    entry.calls += 1;
    entry.units += unitsOf(call.usage, call.model);
    byModel.set(call.model, entry);
  }

  const landedTasks = state.tasks.filter(task => (task.commits?.length ?? 0) > 0).length;
  const orchestratorCalls = roles.find(entry => entry.role === 'orchestrator')!;

  const executors: ExecutorCost[] = attributed
    .filter(entry => entry.roleKey === 'executor')
    .map(entry => {
      const changed = entry.taskId === undefined ? undefined : git.changed.get(entry.taskId);
      return {
        agentId: entry.context.agentId ?? entry.context.sessionId,
        taskId: entry.taskId ?? 'unmatched',
        role: entry.role === 'repair' ? 'repair' as const : 'executor' as const,
        models: [...new Set(entry.calls.map(call => call.model))].sort(),
        calls: entry.calls.length,
        units: unitsSum(entry.calls),
        peakContext: Math.max(...entry.calls.map(call => call.contextTokens)),
        coldRewrites: coldRewrites(entry.calls),
        changedLines: changed === undefined ? NOT_RECORDED : changed.lines,
        unreadableCommits: changed?.unreadable.length ?? 0,
      };
    });

  const reviews: ReviewCost[] = attributed
    .filter(entry => entry.roleKey === 'reviewer')
    .map(entry => ({
      agentId: entry.context.agentId ?? entry.context.sessionId,
      taskId: entry.taskId ?? 'unmatched',
      calls: entry.calls.length,
      units: unitsSum(entry.calls),
      blocked: entry.taskId === undefined ? NOT_RECORDED : reviewBlocked(state, entry.taskId),
    }));

  const unattributed: UnattributedCost[] = attributed
    .filter(entry => entry.role === 'unattributed')
    .map(entry => ({
      agentId: entry.context.agentId ?? entry.context.sessionId,
      reason: entry.reason ?? 'no description',
      calls: entry.calls.length,
      units: unitsSum(entry.calls),
    }));

  const recorded = new Set(state.tasks.flatMap(task => [...task.commits ?? [], ...task.lostCommits ?? []]));
  const listed = git.runCommits;
  const runCommitsFigure = listed === NOT_RECORDED || 'unavailable' in listed
    ? NOT_RECORDED
    : { total: listed.shas.length, recordedByTasks: listed.shas.filter(sha => [...recorded].some(own => sha.startsWith(own))).length };

  let dir = state.slug;
  try { dir = runDirName(state); } catch { log.warn('cost', 'run directory unresolved; naming the run by its slug', { runId: state.runId }); }

  const measurement: CostMeasurement = {
    runId: state.runId,
    dir,
    host,
    hostVersions: transcripts.hostVersions,
    mappedHostVersion: MAPPED_HOST_VERSION,
    window: {
      from: state.startedAt,
      to: to ?? NOT_RECORDED,
      toSource,
      totalMs,
      idleMs,
      activeMs: totalMs === null ? null : typeof idleMs === 'number' ? totalMs - idleMs : totalMs,
    },
    sources: {
      logDir: transcripts.logDir,
      contextsRead: transcripts.contexts.length,
      callsCounted: allCalls.length,
      duplicateLines: transcripts.duplicateLines,
      unparsedLines: transcripts.unparsed.length,
      syntheticRecords: transcripts.syntheticRecords,
      callsOutsideWindow,
      contextsOutsideWindow,
      callsFromAnotherSkill,
      callsFromAnotherSession,
      orchestratorSessions: { counted: orchestratorSessions, scope },
      callsWithoutWriteSplit: allCalls.filter(call => !call.usage.writeSplit).length,
    },
    totalUnits,
    roles,
    models: [...byModel].map(([model, figures]) => ({ model, ...figures })).sort((a, b) => a.model.localeCompare(b.model)),
    orchestrator: {
      calls: orchestratorCalls.calls,
      units: orchestratorCalls.units,
      landedTasks,
      callsPerLandedTask: landedTasks > 0 ? orchestratorCalls.calls / landedTasks : null,
    },
    executors,
    reviews,
    unattributed,
    runCommits: runCommitsFigure,
  };
  log.info('cost', 'прогон cost measured', {
    runId: state.runId, contexts: attributed.length, calls: allCalls.length, duplicateLines: transcripts.duplicateLines,
    unparsed: transcripts.unparsed.length, unattributed: unattributed.length, outsideWindow: callsOutsideWindow,
  });
  return measurement;
}

const integer = (value: number): string => String(Math.round(value));
const share = (value: number | null): string => value === null ? '—' : value.toFixed(3);

/** The human form, in `measure.ts`'s one-column style. Each heading names its source. */
export function render(m: CostMeasurement): string {
  const lines: string[] = [];
  const row = (label: string, value: string): void => { lines.push(`  ${label.padEnd(24)}${value}`); };

  lines.push(`прогон ${m.runId} (${m.dir}) — cost from ${m.host} transcripts`);
  lines.push('  units are ratios to each model\'s own uncached input price, not money');
  if (m.models.length > 1) lines.push('  this run used several models: their units are summed, but do not convert into each other');

  lines.push('', '  window (state)');
  row('  from', m.window.from);
  row('  to', m.window.to === NOT_RECORDED ? 'not recorded' : `${m.window.to} (${m.window.toSource})`);
  row('  total', formatSpan(m.window.totalMs));
  row('  idle', m.window.idleMs === NOT_RECORDED ? 'not recorded — no closed waits before contract 9' : formatSpan(m.window.idleMs));
  row('  active', formatSpan(m.window.activeMs));

  lines.push('', '  sources (transcripts)');
  row('  log dir', m.sources.logDir);
  row('  host versions', `${m.hostVersions.length === 0 ? '—' : m.hostVersions.join(', ')} (mapped against ${m.mappedHostVersion})`);
  row('  contexts read', String(m.sources.contextsRead));
  row('  calls counted', String(m.sources.callsCounted));
  row('  duplicate lines', `${m.sources.duplicateLines} (a call written over several lines, counted once)`);
  row('  unparsed lines', String(m.sources.unparsedLines));
  row('  synthetic records', String(m.sources.syntheticRecords));
  row('  outside the window', `${m.sources.callsOutsideWindow} call(s); ${m.sources.contextsOutsideWindow} context(s) wholly outside`);
  row('  another skill', `${m.sources.callsFromAnotherSkill} calls`);
  row('  another session', `${m.sources.callsFromAnotherSession} calls, recording no skill in a session that never records maestro`);
  row('  orchestrator sessions', `${m.sources.orchestratorSessions.counted} (${m.sources.orchestratorSessions.scope === 'every main session'
    ? 'every main session — no session records the maestro skill' : 'sessions recording maestro'})`);
  if (m.sources.callsWithoutWriteSplit > 0) row('  writes without 5m/1h', `${m.sources.callsWithoutWriteSplit} calls, counted as 5-minute`);

  lines.push('');
  row('roles (transcripts)', `${'contexts'.padEnd(10)}${'calls'.padEnd(8)}${'units'.padEnd(12)}share`);
  for (const entry of m.roles) {
    if (entry.role === 'unattributed' && entry.contexts === 0) continue;
    row(`  ${entry.role}`, `${String(entry.contexts).padEnd(10)}${String(entry.calls).padEnd(8)}${integer(entry.units).padEnd(12)}${share(entry.share)}`);
  }

  lines.push('', '  models (transcripts)');
  for (const entry of m.models) row(`  ${entry.model}`, `${entry.calls} calls, ${integer(entry.units)} units`);

  lines.push('', '  orchestrator (transcripts; landed таски from state)');
  row('  calls', `${m.orchestrator.calls} (${integer(m.orchestrator.units)} units)`);
  row('  per landed таск', m.orchestrator.callsPerLandedTask === null
    ? '— (no таск landed)' : `${m.orchestrator.callsPerLandedTask.toFixed(1)} (${m.orchestrator.landedTasks} landed)`);

  lines.push('', '  executors (transcripts; changed lines from git)');
  if (m.executors.length === 0) lines.push('    none attributed');
  for (const entry of m.executors) {
    const changed = entry.changedLines === NOT_RECORDED ? 'not recorded' : `${entry.changedLines} lines`;
    const unreadable = entry.unreadableCommits > 0 ? `, ${entry.unreadableCommits} commit(s) unreadable` : '';
    const gaps = entry.coldRewrites.map(rewrite => formatSpan(rewrite.gapMs)).join(', ');
    lines.push(`    ${entry.taskId.padEnd(10)}${entry.role.padEnd(10)}${entry.calls} calls, peak context ${entry.peakContext}, `
      + `${entry.coldRewrites.length} cold rewrite(s)${gaps === '' ? '' : ` after ${gaps}`}, ${integer(entry.units)} units, ${changed}${unreadable}`);
  }

  lines.push('', '  reviews (transcripts; blocked from state)');
  if (m.reviews.length === 0) lines.push('    none attributed');
  for (const entry of m.reviews) {
    lines.push(`    ${entry.taskId.padEnd(10)}${entry.calls} calls, ${integer(entry.units)} units, blocked ${entry.blocked}`);
  }

  if (m.unattributed.length > 0) {
    lines.push('', '  unattributed (transcripts)');
    for (const entry of m.unattributed) {
      lines.push(`    ${entry.agentId.padEnd(20)}${entry.reason.padEnd(18)}${entry.calls} calls, ${integer(entry.units)} units`);
    }
  }

  lines.push('', '  run commits (git)');
  row('  with this run\'s trailer', m.runCommits === NOT_RECORDED
    ? 'not recorded' : `${m.runCommits.total}, ${m.runCommits.recordedByTasks} recorded by таски`);
  return `${lines.join('\n')}\n`;
}

export interface CostArgs {
  projectDir: string;
  run?: string;
  logDir?: string;
  host: string;
  json: boolean;
  out?: string;
}

export const USAGE = 'usage: npm run metrics:cost -- <project-dir> [--run <state>] [--log-dir <dir>] [--host claude-code] [--json] [--out <file>]';

/** The arguments, or the reason they cannot be read. */
export function parseArgs(argv: readonly string[]): CostArgs | { error: string } {
  const valued = new Set(['--run', '--log-dir', '--host', '--out']);
  const values: Record<string, string> = {};
  const positional: string[] = [];
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string;
    if (arg === '--json') { json = true; continue; }
    if (valued.has(arg)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) return { error: `${arg} needs a value` };
      values[arg] = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--')) return { error: `unknown option ${arg}` };
    positional.push(arg);
  }
  if (positional.length !== 1) return { error: 'name exactly one project directory' };
  return {
    projectDir: positional[0] as string,
    host: values['--host'] ?? SUPPORTED_HOSTS[0],
    json,
    ...values['--run'] === undefined ? {} : { run: values['--run'] },
    ...values['--log-dir'] === undefined ? {} : { logDir: values['--log-dir'] },
    ...values['--out'] === undefined ? {} : { out: values['--out'] },
  };
}

/** Read the changed lines of every таск that recorded commits, and the run's own commits. */
export async function readGitFacts(projectDir: string, state: RunState): Promise<GitFacts> {
  const changed = new Map<string, ChangedLines>();
  for (const task of state.tasks) {
    if ((task.commits?.length ?? 0) === 0) continue;
    changed.set(task.id, await changedLines(projectDir, task.commits ?? []));
  }
  let dir: string;
  try { dir = runDirName(state).replace(/--wip$/, ''); } catch { return { changed, runCommits: NOT_RECORDED }; }
  return { changed, runCommits: await runCommits(projectDir, dir) };
}

/**
 * Exit codes: `0` measured, `2` the arguments, the host, the state or the
 * transcripts could not be read. There is no `1`, for `measure.ts`'s reason: a
 * costly прогон is measured exactly as successfully as a cheap one.
 */
export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const args = parseArgs(argv);
  if ('error' in args) {
    process.stdout.write(`cost: ${args.error}\n${USAGE}\n`);
    return 2;
  }
  log.info('cost', 'measuring прогон cost', { projectDir: args.projectDir, run: args.run ?? null, host: args.host, json: args.json });
  if (!(SUPPORTED_HOSTS as readonly string[]).includes(args.host)) {
    process.stdout.write(`cost: host ${args.host} is not supported — only ${SUPPORTED_HOSTS.join(', ')} transcripts are mapped\n`);
    return 2;
  }

  const target = args.run ?? path.join(args.projectDir, '.maestro');
  let state: RunState;
  try {
    state = await readState(target);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.error('cost', 'state could not be read', { target, reason });
    process.stdout.write(`cost: ${reason}\n`);
    return 2;
  }

  const logDir = args.logDir ?? defaultLogDir(args.projectDir);
  let transcripts: Transcripts;
  try {
    transcripts = await readTranscripts(logDir);
  } catch (error) {
    if (!(error instanceof TranscriptsUnavailableError)) throw error;
    log.error('cost', 'transcripts could not be read', { logDir: error.logDir, reason: error.reason });
    process.stdout.write(`cost: no transcripts at ${error.logDir} — name the directory with --log-dir; `
      + 'the host deletes transcripts after cleanupPeriodDays, 30 days by default\n');
    return 2;
  }

  const measurement = measureCost(state, transcripts, await readGitFacts(args.projectDir, state), args.host);
  const output = args.json ? `${JSON.stringify(measurement, null, 2)}\n` : render(measurement);
  if (args.out === undefined) {
    process.stdout.write(output);
  } else {
    await writeFile(args.out, output);
    process.stdout.write(`cost: written to ${args.out}\n`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}
