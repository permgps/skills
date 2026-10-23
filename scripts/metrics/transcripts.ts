// Reads what Claude Code wrote about a project's sessions: one entry per model
// call, with its usage, its time and the context it ran in.
//
// The format is the host's and it is unversioned. It was mapped against
// `MAPPED_HOST_VERSION`; a record from another version is still read, and the
// measurement says which versions it saw. Three facts about the format shape
// everything here:
//
// - **One call is written as several lines.** The host writes a line per
//   content block — thinking, text, each tool call — and every one of them
//   carries the same usage. Summing lines overstates every total, so a call is
//   one unique `message.id`, its usage taken from its last record.
// - **A resumed session replays earlier records into its new file**, whole:
//   same message id, same timestamp. The dedupe therefore runs across every
//   file read, and main sessions are read in the order they ended, so a
//   replayed call stays with the session that made it — a resumed session holds
//   every record of the one it resumed and ends later.
// - **The host deletes transcripts** older than its `cleanupPeriodDays`
//   setting, 30 days by default. A прогон older than that cannot be measured.
//
// Nothing a session said is kept: no message text, tool input or tool result
// survives the parse. A context keeps its dispatch `description` only, because
// that label is what attributes it to a role; the caller never prints it.

import { readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import { createLogger } from '../shared/log.ts';

const log = createLogger('metrics');

/** Hosts whose transcripts are mapped. Every other host is answered «not supported». */
export const SUPPORTED_HOSTS = ['claude-code'] as const;
export type SupportedHost = typeof SUPPORTED_HOSTS[number];

/** The Claude Code version the format below was read from, on 2026-10-23. */
export const MAPPED_HOST_VERSION = '2.1.309';

/** What the host writes in place of a model for its own local messages. */
export const SYNTHETIC_MODEL = '<synthetic>';

/** Each usage kind's price as a multiple of the same model's uncached input. */
export interface PriceRatios {
  input: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
  output: number;
}

/**
 * Anthropic's list-price ratios, confirmed through the `claude-api` skill on
 * 2026-10-23. Writes and output are the same multiple on every current model;
 * the cache read is not, so a unit is a ratio to one model's input price and
 * units of two models do not add up to anything a bill would show.
 */
export const DEFAULT_RATIOS: PriceRatios = { input: 1, cacheWrite5m: 1.25, cacheWrite1h: 2, cacheRead: 0.1, output: 5 };

/** Models whose cache read is priced below the default tenth. */
export const CACHE_READ_RATIO_BY_MODEL: Readonly<Record<string, number>> = {
  'claude-opus-5-5': 0.05,
  'claude-fable-5-1': 0.025,
  'claude-mythos-5-1': 0.025,
};

export const ratiosFor = (model: string): PriceRatios =>
  ({ ...DEFAULT_RATIOS, cacheRead: CACHE_READ_RATIO_BY_MODEL[model] ?? DEFAULT_RATIOS.cacheRead });

export interface Usage {
  input: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
  output: number;
  /** `false` when the record gave no 5m/1h split and every write was counted as 5-minute. */
  writeSplit: boolean;
}

export interface Call {
  messageId: string;
  /** ISO 8601, from the call's first record. */
  at: string;
  model: string;
  usage: Usage;
  /** Everything the call read: uncached input, cache writes and cache reads. */
  contextTokens: number;
  /** The skill the host attributed the call to, when it recorded one. */
  skill?: string;
}

export type DescriptionSource = 'meta' | 'tool-result' | 'none';

export interface Context {
  kind: 'main' | 'subagent';
  sessionId: string;
  agentId?: string;
  file: string;
  /** The dispatch label. Kept for attribution; never printed. */
  description?: string;
  descriptionSource: DescriptionSource;
  /** Records of a subagent written into its parent's file, as older host versions did. */
  inlineSidechain: boolean;
  /**
   * Every skill the host attributed a record of this file's own session to,
   * replayed records included, sorted. A resumed прогон is recognised by the
   * records it replayed even when its new calls carry no skill.
   */
  skillsSeen: string[];
  /** In time order. */
  calls: Call[];
}

export interface UnparsedLine {
  file: string;
  /** 1-based; `0` for a whole file such as an unreadable meta file. */
  line: number;
}

export interface Transcripts {
  logDir: string;
  contexts: Context[];
  /** Lines that repeated a call already seen. */
  duplicateLines: number;
  unparsed: UnparsedLine[];
  syntheticRecords: number;
  hostVersions: string[];
}

/** The log directory is missing or is not a directory. */
export class TranscriptsUnavailableError extends Error {
  readonly logDir: string;
  readonly reason: string;

  constructor(logDir: string, reason: string) {
    super(`no transcripts at ${logDir}: ${reason}`);
    this.name = 'TranscriptsUnavailableError';
    this.logDir = logDir;
    this.reason = reason;
  }
}

/**
 * Where Claude Code keeps a project's transcripts: the absolute project path
 * with every character outside `[A-Za-z0-9]` replaced by `-`, under
 * `projects/` of its config directory. A path the host shortens is not
 * reproduced here; `--log-dir` names it instead.
 */
export function defaultLogDir(projectDir: string, env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  const configDir = env['CLAUDE_CONFIG_DIR'] ?? path.join(home, '.claude');
  const encoded = path.resolve(projectDir).replace(/[^A-Za-z0-9]/g, '-');
  return path.join(configDir, 'projects', encoded);
}

/** A call's cost in its model's input-price units. */
export function unitsOf(usage: Usage, model: string): number {
  const ratios = ratiosFor(model);
  return usage.input * ratios.input
    + usage.cacheWrite5m * ratios.cacheWrite5m
    + usage.cacheWrite1h * ratios.cacheWrite1h
    + usage.cacheRead * ratios.cacheRead
    + usage.output * ratios.output;
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const count = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
const text = (value: unknown): string | undefined => typeof value === 'string' && value !== '' ? value : undefined;

/** The usage of one record, or `undefined` when it lacks a field a call needs. */
function readUsage(raw: unknown): Usage | undefined {
  if (!isObject(raw)) return undefined;
  const input = count(raw['input_tokens']);
  const output = count(raw['output_tokens']);
  if (input === undefined || output === undefined) return undefined;
  const created = count(raw['cache_creation_input_tokens']) ?? 0;
  const cacheRead = count(raw['cache_read_input_tokens']) ?? 0;
  const split = isObject(raw['cache_creation']) ? raw['cache_creation'] : undefined;
  const fiveMinutes = count(split?.['ephemeral_5m_input_tokens']);
  const oneHour = count(split?.['ephemeral_1h_input_tokens']);
  if (fiveMinutes === undefined || oneHour === undefined) {
    return { input, cacheWrite5m: created, cacheWrite1h: 0, cacheRead, output, writeSplit: created === 0 };
  }
  return { input, cacheWrite5m: fiveMinutes, cacheWrite1h: oneHour, cacheRead, output, writeSplit: true };
}

interface Sighting {
  context: Context;
  at: string;
  model: string;
  usage: Usage;
  skill?: string;
  lines: number;
}

interface FileJob {
  file: string;
  kind: 'main' | 'subagent';
  sessionId: string;
  agentId?: string;
  meta?: string;
}

const exists = async (target: string): Promise<boolean> => stat(target).then(() => true, () => false);

/** The time of a file's last timestamped record, or `+∞` when it has none. */
async function lastRecordAt(file: string): Promise<number> {
  const lines = (await readFile(file, 'utf8')).split('\n');
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    let record: unknown;
    try { record = JSON.parse(lines[index] as string); } catch { continue; }
    const at = isObject(record) ? text(record['timestamp']) : undefined;
    if (at !== undefined && !Number.isNaN(Date.parse(at))) return Date.parse(at);
  }
  return Number.POSITIVE_INFINITY;
}

/**
 * Every transcript file under the log directory: main sessions first, in the
 * order they ended (then by name), then subagents in name order.
 */
async function listFiles(logDir: string): Promise<FileJob[]> {
  const entries = await readdir(logDir, { withFileTypes: true });
  const mains: Array<FileJob & { endedAt: number }> = [];
  const subagents: FileJob[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      const file = path.join(logDir, entry.name);
      mains.push({ file, kind: 'main', sessionId: entry.name.slice(0, -'.jsonl'.length), endedAt: await lastRecordAt(file) });
      continue;
    }
    if (!entry.isDirectory()) continue;
    const dir = path.join(logDir, entry.name, 'subagents');
    if (!await exists(dir)) continue;
    for (const name of (await readdir(dir)).sort()) {
      const match = /^agent-(.+)\.jsonl$/.exec(name);
      if (match === null) continue;
      const agentId = match[1] ?? '';
      subagents.push({
        file: path.join(dir, name), kind: 'subagent', sessionId: entry.name, agentId,
        meta: path.join(dir, `agent-${agentId}.meta.json`),
      });
    }
  }
  // The sort is stable, so sessions that ended at the same moment keep name
  // order; `|| 0` does the same for two with no timestamp at all (∞ − ∞).
  mains.sort((a, b) => a.endedAt - b.endedAt || 0);
  log.debug('transcripts', 'main sessions ordered by their last record', { sessions: mains.length });
  return [...mains, ...subagents];
}

/**
 * Read every transcript under `logDir`.
 *
 * Throws `TranscriptsUnavailableError` when the directory is missing; an empty
 * directory is a legal answer and gives no contexts. An unparsable line is
 * counted with its position and the rest of the file is still read.
 */
export async function readTranscripts(logDir: string): Promise<Transcripts> {
  const info = await stat(logDir).catch((error: unknown) => {
    const reason = error instanceof Error ? error.message : String(error);
    throw new TranscriptsUnavailableError(logDir, reason);
  });
  if (!info.isDirectory()) throw new TranscriptsUnavailableError(logDir, 'not a directory');

  const contexts: Context[] = [];
  const sightings = new Map<string, Sighting>();
  const unparsed: UnparsedLine[] = [];
  const versions = new Set<string>();
  const descriptionsFromResults = new Map<string, string>();
  let duplicateLines = 0;
  let syntheticRecords = 0;

  for (const job of await listFiles(logDir)) {
    const context: Context = {
      kind: job.kind, sessionId: job.sessionId, file: job.file,
      descriptionSource: 'none', inlineSidechain: false, skillsSeen: [], calls: [],
      ...job.agentId === undefined ? {} : { agentId: job.agentId },
    };
    if (job.meta !== undefined && await exists(job.meta)) {
      try {
        const meta: unknown = JSON.parse(await readFile(job.meta, 'utf8'));
        const description = isObject(meta) ? text(meta['description']) : undefined;
        if (description !== undefined) {
          context.description = description;
          context.descriptionSource = 'meta';
        }
      } catch {
        unparsed.push({ file: job.meta, line: 0 });
        log.warn('transcripts', 'meta file unreadable', { file: job.meta });
      }
    }
    contexts.push(context);
    // Older hosts wrote a subagent's records into the parent's file. Each such
    // agent gets a context of its own, so it is never folded into the orchestrator.
    const inline = new Map<string, Context>();
    const skillsHere = new Set<string>();

    const lines = (await readFile(job.file, 'utf8')).split('\n');
    let calls = 0;
    let unparsedHere = 0;
    for (const [index, line] of lines.entries()) {
      if (line.trim() === '') continue;
      let record: unknown;
      try { record = JSON.parse(line); } catch { record = undefined; }
      if (!isObject(record)) {
        unparsed.push({ file: job.file, line: index + 1 });
        unparsedHere += 1;
        log.warn('transcripts', 'line unparsable', { file: job.file, line: index + 1 });
        continue;
      }
      const version = text(record['version']);
      if (version !== undefined) versions.add(version);

      const result = record['toolUseResult'];
      if (record['type'] === 'user' && isObject(result)) {
        const agentId = text(result['agentId']);
        const description = text(result['description']);
        if (agentId !== undefined && description !== undefined) descriptionsFromResults.set(agentId, description);
        continue;
      }
      if (record['type'] !== 'assistant') continue;
      // Read before the dedupe, so a replayed record still says whose session this is.
      const skill = text(record['attributionSkill']);
      if (skill !== undefined && record['isSidechain'] !== true) skillsHere.add(skill);

      const message = record['message'];
      const messageId = isObject(message) ? text(message['id']) : undefined;
      const model = isObject(message) ? text(message['model']) : undefined;
      const usage = isObject(message) ? readUsage(message['usage']) : undefined;
      const at = text(record['timestamp']);
      if (model === SYNTHETIC_MODEL) {
        syntheticRecords += 1;
        continue;
      }
      if (messageId === undefined || model === undefined || usage === undefined || at === undefined || Number.isNaN(Date.parse(at))) {
        unparsed.push({ file: job.file, line: index + 1 });
        unparsedHere += 1;
        log.warn('transcripts', 'assistant record without a usable call', { file: job.file, line: index + 1 });
        continue;
      }

      const earlier = sightings.get(messageId);
      if (earlier !== undefined) {
        earlier.usage = usage;
        earlier.lines += 1;
        duplicateLines += 1;
        continue;
      }

      let owner = context;
      if (job.kind === 'main' && record['isSidechain'] === true) {
        const agentId = text(record['agentId']) ?? 'unknown';
        owner = inline.get(agentId) ?? {
          kind: 'subagent', sessionId: job.sessionId, agentId, file: job.file,
          descriptionSource: 'none', inlineSidechain: true, skillsSeen: [], calls: [],
        };
        if (!inline.has(agentId)) {
          inline.set(agentId, owner);
          contexts.push(owner);
        }
      }
      sightings.set(messageId, { context: owner, at, model, usage, lines: 1, ...skill === undefined ? {} : { skill } });
      calls += 1;
    }
    context.skillsSeen = [...skillsHere].sort();
    log.debug('transcripts', 'file read', {
      file: job.file, kind: job.kind, lines: lines.length, calls, unparsed: unparsedHere, skills: context.skillsSeen,
    });
  }

  for (const [messageId, sighting] of sightings) {
    if (sighting.lines > 1) log.debug('transcripts', 'call written over several lines counted once', { messageId, lines: sighting.lines });
    const { usage } = sighting;
    sighting.context.calls.push({
      messageId, at: sighting.at, model: sighting.model, usage,
      contextTokens: usage.input + usage.cacheWrite5m + usage.cacheWrite1h + usage.cacheRead,
      ...sighting.skill === undefined ? {} : { skill: sighting.skill },
    });
  }
  for (const context of contexts) {
    context.calls.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    if (context.kind !== 'subagent' || context.description !== undefined || context.agentId === undefined) continue;
    const description = descriptionsFromResults.get(context.agentId);
    if (description !== undefined) {
      context.description = description;
      context.descriptionSource = 'tool-result';
    }
  }

  const hostVersions = [...versions].sort();
  for (const version of hostVersions) {
    if (version !== MAPPED_HOST_VERSION) {
      log.warn('transcripts', 'host version differs from the one the format was mapped against', { version, mapped: MAPPED_HOST_VERSION });
    }
  }
  log.info('transcripts', 'transcripts read', {
    logDir, contexts: contexts.length, calls: sightings.size, duplicateLines, unparsed: unparsed.length, syntheticRecords,
  });
  return { logDir, contexts, duplicateLines, unparsed, syntheticRecords, hostVersions };
}
