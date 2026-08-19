#!/usr/bin/env node
// Holds the repair phase's doors to the phases that open them.
//
// Before this check the repository carried three different answers to one
// question. `docs/spec/phases.md` said repair «has two entrances» in its prose
// and listed a third route to it forty lines further down; the bundle's
// `8-repair.md` said «exactly three doors». The first end-to-end прогон needed
// a fourth: the build recorded a divergence, wrote «carried to the repair
// phase» beside it, and no door existed for a `D##` — so the divergence shipped
// in a delivered file while every gate passed.
//
// A door therefore has one home, the specification's table, and two obligations:
// the bundle's repair phase lists it, and the phase that opens it says so with
// a marker. A door nobody opens is the defect this check exists to name.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createLogger } from '../shared/log.ts';
import { formatViolation, type Violation } from '../shared/violation.ts';
import { parseTables, type Table } from './spec-integrity.ts';

export type { Violation };

const log = createLogger('repair-doors');

const PHASES_DIR = 'phases';
const REPAIR_FILE = '8-repair.md';

const MARKER = /<!--\s*maestro:opens:([a-z0-9-]+)\s*-->/g;

export interface Opening {
  door: string;
  file: string;
  line: number;
}

/** Every door-opening marker in one file, in source order. */
export function findOpenings(markdown: string, file: string): Opening[] {
  const openings: Opening[] = [];

  markdown.split('\n').forEach((text, index) => {
    for (const match of text.matchAll(MARKER)) {
      openings.push({ door: match[1] ?? '', file, line: index + 1 });
    }
  });

  return openings;
}

const findTable = (tables: Table[], required: string[]): Table | undefined =>
  tables.find(table => required.every(column => table.columns.includes(column)));

const clean = (value: string | number | undefined): string =>
  String(value ?? '').replace(/`/g, '').replace(/\*/g, '').trim();

export interface CheckOptions {
  specDir?: string;
  bundleDir?: string;
}

export async function checkRepairDoors(options: CheckOptions = {}): Promise<Violation[]> {
  const specDir = options.specDir ?? 'docs/spec';
  const bundleDir = options.bundleDir ?? 'skills/maestro';
  const specFile = path.join(specDir, 'phases.md');

  const violations: Violation[] = [];
  const add = (check: string, file: string, line: number, message: string): void => {
    violations.push({ check, file, line, message });
    log.error(check, message, { file, line });
  };

  const declared = findTable(parseTables(await readFile(specFile, 'utf8')), ['Door', 'Opened by']);
  if (!declared) {
    add('doors', specFile, 0, 'no table with columns Door and Opened by');
    return violations;
  }

  const doors = new Map<string, { openedBy: string; line: number }>();
  for (const row of declared.rows) {
    const door = clean(row['Door']);
    if (door === '') continue;
    if (doors.has(door)) {
      add('doors', specFile, row.__line, `door "${door}" is declared twice`);
      continue;
    }
    doors.set(door, { openedBy: clean(row['Opened by']), line: row.__line });
  }
  log.info('doors', 'doors declared', { doors: doors.size });

  const phasesDir = path.join(bundleDir, PHASES_DIR);
  const names = (await readdir(phasesDir)).filter(name => name.endsWith('.md')).sort();

  // --- the bundle's repair phase lists the same doors -----------------------
  const repairPath = path.join(phasesDir, REPAIR_FILE);
  const repairTable = findTable(parseTables(await readFile(repairPath, 'utf8')), ['Door']);
  if (!repairTable) {
    add('repair', repairPath, 0, 'no table with a Door column');
  } else {
    const listed = new Set<string>();
    for (const row of repairTable.rows) {
      const door = clean(row['Door']);
      if (door === '') continue;
      listed.add(door);
      if (!doors.has(door)) {
        add('repair', repairPath, row.__line,
          `lists door "${door}", which ${specFile} does not declare`);
      }
    }
    for (const [door, { line }] of doors) {
      if (!listed.has(door)) {
        add('repair', specFile, line, `door "${door}" is missing from ${repairPath}`);
      }
    }
  }

  // --- somebody opens each door -------------------------------------------
  const openings: Opening[] = [];
  for (const name of names) {
    openings.push(...findOpenings(await readFile(path.join(phasesDir, name), 'utf8'), name));
  }

  for (const opening of openings) {
    if (!doors.has(opening.door)) {
      add('openings', path.join(phasesDir, opening.file), opening.line,
        `opens "${opening.door}", which is no door in ${specFile}`);
      continue;
    }
    // The repair phase is where the doors lead; a phase cannot open one into
    // itself, and a marker there would satisfy the check while nothing sends.
    if (opening.file === REPAIR_FILE) {
      add('openings', path.join(phasesDir, opening.file), opening.line,
        `"${opening.door}" is opened here; a door is opened by the phase that sends, not by repair`);
    }
  }

  for (const [door, { openedBy, line }] of doors) {
    const opened = openings.filter(o => o.door === door && o.file !== REPAIR_FILE);
    if (opened.length === 0) {
      add('openings', specFile, line,
        `door "${door}" is opened by nobody: no <!-- maestro:opens:${door} --> under ${phasesDir}`);
      continue;
    }
    // The spec names the phase; the marker has to sit in that phase's file, or
    // the two documents describe different routes into the same phase.
    if (openedBy !== '' && !opened.some(o => o.file.includes(openedBy))) {
      add('openings', specFile, line,
        `door "${door}" is declared as opened by ${openedBy}; its marker is in ${opened.map(o => o.file).join(', ')}`);
    }
  }

  log.info('openings', 'openings checked', { openings: openings.length });
  return violations;
}

async function main(): Promise<number> {
  const specDir = process.argv[2] ?? 'docs/spec';
  const bundleDir = process.argv[3] ?? 'skills/maestro';
  log.info('run', 'checking repair doors', { specDir, bundleDir });

  let violations: Violation[];
  try {
    violations = await checkRepairDoors({ specDir, bundleDir });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.error('run', 'inputs could not be read', { specDir, bundleDir, reason });
    process.stdout.write(`repair-doors: cannot read ${specDir} or ${bundleDir}\n`);
    return 2;
  }

  if (violations.length === 0) {
    process.stdout.write('repair-doors: OK\n');
    return 0;
  }

  for (const violation of violations) {
    process.stdout.write(formatViolation(violation));
  }
  process.stdout.write(`repair-doors: ${violations.length} violation(s)\n`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}
