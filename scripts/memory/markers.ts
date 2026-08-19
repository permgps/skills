// The project memory file, and the one region of it a прогон owns.
//
// Every other rule in this repository fails visibly when it is broken. This one
// fails by overwriting a file the прогон does not own, so it is code with tests
// rather than a paragraph a phase file re-derives correctly each time.
//
// Contract: docs/spec/phases.md, section "Memory".

import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createLogger } from '../shared/log.ts';

const log = createLogger('memory');

/** The project memory file, by name. Not under `.maestro/` — it is the project's. */
export const MEMORY_FILE = 'AGENTS.md';

export const BEGIN_MARKER = '<!-- maestro:begin -->';
export const END_MARKER = '<!-- maestro:end -->';

/**
 * A marker is a line, not a substring.
 *
 * The alternative — matching anywhere on a line — would let a sentence *about*
 * the markers become one, and the file most likely to contain such a sentence
 * is the memory file itself.
 */
const isMarker = (line: string, marker: string): boolean => line.trim() === marker;

/** The owned region, with 1-based line numbers for the two marker lines. */
export interface Block {
  start: number;
  end: number;
  body: string;
}

/** The markers are malformed. Always a defect in the file, never a configuration. */
export class MarkerError extends Error {
  readonly lines: number[];

  constructor(message: string, lines: number[]) {
    super(lines.length === 0 ? message : `${message} (line${lines.length > 1 ? 's' : ''} ${lines.join(', ')})`);
    this.name = 'MarkerError';
    this.lines = lines;
  }
}

/**
 * Locate the owned region, or `null` when the file has none.
 *
 * Anything other than exactly zero or exactly one well-formed pair is an error.
 * Guessing which pair was meant is how a splice ends up deleting the text
 * between two of them.
 */
export function findBlock(text: string): Block | null {
  const lines = text.split('\n');
  const begins: number[] = [];
  const ends: number[] = [];

  lines.forEach((line, index) => {
    if (isMarker(line, BEGIN_MARKER)) begins.push(index + 1);
    if (isMarker(line, END_MARKER)) ends.push(index + 1);
  });

  if (begins.length === 0 && ends.length === 0) return null;
  if (begins.length > 1) throw new MarkerError('more than one begin marker', begins);
  if (ends.length > 1) throw new MarkerError('more than one end marker', ends);
  if (begins.length === 0) throw new MarkerError('end marker with no begin marker', ends);
  if (ends.length === 0) throw new MarkerError('begin marker with no end marker', begins);

  const start = begins[0] ?? 0;
  const end = ends[0] ?? 0;
  if (end < start) throw new MarkerError('end marker precedes begin marker', [start, end]);

  return { start, end, body: lines.slice(start, end - 1).join('\n') };
}

/** The owned region as it is written: the two markers with the body between them. */
export function renderBlock(body: string): string {
  const trimmed = body.replace(/^\n+|\n+$/g, '');
  return trimmed === ''
    ? `${BEGIN_MARKER}\n${END_MARKER}`
    : `${BEGIN_MARKER}\n${trimmed}\n${END_MARKER}`;
}

/**
 * Replace the owned region, or append one when the file has none.
 *
 * Everything before the begin marker and after the end marker is returned
 * unchanged, with one deliberate exception: the result ends with exactly one
 * newline. That is the only byte this function decides on its own, and it is
 * decided at the end of the file, where nothing the user wrote lives.
 */
export function spliceBlock(text: string, body: string): string {
  if (body.includes(BEGIN_MARKER) || body.includes(END_MARKER)) {
    throw new MarkerError('the body carries a marker of its own', []);
  }

  const block = renderBlock(body);
  const found = findBlock(text);

  if (found === null) {
    const head = text.replace(/\n+$/, '');
    return head === '' ? `${block}\n` : `${head}\n\n${block}\n`;
  }

  const lines = text.split('\n');
  const before = lines.slice(0, found.start - 1);
  const after = lines.slice(found.end);
  const merged = [...before, ...block.split('\n'), ...after].join('\n');
  return `${merged.replace(/\n+$/, '')}\n`;
}

export interface WriteResult {
  path: string;
  bytes: number;
  hadBlock: boolean;
  created: boolean;
}

/**
 * Write the owned region into `<dir>/AGENTS.md`, creating the file if it is
 * absent.
 *
 * Written through a temporary file and a rename, for the reason the run state
 * is: a reader that opens the file during the write must never see half of it.
 * Here the reader is a person or the next agent, and half a memory file reads
 * like a truncated instruction rather than like a failure.
 */
export async function writeMemoryBlock(dir: string, body: string): Promise<WriteResult> {
  const target = path.join(dir, MEMORY_FILE);

  let existing = '';
  let created = false;
  try {
    existing = await readFile(target, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw error;
    created = true;
    log.warn('write', 'no memory file yet; creating it', { target });
  }

  const hadBlock = existing !== '' && findBlock(existing) !== null;
  const next = spliceBlock(existing, body);
  const bytes = Buffer.byteLength(next, 'utf8');

  const temporary = path.join(dir, `.${MEMORY_FILE}.${process.pid}.tmp`);
  log.debug('write', 'writing memory block', { target, bytes, hadBlock, temporary });
  try {
    await writeFile(temporary, next, 'utf8');
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    const reason = error instanceof Error ? error.message : String(error);
    log.error('write', 'memory block could not be written', { target, reason });
    throw error;
  }

  log.info('write', 'memory block written', { target, bytes, hadBlock, created });
  return { path: target, bytes, hadBlock, created };
}
