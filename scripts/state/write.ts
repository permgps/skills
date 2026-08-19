// The only writer of the run state.
//
// Two properties matter here and nothing else does. The file is never written
// invalid, because the dashboard has no way to tell a malformed state from a
// strange run. And the file is never written partially, because a reader polling
// on an interval will eventually read exactly during the write.

import { rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createLogger } from '../shared/log.ts';
import type { RunState } from './contract.ts';
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
 */
export async function writeState(dir: string, state: RunState): Promise<WriteResult> {
  const violations = validateState(state);
  if (violations.length > 0) {
    log.error('write', 'state failed validation; nothing was written', {
      dir,
      violations: violations.length,
    });
    throw new InvalidStateError(violations);
  }

  const target = path.join(dir, STATE_FILE);
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
