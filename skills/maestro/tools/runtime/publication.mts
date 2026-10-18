// Strict publication is a separate boundary from the optional-expect repository writer.
// The viewer is injected so read-only actions cannot accidentally launch it.
import { lstat, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validatePlanPublication } from './state/plan-graph.mts';
import { languageViolations } from './legacy.mts';
import { createLogger } from './shared/log.mts';
import type { RunState } from './state/contract.mts';
import { parseStateSource } from './state/read.mts';
import { validateState, type StateViolation } from './state/validate.mts';
import { validateEvidence } from './state/evidence.mts';
import { projectState } from './state/projection.mts';
import { validateInitialIntermittent } from './state/intermittent.mts';
import { validateInitialDispatch, validateStateTransition } from './state/closure.mts';
import { deriveVerification, validateNewResolutions } from './state/verification.mts';
import { keepWaits, type KeptWaits } from './state/waits.mts';
import { atomicText, revisionViolations, serializeState, StateBusyError, withStateLock } from './state/write.mts';
import { STATE_FILE, WIP_SUFFIX, parseRunDir, runDirName } from './state/paths.mts';
import { relocateRunDir, restoreRunDir, type Relocation } from './relocation.mts';
import { upsertRegister } from './register.mts';
import { headCommit } from './history.mts';
import { PROGRESS_FILE, buildProgress, clip, fixesReadAtPreflight, parseProgress, type ProgressItem } from './progress.mts';
import {
  MAESTRO_CHANGE_PREFIX, archivedExports, archivedItems, closureForks, exportForClosure, openSpecProgressItems,
  type OpenSpecExport, type OpenSpecProgressItems,
} from './openspec.mts';

const log = createLogger('sync');
export type PrepareCandidate = (state: RunState, previous: RunState | null) => Promise<StateViolation[]>;
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
  options: { evidence?: boolean; historical?: boolean } = {}): Promise<StateViolation[]> {
  try {
    const errors = [...validateState(candidate, { historical: options.historical === true }), ...languageViolations(candidate)];
    if (!isRecord(candidate) || ![4, 5, 6, 7, 8, 9, 10].includes(candidate['contractVersion'] as number)) {
      errors.push({ field: 'contractVersion', message: 'publication requires contract version 4, 5, 6, 7, 8, 9 or 10' });
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

const readOptional = async (file: string): Promise<string | null> => {
  try { return await readFile(file, 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
};

/**
 * Rewrite `.maestro/PROGRESS.md` from the closing state (decision D1). It runs
 * at publication rather than as a step a phase performs by hand, because both
 * closures — acceptance and the repair stop — publish, and a ritual done by
 * hand drifts. Like the register, it cannot fail the publish: a failure is
 * reported and the next closing publish rewrites the file.
 */
/** Whether the file already carries exactly these export items, so a repeated closure may keep it. */
function sameExportItems(previous: string, dir: string, extra: OpenSpecProgressItems): boolean {
  const parsed = parseProgress(previous);
  const line = (item: ProgressItem): string => `${item.key ?? ''} ${item.text}`;
  const had = [...parsed.notDone, ...parsed.knownBugs].filter(item => item.key?.startsWith(`${dir}#openspec`)).map(line).sort();
  const want = [...extra.notDone, ...extra.knownBugs].map(item => line({ key: item.key, text: clip(item.text) })).sort();
  return JSON.stringify(had) === JSON.stringify(want);
}

async function writeProgress(runRoot: string, state: RunState, repeated: boolean, extra: OpenSpecProgressItems = { notDone: [], knownBugs: [] }): Promise<'written' | 'failed' | 'kept'> {
  const target = path.join(runRoot, PROGRESS_FILE);
  let commit: string | null = null;
  try {
    const previous = await readOptional(target);
    const parsed = previous === null ? null : parseProgress(previous);
    const header = parsed?.header ?? null;
    // An earlier run's change awaiting `openspec archive` is carried until the
    // tree shows the user archived it; no later closure of that run regenerates it.
    const own = `${runDirName(state)}#`;
    const waiting = (parsed?.notDone ?? []).map(item => item.key ?? '')
      .filter(key => key.endsWith('#openspec') && !key.startsWith(own)).map(key => key.slice(0, -'#openspec'.length));
    const archived = await archivedExports(path.dirname(runRoot), waiting).catch(() => [] as string[]);
    if (archived.length > 0) extra = { ...extra, settled: archivedItems(archived) };
    // A successful closure is the baseline for later code history. Repeating it
    // must neither advance that commit to today's HEAD nor consume user fixes.
    // An export outcome that changed since is the one thing a repeat rewrites,
    // and it keeps the baseline commit while it does.
    let baseline: string | null | undefined;
    if (repeated && previous !== null && header?.dir === runDirName(state)
      && header.closedAt === (state.finishedAt ?? state.updatedAt ?? state.startedAt)
      && header.outcome === state.outcome) {
      if (archived.length === 0 && sameExportItems(previous, runDirName(state), extra)) {
        log.debug('progress', '[FIX] existing closure progress preserved', { path: target });
        return 'kept';
      }
      baseline = header.commit;
      log.debug('progress', 'export outcome changed on a repeated closure; rewriting with the original commit', { path: target });
    }
    if (baseline === undefined) {
      const head = await headCommit(path.dirname(runRoot));
      commit = 'sha' in head ? head.sha : null;
    } else commit = baseline;
    const prior = await readOptional(path.join(runRoot, runDirName(state), 'prior.md'));
    await atomicText(target, buildProgress({ state, previous, priorFixes: fixesReadAtPreflight(prior), commit, extra }));
    log.info('progress', '[FIX] progress file rewritten', { action: 'written', path: target, commit });
    return 'written';
  } catch (error) {
    log.warn('progress', 'progress file could not be written; the next closing publish rewrites it', {
      action: 'failed', path: target, commit, reason: error instanceof Error ? error.message : String(error) });
    return 'failed';
  }
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
  snapshots: (candidate: RunState | null, envelope: ValidationEnvelope) => Promise<void> = async () => {}, prepare?: PrepareCandidate): Promise<CandidateResult> {
  if (args[0] !== '--publish') return candidateModeLocked(args, dir, viewer, snapshots, prepare);
  try {
    // Opening the viewer is not part of publication. Keep the state and all
    // derived writes together, then hand off the URL after releasing the lock.
    const outcome = await withStateLock(dir, () => candidateModeLocked(args, dir, async () => null, snapshots, prepare));
    if (outcome.code !== 2) {
      try { outcome.result['url'] = await viewer(args.includes('--no-open')); }
      catch { log.warn('viewer', 'viewer unavailable; coherent state retained', { dir }); }
    }
    return outcome;
  } catch (error) {
    if (error instanceof StateBusyError) return { code: 1, result: {
      status: 'rejected', violations: [{ field: 'state.js', message: error.message }], url: null,
    } };
    log.error('publish', '[FIX] publication could not complete', { dir });
    return { code: 2, result: { status: 'unreadable', reason: 'publication could not complete; reread state.js before retrying' } };
  }
}

async function candidateModeLocked(args: string[], dir: string, viewer: Viewer,
  snapshots: (candidate: RunState | null, envelope: ValidationEnvelope) => Promise<void>, prepare?: PrepareCandidate): Promise<CandidateResult> {
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
  // Publication keeps the closed waits, so it reads the published state first
  // and judges the candidate as it will be written. The read-only actions judge
  // the candidate as written: they read no state.js and apply no wait rule.
  const target = path.join(dir, 'state.js');
  let previous: RunState | null = null;
  let unreadable = false;
  let waitClosed: KeptWaits['closed'] = null;
  const refusedWaits: StateViolation[] = [];
  if (action === '--publish') {
    try { previous = await readPrevious(target); } catch { unreadable = true; }
    if (isRecord(candidate) && typeof candidate['contractVersion'] === 'number' && candidate['contractVersion'] >= 9) {
      const waits = keepWaits(previous, candidate as unknown as RunState);
      candidate = waits.state;
      waitClosed = waits.closed;
      refusedWaits.push(...waits.violations);
    }
  }
  // Publication checks evidence only after a relocation, which needs the
  // transition checks first; the read-only actions check it straight away.
  const errors = [...refusedWaits, ...await candidateViolations(candidate, dir, {
    evidence: action !== '--publish', historical: action !== '--validate',
  })];
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
  if (unreadable) errors.push({ field: 'state.js', message: 'existing state cannot be read; recover explicitly' });
  else if (previous && previous.contractVersion >= 4 && validateState(previous, { historical: true }).length) {
    errors.push({ field: 'state.js', message: 'existing history is invalid; recover explicitly' });
  }
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
  if (errors.length === 0 && previous) errors.push(...revisionViolations(previous, state));
  if (isRecord(candidate) && isRecord(candidate['heldBy']) && candidate['heldBy']['token'] !== holder) {
    errors.push({ field: 'heldBy', message: 'holder token does not match candidate' });
  }
  if (errors.length === 0 && previous && !succession) errors.push(...validateStateTransition(previous, state));
  if (errors.length === 0 && (!previous || succession || previous.contractVersion < 4)) errors.push(...validateState(state), ...validateNewResolutions(state), ...validateInitialIntermittent(state), ...validatePlanPublication(state), ...validateInitialDispatch(state));
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
  if (errors.length === 0 && prepare) {
    try { errors.push(...await prepare(state, succession ? null : previous)); }
    catch { errors.push({ field: 'import', message: 'artifact import failed; source retained and prior state preserved' }); }
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
  let progress: 'written' | 'failed' | 'kept' | null = null;
  let openspec: OpenSpecExport | null = null;
  if (errors.length === 0 && state.contractVersion >= 7 && state.lifecycle === 'closed') {
    // Before the progress file, so it can list what the export left to the user.
    try { openspec = await exportForClosure(dir, state); }
    catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      log.warn('openspec', '[FIX] export raised; reported as failed', { runId: state.runId, reason });
      openspec = { status: 'failed', change: `${MAESTRO_CHANGE_PREFIX}${runDirName(state)}`, problems: [`the export could not be run (${reason}) — publish the same closed state again to retry`] };
    }
    if (openspec) log.info('openspec', 'closing publish exported', { runId: state.runId, status: openspec.status, validation: openspec.validation ?? null });
    const forks = openspec ? [] : await closureForks(dir, state).catch(() => []);
    progress = await writeProgress(dir, state, previous?.lifecycle === 'closed', openSpecProgressItems(runDirName(state), openspec, forks));
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
  if (waitClosed) {
    const facts = { runId: state.runId, by: waitClosed.by, since: waitClosed.since, until: waitClosed.until };
    // A transition closing the wait means the orchestrator forgot to clear it.
    if (waitClosed.by === 'transition') log.warn('waits', 'wait closed', facts);
    else log.info('waits', 'wait closed', facts);
  }
  return { code: 0, result: { status: 'published', revision: state.updatedAt, path: target, url, projection: summary,
    ...(waitClosed ? { waitClosed: { by: waitClosed.by, since: waitClosed.since, until: waitClosed.until } } : {}),
    ...(relocation ? { relocated: relocation } : {}), ...(register ? { register } : {}), ...(progress ? { progress } : {}), ...(openspec ? { openspec } : {}),
    ...(succession && previous ? { succeeded: { runId: previous.runId, kept: path.relative(dir, kept ?? '') } } : {}) } };
}
