// Import and publication share the publisher's lock; only its receipt permits cleanup.
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { candidateMode, isRecord, type Viewer, type ValidationEnvelope } from './publication.mts';
import { replayTools } from './state/replay-tools.mts';
import { importEvidence } from './state/evidence.mts';
import type { RunState } from './state/contract.mts';
import { createLogger } from './shared/log.mts';
const log = createLogger('evidence-import');
const option = (args: string[], key: string): string | undefined => {
  const index = args.indexOf(key);
  return index < 0 ? undefined : args[index + 1];
};
export async function evidenceImportCommand(args: string[], dir: string, viewer: Viewer,
  snapshots: (state: RunState | null, envelope: ValidationEnvelope) => Promise<void>) {
  const source = option(args, '--source');
  const mapFile = option(args, '--sources');
  let sources: Record<string, string>;
  try {
    if (!source || !mapFile) throw new Error('missing input');
    const raw: unknown = JSON.parse(await readFile(mapFile, 'utf8'));
    if (!isRecord(raw) || !Object.values(raw).every(v => typeof v === 'string' && v.length)) throw new Error('invalid map');
    sources = raw as Record<string, string>;
  } catch { return { code: 2, result: { status: 'unreadable', cleanupEligible: false, reason: 'source directory and JSON evidence-ID/source-path map are required' } }; }
  const outcome = await candidateMode(['--publish', ...args.slice(1)], dir, viewer, snapshots, async (state, previous) => {
    const records = [...state.verification!.evidence, ...replayTools(state)];
    const prior = previous ? [...previous.verification!.evidence, ...replayTools(previous)] : [];
    const added = records.filter(e => !prior.some(old => old.id === e.id));
    const missing = added.filter(e => !Object.hasOwn(sources, e.id));
    const unknown = Object.keys(sources).filter(id => !records.some(e => e.id === id));
    if (missing.length || unknown.length) return [{ field: 'import.sources', message: `source map must cover every new artifact and only declared IDs; missing: ${missing.map(e => e.id).join(', ')}; unknown: ${unknown.join(', ')}` }];
    return importEvidence(state, path.dirname(dir), source!, sources);
  });
  const cleanupEligible = outcome.code === 0 && outcome.result.status === 'published';
  log[cleanupEligible ? 'info' : 'error']('publish', cleanupEligible ? 'artifacts sealed and state published' : 'import/publication refused; retain source workspace', { count: Object.keys(sources).length });
  return { ...outcome, result: { ...outcome.result, cleanupEligible, importedIds: cleanupEligible ? Object.keys(sources) : [] } };
}
