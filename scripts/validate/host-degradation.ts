#!/usr/bin/env node
// Keeps a host capability's two halves in the two places a прогон actually
// passes through.
//
// docs/spec/hosts.md says which capabilities degrade rather than stop. That
// document is the authority, and it is also the one thing a прогон never reads:
// the skill reads phases/, and references/hosts.md only when the host is not
// the one v1 was written against. The first end-to-end run found the gap that
// arrangement leaves — worktree isolation was assumed present because of the
// host's name, and when it turned out to be missing, no file on the path the
// прогон was walking said what a wave should do about it.
//
// So each degrading capability owes two markers: it is established by trying it
// in preflight, and its consequence is written into the phase that applies it.
// A capability the specification calls a stop condition may not carry a
// degradation marker at all — degrading where the spec says stop is the same
// defect pointing the other way.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createLogger } from '../shared/log.ts';
import { formatViolation, type Violation } from '../shared/violation.ts';
import { parseTables, type Table } from './spec-integrity.ts';

export type { Violation };

const log = createLogger('host-degradation');

const PHASES_DIR = 'phases';
/** Where a capability is established. Trying it is preflight's job, always. */
const PREFLIGHT_FILE = '0-preflight.md';
/** The bundle's own account of what each missing capability costs. */
const REFERENCE_FILE = path.join('references', 'hosts.md');
/** A reference row that carries no capability of the specification's. */
const NO_CAPABILITY = '—';

const MARKER = /<!--\s*maestro:(probes|degrades):([a-z0-9-]+)\s*-->/g;

/** `worktree isolation` and `Worktree Isolation` are the same capability. */
export const slugify = (capability: string): string =>
  capability
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export interface Marker {
  kind: 'probes' | 'degrades';
  slug: string;
  file: string;
  line: number;
}

/** Every capability marker in one file, in source order. */
export function findMarkers(markdown: string, file: string): Marker[] {
  const markers: Marker[] = [];

  markdown.split('\n').forEach((text, index) => {
    for (const match of text.matchAll(MARKER)) {
      markers.push({
        kind: match[1] as 'probes' | 'degrades',
        slug: match[2] ?? '',
        file,
        line: index + 1,
      });
    }
  });

  return markers;
}

const findTable = (tables: Table[], required: string[]): Table | undefined =>
  tables.find(table => required.every(column => table.columns.includes(column)));

const clean = (value: string | number | undefined): string =>
  String(value ?? '').replace(/`/g, '').replace(/\*/g, '').trim();

export interface CheckOptions {
  specDir?: string;
  bundleDir?: string;
}

/**
 * True when a cost row says the прогон stops rather than narrows.
 *
 * The word has to open the cell, which is the form the reference already uses
 * — `**stop.** There is nowhere to build`. Reading it anywhere in the sentence
 * looked more forgiving and was worse: the dashboard row ends «and stop
 * promising a live one», which is advice about wording, not a stop condition.
 */
export const readsAsStop = (cost: string): boolean => /^\**\s*stops?\b/i.test(cost.trim());

export async function checkHostDegradation(options: CheckOptions = {}): Promise<Violation[]> {
  const specDir = options.specDir ?? 'docs/spec';
  const bundleDir = options.bundleDir ?? 'skills/maestro';
  const specFile = path.join(specDir, 'hosts.md');

  const violations: Violation[] = [];
  const add = (check: string, file: string, line: number, message: string): void => {
    violations.push({ check, file, line, message });
    log.error(check, message, { file, line });
  };

  const table = findTable(parseTables(await readFile(specFile, 'utf8')), [
    'Capability',
    'Degrades',
  ]);
  if (!table) {
    add('capabilities', specFile, 0, 'no table with columns Capability and Degrades');
    return violations;
  }

  const degrading = new Map<string, { capability: string; line: number }>();
  // `degrades: null` is a row whose own column could not be read. It stays in
  // the known set so its markers are not also reported as naming nothing — one
  // defect, one finding — and out of every check that needs the answer.
  const known = new Map<string, { capability: string; line: number; degrades: boolean | null }>();

  for (const row of table.rows) {
    const capability = clean(row['Capability']);
    const degrades = clean(row['Degrades']).toLowerCase();
    if (capability === '') continue;

    const slug = slugify(capability);
    if (degrades !== 'yes' && degrades !== 'no') {
      add('capabilities', specFile, row.__line,
        `capability "${capability}" declares Degrades "${clean(row['Degrades'])}"; expected yes or no`);
      known.set(slug, { capability, line: row.__line, degrades: null });
      continue;
    }

    known.set(slug, { capability, line: row.__line, degrades: degrades === 'yes' });
    if (degrades === 'yes') degrading.set(slug, { capability, line: row.__line });
  }
  log.info('capabilities', 'capabilities read', {
    total: known.size,
    degrading: degrading.size,
  });

  const phasesDir = path.join(bundleDir, PHASES_DIR);
  const markers: Marker[] = [];
  for (const name of (await readdir(phasesDir)).filter(n => n.endsWith('.md')).sort()) {
    markers.push(...findMarkers(await readFile(path.join(phasesDir, name), 'utf8'), name));
  }
  log.debug('markers', 'markers scanned', { files: phasesDir, found: markers.length });

  // --- a marker names a capability the specification defines ---------------
  for (const marker of markers) {
    if (!known.has(marker.slug)) {
      add('markers', path.join(phasesDir, marker.file), marker.line,
        `marker names "${marker.slug}", which is no capability in ${specFile}`);
    }
  }

  // --- probing is preflight's job -----------------------------------------
  for (const marker of markers) {
    if (marker.kind === 'probes' && marker.file !== PREFLIGHT_FILE) {
      add('markers', path.join(phasesDir, marker.file), marker.line,
        `"${marker.slug}" is probed here; a capability is established in ${PREFLIGHT_FILE} and nowhere else`);
    }
  }

  // --- every degrading capability is established and has a consequence -----
  for (const [slug, { capability, line }] of degrading) {
    const probed = markers.some(m => m.kind === 'probes' && m.slug === slug);
    const applied = markers.filter(m => m.kind === 'degrades' && m.slug === slug);

    if (!probed) {
      add('probes', specFile, line,
        `"${capability}" degrades, but no phase file establishes it: ${PREFLIGHT_FILE} carries no <!-- maestro:probes:${slug} -->`);
    }
    if (applied.length === 0) {
      add('degradations', specFile, line,
        `"${capability}" degrades, but no phase file says what that costs: no <!-- maestro:degrades:${slug} --> under ${phasesDir}`);
    }
  }

  // --- a stop condition does not degrade -----------------------------------
  for (const marker of markers) {
    const capability = known.get(marker.slug);
    if (marker.kind !== 'degrades' || capability === undefined || capability.degrades !== false) continue;
    add('degradations', path.join(phasesDir, marker.file), marker.line,
      `"${capability.capability}" is a stop condition in ${specFile}; a phase may not degrade around it`);
  }

  log.info('markers', 'markers checked', { markers: markers.length });

  // --- the reference the bundle carries says the same thing ----------------
  // The reference is what a прогон on another host reads instead of the
  // specification, so a cost that exists in one and not the other is a run
  // that degrades differently depending on where it happens to be running.
  const referenceFile = path.join(bundleDir, REFERENCE_FILE);
  const costs = findTable(parseTables(await readFile(referenceFile, 'utf8')), [
    'Missing',
    'Capability',
    'What changes',
  ]);
  if (!costs) {
    add('reference', referenceFile, 0,
      'no table with columns Missing, Capability and What changes');
    return violations;
  }

  const covered = new Map<string, number>();
  for (const row of costs.rows) {
    const named = clean(row['Capability']);
    if (named === '' || named === NO_CAPABILITY) continue;

    const slug = slugify(named);
    const capability = known.get(slug);
    if (capability === undefined) {
      add('reference', referenceFile, row.__line,
        `cost row names "${named}", which is no capability in ${specFile}`);
      continue;
    }

    const first = covered.get(slug);
    if (first !== undefined) {
      add('reference', referenceFile, row.__line,
        `"${capability.capability}" already has a cost row at line ${first}`);
      continue;
    }
    covered.set(slug, row.__line);

    // A row that says stop where the specification says narrow — or the other
    // way round — is the same defect as a degradation marker on a stop
    // condition, arrived at from the reference side.
    const stops = readsAsStop(clean(row['What changes']));
    if (capability.degrades === true && stops) {
      add('reference', referenceFile, row.__line,
        `"${capability.capability}" narrows the wave in ${specFile}; this row stops the прогон`);
    } else if (capability.degrades === false && !stops) {
      add('reference', referenceFile, row.__line,
        `"${capability.capability}" is a stop condition in ${specFile}; this row does not say so`);
    }
  }

  for (const [slug, { capability, line }] of degrading) {
    if (!covered.has(slug)) {
      add('reference', specFile, line,
        `"${capability}" degrades, and ${referenceFile} has no cost row for it`);
    }
  }
  log.info('reference', 'cost rows checked', { rows: costs.rows.length });

  return violations;
}

async function main(): Promise<number> {
  const specDir = process.argv[2] ?? 'docs/spec';
  const bundleDir = process.argv[3] ?? 'skills/maestro';
  log.info('run', 'checking host degradation', { specDir, bundleDir });

  let violations: Violation[];
  try {
    violations = await checkHostDegradation({ specDir, bundleDir });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.error('run', 'inputs could not be read', { specDir, bundleDir, reason });
    process.stdout.write(`host-degradation: cannot read ${specDir} or ${bundleDir}\n`);
    return 2;
  }

  if (violations.length === 0) {
    process.stdout.write('host-degradation: OK\n');
    return 0;
  }

  for (const violation of violations) {
    process.stdout.write(formatViolation(violation));
  }
  process.stdout.write(`host-degradation: ${violations.length} violation(s)\n`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}
