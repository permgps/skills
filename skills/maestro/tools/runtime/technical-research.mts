// Bounded external-contract records are immutable evidence, not run-state facts.
// This publisher checks declarations and history; it never fetches or interprets sources.
import { lstat, mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { createLogger } from './shared/log.mts';
import { readState } from './state/read.mts';
import { runDirName } from './state/paths.mts';
import { atomicText, StateBusyError, withStateLock } from './state/write.mts';

const log = createLogger('research');
export const RESEARCH_LIMITS = { sources: 8, minutes: 10, records: 128, bytes: 65_536, text: 2_000 } as const;
const ID = /^Q\d{2,4}$/;
const KINDS = ['installed-source', 'installed-types', 'official-docs', 'first-party-spec'] as const;
type SourceKind = typeof KINDS[number];
export interface ResearchSource {
  kind: SourceKind; location: string; version: string;
  applicability: 'applicable' | 'mismatch' | 'unknown'; supports: string | null; conflict: boolean;
}
export interface ResearchRecord {
  id: string; question: string; impact: 'feasibility' | 'task-boundary'; requirementIds: string[];
  dependency: { name: string; version: string; versionSource: string };
  assumptions: string[]; status: 'established' | 'unresolved'; fact: string | null;
  uncertainty: string[]; sources: ResearchSource[]; budget: { inspections: number; minutes: number };
  supersedes: string | null;
}
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= RESEARCH_LIMITS.text;
const known = (v: string): boolean => v.trim().toLowerCase() !== 'unknown';
const strings = (v: unknown, min: number, max: number): v is string[] => Array.isArray(v)
  && v.length >= min && v.length <= max && v.every(text);
const keys = (v: Record<string, unknown>, names: string[]): boolean =>
  Object.keys(v).length === names.length && names.every(name => Object.hasOwn(v, name));

/** A valid unresolved record may have no accessible sources; absence is not support. */
export function researchViolations(value: unknown): string[] {
  const errors: string[] = [];
  if (!object(value)) return ['record must be an object'];
  if (!keys(value, ['id', 'question', 'impact', 'requirementIds', 'dependency', 'assumptions', 'status', 'fact', 'uncertainty', 'sources', 'budget', 'supersedes'])) errors.push('record fields must match the documented schema');
  if (typeof value.id !== 'string' || !ID.test(value.id)) errors.push('id must be Q followed by 2–4 digits');
  if (!text(value.question)) errors.push('question must be bounded nonempty text');
  if (typeof value.impact !== 'string' || !['feasibility', 'task-boundary'].includes(value.impact)) errors.push('impact must be feasibility or task-boundary');
  if (!strings(value.requirementIds, 1, 32) || !value.requirementIds.every(id => /^R\d{2,}$/.test(id))
    || new Set(value.requirementIds).size !== value.requirementIds.length) errors.push('requirementIds must contain 1–32 unique R IDs');
  if (!object(value.dependency) || !keys(value.dependency, ['name', 'version', 'versionSource'])
    || !Object.values(value.dependency).every(text)) errors.push('dependency must name its version and versionSource, or unknown');
  if (!strings(value.assumptions, 0, 8)) errors.push('assumptions must contain at most eight bounded strings');
  if (!strings(value.uncertainty, 0, 8)) errors.push('uncertainty must contain at most eight bounded strings');
  if (value.supersedes !== null && (typeof value.supersedes !== 'string' || !ID.test(value.supersedes) || value.supersedes === value.id)) errors.push('supersedes must be another record ID or null');
  if (!object(value.budget) || !keys(value.budget, ['inspections', 'minutes'])
    || !Number.isInteger(value.budget.inspections) || Number(value.budget.inspections) < 0 || Number(value.budget.inspections) > 8
    || typeof value.budget.minutes !== 'number' || !Number.isFinite(value.budget.minutes) || value.budget.minutes < 0 || value.budget.minutes > 10) errors.push('budget must stay within eight inspections and ten minutes');
  if (!Array.isArray(value.sources) || value.sources.length > 8) errors.push('sources must contain at most eight records');
  else {
    let online = false;
    for (const source of value.sources) {
      if (!object(source) || !keys(source, ['kind', 'location', 'version', 'applicability', 'supports', 'conflict'])
        || !KINDS.includes(source.kind as SourceKind) || !text(source.location) || !text(source.version)
        || typeof source.applicability !== 'string' || !['applicable', 'mismatch', 'unknown'].includes(source.applicability)
        || !(source.supports === null || text(source.supports)) || typeof source.conflict !== 'boolean') {
        errors.push('each source must carry bounded provenance, applicability, support and conflict'); continue;
      }
      const installed = String(source.kind).startsWith('installed-');
      if (installed && online) errors.push('installed evidence must precede online evidence');
      if (!installed) online = true;
      const version = object(value.dependency) ? value.dependency.version : undefined;
      if (source.applicability === 'applicable' && (!known(source.version) || source.version !== version)) errors.push('applicable evidence must match the known dependency version');
      if (source.applicability === 'mismatch' && (!known(source.version) || !text(version) || !known(version) || source.version === version)) errors.push('mismatch requires different known source and dependency versions');
    }
    if (object(value.budget) && Number(value.budget.inspections) < value.sources.length) errors.push('inspections cannot be fewer than sources');
  }
  if (value.status === 'unresolved') {
    if (value.fact !== null || !strings(value.uncertainty, 1, 8)) errors.push('unresolved requires null fact and explicit uncertainty');
  } else if (value.status === 'established') {
    if (!text(value.fact) || !strings(value.uncertainty, 0, 0)) errors.push('established requires a fact and no uncertainty');
    if (!object(value.dependency) || !text(value.dependency.version) || !known(value.dependency.version)
      || !text(value.dependency.versionSource) || !known(value.dependency.versionSource)) errors.push('established requires a known version and version source');
    const sources = Array.isArray(value.sources) ? value.sources.filter(object) : [];
    if (!sources.some(s => s.applicability === 'applicable' && text(s.supports) && s.conflict === false)) errors.push('established requires applicable supporting evidence');
    if (sources.some(s => s.conflict === true && s.applicability !== 'mismatch')) errors.push('unresolved source conflict prevents establishment');
  } else errors.push('status must be established or unresolved');
  log.debug('validate', 'record structure checked', { violations: errors.length });
  return errors;
}

class UnsafeResearchPathError extends Error {}
async function directory(file: string): Promise<void> {
  const info = await lstat(file);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new UnsafeResearchPathError('destination must be a real directory');
}
async function boundedJson(file: string): Promise<unknown> {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink()) throw new UnsafeResearchPathError('record must be a regular file');
  if (info.size > RESEARCH_LIMITS.bytes) throw new UnsafeResearchPathError('record exceeds 64 KiB');
  return JSON.parse(await readFile(file, 'utf8')) as unknown;
}
interface Result { code: number; result: Record<string, unknown> }
/** Existing records can be edited outside this command; never append to broken history. */
function historyIsValid(history: ResearchRecord[]): boolean {
  for (const record of history) {
    const children = history.filter(item => item.supersedes === record.id);
    if (children.length > 1) return false;
    const visited = new Set<string>([record.id]);
    let current = record;
    while (current.supersedes !== null) {
      const parent = history.find(item => item.id === current.supersedes);
      if (!parent || visited.has(parent.id) || parent.question !== record.question
        || parent.dependency.name !== record.dependency.name) return false;
      visited.add(parent.id); current = parent;
    }
    if (history.filter(item => item.supersedes === null && item.question === record.question
      && item.dependency.name === record.dependency.name).length !== 1) return false;
  }
  return true;
}
function rejected(violations: string[]): Result {
  log.error('publish', 'record refused', { violations: violations.length });
  return { code: 1, result: { status: 'rejected', violations } };
}

/** The state lock serializes publication with relocation and other cooperating writers. */
export async function researchRecordCommand(args: string[], root: string): Promise<Result> {
  const candidatePath = args[1];
  const runIndex = args.indexOf('--run-dir');
  const dir = runIndex < 0 ? undefined : args[runIndex + 1];
  if (!candidatePath || !dir) return { code: 2, result: { status: 'unreadable' } };
  try {
    const candidate = await boundedJson(candidatePath);
    const errors = researchViolations(candidate);
    if (errors.length) return rejected(errors);
    const record = candidate as ResearchRecord;
    // Pretty printing can push a legal compact input over the next read's cap.
    // Keep readable JSON when it fits, otherwise publish the compact encoding.
    const pretty = JSON.stringify(record, null, 2) + '\n';
    const encoded = Buffer.byteLength(pretty) <= RESEARCH_LIMITS.bytes ? pretty : JSON.stringify(record);
    if (Buffer.byteLength(encoded) > RESEARCH_LIMITS.bytes) return rejected(['published record exceeds 64 KiB']);
    await directory(root);
    return await withStateLock(root, async () => {
      const state = await readState(path.join(root, 'state.js'));
      if (dir !== runDirName(state) || dir === '.' || dir === '..' || path.basename(dir) !== dir) return rejected(['run-dir must name the current run']);
      if (record.requirementIds.some(id => !state.requirements.some(requirement => requirement.id === id))) {
        return rejected(['requirementIds must name requirements in the current run']);
      }
      const run = path.join(root, dir);
      await directory(run);
      const folder = path.join(run, 'research');
      try { await directory(folder); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        await mkdir(folder);
      }
      const entries = await readdir(folder);
      if (entries.length > RESEARCH_LIMITS.records) return rejected(['research history exceeds 128 records']);
      const history: ResearchRecord[] = [];
      for (const name of entries) {
        if (!/^Q\d{2,4}\.json$/.test(name)) return rejected(['research directory contains an unrecognized entry']);
        const previous = await boundedJson(path.join(folder, name));
        if (researchViolations(previous).length || (previous as ResearchRecord).id + '.json' !== name) return rejected(['research history is invalid']);
        history.push(previous as ResearchRecord);
      }
      if (!historyIsValid(history)) return rejected(['research supersession history is invalid']);
      // A retry is allowed even if its record has since been superseded.
      const existing = history.find(item => item.id === record.id);
      if (existing) {
        if (!isDeepStrictEqual(existing, record)) return rejected(['record ID already holds different evidence']);
        log.info('publish', 'identical record kept', { id: record.id });
        return { code: 0, result: { status: 'kept', id: record.id, researchStatus: record.status } };
      }
      if (history.length >= RESEARCH_LIMITS.records) return rejected(['research history reached 128 records']);
      const sameQuestion = history.filter(item => item.question === record.question && item.dependency.name === record.dependency.name);
      const current = sameQuestion.filter(item => !history.some(next => next.supersedes === item.id));
      if (sameQuestion.length === 0 ? record.supersedes !== null : current.length !== 1 || current[0]!.id !== record.supersedes) {
        return rejected(['supersedes must name the current record for this question and dependency, or null for a new question']);
      }
      await atomicText(path.join(folder, record.id + '.json'), encoded);
      log.info('publish', 'research record written', { id: record.id, status: record.status, sources: record.sources.length });
      if (record.status === 'unresolved') log.warn('uncertainty', 'external contract remains unresolved', { id: record.id });
      return { code: 0, result: { status: 'written', id: record.id, researchStatus: record.status } };
    });
  } catch (error) {
    if (error instanceof UnsafeResearchPathError || error instanceof StateBusyError) return rejected([error.message]);
    log.error('input', 'research input or history could not be read');
    return { code: 2, result: { status: 'unreadable' } };
  }
}
