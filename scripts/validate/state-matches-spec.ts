#!/usr/bin/env node
// Keeps docs/spec/state-contract.md and scripts/state/contract.ts the same
// document in two languages.
//
// The value sets are compared against the exported constants, which are real
// runtime data. The field list has to be read out of the source text, because
// an interface is erased before anything can look at it — that is the one place
// here where a checker parses code instead of importing it.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createLogger } from '../shared/log.ts';
import { formatViolation, type Violation } from '../shared/violation.ts';
import { parseTables, type Table } from './spec-integrity.ts';

export type { Violation };

const log = createLogger('state-matches-spec');

/**
 * Spec field name → the constant that is meant to carry the same set in code.
 * A value set present on one side and absent on the other is itself a finding:
 * it means one document grew a set the other has never heard of.
 */
const VALUE_SET_CONSTANTS: Record<string, string> = {
  'mode': 'MODES',
  'depth': 'DEPTHS',
  'explain': 'REGISTERS',
  'stages[].status': 'STAGE_STATUSES',
  'tasks[].status': 'TASK_STATUSES',
  'requirements[].status': 'REQUIREMENT_STATUSES',
  'gates[].status': 'GATE_STATUSES',
};

/** Stage ids belong to phases.md; the contract only mirrors them. */
const STAGE_IDS_CONSTANT = 'STAGE_IDS';

/**
 * Read an exported array of string literals out of the source.
 *
 * The constants are imported nowhere on purpose. A checker that imports one of
 * the two documents it compares can only ever check itself, and could not be
 * given a fixture to prove it catches anything.
 */
export function parseStringArrayConst(source: string, name: string): string[] | null {
  const pattern = new RegExp(
    `export\\s+const\\s+${name}\\s*(?::[^=]*)?=\\s*\\[([^\\]]*)\\]`,
  );
  const match = pattern.exec(source);
  if (match === null) return null;

  const body = match[1] ?? '';
  const values: string[] = [];
  for (const item of body.matchAll(/'([^']*)'|"([^"]*)"/g)) {
    values.push(item[1] ?? item[2] ?? '');
  }
  return values;
}

const clean = (value: string | number | undefined): string =>
  String(value ?? '').replace(/`/g, '').trim();

/** `dialChanges[]` and `dialChanges` are the same field. */
const bareName = (field: string): string => field.replace(/\[\]$/, '');

/** Split a cell like `` `full` \| `semi` `` into its literals, or return null. */
export function parseUnionCell(cell: string): string[] | null {
  const parts = cell.split('|').map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  if (!parts.every(part => /^`[a-z][a-z-]*`$/.test(part))) return null;
  return parts.map(part => part.replace(/`/g, ''));
}

/** Field names declared on `interface RunState`, in declaration order. */
export function parseRunStateFields(source: string): string[] {
  const start = source.indexOf('export interface RunState {');
  if (start === -1) return [];

  const body = source.slice(start);
  const end = body.indexOf('\n}');
  if (end === -1) return [];

  const fields: string[] = [];
  for (const line of body.slice(0, end).split('\n').slice(1)) {
    const match = /^\s{2}([A-Za-z][A-Za-z0-9_]*)\??:/.exec(line);
    if (match?.[1] !== undefined) fields.push(match[1]);
  }
  return fields;
}

const findTable = (tables: Table[], required: string[]): Table | undefined =>
  tables.find(table => required.every(column => table.columns.includes(column)));

export interface CheckOptions {
  specDir?: string;
  contractFile?: string;
  phasesFile?: string;
}

export async function checkStateMatchesSpec(options: CheckOptions = {}): Promise<Violation[]> {
  const specDir = options.specDir ?? 'docs/spec';
  const specFile = path.join(specDir, 'state-contract.md');
  const contractFile = options.contractFile ?? 'scripts/state/contract.ts';
  const phasesFile = options.phasesFile ?? path.join(specDir, 'phases.md');

  const violations: Violation[] = [];
  const add = (check: string, file: string, line: number, message: string): void => {
    violations.push({ check, file, line, message });
    log.error(check, message, { file, line });
  };

  const specTables = parseTables(await readFile(specFile, 'utf8'));
  const source = await readFile(contractFile, 'utf8');

  // --- fields -------------------------------------------------------------
  const fieldTable = findTable(specTables, ['Field', 'Type']);
  if (!fieldTable) {
    add('fields', specFile, 0, 'no table with columns Field and Type');
    return violations;
  }

  const specFields = new Map<string, number>();
  for (const row of fieldTable.rows) {
    const name = bareName(clean(row['Field']));
    if (name !== '') specFields.set(name, row.__line);
  }

  const codeFields = new Set(parseRunStateFields(source));
  if (codeFields.size === 0) {
    add('fields', contractFile, 0, 'no RunState interface found');
    return violations;
  }

  for (const [name, line] of specFields) {
    if (!codeFields.has(name)) {
      add('fields', specFile, line, `field "${name}" is specified but absent from RunState`);
    }
  }
  for (const name of codeFields) {
    if (!specFields.has(name)) {
      add('fields', contractFile, 0, `RunState declares "${name}", which the contract does not specify`);
    }
  }
  log.info('fields', 'fields compared', { spec: specFields.size, code: codeFields.size });

  // --- value sets ----------------------------------------------------------
  // The spec states them in two places: a dedicated table for nested fields, and
  // the Type column for the scalars. Both are read, because a drift in either
  // one is the same defect.
  const declared = new Map<string, { values: string[]; line: number }>();

  for (const row of fieldTable.rows) {
    // The raw cell, not the cleaned one: the backticks are what tell a union of
    // literals apart from a prose description of a type.
    const union = parseUnionCell(String(row['Type'] ?? ''));
    if (union) declared.set(clean(row['Field']), { values: union, line: row.__line });
  }

  const valueTable = findTable(specTables, ['Field', 'Values']);
  if (!valueTable) {
    add('values', specFile, 0, 'no table with columns Field and Values');
  } else {
    for (const row of valueTable.rows) {
      const field = clean(row['Field']);
      const values = clean(row['Values']).split(',').map(v => v.trim()).filter(Boolean);
      if (field !== '') declared.set(field, { values, line: row.__line });
    }
  }

  for (const [field, { values, line }] of declared) {
    const constant = VALUE_SET_CONSTANTS[field];
    if (constant === undefined) {
      add('values', specFile, line,
        `the contract states a value set for "${field}" that no constant in `
        + `${path.basename(contractFile)} is expected to carry`);
      continue;
    }
    const known = parseStringArrayConst(source, constant);
    if (known === null) {
      add('values', specFile, line,
        `the contract states a value set for "${field}" that no constant in `
        + `${path.basename(contractFile)} carries`);
      continue;
    }
    if (values.join(',') !== known.join(',')) {
      add('values', specFile, line,
        `value set for "${field}" differs — contract [${values.join(', ')}], code [${known.join(', ')}]`);
    }
  }
  for (const [field, constant] of Object.entries(VALUE_SET_CONSTANTS)) {
    if (!declared.has(field) && parseStringArrayConst(source, constant) !== null) {
      add('values', contractFile, 0,
        `code carries a value set for "${field}" that the contract does not state`);
    }
  }
  log.info('values', 'value sets compared', { sets: declared.size });

  // --- stage ids come from phases.md, not from the contract ----------------
  const phaseTables = parseTables(await readFile(phasesFile, 'utf8'));
  const phaseTable = findTable(phaseTables, ['Id', 'Stage']);
  if (!phaseTable) {
    add('stages', phasesFile, 0, 'no table with columns Id and Stage');
  } else {
    const specStages = phaseTable.rows
      .filter(row => clean(row['Stage']).toLowerCase() === 'yes')
      .map(row => clean(row['Id']));
    const codeStages = parseStringArrayConst(source, STAGE_IDS_CONSTANT);

    if (codeStages === null) {
      add('stages', contractFile, 0, `no ${STAGE_IDS_CONSTANT} constant found`);
    } else if (specStages.join(',') !== codeStages.join(',')) {
      add('stages', phasesFile, phaseTable.line,
        `stage ids differ — phases.md [${specStages.join(', ')}], code [${codeStages.join(', ')}]`);
    }
    log.info('stages', 'stage ids compared', {
      spec: specStages.length,
      code: codeStages?.length ?? 0,
    });
  }

  return violations;
}

async function main(): Promise<number> {
  const specDir = process.argv[2] ?? 'docs/spec';
  log.info('run', 'comparing the contract with its specification', { specDir });

  let violations: Violation[];
  try {
    violations = await checkStateMatchesSpec({ specDir });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.error('run', 'inputs could not be read', { specDir, reason });
    process.stdout.write(`state-matches-spec: cannot read ${specDir}\n`);
    return 2;
  }

  if (violations.length === 0) {
    process.stdout.write('state-matches-spec: OK\n');
    return 0;
  }
  for (const violation of violations) process.stdout.write(formatViolation(violation));
  process.stdout.write(`state-matches-spec: ${violations.length} violation(s)\n`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}
