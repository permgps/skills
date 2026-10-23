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
// These calls also answer the resume check: whether each commit a таск recorded
// is still on `HEAD`'s history (`commits-check.mts`).
//
// Contract: docs/spec/phases.md, sections "Memory" and "Recovery".

import { execFile } from 'node:child_process';

import { createLogger } from './shared/log.mts';
import { WIP_SUFFIX } from './state/paths.mts';

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

/**
 * The subject of the commit the memory run makes after every closure. Preflight
 * finds the last closure by this exact subject when the commit the progress
 * file's header names is gone from `HEAD`'s history, so the phase file that
 * makes the commit and this grep share one spelling (a trace anchor holds it).
 */
export const CLOSING_SUBJECT_PREFIX = 'maestro: close ';

export const closingSubject = (dir: string): string => CLOSING_SUBJECT_PREFIX + dir;

/**
 * The run as its commits' `Maestro-Run:` trailer names it: the directory
 * without `--wip`, or the slug before contract 7. The resume check and the
 * landing check both compare a trailer with it, so one function spells it.
 */
export function runName(state: Record<string, unknown>): string {
  const dir = typeof state['dir'] === 'string' ? state['dir'] : String(state['slug'] ?? '');
  return dir.endsWith(WIP_SUFFIX) ? dir.slice(0, -WIP_SUFFIX.length) : dir;
}

export type HistoryBasis = 'commit' | 'closing-commit' | 'date';

export interface CommitsSince {
  state: 'listed' | 'unavailable';
  /**
   * `commit` when the recorded closure commit is an ancestor of `HEAD`;
   * `closing-commit` when it is not, or none was recorded, but the closing
   * commit of that run is on `HEAD`'s history (a rebase rewrote both, and the
   * subject survived); `date` when neither holds, and the read falls back to
   * the closure's moment.
   */
  basis?: HistoryBasis;
  /** What was read: `<sha>..HEAD`, or `--since=<moment>`. */
  range?: string;
  /** The closing commit the read started from; only on `closing-commit`. */
  closingCommit?: string;
  /** Newest first, merges excluded. */
  commits: CommitLine[];
  /** Every path those commits changed, unique and sorted. */
  paths: string[];
  /** Why the history could not be read; only on `unavailable`. */
  reason?: string;
}

/** What a commit name looks like: abbreviated or whole, SHA-1 or SHA-256. */
export const SHA_PATTERN = /^[0-9a-f]{7,64}$/;

const RECORD = '\x1e';
/** The field separator of every `--format` read here; a subject cannot carry it. */
export const FIELD = '\x1f';

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
 * The newest commit on `HEAD`'s history whose subject is exactly the closing
 * subject of `dir`. `--grep` also matches a commit body and a longer run
 * directory name that starts with this one, so the subject is compared whole
 * here rather than trusted to the grep. Null when there is none or git cannot say.
 */
export async function findClosingCommit(projectRoot: string, dir: string, gitBinary = 'git'): Promise<{ sha: string } | null> {
  const subject = closingSubject(dir);
  const outcome = await runGit(projectRoot, ['log', '--fixed-strings', `--grep=${subject}`, `--format=%H${FIELD}%s`, 'HEAD'], gitBinary);
  if ('unavailable' in outcome) {
    log.debug('basis', 'closing commit searched', { dir, found: false, candidates: 0 });
    return null;
  }
  const candidates = outcome.stdout.split('\n').filter(line => line !== '');
  const match = candidates.map(line => line.split(FIELD)).find(([, found]) => found === subject);
  log.debug('basis', 'closing commit searched', { dir, found: match !== undefined, candidates: candidates.length });
  return match ? { sha: match[0]! } : null;
}

/**
 * The commits over code since the last closure. `since.commit` is what the
 * progress file's header recorded, `since.at` the closure's moment and
 * `since.dir` the run it closed; `excluded` are root-relative paths that are
 * not code — `.maestro/` and the memory files, so the memory block's own
 * commit and the closing commit never count.
 *
 * The basis is tried in order (decision D2): the header's commit, then the
 * closing commit of that run found by its subject, then the date. The middle
 * step is what survives a rebase, which rewrites both shas but not the subject.
 */
export async function commitsSince(
  projectRoot: string,
  since: { commit: string | null; at: string; dir: string },
  excluded: readonly string[],
  gitBinary = 'git',
): Promise<CommitsSince> {
  const head = await headCommit(projectRoot, gitBinary);
  if ('unavailable' in head) return { state: 'unavailable', commits: [], paths: [], reason: head.unavailable };
  let basis: HistoryBasis = 'date';
  let from: string | null = null;
  if (since.commit !== null) {
    const ancestor = await runGit(projectRoot, ['merge-base', '--is-ancestor', since.commit, 'HEAD'], gitBinary);
    if (!('unavailable' in ancestor)) { basis = 'commit'; from = since.commit; }
    log.debug('basis', 'closure commit against HEAD', { commit: since.commit, ancestor: basis === 'commit' });
  }
  let closingCommit: string | undefined;
  if (basis === 'date') {
    const closing = await findClosingCommit(projectRoot, since.dir, gitBinary);
    if (closing !== null) { basis = 'closing-commit'; from = closing.sha; closingCommit = closing.sha; }
  }
  const range = from !== null ? `${from}..HEAD` : `--since=${since.at}`;
  const pathspec = ['--', '.', ...excluded.map(entry => `:(exclude)${entry}`)];
  // quotePath off: a path git would octal-escape is named to the reader as it is on disk.
  const outcome = await runGit(projectRoot, [
    '-c', 'core.quotePath=false', 'log', '--no-merges', '--name-only', `--format=${RECORD}%H${FIELD}%cI${FIELD}%s`,
    ...(from !== null ? [range] : [range, 'HEAD']), ...pathspec,
  ], gitBinary);
  const found = closingCommit !== undefined ? { closingCommit } : {};
  if ('unavailable' in outcome) return { state: 'unavailable', basis, range, ...found, commits: [], paths: [], reason: outcome.unavailable };
  const { commits, paths } = parseLog(outcome.stdout);
  log.info('since', 'commits since the last closure read', { basis, commits: commits.length, paths: paths.length });
  return { state: 'listed', basis, range, ...found, commits, paths };
}

/** `HEAD` at this moment, or why it cannot be named. */
export async function headCommit(projectRoot: string, gitBinary = 'git'): Promise<{ sha: string } | { unavailable: string }> {
  const outcome = await runGit(projectRoot, ['rev-parse', '--verify', 'HEAD'], gitBinary);
  if ('unavailable' in outcome) return { unavailable: outcome.unavailable };
  const sha = outcome.stdout.trim();
  if (!SHA_PATTERN.test(sha)) return { unavailable: 'git rev-parse HEAD named no commit' };
  return { sha };
}

// --- a recorded commit, classified against HEAD on resume ----------------------

/**
 * Where one recorded commit stands. `not-ancestor`: the object exists and
 * `HEAD`'s history does not contain it. `missing`: git cannot name it, or the
 * entry is not a sha at all. `unavailable`: git did not answer, so nothing may
 * be concluded from it.
 */
export type Ancestry =
  | { state: 'ancestor' }
  | { state: 'not-ancestor' }
  | { state: 'missing' }
  | { state: 'unavailable'; reason: string };

const short = (sha: string): string => sha.slice(0, 12);

/** Classify one recorded commit against `HEAD`. Never throws. */
export async function ancestry(projectRoot: string, sha: string, gitBinary = 'git'): Promise<Ancestry> {
  const classified = (state: Ancestry): Ancestry => {
    log.debug('ancestry', 'recorded commit classified', { sha: short(sha), state: state.state });
    return state;
  };
  // Checked before any git call, so an entry like `--all` never reaches git as an option.
  if (!SHA_PATTERN.test(sha)) return classified({ state: 'missing' });
  const exists = await runGit(projectRoot, ['cat-file', '-e', `${sha}^{commit}`], gitBinary);
  if ('unavailable' in exists) {
    if (exists.exit === 128 || exists.exit === 1) return classified({ state: 'missing' });
    return classified({ state: 'unavailable', reason: exists.unavailable });
  }
  // commitsSince folds exit 1 into "not usable" because it only picks a basis.
  // Here "not an ancestor" resets a таск, and "git did not answer" must never
  // do that, so exit 1 is the only failure read as an answer.
  const ancestor = await runGit(projectRoot, ['merge-base', '--is-ancestor', sha, 'HEAD'], gitBinary);
  if (!('unavailable' in ancestor)) return classified({ state: 'ancestor' });
  if (ancestor.exit === 1) return classified({ state: 'not-ancestor' });
  return classified({ state: 'unavailable', reason: ancestor.unavailable });
}

/**
 * The local branches whose history holds `sha`, sorted. Called only for a
 * `not-ancestor` commit, so the branch `HEAD` is on never appears.
 */
export async function branchesContaining(projectRoot: string, sha: string, gitBinary = 'git'): Promise<{ branches: string[] } | { unavailable: string }> {
  if (!SHA_PATTERN.test(sha)) return { branches: [] };
  const outcome = await runGit(projectRoot, ['for-each-ref', `--contains=${sha}`, '--format=%(refname:short)', 'refs/heads'], gitBinary);
  if ('unavailable' in outcome) return { unavailable: outcome.unavailable };
  const branches = outcome.stdout.split('\n').filter(line => line !== '').sort();
  // The names are the user's, so only their count is logged.
  log.debug('branches', 'containing branches counted', { sha: short(sha), count: branches.length });
  return { branches };
}

/**
 * The commit on `HEAD`'s history a rebase most likely rewrote `sha` into: the
 * newest whose subject equals `sha`'s exactly, whose `Maestro-Run:` trailer is
 * exactly `dir`, and which no таск records (`excluded`, whole or abbreviated).
 * A hint for the relaunched executor, never a substitute for the relaunch. Null
 * when `sha`'s object is gone (there is no subject to match) or git cannot say.
 */
export async function findRewrittenCommit(
  projectRoot: string,
  lost: { sha: string; dir: string; excluded: ReadonlySet<string> },
  gitBinary = 'git',
): Promise<{ sha: string } | null> {
  if (!SHA_PATTERN.test(lost.sha)) return null;
  const subjectOutcome = await runGit(projectRoot, ['log', '-1', '--format=%s', lost.sha, '--'], gitBinary);
  if ('unavailable' in subjectOutcome) {
    log.debug('rewritten', 'twin searched', { sha: short(lost.sha), found: false, candidates: 0 });
    return null;
  }
  const subject = subjectOutcome.stdout.replace(/\n$/, '');
  const outcome = await runGit(projectRoot, [
    'log', `--format=${RECORD}%H${FIELD}%s${FIELD}%(trailers:key=Maestro-Run,valueonly,separator=%x2C)`, 'HEAD', '--',
  ], gitBinary);
  if ('unavailable' in outcome) {
    log.debug('rewritten', 'twin searched', { sha: short(lost.sha), found: false, candidates: 0 });
    return null;
  }
  const recorded = [...lost.excluded];
  const isRecorded = (candidate: string): boolean => recorded.some(entry => entry !== '' && candidate.startsWith(entry));
  let candidates = 0;
  let match: string | undefined;
  for (const record of outcome.stdout.split(RECORD)) {
    const fields = record.replace(/\n+$/, '').split(FIELD);
    if (fields.length < 3 || fields[1] !== subject) continue;
    candidates += 1;
    if (fields[2]!.trim() !== lost.dir || isRecorded(fields[0]!)) continue;
    match = fields[0]!;
    break;
  }
  log.debug('rewritten', 'twin searched', { sha: short(lost.sha), found: match !== undefined, candidates });
  return match !== undefined ? { sha: match } : null;
}
