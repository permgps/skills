#!/usr/bin/env node
// Checks a skill bundle's structure: frontmatter, link targets, and the
// dependency rule that keeps the context budget honest — a phase file never
// links to another phase file.

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createLogger } from '../shared/log.ts';
import { formatViolation, type Violation } from '../shared/violation.ts';

export type { Violation };

const log = createLogger('bundle-integrity');

const REQUIRED_KEYS = ['name', 'description', 'argument-hint'];

/**
 * One bundle's directory names.
 *
 * The package holds two skills and they do not use the same word for the thing
 * read one file at a time: Maestro has `phases/`, Scout has `steps/`. Both mean
 * the same rule — linked only from `SKILL.md`, never from each other — so the
 * checker learns the name rather than the rule learning a second name.
 *
 * **What the widening costs.** Before it, a bundle either had `phases/` or was
 * silently unchecked: `listMarkdown` returns nothing for a directory that is not
 * there, the reachability pass reports zero files, and the run says OK. That is
 * how Scout's five step files passed this checker while nothing had read them.
 * A profile table does not remove that failure mode, it only moves it — a third
 * bundle whose directory is named something else fails open in exactly the same
 * way. So the profile carries `other`, the markdown directories a bundle
 * deliberately does not read one at a time, and any directory of markdown that
 * no profile accounts for is a violation. Fail-open became fail-loud; the price
 * is that adding a bundle means adding a row here, and forgetting to is now an
 * error rather than a silence.
 */
export interface BundleProfile {
  name: string;
  /** Read one file at a time, linked only from `SKILL.md`. */
  steps: string;
  /** Handed to a субагент; linked from anywhere in the bundle. */
  prompts: string;
  /** Markdown that is neither, and is opened deliberately by something else. */
  other: string[];
}

export const MAESTRO_BUNDLE: BundleProfile = {
  name: 'maestro',
  steps: 'phases',
  prompts: 'prompts',
  other: ['references'],
};

export const SCOUT_BUNDLE: BundleProfile = {
  name: 'scout',
  steps: 'steps',
  prompts: 'prompts',
  other: [],
};

/** Resolved by the bundle's own directory name, which is also its skill name. */
export function bundleProfileFor(bundleDir: string): BundleProfile {
  return path.basename(path.resolve(bundleDir)) === 'scout' ? SCOUT_BUNDLE : MAESTRO_BUNDLE;
}

export interface Frontmatter {
  keys: Map<string, string>;
  /** 1-based line of the closing `---`, or 0 when there is no frontmatter. */
  endLine: number;
}

/**
 * Read the leading `---` block as flat `key: value` pairs.
 *
 * Deliberately not a YAML parser: the frontmatter this checker validates is a
 * handful of scalars, and pulling in a parser to read them would put a runtime
 * dependency in a repository whose whole point is not having one. A nested or
 * multi-line value is left unparsed rather than half-parsed.
 */
export function parseFrontmatter(markdown: string): Frontmatter {
  const lines = markdown.split('\n');
  const keys = new Map<string, string>();
  if ((lines[0] ?? '').trim() !== '---') return { keys, endLine: 0 };

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (line.trim() === '---') return { keys, endLine: i + 1 };

    const match = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key = '', rawValue = ''] = match;
    keys.set(key, rawValue.trim().replace(/^["']|["']$/g, ''));
  }

  // Opened but never closed: report it as absent rather than swallowing the
  // whole document as frontmatter.
  return { keys: new Map(), endLine: 0 };
}

export interface Link {
  target: string;
  line: number;
}

const INLINE_LINK = /\[[^\]]*\]\(([^)\s]+)[^)]*\)/g;

/**
 * Every inline markdown link that points at a file in this repository.
 * Absolute URLs, mail links and bare anchors are somebody else's problem.
 */
export function findRelativeLinks(markdown: string): Link[] {
  const links: Link[] = [];

  markdown.split('\n').forEach((line, index) => {
    for (const match of line.matchAll(INLINE_LINK)) {
      const target = match[1] ?? '';
      if (target === '' || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue;
      links.push({ target: target.split('#')[0] ?? '', line: index + 1 });
    }
  });

  return links.filter(link => link.target !== '');
}

const exists = async (target: string): Promise<boolean> => {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
};

/** Every markdown file under one of the bundle's directories, relative to its root. */
async function listMarkdown(bundleDir: string, directory: string): Promise<string[]> {
  const found: string[] = [];

  const walk = async (relative: string): Promise<void> => {
    const entries = await readdir(path.join(bundleDir, relative), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) await walk(child);
      else if (entry.name.endsWith('.md')) found.push(child);
    }
  };

  if (await exists(path.join(bundleDir, directory))) await walk(directory);
  return found;
}

export async function checkBundle(
  bundleDir: string,
  profile: BundleProfile = MAESTRO_BUNDLE,
): Promise<Violation[]> {
  const PHASES_DIR = profile.steps;
  const PROMPTS_DIR = profile.prompts;
  const violations: Violation[] = [];
  const add = (check: string, file: string, line: number, message: string): void => {
    violations.push({ check, file, line, message });
    log.error(check, message, { file, line });
  };

  // --- the entry point exists ----------------------------------------------
  const skillPath = path.join(bundleDir, 'SKILL.md');
  if (!(await exists(skillPath))) {
    add('entry', 'SKILL.md', 0, 'bundle has no SKILL.md');
    return violations;
  }
  const skill = await readFile(skillPath, 'utf8');

  // --- frontmatter ----------------------------------------------------------
  const frontmatter = parseFrontmatter(skill);
  if (frontmatter.endLine === 0) {
    add('frontmatter', 'SKILL.md', 1, 'SKILL.md has no closed --- frontmatter block');
  } else {
    for (const key of REQUIRED_KEYS) {
      const value = frontmatter.keys.get(key);
      if (value === undefined) {
        add('frontmatter', 'SKILL.md', 1, `frontmatter is missing "${key}"`);
      } else if (value === '') {
        add('frontmatter', 'SKILL.md', 1, `frontmatter key "${key}" is empty`);
      }
    }

    const declared = frontmatter.keys.get('name');
    const directory = path.basename(path.resolve(bundleDir));
    if (declared !== undefined && declared !== '' && declared !== directory) {
      add('frontmatter', 'SKILL.md', 1,
        `frontmatter name "${declared}" does not match directory "${directory}"`);
    }
    log.info('frontmatter', 'frontmatter checked', { keys: frontmatter.keys.size });
  }

  // --- no markdown directory is outside every profile ----------------------
  for (const entry of await readdir(bundleDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === PHASES_DIR || entry.name === PROMPTS_DIR) continue;
    if (profile.other.includes(entry.name)) continue;
    if ((await listMarkdown(bundleDir, entry.name)).length === 0) continue;
    add('directories', entry.name, 0,
      `"${entry.name}" holds markdown and profile "${profile.name}" does not account for it — `
      + 'a directory no profile names is a directory nothing reads');
  }

  // --- links resolve, everywhere in the bundle ------------------------------
  const phaseFiles = await listMarkdown(bundleDir, PHASES_DIR);
  const promptFiles = await listMarkdown(bundleDir, PROMPTS_DIR);
  log.debug('phases', 'phase files found', { count: phaseFiles.length, files: phaseFiles });
  log.debug('prompts', 'prompt files found', { count: promptFiles.length, files: promptFiles });

  const documents: Array<{ file: string; body: string }> = [
    { file: 'SKILL.md', body: skill },
  ];
  for (const file of [...phaseFiles, ...promptFiles]) {
    documents.push({ file, body: await readFile(path.join(bundleDir, file), 'utf8') });
  }

  let linkCount = 0;
  const linkedFromSkill = new Set<string>();
  const linkedAnywhere = new Set<string>();

  for (const { file, body } of documents) {
    const fromDir = path.dirname(file);
    const fromPrompt = file.startsWith(`${PROMPTS_DIR}${path.sep}`);

    for (const link of findRelativeLinks(body)) {
      linkCount += 1;
      const resolved = path.normalize(path.join(fromDir, link.target));

      if (resolved.startsWith('..')) {
        add('links', file, link.line, `link "${link.target}" escapes the bundle`);
        continue;
      }
      if (!(await exists(path.join(bundleDir, resolved)))) {
        add('links', file, link.line, `link "${link.target}" resolves to nothing`);
        continue;
      }
      if (file === 'SKILL.md') linkedFromSkill.add(resolved);
      linkedAnywhere.add(resolved);

      // --- nothing but SKILL.md reaches into phases/ -------------------------
      const insidePhases = resolved.startsWith(`${PHASES_DIR}${path.sep}`);
      if (file !== 'SKILL.md' && insidePhases && resolved !== file) {
        add('cross-phase', file, link.line, fromPrompt
          ? `prompt links to "${link.target}" — a subagent brief that reaches a phase's `
            + 'rules stops being an independent brief'
          : `${PHASES_DIR} file links to "${link.target}" — hoist the shared rule into SKILL.md `
            + 'or give it its own file each phase opens deliberately');
      }
    }
  }
  log.info('links', 'links checked', { count: linkCount, documents: documents.length });

  // --- nothing under phases/ or prompts/ is orphaned ------------------------
  for (const file of phaseFiles) {
    if (!linkedFromSkill.has(file)) {
      add('reachability', file, 0, `${PHASES_DIR} file is not linked from SKILL.md`);
    }
  }
  // A prompt is opened by whichever phase hands it over, so any document in the
  // bundle may be the one that reaches it.
  for (const file of promptFiles) {
    if (!linkedAnywhere.has(file)) {
      add('reachability', file, 0, 'prompt file is not linked from anywhere in the bundle');
    }
  }
  log.info('reachability', 'phase and prompt files checked', {
    phases: phaseFiles.length,
    linkedPhases: phaseFiles.filter(file => linkedFromSkill.has(file)).length,
    prompts: promptFiles.length,
    linkedPrompts: promptFiles.filter(file => linkedAnywhere.has(file)).length,
  });

  return violations;
}

async function main(): Promise<number> {
  const bundleDir = process.argv[2] ?? 'skills/maestro';
  const profile = bundleProfileFor(bundleDir);
  log.info('run', 'checking bundle', { bundleDir, profile: profile.name });

  let violations: Violation[];
  try {
    violations = await checkBundle(bundleDir, profile);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.error('run', 'bundle could not be read', { bundleDir, reason });
    process.stdout.write(`bundle-integrity: cannot read ${bundleDir}\n`);
    return 2;
  }

  if (violations.length === 0) {
    process.stdout.write('bundle-integrity: OK\n');
    return 0;
  }
  for (const violation of violations) process.stdout.write(formatViolation(violation));
  process.stdout.write(`bundle-integrity: ${violations.length} violation(s)\n`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}
