// A project's OpenSpec requirements, read so a прогон cannot silently break one.
//
// Some projects keep their approved behaviour in OpenSpec: one `spec.md` per
// capability under `openspec/specs/`, each requirement under a
// `### Requirement: <name>` heading. Briefing reads that index to find a бриф
// that contradicts an approved requirement, and the closing publish compares an
// export against it. Both need the same answer to "which requirement is this",
// so the reading is code rather than a paragraph: a name re-derived by
// judgement in two phases would match in one and miss in the other.
//
// The rules follow what OpenSpec itself parses, written here from its
// behaviour rather than copied (D1): requirements live only under
// `## Requirements`, lines inside a fenced block are not structure, any `####`
// heading inside a requirement is a scenario, and a name is compared trimmed,
// without a closing run of `#`, case kept. Nothing is recorded in the run
// state; the tree is the fact, so a resumed phase derives the same index.
//
// Contract: docs/spec/phases.md, "Existing OpenSpec Requirements" and
// "OpenSpec Export".

import { spawn, type ChildProcess } from 'node:child_process';
import type { Dirent, Stats } from 'node:fs';
import { lstat, mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { parseAnswers, parseOpenSpecDisposition } from './answers.mts';
import { createLogger } from './shared/log.mts';
import type { RunState } from './state/contract.mts';
import { runDirName } from './state/paths.mts';
import { deriveVerification } from './state/verification.mts';

const log = createLogger('openspec');

export const OPENSPEC_DIR = 'openspec';
/** A project is OpenSpec-initialised when one of these is a regular file; a bare directory is not. */
export const CONFIG_FILES: readonly string[] = ['config.yaml', 'config.yml'];
/** At most this many spec files are read; past it the index says `incomplete`. */
export const SPEC_FILE_LIMIT = 500;
/** A spec file larger than this is not read, and the index says `incomplete`. */
export const SPEC_BYTE_LIMIT = 256 * 1024;
/** `.openspec.yaml` is a handful of keys; anything larger is not one. */
export const METADATA_BYTE_LIMIT = 64 * 1024;
/** Every change a Maestro run writes is named `maestro-<run dir>`. */
export const MAESTRO_CHANGE_PREFIX = 'maestro-';

export interface OpenSpecRequirement {
  name: string;
  scenarios: string[];
}

export interface OpenSpecCapability {
  /** The capability path under `openspec/specs/`, POSIX, nested paths allowed. */
  capability: string;
  /** Project-relative POSIX path of its `spec.md`. */
  path: string;
  requirements: OpenSpecRequirement[];
}

export interface OpenSpecChange {
  name: string;
  /** The run a Maestro export names in `x-maestro-run`, or `null` for any other change. */
  maestroRun: string | null;
}

export interface ArchivedMaestroChange {
  /** The folder under `openspec/changes/archive/`, `<YYYY-MM-DD>-maestro-<dir>`. */
  folder: string;
  /** The change name it was archived under, `maestro-<dir>`. */
  change: string;
}

export interface OpenSpecIndex {
  present: boolean;
  /** The config file that made the project OpenSpec-initialised, project-relative POSIX. */
  anchor: string | null;
  capabilities: OpenSpecCapability[];
  changes: OpenSpecChange[];
  archived: ArchivedMaestroChange[];
  /** True when a bound was reached or a file could not be read: never proof that nothing conflicts. */
  incomplete: boolean;
  reasons: string[];
  unreadable: string[];
}

const posix = (relative: string): string => relative.split(path.sep).join('/');

function inside(rootReal: string, candidateReal: string): boolean {
  const relative = path.relative(rootReal, candidateReal);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * Remove a CommonMark closing run of `#` and the blanks around it. A run closes
 * the heading only when a space or tab precedes it, so `C#` keeps its `#`.
 * Written as a scan rather than a regex: `[ \t]+#+[ \t]*$` backtracks
 * quadratically over a long run of blanks.
 */
function stripClosingHashes(text: string): string {
  let end = text.length;
  while (end > 0 && (text[end - 1] === ' ' || text[end - 1] === '\t')) end -= 1;
  let hashes = end;
  while (hashes > 0 && text[hashes - 1] === '#') hashes -= 1;
  if (hashes === end || hashes === 0) return text;
  if (text[hashes - 1] !== ' ' && text[hashes - 1] !== '\t') return text;
  let start = hashes;
  while (start > 0 && (text[start - 1] === ' ' || text[start - 1] === '\t')) start -= 1;
  return text.slice(0, start);
}

/** A requirement name as OpenSpec compares it: trimmed, no closing `#` run, case kept. */
export function normalizeRequirementName(raw: string): string {
  return stripClosingHashes(raw).trim();
}

/** Case- and blank-folded, only to catch a near-miss — two spellings of one name are a mistake, never two requirements. */
export function foldRequirementName(raw: string): string {
  return normalizeRequirementName(raw).toLowerCase().split(/\s+/).filter(Boolean).join(' ');
}

/** A scenario's name: the `####` heading text without a closing run and without a `Scenario:` prefix. */
export function scenarioName(headerText: string): string {
  return stripClosingHashes(headerText).trim().replace(/^Scenario:\s*/i, '').trim();
}

export const splitLines = (text: string): string[] => text.replace(/\r\n?/g, '\n').split('\n');

const FENCE_OPEN = /^\s*(`{3,}|~{3,})/;
const FENCE_CLOSE = /^\s*(`{3,}|~{3,})\s*$/;

/** True for every line inside a fenced block, its fence lines included. An unclosed fence runs to the end, as in CommonMark. */
export function fenceMask(lines: readonly string[]): boolean[] {
  const mask = new Array<boolean>(lines.length).fill(false);
  let open: { marker: string; length: number } | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (!open) {
      const match = FENCE_OPEN.exec(line);
      if (match) { open = { marker: match[1]![0]!, length: match[1]!.length }; mask[index] = true; }
      continue;
    }
    mask[index] = true;
    const close = FENCE_CLOSE.exec(line);
    if (close && close[1]![0] === open.marker && close[1]!.length >= open.length) open = null;
  }
  return mask;
}

export const REQUIREMENT_HEADER = /^###\s*Requirement:\s*(.+)$/i;
export const SCENARIO_HEADER = /^####\s+(.*)$/;
const TOP_LEVEL_HEADER = /^##\s+/;

export interface RequirementBlock {
  name: string;
  /** The block's lines, its heading included, as written. */
  lines: string[];
  scenarios: string[];
}

/**
 * The requirement blocks of one `##` section, from the line after its heading
 * to the next unfenced `##` heading. Used for `## Requirements` of a main spec
 * and for the delta sections of a change.
 */
export function sectionBlocks(lines: readonly string[], mask: readonly boolean[], heading: RegExp): RequirementBlock[] | null {
  const start = lines.findIndex((line, index) => !mask[index] && heading.test(line));
  if (start < 0) return null;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (!mask[index] && TOP_LEVEL_HEADER.test(lines[index]!)) { end = index; break; }
  }
  const blocks: RequirementBlock[] = [];
  let current: RequirementBlock | null = null;
  for (let index = start + 1; index < end; index += 1) {
    const line = lines[index]!;
    const header = mask[index] ? null : REQUIREMENT_HEADER.exec(line);
    if (header) {
      current = { name: normalizeRequirementName(header[1]!), lines: [line], scenarios: [] };
      blocks.push(current);
      continue;
    }
    if (!current) continue;
    current.lines.push(line);
    const scenario = mask[index] ? null : SCENARIO_HEADER.exec(line);
    if (scenario) current.scenarios.push(scenarioName(scenario[1]!));
  }
  return blocks;
}

/** The requirements of a main spec file, in file order; none when it has no `## Requirements` section. */
export function parseSpecRequirements(text: string): OpenSpecRequirement[] {
  const lines = splitLines(text);
  const blocks = sectionBlocks(lines, fenceMask(lines), /^##\s+Requirements\s*$/i) ?? [];
  return blocks.map(block => ({ name: block.name, scenarios: block.scenarios }));
}

/** The `x-maestro-run` value of a `.openspec.yaml`, or `null`. Only a top-level key counts, as OpenSpec reads only top-level `x-` keys. */
export function maestroRunOf(metadata: string): string | null {
  for (const line of splitLines(metadata)) {
    const match = /^x-maestro-run:[ \t]*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[1]!.trim();
    const quoted = /^(["'])(.*)\1$/.exec(value);
    if (quoted) value = quoted[2]!;
    else {
      const comment = value.search(/[ \t]#/);
      if (comment >= 0) value = value.slice(0, comment).trim();
    }
    return value === '' ? null : value;
  }
  return null;
}

/** Whether the project is OpenSpec-initialised: a config file, inside the project, through no escaping symlink. */
export async function detectOpenSpec(projectRoot: string): Promise<{ present: boolean; anchor: string | null }> {
  const rootReal = await realpath(projectRoot);
  const dir = path.join(projectRoot, OPENSPEC_DIR);
  let dirReal: string;
  try { dirReal = await realpath(dir); }
  catch { log.debug('detect', 'no openspec directory', { checked: OPENSPEC_DIR }); return { present: false, anchor: null }; }
  if (!inside(rootReal, dirReal)) {
    log.warn('detect', 'openspec directory resolves outside the project; treated as absent', { checked: OPENSPEC_DIR });
    return { present: false, anchor: null };
  }
  for (const name of CONFIG_FILES) {
    const relative = `${OPENSPEC_DIR}/${name}`;
    try {
      const fileReal = await realpath(path.join(dir, name));
      if (!inside(rootReal, fileReal)) { log.warn('detect', 'config resolves outside the project; skipped', { checked: relative }); continue; }
      if (!(await stat(fileReal)).isFile()) { log.debug('detect', 'config is not a regular file', { checked: relative }); continue; }
      log.info('detect', 'openspec present', { anchor: relative });
      return { present: true, anchor: relative };
    } catch {
      log.debug('detect', 'config absent', { checked: relative });
    }
  }
  log.info('detect', 'openspec absent: no config file', { checked: CONFIG_FILES.map(name => `${OPENSPEC_DIR}/${name}`) });
  return { present: false, anchor: null };
}

async function entries(dir: string): Promise<Dirent[]> {
  const list = await readdir(dir, { withFileTypes: true });
  return list.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Every `spec.md` under `openspec/specs/`, in name order, without following symlinks. */
async function specFiles(specsDir: string, index: OpenSpecIndex): Promise<string[]> {
  const found: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    let list: Dirent[];
    try { list = await entries(dir); }
    catch (error) {
      index.unreadable.push(posix(path.relative(path.dirname(path.dirname(specsDir)), dir)));
      log.warn('index', 'directory could not be listed', { reason: error instanceof Error ? error.message : String(error) });
      return;
    }
    for (const entry of list) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) { log.debug('index', 'symlink not followed', { name: entry.name }); continue; }
      if (entry.isDirectory()) { await walk(full); continue; }
      if (entry.isFile() && entry.name === 'spec.md') found.push(full);
    }
  };
  await walk(specsDir);
  return found;
}

/**
 * The requirement index of the project: capabilities with their requirement and
 * scenario names, in-flight changes and archived Maestro changes. Bounded, and it
 * never throws for a file it cannot use — that file is named and the index says
 * `incomplete`.
 */
export async function readOpenSpecIndex(projectRoot: string): Promise<OpenSpecIndex> {
  const detected = await detectOpenSpec(projectRoot);
  const index: OpenSpecIndex = {
    present: detected.present, anchor: detected.anchor,
    capabilities: [], changes: [], archived: [], incomplete: false, reasons: [], unreadable: [],
  };
  if (!detected.present) return index;
  const base = path.join(projectRoot, OPENSPEC_DIR);
  const relativeTo = (full: string): string => posix(path.relative(projectRoot, full));

  const specsDir = path.join(base, 'specs');
  const files = await specFiles(specsDir, index).catch(() => [] as string[]);
  if (files.length > SPEC_FILE_LIMIT) {
    index.incomplete = true;
    index.reasons.push(`more than ${SPEC_FILE_LIMIT} spec files; the first ${SPEC_FILE_LIMIT} in name order were read`);
    log.warn('index', 'spec file bound reached', { found: files.length, read: SPEC_FILE_LIMIT });
  }
  for (const file of files.slice(0, SPEC_FILE_LIMIT)) {
    const relative = relativeTo(file);
    try {
      const size = (await stat(file)).size;
      if (size > SPEC_BYTE_LIMIT) {
        index.incomplete = true;
        index.reasons.push(`${relative} is ${size} bytes, over the ${SPEC_BYTE_LIMIT}-byte bound`);
        index.unreadable.push(relative);
        log.warn('index', 'spec file over the byte bound; not read', { path: relative, size });
        continue;
      }
      const requirements = parseSpecRequirements(await readFile(file, 'utf8'));
      const capability = posix(path.relative(specsDir, path.dirname(file)));
      index.capabilities.push({ capability, path: relative, requirements });
      log.debug('index', 'spec file read', { path: relative, requirements: requirements.length });
    } catch (error) {
      index.incomplete = true;
      index.unreadable.push(relative);
      index.reasons.push(`${relative} could not be read`);
      log.warn('index', 'spec file could not be read', { path: relative, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  const changesDir = path.join(base, 'changes');
  let changeEntries: Dirent[] = [];
  try { changeEntries = await entries(changesDir); }
  catch { log.debug('index', 'no changes directory', {}); }
  for (const entry of changeEntries) {
    if (!entry.isDirectory() || entry.name === 'archive') continue;
    index.changes.push({ name: entry.name, maestroRun: await readMaestroRun(path.join(changesDir, entry.name)) });
  }
  let archiveEntries: Dirent[] = [];
  try { archiveEntries = await entries(path.join(changesDir, 'archive')); }
  catch { log.debug('index', 'no archive directory', {}); }
  for (const entry of archiveEntries) {
    const match = /^\d{4}-\d{2}-\d{2}-(maestro-.+)$/.exec(entry.name);
    if (entry.isDirectory() && match) index.archived.push({ folder: entry.name, change: match[1]! });
  }

  log.info('index', 'openspec index read', {
    capabilities: index.capabilities.length,
    requirements: index.capabilities.reduce((sum, capability) => sum + capability.requirements.length, 0),
    changes: index.changes.length, archived: index.archived.length, incomplete: index.incomplete,
  });
  return index;
}

/** The `x-maestro-run` of a change folder, or `null` when it has none or it cannot be read. */
export async function readMaestroRun(changeDir: string): Promise<string | null> {
  const file = path.join(changeDir, '.openspec.yaml');
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.size > METADATA_BYTE_LIMIT) return null;
    return maestroRunOf(await readFile(file, 'utf8'));
  } catch { return null; }
}

/** `sync.mts --openspec-index`: the index as JSON. Exit 0 present or absent, 2 when the project root cannot be read. */
export async function openSpecIndexCommand(_args: string[], runDir: string): Promise<{ result: Record<string, unknown>; code: number }> {
  const projectRoot = path.dirname(runDir);
  try {
    return { result: { ...(await readOpenSpecIndex(projectRoot)) }, code: 0 };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.error('index', 'project root could not be read; nothing indexed', { reason });
    return { result: { error: `the project root could not be read (${reason}) — run this from the installed .maestro/sync.mts` }, code: 2 };
  }
}

// --- the export ---------------------------------------------------------------
//
// After a closure the writer drafts one change in `.maestro/<dir>/openspec/`;
// the closing publish checks it here and writes `openspec/changes/maestro-<dir>/`.
// The check is the reason the export is honest: a "SHALL" reaches the project's
// specification only for a requirement the verification projection says
// passed, a scenario only where the draft says one exists, and a change to
// approved behaviour only where `answers.md` records the user choosing it. The
// helper never merges (`openspec archive` is the user's) and never writes
// `openspec/specs/`, `archive/` or another change.

export type ExportStatus = 'written' | 'kept' | 'refused' | 'archived' | 'failed';
export type ValidationStatus = 'passed' | 'failed' | 'unavailable';

export interface OpenSpecExport {
  status: ExportStatus;
  /** `maestro-<dir>`. */
  change: string;
  validation?: ValidationStatus;
  /** What to fix, at most {@link PROBLEM_LIMIT}; on `refused`, `failed`, or a failed validation. */
  problems?: string[];
  /** Forks self-briefed against an approved requirement: the brief and it still disagree. */
  unresolved?: Array<{ requirementId: string; target: string }>;
}

export const PROBLEM_LIMIT = 20;
/** A change is a handful of files; past this the draft is not one. */
export const DRAFT_FILE_LIMIT = 200;
export const VALIDATE_TIMEOUT_MS = 30_000;
const CHANGE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CHANGE_NAME_MAX = 200;
const EXPORTABLE: readonly string[] = ['completed', 'closed_with_exceptions'];
const STATIC_FILES: readonly string[] = ['proposal.md', 'tasks.md', 'design.md', '.openspec.yaml'];
const DELTA_KINDS = ['ADDED', 'MODIFIED', 'REMOVED', 'RENAMED'] as const;
type DeltaKind = typeof DELTA_KINDS[number];

/** The draft as read from disk: project-independent relative POSIX paths to text. */
export type DraftFiles = Map<string, string>;

/** One `OpenSpec:` disposition the export may act on, keyed `<capability> › <name>`. */
export interface Authorisation {
  requirementId: string;
  disposition: 'keep' | 'replace' | 'remove' | 'rename';
  renamedTo: string | null;
  userAnswered: boolean;
}

export interface DraftContext {
  dir: string;
  /** The verification projection's per-requirement results. */
  results: Readonly<Record<string, string>>;
  /** Requirement ids an accepted exception covers, through a finding or an obligation. */
  excepted: ReadonlySet<string>;
  /** Requirement ids whose status is not `in-spec`: dropped, deferred, placeholder. */
  notInSpec: ReadonlySet<string>;
  /** Approved requirements by capability. */
  index: OpenSpecIndex;
  /** `answers.md` dispositions, last entry for a target winning. */
  authorisations: ReadonlyMap<string, Authorisation>;
}

export const targetKey = (capability: string, name: string): string => `${capability} › ${normalizeRequirementName(name)}`;

const SHALL = /\b(SHALL|MUST)\b/;
const REQUIREMENT_ID_FORMAT = /^R\d{2,}$/;

function sectionLines(lines: readonly string[], mask: readonly boolean[], heading: RegExp): string[] | null {
  const start = lines.findIndex((line, index) => !mask[index] && heading.test(line));
  if (start < 0) return null;
  const body: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (!mask[index] && TOP_LEVEL_HEADER.test(lines[index]!)) break;
    body.push(lines[index]!);
  }
  return body;
}

const deltaHeading = (kind: DeltaKind): RegExp => new RegExp(`^##\\s+${kind}\\s+Requirements\\s*$`, 'i');

/** A REMOVED or RENAMED bullet's requirement name: `- ### Requirement: X`, with or without backticks. */
function bulletName(text: string): string | null {
  let value = text.trim();
  if (value.startsWith('`') && value.endsWith('`') && value.length > 1) value = value.slice(1, -1).trim();
  const header = REQUIREMENT_HEADER.exec(value);
  return normalizeRequirementName(header ? header[1]! : value) || null;
}

/** Whether a requirement block has text before its first scenario with SHALL or MUST, and a scenario with a body. */
function blockShape(block: RequirementBlock): { normative: boolean; scenarioWithBody: boolean } {
  const mask = fenceMask(block.lines);
  const firstScenario = block.lines.findIndex((line, index) => index > 0 && !mask[index] && SCENARIO_HEADER.test(line));
  const text = block.lines.slice(1, firstScenario < 0 ? undefined : firstScenario).join('\n');
  let scenarioWithBody = false;
  for (let index = 1; index < block.lines.length; index += 1) {
    if (mask[index] || !SCENARIO_HEADER.test(block.lines[index]!)) continue;
    for (let next = index + 1; next < block.lines.length; next += 1) {
      if (!mask[next] && /^#{1,4}\s/.test(block.lines[next]!)) break;
      if (block.lines[next]!.trim() !== '') { scenarioWithBody = true; break; }
    }
  }
  return { normative: SHALL.test(text), scenarioWithBody };
}

function multisetMissing(current: readonly string[], incoming: readonly string[]): string[] {
  const remaining = new Map<string, number>();
  for (const name of incoming) remaining.set(name, (remaining.get(name) ?? 0) + 1);
  const missing: string[] = [];
  for (const name of current) {
    const left = remaining.get(name) ?? 0;
    if (left > 0) remaining.set(name, left - 1);
    else missing.push(name);
  }
  return missing;
}

/** The `## Why` body length and whether `## What Changes` exists, the two sections OpenSpec requires. */
function proposalProblems(text: string): string[] {
  const lines = splitLines(text);
  const mask = fenceMask(lines);
  const why = sectionLines(lines, mask, /^##\s+Why\s*$/i);
  const problems: string[] = [];
  if (why === null) problems.push('proposal.md has no "## Why" section — add one saying why the change exists, 50 to 1000 characters');
  else {
    const length = why.join('\n').trim().length;
    if (length < 50 || length > 1000) problems.push(`proposal.md "## Why" is ${length} characters — OpenSpec needs 50 to 1000`);
  }
  if (sectionLines(lines, mask, /^##\s+What Changes\s*$/i) === null) problems.push('proposal.md has no "## What Changes" section — add one listing what the change adds, modifies and removes');
  return problems;
}

/** A top-level `key: value` of the metadata file, or null. */
function metadataValue(metadata: string, key: string): string | null {
  for (const line of splitLines(metadata)) {
    if (!line.startsWith(`${key}:`)) continue;
    return line.slice(key.length + 1).trim();
  }
  return null;
}

function validDate(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === text;
}

/**
 * The `x-maestro-requirements` mapping: one line of JSON, which is also YAML,
 * from `<capability> › <Requirement name>` to the `R##` it came from. JSON
 * rather than YAML's own forms because nothing here parses YAML, and a
 * hand-rolled reader of nested YAML is a parser that disagrees with OpenSpec's.
 */
function requirementMap(metadata: string, problems: string[]): Map<string, string[]> | null {
  const raw = metadataValue(metadata, 'x-maestro-requirements');
  if (raw === null) { problems.push('.openspec.yaml has no x-maestro-requirements — map every exported requirement to its R ids, as one line of JSON'); return null; }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { problems.push('.openspec.yaml x-maestro-requirements is not one line of JSON — write {"<capability> › <Requirement name>": ["R01"]}'); return null; }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    problems.push('.openspec.yaml x-maestro-requirements is not an object — write {"<capability> › <Requirement name>": ["R01"]}');
    return null;
  }
  const map = new Map<string, string[]>();
  for (const [key, ids] of Object.entries(parsed as Record<string, unknown>)) {
    const separator = key.indexOf(' › ');
    if (separator <= 0) { problems.push(`x-maestro-requirements key "${key}" is not "<capability> › <Requirement name>"`); continue; }
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every(id => typeof id === 'string' && REQUIREMENT_ID_FORMAT.test(id))) {
      problems.push(`x-maestro-requirements "${key}" maps to no R ids — list the R## it came from`);
      continue;
    }
    map.set(targetKey(key.slice(0, separator).trim(), key.slice(separator + 3)), ids as string[]);
  }
  return map;
}

/**
 * Every problem with the draft, each saying what to do. An empty list means the
 * draft may be written. The check never reads the build: the verification
 * projection is what says a requirement passed.
 */
export function checkOpenSpecDraft(files: DraftFiles, context: DraftContext): string[] {
  const problems: string[] = [];
  const change = `${MAESTRO_CHANGE_PREFIX}${context.dir}`;
  if (!CHANGE_NAME.test(change) || change.length > CHANGE_NAME_MAX) {
    problems.push(`the change name ${change} is not lowercase kebab-case of at most ${CHANGE_NAME_MAX} characters — OpenSpec cannot take it; this run cannot be exported`);
  }
  for (const name of files.keys()) {
    if (STATIC_FILES.includes(name) || /^specs\/.+\/spec\.md$/.test(name)) continue;
    problems.push(`${name} is not part of an OpenSpec change — remove it from the draft`);
  }
  const proposal = files.get('proposal.md');
  if (proposal === undefined) problems.push('the draft has no proposal.md — write one with "## Why" and "## What Changes"');
  else problems.push(...proposalProblems(proposal));
  if (!files.has('tasks.md')) problems.push('the draft has no tasks.md — list the run\'s таски as "## 1. <group>" and "- [x] 1.1 <title>"');

  const metadata = files.get('.openspec.yaml');
  let mapping: Map<string, string[]> | null = null;
  if (metadata === undefined) problems.push('the draft has no .openspec.yaml — write schema, created, x-maestro-run and x-maestro-requirements');
  else {
    if (!metadataValue(metadata, 'schema')) problems.push('.openspec.yaml has no schema — write "schema: spec-driven"');
    const created = metadataValue(metadata, 'created');
    if (created === null || !validDate(created)) problems.push('.openspec.yaml created is not a YYYY-MM-DD date — write the closing day');
    const owner = maestroRunOf(metadata);
    if (owner !== context.dir) problems.push(`.openspec.yaml x-maestro-run is ${owner ?? 'missing'} — write "x-maestro-run: ${context.dir}"`);
    mapping = requirementMap(metadata, problems);
  }

  const exported = new Set<string>();
  let deltas = 0;
  const approved = (capability: string): OpenSpecRequirement[] =>
    context.index.capabilities.find(item => item.capability === capability)?.requirements ?? [];
  const nearMiss = (capability: string, name: string): string | undefined => {
    const fold = foldRequirementName(name);
    return approved(capability).find(item => item.name !== name && foldRequirementName(item.name) === fold)?.name;
  };
  const authorised = (capability: string, name: string, kind: Authorisation['disposition'], label: string): Authorisation | null => {
    const found = context.authorisations.get(targetKey(capability, name));
    if (found && found.disposition === kind && found.userAnswered) return found;
    problems.push(`${label} "${capability} › ${name}" changes approved behaviour without a user-answered "OpenSpec: ${capability} › ${name} — ${kind}" line in answers.md — move it back to ADDED under a new name, or leave it out`);
    return null;
  };
  const tracedIds = (capability: string, name: string, label: string): void => {
    const key = targetKey(capability, name);
    exported.add(key);
    const ids = mapping?.get(key);
    if (mapping && !ids) { problems.push(`${label} "${key}" is not in x-maestro-requirements — map it to the R## it came from`); return; }
    for (const id of ids ?? []) {
      const auth = [...context.authorisations.values()].find(item => item.requirementId === id && item.disposition === 'keep');
      if (auth) problems.push(`${key} maps ${id}, whose fork kept the approved requirement — leave ${id} out of the export`);
      else if (context.notInSpec.has(id)) problems.push(`${key} maps ${id}, which is dropped, deferred or a placeholder — leave it out`);
      else if (context.excepted.has(id)) problems.push(`${key} maps ${id}, which an accepted exception covers — the exception keeps the failure, so leave it out`);
      else if (context.results[id] !== 'passed') problems.push(`${key} maps ${id}, which is ${context.results[id] ?? 'not in the verification projection'} — only passed requirements are exported`);
    }
  };

  for (const [name, text] of files) {
    const match = /^specs\/(.+)\/spec\.md$/.exec(name);
    if (!match) continue;
    const capability = match[1]!;
    const lines = splitLines(text);
    const mask = fenceMask(lines);
    const known = approved(capability);
    const has = (requirement: string): OpenSpecRequirement | undefined => known.find(item => item.name === requirement);
    const seen = new Set<string>();
    const once = (requirement: string): void => {
      if (seen.has(requirement)) problems.push(`${name} names "${requirement}" twice — one delta per requirement`);
      seen.add(requirement);
    };
    for (const kind of DELTA_KINDS) {
      if (kind === 'REMOVED' || kind === 'RENAMED') continue;
      for (const block of sectionBlocks(lines, mask, deltaHeading(kind)) ?? []) {
        deltas += 1;
        once(block.name);
        const shape = blockShape(block);
        if (!shape.normative) problems.push(`${kind} "${capability} › ${block.name}" states neither SHALL nor MUST before its first scenario`);
        if (!shape.scenarioWithBody) problems.push(`${kind} "${capability} › ${block.name}" has no "####" scenario with a body — draw one from a recorded check, or leave the requirement out`);
        if (kind === 'ADDED') {
          if (has(block.name)) problems.push(`ADDED "${capability} › ${block.name}" already exists in openspec/specs — it would abort the archive; it needs a user-answered replace, or a new name`);
          const near = nearMiss(capability, block.name);
          if (near) problems.push(`ADDED "${capability} › ${block.name}" differs from the approved "${near}" only in case or spacing — use the approved name or a clearly new one`);
        } else {
          const current = has(block.name);
          if (!current) {
            const near = nearMiss(capability, block.name);
            problems.push(`MODIFIED "${capability} › ${block.name}" is not an approved requirement${near ? ` (did you mean "${near}"?)` : ''} — copy the name from the index exactly`);
          } else {
            authorised(capability, block.name, 'replace', 'MODIFIED');
            const missing = multisetMissing(current.scenarios, block.scenarios);
            if (missing.length > 0) problems.push(`MODIFIED "${capability} › ${block.name}" drops the scenario(s) ${missing.map(item => `"${item}"`).join(', ')} — restate the whole requirement with every current scenario`);
          }
        }
        tracedIds(capability, block.name, kind);
      }
    }
    for (const line of sectionLines(lines, mask, deltaHeading('REMOVED')) ?? []) {
      const header = REQUIREMENT_HEADER.exec(line);
      const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
      if (!header && !bullet) continue;
      const requirement = header ? normalizeRequirementName(header[1]!) : bulletName(bullet![1]!);
      if (!requirement) continue;
      deltas += 1;
      once(requirement);
      if (!has(requirement)) problems.push(`REMOVED "${capability} › ${requirement}" is not an approved requirement — copy the name from the index exactly`);
      else authorised(capability, requirement, 'remove', 'REMOVED');
    }
    const renamed = sectionLines(lines, mask, deltaHeading('RENAMED')) ?? [];
    let from: string | null = null;
    for (const line of renamed) {
      const pair = /^\s*[-*+]?\s*(FROM|TO):\s*(.*)$/i.exec(line);
      if (!pair) continue;
      const requirement = bulletName(pair[2]!);
      if (pair[1]!.toUpperCase() === 'FROM') {
        if (from !== null) problems.push(`RENAMED "${capability} › ${from}" has no TO line — pair every FROM with a TO`);
        from = requirement;
        continue;
      }
      if (from === null || !requirement) { problems.push(`a RENAMED TO line in ${name} has no FROM — pair every TO with a FROM`); continue; }
      deltas += 1;
      once(from);
      if (!has(from)) problems.push(`RENAMED "${capability} › ${from}" is not an approved requirement — copy the name from the index exactly`);
      else {
        const auth = authorised(capability, from, 'rename', 'RENAMED');
        if (auth && auth.renamedTo !== null && normalizeRequirementName(auth.renamedTo) !== requirement) {
          problems.push(`RENAMED "${capability} › ${from}" goes to "${requirement}", but answers.md says "${auth.renamedTo}" — use the user's name`);
        }
      }
      if (has(requirement)) problems.push(`RENAMED "${capability} › ${from}" goes to "${requirement}", which already exists — it would abort the archive`);
      from = null;
    }
    if (from !== null) problems.push(`RENAMED "${capability} › ${from}" has no TO line — pair every FROM with a TO`);
  }
  if (deltas === 0) problems.push('the draft has no requirement delta under specs/<capability>/spec.md — an OpenSpec change needs at least one');
  for (const key of mapping?.keys() ?? []) {
    if (!exported.has(key)) problems.push(`x-maestro-requirements names "${key}", which no ADDED or MODIFIED block exports — remove it or add the block`);
  }
  log.debug('check', 'draft checked', { files: files.size, deltas, problems: problems.length });
  return problems;
}

/** The dispositions `answers.md` records, keyed `<capability> › <name>`; a later entry for the same target wins. */
export function authorisationsOf(entries: readonly AnswerEntryLike[], parse: (value: string) => DispositionLike | null): Map<string, Authorisation> {
  const map = new Map<string, Authorisation>();
  for (const entry of entries) {
    if (entry.openspec === null) continue;
    const parsed = parse(entry.openspec);
    if (!parsed) { log.warn('check', 'an OpenSpec line could not be read; it authorises nothing', { line: entry.line }); continue; }
    const answer = entry.answer?.trim().toLowerCase() ?? '';
    map.set(targetKey(parsed.capability, parsed.requirement), {
      requirementId: entry.requirementId, disposition: parsed.disposition, renamedTo: parsed.renamedTo,
      userAnswered: answer !== '' && answer !== 'self-briefed',
    });
  }
  return map;
}

/** The parts of an `answers.md` entry the export reads; `runtime/answers.mts` supplies them. */
export interface AnswerEntryLike { line: number; requirementId: string; answer: string | null; openspec: string | null }
export interface DispositionLike { capability: string; requirement: string; disposition: Authorisation['disposition']; renamedTo: string | null }

/** Read the draft directory: regular files only, bounded. A symlink or a file over the bound is a problem, not a read. */
export async function readDraft(draftDir: string, problems: string[]): Promise<DraftFiles> {
  const files: DraftFiles = new Map();
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await entries(dir)) {
      const full = path.join(dir, entry.name);
      const relative = posix(path.relative(draftDir, full));
      if (entry.isSymbolicLink()) { problems.push(`${relative} is a symlink — the draft holds regular files only`); continue; }
      if (entry.isDirectory()) { await walk(full); continue; }
      if (!entry.isFile()) continue;
      if (files.size >= DRAFT_FILE_LIMIT) { problems.push(`the draft holds more than ${DRAFT_FILE_LIMIT} files — an OpenSpec change is a handful`); return; }
      const size = (await stat(full)).size;
      if (size > SPEC_BYTE_LIMIT) { problems.push(`${relative} is ${size} bytes, over the ${SPEC_BYTE_LIMIT}-byte bound`); continue; }
      files.set(relative, await readFile(full, 'utf8'));
    }
  };
  await walk(draftDir);
  return files;
}

/** How the export reaches the OpenSpec command line; injected by tests. */
export type OpenSpecRunner = (args: readonly string[], cwd: string, timeoutMs: number) =>
  Promise<{ outcome: 'missing' } | { outcome: 'timeout' } | { outcome: 'exited'; code: number; output: string }>;

/**
 * The OpenSpec command line reports telemetry and checks for updates over the
 * network unless told not to. The helper makes one optional outbound request of
 * its own and no other, so the CLI runs with both switched off through the
 * variables OpenSpec itself honours.
 */
export const QUIET_ENV: Readonly<Record<string, string>> = { DO_NOT_TRACK: '1', OPENSPEC_TELEMETRY: '0', OPENSPEC_NO_UPDATE_CHECK: '1' };

export const defaultRunner: OpenSpecRunner = (args, cwd, timeoutMs) => new Promise(resolve => {
  let output = '';
  let settled = false;
  const finish = (value: Awaited<ReturnType<OpenSpecRunner>>): void => { if (!settled) { settled = true; resolve(value); } };
  let child: ChildProcess;
  try { child = spawn('openspec', [...args], { cwd, env: { ...process.env, ...QUIET_ENV }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }); }
  catch { finish({ outcome: 'missing' }); return; }
  const timer = setTimeout(() => { child.kill('SIGKILL'); finish({ outcome: 'timeout' }); }, timeoutMs);
  const take = (chunk: Buffer): void => { if (output.length < 64 * 1024) output += chunk.toString('utf8'); };
  child.stdout?.on('data', take);
  child.stderr?.on('data', take);
  child.on('error', error => { clearTimeout(timer); finish((error as NodeJS.ErrnoException).code === 'ENOENT' ? { outcome: 'missing' } : { outcome: 'exited', code: 1, output: error.message }); });
  child.on('close', code => { clearTimeout(timer); finish({ outcome: 'exited', code: code ?? 1, output }); });
});

async function validateChange(change: string, projectRoot: string, runner: OpenSpecRunner): Promise<{ validation: ValidationStatus; problems: string[] }> {
  const args = ['validate', change, '--type', 'change', '--strict', '--json', '--no-interactive'];
  const result = await runner(args, projectRoot, VALIDATE_TIMEOUT_MS);
  if (result.outcome === 'missing') {
    log.info('validate', 'openspec command line not installed; validation unavailable', { change });
    return { validation: 'unavailable', problems: [] };
  }
  if (result.outcome === 'timeout') {
    log.warn('validate', 'openspec validate timed out; validation unavailable', { change, timeoutMs: VALIDATE_TIMEOUT_MS });
    return { validation: 'unavailable', problems: [`openspec validate did not answer within ${VALIDATE_TIMEOUT_MS / 1000} s`] };
  }
  if (result.code === 0) { log.info('validate', 'openspec validate passed', { change }); return { validation: 'passed', problems: [] }; }
  const lines = result.output.split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0, PROBLEM_LIMIT);
  log.warn('validate', 'openspec validate rejected the change', { change, code: result.code, lines: lines.length });
  return { validation: 'failed', problems: lines.length > 0 ? lines : [`openspec validate exited ${result.code}`] };
}

async function sameTree(files: DraftFiles, target: string): Promise<boolean> {
  const problems: string[] = [];
  const existing = await readDraft(target, problems).catch(() => null);
  if (!existing || problems.length > 0 || existing.size !== files.size) return false;
  for (const [name, text] of files) if (existing.get(name) !== text) return false;
  return true;
}

async function writeTree(files: DraftFiles, changesDir: string, change: string, replace: boolean): Promise<void> {
  const stamp = `${process.pid}-${Date.now()}`;
  const staging = path.join(changesDir, `.${change}.${stamp}.tmp`);
  const old = path.join(changesDir, `.${change}.${stamp}.old`);
  const target = path.join(changesDir, change);
  try {
    for (const [name, text] of files) {
      const file = path.join(staging, ...name.split('/'));
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, text, { flag: 'wx' });
    }
    if (replace) await rename(target, old);
    try { await rename(staging, target); }
    catch (error) { if (replace) await rename(old, target).catch(() => undefined); throw error; }
    if (replace) await rm(old, { recursive: true, force: true });
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
  }
}

const capped = (problems: string[]): string[] => problems.slice(0, PROBLEM_LIMIT);

export interface ExportInput {
  projectRoot: string;
  /** `.maestro/<dir>`, the closed run's directory. */
  runDir: string;
  dir: string;
  outcome: string | undefined;
  context: Omit<DraftContext, 'dir' | 'index'>;
  runner?: OpenSpecRunner;
}

/**
 * Check the draft and write the change. Returns `null` when there is nothing to
 * export — no OpenSpec, no draft, or an outcome that exports nothing — and
 * never throws: a failure is a status, so it never fails the publish.
 */
export async function exportOpenSpecChange(input: ExportInput): Promise<OpenSpecExport | null> {
  const change = `${MAESTRO_CHANGE_PREFIX}${input.dir}`;
  const draftDir = path.join(input.runDir, OPENSPEC_DIR);
  try {
    try { if (!(await lstat(draftDir)).isDirectory()) return null; }
    catch { log.debug('export', 'no draft; nothing to export', { dir: input.dir }); return null; }
    if (!EXPORTABLE.includes(input.outcome ?? '')) {
      log.info('export', 'outcome exports nothing; draft left in place', { dir: input.dir, outcome: input.outcome ?? null });
      return null;
    }
    const index = await readOpenSpecIndex(input.projectRoot);
    if (!index.present) {
      log.warn('export', 'a draft exists but the project is not OpenSpec-initialised; nothing written', { dir: input.dir });
      return null;
    }
    const unresolved = [...input.context.authorisations.entries()]
      .filter(([, auth]) => !auth.userAnswered).map(([target, auth]) => ({ requirementId: auth.requirementId, target }));
    const extra = unresolved.length > 0 ? { unresolved } : {};

    const rootReal = await realpath(input.projectRoot);
    const openspecReal = await realpath(path.join(input.projectRoot, OPENSPEC_DIR));
    const changesDir = path.join(input.projectRoot, OPENSPEC_DIR, 'changes');
    await mkdir(changesDir, { recursive: true });
    const changesReal = await realpath(changesDir);
    if (!inside(rootReal, changesReal) || !inside(openspecReal, changesReal)) {
      log.error('export', 'openspec/changes resolves outside the project; refused', { dir: input.dir });
      return { status: 'refused', change, problems: ['openspec/changes resolves outside the project — the export writes only inside it'], ...extra };
    }

    // Archived first: once the user merged the change, its ADDED requirements
    // are in openspec/specs, and checking the draft again would refuse it for
    // exactly the merge it asked for.
    const target = path.join(changesDir, change);
    let existing: Stats | null = null;
    try { existing = await lstat(target); } catch { existing = null; }
    if (existing === null && index.archived.some(item => item.change === change)) {
      log.info('export', 'change already archived by the user; left alone', { change });
      return { status: 'archived', change, ...extra };
    }

    const problems: string[] = [];
    const files = await readDraft(draftDir, problems);
    problems.push(...checkOpenSpecDraft(files, { ...input.context, dir: input.dir, index }));
    if (problems.length > 0) {
      log.warn('export', 'draft refused', { change, problems: problems.length, first: problems[0]! });
      return { status: 'refused', change, problems: capped(problems), ...extra };
    }

    if (existing !== null) {
      const owner = existing.isDirectory() && !existing.isSymbolicLink() ? await readMaestroRun(target) : null;
      if (owner !== input.dir) {
        log.warn('export', 'a change of that name belongs to someone else; left alone', { change, owner });
        return { status: 'refused', change, problems: [`openspec/changes/${change} exists and its x-maestro-run is ${owner ?? 'missing'} — it is not this run's, so it was not overwritten; move it or rename it`], ...extra };
      }
    }
    let status: ExportStatus = 'written';
    if (existing !== null && await sameTree(files, target)) status = 'kept';
    else await writeTree(files, changesDir, change, existing !== null);
    const checked = await validateChange(change, input.projectRoot, input.runner ?? defaultRunner);
    log.info('export', 'change exported', { change, status, validation: checked.validation });
    return { status, change, validation: checked.validation, ...(checked.problems.length > 0 ? { problems: capped(checked.problems) } : {}), ...extra };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.warn('export', 'export failed; an identical closing publish retries it', { change, reason });
    return { status: 'failed', change, problems: [`the export could not be written (${reason}) — publish the same closed state again to retry`] };
  }
}

// --- the closing publish ---------------------------------------------------------

/** The closing state's part of the export context: results, exceptions, statuses and the user's dispositions. */
export async function closureContext(runDir: string, state: RunState): Promise<Omit<DraftContext, 'dir' | 'index'>> {
  let results: Record<string, string> = {};
  try { results = state.verification ? deriveVerification(state).requirementResults : {}; }
  catch (error) {
    log.warn('export', 'verification could not be derived; no requirement counts as passed', { reason: error instanceof Error ? error.message : String(error) });
  }
  const record = state.verification;
  const excepted = new Set<string>();
  for (const decision of record?.decisions ?? []) {
    if (decision.kind !== 'accepted_exception') continue;
    for (const found of record!.findings) if (decision.selectedFindingIds.includes(found.id)) found.requirementIds.forEach(id => excepted.add(id));
    for (const obligation of record!.obligations) if (decision.selectedObligationIds.includes(obligation.id)) obligation.requirementIds.forEach(id => excepted.add(id));
  }
  const notInSpec = new Set(state.requirements.filter(item => item.status !== 'in-spec').map(item => item.id));
  let answers = '';
  try { answers = await readFile(path.join(runDir, 'answers.md'), 'utf8'); }
  catch { log.debug('export', 'no answers.md; nothing authorises a change to approved behaviour', {}); }
  return { results, excepted, notInSpec, authorisations: authorisationsOf(parseAnswers(answers), parseOpenSpecDisposition) };
}

/** Run the export for a closed state; `runRoot` is `.maestro/`. */
export async function exportForClosure(runRoot: string, state: RunState, runner?: OpenSpecRunner): Promise<OpenSpecExport | null> {
  const dir = runDirName(state);
  const runDir = path.join(runRoot, dir);
  try { await lstat(path.join(runDir, OPENSPEC_DIR)); }
  catch { return null; }
  return exportOpenSpecChange({
    projectRoot: path.dirname(runRoot), runDir, dir, outcome: state.outcome,
    context: await closureContext(runDir, state), ...(runner ? { runner } : {}),
  });
}

export interface OpenSpecProgressItems {
  notDone: Array<{ key: string; text: string }>;
  knownBugs: Array<{ key: string; text: string }>;
}

/** What `PROGRESS.md` says about the export, keyed under the closing run so a re-closure regenerates it. */
export function openSpecProgressItems(dir: string, result: OpenSpecExport | null): OpenSpecProgressItems {
  const items: OpenSpecProgressItems = { notDone: [], knownBugs: [] };
  if (!result) return items;
  const first = result.problems?.[0] ?? 'no reason given';
  if (result.status === 'written' || result.status === 'kept') {
    const unchecked = result.validation === 'unavailable' ? ' — not validated: the openspec command line is not installed' : '';
    items.notDone.push({ key: `${dir}#openspec`, text: `OpenSpec change openspec/changes/${result.change}/ awaits \`openspec archive ${result.change}\`${unchecked}` });
    if (result.validation === 'failed') items.knownBugs.push({ key: `${dir}#openspec-validation`, text: `openspec validate rejected ${result.change}: ${first}` });
  } else if (result.status === 'refused') {
    items.knownBugs.push({ key: `${dir}#openspec`, text: `OpenSpec export refused: ${first}` });
  } else if (result.status === 'failed') {
    items.knownBugs.push({ key: `${dir}#openspec`, text: `OpenSpec export failed: ${first}` });
  }
  const used = new Map<string, number>();
  for (const conflict of result.unresolved ?? []) {
    const base = `${dir}#openspec-${conflict.requirementId || 'fork'}`;
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    items.notDone.push({
      key: count === 1 ? base : `${base}-${count}`,
      text: `${conflict.requirementId || 'a fork'} contradicts the approved OpenSpec requirement ${conflict.target}; the run kept the requirement without asking — decide whether the brief changes it`,
    });
  }
  return items;
}
