// Filesystem integrity for immutable captures and declared relevant inputs.
//
// Pure aggregation never opens files. This boundary runs when a candidate is
// read or published, so a symlink or a changed shared asset cannot certify a
// stale browser pass while the dashboard receives a new success snapshot.

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, realpath, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import { createLogger } from '../shared/log.mts';
import type { EvidenceFingerprint, RunState } from './contract.mts';
import type { StateViolation } from './validate.mts';
import { sameFingerprint } from './verification.mts';
import { WIP_SUFFIX, parseRunDir, runDirName } from './paths.mts';

const log = createLogger('state');
const HASH = /^[a-f0-9]{64}$/;

const inside = (root: string, candidate: string): boolean =>
  candidate.startsWith(`${root}${path.sep}`);

async function fileHash(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function checkedFile(
  root: string,
  relative: string,
  field: string,
  violations: StateViolation[],
): Promise<string | undefined> {
  if (!relative || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) {
    violations.push({ field, message: 'path must be relative and stay inside its declared root' });
    return undefined;
  }
  const expected = path.resolve(root, relative);
  if (!inside(path.resolve(root), expected)) {
    violations.push({ field, message: 'path escapes its declared root' });
    return undefined;
  }
  let actual: string;
  try {
    actual = await realpath(expected);
    const rootActual = await realpath(root);
    if (!inside(rootActual, actual)) {
      violations.push({ field, message: 'symlink resolves outside its declared root' });
      return undefined;
    }
    if (!(await stat(actual)).isFile()) {
      violations.push({ field, message: 'path is not a regular file' });
      return undefined;
    }
  } catch {
    violations.push({ field, message: 'declared file is missing or unreadable' });
    return undefined;
  }
  return actual;
}

/** Where a declared project-relative input is read from; the identity, unless the run folder was renamed. */
type InputLocator = (relative: string) => string;

/**
 * A contract-7 run folder takes `--wip` off at closure and puts it back at a
 * reopening, but a fingerprint is immutable once published and keeps the name
 * its input had when it was hashed. An input under the folder's other spelling
 * is therefore read under the name the folder has now. Rewriting published
 * paths at closure was rejected: it would open an exception in immutability for
 * every record that cites the run, and the hash comparison already proves the
 * file is the same one. The twin is always this run — a second прогон on the
 * same day and slug takes a numeric suffix, with or without `--wip`.
 */
function runInputLocator(state: RunState, projectRoot: string, runRoot: string, runName: string): InputLocator {
  const parsed = state.contractVersion >= 7 ? parseRunDir(runName) : null;
  const root = path.relative(path.resolve(projectRoot), path.resolve(runRoot)).split(path.sep).join('/');
  if (!parsed || root === '' || root.startsWith('..')) return relative => relative;
  const twin = `${root}/${parsed.date}-${parsed.slug}${parsed.wip ? '' : WIP_SUFFIX}/`;
  const current = `${root}/${runName}/`;
  return relative => {
    if (!relative.startsWith(twin)) return relative;
    const located = `${current}${relative.slice(twin.length)}`;
    log.debug('fingerprint', 'run input read under the folder\'s current name', { runId: state.runId, relative, located });
    return located;
  };
}

async function checkFingerprint(
  fingerprint: EvidenceFingerprint,
  projectRoot: string,
  at: string,
  violations: StateViolation[],
  locate: InputLocator,
): Promise<void> {
  for (const relative of fingerprint.relevantPaths) {
    const field = `${at}.inputHashes[${JSON.stringify(relative)}]`;
    const expected = fingerprint.inputHashes[relative];
    if (!expected || !HASH.test(expected)) {
      violations.push({ field, message: 'declared SHA-256 is missing or malformed' });
      continue;
    }
    const file = await checkedFile(projectRoot, locate(relative), field, violations);
    if (!file) continue;
    let actual: string;
    try { actual = await fileHash(file); }
    catch { violations.push({ field, message: 'declared input became unreadable during hashing' }); continue; }
    if (actual !== expected) {
      violations.push({ field, message: 'relevant input changed; check evidence is stale' });
      log.warn('fingerprint', 'relevant input changed', { field, relative });
    }
  }
}

/** Validate path confinement and SHA-256 before a contract-4 state is published. */
export async function validateEvidence(
  state: RunState,
  projectRoot: string,
  runRoot = path.join(projectRoot, '.maestro'),
): Promise<StateViolation[]> {
  const record = state.verification;
  if (!record || state.contractVersion < 4) return [];
  const violations: StateViolation[] = [];
  let runName: string;
  try { runName = runDirName(state); }
  catch { return [{ field: state.contractVersion >= 7 ? 'dir' : 'slug', message: 'run directory name is not a safe path segment' }]; }
  const runDir = path.join(runRoot, runName);
  const locate = runInputLocator(state, projectRoot, runRoot, runName);
  if (record.evidence.length > 0) {
    try {
      if (!inside(await realpath(projectRoot), await realpath(runDir))
        || !inside(await realpath(runDir), await realpath(path.join(runDir, 'evidence')))) {
        violations.push({ field: 'verification.evidence', message: 'evidence root escapes the project run' });
        return violations;
      }
    } catch {
      violations.push({ field: 'verification.evidence', message: 'evidence root is missing' });
      return violations;
    }
  }

  if (record.version !== 1) {
    const field = 'verification.manifestDigest';
    const file = await checkedFile(runDir, 'manifest.md', field, violations);
    if (file && createHash('sha256').update(await readFile(file)).digest('hex') !== record.manifestDigest) {
      violations.push({ field, message: 'manifest changed; source audit is stale' });
    }
  }
  log.debug('evidence', 'checking capture integrity', {
    runId: state.runId, captures: record.evidence.length, checks: record.checks.length,
  });
  for (const [index, evidence] of record.evidence.entries()) {
    const field = `verification.evidence[${index}].path`;
    if (!/^evidence\/[A-Za-z0-9_-]+\/.+/.test(evidence.path)) {
      violations.push({ field, message: 'capture path must use evidence/<execution-id>/...' });
      continue;
    }
    if (!HASH.test(evidence.sha256)) {
      violations.push({ field: `verification.evidence[${index}].sha256`, message: 'SHA-256 must be lowercase hex' });
      continue;
    }
    const file = await checkedFile(path.join(runDir, 'evidence'),
      evidence.path.slice('evidence/'.length), field, violations);
    if (!file) continue;
    let actual: string;
    try { actual = await fileHash(file); }
    catch { violations.push({ field, message: 'capture became unreadable during hashing' }); continue; }
    if (actual !== evidence.sha256) {
      violations.push({ field, message: 'capture SHA-256 does not match the stored artifact' });
    }
  }
  for (const [index, check] of record.checks.entries()) {
    await checkFingerprint(check.currentFingerprint, projectRoot,
      `verification.checks[${index}].currentFingerprint`, violations, locate);
  }
  for (const [index, execution] of record.executions.entries()) {
    // Historical executions are preserved, so their former inputs may no
    // longer exist. The current check fingerprint decides whether they remain
    // applicable; do not reject a valid history for containing stale work.
    if (!record.checks.some(check => check.id === execution.checkId
      && sameFingerprint(check.currentFingerprint, execution.fingerprint))) continue;
    await checkFingerprint(execution.fingerprint, projectRoot,
      `verification.executions[${index}].fingerprint`, violations, locate);
  }
  if (violations.length > 0) log.error('evidence', 'candidate evidence failed integrity', {
    runId: state.runId, violations: violations.length,
  });
  return violations;
}

/**
 * Import task-owned captures into the run's immutable evidence tree.
 * The orchestrator calls this before publishing the candidate snapshot.
 * A failed import never authorizes an execution result.
 */
export async function importEvidence(
  state: RunState,
  projectRoot: string,
  taskRoot: string,
  sources: Record<string, string>,
): Promise<StateViolation[]> {
  const record = state.verification;
  if (!record || state.contractVersion < 4) return [{ field: 'verification', message: 'contract-4 verification is required' }];
  const violations: StateViolation[] = [];
  // Below contract 7 the slug is the directory; from 7 it is `dir`, parsed
  // rather than trusted, because a name that fails the grammar fails it here too.
  const runName = state.contractVersion >= 7 ? state.dir ?? '' : state.slug;
  if (state.contractVersion >= 7 ? !parseRunDir(runName) : !/^[a-z0-9][a-z0-9-]*$/.test(runName)) {
    return [{ field: state.contractVersion >= 7 ? 'dir' : 'slug', message: 'run directory is not a safe directory name' }];
  }
  const project = await realpath(projectRoot);
  const maestroDir = path.join(project, '.maestro');
  const runDir = path.join(maestroDir, runName);
  const runEvidence = path.join(runDir, 'evidence');
  for (const [parent, child] of [
    [project, maestroDir],
    [maestroDir, runDir],
    [runDir, runEvidence],
  ] as [string, string][]) {
    try { await mkdir(child); }
    catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
    }
    if (!inside(await realpath(parent), await realpath(child))) {
      return [{ field: 'verification.evidence', message: 'evidence root escapes the project run' }];
    }
  }
  const planned: { source: string; destination: string; id: string; hash: string }[] = [];
  for (const [index, evidence] of record.evidence.entries()) {
    const sourcePath = sources[evidence.id];
    if (sourcePath === undefined) continue;
    const field = `verification.evidence[${index}]`;
    if (!/^evidence\/[A-Za-z0-9_-]+\/.+/.test(evidence.path) || !HASH.test(evidence.sha256)) {
      violations.push({ field, message: 'capture path or SHA-256 is invalid' });
      continue;
    }
    const source = await checkedFile(taskRoot, sourcePath, `${field}.source`, violations);
    if (!source) continue;
    const hash = await fileHash(source);
    if (hash !== evidence.sha256) {
      violations.push({ field, message: 'task-owned capture does not match declared SHA-256' });
      continue;
    }
    const destination = path.resolve(runEvidence, evidence.path.slice('evidence/'.length));
    if (!inside(runEvidence, destination)) {
      violations.push({ field, message: 'capture destination escapes the run' });
      continue;
    }
    planned.push({ source, destination, id: evidence.id, hash });
  }
  if (violations.length) return violations;
  for (const capture of planned) {
    await mkdir(path.dirname(capture.destination), { recursive: true });
    if (!inside(await realpath(runEvidence), await realpath(path.dirname(capture.destination)))) {
      violations.push({ field: capture.id, message: 'capture parent resolves outside the run' });
      continue;
    }
    try {
      const existing = await realpath(capture.destination);
      if (!inside(await realpath(runEvidence), existing)
        || await fileHash(existing) !== capture.hash) {
        violations.push({ field: capture.id, message: 'immutable capture already exists with different content' });
      }
      continue;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code !== 'ENOENT') {
        violations.push({ field: capture.id, message: 'existing capture cannot be inspected' });
        continue;
      }
    }
    const temporary = `${capture.destination}.${process.pid}.tmp`;
    try {
      await copyFile(capture.source, temporary);
      if (await fileHash(temporary) !== capture.hash) {
        violations.push({ field: capture.id, message: 'capture changed during import' });
        continue;
      }
      await rename(temporary, capture.destination);
      log.info('evidence-import', 'capture sealed', { id: capture.id, path: capture.destination });
    } finally {
      await rm(temporary, { force: true });
    }
  }
  return violations.length ? violations : validateEvidence(state, projectRoot);
}
