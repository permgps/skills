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

/**
 * The languages the page carries, and the column of vocabulary.md that owns
 * each one's words.
 *
 * Everything below walks this list rather than naming a map. That is the whole
 * reason `L10N` is nested by language in the page: a checker that knew
 * `STAGE_LABEL` and `STAGE_LABEL_EN` by name would go on printing OK the day a
 * third pair was added and only the first was wired up. Here a language is
 * either in the list and checked, or absent from the list and reported by the
 * comparison against `Object.keys(L10N)` below.
 */
const LANGUAGES: Array<{
  language: string;
  label: string;
  shorthand: [string, string];
  banned: [string, string];
  wordwise: boolean;
}> = [
  {
    language: 'ru',
    label: 'Label',
    shorthand: ['Shorthand', 'Say instead'],
    banned: ['Banned', 'Use instead'],
    wordwise: false,
  },
  {
    language: 'en',
    label: 'Label (en)',
    shorthand: ['Shorthand (en)', 'Say instead (en)'],
    banned: ['Banned (en)', 'Use instead (en)'],
    wordwise: true,
  },
];

/** The four maps of sentences a banned synonym must not survive in. */
const SAID = ['EXPLAIN', 'EXPLAIN_PLAIN', 'STAGE_EXPLAIN', 'STAGE_EXPLAIN_PLAIN'];

/**
 * The three theme blocks, and the selector each one is reached by.
 *
 * `none` is the state the page ships in: no `data-theme` attribute at all, so
 * the media query governs and the page follows the screen it was opened on. It
 * is the state a checker is most likely to lose, because it is the one nobody
 * clicks to reach.
 */
const THEME_BLOCKS: Array<{ state: string; selector: string }> = [
  { state: 'light', selector: ':root,\n  :root[data-theme="light"] {' },
  { state: 'system dark', selector: ':root:not([data-theme]) {' },
  { state: 'chosen dark', selector: ':root[data-theme="dark"] {' },
];

/** The two values the theme control writes, and nothing else. */
const THEMES = ['light', 'dark'];

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
  const direct = braced(source, opens(source, name, '='));
  if (direct !== null) return direct;

  // A map nested inside another literal is never assigned by its full name:
  // `L10N.ru.UI` is written `UI: {` inside `ru: {` inside `var L10N = {`, and
  // looking for `L10N.ru.UI = {` finds nothing. Returning null there was a
  // scan that believed it had run — the caller skipped, the check stayed
  // green, and every word the view composes shipped unread. So the dotted
  // path is walked instead, one literal narrowing the next.
  const path = name.split('.');
  let slice: string | null = source;
  for (let at = 0; at < path.length; at += 1) {
    const key = path[at]!;
    slice = braced(slice, opens(slice, key, at === 0 ? '=' : ':'));
    if (slice === null) return null;
  }
  return slice;
}

/**
 * Where `<key> = {` or `<key>: {` opens, with the key whole.
 *
 * A plain `indexOf` finds `EXPLAIN_PLAIN: {` inside `STAGE_EXPLAIN_PLAIN: {`,
 * and then every scan of the register's own sentences reads the стадии instead
 * and reports OK. One map is a name that ends in another map's name, and that
 * is enough — so the character before the key has to be one an identifier
 * cannot contain.
 */
function opens(source: string, key: string, sign: string): number {
  const safe = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hit = new RegExp(`(?:^|[^A-Za-z0-9_$.])${safe}\\s*${sign}\\s*\\{`).exec(source);
  return hit === null ? -1 : hit.index;
}

/** The object literal opening at or after `start`, brace-balanced. */
function braced(source: string, start: number): string | null {
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

/**
 * Every single-quoted string inside a slice of the page's source.
 *
 * The scan reads the literal rather than calling it, because a branch never
 * taken still ships — but the literal is source, and source carries
 * identifiers. `function (state)` and `var median` are the page's own variable
 * names, and holding an English plain string to a list containing `state` and
 * `median` would report every one of them. The Russian list never noticed,
 * because its words are Cyrillic and no identifier is.
 */
export function stringLiterals(source: string): string {
  const found: string[] = [];
  for (const hit of source.matchAll(/'((?:[^'\\]|\\.)*)'/g)) found.push(hit[1] ?? '');
  return found.join(' \n ');
}

/** The `--custom-property` names declared between a selector and its `}`. */
export function customProperties(css: string, selector: string): string[] | null {
  const start = css.indexOf(selector);
  if (start === -1) return null;
  const end = css.indexOf('}', start);
  const body = css.slice(start + selector.length, end === -1 ? undefined : end);
  return [...body.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(hit => hit[1] ?? '').sort();
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

  // --- the reader's own two controls ---------------------------------------
  //
  // Neither one is about the прогон, and neither can be pressed by a checker.
  // What can be held is that each choice is offered exactly once and that the
  // page still carries the sentence saying what the language control does not
  // do — a control that quietly promised to change the language of the chat
  // would be promising the one thing the page has no channel for.
  for (const theme of THEMES) {
    const offered = [...html.matchAll(new RegExp(`data-theme-choice="${theme}"`, 'g'))].length;
    if (offered !== 1) {
      add('view', 0,
        `the theme "${theme}" is offered ${offered} time(s) — each of the two is a `
        + 'button, and a theme with no button is a theme no reader can reach');
    }
  }
  for (const { language } of LANGUAGES) {
    const offered = [...html.matchAll(new RegExp(`data-language-choice="${language}"`, 'g'))].length;
    if (offered !== 1) {
      add('view', 0,
        `the language "${language}" is offered ${offered} time(s) — the page carries both `
        + 'and a language it cannot be switched to is a branch nobody sees');
    }
  }

  // --- the theme has three states and the stylesheet owns all three ---------
  const declared = new Map<string, string[] | null>();
  for (const { state, selector } of THEME_BLOCKS) {
    const properties = customProperties(html, selector);
    declared.set(state, properties);
    if (properties === null) {
      add('view', 0,
        `no "${state}" theme block — the page needs the light one, the dark one behind `
        + '@media for a reader who chose nothing, and the dark one behind the attribute');
    }
  }
  const light = declared.get('light');
  if (light && light.length > 0) {
    for (const [state, properties] of declared) {
      if (state === 'light' || properties === null) continue;
      const why = ' — a colour defined in one theme and not the other is a page that '
        + 'reads as broken in exactly one of them';
      for (const name of light.filter(each => !properties.includes(each))) {
        add('view', 0,
          `"${name}" is declared in the light theme block and not in the "${state}" one${why}`);
      }
      for (const name of properties.filter(each => !light.includes(each))) {
        add('view', 0,
          `"${name}" is declared in the "${state}" theme block and not in the light one${why}`);
      }
    }
  }

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

  // --- the page carries exactly the languages this checker knows ------------
  const l10n = logic['L10N'];
  const branches = (l10n && typeof l10n === 'object') ? l10n as Record<string, unknown> : {};
  const carried = Object.keys(branches);
  for (const { language } of LANGUAGES) {
    if (!carried.includes(language)) {
      add('labels', 0,
        `the page carries no "${language}" branch in L10N — every word the user reads `
        + 'exists in both languages, and a missing branch is a screen half in the other one');
    }
  }
  for (const language of carried) {
    if (!LANGUAGES.some(known => known.language === language)) {
      add('labels', 0,
        `the page carries a "${language}" branch in L10N that this checker holds to no `
        + 'column of vocabulary.md — an unchecked language ships its labels unread');
    }
  }

  /** One language's map inside `L10N`, or an empty one so the loop reports it. */
  const branchMap = (language: string, name: string): Record<string, string> => {
    const branch = branches[language];
    if (!branch || typeof branch !== 'object') return {};
    const value = (branch as Record<string, unknown>)[name];
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

  for (const { language, label } of LANGUAGES) {
    const stageLabels = findTable(vocabularyTables, ['Stage id', label]);
    if (!stageLabels) {
      add('labels', 0, `vocabulary.md has no table with columns Stage id and ${label}`);
      continue;
    }
    const owned = new Map(stageLabels.rows.map(row =>
      [cleanCell(row['Stage id']), cleanCell(row[label])] as const));
    compare('labels', `stage (${language})`, owned, branchMap(language, 'STAGE_LABEL'));
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
      for (const { language } of LANGUAGES) {
        for (const { register } of REGISTERS) {
          const lines = typeof explain === 'function'
            ? (explain as (...args: unknown[]) => unknown)(key, {}, 0, [], register, language)
            : null;
          if (!Array.isArray(lines) || lines.length === 0) {
            add('explain', 0,
              `region "${key}" has no explanation behind it in the ${register} register `
              + `in ${language}`);
          }
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

  // --- every стадия explains itself too -------------------------------------
  //
  // A стадия is a row inside the `stages` region, not a region of its own: it
  // is drawn from state, rebuilt on every poll, and named in no `Key` column.
  // So it is checked here rather than added to the three lists above — but to
  // the same standard, and for the same reason. An `i` that opens nothing is
  // worse than no `i`, and eight of them is eight times worse.
  {
    const held = Array.isArray(logic['STAGE_ORDER']) ? (logic['STAGE_ORDER'] as string[]) : [];
    const explainStage = logic['explainStage'];
    const l10n = logic['L10N'] as Record<string, Record<string, unknown>> | undefined;
    let calls = 0;

    if (typeof explainStage !== 'function') {
      add('stages', 0,
        'the page exports no explainStage, so the i on every стадия row ships unchecked — '
        + 'a check silently not running and a check that passes look the same from outside');
    } else {
      const say = explainStage as (...args: unknown[]) => unknown;
      for (const id of held) {
        for (const { language } of LANGUAGES) {
          for (const { register } of REGISTERS) {
            calls += 1;
            const lines = say(id, {}, 0, [], register, language);
            if (!Array.isArray(lines) || lines.length === 0) {
              add('stages', 0,
                `стадия "${id}" has no explanation behind it in the ${register} register `
                + `in ${language}`);
            }
          }
        }
      }
    }

    // Both directions, because the two failures are different: a стадия the
    // timeline draws and no registry holds ships a mute row, and a registry key
    // STAGE_ORDER does not know is text nobody can ever reach.
    for (const { language } of LANGUAGES) {
      for (const { register, map } of REGISTERS) {
        const name = `STAGE_${map}`;
        const registry = l10n?.[language]?.[name];
        if (!registry || typeof registry !== 'object') {
          add('stages', 0,
            `the page carries no L10N.${language}.${name}, so its стадии are mute in the `
            + `${register} register`);
          continue;
        }
        const keys = Object.keys(registry as Record<string, unknown>);
        for (const id of held) {
          if (!keys.includes(id)) {
            add('stages', 0, `L10N.${language}.${name} does not hold the стадия "${id}"`);
          }
        }
        for (const id of keys) {
          if (!held.includes(id)) {
            add('stages', 0,
              `L10N.${language}.${name} holds "${id}", which STAGE_ORDER does not know — `
              + 'no row will ever open it');
          }
        }
      }
    }

    // The rows are built at run time, so the static half of this check is that
    // the render function attaches the button at all. A page whose стадии are
    // drawn without one ships eight explanations nobody can reach.
    const from = html.indexOf('function renderStages(');
    if (from === -1) {
      add('stages', 0, 'the page has no renderStages, so no стадия row can carry an i');
    } else {
      const end = html.indexOf('\n  function ', from + 1);
      const body = html.slice(from, end === -1 ? from + 4000 : end);
      if (!body.includes('data-explains') || !body.includes('stage:')) {
        add('stages', 0,
          'renderStages draws its rows without a data-explains="stage:…" button, so every '
          + 'стадия explanation ships unreachable');
      }
    }

    log.info('stages', 'стадия explanations checked', { stages: held.length, calls });
  }

  // --- the words on the page that belong to no field ------------------------
  // A card renamed on the page and nowhere else is drift the value maps cannot
  // see: these labels are static text, not the value of anything.
  for (const { language, label } of LANGUAGES) {
    const screenLabels = findTable(vocabularyTables, [label, 'What it names']);
    if (!screenLabels) {
      add('labels', 0, `vocabulary.md has no table with columns ${label} and What it names`);
      continue;
    }
    let missing = 0;
    for (const row of screenLabels.rows) {
      const word = cleanCell(row[label]);
      if (word === '') continue;
      if (!html.includes(word)) {
        missing += 1;
        add('labels', 0,
          `the specification names "${word}" as a word the dashboard shows in ${language}, `
          + 'and the page does not carry it');
      }
    }
    log.info('labels', 'screen labels checked',
      { language, labels: screenLabels.rows.length, missing });
  }

  for (const { language, label } of LANGUAGES) {
    const valueLabels = findTable(vocabularyTables, ['Field', 'Value', label]);
    if (!valueLabels) {
      add('labels', 0, `vocabulary.md has no table with columns Field, Value and ${label}`);
      continue;
    }
    for (const { field, map } of VALUE_MAPS) {
      const owned = new Map(valueLabels.rows
        .filter(row => cleanCell(row['Field']) === field)
        .map(row => [cleanCell(row['Value']), cleanCell(row[label])] as const));
      if (owned.size === 0) {
        add('labels', 0, `vocabulary.md defines no ${label} entries for "${field}"`);
        continue;
      }
      compare('labels', `${field} (${language})`, owned, branchMap(language, map));
    }
  }
  log.info('labels', 'labels compared with the vocabulary',
    { maps: (VALUE_MAPS.length + 1) * LANGUAGES.length });

  // --- the plain register says nothing only the trade understands -----------
  //
  // Every plain string this repository ships is here, and this is the whole of
  // what a checker can hold to the list: the chat is composed at run time and
  // no checker reads a word of it. vocabulary.md says so too, because a rule
  // believed to be enforced and a rule that is enforced fail differently.
  for (const { language, label, shorthand, banned: bannedColumns, wordwise } of LANGUAGES) {
    const plainWords = findTable(vocabularyTables, [...shorthand]);
    if (!plainWords) {
      add('plain', 0, `vocabulary.md has no table with columns ${shorthand.join(' and ')}`);
      continue;
    }
    const banned = plainWords.rows
      .flatMap(row => cleanCell(row[shorthand[0]]).split(','))
      .map(word => word.trim())
      .filter(word => word !== '');

    // A label the screen shows is not shorthand. «Гейты» and G1…G4 stay on the
    // page in both registers, and the i beside that block is the thing that
    // teaches them — so the exact label is removed before the scan, and only
    // the exact label. «после гейта» still fails in the same sentence.
    //
    // Only this language's labels are removed. An English label is no excuse
    // for a Russian shorthand and the other way round, and the two lists are
    // not translations of one another — vocabulary.md says why.
    const labels = vocabularyTables
      .filter(table => table.columns.includes(label))
      .flatMap(table => table.rows.map(row => cleanCell(row[label])))
      .filter(word => word !== '')
      .sort((a, b) => b.length - a.length);
    const withoutLabels = (text: string): string =>
      labels.reduce((left, word) => left.split(word).join(' '), text);

    // Substring for Russian, whole word for English. The reason is in
    // vocabulary.md under *Plain Words*: «гейта» has to fail and `mitigate`
    // must not.
    const says = (naked: string, word: string): boolean => {
      const term = word.toLowerCase();
      if (!wordwise) return naked.includes(term);
      return new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(naked);
    };

    let scanned = 0;
    const scan = (where: string, text: string): void => {
      scanned += 1;
      const naked = withoutLabels(text).toLowerCase();
      for (const word of banned) {
        if (says(naked, word)) {
          add('plain', 0,
            `a plain string in ${where} (${language}) says "${word}", which vocabulary.md `
            + 'forbids — say it in words a reader who has never built software already has');
        }
      }
    };

    // The block is read as source rather than called, because a branch never
    // taken still ships: the empty state of a region is exactly where the plain
    // reader is least able to guess, and it is the branch a fixture forgets.
    const literal = sliceObjectLiteral(stripComments(block), `L10N.${language}.EXPLAIN_PLAIN`);
    if (literal === null) {
      add('plain', 0, `the page carries no L10N.${language}.EXPLAIN_PLAIN block to check`);
    } else {
      scan('the plain explanations', stringLiterals(literal));
    }

    // The стадия explanations are the same kind of thing and are read the same
    // way. What each стадия is *doing* comes from `stageStanding` through `UI`,
    // which is scanned below; what each стадия *is* lives here.
    const stages = sliceObjectLiteral(stripComments(block), `L10N.${language}.STAGE_EXPLAIN_PLAIN`);
    if (stages === null) {
      add('plain', 0, `the page carries no L10N.${language}.STAGE_EXPLAIN_PLAIN block to check`);
    } else {
      scan('the plain стадия explanations', stringLiterals(stages));
    }

    // The silence notice lives in a function both registers share, so its
    // plain wording is reached by calling it rather than by reading around it.
    const notice = logic['silenceNotice'];
    if (typeof notice === 'function') {
      const call = notice as (...args: unknown[]) => { line?: unknown } | null;
      const state = { runId: 'r', slug: 's', stages: [], updatedAt: '2026-08-20T09:00:00Z' };
      const at = Date.parse('2026-08-20T10:00:00Z');
      for (const marks of [[], [Date.parse('2026-08-20T08:00:00Z'), Date.parse(state.updatedAt)]]) {
        const said = call(state, at, marks, 'plain', language);
        if (said && typeof said.line === 'string') scan('the plain silence notice', said.line);
      }
    }

    // The folded findings line is the second such function, and it is reached
    // the same way. Several counts, because Russian takes three plural forms
    // and any single number exercises exactly one of them.
    const folded = logic['findingsLine'];
    if (typeof folded === 'function') {
      const say = folded as (...args: unknown[]) => unknown;
      for (const count of [1, 2, 5, 21]) {
        const line = say(count, 'plain', language);
        if (typeof line === 'string') scan('the folded findings line', line);
      }
    } else {
      add('plain', 0, 'the page exports no findingsLine, so the folded findings '
        + 'line ships unscanned — the wording a passed check shows its reader');
    }

    // The sentences the view composes are words too, and they are the half a
    // scan of the explanations alone would miss.
    const ui = sliceObjectLiteral(stripComments(block), `L10N.${language}.UI`);
    if (ui === null) {
      add('plain', 0, `the page carries no L10N.${language}.UI block to check`);
    } else {
      scan('the composed sentences', stringLiterals(ui));
    }

    log.info('plain', 'plain strings scanned',
      { language, banned: banned.length, exempt: labels.length, sources: scanned });

    // --- and no banned synonym, in either register --------------------------
    //
    // Shorthand is a rule about the plain reader; a banned synonym is a rule
    // about everyone. «исполнитель» is not a word the trade may keep for the
    // reader who knows it — it is a second name for something the словарь
    // already calls a субагент, and a reader who meets both has no way to know
    // they are the same thing. So this scan reads all four maps and does not
    // ask which register they belong to. The label exemption is the same and
    // no wider: a word that survives only inside a label the screen shows is
    // the label, not the synonym.
    const synonyms = findTable(vocabularyTables, [...bannedColumns]);
    if (!synonyms) {
      add('synonyms', 0,
        `vocabulary.md has no table with columns ${bannedColumns.join(' and ')}`);
    } else {
      const forbidden = synonyms.rows
        .map(row => ({
          word: cleanCell(row[bannedColumns[0]]).trim().toLowerCase(),
          instead: cleanCell(row[bannedColumns[1]]).trim(),
        }))
        .filter(entry => entry.word !== '');
      let maps = 0;
      for (const name of SAID) {
        const said = sliceObjectLiteral(stripComments(block), `L10N.${language}.${name}`);
        if (said === null) {
          add('synonyms', 0, `the page carries no L10N.${language}.${name} to check`);
          continue;
        }
        maps += 1;
        const naked = withoutLabels(stringLiterals(said)).toLowerCase();
        for (const { word, instead } of forbidden) {
          if (says(naked, word)) {
            add('synonyms', 0,
              `L10N.${language}.${name} says "${word}", which vocabulary.md bans — `
              + `say "${instead}" instead, in every register`);
          }
        }
      }
      log.info('synonyms', 'banned synonyms scanned',
        { language, terms: forbidden.length, maps });
    }
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
