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

/**
 * Ids the page must offer for a renderer to write into.
 *
 * Not the same list as the regions of the What It Renders table — a region is
 * a block of the screen, and several of these are targets inside one. The
 * regions themselves are checked against that table below.
 */
const REQUIRED_REGIONS = [
  'run-clock', 'stage-clock', 'dials',
  'progress', 'cards',
  'stages', 'tasks', 'now', 'requirements', 'gates',
];

/** Anything that would make the page depend on a network it may not have. */
const NETWORK_APIS = [
  'fetch(', 'XMLHttpRequest', 'WebSocket', 'EventSource',
  'sendBeacon', 'importScripts',
];

/**
 * The snapshot block, and the one thing that must be true of it here.
 *
 * The page carries a copy of the state so that it can be shown with no address
 * at all. The sync tool replaces whatever lies between these markers, which
 * means the asset in this repository is the one copy nobody rewrites — so it
 * has to stay empty. A template that shipped a real прогон would copy that run
 * into every project the skill is installed into.
 */
const SNAPSHOT_START = 'maestro:snapshot:start';
const SNAPSHOT_END = 'maestro:snapshot:end';
const EMPTY_SNAPSHOT = 'globalThis.MAESTRO_SNAPSHOT = null;';

/** Which vocabulary `Field` cell owns which map inside the page. */
const VALUE_MAPS: Array<{ field: string; map: string }> = [
  { field: 'stages[].status', map: 'STAGE_STATUS' },
  { field: 'tasks[].status', map: 'TASK_STATUS' },
  { field: 'requirements[].status', map: 'REQUIREMENT_STATUS' },
  { field: 'gates[].status', map: 'GATE_STATUS' },
  { field: 'mode', map: 'MODE' },
  { field: 'depth', map: 'DEPTH' },
  { field: 'polish', map: 'POLISH' },
  { field: 'explain', map: 'REGISTER' },
];

/** The two registers, and the map each one's explanations live in. */
const REGISTERS: Array<{ register: string; map: string }> = [
  { register: 'normal', map: 'EXPLAIN' },
  { register: 'plain', map: 'EXPLAIN_PLAIN' },
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

/**
 * The source text of one `var <name> = { … };` literal, braces balanced.
 *
 * Read rather than called, because a branch never taken still ships. The empty
 * state of a region is exactly where a reader is least able to guess, and it is
 * the branch a fixture forgets to reach.
 */
export function sliceObjectLiteral(source: string, name: string): string | null {
  const start = source.indexOf(`var ${name} = {`);
  if (start === -1) return null;

  let depth = 0;
  for (let at = source.indexOf('{', start); at < source.length; at += 1) {
    const char = source[at];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, at + 1);
    }
  }
  return null;
}

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
  'dashboard.md': string;
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

  // --- the page can show a state it was not able to load --------------------
  const snapshot = scriptBlock(html, 'snapshot');
  if (snapshot === null) {
    add('snapshot', 0,
      'no <script id="snapshot"> block — a page opened without an address can load nothing '
      + 'from beside it, and an in-app pane opens it exactly that way');
  } else {
    const between = snapshot.match(
      new RegExp(`${SNAPSHOT_START}\\s*\\*/([\\s\\S]*?)/\\*\\s*${SNAPSHOT_END}`));
    if (between === null) {
      add('snapshot', 0,
        `the snapshot block carries no ${SNAPSHOT_START} … ${SNAPSHOT_END} pair — `
        + 'the sync tool replaces what lies between them and would have nothing to find');
    } else if ((between[1] ?? '').trim() !== EMPTY_SNAPSHOT) {
      add('snapshot', 0,
        'the snapshot in this repository is not empty — the asset is the one copy nothing '
        + `rewrites, so a run left here ships into every project. Expected exactly "${EMPTY_SNAPSHOT}"`);
    }
  }
  log.info('snapshot', 'snapshot block checked', { present: snapshot !== null });

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

  // --- every region the specification names explains itself -----------------
  //
  // Three lists have to agree: the Key column of the What It Renders table, the
  // `data-region` attributes in the markup, and `EXPLAIN_ORDER` in the logic
  // block. A region in one and missing from another ships mute — either an `i`
  // that opens nothing, or a number with no way left to ask what it means.
  const regionTable = findTable(parseTables(spec['dashboard.md']), ['Key', 'Region']);
  if (!regionTable) {
    add('explain', 0, 'dashboard.md has no table with columns Key and Region');
  } else {
    const declared = regionTable.rows
      .map(row => cleanCell(row['Key']).replace(/`/g, '').trim())
      .filter(key => key !== '');
    const order = logic['EXPLAIN_ORDER'];
    const explained = Array.isArray(order) ? order.map(String) : [];
    const marked = [...html.matchAll(/data-region="([^"]+)"/g)].map(hit => hit[1] ?? '');
    const explain = logic['explain'];

    for (const key of declared) {
      if (!explained.includes(key)) {
        add('explain', 0,
          `dashboard.md names the region "${key}" and the page's EXPLAIN_ORDER does not carry it`);
      }
      const marks = marked.filter(name => name === key).length;
      if (marks !== 1) {
        add('explain', 0,
          `region "${key}" carries ${marks} data-region attribute(s) in the markup — a region is `
          + 'marked exactly once, and that is where its i is hung');
      }
    }

    for (const key of explained) {
      if (!declared.includes(key)) {
        add('explain', 0,
          `the page explains "${key}" and the What It Renders table does not name it`);
        continue;
      }
      // The registry may hold a key with nothing behind it, and an i that opens
      // an empty popover is worse than no i at all. Both registers are called:
      // a region explained in one and silent in the other ships an i that opens
      // nothing for exactly the reader who needed it most.
      for (const { register } of REGISTERS) {
        const lines = typeof explain === 'function'
          ? (explain as (...args: unknown[]) => unknown)(key, {}, 0, [], register)
          : null;
        if (!Array.isArray(lines) || lines.length === 0) {
          add('explain', 0,
            `region "${key}" has no explanation behind it in the ${register} register`);
        }
      }
    }

    for (const name of marked) {
      if (!declared.includes(name)) {
        add('explain', 0,
          `the markup marks "${name}" as a region and the What It Renders table does not name it`);
      }
    }

    // A marked region still needs somewhere to hang its i: an h2 to sit beside,
    // or a name of its own when it has no heading at all, as the dials do. A
    // region with neither is skipped at mount time and ships silently mute,
    // which is the one failure this whole check exists to prevent. Read to the
    // next marked region rather than to a closing tag, because the regions nest
    // and a tag match would pick the wrong one.
    for (const hit of html.matchAll(/<[^>]*data-region="([^"]+)"[^>]*>/g)) {
      const tag = hit[0];
      const from = (hit.index ?? 0) + tag.length;
      const next = html.indexOf('data-region="', from);
      const inside = html.slice(from, next === -1 ? from + 400 : next);
      if (!tag.includes('data-region-label=') && !inside.includes('<h2')) {
        add('explain', 0,
          `region "${hit[1]}" has neither an h2 to hang its i beside nor a data-region-label `
          + 'to name itself by, so no i is mounted on it');
      }
    }
    log.info('explain', 'regions compared with the specification',
      { declared: declared.length, explained: explained.length, marked: marked.length });
  }

  // --- the words on the page that belong to no field ------------------------
  // A card renamed on the page and nowhere else is drift the value maps cannot
  // see: these labels are static text, not the value of anything.
  const screenLabels = findTable(vocabularyTables, ['Label', 'What it names']);
  if (!screenLabels) {
    add('labels', 0, 'vocabulary.md has no table with columns Label and What it names');
  } else {
    let missing = 0;
    for (const row of screenLabels.rows) {
      const label = cleanCell(row['Label']);
      if (label === '') continue;
      if (!html.includes(label)) {
        missing += 1;
        add('labels', 0,
          `the specification names "${label}" as a word the dashboard shows, `
          + 'and the page does not carry it');
      }
    }
    log.info('labels', 'screen labels checked', { labels: screenLabels.rows.length, missing });
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

  // --- the plain register says nothing only the trade understands -----------
  //
  // Every plain string this repository ships is here, and this is the whole of
  // what a checker can hold to the list: the chat is composed at run time and
  // no checker reads a word of it. vocabulary.md says so too, because a rule
  // believed to be enforced and a rule that is enforced fail differently.
  const plainWords = findTable(vocabularyTables, ['Shorthand', 'Say instead']);
  if (!plainWords) {
    add('plain', 0, 'vocabulary.md has no table with columns Shorthand and Say instead');
  } else {
    const banned = plainWords.rows
      .flatMap(row => cleanCell(row['Shorthand']).split(','))
      .map(word => word.trim())
      .filter(word => word !== '');

    // A label the screen shows is not shorthand. «Гейты» and G1…G4 stay on the
    // page in both registers, and the i beside that block is the thing that
    // teaches them — so the exact label is removed before the scan, and only
    // the exact label. «после гейта» still fails in the same sentence.
    const labels = vocabularyTables
      .filter(table => table.columns.includes('Label'))
      .flatMap(table => table.rows.map(row => cleanCell(row['Label'])))
      .filter(label => label !== '')
      .sort((a, b) => b.length - a.length);
    const withoutLabels = (text: string): string =>
      labels.reduce((left, label) => left.split(label).join(' '), text);

    const scan = (where: string, text: string): void => {
      const naked = withoutLabels(text).toLowerCase();
      for (const word of banned) {
        if (naked.includes(word.toLowerCase())) {
          add('plain', 0,
            `a plain string in ${where} says "${word}", which vocabulary.md forbids — `
            + 'say it in words a reader who has never built software already has');
        }
      }
    };

    // The block is read as source rather than called, because a branch never
    // taken still ships: the empty state of a region is exactly where the plain
    // reader is least able to guess, and it is the branch a fixture forgets.
    const literal = sliceObjectLiteral(stripComments(block), 'EXPLAIN_PLAIN');
    if (literal === null) {
      add('plain', 0, 'the page carries no EXPLAIN_PLAIN block to check');
    } else {
      scan('the plain explanations', literal);
    }

    // The silence notice lives in a function both registers share, so its
    // plain wording is reached by calling it rather than by reading around it.
    const notice = logic['silenceNotice'];
    if (typeof notice === 'function') {
      const call = notice as (...args: unknown[]) => { line?: unknown } | null;
      const state = { runId: 'r', slug: 's', stages: [], updatedAt: '2026-08-20T09:00:00Z' };
      const at = Date.parse('2026-08-20T10:00:00Z');
      for (const marks of [[], [Date.parse('2026-08-20T08:00:00Z'), Date.parse(state.updatedAt)]]) {
        const said = call(state, at, marks, 'plain');
        if (said && typeof said.line === 'string') scan('the plain silence notice', said.line);
      }
    }

    log.info('plain', 'plain strings scanned', { banned: banned.length, exempt: labels.length });
  }

  // --- the stage order and the gate map are copies too ----------------------
  const phaseTable = findTable(parseTables(spec['phases.md']), ['Id', 'Stage']);
  let comparedStages = 0;
  if (!phaseTable) {
    add('order', 0, 'phases.md has no table with columns Id and Stage');
  } else {
    const specStages = phaseTable.rows
      .filter(row => cleanCell(row['Stage']).toLowerCase() === 'yes')
      .map(row => cleanCell(row['Id']));
    comparedStages = specStages.length;
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
  log.info('order', 'stage order and gate map compared',
    { stages: comparedStages, gates: gateTable?.rows.length ?? 0 });

  return violations;
}

/** Read the asset and the three documents that own what it copies. */
export async function checkDashboardFile(assetPath: string, specDir: string): Promise<Violation[]> {
  const html = await readFile(assetPath, 'utf8');
  const spec = {} as SpecSources;
  for (const name of ['vocabulary.md', 'phases.md', 'gates.md', 'dashboard.md'] as const) {
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
