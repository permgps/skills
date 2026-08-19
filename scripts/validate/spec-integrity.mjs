#!/usr/bin/env node
// Checks the behavior specification in docs/spec for internal contradictions.
// Dependency-free by design: the TypeScript toolchain arrives with the
// repository skeleton milestone, and this script must run before it exists.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const LEVELS = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40 };
const FLOOR = LEVELS[(process.env.LOG_LEVEL ?? 'INFO').toUpperCase()] ?? LEVELS.INFO;

function log(level, check, message, data) {
  if (LEVELS[level] < FLOOR) return;
  const suffix = data === undefined ? '' : ` ${JSON.stringify(data)}`;
  process.stderr.write(`${level} [spec-integrity.${check}] ${message}${suffix}\n`);
}

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

// Split a markdown table row on pipes that are not backslash-escaped.
function splitRow(line) {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split(/(?<!\\)\|/)
    .map(cell => cell.replace(/\\\|/g, '|').trim());
}

const isSeparator = line => /^\s*\|?[\s:-]*-[\s:|-]*\|?\s*$/.test(line) && line.includes('-');

export function parseTables(markdown) {
  const lines = markdown.split('\n');
  const tables = [];

  for (let i = 0; i < lines.length - 1; i += 1) {
    if (!lines[i].trim().startsWith('|') || !isSeparator(lines[i + 1])) continue;

    const columns = splitRow(lines[i]);
    const rows = [];
    let cursor = i + 2;

    while (cursor < lines.length && lines[cursor].trim().startsWith('|')) {
      const cells = splitRow(lines[cursor]);
      const row = { __line: cursor + 1 };
      columns.forEach((column, index) => { row[column] = cells[index] ?? ''; });
      rows.push(row);
      cursor += 1;
    }

    tables.push({ columns, rows, line: i + 1 });
    i = cursor - 1;
  }

  return tables;
}

const findTable = (tables, required) =>
  tables.find(table => required.every(column => table.columns.includes(column)));

const cleanCell = value => value.replace(/`/g, '').trim();

export async function checkSpec(specDir) {
  const violations = [];
  const add = (check, file, line, message) => {
    violations.push({ check, file, line, message });
    log('ERROR', check, message, { file, line });
  };

  const present = new Set(
    (await readdir(specDir)).filter(name => name.endsWith('.md')),
  );

  for (const doc of REQUIRED_DOCS) {
    if (!present.has(doc)) add('documents', doc, 0, `required document is missing: ${doc}`);
  }
  log('DEBUG', 'documents', 'documents scanned', { found: present.size });
  if (violations.length > 0) return violations;

  // Parse everything present, not only the required set: a table defined in any
  // document of the specification is part of the specification.
  const docs = {};
  for (const name of [...present].sort()) {
    docs[name] = parseTables(await readFile(path.join(specDir, name), 'utf8'));
  }
  log('DEBUG', 'documents', 'documents parsed', { documents: Object.keys(docs) });

  // --- phases: the id set every other check resolves against ---------------
  const phaseTable = findTable(docs['phases.md'], ['Id', 'Stage']);
  if (!phaseTable) {
    add('phases', 'phases.md', 0, 'no table with columns Id and Stage');
    return violations;
  }
  const phaseIds = new Set(phaseTable.rows.map(row => cleanCell(row.Id)));
  const stageIds = new Set(
    phaseTable.rows
      .filter(row => cleanCell(row.Stage).toLowerCase() === 'yes')
      .map(row => cleanCell(row.Id)),
  );
  log('INFO', 'phases', 'phase ids resolved', { phases: phaseIds.size, stages: stageIds.size });

  // --- gates point at phases that exist ------------------------------------
  const gateTable = findTable(docs['gates.md'], ['Gate', 'After phase']);
  if (!gateTable) {
    add('gates', 'gates.md', 0, 'no table with columns Gate and After phase');
  } else {
    for (const row of gateTable.rows) {
      const phase = cleanCell(row['After phase']);
      if (!phaseIds.has(phase)) {
        add('gates', 'gates.md', row.__line,
          `gate ${cleanCell(row.Gate)} runs after unknown phase "${phase}"`);
      }
    }
    log('INFO', 'gates', 'gates checked', { count: gateTable.rows.length });
  }

  // --- every artifact has exactly one writer -------------------------------
  const artifactTable = findTable(docs['artifacts.md'], ['Artifact', 'Writer']);
  if (!artifactTable) {
    add('artifacts', 'artifacts.md', 0, 'no table with columns Artifact and Writer');
  } else {
    for (const row of artifactTable.rows) {
      const artifact = cleanCell(row.Artifact);
      const writer = cleanCell(row.Writer);
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
    log('INFO', 'artifacts', 'artifacts checked', { count: artifactTable.rows.length });
  }

  // --- every state field is produced and consumed --------------------------
  const stateTable = findTable(docs['state-contract.md'], ['Field', 'Written in', 'Read by']);
  if (!stateTable) {
    add('state', 'state-contract.md', 0, 'no table with columns Field, Written in and Read by');
  } else {
    for (const row of stateTable.rows) {
      const field = cleanCell(row.Field);
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
    log('INFO', 'state', 'state fields checked', { count: stateTable.rows.length });
  }

  // --- stage ids and labels are the same set -------------------------------
  const labelTable = findTable(docs['vocabulary.md'], ['Stage id', 'Label']);
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
    log('INFO', 'labels', 'stage labels checked', { stages: stageIds.size, labels: labelled.size });
  }

  // --- no banned synonym survives inside a defined label -------------------
  const bannedTable = findTable(docs['vocabulary.md'], ['Banned', 'Use instead']);
  if (!bannedTable) {
    add('banned', 'vocabulary.md', 0, 'no table with columns Banned and Use instead');
  } else {
    const banned = bannedTable.rows.map(row => cleanCell(row.Banned).toLowerCase()).filter(Boolean);
    for (const [name, tables] of Object.entries(docs)) {
      for (const table of tables) {
        if (!table.columns.includes('Label')) continue;
        for (const row of table.rows) {
          const label = cleanCell(row.Label).toLowerCase();
          const hit = banned.find(term => label.includes(term));
          if (hit) {
            add('banned', name, row.__line, `label "${cleanCell(row.Label)}" uses banned term "${hit}"`);
          }
        }
      }
    }
    log('INFO', 'banned', 'labels scanned for banned terms', { terms: banned.length });
  }

  return violations;
}

async function main() {
  const specDir = process.argv[2] ?? 'docs/spec';
  log('INFO', 'run', 'checking specification', { specDir });
  const violations = await checkSpec(specDir);

  if (violations.length === 0) {
    process.stdout.write('spec-integrity: OK\n');
    return 0;
  }

  for (const violation of violations) {
    process.stdout.write(`${violation.file}:${violation.line}  [${violation.check}] ${violation.message}\n`);
  }
  process.stdout.write(`spec-integrity: ${violations.length} violation(s)\n`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}
