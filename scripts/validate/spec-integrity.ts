#!/usr/bin/env node
// Checks the behavior specification in docs/spec for internal contradictions.
// Runs directly under Node's type stripping — no build step, no runtime deps.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createLogger } from '../shared/log.ts';
import { formatViolation, type Violation } from '../shared/violation.ts';

export type { Violation };

const log = createLogger('spec-integrity');

// Two different lists, deliberately: REQUIRED_DOCS is what must exist, and the
// parse set is every markdown file actually present. Collapsing them into one
// list is how a document silently stops being checked.
const REQUIRED_DOCS = [
  'README.md',
  'vocabulary.md',
  'safety.md',
  'dials.md',
  'phases.md',
  'gates.md',
  'artifacts.md',
  'state-contract.md',
  'dashboard.md',
];

/**
 * One parsed table row. `__line` is the 1-based source line, so a violation can
 * point at the row that caused it; every other key is a column name.
 */
export interface TableRow {
  __line: number;
  [column: string]: string | number;
}

export interface Table {
  columns: string[];
  rows: TableRow[];
  /** 1-based line of the header row. */
  line: number;
}


/** Split a markdown table row on pipes that are not backslash-escaped. */
function splitRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split(/(?<!\\)\|/)
    .map(cell => cell.replace(/\\\|/g, '|').trim());
}

const isSeparator = (line: string): boolean =>
  /^\s*\|?[\s:-]*-[\s:|-]*\|?\s*$/.test(line) && line.includes('-');

export function parseTables(markdown: string): Table[] {
  const lines = markdown.split('\n');
  const tables: Table[] = [];

  for (let i = 0; i < lines.length - 1; i += 1) {
    const header = lines[i] ?? '';
    const separator = lines[i + 1] ?? '';
    if (!header.trim().startsWith('|') || !isSeparator(separator)) continue;

    const columns = splitRow(header);
    const rows: TableRow[] = [];
    let cursor = i + 2;

    while (cursor < lines.length && (lines[cursor] ?? '').trim().startsWith('|')) {
      const cells = splitRow(lines[cursor] ?? '');
      const row: TableRow = { __line: cursor + 1 };
      columns.forEach((column, index) => { row[column] = cells[index] ?? ''; });
      rows.push(row);
      cursor += 1;
    }

    tables.push({ columns, rows, line: i + 1 });
    i = cursor - 1;
  }

  return tables;
}

const findTable = (tables: Table[], required: string[]): Table | undefined =>
  tables.find(table => required.every(column => table.columns.includes(column)));

const cleanCell = (value: string | number | undefined): string =>
  String(value ?? '').replace(/`/g, '').trim();

export async function checkSpec(specDir: string): Promise<Violation[]> {
  const violations: Violation[] = [];
  const add = (check: string, file: string, line: number, message: string): void => {
    violations.push({ check, file, line, message });
    log.error(check, message, { file, line });
  };

  const present = new Set(
    (await readdir(specDir)).filter(name => name.endsWith('.md')),
  );

  for (const doc of REQUIRED_DOCS) {
    if (!present.has(doc)) add('documents', doc, 0, `required document is missing: ${doc}`);
  }
  log.debug('documents', 'documents scanned', { found: present.size });
  if (violations.length > 0) return violations;

  // Parse everything present, not only the required set: a table defined in any
  // document of the specification is part of the specification.
  const docs = new Map<string, Table[]>();
  for (const name of [...present].sort()) {
    docs.set(name, parseTables(await readFile(path.join(specDir, name), 'utf8')));
  }
  log.debug('documents', 'documents parsed', { documents: [...docs.keys()] });

  // Every required document is present by the time we get here; the fallback
  // keeps the types honest without inventing a second failure path.
  const tablesOf = (name: string): Table[] => docs.get(name) ?? [];

  // --- phases: the id set every other check resolves against ---------------
  const phaseTable = findTable(tablesOf('phases.md'), ['Id', 'Stage']);
  if (!phaseTable) {
    add('phases', 'phases.md', 0, 'no table with columns Id and Stage');
    return violations;
  }
  const phaseIds = new Set(phaseTable.rows.map(row => cleanCell(row['Id'])));
  const stageIds = new Set(
    phaseTable.rows
      .filter(row => cleanCell(row['Stage']).toLowerCase() === 'yes')
      .map(row => cleanCell(row['Id'])),
  );
  log.info('phases', 'phase ids resolved', { phases: phaseIds.size, stages: stageIds.size });

  // --- gates point at phases that exist ------------------------------------
  const gateTable = findTable(tablesOf('gates.md'), ['Gate', 'After phase']);
  if (!gateTable) {
    add('gates', 'gates.md', 0, 'no table with columns Gate and After phase');
  } else {
    for (const row of gateTable.rows) {
      const phase = cleanCell(row['After phase']);
      if (!phaseIds.has(phase)) {
        add('gates', 'gates.md', row.__line,
          `gate ${cleanCell(row['Gate'])} runs after unknown phase "${phase}"`);
      }
    }
    log.info('gates', 'gates checked', { count: gateTable.rows.length });
  }

  // --- every artifact has exactly one writer -------------------------------
  const artifactTable = findTable(tablesOf('artifacts.md'), ['Artifact', 'Writer']);
  if (!artifactTable) {
    add('artifacts', 'artifacts.md', 0, 'no table with columns Artifact and Writer');
  } else {
    for (const row of artifactTable.rows) {
      const artifact = cleanCell(row['Artifact']);
      const writer = cleanCell(row['Writer']);
      if (writer === '') {
        add('artifacts', 'artifacts.md', row.__line, `artifact ${artifact} has no writer`);
      } else if (/[,/]| and /.test(writer)) {
        add('artifacts', 'artifacts.md', row.__line,
          `artifact ${artifact} declares more than one writer: "${writer}"`);
      } else if (!phaseIds.has(writer)) {
        add('artifacts', 'artifacts.md', row.__line,
          `artifact ${artifact} is written by unknown phase "${writer}"`);
      }
    }
    log.info('artifacts', 'artifacts checked', { count: artifactTable.rows.length });
  }

  // --- every state field is produced and consumed --------------------------
  const stateTable = findTable(tablesOf('state-contract.md'), ['Field', 'Written in', 'Read by']);
  if (!stateTable) {
    add('state', 'state-contract.md', 0, 'no table with columns Field, Written in and Read by');
  } else {
    for (const row of stateTable.rows) {
      const field = cleanCell(row['Field']);
      const writtenIn = cleanCell(row['Written in']);
      const readBy = cleanCell(row['Read by']);
      if (!phaseIds.has(writtenIn)) {
        add('state', 'state-contract.md', row.__line,
          `field ${field} is written in unknown phase "${writtenIn}"`);
      }
      if (readBy === '') {
        add('state', 'state-contract.md', row.__line, `field ${field} has no reader`);
      }
    }
    log.info('state', 'state fields checked', { count: stateTable.rows.length });
  }

  // --- stage ids and labels are the same set -------------------------------
  const labelTable = findTable(tablesOf('vocabulary.md'), ['Stage id', 'Label']);
  if (!labelTable) {
    add('labels', 'vocabulary.md', 0, 'no table with columns Stage id and Label');
  } else {
    const labelled = new Set(labelTable.rows.map(row => cleanCell(row['Stage id'])));
    for (const id of stageIds) {
      if (!labelled.has(id)) {
        add('labels', 'vocabulary.md', labelTable.line, `stage "${id}" has no label`);
      }
    }
    for (const id of labelled) {
      if (!stageIds.has(id)) {
        add('labels', 'vocabulary.md', labelTable.line,
          `label defined for "${id}", which is not a stage in phases.md`);
      }
    }
    log.info('labels', 'stage labels checked', { stages: stageIds.size, labels: labelled.size });
  }

  // --- no banned synonym survives inside a defined label -------------------
  const bannedTable = findTable(tablesOf('vocabulary.md'), ['Banned', 'Use instead']);
  if (!bannedTable) {
    add('banned', 'vocabulary.md', 0, 'no table with columns Banned and Use instead');
  } else {
    const banned = bannedTable.rows
      .map(row => cleanCell(row['Banned']).toLowerCase())
      .filter(Boolean);
    for (const [name, tables] of docs) {
      for (const table of tables) {
        if (!table.columns.includes('Label')) continue;
        for (const row of table.rows) {
          const label = cleanCell(row['Label']).toLowerCase();
          const hit = banned.find(term => label.includes(term));
          if (hit) {
            add('banned', name, row.__line,
              `label "${cleanCell(row['Label'])}" uses banned term "${hit}"`);
          }
        }
      }
    }
    log.info('banned', 'labels scanned for banned terms', { terms: banned.length });
  }

  return violations;
}

async function main(): Promise<number> {
  const specDir = process.argv[2] ?? 'docs/spec';
  log.info('run', 'checking specification', { specDir });

  let violations: Violation[];
  try {
    violations = await checkSpec(specDir);
  } catch (error) {
    // A missing or unreadable directory is an operator mistake, not a defect in
    // the specification. Report it as one line instead of a stack trace.
    const reason = error instanceof Error ? error.message : String(error);
    log.error('run', 'specification directory could not be read', { specDir, reason });
    process.stdout.write(`spec-integrity: cannot read ${specDir}\n`);
    return 2;
  }

  if (violations.length === 0) {
    process.stdout.write('spec-integrity: OK\n');
    return 0;
  }

  for (const violation of violations) {
    process.stdout.write(formatViolation(violation));
  }
  process.stdout.write(`spec-integrity: ${violations.length} violation(s)\n`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}
