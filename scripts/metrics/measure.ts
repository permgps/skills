#!/usr/bin/env node
// Measures a finished прогон.
//
// Input is `state.js` and nothing else — the dashboard's rule, applied here for
// the dashboard's reason. A measurement that reached into `manifest.md` or a
// task file would become a second source of truth about a прогон, and the second
// one is silently wrong.
//
// What the state does not record is reported as not recorded. Nothing here is
// inferred from a neighbouring field: a stage with no `startedAt` has no
// duration, and printing a plausible one would make the whole table unusable as
// evidence.

import { pathToFileURL } from 'node:url';

import { createLogger } from '../shared/log.ts';
import {
  GATE_IDS,
  REQUIREMENT_STATUSES,
  STAGE_IDS,
  TASK_STATUSES,
  type GateId,
  type RequirementStatus,
  type RunState,
  type StageId,
  type TaskStatus,
} from '../state/contract.ts';
import { readState } from '../state/read.ts';

const log = createLogger('metrics');

/** Milliseconds between two ISO 8601 stamps, or `null` when either is missing. */
export function span(from: string | undefined, to: string | undefined): number | null {
  if (from === undefined || to === undefined) return null;
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return end - start;
}

/** `1h 04m 09s`, or `—` for a duration the state does not carry. */
export function formatSpan(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 0) return '—';
  const seconds = Math.round(ms / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return h > 0 ? `${h}h ${pad(m)}m ${pad(s)}s` : `${m}m ${pad(s)}s`;
}

export interface StageMeasure {
  id: StageId;
  status: string;
  ms: number | null;
}

export interface Measurement {
  runId: string;
  slug: string;
  mode: string;
  depth: string;
  polish: boolean;
  dialChanges: number;
  /** `null` while the прогон has not finished. */
  totalMs: number | null;
  finished: boolean;
  interruptedAt: string | null;
  stages: StageMeasure[];
  taskCount: number;
  tasksByStatus: Record<TaskStatus, number>;
  /** The most таски whose recorded windows overlapped at one moment. */
  widestWave: number;
  requirementsByStatus: Record<RequirementStatus, number>;
  gates: Array<{ id: GateId; status: string; findings: number }>;
  contractVersion: number;
}

const countBy = <T extends string>(values: readonly T[], seen: readonly string[]): Record<T, number> => {
  const counts = {} as Record<T, number>;
  for (const value of values) counts[value] = 0;
  for (const item of seen) {
    if ((values as readonly string[]).includes(item)) counts[item as T] += 1;
  }
  return counts;
};

/**
 * How many таски were running at once, at the busiest moment.
 *
 * Computed from the recorded windows by sweeping their endpoints, so it is what
 * the прогон actually did rather than what the plan's wave width predicted. A
 * таск missing either stamp is skipped: it has no window, and assuming one
 * would inflate the number in exactly the runs where it matters.
 */
export function widestWave(state: RunState): number {
  const events: Array<{ at: number; delta: number }> = [];
  for (const task of state.tasks) {
    const from = task.startedAt === undefined ? NaN : Date.parse(task.startedAt);
    const to = task.finishedAt === undefined ? NaN : Date.parse(task.finishedAt);
    if (Number.isNaN(from) || Number.isNaN(to) || to < from) continue;
    events.push({ at: from, delta: 1 });
    events.push({ at: to, delta: -1 });
  }
  // Closing before opening at the same instant: two таски that touch rather
  // than overlap are not a wave of two.
  events.sort((a, b) => (a.at - b.at) || (a.delta - b.delta));

  let running = 0;
  let widest = 0;
  for (const event of events) {
    running += event.delta;
    if (running > widest) widest = running;
  }
  return widest;
}

export function measure(state: RunState): Measurement {
  const stages: StageMeasure[] = STAGE_IDS.map(id => {
    const entry = state.stages.find(stage => stage.id === id);
    return {
      id,
      status: entry?.status ?? 'absent',
      ms: span(entry?.startedAt, entry?.finishedAt),
    };
  });

  return {
    runId: state.runId,
    slug: state.slug,
    mode: state.mode,
    depth: state.depth,
    polish: state.polish,
    dialChanges: state.dialChanges.length,
    totalMs: span(state.startedAt, state.finishedAt),
    finished: state.finishedAt !== undefined,
    interruptedAt: state.interruptedAt ?? null,
    stages,
    taskCount: state.tasks.length,
    tasksByStatus: countBy(TASK_STATUSES, state.tasks.map(task => task.status)),
    widestWave: widestWave(state),
    requirementsByStatus: countBy(
      REQUIREMENT_STATUSES,
      state.requirements.map(requirement => requirement.status),
    ),
    gates: GATE_IDS.map(id => {
      const entry = state.gates.find(gate => gate.id === id);
      return { id, status: entry?.status ?? 'absent', findings: entry?.findings.length ?? 0 };
    }),
    contractVersion: state.contractVersion,
  };
}

/** The human form. One column of numbers, no colour, no width guessing. */
export function render(m: Measurement): string {
  const lines: string[] = [];
  const row = (label: string, value: string): void => {
    lines.push(`  ${label.padEnd(22)}${value}`);
  };

  lines.push(`прогон ${m.runId} (${m.slug})`);
  row('mode / depth', `${m.mode} / ${m.depth}${m.polish ? ' / polish' : ''}`);
  if (m.dialChanges > 0) row('dial changes', String(m.dialChanges));
  row('total', m.finished ? formatSpan(m.totalMs) : 'not finished');
  if (m.interruptedAt !== null) row('interrupted at', m.interruptedAt);

  lines.push('', '  stages');
  for (const stage of m.stages) {
    row(`  ${stage.id}`, `${stage.status.padEnd(8)}${formatSpan(stage.ms)}`);
  }

  lines.push('', '  таски');
  row('  count', String(m.taskCount));
  row('  widest wave', m.widestWave === 0 ? '— (no window recorded)' : String(m.widestWave));
  for (const status of TASK_STATUSES) {
    if (m.tasksByStatus[status] > 0) row(`  ${status}`, String(m.tasksByStatus[status]));
  }

  lines.push('', '  требования');
  for (const status of REQUIREMENT_STATUSES) {
    row(`  ${status}`, String(m.requirementsByStatus[status]));
  }

  lines.push('', '  gates');
  for (const gate of m.gates) {
    const findings = gate.findings === 0 ? '' : `  ${gate.findings} finding(s)`;
    row(`  ${gate.id}`, `${gate.status}${findings}`);
  }

  return `${lines.join('\n')}\n`;
}

export const targetFromArgv = (argv: readonly string[] = process.argv): string =>
  argv.slice(2).find(arg => !arg.startsWith('--')) ?? '.maestro';

export const wantsJson = (argv: readonly string[] = process.argv): boolean =>
  argv.slice(2).includes('--json');

/**
 * Exit codes: `0` measured, `2` the state could not be read.
 *
 * There is no `1`. The gate scripts use it for "checked, and it failed"; this
 * script checks nothing — a прогон that went badly is measured exactly as
 * successfully as one that went well, and reporting it as a failure would make
 * the measurement an opinion.
 */
export async function main(target: string, json: boolean): Promise<number> {
  log.info('run', 'measuring прогон', { target, json });

  let state: RunState;
  try {
    state = await readState(target);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.error('run', 'state could not be read', { target, reason });
    process.stdout.write(`measure: ${reason}\n`);
    return 2;
  }

  const measurement = measure(state);
  process.stdout.write(json ? `${JSON.stringify(measurement, null, 2)}\n` : render(measurement));

  log.info('run', 'прогон measured', {
    stages: measurement.stages.length,
    tasks: measurement.taskCount,
    requirements: state.requirements.length,
    gates: measurement.gates.length,
    finished: measurement.finished,
  });
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main(targetFromArgv(), wantsJson()));
}
