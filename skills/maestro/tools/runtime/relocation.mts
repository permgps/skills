// Moving a run directory when its name changes: `--wip` off at closure, back on
// at an explicit reopening.
//
// Publication is the only caller, and the only moment a move is allowed: the
// state that names the new directory and the directory itself must change
// together, and publication is where a rejected state can still put the folder
// back. A phase that renamed the folder on its own would leave the published
// state pointing at a directory that no longer exists for as long as the next
// publish took — exactly the window in which a dashboard or a resume reads it.
//
// The move is `git mv` when the folder holds tracked files, so history follows
// the run; otherwise a plain rename, because a run whose record was never
// committed has no history to carry, and a project without git still has runs.

import { execFile } from 'node:child_process';
import { lstat, rename, stat } from 'node:fs/promises';
import path from 'node:path';

import { createLogger } from './shared/log.mts';

const log = createLogger('relocation');

export type RelocationMethod = 'git' | 'rename';

export interface Relocation {
  from: string;
  to: string;
  method: RelocationMethod;
}

/** The directory a published state names is not on disk; nothing was moved. */
export class RelocationSourceMissingError extends Error {
  readonly from: string;
  readonly to: string;

  constructor(from: string, to: string) {
    super(`run directory .maestro/${from} is missing, so it cannot become .maestro/${to}`);
    this.name = 'RelocationSourceMissingError';
    this.from = from;
    this.to = to;
  }
}

/** Something already sits where the run would move to; nothing was moved. */
export class RelocationTargetExistsError extends Error {
  readonly from: string;
  readonly to: string;

  constructor(from: string, to: string) {
    super(`.maestro/${to} already exists, so .maestro/${from} cannot be renamed to it`);
    this.name = 'RelocationTargetExistsError';
    this.from = from;
    this.to = to;
  }
}

/** Run git without a shell; the exit status is the only thing read from it. */
function git(project: string, args: string[]): Promise<boolean> {
  return new Promise(resolve => {
    execFile('git', ['-C', project, ...args], { windowsHide: true }, error => resolve(error === null));
  });
}

const exists = async (file: string): Promise<boolean> => {
  try { await lstat(file); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
};

/** Whether git tracks any file under the folder; false without git or a repository. */
async function tracked(project: string, relative: string): Promise<boolean> {
  return git(project, ['ls-files', '--error-unmatch', '--', relative]);
}

async function move(project: string, runRoot: string, from: string, to: string, method: RelocationMethod): Promise<void> {
  const source = path.join(runRoot, from);
  const target = path.join(runRoot, to);
  if (method === 'git') {
    const ok = await git(project, ['mv', '--', path.relative(project, source), path.relative(project, target)]);
    if (!ok) throw new Error(`git mv could not rename .maestro/${from} to .maestro/${to}`);
    return;
  }
  await rename(source, target);
}

/**
 * Rename `<runRoot>/<from>` to `<runRoot>/<to>`. Refuses a missing source or an
 * existing target before touching anything, so a refusal never leaves half a
 * move behind.
 */
export async function relocateRunDir(project: string, runRoot: string, from: string, to: string,
  runId: string): Promise<Relocation> {
  const source = path.join(runRoot, from);
  const target = path.join(runRoot, to);
  log.debug('plan', 'relocation requested', { runId, from, to });
  try {
    if (!(await stat(source)).isDirectory()) throw new RelocationSourceMissingError(from, to);
  } catch (error) {
    if (error instanceof RelocationSourceMissingError) throw error;
    throw new RelocationSourceMissingError(from, to);
  }
  if (await exists(target)) throw new RelocationTargetExistsError(from, to);
  const method: RelocationMethod = await tracked(project, path.relative(project, source)) ? 'git' : 'rename';
  log.debug('method', 'relocation method chosen', { runId, from, to, method });
  await move(project, runRoot, from, to, method);
  log.info('done', 'run directory relocated', { runId, from, to, method });
  return { from, to, method };
}

/** Undo a relocation by the method that made it, after the publish it served was refused. */
export async function restoreRunDir(project: string, runRoot: string, relocation: Relocation,
  runId: string): Promise<void> {
  await move(project, runRoot, relocation.to, relocation.from, relocation.method);
  log.info('restore', 'run directory moved back', { runId, from: relocation.to, to: relocation.from, method: relocation.method });
}
