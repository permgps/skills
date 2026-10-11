#!/usr/bin/env node
// Holds each gate reader's declared inputs to the specification.
//
// Every gate — G1 through G4 — is decided in part by a subagent, and what that
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

import { access, readFile, readdir } from 'node:fs/promises';
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

/**
 * What earlier прогоны left, as preflight wrote it into the run directory.
 *
 * Every gate reader is blind by construction, and an earlier run's decisions
 * are exactly the reasoning a blind reader must not inherit: a reader holding
 * them confirms the past rather than checking the user's words. So this one
 * name is held as a blanket rule rather than row by row: every row of the
 * table must withhold it and none may give it. A reader added to the table
 * later inherits the withholding without anyone having to remember it.
 */
export const PRIOR_MEMORY_INPUT = 'prior.md';

/**
 * What the repository held before the прогон, as the existing-code reader
 * returned it at the start of the spec phase.
 *
 * It is the прогон's own reading of the code. A reader judging the прогон's
 * work against the user's words, or a таск against its task file, would inherit
 * that reading and check the past instead of the work. Only the reader that
 * checks whether the plan's names fit together needs it, because a name the
 * code already has is one of the things that must fit. So the rows allowed to
 * give it are listed, a listed row must give it, and every other row must
 * withhold it — a reader added later inherits the withholding, as for
 * `prior.md`.
 */
export const CODEBASE_INPUT = 'codebase.md';

/** The `Gate` cells of the `gates.md` reader table allowed, and required, to give {@link CODEBASE_INPUT}. */
export const CODEBASE_GIVEN_ROWS: readonly string[] = ['G3 consistency'];

/**
 * Briefs outside the reader table that are handed {@link CODEBASE_INPUT}. They
 * carry no `What You Are Given` table, so the rule is held on their opening:
 * the text before the first `## ` heading.
 */
export const CODEBASE_HANDED: readonly string[] = ['executor.md'];

/**
 * Briefs outside the reader table that are denied {@link CODEBASE_INPUT}, held
 * on the opening paragraph that says what they have not seen.
 */
export const CODEBASE_DENIED: readonly string[] = ['reviewer.md'];

/** The sentence that opens a denied brief's withholding paragraph. */
const NOT_SEEN = 'You have not seen';

/** A brief's opening: everything before its first `## ` heading. */
const openingOf = (markdown: string): string => {
  const index = markdown.search(/^## /m);
  return index === -1 ? markdown : markdown.slice(0, index);
};

/** The paragraph that carries {@link NOT_SEEN}, whitespace collapsed, or `undefined`. */
const notSeenParagraph = (markdown: string): string | undefined =>
  markdown.split(/\n\s*\n/).map(paragraph => paragraph.replace(/\s+/g, ' ')).find(paragraph => paragraph.includes(NOT_SEEN));

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

/** The columns of `dials.md` › *Models* › *Who Runs On Which Tier*. */
const TIER_TABLE_COLUMNS = ['Role', 'Brief', 'Tier'];

/**
 * Every brief whose return decides a gate, a review or a repair. A gate rests
 * on its judge being no weaker than what it judges, so a judge never runs
 * `standard` — on any row it appears in.
 */
export const JUDGE_BRIEFS: readonly string[] = [
  'manifest-reader.md', 'independent-reader.md', 'reference-reader.md', 'task-reader.md',
  'plan-consistency-reader.md', 'reviewer.md', 'standards-reader.md', 'repair-diagnostician.md',
  'strategy-reviewer.md', 'acceptance-reader.md',
];

/** Briefs that are not judges and run on `standard`: reading, not deciding. */
export const STANDARD_BRIEFS: readonly string[] = ['existing-code-reader.md'];

/** The one brief whose tier is the таск's own, marked by the plan. */
export const TIERED_BRIEFS: readonly string[] = ['executor.md'];

/** The tier cells the table may hold, decoration removed. */
export const TIERS: readonly string[] = ['strong', 'standard', "the таск's"];

/**
 * Hold the tier table in `dials.md` to the shipped briefs: every brief has a
 * row, every row names a brief that exists, a judge is `strong` wherever it
 * appears, and only the executor takes its таск's tier. A spec directory with
 * no `dials.md` (a fixture of the reader table alone) has no table to hold.
 */
export async function checkModelTiers(specDir: string, bundleDir: string): Promise<Violation[]> {
  const specFile = path.join(specDir, 'dials.md');
  const promptsDir = path.join(bundleDir, PROMPTS_DIR);
  const violations: Violation[] = [];
  const add = (file: string, line: number, message: string): void => {
    violations.push({ check: 'tiers', file, line, message });
    log.error('tiers', message, { file, line });
  };
  if (!await access(specFile).then(() => true, () => false)) {
    log.debug('tiers', 'no dials specification; tiers not held', { specFile });
    return violations;
  }
  const table = findTable(parseTables(await readFile(specFile, 'utf8')), TIER_TABLE_COLUMNS);
  if (!table) {
    add(specFile, 0, 'no table with columns Role, Brief and Tier — who runs on which model tier needs one home a machine can read');
    return violations;
  }
  const briefs = (await readdir(promptsDir)).filter(name => name.endsWith('.md')).sort();
  const covered = new Set<string>();
  for (const row of table.rows) {
    const role = normalizeName(row['Role']);
    const brief = String(row['Brief'] ?? '').replace(/`/g, '').trim();
    const tier = normalizeName(row['Tier']);
    log.debug('tiers', 'row read', { role, brief, tier });
    if (!TIERS.includes(tier)) {
      add(specFile, row.__line, `role "${role}" runs on "${tier}" — write strong, standard or the таск's`);
      continue;
    }
    if (brief === '' || brief === '—') continue;
    if (!briefs.includes(brief)) {
      add(specFile, row.__line, `role "${role}" names ${brief}, which ${promptsDir} does not ship — name the brief it is handed, or — for a dispatch with none`);
      continue;
    }
    covered.add(brief);
    if (JUDGE_BRIEFS.includes(brief) && tier !== 'strong') {
      add(specFile, row.__line, `${brief} is a judge and role "${role}" runs it on ${tier} — a judge never runs below what it judges; write strong`);
    }
    if (tier === "the таск's" && !TIERED_BRIEFS.includes(brief)) {
      add(specFile, row.__line, `role "${role}" takes the таск's tier, but ${brief} builds no таск — only ${TIERED_BRIEFS.join(', ')} does; write strong or standard`);
    }
  }
  for (const brief of briefs) {
    if (!covered.has(brief)) {
      add(specFile, table.line, `${brief} ships in ${promptsDir} and no row of the tier table runs it — add its role and tier`);
    }
    if (![...JUDGE_BRIEFS, ...STANDARD_BRIEFS, ...TIERED_BRIEFS].includes(brief)) {
      add(path.join(promptsDir, brief), 0, `${brief} is in none of JUDGE_BRIEFS, STANDARD_BRIEFS or TIERED_BRIEFS — decide whether it judges, and list it`);
    }
  }
  log.info('tiers', 'model tiers checked', { rows: table.rows.length, briefs: briefs.length, violations: violations.length });
  return violations;
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

  for (const row of rows) {
    const withholdsPrior = row.withheld.includes(PRIOR_MEMORY_INPUT);
    log.debug('memory', 'reader checked for prior memory', { gate: row.gate, withholdsPrior });
    if (row.given.includes(PRIOR_MEMORY_INPUT)) {
      add('memory', specFile, row.line,
        `gate ${row.gate} gives its reader ${PRIOR_MEMORY_INPUT} — a blind reader never receives what earlier runs decided; move it to Withheld`);
    } else if (!withholdsPrior) {
      add('memory', specFile, row.line,
        `gate ${row.gate} does not withhold ${PRIOR_MEMORY_INPUT} — add it to the row's Withheld cell and to the brief's "${WITHHELD_HEADING}" table`);
    }
  }
  log.info('memory', 'prior memory withheld from every reader checked', { gates: rows.length });

  for (const row of rows) {
    const listed = CODEBASE_GIVEN_ROWS.includes(row.gate);
    const gives = row.given.includes(CODEBASE_INPUT);
    const withholds = row.withheld.includes(CODEBASE_INPUT);
    log.debug('codebase', 'reader checked for codebase.md', { gate: row.gate, gives, withholds });
    if (listed && !gives) {
      add('codebase', specFile, row.line,
        `gate ${row.gate} does not give its reader ${CODEBASE_INPUT} — it checks the plan's names against what the code already calls them; add it to the row's Given cell and to the brief's "${INPUT_HEADING}" table`);
    } else if (!listed && gives) {
      add('codebase', specFile, row.line,
        `gate ${row.gate} gives its reader ${CODEBASE_INPUT} — only ${CODEBASE_GIVEN_ROWS.join(', ')} may hold the прогон's reading of the code; move it to Withheld`);
    } else if (!listed && !withholds) {
      add('codebase', specFile, row.line,
        `gate ${row.gate} does not withhold ${CODEBASE_INPUT} — add it to the row's Withheld cell and to the brief's "${WITHHELD_HEADING}" table`);
    }
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

  // The briefs outside the table: two named ones, and every other brief, which
  // must not mention the file at all. A named brief that is absent is left to
  // the bundle check, which already refuses a hand-over link to a missing brief.
  const tableBriefs = new Set(rows.map(row => row.brief));
  const outside = [...present].filter(name => name.endsWith('.md') && !tableBriefs.has(name)).sort();
  for (const name of outside) {
    const briefPath = path.join(promptsDir, name);
    const brief = await readFile(briefPath, 'utf8');
    if (CODEBASE_HANDED.includes(name)) {
      const gives = openingOf(brief).includes(CODEBASE_INPUT);
      log.debug('codebase-briefs', 'brief checked for codebase.md', { brief: name, gives, withholds: false });
      if (!gives) {
        add('codebase-briefs', briefPath, 0,
          `the opening of ${name}, before its first "## " heading, does not name ${CODEBASE_INPUT} — this role is handed it and must be told so before it explores`);
      }
    } else if (CODEBASE_DENIED.includes(name)) {
      const withholds = notSeenParagraph(brief)?.includes(CODEBASE_INPUT) ?? false;
      log.debug('codebase-briefs', 'brief checked for codebase.md', { brief: name, gives: false, withholds });
      if (!withholds) {
        add('codebase-briefs', briefPath, 0,
          `the "${NOT_SEEN} …" paragraph of ${name} does not name ${CODEBASE_INPUT} — add it to what this role has not seen and must not ask for`);
      }
    } else if (brief.includes(CODEBASE_INPUT)) {
      log.debug('codebase-briefs', 'brief checked for codebase.md', { brief: name, gives: true, withholds: false });
      add('codebase-briefs', briefPath, 0,
        `${name} mentions ${CODEBASE_INPUT}, but it is neither in the ${specFile} reader table nor one of ${[...CODEBASE_HANDED, ...CODEBASE_DENIED].join(', ')} — remove the mention, or add the brief to the table with ${CODEBASE_INPUT} in its Withheld cell`);
    }
  }
  log.info('codebase', 'codebase.md handed only where the list allows', { rows: rows.length, briefs: outside.length });

  violations.push(...await checkModelTiers(specDir, bundleDir));

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
