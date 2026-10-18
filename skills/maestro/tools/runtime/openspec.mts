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

import { lstat, readdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

import { createLogger } from './shared/log.mts';

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

async function entries(dir: string): Promise<import('node:fs').Dirent[]> {
  const list = await readdir(dir, { withFileTypes: true });
  return list.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Every `spec.md` under `openspec/specs/`, in name order, without following symlinks. */
async function specFiles(specsDir: string, index: OpenSpecIndex): Promise<string[]> {
  const found: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    let list: import('node:fs').Dirent[];
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
  let changeEntries: import('node:fs').Dirent[] = [];
  try { changeEntries = await entries(changesDir); }
  catch { log.debug('index', 'no changes directory', {}); }
  for (const entry of changeEntries) {
    if (!entry.isDirectory() || entry.name === 'archive') continue;
    index.changes.push({ name: entry.name, maestroRun: await readMaestroRun(path.join(changesDir, entry.name)) });
  }
  let archiveEntries: import('node:fs').Dirent[] = [];
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
