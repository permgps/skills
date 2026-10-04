#!/usr/bin/env node
// Checks a skill bundle's structure: frontmatter, link targets, and the
// dependency rule that keeps the context budget honest — a phase file never
// links to another phase file.

import { readFile, readdir, stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { builtinModules } from 'node:module';
import { pathToFileURL } from 'node:url';

import { checkCodexRuntime } from './host-degradation.ts';

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

/** Declared procedure scaffolding; these checks do not establish semantic quality. */
export function checkProcedure(body: string): string[] {
  const requirements: Array<[string, RegExp]> = [
    ['entry inputs', /(?:Entry|prerequisites|entry inputs)\s*:/i],
    ['numbered actions', /^\s*1\. /m],
    ['output fields', /(?:Return|Output|fields)\s*(?:JSON|fields)?\s*:/i],
    ['missing-capability outcome', /unavailable|incomplete|pending/i],
    ['valid example', /Valid:/], ['invalid example', /Invalid:/],
    ['next action', /next action|exit|return once|For failed|For passed|then|next/i],
  ];
  return requirements.filter(([, pattern]) => !pattern.test(body)).map(([name]) => name);
}

export const COMPLETION_PROCEDURES = [
  ['prompts/manifest-reader.md', ''], ['prompts/repair-diagnostician.md', ''],
  ['prompts/strategy-reviewer.md', ''],
  ['phases/1-manifest.md', '5a. Independently audit before agreement'],
  ['phases/3-spec.md', 'Integrated Outcomes And Readiness'],
  ['phases/4-plan.md', 'Journey And Control Ownership'],
  ['phases/5-build.md', 'Execute Journeys And Selected Controls'],
  ['phases/6-review.md', 'Verify Execution Handoffs'],
  ['phases/7-acceptance.md', 'Completion Reconciliation After Blind Discovery'],
  ['phases/8-repair.md', '1a. Split the finding into defects'],
  ['phases/8-repair.md', '2b. Strategy review'],
  ['phases/0-preflight.md', 'Explicit Historical Resume'],
  ['references/verification-procedures.md', 'Readiness Protocol'],
  ['references/verification-procedures.md', 'Journey Protocol'],
  ['references/verification-procedures.md', 'Selective Negative-Control Protocol'],
] as const;

/**
 * The one sentence every brief under `prompts/` carries.
 *
 * The skill's own trigger is someone describing what they want built, and that
 * is exactly what a task file reads like. A субагент free to invoke a skill can
 * recognise its таск as a new бриф and start a nested прогон inside the first
 * one, and the fan-out multiplies at every level — a review pass that did this
 * went past fifty agents. Only the orchestrator dispatches.
 *
 * Matched as the literal sentence, not as a marker the way `viewer-ownership`
 * matches its rule. There each brief words its share of the rule for its own
 * role, so only a marker is stable. Here the sentence is the same in every brief
 * and *is* the instruction the субагент reads: a marker would keep passing after
 * the sentence beside it was deleted.
 */
export const LEAF_RULE = 'Invoke no skill and dispatch no agent; do the work in this context.';

/** Whitespace-normalised, so re-wrapping a paragraph never fails the check. */
export function carriesLeafRule(body: string): boolean {
  return body.replace(/\s+/g, ' ').includes(LEAF_RULE);
}

export function procedureSection(body: string, heading: string): string {
  if (!heading) return body;
  const lines = body.split('\n');
  const index = lines.findIndex(line => line.replace(/^#+ /, '') === heading);
  if (index < 0) return '';
  const depth = /^#+/.exec(lines[index]!)![0].length;
  const end = lines.findIndex((line, cursor) => cursor > index && /^#+ /.test(line)
    && /^#+/.exec(line)![0].length <= depth);
  return lines.slice(index + 1, end < 0 ? undefined : end).join('\n');
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

  // --- every brief keeps its субагент a leaf --------------------------------
  // See `LEAF_RULE` for why, and why the sentence rather than a marker.
  let carrying = 0;
  for (const { file, body } of documents) {
    if (!file.startsWith(`${PROMPTS_DIR}${path.sep}`)) continue;
    if (carriesLeafRule(body)) {
      carrying += 1;
      log.debug('leaf', 'brief carries the leaf rule', { file });
      continue;
    }
    add('leaf', file, 0,
      `brief does not carry "${LEAF_RULE}" — a субагент free to invoke a skill or `
      + 'dispatch an agent can read its таск as a new бриф and start a nested прогон, '
      + 'and the fan-out multiplies with every level');
  }
  log.info('leaf', 'leaf rule checked', { prompts: promptFiles.length, carrying });

  if (skill.includes('<!-- maestro:delegation:native-explicit -->') || skill.includes('<!-- maestro:runtime:node -->')) {
    if (!skill.includes('<!-- maestro:runtime:node -->')) add('runtime', 'SKILL.md', 0, 'declare the autonomous Node runtime marker');
    violations.push(...await checkRuntimeImports(path.join(bundleDir, 'tools')));
    for (const file of ['SKILL.md', ...phaseFiles, ...await listMarkdown(bundleDir, 'references')]) {
      const body = await readFile(path.join(bundleDir, file), 'utf8');
      if (/python(?:3)?\s+[^\n]*sync\.py|coordinator-sync\.py/.test(body)) add('runtime', file, 0, 'replace the obsolete helper invocation with node sync.mts');
    }
  }

  if (skill.includes('<!-- maestro:delegation:native-explicit -->')) {
    violations.push(...await checkCodexRuntime(bundleDir));
  }

  if (skill.includes('<!-- maestro:completion-protocols -->')) {
    for (const [file, heading] of COMPLETION_PROCEDURES) {
      const body = await readFile(path.join(bundleDir, file), 'utf8').catch(() => '');
      for (const missing of checkProcedure(procedureSection(body, heading))) {
        add('procedure', file, 0, `declared procedure "${heading || file}" lacks ${missing}`);
      }
    }
    log.info('procedure', 'completion procedure scaffolding checked', { count: COMPLETION_PROCEDURES.length });
  }
  return violations;
}

/** Tokenize enough syntax to avoid treating quoted data or comments as imports. */
export function runtimeImports(source: string): { imports: string[]; computed: boolean } {
  const tokens = [...source.matchAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|[A-Za-z_$][\w$]*|[^\s]/g)]
    .map(match => match[0]).filter(token => !token.startsWith('//') && !token.startsWith('/*'));
  const imports: string[] = [];
  let computed = false;
  const literal = (token: string | undefined): boolean => token?.startsWith("'") === true || token?.startsWith('"') === true;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token?.startsWith('`') && /\b(?:import|require)\s*\(/.test(token)) computed = true;
    if (token === 'require' && tokens[index + 1] === '(') computed = true;
    if (token === 'import' && tokens[index + 1] === '(') {
      if (!literal(tokens[index + 2]) || tokens[index + 3] !== ')') computed = true;
      else imports.push(tokens[index + 2]!.slice(1, -1));
    } else if ((token === 'from' || token === 'import') && literal(tokens[index + 1])) {
      imports.push(tokens[index + 1]!.slice(1, -1));
    }
  }
  return { imports, computed };
}

/** The installed executable import closure cannot rely on the repository or packages. */
export async function checkRuntimeImports(toolsDir: string): Promise<Violation[]> {
  const root = path.resolve(toolsDir);
  const violations: Violation[] = [];
  const add = (file: string, message: string): void => {
    violations.push({ check: 'runtime', file, line: 0, message });
    log.error('runtime', message, { file });
  };
  if (!await exists(path.join(root, 'sync.mts'))) add('tools/sync.mts', 'ship the sole Node command entrypoint');
  if (!await exists(path.join(root, 'runtime'))) add('tools/runtime', 'ship the complete autonomous runtime tree');
  const files: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.name.endsWith('.mts')) files.push(file);
      else if (entry.name.endsWith('.py')) add(path.relative(root, file), 'remove the obsolete Python helper from the shipped bundle');
    }
  };
  await walk(root);
  for (const file of files) {
    const relative = path.relative(root, file);
    const source = await readFile(file, 'utf8');
    const parsed = runtimeImports(source);
    if (parsed.computed) {
      add(relative, 'use explicit static bundle-local imports or node:* built-ins');
    }
    if (/\b(?:spawn|execFile)\s*\(\s*['"]python(?:3)?['"]/.test(source)) {
      add(relative, 'do not invoke a Python runtime');
    }
    for (const target of parsed.imports) {
      if (target.startsWith('node:')) {
        if (!builtinModules.includes(target.slice(5)) && !builtinModules.includes(target)) add(relative, `unknown Node built-in ${target}`);
        continue;
      }
      if (!target.startsWith('.') || !target.endsWith('.mts')) {
        add(relative, `import ${target} must be an explicit relative .mts module`);
        continue;
      }
      const resolved = path.resolve(path.dirname(file), target);
      if (!resolved.startsWith(root + path.sep)) {
        add(relative, `import ${target} escapes the installed tools tree`);
        continue;
      }
      try {
        const actual = await realpath(resolved);
        if (!actual.startsWith((await realpath(root)) + path.sep) || !(await stat(actual)).isFile()) {
          add(relative, `import ${target} does not resolve to a confined runtime file`);
        }
      } catch { add(relative, `import ${target} resolves to a missing runtime file`); }
    }
  }
  log.info('runtime', 'autonomous import closure checked', { files: files.length, violations: violations.length });
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
