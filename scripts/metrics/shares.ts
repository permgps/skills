#!/usr/bin/env node
// How long review and acceptance take, as a share of development.
//
// «Осталось» on the dashboard needs that share before either stage has run, and
// the only honest source for it is what earlier прогоны actually did. This
// module derives it from the recorded stage stamps — `fixtures/recorded-stages.ts`
// by default — and from nothing else, the rule `measure.ts` follows.
//
// The bounds are the lower and the upper quartile, by index, rounded to two
// decimals. A mean would let one run whose review spanned a weekend move the
// whole range; the quartiles keep the middle half and say nothing sharper than
// six runs can say. The page's `STAGE_SHARE` and the table in
// `docs/spec/dashboard.md` are copies of this output, and `shares.test.ts` and
// `npm run dashboard` hold them to it.

import { pathToFileURL } from 'node:url';

import { createLogger } from '../shared/log.ts';
import { span } from './measure.ts';
import { RECORDED_STAGES, type RecordedRun } from './fixtures/recorded-stages.ts';

const log = createLogger('metrics');

export const SHARED_STAGES = ['review', 'acceptance'] as const;
export type SharedStage = typeof SHARED_STAGES[number];

export type StageShareOf = Record<SharedStage, number | null>;

export interface ShareBounds {
  low: number;
  high: number;
}

export interface StageShares {
  /** Runs that gave a build span to divide by. */
  runs: number;
  /** Runs without one, left out rather than counted as zero. */
  excluded: number;
  review: ShareBounds | null;
  acceptance: ShareBounds | null;
}

interface StampedStage {
  id: string;
  startedAt?: string;
  finishedAt?: string;
}

const stageSpan = (stages: readonly StampedStage[], id: string): number | null => {
  const entry = stages.find(stage => stage.id === id);
  return span(entry?.startedAt, entry?.finishedAt);
};

/**
 * Each stage's span divided by the build's, or `null` where a span is missing.
 *
 * A build with no span, or a zero-width one, gives no share at all: dividing by
 * it would either fail or claim review took infinitely long. A zero-width review
 * or acceptance is a share of zero, because somebody stamped it.
 */
export function shareOf(stages: readonly StampedStage[]): StageShareOf {
  const build = stageSpan(stages, 'build');
  if (build === null || build <= 0) return { review: null, acceptance: null };
  const ratio = (id: SharedStage): number | null => {
    const ms = stageSpan(stages, id);
    return ms === null || ms < 0 ? null : ms / build;
  };
  return { review: ratio('review'), acceptance: ratio('acceptance') };
}

const round = (value: number): number => Math.round(value * 100) / 100;

/** The lower and upper quartile by index — `floor(n/4)` and `ceil(3n/4) − 1` — or `null` for no values. */
export function quartiles(values: readonly number[]): ShareBounds | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return { low: round(sorted[Math.floor(n / 4)]!), high: round(sorted[Math.ceil((3 * n) / 4) - 1]!) };
}

export function stageShares(runs: readonly RecordedRun[]): StageShares {
  const ratios: Record<SharedStage, number[]> = { review: [], acceptance: [] };
  let usable = 0;
  let excluded = 0;
  for (const run of runs) {
    const share = shareOf(run.stages);
    if (share.review === null && share.acceptance === null) {
      excluded += 1;
      // Two different gaps end here, and the fix for each lives in a different
      // stamp, so the warning names the one this run actually has.
      const build = stageSpan(run.stages, 'build');
      const reason = build === null || build <= 0 ? 'no build span to divide by' : 'neither review nor acceptance has a span';
      log.warn('shares', 'run gives no share and is left out', { runId: run.runId, reason });
      continue;
    }
    usable += 1;
    log.debug('shares', 'run measured', {
      runId: run.runId,
      buildMs: stageSpan(run.stages, 'build'),
      reviewMs: stageSpan(run.stages, 'review'),
      acceptanceMs: stageSpan(run.stages, 'acceptance'),
      review: share.review,
      acceptance: share.acceptance,
    });
    for (const id of SHARED_STAGES) {
      const value = share[id];
      if (value === null) {
        log.warn('shares', 'stage has no span in this run and is left out of its own share', { runId: run.runId, stage: id });
        continue;
      }
      ratios[id].push(value);
    }
  }
  const result: StageShares = {
    runs: usable,
    excluded,
    review: quartiles(ratios.review),
    acceptance: quartiles(ratios.acceptance),
  };
  log.info('shares', 'stage shares derived', { ...result });
  return result;
}

const formatShare = (value: number | null): string => value === null ? '—' : value.toFixed(3);
const formatBounds = (bounds: ShareBounds | null): string =>
  bounds === null ? '—' : `low ${bounds.low.toFixed(2)}  high ${bounds.high.toFixed(2)}`;

/**
 * Exit codes: `0` the shares were derived, `1` fewer than two runs could give
 * one. One run is an anecdote, and printing its ratio as a range would be the
 * sharper-than-the-data number the dashboard refuses to show.
 */
export async function main(runs: readonly RecordedRun[] = RECORDED_STAGES): Promise<number> {
  log.info('shares', 'deriving stage shares', { runs: runs.length });
  const shares = stageShares(runs);
  const lines = ['stage shares of development', ''];
  for (const run of runs) {
    const share = shareOf(run.stages);
    lines.push(`  ${run.runId.padEnd(36)}review ${formatShare(share.review).padEnd(8)}acceptance ${formatShare(share.acceptance)}`);
  }
  lines.push('');
  lines.push(`  ${'review'.padEnd(12)}${formatBounds(shares.review)}`);
  lines.push(`  ${'acceptance'.padEnd(12)}${formatBounds(shares.acceptance)}`);
  lines.push(`  ${shares.runs} run(s), ${shares.excluded} left out`);
  if (shares.runs < 2) {
    lines.push('', 'shares: fewer than two runs give a share; record another прогон before trusting a range');
    process.stdout.write(`${lines.join('\n')}\n`);
    return 1;
  }
  process.stdout.write(`${lines.join('\n')}\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}
