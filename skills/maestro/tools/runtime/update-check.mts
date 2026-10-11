// Whether a newer Maestro is published than the one this прогон runs.
//
// During the alpha a release follows almost every прогон, and a user on an old
// bundle keeps hitting bugs that are already fixed. Preflight asks once: the
// installed `SKILL.md` carries `metadata.version`, and one GET of the published
// `SKILL.md` on the default branch carries the other. The request is a plain
// GET of a public file — no query string, no header of ours, no body — so it
// says nothing about the user, the project or the прогон.
//
// The answer is never a reason to stop. Offline, a timeout, a 404, a file
// with no version, `MAESTRO_NO_UPDATE_CHECK=1`: each is a result the прогон
// says nothing about. That is why the command's exit code is always 0, against
// the 0/1/2 contract every other checker here keeps — an exit 2 for an
// unreadable `SKILL.md` would ask the orchestrator to act on a fact it must
// ignore. The reason for `unknown` goes to stderr at DEBUG, never to stdout.
//
// Contract: docs/spec/dials.md, section "Announcement"; docs/spec/hosts.md,
// section "Installed Runtime Prerequisite".

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { spoken, type Language } from './legacy.mts';
import { createLogger } from './shared/log.mts';
import { extractStateLiteral } from './state/read.mts';

const log = createLogger('update');

/** The default branch `npx skills add permgps/skills` installs from. No variable overrides it. */
export const PUBLISHED_SKILL_URL = 'https://raw.githubusercontent.com/permgps/skills/main/skills/maestro/SKILL.md';
export const UPDATE_TIMEOUT_MS = 2000;
/** `SKILL.md` is about 30 KiB; an answer past this is not the file. */
export const MAX_PUBLISHED_BYTES = 65536;
export const DISABLE_ENV = 'MAESTRO_NO_UPDATE_CHECK';

/**
 * `metadata.version` from the leading `---` block, or null.
 *
 * Read by line, like the bundle checker's frontmatter, and for its reason: one
 * scalar under one key does not justify this bundle's first dependency. The
 * bundle checker imports this function, so the field it holds equal to
 * `package.json` is exactly the field this module reads.
 */
export function metadataVersion(markdown: string): string | null {
  const lines = markdown.split('\n');
  if ((lines[0] ?? '').trim() !== '---') return null;
  let inMetadata = false;
  let version: string | null = null;
  for (let i = 1; i < lines.length; i += 1) {
    const line = (lines[i] ?? '').replace(/\r$/, '');
    if (line.trim() === '---') return version;
    if (/^\S/.test(line)) {
      inMetadata = /^metadata:\s*$/.test(line);
      continue;
    }
    const match = inMetadata ? /^\s+version:\s*(.*)$/.exec(line) : null;
    if (match) version = (match[1] ?? '').trim().replace(/^["']|["']$/g, '') || null;
  }
  // Opened and never closed: nothing in it is frontmatter.
  return null;
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/;

function comparePrerelease(a: string[], b: string[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const left = a[i]!;
    const right = b[i]!;
    const leftNumeric = /^\d+$/.test(left);
    const rightNumeric = /^\d+$/.test(right);
    if (leftNumeric && rightNumeric) {
      const difference = Number(left) - Number(right);
      if (difference !== 0) return Math.sign(difference);
    } else if (leftNumeric !== rightNumeric) {
      return leftNumeric ? -1 : 1;
    } else if (left !== right) {
      return left < right ? -1 : 1;
    }
  }
  return Math.sign(a.length - b.length);
}

/** Semver order, prerelease included: -1, 0 or 1, or null when either side does not parse. */
export function compareVersions(a: string, b: string): number | null {
  const left = SEMVER.exec(a.trim());
  const right = SEMVER.exec(b.trim());
  if (!left || !right) return null;
  for (const index of [1, 2, 3]) {
    const difference = Number(left[index]) - Number(right[index]);
    if (difference !== 0) return Math.sign(difference);
  }
  const leftPre = left[4];
  const rightPre = right[4];
  // A release outranks every prerelease of the same version.
  if (leftPre === undefined || rightPre === undefined) {
    return leftPre === rightPre ? 0 : leftPre === undefined ? 1 : -1;
  }
  return comparePrerelease(leftPre.split('.'), rightPre.split('.'));
}

/** The one announcement line, the same in both registers. */
export function updateLine(language: Language, installed: string, published: string): string {
  return language === 'ru'
    ? `Вышла новая версия Maestro — ${published} (у вас ${installed}). Обновить: npx skills update`
    : `A newer Maestro is out — ${published} (you have ${installed}). Update with: npx skills update`;
}

export type UpdateState = 'newer' | 'current' | 'disabled' | 'unknown';

export interface UpdateResult {
  result: UpdateState;
  installed?: string;
  published?: string;
}

export interface UpdateOutcome extends UpdateResult {
  line?: string;
}

export interface UpdateCheckOptions {
  /** The installed skill's directory: the one preflight copied the helper from. */
  skillDir: string;
  env: NodeJS.ProcessEnv;
  url?: string;
  timeoutMs?: number;
}

/** The body up to `limit` bytes, or null when it runs past it; the reader is cancelled either way. */
async function boundedText(response: Response, limit: number): Promise<string | null> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Asks once. Never throws: every failure is `unknown`, with its reason at DEBUG. */
export async function checkForUpdate(options: UpdateCheckOptions): Promise<UpdateResult> {
  if (options.env[DISABLE_ENV] === '1') {
    log.info('check', 'update check disabled', { env: DISABLE_ENV });
    return { result: 'disabled' };
  }

  const skillFile = path.join(options.skillDir, 'SKILL.md');
  let installed: string | null = null;
  try {
    installed = metadataVersion(await readFile(skillFile, 'utf8'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.debug('installed', 'installed SKILL.md unreadable', { skillFile, reason });
  }
  log.debug('installed', 'installed version read', { skillFile, installed });
  if (installed === null || !SEMVER.test(installed.trim())) {
    log.info('check', 'update check result', { result: 'unknown', reason: 'installed version unknown' });
    return { result: 'unknown' };
  }

  const url = options.url ?? PUBLISHED_SKILL_URL;
  const timeoutMs = options.timeoutMs ?? UPDATE_TIMEOUT_MS;
  const unknown = (reason: string, data: Record<string, unknown> = {}): UpdateResult => {
    log.debug('published', 'published version not read', { url, reason, ...data });
    log.info('check', 'update check result', { result: 'unknown', installed });
    return { result: 'unknown', installed };
  };

  let text: string | null;
  try {
    log.debug('published', 'requesting published SKILL.md', { url, timeoutMs });
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    log.debug('published', 'published SKILL.md answered', { status: response.status });
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => undefined);
      return unknown('status', { status: response.status });
    }
    text = await boundedText(response, MAX_PUBLISHED_BYTES);
  } catch (error) {
    const reason = error instanceof Error ? error.name === 'TimeoutError' ? 'timeout' : error.message : String(error);
    return unknown(reason);
  }
  if (text === null) return unknown('oversized', { limit: MAX_PUBLISHED_BYTES });

  const published = metadataVersion(text);
  const order = published === null ? null : compareVersions(published, installed);
  log.debug('compare', 'versions compared', { installed, published, order });
  if (published === null || order === null) return unknown('unparsable', { published });

  const result: UpdateState = order > 0 ? 'newer' : 'current';
  log.info('check', 'update check result', { result, installed, published });
  return { result, installed, published };
}

const optionOf = (args: string[], name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

/** The прогон's language, from the state beside the helper; `ru` when it cannot be read, as `spoken()` decides. */
async function stateLanguage(runDir: string): Promise<Language> {
  try {
    return spoken(JSON.parse(extractStateLiteral(await readFile(path.join(runDir, 'state.js'), 'utf8'))));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.debug('language', 'state language unreadable, speaking ru', { runDir, reason });
    return spoken(null);
  }
}

/**
 * `--update-check --skill <installed skill directory>`. Exit 0 whatever the
 * answer; only `newer` carries a `line` for the announcement. `env` and `url`
 * are for tests: no argument of the command reaches either.
 */
export async function updateCommand(
  args: string[], runDir: string,
  { env = process.env, url }: { env?: NodeJS.ProcessEnv; url?: string } = {},
): Promise<{ result: UpdateOutcome; code: 0 }> {
  const skillDir = optionOf(args, '--skill');
  log.debug('command', 'update check requested', { skillDir });
  if (env[DISABLE_ENV] !== '1' && (skillDir === undefined || skillDir === '')) {
    log.info('check', 'update check result', { result: 'unknown', reason: 'no --skill directory' });
    return { result: { result: 'unknown' }, code: 0 };
  }
  const outcome = await checkForUpdate({ skillDir: skillDir ?? '', env, ...(url === undefined ? {} : { url }) });
  if (outcome.result !== 'newer') return { result: outcome, code: 0 };
  const line = updateLine(await stateLanguage(runDir), outcome.installed!, outcome.published!);
  return { result: { ...outcome, line }, code: 0 };
}
