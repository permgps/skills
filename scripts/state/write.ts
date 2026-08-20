// The only writer of the run state.
//
// Two properties matter here and nothing else does. The file is never written
// invalid, because the dashboard has no way to tell a malformed state from a
// strange run. And the file is never written partially, because a reader polling
// on an interval will eventually read exactly during the write.

import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createLogger } from '../shared/log.ts';
import type { RunState } from './contract.ts';
// A cycle on purpose, and a safe one: read.ts takes `STATE_FILE` and
// `InvalidStateError` from here, and both directions are used only inside
// function bodies, never at module evaluation. The alternative was a second
// copy of the unwrapping in this file, and the file format having two homes is
// the defect that copy would create.
import { parseStateSource } from './read.ts';
import { validateState, type StateViolation } from './validate.ts';

const log = createLogger('state');

/** The dashboard's only input, by name. */
export const STATE_FILE = 'state.js';

const HEADER = [
  '// Written by Maestro. Generated file — edit the run, not this.',
  '// Contract: docs/spec/state-contract.md',
].join('\n');

/**
 * A JS assignment rather than JSON: the dashboard opens from `file://`, where
 * `fetch` of a sibling file is blocked, and a script tag is not.
 */
export function serializeState(state: RunState): string {
  return `${HEADER}\nglobalThis.MAESTRO_STATE = ${JSON.stringify(state, null, 2)};\n`;
}

export class InvalidStateError extends Error {
  readonly violations: StateViolation[];

  constructor(violations: StateViolation[]) {
    const summary = violations.map(v => `${v.field}: ${v.message}`).join('; ');
    super(`refusing to write an invalid state — ${summary}`);
    this.name = 'InvalidStateError';
    this.violations = violations;
  }
}

/**
 * The write lost a race: the file moved between the caller's read and its write.
 *
 * It names all three things the caller needs to say something useful — the stamp
 * it was working from, the stamp it found, and whose token is on the прогон —
 * because *who* is the first thing a user asks, and a session that has to go
 * back to disk to answer will not bother.
 */
export class StaleStateError extends Error {
  readonly expected: string;
  readonly found: string | undefined;
  readonly heldBy: string | undefined;

  constructor(expected: string, found: string | undefined, heldBy: string | undefined) {
    const held = heldBy === undefined
      ? 'and carries no heldBy token'
      : `and is held by token ${JSON.stringify(heldBy)}`;
    super('refusing to write over a state that moved — this session last read updatedAt '
      + `${JSON.stringify(expected)}, the file carries ${JSON.stringify(found ?? null)} ${held}`);
    this.name = 'StaleStateError';
    this.expected = expected;
    this.found = found;
    this.heldBy = heldBy;
  }
}

/**
 * What the file on disk says about the last write, as far as it can be read.
 *
 * Both members are required and either may be `undefined`: `exactOptionalPropertyTypes`
 * is on, and "the file carries no stamp" is an answer this type has to be able
 * to give rather than a property it may omit.
 */
interface Stamp {
  updatedAt: string | undefined;
  token: string | undefined;
}

/**
 * Read the stamp and the holder off the target, or `null` when the file is
 * absent or says nothing readable.
 *
 * Deliberately not `readState`: a state that fails validation must still be
 * able to report the race. Refusing to answer because the file is malformed
 * would turn "somebody else wrote this" into "this file is broken", and those
 * are different sentences with different repairs.
 */
async function readStamp(target: string): Promise<Stamp | null> {
  let source: string;
  try {
    source = await readFile(target, 'utf8');
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = parseStateSource(source);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;

  const record = parsed as Record<string, unknown>;
  const updatedAt = typeof record['updatedAt'] === 'string' ? record['updatedAt'] : undefined;

  const holder = record['heldBy'];
  const token = typeof holder === 'object' && holder !== null && !Array.isArray(holder)
    && typeof (holder as Record<string, unknown>)['token'] === 'string'
      ? (holder as Record<string, unknown>)['token'] as string
      : undefined;

  return { updatedAt, token };
}

// Distinguishes concurrent writers within one process without a clock or a
// random number, both of which would make the temporary name untestable.
let sequence = 0;

export interface WriteResult {
  path: string;
  bytes: number;
}

/**
 * Validate, then replace `<dir>/state.js` atomically.
 *
 * The temporary file is created in the same directory as the target, because
 * `rename` is only atomic within one filesystem, and a temp directory is not
 * guaranteed to be on the same one.
 *
 * `expect` is the `updatedAt` the caller last read. Supplied, it makes the write
 * conditional: the file is re-read immediately before writing, and a stamp that
 * moved means a second writer got there first, so the write is refused instead
 * of laid over the top. This is the one place in this repository where the race
 * can be made impossible rather than merely visible, which is why it refuses
 * rather than warns.
 *
 * A file that cannot be read at all is refused on the same terms: `expect` is a
 * claim about what is on disk, and a file that cannot corroborate it is not a
 * file we may overwrite while claiming to know what it said. Writing anyway is
 * available — call without `expect` — and is then a deliberate act rather than
 * a default.
 */
export async function writeState(
  dir: string,
  state: RunState,
  expect?: string,
): Promise<WriteResult> {
  const violations = validateState(state);
  if (violations.length > 0) {
    log.error('write', 'state failed validation; nothing was written', {
      dir,
      violations: violations.length,
    });
    throw new InvalidStateError(violations);
  }

  const target = path.join(dir, STATE_FILE);

  if (expect !== undefined) {
    const found = await readStamp(target);
    if (found?.updatedAt !== expect) {
      log.error('write', 'the state moved since it was read; nothing was written', {
        target,
        expected: expect,
        found: found?.updatedAt ?? null,
        heldBy: found?.token ?? null,
      });
      throw new StaleStateError(expect, found?.updatedAt, found?.token);
    }
    log.debug('write', 'the state is where it was read', { target, updatedAt: expect });
  }

  const body = serializeState(state);
  const bytes = Buffer.byteLength(body, 'utf8');

  sequence += 1;
  const temporary = path.join(dir, `.${STATE_FILE}.${process.pid}.${sequence}.tmp`);

  log.debug('write', 'writing state', { target, bytes, temporary });
  try {
    await writeFile(temporary, body, 'utf8');
    await rename(temporary, target);
  } catch (error) {
    // A half-written temporary file left behind would be picked up by nothing,
    // but it would also never be cleaned up by anything.
    await unlink(temporary).catch(() => undefined);
    const reason = error instanceof Error ? error.message : String(error);
    log.error('write', 'state could not be written', { target, reason });
    throw error;
  }

  log.info('write', 'state written', { target, bytes });
  return { path: target, bytes };
}
