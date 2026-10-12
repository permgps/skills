// The project's git history, read with bounds and never trusted to be there.
//
// Every git call in the runtime that reads output lives here. The other two —
// `ls-files` in existing-code.mts and `mv` in relocation.mts — read nothing back
// or stop at the first line. These read whole answers, so each runs under a
// timeout and a buffer limit (decision D7): a hung credential helper or a
// history of a million commits must cost a run ten seconds, not the run. A
// spawn error, a non-zero exit, a timeout and an overflow all come back as
// `unavailable` with a reason. Nothing here throws, and no прогон stops on its
// history.
//
// Contract: docs/spec/phases.md, section "Memory".

import { execFile } from 'node:child_process';

import { createLogger } from './shared/log.mts';

const log = createLogger('history');

/** How long one git call may run. */
export const GIT_TIMEOUT_MS = 10_000;

/** How much one git call may print before it is treated as unavailable. */
export const GIT_MAX_BUFFER = 4 * 1024 * 1024;

type GitOutcome = { stdout: string; exit: 0 } | { unavailable: string; exit: number | null };

/** One bounded git call. The log carries the arguments and the exit, never the output. */
export function runGit(projectRoot: string, args: readonly string[], gitBinary = 'git'): Promise<GitOutcome> {
  const started = Date.now();
  return new Promise(resolve => {
    execFile(gitBinary, ['-C', projectRoot, ...args],
      { timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_MAX_BUFFER, windowsHide: true, encoding: 'utf8' },
      (error, stdout) => {
        const ms = Date.now() - started;
        if (!error) {
          log.debug('git', 'git call finished', { args, exit: 0, ms });
          resolve({ stdout, exit: 0 });
          return;
        }
        const failure = error as NodeJS.ErrnoException & { code?: string | number; killed?: boolean; signal?: string };
        const exit = typeof failure.code === 'number' ? failure.code : null;
        const reason = failure.code === 'ENOENT' ? 'git could not be started: ENOENT'
          : failure.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' ? `git printed more than ${GIT_MAX_BUFFER} bytes`
            : failure.killed ? `git did not answer within ${GIT_TIMEOUT_MS / 1000}s`
              : exit !== null ? `git exited ${exit}` : `git failed: ${String(failure.code ?? failure.message)}`;
        log.debug('git', 'git call unavailable', { args, exit, ms, reason });
        resolve({ unavailable: reason, exit });
      });
  });
}

/** `HEAD` at this moment, or why it cannot be named. */
export async function headCommit(projectRoot: string, gitBinary = 'git'): Promise<{ sha: string } | { unavailable: string }> {
  const outcome = await runGit(projectRoot, ['rev-parse', '--verify', 'HEAD'], gitBinary);
  if ('unavailable' in outcome) return { unavailable: outcome.unavailable };
  const sha = outcome.stdout.trim();
  if (!/^[0-9a-f]{7,64}$/.test(sha)) return { unavailable: 'git rev-parse HEAD named no commit' };
  return { sha };
}
