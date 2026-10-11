// Whether the project already holds code, decided once, at preflight.
//
// Phase 3 spends one fresh reader on the existing code before the spec is
// written. That reader costs a whole context, so a project with nothing for it
// to find — a fresh `git init`, Maestro just installed, a README — must not pay
// for it. The rule is code rather than a paragraph because the phase that acts
// on the answer runs much later, and a rule re-derived by judgement there would
// answer differently on a resumed прогон.
//
// Git is asked first because its ignore rules are the project's own statement
// of what is not source: `node_modules/` and build output never make an empty
// project look full. Untracked files that are not ignored still count, because
// preflight allows a dirty tree and an executor builds next to uncommitted code
// too. Without git, or outside a work tree, the directory is walked instead.
//
// Contract: docs/spec/phases.md, section "The Existing Code Is Read Once".

import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { createLogger } from './shared/log.mts';

const log = createLogger('existing-code');

/**
 * Root directories that hold Maestro's own record, version control, and host
 * and skill installs (`npx skills add` writes `.claude/skills/…`). Nothing
 * under them is the project's code.
 */
export const NOT_CODE_ROOT_DIRS: readonly string[] = ['.maestro', '.git', '.claude', '.agents', '.codex', '.gemini'];

/** Root-level repository meta files that a repository made by `git init` and its first commit carries. */
export const NOT_CODE_ROOT_FILES: readonly string[] = ['skills-lock.json', '.gitignore', '.gitattributes'];

/** Root-level README, licence and copying files, with any extension. A nested `README.md` is code's neighbour and counts. */
export const NOT_CODE_ROOT_PATTERN = /^(README|LICENSE|LICENCE|COPYING)(\.[^/]*)?$/i;

export interface ExistingCode {
  present: boolean;
  source: 'git' | 'walk';
  /** The first qualifying path, project-relative POSIX, as evidence for a reader of the log. */
  first: string | null;
}

/** Why a project-relative POSIX path is not code, or `null` when it qualifies. */
function whyNotCode(relativePath: string, ignoredBasenames: ReadonlySet<string>): string | null {
  const segments = relativePath.split('/');
  if (segments.length > 1 && NOT_CODE_ROOT_DIRS.includes(segments[0]!)) return 'maestro, version control or host directory';
  if (segments.includes('.git')) return 'version control';
  const base = segments.at(-1)!;
  if (ignoredBasenames.has(base)) return 'memory file or project glossary';
  if (segments.length === 1 && (NOT_CODE_ROOT_FILES.includes(base) || NOT_CODE_ROOT_PATTERN.test(base))) {
    return 'repository meta file';
  }
  return null;
}

/**
 * Whether one project-relative POSIX path counts as the project's code. Every
 * path qualifies unless a rule here says otherwise, `.github/` included,
 * because CI configuration names the commands the reader must report.
 *
 * `ignoredBasenames` are the memory file and project glossary names, passed in
 * by the caller from `memory.mts` so the lists keep one home.
 */
export function qualifies(relativePath: string, ignoredBasenames: ReadonlySet<string>): boolean {
  return whyNotCode(relativePath, ignoredBasenames) === null;
}

/** Logs a skipped path once per skipped root directory, so a large install is one line, not thousands. */
function skipLogger(ignoredBasenames: ReadonlySet<string>): (relativePath: string) => boolean {
  const loggedRoots = new Set<string>();
  return relativePath => {
    const reason = whyNotCode(relativePath, ignoredBasenames);
    if (reason === null) return true;
    const root = relativePath.split('/')[0]!;
    const underRoot = relativePath.includes('/') && NOT_CODE_ROOT_DIRS.includes(root);
    if (!underRoot) log.debug('skip', 'not code', { path: relativePath, reason });
    else if (!loggedRoots.has(root)) {
      loggedRoots.add(root);
      log.debug('skip', 'not code', { path: `${root}/`, reason });
    }
    return false;
  };
}

type GitAnswer = { first: string | null } | { fallback: string };

/**
 * Stream `git ls-files` and stop at the first qualifying path. The child is
 * killed there, so a large monorepo costs one line rather than a full listing.
 */
function askGit(projectRoot: string, accept: (relativePath: string) => boolean, gitBinary: string): Promise<GitAnswer> {
  return new Promise(resolve => {
    let settled = false;
    const settle = (answer: GitAnswer): void => {
      if (settled) return;
      settled = true;
      resolve(answer);
    };
    const child = spawn(
      gitBinary,
      ['-C', projectRoot, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
      { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true },
    );
    let pending = '';
    const scan = (final: boolean): string | null => {
      const parts = pending.split('\0');
      // A path cut by a chunk boundary waits for the rest of its bytes.
      pending = final ? '' : parts.pop()!;
      for (const part of parts) {
        if (part !== '' && accept(part)) return part;
      }
      return null;
    };
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (settled) return;
      pending += chunk;
      const hit = scan(false);
      if (hit === null) return;
      settle({ first: hit });
      child.kill();
    });
    child.once('error', error => {
      settle({ fallback: `git could not be started: ${(error as NodeJS.ErrnoException).code ?? error.message}` });
    });
    child.once('close', code => {
      if (settled) return;
      const hit = scan(true);
      if (hit !== null) settle({ first: hit });
      else if (code === 0) settle({ first: null });
      else settle({ fallback: `git exited ${code ?? 'on a signal'}, so the root is not inside a work tree or git refused` });
    });
  });
}

/**
 * Walk the directory depth-first, entries sorted by name so the answer is the
 * same on every machine. Symlinks are not followed: a link can lead outside the
 * project, and what it reaches is not this project's code.
 */
async function walk(projectRoot: string, accept: (relativePath: string) => boolean): Promise<string | null> {
  const visit = async (relativeDir: string): Promise<string | null> => {
    let entries;
    try { entries = await readdir(path.join(projectRoot, relativeDir), { withFileTypes: true }); }
    catch (error) {
      log.warn('unreadable', 'directory skipped', { path: relativeDir === '' ? '.' : relativeDir, code: (error as NodeJS.ErrnoException).code });
      return null;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const relative = relativeDir === '' ? entry.name : `${relativeDir}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        log.debug('skip', 'symlink not followed', { path: relative });
        continue;
      }
      if (entry.isDirectory()) {
        const excludedRoot = relativeDir === '' && NOT_CODE_ROOT_DIRS.includes(entry.name);
        if (excludedRoot || entry.name === '.git') {
          log.debug('skip', 'not code', { path: `${relative}/`, reason: excludedRoot ? 'maestro, version control or host directory' : 'version control' });
          continue;
        }
        const found = await visit(relative);
        if (found !== null) return found;
        continue;
      }
      if (entry.isFile() && accept(relative)) return relative;
    }
    return null;
  };
  return visit('');
}

/**
 * Decide whether the project holds at least one qualifying file.
 *
 * `gitBinary` exists only so a test can name a binary that cannot be started
 * and force the walk; preflight always uses the default.
 */
export async function detectExistingCode(
  projectRoot: string, ignoredBasenames: ReadonlySet<string>, gitBinary = 'git',
): Promise<ExistingCode> {
  const accept = skipLogger(ignoredBasenames);
  const answer = await askGit(projectRoot, accept, gitBinary);
  let result: ExistingCode;
  if ('first' in answer) result = { present: answer.first !== null, source: 'git', first: answer.first };
  else {
    log.debug('source', 'falling back to the walk', { source: 'walk', reason: answer.fallback });
    const first = await walk(projectRoot, skipLogger(ignoredBasenames));
    result = { present: first !== null, source: 'walk', first };
  }
  log.info('detected', 'existing code decided', { ...result });
  return result;
}
