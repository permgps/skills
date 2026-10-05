// Strict publication is a separate boundary from the optional-expect repository writer.
// The viewer is injected so read-only actions cannot accidentally launch it.
import { lstat, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { languageViolations } from './legacy.mts';
import { createLogger } from './shared/log.mts';
import type { RunState } from './state/contract.mts';
import { parseStateSource } from './state/read.mts';
import { validateState, type StateViolation } from './state/validate.mts';
import { validateEvidence } from './state/evidence.mts';
import { projectState } from './state/projection.mts';
import { validateStateTransition } from './state/closure.mts';
import { deriveVerification } from './state/verification.mts';
import { atomicText, serializeState } from './state/write.mts';
import { STATE_FILE, WIP_SUFFIX, parseRunDir, runDirName } from './state/paths.mts';
import { relocateRunDir, restoreRunDir, type Relocation } from './relocation.mts';
import { upsertRegister } from './register.mts';

const log = createLogger('sync');
export type Viewer = (noOpen: boolean) => Promise<string | null>;
export interface CandidateResult { code: number; result: Record<string, unknown> }
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export async function loadCandidate(file: string): Promise<unknown> {
  const source = await readFile(file, 'utf8');
  return source.includes('globalThis.MAESTRO_STATE =') ? parseStateSource(source) : JSON.parse(source);
}

const isDirectory = async (file: string): Promise<boolean> => {
  try { return (await stat(file)).isDirectory(); } catch { return false; }
};

/**
 * A contract-7 candidate whose folder is still under its other name: the same
 * date and slug with the suffix the other way round. That is the closing or
 * reopening publish before it ran, and a read-only check must judge its evidence
 * where the evidence actually is rather than call it missing.
 */
export async function pendingRelocation(candidate: RunState, dir: string): Promise<{ from: string; to: string } | null> {
  if (candidate.contractVersion < 7 || typeof candidate.dir !== 'string') return null;
  const parsed = parseRunDir(candidate.dir);
  if (!parsed || await isDirectory(path.join(dir, candidate.dir))) return null;
  const twin = `${parsed.date}-${parsed.slug}${parsed.wip ? '' : WIP_SUFFIX}`;
  return await isDirectory(path.join(dir, twin)) ? { from: twin, to: candidate.dir } : null;
}

/**
 * Structural, language and contract checks, then evidence. `evidence: false` is
 * for the one caller that must move the folder between the two halves.
 */
export async function candidateViolations(candidate: unknown, dir: string,
  options: { evidence?: boolean } = {}): Promise<StateViolation[]> {
  try {
    const errors = [...validateState(candidate), ...languageViolations(candidate)];
    if (!isRecord(candidate) || ![4, 5, 6, 7].includes(candidate['contractVersion'] as number)) {
      errors.push({ field: 'contractVersion', message: 'publication requires contract version 4, 5, 6 or 7' });
    }
    if (errors.length === 0 && options.evidence !== false) {
      const state = candidate as RunState;
      const pending = await pendingRelocation(state, dir);
      if (pending) log.debug('validate', 'evidence judged where the run still is', pending);
      errors.push(...await validateEvidence(pending ? { ...state, dir: pending.from } : state, path.dirname(dir), dir));
    }
    return errors;
  } catch {
    log.error('validate', 'candidate shape is invalid');
    return [{ field: 'verification', message: 'candidate contains malformed nested records' }];
  }
}

export interface ValidationEnvelope {
  status: 'valid' | 'invalid'; candidateRevision: unknown; candidateRunId: unknown;
  lastValidRevision: unknown; violations: StateViolation[];
}
export function validationEnvelope(status: 'valid' | 'invalid', candidate: unknown,
  violations: StateViolation[] = [], previous: unknown = null): ValidationEnvelope {
  return { status, candidateRevision: isRecord(candidate) ? candidate['updatedAt'] ?? null : null,
    candidateRunId: isRecord(candidate) ? candidate['runId'] ?? null : null,
    lastValidRevision: isRecord(previous) ? previous['updatedAt'] ?? null : null, violations };
}
export async function writeValidation(dir: string, envelope: ValidationEnvelope): Promise<void> {
  await atomicText(path.join(dir, 'validation.js'), `globalThis.MAESTRO_VALIDATION = ${JSON.stringify(envelope)};\n`);
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}
function checkStamp(previous: RunState | null, expected: string | undefined,
  holder: string | undefined, succession = false): StateViolation[] {
  const errors: StateViolation[] = [];
  if (previous) {
    if (expected === undefined || previous.updatedAt !== expected) errors.push({ field: 'updatedAt', message: 'stale or missing expected revision' });
    // A closed run's claim ended with it; the stamp above still guards the start.
    if (previous.heldBy && previous.heldBy.token !== holder && !succession) errors.push({ field: 'heldBy', message: 'holder token does not match prior snapshot' });
  } else if (expected !== undefined) errors.push({ field: 'updatedAt', message: 'expected revision has no state to match' });
  return errors;
}
/**
 * The first publish of a new прогон over a closed one. `state.js` is one per
 * project, so the next run must replace the last; without this the transition
 * rules would judge it as the closed run rewritten, and the only way forward
 * was deleting the file by hand. Only a closed run is succeeded: an active one
 * with another id is somebody's live run, and stays refused by its holder.
 */
export function succeedsClosedRun(previous: RunState, candidate: RunState): boolean {
  return previous.lifecycle === 'closed' && candidate.contractVersion >= 7
    && candidate.lifecycle === 'active' && candidate.runId !== previous.runId;
}

/** Where the succeeded run's last state is kept: its own folder, beside its record. */
async function keepClosedState(dir: string, previous: RunState, source: string): Promise<{ path: string } | StateViolation> {
  const folder = runDirName(previous);
  const kept = path.join(dir, folder, STATE_FILE);
  try { if (!(await lstat(path.join(dir, folder))).isDirectory()) throw new Error('not a directory'); }
  catch { return { field: 'state.js', message: `.maestro/${folder} is missing, so the closed run's state cannot be kept beside its record; restore the folder before starting a new run` }; }
  try {
    if (await readFile(kept, 'utf8') === source) return { path: kept };
    return { field: 'state.js', message: `.maestro/${folder}/${STATE_FILE} already holds a different state; nothing was replaced` };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return { field: 'state.js', message: `.maestro/${folder}/${STATE_FILE} cannot be read; nothing was replaced` };
  }
  await atomicText(kept, source);
  return { path: kept };
}

async function readPrevious(file: string): Promise<RunState | null> {
  try {
    const value = await loadCandidate(file);
    if (!isRecord(value)) throw new Error('not an object');
    return value as unknown as RunState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function candidateMode(args: string[], dir: string,
  viewer: Viewer = async () => pathToFileURL(path.join(dir, 'dashboard.html')).href,
  snapshots: (candidate: RunState | null, envelope: ValidationEnvelope) => Promise<void> = async () => {}): Promise<CandidateResult> {
  const action = args[0];
  const file = args[1];
  if (!file) return { code: 2, result: { status: 'unreadable', reason: 'candidate path is required' } };
  let candidate: unknown;
  try { candidate = await loadCandidate(file); }
  catch {
    log.error('input', 'candidate could not be read or parsed', { path: file });
    return { code: 2, result: { status: 'unreadable', reason: 'candidate file could not be read or parsed as JSON' } };
  }
  if (action === '--project' && isRecord(candidate) && typeof candidate['contractVersion'] === 'number' && candidate['contractVersion'] < 4) {
    const projection = projectState(candidate as unknown as RunState);
    return { code: 0, result: { status: 'legacy', verificationEstablished: false, notice: projection.notice,
      g4: projection.g4, scopeProgress: projection.scopeProgress, completionSafeguards: 'not-established' } };
  }
  // Publication checks evidence only after a relocation, which needs the
  // transition checks first; the read-only actions check it straight away.
  const errors = await candidateViolations(candidate, dir, { evidence: action !== '--publish' });
  const state = candidate as RunState;
  const summary = errors.length === 0 ? deriveVerification(state) : null;
  const pending = errors.length === 0 && action !== '--publish' ? await pendingRelocation(state, dir) : null;
  if (action === '--validate') return { code: errors.length ? 1 : 0,
    result: { status: errors.length ? 'invalid' : 'valid', violations: errors, projection: summary,
      ...(pending ? { relocationPending: pending } : {}) } };
  if (action === '--project') {
    if (errors.length) return { code: 1, result: { status: 'invalid', violations: errors } };
    const projection = projectState(state);
    return { code: 0, result: { status: 'current', summary, scopeProgress: projection.scopeProgress,
      completionSafeguards: projection.completionSafeguards, lifecycle: state.lifecycle,
      outcome: state.outcome ?? null, verificationEstablished: projection.verificationEstablished,
      ...(pending ? { relocationPending: pending } : {}) } };
  }
  const target = path.join(dir, 'state.js');
  let previous: RunState | null = null;
  try {
    previous = await readPrevious(target);
    if (previous && previous.contractVersion >= 4 && validateState(previous).length) {
      errors.push({ field: 'state.js', message: 'existing history is invalid; recover explicitly' });
    }
  } catch { errors.push({ field: 'state.js', message: 'existing state cannot be read; recover explicitly' }); }
  const expected = option(args, '--expect');
  const holder = option(args, '--holder');
  const succession = errors.length === 0 && previous !== null && succeedsClosedRun(previous, state);
  if (succession && previous) {
    log.info('succession', 'a new run starts over a closed one', { closedRunId: previous.runId, runId: state.runId });
    const before = previous.contractVersion >= 7 ? parseRunDir(runDirName(previous)) : null;
    const after = parseRunDir(runDirName(state));
    if (before && after && before.date === after.date && before.slug === after.slug) {
      errors.push({ field: 'dir', message: `.maestro/${runDirName(previous)} is the closed run's folder under its other name; a new run takes its own — add a numeric suffix to the slug` });
    }
  }
  errors.push(...checkStamp(previous, expected, holder, succession));
  if (isRecord(candidate) && isRecord(candidate['heldBy']) && candidate['heldBy']['token'] !== holder) {
    errors.push({ field: 'heldBy', message: 'holder token does not match candidate' });
  }
  if (errors.length === 0 && previous && !succession) errors.push(...validateStateTransition(previous, state));
  let relocation: Relocation | null = null;
  if (errors.length === 0 && previous && !succession && previous.contractVersion >= 7 && state.contractVersion >= 7) {
    const from = runDirName(previous);
    const to = runDirName(state);
    if (from !== to) {
      try { relocation = await relocateRunDir(path.dirname(dir), dir, from, to, state.runId); }
      catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        log.error('relocation', 'run directory could not be relocated', { runId: state.runId, from, to, reason });
        errors.push({ field: 'dir', message: `${reason}; nothing was moved and the published state stands` });
      }
    }
  }
  if (errors.length === 0) errors.push(...await validateEvidence(state, path.dirname(dir), dir));
  let kept: string | null = null;
  if (errors.length === 0 && succession && previous) {
    try {
      const outcome = await keepClosedState(dir, previous, await readFile(target, 'utf8'));
      if ('path' in outcome) {
        kept = outcome.path;
        log.info('succession', 'closed run state kept in its folder', { closedRunId: previous.runId, path: kept });
      } else errors.push(outcome);
    } catch (error) {
      log.error('succession', 'closed run state could not be kept', { closedRunId: previous.runId,
        reason: error instanceof Error ? error.message : String(error) });
      errors.push({ field: 'state.js', message: 'the closed run\'s state could not be kept in its folder; nothing was replaced' });
    }
  }
  if (errors.length === 0) {
    try {
      log.debug('publish', 'candidate checked; replacing state', { revision: state.updatedAt });
      await atomicText(target, serializeState(state), async () => {
        const current = await readPrevious(target);
        const stale = checkStamp(current, expected, holder, succession);
        if ((previous === null) !== (current === null) || stale.length) throw new Error('revision or holder changed before replacement');
      });
    } catch {
      errors.push({ field: 'state.js', message: 'state could not be replaced; prior state preserved' });
    }
  }
  if (errors.length && relocation) {
    try {
      await restoreRunDir(path.dirname(dir), dir, relocation, state.runId);
      log.error('relocation', 'relocation rolled back after the candidate was refused', { runId: state.runId, ...relocation });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      log.error('relocation', 'run directory could not be moved back', { runId: state.runId, ...relocation, reason });
      errors.push({ field: 'dir', message: `.maestro/${relocation.to} could not be moved back to .maestro/${relocation.from} — rename it by hand before the next publish` });
    }
    relocation = null;
  }
  let register: 'written' | 'failed' | null = null;
  if (errors.length === 0 && state.contractVersion >= 7) {
    try { await upsertRegister(dir, state); register = 'written'; }
    catch (error) {
      register = 'failed';
      log.warn('register', 'register row could not be written; the next publish rewrites it', {
        runId: state.runId, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  const envelope = validationEnvelope(errors.length ? 'invalid' : 'valid', candidate, errors, errors.length ? previous : state);
  try {
    await writeValidation(dir, envelope);
    await snapshots(errors.length ? null : state, envelope);
  } catch { log.warn('diagnostic', 'derived diagnostic or snapshot could not be written', { dir }); }
  let url: string | null = null;
  try { url = await viewer(args.includes('--no-open')); }
  catch { log.warn('viewer', 'viewer unavailable; coherent state retained', { dir }); }
  if (errors.length) {
    log.error('publish', 'candidate rejected before publication', { violations: errors.length });
    return { code: 1, result: { status: 'rejected', violations: errors, url } };
  }
  log.info('publish', 'candidate published', { runId: state.runId, revision: state.updatedAt });
  return { code: 0, result: { status: 'published', revision: state.updatedAt, path: target, url, projection: summary,
    ...(relocation ? { relocated: relocation } : {}), ...(register ? { register } : {}),
    ...(succession && previous ? { succeeded: { runId: previous.runId, kept: path.relative(dir, kept ?? '') } } : {}) } };
}
