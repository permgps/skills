#!/usr/bin/env node
// Holds each gate reader's declared inputs to the specification.
//
// Two gates — G2 and G4 — are decided in part by a subagent, and what that
// subagent is handed is a rule the repository states in five places: the gate
// table of `gates.md`, the phase table of `phases.md`, the phase file, the
// reader's own brief in `prompts/`, and `SKILL.md`. Four of them are prose read
// by a model at run time. The fifth is the brief, and it is the one that drifts,
// because it is the one nothing compared.
//
// So `gates.md` carries the list a second time, as a table, and this check holds
// every reader's brief to it name for name. That is the whole of the comparison
// a machine can honestly make here — see *What this does not check* at the
// bottom of this file for the half it deliberately leaves to review.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createLogger } from '../shared/log.ts';
import { formatViolation, type Violation } from '../shared/violation.ts';
import { parseTables, type Table } from './spec-integrity.ts';

export type { Violation };

const log = createLogger('gate-readers');

const PROMPTS_DIR = 'prompts';

/** The heading a reader's brief declares its inputs under, and nothing else. */
const INPUT_HEADING = 'What You Are Given';
const WITHHELD_HEADING = 'What You Are Not Given';

/** The specification's own list: gate, the brief that carries its reader, what
 * that reader is handed. */
const GATES_TABLE_COLUMNS = ['Gate', "Reader's brief", 'Given', 'Withheld'];

/** The reader's brief declares its inputs in a table with these two columns. */
const INPUT_TABLE_COLUMNS = ['Input', 'What it is'];

const findTable = (tables: Table[], required: readonly string[]): Table | undefined =>
  tables.find(table => required.every(column => table.columns.includes(column)));

/**
 * A name as it is compared: backticks, emphasis and case removed, whitespace
 * collapsed, a trailing full stop dropped.
 *
 * Both sides are written by hand for a human to read — `the additions block of
 * `brief.md``, `**the running build**` — so the comparison has to survive the
 * decoration without becoming loose enough to equate two different things.
 */
export const normalizeName = (value: string | number | undefined): string =>
  String(value ?? '')
    .replace(/`/g, '')
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.$/, '')
    .toLowerCase();

/** Split one cell into its comma-separated names, in source order. */
export const splitNames = (cell: string | number | undefined): string[] =>
  String(cell ?? '')
    .split(',')
    .map(entry => normalizeName(entry))
    .filter(entry => entry !== '');

/**
 * The body of one `##` section, from its heading to the next one.
 *
 * Deliberately not the whole document: a reader's brief is long, and a table
 * that merely happens to have an `Input` column somewhere else in it is not the
 * declaration this check is reading.
 */
export function sectionBody(markdown: string, heading: string): string | undefined {
  const lines = markdown.split('\n');
  const start = lines.findIndex(line => line.trim() === `## ${heading}`);
  if (start === -1) return undefined;

  const rest = lines.slice(start + 1);
  const end = rest.findIndex(line => /^##\s/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

/** Every input name a reader's brief declares, or `undefined` if it declares none. */
export function declaredInputs(markdown: string, heading = INPUT_HEADING): string[] | undefined {
  const body = sectionBody(markdown, heading);
  if (body === undefined) return undefined;

  const table = findTable(parseTables(body), INPUT_TABLE_COLUMNS);
  if (!table) return undefined;

  return table.rows
    .map(row => normalizeName(row['Input']))
    .filter(name => name !== '');
}

export interface CheckOptions {
  specDir?: string;
  bundleDir?: string;
}

export async function checkGateReaders(options: CheckOptions = {}): Promise<Violation[]> {
  const specDir = options.specDir ?? 'docs/spec';
  const bundleDir = options.bundleDir ?? 'skills/maestro';
  const specFile = path.join(specDir, 'gates.md');
  const promptsDir = path.join(bundleDir, PROMPTS_DIR);

  const violations: Violation[] = [];
  const add = (check: string, file: string, line: number, message: string): void => {
    violations.push({ check, file, line, message });
    log.error(check, message, { file, line });
  };

  const declared = findTable(parseTables(await readFile(specFile, 'utf8')), GATES_TABLE_COLUMNS);
  if (!declared) {
    add('declared', specFile, 0,
      'no table with columns Gate, Reader\'s brief, Given and Withheld — the list each gate '
      + 'reader is handed needs one home a machine can read');
    return violations;
  }

  const rows = declared.rows
    .map(row => ({
      gate: String(row['Gate'] ?? '').replace(/`/g, '').trim(),
      brief: String(row["Reader's brief"] ?? '').replace(/`/g, '').trim(),
      given: splitNames(row['Given']),
      withheld: splitNames(row['Withheld']),
      line: row.__line,
    }))
    .filter(row => row.gate !== '');

  if (rows.length === 0) {
    add('declared', specFile, declared.line, 'the reader table declares no gates');
    return violations;
  }

  const present = new Set(await readdir(promptsDir));
  const compared: Array<{ gate: string; brief: string; inputs: string[] }> = [];

  for (const row of rows) {
    const briefPath = path.join(promptsDir, row.brief);

    if (row.brief === '') {
      add('briefs', specFile, row.line, `gate ${row.gate} names no brief for its reader`);
      continue;
    }
    if (!present.has(row.brief)) {
      add('briefs', specFile, row.line,
        `gate ${row.gate} names the brief "${row.brief}", which is not in ${promptsDir} — `
        + 'a reader nobody briefed is a reader nobody can hold to a list');
      continue;
    }

    const brief = await readFile(briefPath, 'utf8');
    const inputs = declaredInputs(brief);
    if (inputs === undefined) {
      add('briefs', briefPath, 0,
        `no "## ${INPUT_HEADING}" table with columns ${INPUT_TABLE_COLUMNS.join(' and ')} — `
        + `gate ${row.gate}'s reader must declare what it is handed, where a check can read it`);
      continue;
    }
    const withheld = declaredInputs(brief, WITHHELD_HEADING);
    if (withheld === undefined) {
      add('briefs', briefPath, 0,
        `no "## ${WITHHELD_HEADING}" table with columns ${INPUT_TABLE_COLUMNS.join(' and ')} — `
        + `gate ${row.gate}'s reader must declare what is withheld`);
      continue;
    }

    const declaredSet = new Set(row.given);
    const briefSet = new Set(inputs);
    for (const name of row.given) {
      if (row.withheld.includes(name)) {
        add('boundary', specFile, row.line,
          `gate ${row.gate} both gives and withholds "${name}" — remove it from the allowed handoff`);
      }
    }

    for (const name of declaredSet) {
      if (!briefSet.has(name)) {
        add('inputs', briefPath, 0,
          `gate ${row.gate}'s brief does not declare "${name}", which ${specFile} says this reader is given`);
      }
    }
    for (const name of briefSet) {
      if (!declaredSet.has(name)) {
        add('inputs', briefPath, 0,
          `gate ${row.gate}'s brief declares "${name}", which ${specFile} does not list among what this reader is given`);
      }
    }
    const declaredWithheld = new Set(row.withheld);
    const briefWithheld = new Set(withheld);
    for (const name of declaredWithheld) {
      if (!briefWithheld.has(name)) {
        add('withheld', briefPath, 0,
          `gate ${row.gate}'s brief does not withhold "${name}", which ${specFile} requires`);
      }
    }
    for (const name of briefWithheld) {
      if (!declaredWithheld.has(name)) {
        add('withheld', briefPath, 0,
          `gate ${row.gate}'s brief withholds "${name}", which ${specFile} does not list`);
      }
    }

    compared.push({ gate: row.gate, brief: row.brief, inputs });
  }

  log.info('inputs', 'reader inputs checked', {
    gates: rows.length,
    compared: compared.length,
  });

  if (violations.length === 0) {
    // The success path is the answer to "so what is each reader actually handed?" —
    // a check that only ever prints nothing is a check nobody can audit.
    for (const entry of compared) {
      log.info('inputs', `gate ${entry.gate} reader is handed`, {
        brief: path.join(PROMPTS_DIR, entry.brief),
        inputs: entry.inputs,
      });
    }
  }

  return violations;
}

async function main(): Promise<number> {
  const specDir = process.argv[2] ?? 'docs/spec';
  const bundleDir = process.argv[3] ?? 'skills/maestro';
  log.info('run', 'checking gate readers', { specDir, bundleDir });

  let violations: Violation[];
  try {
    violations = await checkGateReaders({ specDir, bundleDir });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.error('run', 'inputs could not be read', { specDir, bundleDir, reason });
    process.stdout.write(`gate-readers: cannot read ${specDir} or ${bundleDir}\n`);
    return 2;
  }

  if (violations.length === 0) {
    process.stdout.write('gate-readers: OK\n');
    return 0;
  }

  for (const violation of violations) {
    process.stdout.write(formatViolation(violation));
  }
  process.stdout.write(`gate-readers: ${violations.length} violation(s)\n`);
  return 1;
}

// This comparison checks the reader declarations. It cannot prove that the
// orchestrator's actual dispatch envelope obeyed them; workflow evaluation owns
// that boundary.

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}
