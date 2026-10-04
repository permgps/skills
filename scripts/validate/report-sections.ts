#!/usr/bin/env node
// Holds the отчёт's sections in the two places that list them.
//
// The bundle's acceptance phase lists the sections a прогон writes, and the
// specification lists the sections the отчёт has. Before this check nothing
// held either: the two tables had already drifted in their Holds text, and the
// count of sections was written out in prose five times across three files.
// Adding the two sections that hand over what only the user can do —
// «Questions to forward» and «Hard to undo» — would have moved every one of
// those copies by hand.
//
// So the list has one shape and this check holds it:
// - the Section column of both tables is the same names in the same order;
// - both carry the two handed-over sections, which the milestone exists for;
// - no file states how many sections there are, because a count is a second
//   copy of the table's length and is the copy nobody updates.
//
// It reads the bundle and the specification, never a прогон's `report.md`: the
// user chose a repository check, and a прогон writes what the bundle's table
// says. Whether a real отчёт followed it is not held by `npm run check`.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createLogger } from '../shared/log.ts';
import { formatViolation, type Violation } from '../shared/violation.ts';
import { parseTables } from './spec-integrity.ts';

export type { Violation };

const log = createLogger('report-sections');

/** Where each list lives, as a file and the heading its table sits under. */
export const BUNDLE_TABLE = { file: path.join('phases', '7-acceptance.md'), heading: '### 4. Write the отчёт' } as const;
export const SPEC_TABLE = { file: 'phases.md', heading: '### The Отчёт' } as const;

/** Files that may not state a number of sections. */
export const COUNT_FREE_SPEC_FILES: readonly string[] = ['phases.md', 'artifacts.md'];

/** The sections this milestone added; their absence is a violation on its own. */
export const REQUIRED_SECTIONS: readonly string[] = ['Questions to forward', 'Hard to undo'];

const COUNT = /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+sections\b/gi;

const clean = (value: string | number | undefined): string =>
  String(value ?? '').replace(/[`*]/g, '').trim();

export interface SectionTable {
  sections: string[];
  /** 1-based line of the table's header row in the whole file. */
  line: number;
}

/**
 * The Section column of the first `| Section | Holds |` table under `heading`,
 * stopping at the next heading of the same or a higher level. `null` when the
 * heading or the table is not there.
 */
export function readSectionTable(markdown: string, heading: string): SectionTable | null {
  const lines = markdown.split('\n');
  const start = lines.findIndex(line => line.trim() === heading);
  if (start === -1) return null;

  const level = heading.indexOf(' ');
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(line => {
    const match = /^(#+)\s/.exec(line);
    return match !== null && (match[1]?.length ?? 0) <= level;
  });
  const body = (end === -1 ? rest : rest.slice(0, end)).join('\n');

  const table = parseTables(body).find(found => found.columns.includes('Section') && found.columns.includes('Holds'));
  if (!table) return null;
  return { sections: table.rows.map(row => clean(row['Section'])), line: start + 1 + table.line };
}

export interface CheckOptions {
  specDir?: string;
  bundleDir?: string;
}

/**
 * Every disagreement between the two tables, every missing handed-over
 * section, and every stated count. Throws when a file or a table cannot be
 * found, which the CLI reports as unreadable rather than as a violation.
 */
export async function checkReportSections(options: CheckOptions = {}): Promise<Violation[]> {
  const specDir = options.specDir ?? 'docs/spec';
  const bundleDir = options.bundleDir ?? 'skills/maestro';
  const bundleFile = path.join(bundleDir, BUNDLE_TABLE.file);
  const specFile = path.join(specDir, SPEC_TABLE.file);

  const violations: Violation[] = [];
  const add = (check: string, file: string, line: number, message: string, facts: Record<string, unknown> = {}): void => {
    violations.push({ check, file, line, message });
    log.error(check, message, { file, line, ...facts });
  };

  const read = async (file: string, heading: string): Promise<{ text: string; table: SectionTable }> => {
    const text = await readFile(file, 'utf8');
    const table = readSectionTable(text, heading);
    if (table === null) throw new Error(`${file} has no | Section | Holds | table under "${heading}"`);
    log.debug('report-sections', 'table read', { file, sections: table.sections });
    return { text, table };
  };

  const bundle = await read(bundleFile, BUNDLE_TABLE.heading);
  const spec = await read(specFile, SPEC_TABLE.heading);

  const length = Math.max(bundle.table.sections.length, spec.table.sections.length);
  for (let position = 0; position < length; position += 1) {
    const expected = bundle.table.sections[position];
    const found = spec.table.sections[position];
    if (expected === found) continue;
    add('order', specFile, spec.table.line,
      `the отчёт's sections differ from ${bundleFile} at position ${position + 1}: `
      + `the bundle has ${expected === undefined ? 'nothing' : `"${expected}"`}, `
      + `the specification ${found === undefined ? 'nothing' : `"${found}"`} — make the two tables list the same `
      + 'sections in the same order; the bundle\'s table is what a прогон writes',
      { expected: expected ?? null, found: found ?? null });
    break;
  }

  for (const [file, table] of [[bundleFile, bundle.table], [specFile, spec.table]] as const) {
    for (const name of REQUIRED_SECTIONS) {
      if (table.sections.includes(name)) continue;
      add('required', file, table.line,
        `the отчёт's table has no "${name}" section — it hands over what only the user can do, `
        + 'so it belongs in both tables', { expected: name, found: table.sections });
    }
  }

  const countFree: [string, string][] = [[bundleFile, bundle.text], [specFile, spec.text]];
  for (const name of COUNT_FREE_SPEC_FILES) {
    if (name === SPEC_TABLE.file) continue;
    const file = path.join(specDir, name);
    countFree.push([file, await readFile(file, 'utf8')]);
  }
  for (const [file, text] of countFree) {
    for (const match of text.matchAll(COUNT)) {
      const line = text.slice(0, match.index).split('\n').length;
      add('count', file, line,
        `"${match[0].replace(/\s+/g, ' ')}" states how many sections the отчёт has — drop the number `
        + '("the sections below", "its sections"); the table is the count',
        { expected: 'no count', found: match[0] });
    }
  }

  log.info('report-sections', 'sections compared', {
    bundle: bundle.table.sections.length, spec: spec.table.sections.length, violations: violations.length,
  });
  return violations;
}

async function main(): Promise<number> {
  const specDir = process.argv[2] ?? 'docs/spec';
  const bundleDir = process.argv[3] ?? 'skills/maestro';
  log.info('run', 'checking the отчёт\'s sections', { specDir, bundleDir });

  let violations: Violation[];
  try {
    violations = await checkReportSections({ specDir, bundleDir });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.error('run', 'inputs could not be read', { specDir, bundleDir, reason });
    process.stdout.write(`report-sections: cannot read ${specDir} or ${bundleDir} — ${reason}\n`);
    return 2;
  }

  if (violations.length === 0) {
    process.stdout.write('report-sections: OK\n');
    return 0;
  }

  for (const violation of violations) {
    process.stdout.write(formatViolation(violation));
  }
  process.stdout.write(`report-sections: ${violations.length} violation(s)\n`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}
