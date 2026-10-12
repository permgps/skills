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

export interface CommitLine {
  sha: string;
  /** The committer date, ISO 8601 with its offset, as git prints it. */
  date: string;
  subject: string;
}

export interface CommitsSince {
  state: 'listed' | 'unavailable';
  /**
   * `commit` when the recorded closure commit is an ancestor of `HEAD`;
   * `date` when it is not (a reset, a rebase, another branch) or none was
   * recorded, and the read falls back to the closure's moment.
   */
  basis?: 'commit' | 'date';
  /** What was read: `<sha>..HEAD`, or `--since=<moment>`. */
  range?: string;
  /** Newest first, merges excluded. */
  commits: CommitLine[];
  /** Every path those commits changed, unique and sorted. */
  paths: string[];
  /** Why the history could not be read; only on `unavailable`. */
  reason?: string;
}

const RECORD = '\x1e';
const FIELD = '\x1f';

/** One commit record of `log --name-only`: its fields, then the paths it touched. */
function parseLog(stdout: string): { commits: CommitLine[]; paths: string[] } {
  const commits: CommitLine[] = [];
  const paths = new Set<string>();
  for (const record of stdout.split(RECORD)) {
    const lines = record.split('\n');
    const fields = lines[0]!.split(FIELD);
    if (fields.length < 3) continue;
    commits.push({ sha: fields[0]!, date: fields[1]!, subject: fields.slice(2).join(FIELD) });
    for (const line of lines.slice(1)) if (line.trim() !== '') paths.add(line);
  }
  return { commits, paths: [...paths].sort() };
}

/**
 * The commits over code since the last closure. `since.commit` is what the
 * progress file's header recorded, `since.at` the closure's moment; `excluded`
 * are root-relative paths that are not code — `.maestro/` and the memory files,
 * so the memory block's own commit and the closing commit never count.
 */
export async function commitsSince(
  projectRoot: string,
  since: { commit: string | null; at: string },
  excluded: readonly string[],
  gitBinary = 'git',
): Promise<CommitsSince> {
  const head = await headCommit(projectRoot, gitBinary);
  if ('unavailable' in head) return { state: 'unavailable', commits: [], paths: [], reason: head.unavailable };
  let basis: 'commit' | 'date' = 'date';
  if (since.commit !== null) {
    const ancestor = await runGit(projectRoot, ['merge-base', '--is-ancestor', since.commit, 'HEAD'], gitBinary);
    if (!('unavailable' in ancestor)) basis = 'commit';
    log.debug('basis', 'closure commit against HEAD', { commit: since.commit, ancestor: basis === 'commit' });
  }
  const range = basis === 'commit' ? `${since.commit}..HEAD` : `--since=${since.at}`;
  const pathspec = ['--', '.', ...excluded.map(entry => `:(exclude)${entry}`)];
  // quotePath off: a path git would octal-escape is named to the reader as it is on disk.
  const outcome = await runGit(projectRoot, [
    '-c', 'core.quotePath=false', 'log', '--no-merges', '--name-only', `--format=${RECORD}%H${FIELD}%cI${FIELD}%s`,
    ...(basis === 'commit' ? [range] : [range, 'HEAD']), ...pathspec,
  ], gitBinary);
  if ('unavailable' in outcome) return { state: 'unavailable', basis, range, commits: [], paths: [], reason: outcome.unavailable };
  const { commits, paths } = parseLog(outcome.stdout);
  log.info('since', 'commits since the last closure read', { basis, commits: commits.length, paths: paths.length });
  return { state: 'listed', basis, range, commits, paths };
}

/** `HEAD` at this moment, or why it cannot be named. */
export async function headCommit(projectRoot: string, gitBinary = 'git'): Promise<{ sha: string } | { unavailable: string }> {
  const outcome = await runGit(projectRoot, ['rev-parse', '--verify', 'HEAD'], gitBinary);
  if ('unavailable' in outcome) return { unavailable: outcome.unavailable };
  const sha = outcome.stdout.trim();
  if (!/^[0-9a-f]{7,64}$/.test(sha)) return { unavailable: 'git rev-parse HEAD named no commit' };
  return { sha };
}
