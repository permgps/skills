// The run register: `.maestro/README.md`, one row per contract-7 run.
//
// The register is a projection of published state and has no other input. A
// row written by a phase from memory would be a second account of where a run
// is and whether it landed, and the two would differ exactly when a closure or
// a relocation went wrong. So publication rewrites the run's row after every
// successful contract-7 publish, and only between the owned markers: the rest
// of the file is the user's, kept byte for byte by the shared splice.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { createLogger } from './shared/log.mts';
import { findOwnedBlock, spliceOwnedBlock, type Markers } from './shared/owned-block.mts';
import type { RunState } from './state/contract.mts';
import { parseRunDir } from './state/paths.mts';
import { atomicText } from './state/write.mts';

const log = createLogger('register');

/** The register's name inside `.maestro/`. */
export const REGISTER_FILE = 'README.md';

export const REGISTER_MARKERS: Markers = {
  begin: '<!-- maestro:runs:begin -->',
  end: '<!-- maestro:runs:end -->',
};

const HEADER = `# Maestro Runs

One row per run written under contract 7 or later: the day it started, its
directory, whether it is still in progress, and how it closed. A directory
ending in \`--wip\` is a run still in progress. Runs from before contract 7
keep their own directories here and have no row.

Maestro rewrites only the table between the markers below. Anything else in
this file is yours and is never touched.
`;

const TABLE_HEAD = '| Started | Run | Status | Finished |\n|---|---|---|---|';

/** A run id that can sit inside an HTML comment without ending it. */
const ROW_ID = /^[A-Za-z0-9._:]+(?:-[A-Za-z0-9._:]+)*$/;
const ROW_KEY = /<!-- run:([^ ]+) -->/;

/** A register write that could not be made from this state. */
export class RegisterRowError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = 'RegisterRowError';
    this.field = field;
  }
}

/** What a reader of the register sees in the Status column. */
export function registerStatus(state: Pick<RunState, 'lifecycle' | 'outcome'>): string {
  if (state.lifecycle !== 'closed') return 'in progress';
  switch (state.outcome) {
    case 'completed': return 'completed';
    case 'closed_with_exceptions': return 'closed with exceptions';
    case 'stopped_incomplete': return 'stopped incomplete';
    default: return 'closed';
  }
}

/** The run's one row, keyed by its runId in a comment the table does not render. */
export function renderRegisterRow(state: RunState): string {
  if (!ROW_ID.test(state.runId)) {
    throw new RegisterRowError('runId', 'runId cannot key a register row — use letters, digits, . _ : and single dashes');
  }
  const dir = state.dir ?? '';
  const parsed = parseRunDir(dir);
  if (!parsed) throw new RegisterRowError('dir', `dir "${dir}" is not a contract-7 run directory`);
  const finished = state.lifecycle === 'closed' && state.finishedAt ? state.finishedAt.slice(0, 10) : '—';
  return `| ${parsed.date} | [${dir}](${dir}/) | ${registerStatus(state)} | ${finished} <!-- run:${state.runId} --> |`;
}

export interface RegisterResult {
  path: string;
  action: 'created' | 'replaced' | 'appended';
  status: string;
}

/**
 * Rewrite the run's row in `<runRoot>/README.md`, creating the file when it is
 * missing. A row is found by runId, so a relocated run rewrites its own row in
 * place rather than gaining a second one under its new name.
 */
export async function upsertRegister(runRoot: string, state: RunState): Promise<RegisterResult> {
  const target = path.join(runRoot, REGISTER_FILE);
  const row = renderRegisterRow(state);

  let existing: string | null = null;
  try { existing = await readFile(target, 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const text = existing ?? HEADER;
  const block = findOwnedBlock(text, REGISTER_MARKERS);
  const rows = (block?.body.split('\n') ?? []).filter(line => ROW_KEY.test(line));
  const index = rows.findIndex(line => ROW_KEY.exec(line)?.[1] === state.runId);
  const action: RegisterResult['action'] = existing === null ? 'created' : index >= 0 ? 'replaced' : 'appended';
  if (index >= 0) rows[index] = row; else rows.push(row);

  log.debug('upsert', 'register row rendered', { runId: state.runId, dir: state.dir, rows: rows.length, action });
  await atomicText(target, spliceOwnedBlock(text, `${TABLE_HEAD}\n${rows.join('\n')}`, REGISTER_MARKERS));
  const status = registerStatus(state);
  log.info('upsert', 'register row written', { runId: state.runId, dir: state.dir, status, action });
  return { path: target, action, status };
}
