#!/usr/bin/env node
// Holds the mode set and the mode a run starts in to one answer.
//
// `semi` is written down three times: the specification defines it, the bundle's
// dials phase applies it, and SKILL.md states it in the context that stays open
// for the whole прогон. Three homes for one fact is the shape every defect this
// repository has caught so far arrived in — a fact with more than one home and a
// checker that only knew one of them.
//
// The fact grew a fourth home when a project gained the right to pin its own
// default in `.maestro/config.json`. That one is a user's file and cannot be
// checked from here; what can be checked is that the three the repository ships
// still agree on which modes exist and which one applies when nobody chose.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createLogger } from '../shared/log.ts';
import { formatViolation, type Violation } from '../shared/violation.ts';
import { parseTables, type Table } from './spec-integrity.ts';

export type { Violation };

const log = createLogger('dials-defaults');

const SPEC_FILE = 'dials.md';
const PHASE_FILE = path.join('phases', '0-dials.md');
const SKILL_FILE = 'SKILL.md';

/** The columns that make a table the modes table, in every one of the three files. */
const MODE_COLUMNS = ['Mode', 'Human gates'];

/**
 * The sentence a bundle file uses to declare the built-in default.
 *
 * The phrasing is the contract, not a convenience: the bundle has no column to
 * put this in, so the check needs one form it can find. Both files already read
 * naturally with it — «Built-in default: `semi`.» and «Built-in default `semi`;
 * a project pins its own».
 */
const DEFAULT_PHRASE = /built-in default:?\s+`([a-z][a-z-]*)`/gi;

const findTable = (tables: Table[], required: string[]): Table | undefined =>
  tables.find(table => required.every(column => table.columns.includes(column)));

const clean = (value: string | number | undefined): string =>
  String(value ?? '').replace(/`/g, '').replace(/\*/g, '').trim();

/** Every mode named by the modes table of one document, in source order. */
export function readModes(markdown: string): string[] | null {
  const table = findTable(parseTables(markdown), MODE_COLUMNS);
  if (!table) return null;
  return table.rows.map(row => clean(row['Mode'])).filter(mode => mode !== '');
}

/** Every declaration of the built-in default in one file, with its line. */
export function findDeclarations(markdown: string): Array<{ mode: string; line: number }> {
  const found: Array<{ mode: string; line: number }> = [];
  markdown.split('\n').forEach((text, index) => {
    for (const match of text.matchAll(DEFAULT_PHRASE)) {
      found.push({ mode: match[1] ?? '', line: index + 1 });
    }
  });
  return found;
}

export interface CheckOptions {
  specDir?: string;
  bundleDir?: string;
}

export async function checkDialsDefaults(options: CheckOptions = {}): Promise<Violation[]> {
  const specDir = options.specDir ?? 'docs/spec';
  const bundleDir = options.bundleDir ?? 'skills/maestro';
  const specFile = path.join(specDir, SPEC_FILE);

  const violations: Violation[] = [];
  const add = (check: string, file: string, line: number, message: string): void => {
    violations.push({ check, file, line, message });
    log.error(check, message, { file, line });
  };

  // --- the specification is the authority on which modes exist -------------
  const specMarkdown = await readFile(specFile, 'utf8');
  const specTable = findTable(parseTables(specMarkdown), [...MODE_COLUMNS, 'Default']);
  if (!specTable) {
    add('modes', specFile, 0, `no table with columns ${[...MODE_COLUMNS, 'Default'].join(', ')}`);
    return violations;
  }

  const specModes = specTable.rows.map(row => clean(row['Mode'])).filter(mode => mode !== '');
  const marked = specTable.rows
    .filter(row => clean(row['Default']).toLowerCase() === 'yes')
    .map(row => ({ mode: clean(row['Mode']), line: row.__line }));

  if (marked.length === 0) {
    add('default', specFile, specTable.rows[0]?.__line ?? 0,
      'no mode is marked Default; one of them applies when the user names none');
    return violations;
  }
  for (const extra of marked.slice(1)) {
    add('default', specFile, extra.line,
      `"${extra.mode}" is a second mode marked Default; "${marked[0]?.mode}" already is`);
  }

  const builtIn = marked[0]?.mode ?? '';
  log.info('modes', 'specification read', { modes: specModes.length, default: builtIn });

  // --- the bundle names the same modes and the same default ----------------
  for (const relative of [PHASE_FILE, SKILL_FILE]) {
    const file = path.join(bundleDir, relative);
    const markdown = await readFile(file, 'utf8');

    const modes = readModes(markdown);
    if (modes === null) {
      add('modes', file, 0, `no table with columns ${MODE_COLUMNS.join(' and ')}`);
    } else {
      for (const mode of specModes) {
        if (!modes.includes(mode)) {
          add('modes', file, 0, `mode "${mode}" is defined in ${specFile} and missing here`);
        }
      }
      for (const mode of modes) {
        if (!specModes.includes(mode)) {
          add('modes', file, 0, `mode "${mode}" is named here and defined nowhere in ${specFile}`);
        }
      }
    }

    const declarations = findDeclarations(markdown);
    if (declarations.length === 0) {
      add('default', file, 0,
        `no built-in default declared; expected a line reading "Built-in default \`${builtIn}\`"`);
      continue;
    }
    for (const extra of declarations.slice(1)) {
      add('default', file, extra.line,
        `the built-in default is declared twice in one file; the first is at line ${declarations[0]?.line}`);
    }

    const declared = declarations[0];
    if (declared && declared.mode !== builtIn) {
      add('default', file, declared.line,
        `declares "${declared.mode}" as the built-in default; ${specFile} says "${builtIn}"`);
    }
  }

  log.info('default', 'declarations checked', { files: 2, default: builtIn });
  return violations;
}

async function main(): Promise<number> {
  const specDir = process.argv[2] ?? 'docs/spec';
  const bundleDir = process.argv[3] ?? 'skills/maestro';
  log.info('run', 'checking dial defaults', { specDir, bundleDir });

  let violations: Violation[];
  try {
    violations = await checkDialsDefaults({ specDir, bundleDir });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.error('run', 'inputs could not be read', { specDir, bundleDir, reason });
    process.stdout.write(`dials-defaults: cannot read ${specDir} or ${bundleDir}\n`);
    return 2;
  }

  if (violations.length === 0) {
    process.stdout.write('dials-defaults: OK\n');
    return 0;
  }

  for (const violation of violations) {
    process.stdout.write(formatViolation(violation));
  }
  process.stdout.write(`dials-defaults: ${violations.length} violation(s)\n`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}
