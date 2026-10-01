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
import {
  findOwnedBlock, renderOwnedBlock, spliceOwnedBlock, type Block, type Markers,
} from '../../skills/maestro/tools/runtime/shared/owned-block.mts';

// The splice itself is shared with the run register; this module keeps the
// memory file's name, its markers and its writer.
export { MarkerError, type Block } from '../../skills/maestro/tools/runtime/shared/owned-block.mts';

const log = createLogger('memory');

/** The project memory file, by name. Not under `.maestro/` — it is the project's. */
export const MEMORY_FILE = 'AGENTS.md';

export const BEGIN_MARKER = '<!-- maestro:begin -->';
export const END_MARKER = '<!-- maestro:end -->';

const MARKERS: Markers = { begin: BEGIN_MARKER, end: END_MARKER };

/**
 * Locate the owned region, or `null` when the file has none. Zero or exactly one
 * well-formed pair; anything else is a {@link MarkerError}.
 */
export const findBlock = (text: string): Block | null => findOwnedBlock(text, MARKERS);

/** The owned region as it is written: the two markers with the body between them. */
export const renderBlock = (body: string): string => renderOwnedBlock(body, MARKERS);

/**
 * Replace the owned region, or append one when the file has none. Everything
 * outside the markers is returned unchanged; the result ends in one newline.
 */
export const spliceBlock = (text: string, body: string): string => spliceOwnedBlock(text, body, MARKERS);

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
