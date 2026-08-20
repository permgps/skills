#!/usr/bin/env node
// Holds each dial's value set and the value it starts on to one answer.
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
// still agree on which values exist and which one applies when nobody chose.
//
// The declaration sentence names the dial it declares. It did not always: while
// the mode was the only dial with a built-in default, «Built-in default `semi`»
// was unambiguous, and the second dial to declare one in the same file would
// have read as the mode's default stated twice.

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

/** One dial whose value set and built-in default are held to one answer. */
export interface DialSpec {
  /** The word the declaration sentence names, and the field in the run state. */
  dial: string;
  /** The column that holds the dial's values, in every one of the three files. */
  column: string;
  /** A second column, so the dial's table cannot be confused with another. */
  witness: string;
}

export const DIALS: readonly DialSpec[] = [
  { dial: 'mode', column: 'Mode', witness: 'Human gates' },
  { dial: 'explain', column: 'Register', witness: 'What changes' },
];

/**
 * The sentence a bundle file uses to declare a built-in default.
 *
 * The phrasing is the contract, not a convenience: the bundle has no column to
 * put this in, so the check needs one form it can find. Both files read
 * naturally with it — «Built-in default for `mode`: `semi`.» and «Built-in
 * default for `mode`: `semi`; a project pins its own».
 */
const DEFAULT_PHRASE =
  /built-in\s+default\s+for\s+`([a-z][a-z-]*)`\s*[:,]?\s*`([a-z][a-z-]*)`/gi;

const findTable = (tables: Table[], required: string[]): Table | undefined =>
  tables.find(table => required.every(column => table.columns.includes(column)));

const clean = (value: string | number | undefined): string =>
  String(value ?? '').replace(/`/g, '').replace(/\*/g, '').trim();

/** Every value named by one dial's table in one document, in source order. */
export function readValues(markdown: string, spec: DialSpec): string[] | null {
  const table = findTable(parseTables(markdown), [spec.column, spec.witness]);
  if (!table) return null;
  return table.rows.map(row => clean(row[spec.column])).filter(value => value !== '');
}

/**
 * Every declaration of a built-in default in one file, with the dial and line.
 *
 * The whole text is scanned rather than each line on its own, because these
 * files are prose wrapped at eighty columns and a reflow that moved «for» onto
 * the next line would otherwise delete a declaration silently.
 */
export function findDeclarations(
  markdown: string,
): Array<{ dial: string; value: string; line: number }> {
  const found: Array<{ dial: string; value: string; line: number }> = [];
  for (const match of markdown.matchAll(DEFAULT_PHRASE)) {
    const line = markdown.slice(0, match.index).split('\n').length;
    found.push({ dial: match[1] ?? '', value: match[2] ?? '', line });
  }
  return found;
}

export interface CheckOptions {
  specDir?: string;
  bundleDir?: string;
  /**
   * Which dials to hold. Overridable so a fixture can prove the machinery on a
   * second dial: with one real dial in `DIALS`, "two dials in one file each
   * declare a default and neither reads as a duplicate" would otherwise be a
   * claim with nothing exercising it.
   */
  dials?: readonly DialSpec[];
}

export async function checkDialsDefaults(options: CheckOptions = {}): Promise<Violation[]> {
  const specDir = options.specDir ?? 'docs/spec';
  const bundleDir = options.bundleDir ?? 'skills/maestro';
  const specFile = path.join(specDir, SPEC_FILE);
  const dials = options.dials ?? DIALS;

  const violations: Violation[] = [];
  const add = (check: string, file: string, line: number, message: string): void => {
    violations.push({ check, file, line, message });
    log.error(check, message, { file, line });
  };

  // --- the specification is the authority on every dial's values -----------
  const specMarkdown = await readFile(specFile, 'utf8');
  const authority = new Map<string, { values: string[]; builtIn: string }>();

  for (const spec of dials) {
    const columns = [spec.column, spec.witness, 'Default'];
    const table = findTable(parseTables(specMarkdown), columns);
    if (!table) {
      add(spec.dial, specFile, 0, `no table with columns ${columns.join(', ')}`);
      continue;
    }

    const values = table.rows.map(row => clean(row[spec.column])).filter(v => v !== '');
    const marked = table.rows
      .filter(row => clean(row['Default']).toLowerCase() === 'yes')
      .map(row => ({ value: clean(row[spec.column]), line: row.__line }));

    if (marked.length === 0) {
      add(spec.dial, specFile, table.rows[0]?.__line ?? 0,
        `no ${spec.column} is marked Default; one of them applies when the user names none`);
      continue;
    }
    for (const extra of marked.slice(1)) {
      add(spec.dial, specFile, extra.line,
        `"${extra.value}" is a second ${spec.column} marked Default; "${marked[0]?.value}" already is`);
    }

    authority.set(spec.dial, { values, builtIn: marked[0]?.value ?? '' });
    log.info(spec.dial, 'specification read', { values: values.length, default: marked[0]?.value });
  }

  if (authority.size === 0) return violations;

  // --- the bundle names the same values and the same defaults --------------
  for (const relative of [PHASE_FILE, SKILL_FILE]) {
    const file = path.join(bundleDir, relative);
    const markdown = await readFile(file, 'utf8');
    const declarations = findDeclarations(markdown);

    for (const declared of declarations) {
      if (!authority.has(declared.dial)) {
        add('default', file, declared.line,
          `declares a built-in default for "${declared.dial}", which ${specFile} defines no dial for`);
      }
    }

    for (const spec of dials) {
      const known = authority.get(spec.dial);
      if (!known) continue;

      const values = readValues(markdown, spec);
      if (values === null) {
        add(spec.dial, file, 0,
          `no table with columns ${spec.column} and ${spec.witness}`);
      } else {
        for (const value of known.values) {
          if (!values.includes(value)) {
            add(spec.dial, file, 0,
              `${spec.dial} "${value}" is defined in ${specFile} and missing here`);
          }
        }
        for (const value of values) {
          if (!known.values.includes(value)) {
            add(spec.dial, file, 0,
              `${spec.dial} "${value}" is named here and defined nowhere in ${specFile}`);
          }
        }
      }

      const mine = declarations.filter(entry => entry.dial === spec.dial);
      if (mine.length === 0) {
        add('default', file, 0,
          `no built-in default declared for "${spec.dial}"; expected a line reading `
          + `"Built-in default for \`${spec.dial}\`: \`${known.builtIn}\`"`);
        continue;
      }
      for (const extra of mine.slice(1)) {
        add('default', file, extra.line,
          `the built-in default for "${spec.dial}" is declared twice in one file; `
          + `the first is at line ${mine[0]?.line}`);
      }

      const declared = mine[0];
      if (declared && declared.value !== known.builtIn) {
        add('default', file, declared.line,
          `declares "${declared.value}" as the built-in default for "${spec.dial}"; `
          + `${specFile} says "${known.builtIn}"`);
      }
    }
  }

  log.info('default', 'declarations checked', { files: 2, dials: authority.size });
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
