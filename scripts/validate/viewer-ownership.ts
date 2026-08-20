#!/usr/bin/env node
// Keeps the view boundary true: the прогон puts exactly one page in front of
// the user, and it is the dashboard.
//
// The bundle had a rule for what the panel is and none for what else may appear
// beside it. A субагент raised a server on a port it chose, opened its own
// checks page in the pane the panel was in, and the panel was gone afterwards —
// twice, with the отчёт about to call the build finished and the page reporting
// «Не прошло проверок: 96» because it had been opened over `file://`.
//
// Three things carry the rule now, and a rule that lives in three files drifts
// unless something holds them together:
//
// 1. `SKILL.md` states it once, for every phase — marker `maestro:view:owner`.
// 2. Every prompt carries its own share of it, worded for the role — marker
//    `maestro:view:no-viewer` in each.
// 3. Preflight is the one place that opens a page — marker
//    `maestro:view:opens-panel`, which no other phase file may carry.
//
// Markers rather than prose, for the same reason the host checker uses them: a
// paragraph can be reworded, translated or shortened without losing its meaning,
// and a checker that greps English fails on the rewrite and passes on the
// deletion. The one exception is the page-opening *signal* below, which is a
// literal scan of phase files: a phase that starts telling the прогон to open an
// address has no reason to add a marker saying so, and that is exactly the
// change this file exists to catch.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createLogger } from '../shared/log.ts';
import { formatViolation, type Violation } from '../shared/violation.ts';

export type { Violation };

const log = createLogger('viewer-ownership');

const SKILL_FILE = 'SKILL.md';
const PHASES_DIR = 'phases';
const PROMPTS_DIR = 'prompts';
/** The one file allowed to open a page, because opening it is its job. */
const PREFLIGHT_FILE = '0-preflight.md';

export type Mark = 'owner' | 'no-viewer' | 'opens-panel';

const MARKER = /<!--\s*maestro:view:(owner|no-viewer|opens-panel)\s*-->/g;

/**
 * What a file says when it is telling somebody to open a page.
 *
 * Deliberately literal and deliberately short: every one of these is a way to
 * put an address in front of a person, and none of them appears in prose that
 * merely *forbids* doing so. A phase file that acquires one has started
 * instructing an open, whatever the sentence around it says.
 */
const OPENING_SIGNALS = ['localhost', 'preview_start', 'http.server', 'webbrowser'];

export interface Found {
  mark: Mark;
  file: string;
  line: number;
}

/** Every view marker in one file, in source order. */
export function findMarks(markdown: string, file: string): Found[] {
  const found: Found[] = [];

  markdown.split('\n').forEach((text, index) => {
    for (const match of text.matchAll(MARKER)) {
      found.push({ mark: match[1] as Mark, file, line: index + 1 });
    }
  });

  return found;
}

/** The 1-based lines of a file that read as an instruction to open a page. */
export function openingLines(markdown: string): number[] {
  return markdown
    .split('\n')
    .map((text, index) => (OPENING_SIGNALS.some(signal => text.includes(signal)) ? index + 1 : 0))
    .filter(line => line !== 0);
}

const markdownIn = async (dir: string): Promise<string[]> =>
  (await readdir(dir)).filter(name => name.endsWith('.md')).sort();

export interface Input {
  bundleDir: string;
}

export async function checkViewerOwnership({ bundleDir }: Input): Promise<Violation[]> {
  const violations: Violation[] = [];
  const add = (check: string, file: string, line: number, message: string): void => {
    log.error(check, message, { file, line });
    violations.push({ check, file, line, message });
  };

  // --- the resident rule -----------------------------------------------------
  const skill = await readFile(path.join(bundleDir, SKILL_FILE), 'utf8');
  const owners = findMarks(skill, SKILL_FILE).filter(found => found.mark === 'owner');
  log.debug('owner', 'resident rule markers', { count: owners.length });
  if (owners.length !== 1) {
    add('owner', SKILL_FILE, 0,
      `the resident rule is marked ${owners.length} time(s) — SKILL.md must carry `
      + '<!-- maestro:view:owner --> exactly once, because it is the one statement '
      + 'every phase inherits');
  }

  // --- every prompt carries its share ---------------------------------------
  const promptsDir = path.join(bundleDir, PROMPTS_DIR);
  const prompts = await markdownIn(promptsDir);
  for (const name of prompts) {
    const file = path.join(PROMPTS_DIR, name);
    const marks = findMarks(await readFile(path.join(promptsDir, name), 'utf8'), file);
    const carried = marks.filter(found => found.mark === 'no-viewer');
    log.debug('prompt', 'viewer boundary markers', { file, count: carried.length });
    if (carried.length === 0) {
      add('prompt', file, 0,
        'this brief says nothing about the user\'s viewer — a субагент that was never '
        + 'told will open a page, which is how the panel was lost twice; add its own '
        + 'wording of the boundary and mark it <!-- maestro:view:no-viewer -->');
    }
    for (const wrong of marks.filter(found => found.mark !== 'no-viewer')) {
      add('prompt', file, wrong.line,
        `a prompt carries maestro:view:${wrong.mark} — that marker belongs to `
        + 'SKILL.md or to preflight, and a brief claiming it reads as permission');
    }
  }

  // --- only preflight opens a page ------------------------------------------
  const phasesDir = path.join(bundleDir, PHASES_DIR);
  const phases = await markdownIn(phasesDir);
  let openers = 0;
  for (const name of phases) {
    const file = path.join(PHASES_DIR, name);
    const markdown = await readFile(path.join(phasesDir, name), 'utf8');
    const marks = findMarks(markdown, file);
    const opens = marks.filter(found => found.mark === 'opens-panel');
    const signals = openingLines(markdown);
    const preflight = name === PREFLIGHT_FILE;
    log.debug('phase', 'view markers and opening signals', {
      file, opens: opens.length, signals: signals.length,
    });

    if (preflight) {
      openers += opens.length;
      if (opens.length !== 1) {
        add('opens', file, 0,
          `preflight is marked as the page-opening step ${opens.length} time(s) — it `
          + 'must be marked <!-- maestro:view:opens-panel --> exactly once, so the '
          + 'exemption below is anchored to something rather than assumed');
      }
      continue;
    }

    for (const stray of opens) {
      add('opens', file, stray.line,
        'a phase other than preflight claims the page-opening exemption — the panel '
        + 'is raised once, in preflight, and every later phase inherits the rule from '
        + 'SKILL.md instead');
    }
    for (const line of signals) {
      add('opens', file, line,
        'this phase names an address to open — opening belongs to preflight, and a '
        + 'page that lands on the user\'s screen mid-прогон is read as a fault; if the '
        + 'panel needs bringing back, point at preflight step 5 rather than repeating it');
    }
  }

  log.info('run', 'view boundary checked', {
    prompts: prompts.length, phases: phases.length, openers, violations: violations.length,
  });

  return violations;
}

async function main(): Promise<number> {
  const bundleDir = process.argv[2] ?? 'skills/maestro';
  log.info('run', 'checking the view boundary', { bundleDir });

  let violations: Violation[];
  try {
    violations = await checkViewerOwnership({ bundleDir });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.error('run', 'inputs could not be read', { bundleDir, reason });
    process.stdout.write(`viewer-ownership: cannot read ${bundleDir}\n`);
    return 2;
  }

  if (violations.length === 0) {
    process.stdout.write('viewer-ownership: OK\n');
    return 0;
  }

  for (const violation of violations) {
    process.stdout.write(formatViolation(violation));
  }
  process.stdout.write(`viewer-ownership: ${violations.length} violation(s)\n`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}
