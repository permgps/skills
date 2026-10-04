#!/usr/bin/env node
// Holds the root README against the repository it describes.
//
// The README is the one page every reader opens, and the one page no
// validator read: a renamed docs heading, a dropped npm script or a sync flag
// that never existed would sit in it until somebody followed the link. It now
// teaches the whole product, so it names more anchors, scripts and flags than
// any other file — which is exactly where a second copy goes stale first.
//
// What it holds, and only that:
// - every relative link reaches a file, and every `#anchor` a heading there;
// - every `npm run <name>` is a script `package.json` defines;
// - every `--flag` on a line naming `sync.mts` is one the helper's source parses;
// - the README's sections are the outline the plan fixed, in that order, and the
//   Dials section names every dial value.
//
// It does not hold whether a sentence is true. Facts about behavior are checked
// by reading them against `docs/spec/`, by hand. It runs inside `npm run test`
// through its test file rather than as its own `npm run check` step, so the
// count of validator runs the documentation quotes does not move.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createLogger } from '../shared/log.ts';
import { formatViolation, type Violation } from '../shared/violation.ts';

export type { Violation };

const log = createLogger('readme');

/** The README's H2 sections, in order. The H1 title stands above them. */
export const README_SECTIONS: readonly string[] = [
  'Contents',
  'Quick Start',
  'Requirements',
  'Installation',
  'Starting A Run',
  'Dials',
  'What A Run Does',
  'When It Asks You',
  'Talking To A Run In Progress',
  'Four Gates',
  'Six Rules Nothing Turns Off',
  'What A Run Leaves In Your Project',
  'The Dashboard',
  'Scout',
  'Hosts',
  'The Language It Speaks',
  'Under The Hood',
  'Limitations',
  'For Contributors',
  'Documentation Map',
  'License',
];

/** Every value of every dial, as `docs/spec/dials.md` defines them. */
export const DIAL_VALUES: readonly string[] = [
  'plain', 'normal', 'ru', 'en', 'full', 'semi', 'interview', 'manual', 'strict', 'deep', 'polish',
];

export interface Link {
  target: string;
  anchor: string | null;
  line: number;
}

/**
 * Lines outside fenced code blocks, with inline code blanked out, so a link or
 * heading shown as an example is never mistaken for a real one. Line numbers
 * are kept: a blanked line is still a line.
 */
export function proseLines(markdown: string): string[] {
  let fenced = false;
  return markdown.split('\n').map(line => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return '';
    }
    if (fenced) return '';
    return line.replace(/`[^`]*`/g, match => ' '.repeat(match.length));
  });
}

/**
 * Every relative link and image target. Absolute URLs (`https:`, `mailto:`)
 * are skipped: whether a site is up is not a property of this repository.
 */
export function extractLinks(markdown: string): Link[] {
  const links: Link[] = [];
  proseLines(markdown).forEach((line, index) => {
    for (const match of line.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
      const raw = match[1] ?? '';
      if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) continue;
      const hash = raw.indexOf('#');
      const target = hash === -1 ? raw : raw.slice(0, hash);
      const anchor = hash === -1 ? null : decodeURIComponent(raw.slice(hash + 1));
      links.push({ target, anchor, line: index + 1 });
    }
  });
  return links;
}

/**
 * The anchors GitHub gives a file's headings: lowercase, every character that
 * is not a letter, digit, space, `-` or `_` removed, spaces turned into
 * hyphens, and a repeated slug suffixed `-1`, `-2`. Letters are Unicode
 * letters, so a Cyrillic heading keeps its words.
 */
export function headingSlugs(markdown: string): string[] {
  const seen = new Map<string, number>();
  const slugs: string[] = [];
  let fenced = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const match = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const text = (match[1] ?? '').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1');
    const base = text.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    slugs.push(count === 0 ? base : `${base}-${count}`);
  }
  return slugs;
}

/** The text of each H2 heading, in order. */
export function sectionHeadings(markdown: string): string[] {
  let fenced = false;
  const headings: string[] = [];
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) continue;
    const match = /^##\s+(.*?)\s*$/.exec(line);
    if (match) headings.push(match[1] ?? '');
  }
  return headings;
}

/** The body of one H2 section, up to the next H2. Empty when it is absent. */
export function sectionBody(markdown: string, heading: string): string {
  const lines = markdown.split('\n');
  const start = lines.findIndex(line => line.trim() === `## ${heading}`);
  if (start === -1) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(line => /^##\s/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

/**
 * Links whose file does not exist, or whose anchor no heading in that file
 * produces. A link with only `#anchor` is resolved against the README itself.
 */
export async function findBrokenLinks(readmePath: string, markdown: string): Promise<Violation[]> {
  const violations: Violation[] = [];
  const base = path.dirname(readmePath);
  const slugCache = new Map<string, string[] | null>();

  const slugsOf = async (file: string): Promise<string[] | null> => {
    if (!slugCache.has(file)) {
      const text = await readFile(file, 'utf8').catch(() => null);
      slugCache.set(file, text === null ? null : headingSlugs(text));
    }
    return slugCache.get(file) ?? null;
  };

  for (const link of extractLinks(markdown)) {
    const file = link.target === '' ? readmePath : path.join(base, link.target);
    const isDirectory = await readdir(file).then(() => true, () => false);
    const exists = isDirectory || (await readFile(file).then(() => true, () => false));
    log.debug('links', 'link resolved', { file: readmePath, target: link.target, anchor: link.anchor, found: exists });
    if (!exists) {
      violations.push({
        check: 'links', file: readmePath, line: link.line,
        message: `"${link.target}" does not exist — fix the path or drop the link`,
      });
      continue;
    }
    if (link.anchor === null || isDirectory || !file.endsWith('.md')) continue;
    const slugs = await slugsOf(file);
    const found = slugs?.includes(link.anchor) ?? false;
    log.debug('anchors', 'anchor resolved', { file: readmePath, target: link.target, anchor: link.anchor, found });
    if (found) continue;
    violations.push({
      check: 'anchors', file: readmePath, line: link.line,
      message: `"${link.target || path.basename(readmePath)}" has no heading for #${link.anchor} — `
        + 'link to a heading that exists there, or rename the anchor to match the heading it meant',
    });
  }
  return violations;
}

/** Every `npm run <name>` the README mentions that `package.json` does not define. */
export function findUnknownNpmScripts(markdown: string, packageJson: string, file = 'README.md'): Violation[] {
  const scripts = Object.keys((JSON.parse(packageJson) as { scripts?: Record<string, string> }).scripts ?? {});
  const violations: Violation[] = [];
  markdown.split('\n').forEach((line, index) => {
    for (const match of line.matchAll(/npm run ([a-z][a-z0-9:-]*)/g)) {
      const name = match[1] ?? '';
      const found = scripts.includes(name);
      log.debug('npm', 'script resolved', { file, target: name, found });
      if (found) continue;
      violations.push({
        check: 'npm', file, line: index + 1,
        message: `"npm run ${name}" is not a script in package.json — use one it defines (${scripts.join(', ')})`,
      });
    }
  });
  return violations;
}

/**
 * Every `--flag` on a line that names `sync.mts` and that no quoted `'--flag'`
 * literal in the helper's source parses. The source is the helper and its
 * runtime together, because some flags are read by the module a mode hands
 * the arguments to.
 */
export function findUnknownSyncFlags(markdown: string, helperSource: string, file = 'README.md'): Violation[] {
  const known = new Set([...helperSource.matchAll(/'(--[a-z][a-z-]*)'/g)].map(match => match[1] ?? ''));
  const violations: Violation[] = [];
  markdown.split('\n').forEach((line, index) => {
    if (!line.includes('sync.mts')) return;
    for (const match of line.matchAll(/(?<![\w-])(--[a-z][a-z-]*)/g)) {
      const flag = match[1] ?? '';
      const found = known.has(flag);
      log.debug('flags', 'flag resolved', { file, target: flag, found });
      if (found) continue;
      violations.push({
        check: 'flags', file, line: index + 1,
        message: `"${flag}" is not a flag sync.mts parses — name one it does (${[...known].sort().join(', ')}), `
          + 'or move the flag off the line that names sync.mts if it belongs to another command',
      });
    }
  });
  return violations;
}

/** The outline's sections missing or out of order, and dial values the Dials section never names. */
export function findOutlineDrift(markdown: string, file = 'README.md'): Violation[] {
  const violations: Violation[] = [];
  const headings = sectionHeadings(markdown);
  const expected = [...README_SECTIONS];
  const missing = expected.filter(name => !headings.includes(name));
  for (const name of missing) {
    violations.push({ check: 'outline', file, line: 0, message: `the README has no "## ${name}" section — add it where the outline places it` });
  }
  const present = headings.filter(name => expected.includes(name));
  const ordered = expected.filter(name => present.includes(name));
  if (present.join('\n') !== ordered.join('\n')) {
    violations.push({
      check: 'outline', file, line: 0,
      message: `the README's sections are out of order: found ${present.join(' › ')}; expected ${ordered.join(' › ')}`,
    });
  }
  log.debug('outline', 'sections compared', { file, found: headings, expected });

  const dials = sectionBody(markdown, 'Dials');
  for (const value of DIAL_VALUES) {
    if (dials.includes(`\`${value}\``)) continue;
    violations.push({
      check: 'dials', file, line: 0,
      message: `the Dials section never names \`${value}\` — every value docs/spec/dials.md defines belongs in its table`,
    });
  }
  return violations;
}

/** Every source file of the helper: `sync.mts` and the runtime it imports. */
async function helperSource(toolsDir: string): Promise<string> {
  const entries = await readdir(path.join(toolsDir, 'runtime'), { recursive: true });
  const files = [path.join(toolsDir, 'sync.mts'), ...entries
    .filter(entry => entry.endsWith('.mts') && !entry.endsWith('.test.mts'))
    .map(entry => path.join(toolsDir, 'runtime', entry))];
  return (await Promise.all(files.map(name => readFile(name, 'utf8')))).join('\n');
}

export interface CheckOptions {
  readme?: string;
  packageJson?: string;
  toolsDir?: string;
}

/** Every finding about the README. Throws when an input cannot be read. */
export async function checkReadme(options: CheckOptions = {}): Promise<Violation[]> {
  const readme = options.readme ?? 'README.md';
  const markdown = await readFile(readme, 'utf8');
  const packageJson = await readFile(options.packageJson ?? 'package.json', 'utf8');
  const source = await helperSource(options.toolsDir ?? path.join('skills', 'maestro', 'tools'));

  const violations = [
    ...findOutlineDrift(markdown, readme),
    ...await findBrokenLinks(readme, markdown),
    ...findUnknownNpmScripts(markdown, packageJson, readme),
    ...findUnknownSyncFlags(markdown, source, readme),
  ];
  for (const violation of violations) log.error(violation.check, violation.message, { file: violation.file, line: violation.line });
  log.info('readme', 'README checked', { readme, violations: violations.length });
  return violations;
}

async function main(): Promise<number> {
  const readme = process.argv[2] ?? 'README.md';
  log.info('run', 'checking the README', { readme });

  let violations: Violation[];
  try {
    violations = await checkReadme({ readme });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.error('run', 'inputs could not be read', { readme, reason });
    process.stdout.write(`readme: cannot read ${readme}, package.json or the helper source — ${reason}\n`);
    return 2;
  }

  if (violations.length === 0) {
    process.stdout.write('readme: OK\n');
    return 0;
  }
  for (const violation of violations) process.stdout.write(formatViolation(violation));
  process.stdout.write(`readme: ${violations.length} violation(s)\n`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}
