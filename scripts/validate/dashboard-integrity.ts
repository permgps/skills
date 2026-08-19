#!/usr/bin/env node
// Checks the dashboard asset: that it is self-contained, that every region the
// specification names has somewhere to render, and that the Russian words it
// carries still match the vocabulary that owns them.
//
// The page necessarily holds a copy of data owned elsewhere — stage ids from
// phases.md, labels from vocabulary.md, the gate order from gates.md — because
// the state stores ids and the labels are resolved at render time. An unchecked
// copy of an owned list is the drift this checker exists to catch.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

import { createLogger } from '../shared/log.ts';
import { formatViolation, type Violation } from '../shared/violation.ts';
import { cleanCell, parseTables, type Table } from './spec-integrity.ts';

export type { Violation };

const log = createLogger('dashboard-integrity');

/** Ids the page must offer, one per region of the What It Renders table. */
const REQUIRED_REGIONS = [
  'run-clock', 'stage-clock', 'dials',
  'stages', 'tasks', 'requirements', 'gates',
];

/** Anything that would make the page depend on a network it may not have. */
const NETWORK_APIS = [
  'fetch(', 'XMLHttpRequest', 'WebSocket', 'EventSource',
  'sendBeacon', 'importScripts',
];

/** Which vocabulary `Field` cell owns which map inside the page. */
const VALUE_MAPS: Array<{ field: string; map: string }> = [
  { field: 'stages[].status', map: 'STAGE_STATUS' },
  { field: 'tasks[].status', map: 'TASK_STATUS' },
  { field: 'requirements[].status', map: 'REQUIREMENT_STATUS' },
  { field: 'gates[].status', map: 'GATE_STATUS' },
  { field: 'mode', map: 'MODE' },
  { field: 'depth', map: 'DEPTH' },
  { field: 'polish', map: 'POLISH' },
];

export class UnreadableAssetError extends Error {
  constructor(file: string, reason: string) {
    super(`${file}: ${reason}`);
    this.name = 'UnreadableAssetError';
  }
}

/**
 * Blank out comments, keeping every newline so line numbers survive.
 *
 * The page explains in prose why it does not use `fetch` and why it opens from
 * `file://`, so a scan that reads its own comments reports the page for saying
 * what it does not do.
 */
export function stripComments(source: string): string {
  const blank = (match: string): string => match.replace(/[^\n]/g, ' ');
  return source
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/^[ \t]*\/\/.*$/gm, blank);
}

/** The body of one `<script id="...">` block, or null when there is none. */
export function scriptBlock(html: string, id: string): string | null {
  const pattern = new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`);
  return html.match(pattern)?.[1] ?? null;
}

const findTable = (tables: Table[], required: string[]): Table | undefined =>
  tables.find(table => required.every(column => table.columns.includes(column)));

/** Evaluate the DOM-free block and hand back what it exports. */
export function evaluateLogic(block: string): Record<string, unknown> {
  const context = vm.createContext({});
  vm.runInContext(block, context, { filename: 'dashboard-logic' });
  const logic = (context as Record<string, unknown>)['MAESTRO_LOGIC'];
  if (!logic || typeof logic !== 'object') {
    throw new Error('the logic block did not export MAESTRO_LOGIC');
  }
  return logic as Record<string, unknown>;
}

export interface SpecSources {
  'vocabulary.md': string;
  'phases.md': string;
  'gates.md': string;
}

export function checkDashboard(html: string, spec: SpecSources): Violation[] {
  const violations: Violation[] = [];
  const file = 'dashboard.html';
  const add = (check: string, line: number, message: string): void => {
    violations.push({ check, file, line, message });
  };

  const code = stripComments(html);
  const lines = code.split('\n');

  // --- nothing the page needs lives on another origin -----------------------
  let externals = 0;
  lines.forEach((text, index) => {
    const origins = text.match(/(?:src|href)\s*=\s*["'](https?:|\/\/)/g) ?? [];
    const urls = text.match(/url\(\s*["']?(https?:|\/\/)/g) ?? [];
    const imports = text.match(/@import/g) ?? [];
    for (const hit of [...origins, ...urls, ...imports]) {
      externals += 1;
      add('external', index + 1,
        `"${hit.trim()}" reaches off the page — the dashboard must render with the network off`);
    }
  });

  // --- and it asks the network for nothing at runtime ------------------------
  lines.forEach((text, index) => {
    for (const api of NETWORK_APIS) {
      if (text.includes(api)) {
        add('external', index + 1,
          `"${api}" is a network call — state.js is loaded by script tag because `
          + 'a sibling fetch is blocked on file://');
      }
    }
  });
  log.info('external', 'origins and network APIs checked', { lines: lines.length, externals });

  // --- every region has somewhere to render ---------------------------------
  for (const region of REQUIRED_REGIONS) {
    if (!html.includes(`id="${region}"`)) {
      add('regions', 0, `no element with id "${region}" — dashboard.md names it as a region`);
    }
  }
  log.info('regions', 'regions checked', { count: REQUIRED_REGIONS.length });

  // --- the copied vocabulary still matches the vocabulary -------------------
  const block = scriptBlock(html, 'logic');
  if (block === null) {
    add('logic', 0, 'no <script id="logic"> block — the page has no testable logic to check');
    return violations;
  }

  let logic: Record<string, unknown>;
  try {
    logic = evaluateLogic(block);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    add('logic', 0, `the logic block does not evaluate on its own: ${reason}`);
    return violations;
  }

  const asMap = (name: string): Record<string, string> => {
    const value = logic[name];
    return value && typeof value === 'object' ? value as Record<string, string> : {};
  };

  /** Report both directions: a word the page invented, and one it forgot. */
  const compare = (check: string, what: string, owned: Map<string, string>, held: Record<string, string>): void => {
    for (const [key, label] of owned) {
      if (!(key in held)) {
        add(check, 0, `${what} "${key}" has a label in the specification and none in the page`);
      } else if (held[key] !== label) {
        add(check, 0,
          `${what} "${key}" is labelled "${held[key]}" in the page and "${label}" in the specification`);
      }
    }
    for (const key of Object.keys(held)) {
      if (!owned.has(key)) {
        add(check, 0, `${what} "${key}" is labelled in the page and defined nowhere in the specification`);
      }
    }
  };

  const vocabularyTables = parseTables(spec['vocabulary.md']);

  const stageLabels = findTable(vocabularyTables, ['Stage id', 'Label']);
  if (!stageLabels) {
    add('labels', 0, 'vocabulary.md has no table with columns Stage id and Label');
  } else {
    const owned = new Map(stageLabels.rows.map(row =>
      [cleanCell(row['Stage id']), cleanCell(row['Label'])] as const));
    compare('labels', 'stage', owned, asMap('STAGE_LABEL'));
  }

  const valueLabels = findTable(vocabularyTables, ['Field', 'Value', 'Label']);
  if (!valueLabels) {
    add('labels', 0, 'vocabulary.md has no table with columns Field, Value and Label');
  } else {
    for (const { field, map } of VALUE_MAPS) {
      const owned = new Map(valueLabels.rows
        .filter(row => cleanCell(row['Field']) === field)
        .map(row => [cleanCell(row['Value']), cleanCell(row['Label'])] as const));
      if (owned.size === 0) {
        add('labels', 0, `vocabulary.md defines no labels for "${field}"`);
        continue;
      }
      compare('labels', field, owned, asMap(map));
    }
  }
  log.info('labels', 'labels compared with the vocabulary', { maps: VALUE_MAPS.length + 1 });

  // --- the stage order and the gate map are copies too ----------------------
  const phaseTable = findTable(parseTables(spec['phases.md']), ['Id', 'Stage']);
  if (!phaseTable) {
    add('order', 0, 'phases.md has no table with columns Id and Stage');
  } else {
    const specStages = phaseTable.rows
      .filter(row => cleanCell(row['Stage']).toLowerCase() === 'yes')
      .map(row => cleanCell(row['Id']));
    const held = Array.isArray(logic['STAGE_ORDER']) ? logic['STAGE_ORDER'] as string[] : [];
    if (held.join(',') !== specStages.join(',')) {
      add('order', 0,
        `STAGE_ORDER is [${held.join(', ')}] and phases.md is [${specStages.join(', ')}] — `
        + 'the timeline renders in the page\'s order, so a difference is a wrong timeline');
    }
  }

  const gateTable = findTable(parseTables(spec['gates.md']), ['Gate', 'After phase']);
  if (!gateTable) {
    add('order', 0, 'gates.md has no table with columns Gate and After phase');
  } else {
    const owned = new Map(gateTable.rows.map(row =>
      [cleanCell(row['Gate']), cleanCell(row['After phase'])] as const));
    compare('order', 'gate', owned, asMap('GATE_AFTER'));
  }
  log.info('order', 'stage order and gate map compared', { stages: 1, gates: gateTable?.rows.length ?? 0 });

  return violations;
}

/** Read the asset and the three documents that own what it copies. */
export async function checkDashboardFile(assetPath: string, specDir: string): Promise<Violation[]> {
  const html = await readFile(assetPath, 'utf8');
  const spec = {} as SpecSources;
  for (const name of ['vocabulary.md', 'phases.md', 'gates.md'] as const) {
    spec[name] = await readFile(path.join(specDir, name), 'utf8');
  }
  return checkDashboard(html, spec);
}

const DEFAULT_ASSET = 'skills/maestro/assets/dashboard.html';
const DEFAULT_SPEC = 'docs/spec';

async function main(): Promise<number> {
  const asset = process.argv[2] ?? DEFAULT_ASSET;
  const specDir = process.argv[3] ?? DEFAULT_SPEC;
  log.info('run', 'checking the dashboard asset', { asset, specDir });

  let violations: Violation[];
  try {
    violations = await checkDashboardFile(asset, specDir);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.error('run', 'asset or specification could not be read', { asset, specDir, reason });
    process.stdout.write(`dashboard-integrity: ${reason}\n`);
    return 2;
  }

  if (violations.length === 0) {
    process.stdout.write('dashboard-integrity: OK\n');
    return 0;
  }
  for (const violation of violations) {
    log.error(violation.check, violation.message, { file: violation.file, line: violation.line });
    process.stdout.write(formatViolation(violation));
  }
  process.stdout.write(`dashboard-integrity: ${violations.length} finding(s)\n`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}
