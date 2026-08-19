#!/usr/bin/env node
// Sweeps a directory for credentials that reached a file.
//
// This is the second half of the redaction gate. The first half runs at ingest,
// before user text ever touches disk; this one runs before the first commit of a
// прогон, over everything written since. It reports and it does not rewrite:
// a secret found in an already-written file is rule S2 in docs/spec/safety.md, a
// stop condition with rotation advice, and a script that quietly fixed the file
// would remove the evidence that the rule was triggered at all.

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createLogger } from '../shared/log.ts';
import { formatViolation, type Violation } from '../shared/violation.ts';
import { redact } from './redact.ts';

export type { Violation };

const log = createLogger('redact-scan');

/** Never worth reading, and never the user's own text. */
export const DEFAULT_IGNORED = ['.git', 'node_modules', '.venv', 'dist', 'build'];

/** How much of a file is inspected before deciding it is not text. */
const SNIFF_BYTES = 8192;

const PLACEHOLDER = /\[REDACTED:([A-Z0-9_]+)\]/g;

/**
 * A NUL byte inside the first few kilobytes means binary.
 *
 * Guessing by extension would be faster and wrong the moment somebody stores a
 * `.md` that is actually a PNG, or a secret in a file with no extension at all.
 */
export function looksBinary(buffer: Buffer): boolean {
  return buffer.subarray(0, SNIFF_BYTES).includes(0);
}

export interface ScanOptions {
  ignored?: string[];
}

export interface ScanSummary {
  violations: Violation[];
  filesScanned: number;
  filesSkipped: number;
}

/** Findings for one already-read text, anchored to the lines they sit on. */
export function scanText(file: string, content: string): Violation[] {
  const { text, names } = redact(content);
  if (names.length === 0) return [];

  const violations: Violation[] = [];
  text.split('\n').forEach((line, index) => {
    const found = [...line.matchAll(PLACEHOLDER)].map(match => match[1] ?? '');
    if (found.length === 0) return;
    violations.push({
      check: 'secret',
      file,
      line: index + 1,
      message: `credential found in a written file: ${[...new Set(found)].join(', ')}`,
    });
  });
  return violations;
}

export async function scanDirectory(root: string, options: ScanOptions = {}): Promise<ScanSummary> {
  const ignored = new Set(options.ignored ?? DEFAULT_IGNORED);
  const violations: Violation[] = [];
  let filesScanned = 0;
  let filesSkipped = 0;

  const walk = async (relative: string): Promise<void> => {
    const entries = await readdir(path.join(root, relative), { withFileTypes: true });

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const child = relative === '' ? entry.name : path.join(relative, entry.name);

      if (ignored.has(entry.name)) {
        filesSkipped += 1;
        log.debug('scan', 'skipped', { file: child, reason: 'ignored name' });
        continue;
      }
      if (entry.isSymbolicLink()) {
        filesSkipped += 1;
        log.debug('scan', 'skipped', { file: child, reason: 'symlink' });
        continue;
      }
      if (entry.isDirectory()) {
        await walk(child);
        continue;
      }
      if (!entry.isFile()) {
        filesSkipped += 1;
        log.debug('scan', 'skipped', { file: child, reason: 'not a regular file' });
        continue;
      }

      const buffer = await readFile(path.join(root, child));
      if (looksBinary(buffer)) {
        filesSkipped += 1;
        log.debug('scan', 'skipped', { file: child, reason: 'binary' });
        continue;
      }

      filesScanned += 1;
      const found = scanText(child, buffer.toString('utf8'));
      for (const violation of found) {
        violations.push(violation);
        log.error(violation.check, violation.message, {
          file: violation.file,
          line: violation.line,
        });
      }
    }
  };

  const info = await stat(root);
  if (info.isFile()) {
    const buffer = await readFile(root);
    if (looksBinary(buffer)) filesSkipped += 1;
    else {
      filesScanned += 1;
      violations.push(...scanText(path.basename(root), buffer.toString('utf8')));
    }
  } else {
    await walk('');
  }

  log.info('scan', 'sweep finished', {
    root,
    filesScanned,
    filesSkipped,
    findings: violations.length,
  });
  return { violations, filesScanned, filesSkipped };
}

async function main(): Promise<number> {
  const root = process.argv[2] ?? '.maestro';
  log.info('run', 'sweeping for credentials', { root });

  let summary: ScanSummary;
  try {
    summary = await scanDirectory(root);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.error('run', 'directory could not be read', { root, reason });
    process.stdout.write(`redact-scan: cannot read ${root}\n`);
    return 2;
  }

  if (summary.violations.length === 0) {
    process.stdout.write(`redact-scan: OK (${summary.filesScanned} files)\n`);
    return 0;
  }

  for (const violation of summary.violations) process.stdout.write(formatViolation(violation));
  process.stdout.write(
    `redact-scan: ${summary.violations.length} finding(s). `
    + 'This is safety rule S2: stop, report the variable names, advise rotation. '
    + 'Do not edit the files to hide it.\n',
  );
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}
