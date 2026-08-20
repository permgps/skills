// Reads back what write.ts produced.
//
// The file is JavaScript, not JSON, because the dashboard loads it through a
// script tag from file://. Reading it here means unwrapping that assignment —
// by text, never by evaluation. A state file is data written by an earlier run
// and possibly edited since; running it would make a corrupted state a code
// execution path.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { createLogger } from '../shared/log.ts';
import type { RunState } from './contract.ts';
import { STATE_FILE } from './paths.ts';
import { InvalidStateError, validateState } from './validate.ts';

const log = createLogger('state');

const ASSIGNMENT = 'globalThis.MAESTRO_STATE =';

export class UnreadableStateError extends Error {
  constructor(reason: string) {
    super(`state file could not be read: ${reason}`);
    this.name = 'UnreadableStateError';
  }
}

/** Pull the object literal out of the generated file and parse it as JSON. */
export function parseStateSource(source: string): unknown {
  const start = source.indexOf(ASSIGNMENT);
  if (start === -1) throw new UnreadableStateError(`no "${ASSIGNMENT}" assignment`);

  const body = source.slice(start + ASSIGNMENT.length).trim();
  const end = body.lastIndexOf('}');
  if (end === -1) throw new UnreadableStateError('assignment has no object literal');

  try {
    return JSON.parse(body.slice(0, end + 1));
  } catch (error) {
    throw new UnreadableStateError(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Read and validate `<dir>/state.js`, or the file itself if a file is given.
 * An invalid state throws rather than being handed on: every caller of this is
 * a gate, and a gate that ran against a malformed state proves nothing.
 */
export async function readState(target: string): Promise<RunState> {
  const file = target.endsWith('.js') ? target : path.join(target, STATE_FILE);
  log.debug('read', 'reading state', { file });

  const source = await readFile(file, 'utf8');
  const parsed = parseStateSource(source);

  const violations = validateState(parsed);
  if (violations.length > 0) throw new InvalidStateError(violations);

  log.debug('read', 'state read', { file, runId: (parsed as RunState).runId });
  return parsed as RunState;
}
